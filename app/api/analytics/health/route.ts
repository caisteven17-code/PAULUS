/**
 * Analytics — Health Score API Route — /api/analytics/health
 *
 * GET  ?entityId=&entityType=&entityClass=   Returns FinancialHealthScore
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '../../../../src/microservices/analytics.service';
import type { EntityClass } from '../../../../src/types';

export async function GET(req: NextRequest) {
  try {
    const p           = req.nextUrl.searchParams;
    const entityId    = p.get('entityId')    ?? 'default';
    const entityType  = (p.get('entityType') ?? 'parish') as 'parish' | 'seminary' | 'school';
    const entityClass = (p.get('entityClass') ?? undefined) as EntityClass | undefined;

    const score = await analyticsService.calculateHealthScore(entityId, entityType, entityClass);
    return NextResponse.json(score);
  } catch (err) {
    console.error('[GET /api/analytics/health]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
