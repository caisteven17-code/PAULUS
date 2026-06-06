import { Controller, Get, Post, Delete, Body, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('announcements')
export class AnnouncementsGatewayController {
  @Get()
  async getAnnouncements(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements',
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async createAnnouncement(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete(':id')
  async deleteAnnouncement(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}`,
      method: 'DELETE',
    });
    response.status(result.status);
    return result.data;
  }
}
