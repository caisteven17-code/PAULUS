import { Controller, Get, Post, Delete, Body, Query, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('financial')
export class FinancialGatewayController {
  @Get('records')
  async getRecords(
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
      baseUrl: SERVICE_URLS.financial,
      path: `/financial/records${suffix}`,
    });

    response.status(result.status);
    return result.data;
  }

  @Get('records/all')
  async getAllRecords(@Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: '/financial/records/all',
    });
    response.status(result.status);
    return result.data;
  }

  @Post('records')
  async saveRecord(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: '/financial/records',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete('records/:id')
  async deleteRecord(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: `/financial/records/${id}`,
      method: 'DELETE',
    });
    response.status(result.status);
    return result.data;
  }

  @Post('parse')
  async parseCSV(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: '/financial/parse',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('templates')
  async generateTemplateCSV(@Query('entityType') entityType: string, @Res({ passthrough: true }) response: Response) {
    const search = new URLSearchParams();
    if (entityType) search.set('entityType', entityType);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: `/financial/templates${suffix}`,
    });
    
    result.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-length') {
        response.setHeader(key, value);
      }
    });
    response.status(result.status);
    return result.data;
  }
}
