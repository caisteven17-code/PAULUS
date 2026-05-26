/**
 * Financial CSV Parse API Route — /api/financial/parse
 *
 * POST  { csv: string; entityId?: string; entityType?: string }
 *       Parses raw CSV text and returns FinancialRecord[]
 */

import { NextRequest, NextResponse } from 'next/server';
import { financialService } from '../../../../src/microservices/financial.service';

export async function POST(req: NextRequest) {
  try {
    const { csv, entityId, entityType } = await req.json();
    if (!csv) return NextResponse.json({ error: 'csv field is required.' }, { status: 400 });
    const records = financialService.parseCSV(csv, entityId, entityType);
    return NextResponse.json(records);
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}
