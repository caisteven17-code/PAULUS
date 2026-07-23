export const dynamic = 'force-dynamic';

import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'financial-submissions';

function makeServiceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase service credentials are not configured.');
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function resolveInstitutionId(supabase: ReturnType<typeof makeServiceClient>, institutionName: string) {
  const { data, error } = await supabase
    .schema('diocese')
    .from('institutions')
    .select('id')
    .eq('name', institutionName)
    .eq('institution_type', 'parish')
    .is('deleted_at', null)
    .single();

  if (error || !data) throw new Error(`No active parish matched "${institutionName}".`);
  return data.id as string;
}

async function addStage(
  supabase: ReturnType<typeof makeServiceClient>,
  runId: string,
  stageCode: string,
  sequenceNo: number,
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed',
  message: string,
) {
  const isFinished = status === 'completed' || status === 'warning' || status === 'failed';
  const { error } = await supabase.schema('operations').from('parish_submission_test_stage_events').upsert(
    {
      run_id: runId,
      stage_code: stageCode,
      sequence_no: sequenceNo,
      status,
      message,
      started_at: status === 'pending' ? null : new Date().toISOString(),
      finished_at: isFinished ? new Date().toISOString() : null,
    },
    { onConflict: 'run_id,stage_code' },
  );
  if (error) throw new Error(error.message);
}

export async function POST(req: NextRequest) {
  let phase = 'starting OCR preview';
  try {
    phase = 'reading upload form data';
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const institutionName = String(formData.get('institutionName') ?? '').trim();
    const reportingMonth = Number(formData.get('reportingMonth'));
    const reportingYear = Number(formData.get('reportingYear'));
    const meanConfidence = Number(formData.get('meanConfidence') ?? 0);
    const mappedFieldCount = Number(formData.get('mappedFieldCount') ?? 0);
    const lowConfidenceCount = Number(formData.get('lowConfidenceCount') ?? 0);
    const missingFieldCount = Number(formData.get('missingFieldCount') ?? 0);

    if (!file || !institutionName || !Number.isInteger(reportingMonth) || !Number.isInteger(reportingYear)) {
      return NextResponse.json({ error: 'PDF file, parish, month, and year are required.' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || extension === 'pdf';
    if (!isPdf) {
      return NextResponse.json({ error: 'Only scanned PDF files are accepted for OCR preview.' }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'The selected PDF is too large. Please keep OCR uploads below 20 MB.' }, { status: 400 });
    }

    phase = 'initializing Supabase service client';
    const supabase = makeServiceClient();
    phase = 'resolving parish institution';
    const institutionId = await resolveInstitutionId(supabase, institutionName);
    phase = 'hashing uploaded PDF';
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash('sha256').update(bytes).digest('hex');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `test/parish/${institutionId}/${reportingYear}/${reportingMonth}/ocr-${randomUUID()}-${safeName}`;

    phase = 'uploading PDF preview to storage';
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type || 'application/pdf',
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    phase = 'creating OCR preview test run';
    const { data: run, error: runError } = await supabase
      .schema('operations')
      .from('parish_submission_test_runs')
      .insert({
        institution_id: institutionId,
        reporting_month: reportingMonth,
        reporting_year: reportingYear,
        form_version: 'iafr_2026_v1',
        input_method: 'ocr_pdf',
        source_file_name: file.name,
        source_file_path: storagePath,
        source_file_hash: fileHash,
        status: 'warning',
        current_stage: 'ocr_review',
        progress_percent: 60,
        started_at: new Date().toISOString(),
        error_summary:
          lowConfidenceCount > 0 || missingFieldCount > 0
            ? 'OCR draft created. Human review is required before sandbox commit.'
            : 'OCR draft created and ready for human review.',
      })
      .select('id')
      .single();
    if (runError || !run) throw new Error(runError?.message ?? 'Could not create the OCR test run.');

    phase = 'recording OCR preview stage events';
    await addStage(supabase, run.id, 'uploading', 1, 'completed', 'Scanned PDF saved under the isolated test storage path.');
    await addStage(
      supabase,
      run.id,
      'ocr_review',
      2,
      lowConfidenceCount > 0 || missingFieldCount > 0 ? 'warning' : 'completed',
      `OCR mapped ${mappedFieldCount} field(s); ${lowConfidenceCount + missingFieldCount} field(s) need review.`,
    );

    return NextResponse.json({
      runId: run.id,
      status: 'warning',
      progressPercent: 60,
      storagePath,
      confidenceSummary: {
        average: Number.isFinite(meanConfidence) ? meanConfidence : 0,
        mappedFieldCount,
        lowConfidenceCount,
        unmatchedFieldCount: missingFieldCount,
      },
      message: 'OCR preview saved. Review the mapped manual fields before submitting.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected OCR preview error.';
    const detail = `OCR preview failed while ${phase}: ${message}`;
    console.error('[submission-ocr-preview]', detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
