import { Controller, Get, Post, Query, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { EntityClass } from '../types';

interface HealthScoreBatchEntity {
  entityId: string;
  entityType: 'parish' | 'seminary' | 'school';
  entityClass?: EntityClass;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Batch variant — dashboards score every institution at once; issuing one
  // request instead of 90+ keeps the browser connection pool free. year/
  // timeframe are one global selection shared by every entity in the
  // request, not per-entity fields.
  @Post('health-scores')
  async calculateHealthScores(
    @Body() body: { entities: HealthScoreBatchEntity[]; year?: number; timeframe?: '6m' | '12m' | 'all' },
    @Res() Res: Response,
  ) {
    const entities = Array.isArray(body?.entities) ? body.entities : [];
    if (!entities.length) {
      return Res.status(HttpStatus.BAD_REQUEST).json({ error: 'entities array is required.' });
    }
    const scores = await Promise.all(
      entities.map((e) =>
        this.analyticsService.calculateHealthScore(e.entityId, e.entityType, e.entityClass, body.year, body.timeframe),
      ),
    );
    return Res.status(HttpStatus.OK).json(scores);
  }

  @Get('health-score')
  async calculateHealthScore(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: 'parish' | 'seminary' | 'school',
    @Query('entityClass') entityClass: EntityClass,
    @Query('year') year: string,
    @Query('timeframe') timeframe: '6m' | '12m' | 'all',
    @Res() Res: Response,
  ) {
    if (!entityId || !entityType) {
      return Res.status(HttpStatus.BAD_REQUEST).json({ error: 'entityId and entityType are required.' });
    }
    const score = await this.analyticsService.calculateHealthScore(
      entityId,
      entityType,
      entityClass,
      year ? Number(year) : undefined,
      timeframe,
    );
    return Res.status(HttpStatus.OK).json(score);
  }

  @Get('diagnostic')
  async getDiagnostic(@Query('entityId') entityId: string, @Query('month') month: string, @Res() Res: Response) {
    if (!entityId || !month) {
      return Res.status(HttpStatus.BAD_REQUEST).json({ error: 'entityId and month are required.' });
    }
    const diagnostic = await this.analyticsService.getDiagnostic(entityId, month);
    return Res.status(HttpStatus.OK).json(diagnostic);
  }
}
