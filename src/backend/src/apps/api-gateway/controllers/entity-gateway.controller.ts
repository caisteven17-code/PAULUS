import { Controller, Get, Res } from '@nestjs/common';
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
