import { Controller, Post, Get, Body, Headers, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AppAuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AppAuthService) {}

  @Post('login')
  async login(@Body() body: any, @Res() res: Response) {
    const { email, password } = body;
    if (!email || !password) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Email and password are required.' });
    }

    const result = await this.authService.login(email, password);
    if (!result) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Invalid credentials.' });
    }

    return res.status(HttpStatus.OK).json(result);
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization: string, @Res() res: Response) {
    const token = authorization?.replace('Bearer ', '') ?? '';
    await this.authService.logout(token);
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
  async createUser(@Body() body: any, @Res() res: Response) {
    try {
      const user = await this.authService.createUser(body);
      return res.status(HttpStatus.CREATED).json(user);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('admin/users/update')
  async updateUser(@Body() body: any, @Res() res: Response) {
    try {
      const { id, ...updates } = body;
      const user = await this.authService.updateUser(id, updates);
      return res.status(HttpStatus.OK).json(user);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }

  @Post('admin/users/delete')
  async deleteUser(@Body() body: any, @Res() res: Response) {
    try {
      const { id, action } = body;
      const user = await this.authService.deleteUser(id, action);
      return res.status(HttpStatus.OK).json(user);
    } catch (err: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
    }
  }
}
