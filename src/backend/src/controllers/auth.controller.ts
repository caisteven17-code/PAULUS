import { Controller, Post, Get, Body, Headers, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppAuthService } from '../services/auth.service';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
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
        action: 'Login Failed',
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
      action: 'Logged In',
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
      action: 'Logged Out',
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
        category: 'access',
        severity: 'success',
        action: 'User Created',
        detail: `New account provisioned for ${user.displayName} (${user.role})`,
        entity: user.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { email: user.email, role: user.role, entityType: user.entityType },
      });
      return res.status(HttpStatus.CREATED).json(user);
    } catch (err: any) {
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
        category: 'access',
        severity: 'info',
        action: 'User Updated',
        detail: `Account updated for ${user.displayName} (${user.role})`,
        entity: user.entityName || undefined,
        ipAddress: clientIp(req),
        metadata: { userId: id, email: user.email },
      });
      return res.status(HttpStatus.OK).json(user);
    } catch (err: any) {
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
        category: 'access',
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
        category: 'access',
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
