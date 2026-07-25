import { Controller, Get, Post, Delete, Body, Query, Param, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { FinancialService } from '../services/financial.service';
import { AuditLogService } from '../services/audit-log.service';
import { FinancialRecord, EntityClass } from '../types';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

@Controller('financial')
export class FinancialController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('records')
  async getRecords(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: 'parish' | 'seminary' | 'school',
    @Query('entityClass') entityClass: EntityClass,
    @Res() res: Response,
  ) {
    if (!entityId || !entityType) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'entityId and entityType are required.' });
    }
    const records = await this.financialService.getRecords(entityId, entityType, entityClass);
    return res.status(HttpStatus.OK).json(records);
  }

  @Get('records/all')
  async getAllRecords(@Res() res: Response) {
    const records = await this.financialService.getAllRecords();
    return res.status(HttpStatus.OK).json(records);
  }

  @Post('records')
  async saveRecord(@Body() record: FinancialRecord, @Req() req: Request, @Res() res: Response) {
    const saved = await this.financialService.saveRecord(record);
    const userName = (req.headers['x-user-name'] as string) || 'Unknown';
    const userRole = (req.headers['x-user-role'] as string) || 'unknown';
    await this.auditLogService.logEvent({
      userName,
      userRole,
      category: 'finance',
      severity: 'success',
      action: 'Financial Record Saved',
      detail: `${record.entityType ?? 'Entity'} financial record for ${record.month ?? 'unknown month'} saved by ${userName}`,
      ipAddress: clientIp(req),
      metadata: { entityId: record.entityId, entityType: record.entityType, month: record.month },
    });
    return res.status(HttpStatus.OK).json(saved);
  }

  @Delete('records/:id')
  async deleteRecord(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    await this.financialService.deleteRecord(id);
    const userName = (req.headers['x-user-name'] as string) || 'Unknown';
    const userRole = (req.headers['x-user-role'] as string) || 'unknown';
    await this.auditLogService.logEvent({
      userName,
      userRole,
      category: 'finance',
      severity: 'warning',
      action: 'Financial Record Deleted',
      detail: `Financial record ${id} permanently deleted by ${userName}`,
      ipAddress: clientIp(req),
      metadata: { recordId: id },
    });
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Post('parse')
  async parseCSV(
    @Body() body: { csv: string; entityId?: string; entityType?: 'parish' | 'seminary' | 'school' },
    @Res() res: Response,
  ) {
    if (!body.csv) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'csv is required.' });
    }
    const records = this.financialService.parseCSV(body.csv, body.entityId, body.entityType);
    return res.status(HttpStatus.OK).json(records);
  }

  @Get('templates')
  async generateTemplateCSV(@Query('entityType') entityType: string, @Res() res: Response) {
    const csv = this.financialService.generateTemplateCSV(entityType ?? 'parish');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="template-${entityType ?? 'parish'}.csv"`);
    return res.status(HttpStatus.OK).send(csv);
  }
}
