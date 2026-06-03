import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('analytics')
export class AnalyticsGatewayController {
  @Get('health-score')
  async calculateHealthScore(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: string,
    @Query('entityClass') entityClass: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (entityId) search.set('entityId', entityId);
    if (entityType) search.set('entityType', entityType);
    if (entityClass) search.set('entityClass', entityClass);

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.analytics,
      path: `/analytics/health-score${suffix}`,
    });

    response.status(result.status);
    return result.data;
  }

  @Get('diagnostic')
  async getDiagnostic(
    @Query('entityId') entityId: string,
    @Query('month') month: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (entityId) search.set('entityId', entityId);
    if (month) search.set('month', month);

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.analytics,
      path: `/analytics/diagnostic${suffix}`,
    });

    response.status(result.status);
    return result.data;
  }
}
