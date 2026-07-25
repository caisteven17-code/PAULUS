export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { proxyToBackend } from '../../../../../src/lib/backend-proxy';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function makeServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: submissionId } = await params;

  let storagePath: string | undefined;
  try {
    const body = await req.json();
    storagePath = body?.storagePath;
  } catch {
    return NextResponse.json({ error: 'Request body must include storagePath.' }, { status: 400 });
  }

  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath is required.' }, { status: 400 });
  }

  const supabase = makeServiceClient();
  const { data: batch, error } = await supabase
    .schema('operations')
    .from('submission_batches')
    .select('id, institution_type')
    .eq('id', submissionId)
    .single();

  if (error || !batch) {
    return NextResponse.json({ error: `Submission batch ${submissionId} not found.` }, { status: 404 });
  }

  if (batch.institution_type !== 'parish') {
    return NextResponse.json(
      { error: `Automated cleaning is only available for parish submissions, got '${batch.institution_type}'.` },
      { status: 400 },
    );
  }

  const proxyRequest = new Request(`${req.url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ submissionBatchId: submissionId, storagePath }),
  });

  return proxyToBackend(proxyRequest, { path: '/analytics/iafr/clean-submission', preserveQuery: false });
}
