import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogService } from '../services/audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async getAuditLogs(
    @Query('category') category: string,
    @Query('severity') severity: string,
    @Query('limit') limit: string,
    @Res() res: Response,
  ) {
    const logs = await this.auditLogService.getAuditLogs({
      category,
      severity,
      limit: limit ? Number(limit) : undefined,
    });
    return res.status(HttpStatus.OK).json(logs);
  }
}
