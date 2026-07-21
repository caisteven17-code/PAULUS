export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const [{ data: run, error: runError }, { data: stages, error: stageError }] = await Promise.all([
      supabase
        .schema('operations')
        .from('parish_submission_test_runs')
        .select('id,status,current_stage,progress_percent,error_summary,created_at,completed_at')
        .eq('id', id)
        .single(),
      supabase
        .schema('operations')
        .from('parish_submission_test_stage_events')
        .select('stage_code,sequence_no,status,message,started_at,finished_at')
        .eq('run_id', id)
        .order('sequence_no'),
    ]);

    if (runError || !run) return NextResponse.json({ error: 'Test run not found.' }, { status: 404 });
    if (stageError) throw new Error(stageError.message);

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      currentStage: run.current_stage,
      progressPercent: run.progress_percent,
      errorSummary: run.error_summary,
      createdAt: run.created_at,
      completedAt: run.completed_at,
      stages: stages ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected test-run status error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
