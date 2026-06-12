import { Controller, Get, Post, Patch, Delete, Body, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('announcements')
export class AnnouncementsGatewayController {

  private headers(req: Request): Record<string, string> {
    return {
      ...(req.headers['x-user-name'] ? { 'x-user-name': req.headers['x-user-name'] as string } : {}),
      ...(req.headers['x-user-role'] ? { 'x-user-role': req.headers['x-user-role'] as string } : {}),
    };
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  @Get()
  async getAnnouncements(@Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements',
    });
    res.status(result.status);
    return result.data;
  }

  @Get('scheduled')
  async getScheduledAnnouncements(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements/scheduled',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Get('drafts')
  async getDrafts(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements/drafts',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Get('past')
  async getPastAnnouncements(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements/past',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Get('archived')
  async getArchivedAnnouncements(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements/archived',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  @Post()
  async createAnnouncement(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: '/announcements',
      method: 'POST',
      body,
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  // ── State transitions ───────────────────────────────────────────────────────

  @Post(':id/publish')
  async publishDraft(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}/publish`,
      method: 'POST',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Post(':id/archive')
  async archiveAnnouncement(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}/archive`,
      method: 'POST',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Post(':id/restore')
  async restoreAnnouncement(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}/restore`,
      method: 'POST',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  @Post(':id/pin')
  async setPinned(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}/pin`,
      method: 'POST',
      body,
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  @Patch(':id')
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}`,
      method: 'PATCH',
      body,
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }

  // ── Hard delete ─────────────────────────────────────────────────────────────

  @Delete(':id')
  async deleteAnnouncement(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.announcement,
      path: `/announcements/${id}`,
      method: 'DELETE',
      headers: this.headers(req),
    });
    res.status(result.status);
    return result.data;
  }
}
