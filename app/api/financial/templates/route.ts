/**
 * Financial Templates API Route — /api/financial/templates
 *
 * GET  ?entityType=parish|seminary|school|diocese   Returns a CSV template string
 */

import { NextRequest, NextResponse } from 'next/server';
import { financialService } from '../../../../src/microservices/financial.service';

export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get('entityType') ?? 'parish';
  const csv = financialService.generateTemplateCSV(entityType);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="template-${entityType}.csv"`,
    },
  });
}
