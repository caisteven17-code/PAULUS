import { Controller, Get, Post, Delete, Body, Query, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { FinancialService } from '../services/financial.service';
import { FinancialRecord, EntityClass } from '../types';

@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

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
  async saveRecord(@Body() record: FinancialRecord, @Res() res: Response) {
    const saved = await this.financialService.saveRecord(record);
    return res.status(HttpStatus.OK).json(saved);
  }

  @Delete('records/:id')
  async deleteRecord(@Param('id') id: string, @Res() res: Response) {
    await this.financialService.deleteRecord(id);
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
