import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('budgets')
export class BudgetsGatewayController {
  @Get()
  async getBudgets(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const queryIndex = req.url.indexOf('?');
    const suffix = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: `/budgets${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async saveBudgets(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.financial,
      path: '/budgets',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
