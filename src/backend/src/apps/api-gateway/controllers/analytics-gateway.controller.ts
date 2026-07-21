import { Controller, Get, Post, Query, Res, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { SERVICE_URLS } from '../../../shared/http/service-urls';
import { requestDownstream } from '../../../shared/http/request-downstream';

const PYTHON_ANALYTICS_URL = (process.env.ANALYTICS_PYTHON_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function proxyToPython(
  req: Request,
  res: Response,
  pythonPath: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<unknown> {
  const incomingUrl = new URL(req.url, 'http://localhost');
  const targetUrl = `${PYTHON_ANALYTICS_URL}${pythonPath}${incomingUrl.search}`;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (req.headers.authorization) headers['authorization'] = req.headers.authorization;

  const hasBody = method === 'POST';
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    res.status(response.status);
    return data;
  } catch (error) {
    // Uvicorn can be briefly unavailable while its development reloader is
    // restarting. Keep that expected condition out of Nest's global exception
    // handler and give the frontend a useful, retryable response instead.
    res.status(503);
    return {
      error: 'Python analytics service is temporarily unavailable.',
      retryable: true,
      detail: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

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

  @Post('health-scores')
  async calculateHealthScores(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await requestDownstream<unknown>({
      baseUrl: SERVICE_URLS.analytics,
      path: '/analytics/health-scores',
      method: 'POST',
      body: req.body,
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

  // ------------------------------------------------------------------
  // Python analytics pass-through routes
  // ------------------------------------------------------------------

  @Get('descriptive/*')
  async descriptiveGet(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const subPath = req.path.replace(/^\/api\/analytics/, '/analytics');
    return proxyToPython(req, res, subPath, 'GET');
  }

  @Get('diagnostic/*')
  async diagnosticWildcardGet(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const subPath = req.path.replace(/^\/api\/analytics/, '/analytics');
    return proxyToPython(req, res, subPath, 'GET');
  }

  @Get('predictive/*')
  async predictiveGet(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const subPath = req.path.replace(/^\/api\/analytics/, '/analytics');
    return proxyToPython(req, res, subPath, 'GET');
  }

  @Get('prescriptive/*')
  async prescriptiveGet(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const subPath = req.path.replace(/^\/api\/analytics/, '/analytics');
    return proxyToPython(req, res, subPath, 'GET');
  }

  @Post('prescriptive/*')
  async prescriptivePost(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const subPath = req.path.replace(/^\/api\/analytics/, '/analytics');
    return proxyToPython(req, res, subPath, 'POST');
  }

  // ------------------------------------------------------------------
  // IAFR cleaning pass-through (Python service root, not under /analytics)
  // ------------------------------------------------------------------

  @Post('iafr/clean-submission')
  async cleanIafrSubmission(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return proxyToPython(req, res, '/iafr/clean-submission', 'POST');
  }

  @Post('iafr/clean-submission-test')
  async cleanIafrSubmissionTest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return proxyToPython(req, res, '/iafr/clean-submission-test', 'POST');
  }
}
