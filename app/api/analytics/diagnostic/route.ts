/**
 * Analytics — Diagnostic API Route — /api/analytics/diagnostic
 *
 * GET  ?entityId=&month=   Returns DiagnosticResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '../../../../src/microservices/analytics.service';

export async function GET(req: NextRequest) {
  try {
    const p        = req.nextUrl.searchParams;
    const entityId = p.get('entityId') ?? 'default';
    const month    = p.get('month')    ?? 'Jan';

    const result = await analyticsService.getDiagnostic(entityId, month);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/analytics/diagnostic]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
