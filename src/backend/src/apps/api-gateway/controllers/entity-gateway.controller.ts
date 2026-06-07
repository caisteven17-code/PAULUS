import { Controller, Get, Post, Delete, Body, Query, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('entities')
export class EntityGatewayController {
  @Get('parishes')
  async getParishes(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/parishes',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('schools')
  async getSchools(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/schools',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('seminaries')
  async getSeminaries(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/seminaries',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('geo')
  async getGeoInstitutions(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/geo',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('financial-profiles')
  async getFinancialProfiles(@Query('type') type: string, @Res({ passthrough: true }) response: Response) {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/entities/financial-profiles${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('health-records')
  async getPriestHealthRecords(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/health-records',
    });
    response.status(result.status);
    return result.data;
  }

  @Post('health-records')
  async savePriestHealthRecord(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/health-records',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete('health-records/:id')
  async deletePriestHealthRecord(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/entities/health-records/${id}`,
      method: 'DELETE',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('all')
  async getAll(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/all',
    });
    response.status(result.status);
    return result.data;
  }
}
