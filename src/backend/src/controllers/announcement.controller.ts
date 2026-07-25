import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AnnouncementService } from '../services/announcement.service';

const MANAGE_ROLES = new Set([
  'bishop',
  'chancellor',
  'diocesan_oeconomus',
]);

function getCallerInfo(req: Request): { name: string; role: string } {
  return {
    name: (req.headers['x-user-name'] as string) || 'Unknown User',
    role: (req.headers['x-user-role'] as string) || 'unknown',
  };
}

function canManage(role: string): boolean {
  return MANAGE_ROLES.has(role);
}

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  // ── Public reads ────────────────────────────────────────────────────────────

  @Get()
  async getAnnouncements(@Query('feed') rawFeed: string, @Req() req: Request, @Res() res: Response) {
    const profileId = await this.announcementService.resolveProfileId(
      req.headers.authorization,
      getCallerInfo(req).name,
      req.headers['x-user-id'] as string | undefined,
    );
    const requestedFeed = rawFeed === 'general' || rawFeed === 'for-me' || rawFeed === 'specific' ? rawFeed : 'all';
    const feed = requestedFeed === 'specific' && !canManage(getCallerInfo(req).role) ? 'for-me' : requestedFeed;
    const data = await this.announcementService.getAnnouncements(profileId, feed);
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('audience-options')
  async getAudienceOptions(@Req() req: Request, @Res() res: Response) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });
    return res.status(HttpStatus.OK).json(await this.announcementService.getAudienceOptions());
  }

  @Get('scheduled')
  async getScheduledAnnouncements(@Req() req: Request, @Res() res: Response) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });
    const data = await this.announcementService.getScheduledAnnouncements();
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('drafts')
  async getDrafts(@Req() req: Request, @Res() res: Response) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });
    const data = await this.announcementService.getDrafts();
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('past')
  async getPastAnnouncements(@Req() req: Request, @Res() res: Response) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });
    const data = await this.announcementService.getPastAnnouncements();
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('archived')
  async getArchivedAnnouncements(@Req() req: Request, @Res() res: Response) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });
    const data = await this.announcementService.getArchivedAnnouncements();
    return res.status(HttpStatus.OK).json(data);
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  @Post()
  async createAnnouncement(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    try {
      const created = await this.announcementService.createAnnouncement({
        title: body.title,
        content: body.content,
        author: body.author || name,
        authorRole: body.authorRole || role,
        priority: body.priority ?? 'medium',
        category: body.category ?? 'general',
        status: body.status === 'draft' ? 'draft' : 'active',
        startDate: body.startDate,
        endDate: body.endDate,
        audienceType: body.audienceType === 'specific' ? 'specific' : 'general',
        recipientIds: Array.isArray(body.recipientIds) ? body.recipientIds : [],
      });
      if (!created) throw new Error('The announcement was not created.');
      return res.status(HttpStatus.CREATED).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: `Could not save targeted announcement: ${message}` });
    }
  }

  // ── State transitions ───────────────────────────────────────────────────────

  @Post(':id/publish')
  async publishDraft(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.publishDraft(id, name, role);
    if (!result) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not publish. Already published or not found.' });
    return res.status(HttpStatus.OK).json(result);
  }

  @Post(':id/archive')
  async archiveAnnouncement(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.archiveAnnouncement(id, name, role);
    if (!result.ok) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not archive.' });
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Post(':id/restore')
  async restoreAnnouncement(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.restoreAnnouncement(id, name, role);
    if (!result.ok) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not restore.' });
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Post(':id/pin')
  async setPinned(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.setPinned(id, body?.pinned === true, name, role);
    if (!result) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not update pin. Only active announcements can be pinned.' });
    return res.status(HttpStatus.OK).json(result);
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  @Patch(':id')
  async updateAnnouncement(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.updateAnnouncement(id, body, name, role);
    if (!result) return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Update failed.' });
    return res.status(HttpStatus.OK).json(result);
  }

  // ── Hard delete (grace period for published; anytime for drafts) ────────────

  @Delete(':id')
  async deleteAnnouncement(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.announcementService.hardDeleteAnnouncement(id, name, role);
    if (!result.ok) return res.status(HttpStatus.FORBIDDEN).json({ error: result.reason });
    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
