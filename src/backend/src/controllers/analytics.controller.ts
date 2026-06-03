import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { EntityClass } from '../types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('health-score')
  async calculateHealthScore(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: 'parish' | 'seminary' | 'school',
    @Query('entityClass') entityClass: EntityClass,
    @Res() Res: Response,
  ) {
    if (!entityId || !entityType) {
      return Res.status(HttpStatus.BAD_REQUEST).json({ error: 'entityId and entityType are required.' });
    }
    const score = await this.analyticsService.calculateHealthScore(entityId, entityType, entityClass);
    return Res.status(HttpStatus.OK).json(score);
  }

  @Get('diagnostic')
  async getDiagnostic(
    @Query('entityId') entityId: string,
    @Query('month') month: string,
    @Res() Res: Response,
  ) {
    if (!entityId || !month) {
      return Res.status(HttpStatus.BAD_REQUEST).json({ error: 'entityId and month are required.' });
    }
    const diagnostic = await this.analyticsService.getDiagnostic(entityId, month);
    return Res.status(HttpStatus.OK).json(diagnostic);
  }
}
