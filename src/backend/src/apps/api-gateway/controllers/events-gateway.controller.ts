import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('events')
export class EventsGatewayController {
  @Get()
  async getEvents(@Query('institutionId') institutionId: string | undefined, @Res({ passthrough: true }) response: Response) {
    const suffix = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async saveEvent(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/events',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
