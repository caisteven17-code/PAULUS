export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../../../../../src/lib/backend-proxy';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.storagePath) {
    return NextResponse.json({ error: 'storagePath is required.' }, { status: 400 });
  }

  const proxyRequest = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: id, storagePath: body.storagePath }),
  });

  return proxyToBackend(proxyRequest, {
    path: '/analytics/iafr/clean-submission-test',
    preserveQuery: false,
  });
}
