import { Controller, Get, Post, Patch, Body, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { LiturgicalCalendarService } from '../services/liturgical-calendar.service';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

@Controller('liturgical-calendar')
export class LiturgicalCalendarController {
  constructor(
    private readonly liturgicalCalendarService: LiturgicalCalendarService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  async getRecords(
    @Query('status') status: string | undefined,
    @Query('season') season: string | undefined,
    @Query('month') month: string | undefined,
    @Query('year') year: string | undefined,
    @Query('celebration') celebration: string | undefined,
    @Query('reason') reason: string | undefined,
    @Query('validation') validation: 'all' | 'matched' | 'mismatched' | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.liturgicalCalendarService.getRecords({
      status,
      season,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      celebration,
      reason,
      validation,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('approve-all')
  async approveAll(
    @Body()
    body: {
      filters?: {
        season?: string;
        month?: number;
        year?: number;
        celebration?: string;
        reason?: string;
        validation?: 'all' | 'matched' | 'mismatched';
      };
      reviewedBy?: string;
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const reviewedBy = body.reviewedBy || (req.headers['x-user-name'] as string) || 'unknown';
    const result = await this.liturgicalCalendarService.approveAll(body.filters ?? {}, reviewedBy);

    await this.auditLogService.logEvent({
      userName: reviewedBy,
      userRole: (req.headers['x-user-role'] as string) || 'unknown',
      category: 'calendar',
      severity: 'success',
      action: 'Calendar Bulk Approved',
      detail: `${result?.approved ?? 'Multiple'} liturgical calendar entries approved by ${reviewedBy}`,
      ipAddress: clientIp(req),
      metadata: { filters: body.filters, count: result?.approved },
    });

    return res.status(HttpStatus.OK).json(result);
  }

  @Patch(':id')
  async reviewRecord(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'approve' | 'approve_with_revisions' | 'reject';
      reviewedBy?: string;
      date?: string;
      celebration_name?: string;
      name_source?: string;
      reason?: string;
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const reviewedBy = body.reviewedBy || (req.headers['x-user-name'] as string) || 'unknown';
    const userRole = (req.headers['x-user-role'] as string) || 'unknown';

    if (body.action === 'approve') {
      const record = await this.liturgicalCalendarService.approveRecord(id, reviewedBy);
      if (!record) return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to approve record.' });

      await this.auditLogService.logEvent({
        userName: reviewedBy,
        userRole,
        category: 'calendar',
        severity: 'success',
        action: 'Calendar Entry Approved',
        detail: `"${record.celebration_name}" on ${record.date} approved by ${reviewedBy}`,
        ipAddress: clientIp(req),
        metadata: { recordId: id, celebration_name: record.celebration_name, date: record.date },
      });

      return res.status(HttpStatus.OK).json(record);
    }

    if (body.action === 'approve_with_revisions') {
      if (!body.date && !body.celebration_name) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'A revised date or celebration name is required.' });
      }
      const result = await this.liturgicalCalendarService.approveWithRevisions(
        id,
        { date: body.date, celebration_name: body.celebration_name, name_source: body.name_source },
        reviewedBy,
      );
      if (!result.record) {
        return res.status(HttpStatus.CONFLICT).json({ error: result.errorMessage || 'Failed to revise record.' });
      }

      await this.auditLogService.logEvent({
        userName: reviewedBy,
        userRole,
        category: 'calendar',
        severity: 'success',
        action: 'Calendar Entry Approved with Revisions',
        detail: `"${result.record.celebration_name}" on ${result.record.date} approved with revisions by ${reviewedBy}`,
        ipAddress: clientIp(req),
        metadata: { recordId: id, revisions: { date: body.date, celebration_name: body.celebration_name } },
      });

      return res.status(HttpStatus.OK).json(result.record);
    }

    if (body.action === 'reject') {
      if (!body.reason) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'A rejection reason is required.' });
      }
      const record = await this.liturgicalCalendarService.rejectRecord(id, body.reason, reviewedBy);
      if (!record) return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to reject record.' });

      await this.auditLogService.logEvent({
        userName: reviewedBy,
        userRole,
        category: 'calendar',
        severity: 'warning',
        action: 'Calendar Entry Rejected',
        detail: `"${record.celebration_name}" on ${record.date} rejected by ${reviewedBy} — ${body.reason}`,
        ipAddress: clientIp(req),
        metadata: { recordId: id, reason: body.reason, celebration_name: record.celebration_name, date: record.date },
      });

      return res.status(HttpStatus.OK).json(record);
    }

    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Unknown review action.' });
  }
}
