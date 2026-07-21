import { Controller, Get, Post, Patch, Delete, Query, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

@Controller('admin/entities')
export class AdminEntitiesGatewayController {
  private callerHeaders(req: Request) {
    return {
      ...(req.headers['x-user-name'] ? { 'x-user-name': req.headers['x-user-name'] as string } : {}),
      ...(req.headers['x-user-role'] ? { 'x-user-role': req.headers['x-user-role'] as string } : {}),
      ...(req.headers['x-user-id'] ? { 'x-user-id': req.headers['x-user-id'] as string } : {}),
    };
  }

  @Get('parish-renumbering/preview')
  async previewParishRenumbering(
    @Query('sourceCode') sourceCode: string,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/entities/admin/parish-renumbering/preview?sourceCode=${encodeURIComponent(sourceCode || '')}`,
      headers: this.callerHeaders(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Get('parish-renumbering/history')
  async getParishRenumberingHistory(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/parish-renumbering/history',
      headers: this.callerHeaders(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Post('parish-renumbering/execute')
  async executeParishRenumbering(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/parish-renumbering/execute',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('parish-renumbering/bulk-preview')
  async previewBulkParishReorder(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/parish-renumbering/bulk-preview',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('parish-renumbering/bulk-execute')
  async executeBulkParishReorder(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/parish-renumbering/bulk-execute',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('priest-reassignment/workspace')
  async getPriestAssignmentWorkspace(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/priest-reassignment/workspace',
      headers: this.callerHeaders(req),
    });
    response.status(result.status);
    return result.data;
  }

  @Post('priest-reassignment/preview')
  async previewPriestReassignment(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/priest-reassignment/preview',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Post('priest-reassignment/execute')
  async executePriestReassignment(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/priest-reassignment/execute',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Get('priest-reassignment/history')
  async getPriestReassignmentHistory(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin/priest-reassignment/history',
      headers: this.callerHeaders(req),
    });
    response.status(result.status);
    return result.data;
  }
  @Get()
  async getAdminEntities(
    @Query('type') type: string | undefined,
    @Query('all') all: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const search = new URLSearchParams();
    if (type) search.set('type', type);
    if (all) search.set('all', all);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: `/entities/admin${suffix}`,
    });
    response.status(result.status);
    return result.data;
  }

  @Post()
  async createAdminEntity(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'POST',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }

  @Patch()
  async updateAdminEntity(
    @Body() body: unknown,
    @Query('type') type: string | undefined,
    @Query('id') id: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bodyObject = body && typeof body === 'object' ? body : {};
    const bodyWithIdentity = {
      ...bodyObject,
      ...(type ? { type } : {}),
      ...(id ? { id } : {}),
    };
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'PATCH',
      headers: this.callerHeaders(req),
      body: bodyWithIdentity,
    });
    response.status(result.status);
    return result.data;
  }

  @Delete()
  async deleteAdminEntity(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.entity,
      path: '/entities/admin',
      method: 'DELETE',
      headers: this.callerHeaders(req),
      body,
    });
    response.status(result.status);
    return result.data;
  }
}
