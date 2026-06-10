import { Controller, Get, Post, Patch, Body, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('liturgical-calendar')
export class LiturgicalCalendarGatewayController {
  @Get()
  async getRecords(@Query() query: Record<string, string>, @Res({ passthrough: true }) response: Response) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') search.set(key, value);
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/liturgical-calendar${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('approve-all')
  async approveAll(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/liturgical-calendar/approve-all',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Patch(':id')
  async reviewRecord(@Param('id') id: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/liturgical-calendar/${id}`,
      method: 'PATCH',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
