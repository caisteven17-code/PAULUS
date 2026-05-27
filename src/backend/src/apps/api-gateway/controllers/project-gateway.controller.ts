import { Controller, Get, Post, Delete, Body, Query, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('projects')
export class ProjectGatewayController {
  @Get()
  async getProjects(
    @Query('entityId') entityId: string,
    @Query('entityType') entityType: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (entityId) search.set('entityId', entityId);
    if (entityType) search.set('entityType', entityType);

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: `/projects${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async saveProject(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: '/projects',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete(':id')
  async deleteProject(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: `/projects/${id}`,
      method: 'DELETE',
    });
    response.status(result.status);
    return result.data;
  }

  @Get('donations')
  async getDonations(@Query('projectId') projectId: string, @Res({ passthrough: true }) response: Response) {
    const search = new URLSearchParams();
    if (projectId) search.set('projectId', projectId);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: `/projects/donations${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('donations')
  async saveDonation(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: '/projects/donations',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('expenses')
  async getExpenses(@Query('projectId') projectId: string, @Res({ passthrough: true }) response: Response) {
    const search = new URLSearchParams();
    if (projectId) search.set('projectId', projectId);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: `/projects/expenses${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('expenses')
  async saveExpense(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.project,
      path: '/projects/expenses',
      method: 'POST',
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
