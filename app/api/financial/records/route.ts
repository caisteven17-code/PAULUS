/**
 * Financial Records API Route — /api/financial/records
 *
 * GET    ?entityId=&entityType=&entityClass=   Fetch records for one entity
 * GET    ?all=true                             Fetch all records (diocese-wide)
 * POST   { record }                            Save / upsert a record
 * DELETE ?id=                                  Delete a record by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { financialService } from '../../../../src/microservices/financial.service';
import type { EntityClass } from '../../../../src/types';

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;

    if (p.get('all') === 'true') {
      const records = await financialService.getAllRecords();
      return NextResponse.json(records);
    }

    const entityId    = p.get('entityId')    ?? 'default';
    const entityType  = (p.get('entityType') ?? 'parish') as 'parish' | 'seminary' | 'school';
    const entityClass = (p.get('entityClass') ?? undefined) as EntityClass | undefined;

    const records = await financialService.getRecords(entityId, entityType, entityClass);
    return NextResponse.json(records);
  } catch (err) {
    console.error('[GET /api/financial/records]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json();
    const saved = await financialService.saveRecord(body);
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid record payload.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  await financialService.deleteRecord(id);
  return NextResponse.json({ ok: true });
}
