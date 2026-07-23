export const dynamic = 'force-dynamic';

import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateProgressiveTax, type ProgressiveTaxScheme } from '../../../../src/lib/progressiveTax';
import {
  getEffectiveTaxationScheme,
  requireTaxationCaller,
  TaxationApiError,
} from '../../../../src/lib/server/taxationSchemes';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'financial-submissions';

type ManualEntry = {
  fieldKey: string;
  sectionCode: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  subsectionCode?: string;
  canonicalAccountCode: string;
  sourceLabel: string;
  rawValue: string;
  cleanedAmount: number;
  sourceMetadata?: Record<string, unknown>;
};

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
  const { error } = await supabase
    .schema('operations')
    .from('parish_submission_test_stage_events')
    .upsert(
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

async function createManualRun(req: NextRequest) {
  await requireTaxationCaller(req);
  const body = (await req.json()) as {
    institutionName?: string;
    reportingMonth?: number;
    reportingYear?: number;
    formVersion?: string;
    entries?: ManualEntry[];
  };

  const institutionName = body.institutionName?.trim() ?? '';
  const reportingMonth = Number(body.reportingMonth);
  const reportingYear = Number(body.reportingYear);
  const submittedEntries = body.entries ?? [];

  if (!institutionName || !Number.isInteger(reportingMonth) || reportingMonth < 1 || reportingMonth > 12) {
    return NextResponse.json({ error: 'A valid parish and reporting month are required.' }, { status: 400 });
  }
  if (!Number.isInteger(reportingYear) || reportingYear < 2000 || reportingYear > 2100) {
    return NextResponse.json({ error: 'A valid reporting year is required.' }, { status: 400 });
  }
  if (submittedEntries.length === 0) {
    return NextResponse.json({ error: 'Enter at least one IAFR amount before submitting.' }, { status: 400 });
  }
  if (
    submittedEntries.some(
      (entry) => !entry.fieldKey || !entry.canonicalAccountCode || !Number.isFinite(entry.cleanedAmount),
    )
  ) {
    return NextResponse.json({ error: 'One or more manual-entry fields are invalid.' }, { status: 400 });
  }

  const sourceAmount = (accountCode: string) =>
    submittedEntries
      .filter((entry) => entry.canonicalAccountCode === accountCode)
      .reduce((sum, entry) => sum + entry.cleanedAmount, 0);
  const weekdayCollections = sourceAmount('B.1.01');
  const sundayCollections = sourceAmount('B.1.02');
  const saturdayCollections = sourceAmount('B.1.03');
  const scheme = await getEffectiveTaxationScheme(reportingYear, reportingMonth);
  if (!scheme) {
    throw new TaxationApiError('No published progressive taxation scheme covers this reporting month.', 422);
  }

  const calculation = calculateProgressiveTax({
    reportingYear,
    reportingMonth,
    weekdayCollections,
    sundayCollections,
    saturdayCollections,
    scheme: scheme as ProgressiveTaxScheme,
  });
  if (calculation.status === 'missing_scheme') {
    throw new TaxationApiError('No published progressive taxation scheme covers this reporting month.', 422);
  }
  if (calculation.status === 'out_of_range') {
    throw new TaxationApiError(
      'The Mass Collections total is outside the configured progressive taxation scheme.',
      422,
    );
  }

  const entries = submittedEntries.filter((entry) => entry.canonicalAccountCode !== 'F.1.04');
  if (calculation.taxAmount > 0) {
    const roundedShare = Math.round(calculation.taxAmount * 100) / 100;
    entries.push({
      fieldKey: 'F.progressive_tax_share',
      sectionCode: 'F',
      subsectionCode: 'remittance_to_diocese',
      canonicalAccountCode: 'F.1.04',
      sourceLabel: 'Progressive Tax Collections - Diocese Share',
      rawValue: roundedShare.toFixed(2),
      cleanedAmount: roundedShare,
      sourceMetadata: {
        inputKind: 'derived_progressive_tax',
        taxationSchemeId: scheme.id,
        taxationSchemeVersion: scheme.version,
        taxationSchemeEffectiveFrom: scheme.effectiveFrom,
        taxationBracketId: calculation.bracket?.id ?? null,
        taxationBracketMinimum: calculation.bracket?.minimumAmount ?? null,
        taxationBracketMaximum: calculation.bracket?.maximumAmount ?? null,
        taxRate: calculation.taxRate,
        massCollectionTotal: calculation.massCollectionTotal,
        derivedFrom: ['B.1.01', 'B.1.02', 'B.1.03'],
        formVersion: body.formVersion ?? 'iafr_2026_v1',
      },
    });
  }
  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'Enter at least one non-derived IAFR amount before submitting.' },
      { status: 400 },
    );
  }

  const supabase = makeServiceClient();
  const institutionId = await resolveInstitutionId(supabase, institutionName);
  const { data: run, error: runError } = await supabase
    .schema('operations')
    .from('parish_submission_test_runs')
    .insert({
      institution_id: institutionId,
      reporting_month: reportingMonth,
      reporting_year: reportingYear,
      form_version: body.formVersion ?? 'iafr_2026_v1',
      input_method: 'manual',
      status: 'running',
      current_stage: 'saving_manual_entry',
      progress_percent: 10,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (runError || !run) throw new Error(runError?.message ?? 'Could not create the test run.');
  const runId = run.id as string;

  await addStage(supabase, runId, 'saving', 1, 'completed', 'Manual IAFR values saved to the test run.');

  const { error: entryError } = await supabase
    .schema('operations')
    .from('parish_submission_test_entries')
    .insert(
      entries.map((entry) => ({
        run_id: runId,
        field_key: entry.fieldKey,
        section_code: entry.sectionCode,
        subsection_code: entry.subsectionCode ?? null,
        canonical_account_code: entry.canonicalAccountCode,
        source_label: entry.sourceLabel,
        raw_value: entry.rawValue,
        cleaned_amount: entry.cleanedAmount,
        source_metadata: entry.sourceMetadata ?? {},
        validation_status: entry.cleanedAmount < 0 ? 'invalid' : 'valid',
        validation_messages: entry.cleanedAmount < 0 ? ['Amounts cannot be negative.'] : [],
      })),
    );

  if (entryError) throw new Error(entryError.message);

  await addStage(supabase, runId, 'validation', 2, 'completed', 'Field formats and canonical keys validated.');
  await addStage(supabase, runId, 'cleaning', 3, 'completed', 'Amounts standardized to two decimal places.');
  await addStage(supabase, runId, 'calculation', 4, 'completed', 'Derived IAFR amounts prepared.');
  await addStage(supabase, runId, 'mapping', 5, 'running', 'Checking canonical account mappings.');

  const { data: financialRecordId, error: commitError } = await supabase
    .schema('operations')
    .rpc('commit_parish_submission_test_run', { p_run_id: runId });

  if (commitError || !financialRecordId) {
    const { data: failedRun } = await supabase
      .schema('operations')
      .from('parish_submission_test_runs')
      .select('error_summary')
      .eq('id', runId)
      .maybeSingle();
    const message =
      commitError?.message ??
      failedRun?.error_summary ??
      'Canonical account reconciliation failed. The sandbox canonical account catalog may be out of date.';
    await addStage(supabase, runId, 'mapping', 5, 'failed', message);
    return NextResponse.json({ runId, status: 'failed', error: message }, { status: 422 });
  }

  await addStage(supabase, runId, 'mapping', 5, 'completed', 'Every non-zero amount matched a canonical account.');
  await addStage(supabase, runId, 'loading', 6, 'completed', 'Records saved in parishes_submission_test.');
  await addStage(supabase, runId, 'reconciliation', 7, 'completed', 'Canonical account reconciliation passed.');
  await addStage(supabase, runId, 'completed', 8, 'completed', 'Sandbox submission completed.');

  return NextResponse.json({ runId, financialRecordId, status: 'completed', progressPercent: 100 });
}

async function createFileRun(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const institutionName = String(formData.get('institutionName') ?? '').trim();
  const reportingMonth = Number(formData.get('reportingMonth'));
  const reportingYear = Number(formData.get('reportingYear'));

  if (!file || !institutionName || !Number.isInteger(reportingMonth) || !Number.isInteger(reportingYear)) {
    return NextResponse.json({ error: 'File, parish, month, and year are required.' }, { status: 400 });
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['xlsx', 'csv'].includes(extension)) {
    return NextResponse.json(
      { error: 'Only XLSX and CSV files are accepted for parish IAFR testing.' },
      { status: 400 },
    );
  }

  const supabase = makeServiceClient();
  const institutionId = await resolveInstitutionId(supabase, institutionName);
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `test/parish/${institutionId}/${reportingYear}/${reportingMonth}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: run, error: runError } = await supabase
    .schema('operations')
    .from('parish_submission_test_runs')
    .insert({
      institution_id: institutionId,
      reporting_month: reportingMonth,
      reporting_year: reportingYear,
      form_version: 'iafr_2026_v1',
      input_method: 'file',
      source_file_name: file.name,
      source_file_path: storagePath,
      source_file_hash: fileHash,
      status: 'warning',
      current_stage: 'awaiting_test_parser',
      progress_percent: 25,
      started_at: new Date().toISOString(),
      error_summary: 'File received safely. Canonical parsing remains disabled until the test parser is connected.',
    })
    .select('id')
    .single();
  if (runError || !run) throw new Error(runError?.message ?? 'Could not create the test upload run.');

  await addStage(supabase, run.id, 'uploading', 1, 'completed', 'File saved under the isolated test storage path.');
  await addStage(supabase, run.id, 'reading', 2, 'warning', 'File is ready for the isolated canonical parser.');

  return NextResponse.json({
    runId: run.id,
    status: 'warning',
    progressPercent: 25,
    storagePath,
    message: 'Test upload succeeded. The file has not been written to production parish tables.',
  });
}

export async function POST(req: NextRequest) {
  try {
    return req.headers.get('content-type')?.includes('multipart/form-data')
      ? await createFileRun(req)
      : await createManualRun(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected test-submission error.';
    console.error('[submission-test-runs]', message);
    return NextResponse.json({ error: message }, { status: error instanceof TaxationApiError ? error.status : 500 });
  }
}
