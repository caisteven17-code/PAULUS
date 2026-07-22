import { Controller, Post, Get, Body, Headers, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppAuthService, ParishPriestAssignmentConflictError } from '../services/auth.service';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AppAuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('login')
  async login(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { email, password } = body;
    if (!email || !password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Email and password are required.' });
    }

    const result = await this.authService.login(email, password);

    if (!result) {
      await this.auditLogService.logEvent({
        userName: 'Unknown',
        userRole: 'Unknown',
        category: 'auth',
        severity: 'warning',
        action: 'Login failed',
        detail: `Failed sign-in attempt for ${email}`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Invalid credentials.' });
    }

    await this.auditLogService.logEvent({
      userId: result.user.id,
      userName: result.user.displayName || email,
      userRole: result.user.roleId ?? result.user.role ?? 'unknown',
      category: 'auth',
      severity: 'success',
      action: 'Login success',
      detail: `${result.user.displayName || email} signed in to the diocesan financial portal`,
      ipAddress: clientIp(req),
    });

    return res.status(HttpStatus.OK).json(result);
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization: string, @Req() req: Request, @Res() res: Response) {
    const token = authorization?.replace('Bearer ', '') ?? '';
    const user = token ? await this.authService.getSession(token) : null;

    await this.authService.logout(token);

    await this.auditLogService.logEvent({
      userId: user?.id,
      userName: user?.displayName || 'Unknown',
      userRole: user?.roleId ?? user?.role ?? 'Unknown',
      category: 'auth',
      severity: 'info',
      action: 'Logout',
      detail: `${user?.displayName || 'User'} signed out of the diocesan financial portal`,
      ipAddress: clientIp(req),
    });

    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Get('me')
  async me(@Headers('authorization') authorization: string, @Res() res: Response) {
    const token = authorization?.replace('Bearer ', '') ?? '';
    if (!token) return res.status(HttpStatus.OK).json({ user: null });

    const user = await this.authService.getSession(token);
    return res.status(HttpStatus.OK).json({ user: user ?? null });
  }

  // ── OTP / Onboarding / Password reset ──────────────────────────────────────

  private otpErrorResponse(res: Response, err: any) {
    const message: string = err?.message ?? 'Unknown error';
    switch (message) {
      case 'NOT_REGISTERED':
        return res.status(HttpStatus.NOT_FOUND).json({
          error: 'This email is not registered. Accounts are registered after completing the onboarding form.',
        });
      case 'ACCOUNT_ARCHIVED':
        return res.status(HttpStatus.FORBIDDEN).json({ error: 'This account has been archived. Contact the administrator.' });
      case 'RATE_LIMITED':
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({ error: 'Please wait 60 seconds before requesting another code.' });
      case 'INVALID_CODE':
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid verification code. Please check the code and try again.' });
      case 'EXPIRED_CODE':
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'This code has expired. Please request a new one.' });
      case 'OTP_NOT_VERIFIED':
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Email verification is required before saving. Please verify the OTP code first.' });
      case 'USER_NOT_FOUND':
        return res.status(HttpStatus.NOT_FOUND).json({ error: 'User account not found.' });
      case 'SMTP_SEND_FAILED':
        return res.status(HttpStatus.BAD_GATEWAY).json({
          error:
            'Could not send the email — the mail server connection failed. Please contact the administrator (SMTP settings need attention).',
        });
      default:
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: message });
    }
  }

  @Post('send-otp')
  async sendOtp(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { email, purpose } = body ?? {};
    if (!email || !purpose || !['onboarding', 'forgot_password'].includes(purpose)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email and a valid purpose are required.' });
    }

    try {
      const result = await this.authService.sendOtp(email, purpose);
      await this.auditLogService.logEvent({
        userName: email,
        userRole: 'unknown',
        category: 'auth',
        severity: 'info',
        action: purpose === 'onboarding' ? 'OTP sent (onboarding)' : 'OTP sent (password reset)',
        detail: `Verification code sent to ${email} (${purpose === 'onboarding' ? 'onboarding' : 'password reset'})`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      return this.otpErrorResponse(res, err);
    }
  }

  @Post('security-alert')
  async securityAlert(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { email } = body ?? {};
    if (!email) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email is required.' });
    }
    try {
      const result = await this.authService.sendSecurityAlert(email, clientIp(req));
      await this.auditLogService.logEvent({
        userName: email,
        userRole: 'unknown',
        category: 'auth',
        severity: 'warning',
        action: 'Account locked',
        detail: `3 consecutive failed login attempts detected for ${email}`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      return this.otpErrorResponse(res, err);
    }
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { email, code, purpose } = body ?? {};
    if (!email || !code || !purpose) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email, code, and purpose are required.' });
    }

    try {
      const result = await this.authService.verifyOtp(email, code, purpose);
      await this.auditLogService.logEvent({
        userName: email,
        userRole: 'unknown',
        category: 'auth',
        severity: 'success',
        action: 'OTP verified',
        detail: `Verification code accepted for ${email} (${purpose})`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      await this.auditLogService.logEvent({
        userName: email,
        userRole: 'unknown',
        category: 'auth',
        severity: 'warning',
        action: 'OTP failed / expired',
        detail: `Verification code rejected for ${email} (${purpose})`,
        ipAddress: clientIp(req),
      });
      return this.otpErrorResponse(res, err);
    }
  }

  @Post('complete-onboarding')
  async completeOnboarding(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { userId, email, password, contactNumber, birthday, otpCode } = body ?? {};
    if (!userId || !email || !password || !contactNumber || !birthday || !otpCode) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'userId, email, password, contactNumber, birthday, and otpCode are required.' });
    }
    if (String(password).length < 8) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
      const user = await this.authService.completeOnboarding({
        userId,
        email,
        password,
        contactNumber,
        birthday,
        otpCode,
      });
      await this.auditLogService.logEvent({
        userId,
        userName: user.displayName || email,
        userRole: user.roleId ?? user.role ?? 'unknown',
        category: 'auth',
        severity: 'success',
        action: 'Onboarding Completed',
        detail: `${user.displayName || email} verified their email and completed the onboarding form`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.OK).json({ ok: true, user });
    } catch (err: any) {
      return this.otpErrorResponse(res, err);
    }
  }

  @Post('reset-password')
  async resetPassword(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { email, otpCode, newPassword } = body ?? {};
    if (!email || !otpCode || !newPassword) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'email, otpCode, and newPassword are required.' });
    }
    if (!passwordMeetsPolicy(String(newPassword))) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special characters.',
      });
    }

    try {
      const result = await this.authService.resetPassword({ email, otpCode, newPassword });
      await this.auditLogService.logEvent({
        userName: email,
        userRole: 'unknown',
        category: 'auth',
        severity: 'success',
        action: 'Password reset completed',
        detail: `Password was reset via Forgot Password for ${email}`,
        ipAddress: clientIp(req),
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      return this.otpErrorResponse(res, err);
    }
  }

  @Get('admin/users')
  async listUsers(@Res() res: Response) {
    try {
      const users = await this.authService.listUsers();
      return res.status(HttpStatus.OK).json(users);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: err.message });
    }
  }

  @Post('admin/users')
  async createUser(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const user = await this.authService.createUser(body);
      await this.auditLogService.logEvent({
        userId: user.id,
        userName: 'Admin',
        userRole: 'admin',
        category: 'users',
        severity: 'success',
        action: 'User Created',
        detail: `New account provisioned for ${user.displayName} (${user.role})`,
        entity: user.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { email: user.email, role: user.role, entityType: user.entityType },
      });
      return res.status(HttpStatus.CREATED).json(user);
    } catch (err: any) {
      if (err instanceof ParishPriestAssignmentConflictError) {
        return res.status(HttpStatus.CONFLICT).json({
          error: err.message,
          code: err.code,
          parishName: err.parishName,
          existingPriest: err.existingPriest,
        });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('admin/users/update')
  async updateUser(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { id, ...updates } = body;
      const user = await this.authService.updateUser(id, updates);
      await this.auditLogService.logEvent({
        userName: 'Admin',
        userRole: 'admin',
        category: 'users',
        severity: 'info',
        action: 'User Updated',
        detail: `Account updated for ${user.displayName} (${user.role})`,
        entity: user.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { userId: id, email: user.email },
      });
      return res.status(HttpStatus.OK).json(user);
    } catch (err: any) {
      if (err instanceof ParishPriestAssignmentConflictError) {
        return res.status(HttpStatus.CONFLICT).json({
          error: err.message,
          code: err.code,
          parishName: err.parishName,
          existingPriest: err.existingPriest,
        });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('admin/users/delete')
  async deleteUser(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { id, action } = body;
      const user = await this.authService.deleteUser(id, action);
      await this.auditLogService.logEvent({
        userName: 'Admin',
        userRole: 'admin',
        category: 'users',
        severity: action === 'archive' ? 'warning' : 'info',
        action: action === 'archive' ? 'User Archived' : 'User Restored',
        detail: `Account ${action === 'archive' ? 'archived' : 'restored'}: ${user.displayName} (${user.email})`,
        entity: user.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { userId: id, action },
      });
      return res.status(HttpStatus.OK).json(user);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Get('admin/roles')
  async listRoles(@Res() res: Response) {
    try {
      const roles = await this.authService.listRoles();
      return res.status(HttpStatus.OK).json(roles);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: err.message });
    }
  }

  @Post('admin/roles')
  async saveRoles(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const { roles } = body;
      if (!Array.isArray(roles)) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'roles array is required.' });
      }
      const result = await this.authService.saveRoles(roles);
      await this.auditLogService.logEvent({
        userName: 'Admin',
        userRole: 'admin',
        category: 'users',
        severity: 'info',
        action: 'Roles Updated',
        detail: `Role permissions updated for ${roles.length} role(s)`,
        ipAddress: clientIp(req),
        metadata: { roleIds: roles.map((r: any) => r.id) },
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }
}
