import { Controller, Get, Post, Patch, Body, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { EventService } from '../services/event.service';

// Mirrors the roles whose INITIAL_ROLES entry has manage_events: true
const MANAGE_EVENT_ROLES = new Set([
  'bishop',
  'chancellor',
  'diocesan_oeconomus',
  'parish_priest',
  'parish_secretary',
  'seminary_rector',
  'seminary_oeconomus',
  'finance_officer',
]);

function getCallerInfo(req: Request): { name: string; role: string } {
  return {
    name: (req.headers['x-user-name'] as string) || 'Unknown User',
    role: (req.headers['x-user-role'] as string) || 'unknown',
  };
}

function canManage(role: string): boolean {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  return MANAGE_EVENT_ROLES.has(normalized);
}

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  async getEvents(
    @Query('institutionId') institutionId: string | undefined,
    @Query('institutionName') institutionName: string | undefined,
    @Query('institutionType') institutionType: string | undefined,
    @Res() res: Response,
  ) {
    const events = await this.eventService.getEvents({ institutionId, institutionName, institutionType });
    return res.status(HttpStatus.OK).json(events);
  }

  @Get('archived')
  async getArchivedEvents(
    @Query('institutionId') institutionId: string | undefined,
    @Query('institutionName') institutionName: string | undefined,
    @Query('institutionType') institutionType: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const events = await this.eventService.getArchivedEvents({ institutionId, institutionName, institutionType });
    return res.status(HttpStatus.OK).json(events);
  }

  @Post()
  async saveEvent(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const saved = await this.eventService.saveEvent(body, name, role);
    if (!saved) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to save event. Check the institution details.' });
    }
    return res.status(HttpStatus.CREATED).json(saved);
  }

  @Patch(':id')
  async updateEvent(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const updated = await this.eventService.updateEvent(id, body, name, role);
    if (!updated) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to update event.' });
    }
    return res.status(HttpStatus.OK).json(updated);
  }

  @Post(':id/archive')
  async archiveEvent(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.eventService.archiveEvent(id, name, role);
    if (!result.ok) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not archive event.' });
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Post(':id/restore')
  async restoreEvent(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { name, role } = getCallerInfo(req);
    if (!canManage(role)) return res.status(HttpStatus.FORBIDDEN).json({ error: 'Forbidden' });

    const result = await this.eventService.restoreEvent(id, name, role);
    if (!result.ok) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Could not restore event.' });
    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
