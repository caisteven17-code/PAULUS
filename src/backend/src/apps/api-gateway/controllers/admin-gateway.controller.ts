import { Controller, Get, Post, Patch, Delete, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('admin/users')
export class AdminGatewayController {
  @Get()
  async listUsers(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/users',
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async createUser(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/users',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Patch()
  async updateUser(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/users/update',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete()
  async deleteUser(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/users/delete',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
