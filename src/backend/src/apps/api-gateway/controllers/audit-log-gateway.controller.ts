import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('audit-log')
export class AuditLogGatewayController {
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
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (category) search.set('category', category);
    if (severity) search.set('severity', severity);
    if (limit) search.set('limit', limit);
    if (institutionType) search.set('institutionType', institutionType);
    if (institutionId) search.set('institutionId', institutionId);
    if (institutionName) search.set('institutionName', institutionName);
    if (dateFrom) search.set('dateFrom', dateFrom);
    if (dateTo) search.set('dateTo', dateTo);

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auditLog,
      path: `/audit-log${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('event')
  async logAuditEvent(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auditLog,
      path: '/audit-log/event',
      method: 'POST',
      body,
    });

    response.status(result.status);
    return result.data;
  }
}
