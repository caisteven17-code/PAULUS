import { Controller, Get, Query, Res } from '@nestjs/common';
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
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (category) search.set('category', category);
    if (severity) search.set('severity', severity);
    if (limit) search.set('limit', limit);

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.auditLog,
      path: `/audit-log${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }
}
