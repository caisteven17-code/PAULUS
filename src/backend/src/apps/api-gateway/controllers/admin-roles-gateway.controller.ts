import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('admin/roles')
export class AdminRolesGatewayController {
  @Get()
  async listRoles(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/roles',
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async saveRoles(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auth,
      path: '/auth/admin/roles',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
