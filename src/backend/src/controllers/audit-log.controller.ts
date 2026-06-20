import { Controller, Get, Post, Body, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log.service';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async getAuditLogs(
    @Query('category') category: string,
    @Query('severity') severity: string,
    @Query('limit') limit: string,
    @Query('institutionType') institutionType: string,
    @Query('institutionId') institutionId: string,
    @Query('institutionName') institutionName: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response,
  ) {
    const logs = await this.auditLogService.getAuditLogs({
      category,
      severity,
      limit: limit ? Number(limit) : undefined,
      institutionType,
      institutionId,
      institutionName,
      dateFrom,
      dateTo,
    });
    return res.status(HttpStatus.OK).json(logs);
  }

  @Post('event')
  async logAuditEvent(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const { category, severity, action, detail } = body ?? {};
    if (!category || !severity || !action || !detail) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'category, severity, action, and detail are required.' });
    }

    await this.auditLogService.logEvent({
      userId: body.userId,
      userName: body.userName || 'Unknown',
      userRole: body.userRole || 'Unknown',
      isSystem: body.isSystem ?? false,
      category,
      severity,
      action,
      detail,
      entity: body.entity,
      ipAddress: clientIp(req),
      metadata: body.metadata,
    });

    return res.status(HttpStatus.CREATED).json({ ok: true });
  }
}
