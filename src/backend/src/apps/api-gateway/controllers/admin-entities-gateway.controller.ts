import { Controller, Get, Post, Patch, Delete, Query, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('admin/entities')
export class AdminEntitiesGatewayController {
  @Get()
  async getAdminEntities(
    @Query('type') type: string | undefined,
    @Query('all') all: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (type) search.set('type', type);
    if (all) search.set('all', all);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/entities/admin${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async createAdminEntity(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Patch()
  async updateAdminEntity(
    @Body() body: unknown,
    @Query('type') type: string | undefined,
    @Query('id') id: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bodyObject = body && typeof body === 'object' ? body : {};
    const bodyWithIdentity = {
      ...bodyObject,
      ...(type ? { type } : {}),
      ...(id ? { id } : {}),
    };
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'PATCH',
      body: bodyWithIdentity,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete()
  async deleteAdminEntity(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'DELETE',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
