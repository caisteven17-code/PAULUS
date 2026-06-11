import { Controller, Get, Post, Patch, Body, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('events')
export class EventsGatewayController {

  private headers(req: Request): Record<string, string> {
    return {
      ...(req.headers['x-user-name'] ? { 'x-user-name': req.headers['x-user-name'] as string } : {}),
      ...(req.headers['x-user-role'] ? { 'x-user-role': req.headers['x-user-role'] as string } : {}),
    };
  }

  private querySuffix(req: Request): string {
    const queryIndex = req.url.indexOf('?');
    return queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  }

  @Get()
  async getEvents(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events${this.querySuffix(req)}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('archived')
  async getArchivedEvents(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events/archived${this.querySuffix(req)}`,
      headers: this.headers(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async saveEvent(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/events',
      method: 'POST',
      body,
      headers: this.headers(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Patch(':id')
  async updateEvent(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events/${id}`,
      method: 'PATCH',
      body,
      headers: this.headers(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Post(':id/archive')
  async archiveEvent(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events/${id}/archive`,
      method: 'POST',
      headers: this.headers(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Post(':id/restore')
  async restoreEvent(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/events/${id}/restore`,
      method: 'POST',
      headers: this.headers(req),
    });
    response.status(result.status);
    return result.data;
  }
}
