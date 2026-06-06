export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'financial-submissions';

function makeServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const institutionName = (formData.get('institutionName') as string | null) ?? '';
    const institutionType = (formData.get('institutionType') as string | null) ?? '';
    const reportType = (formData.get('reportType') as string | null) ?? '';
    const reportingMonth = parseInt((formData.get('reportingMonth') as string | null) ?? '0', 10);
    const reportingYear = parseInt((formData.get('reportingYear') as string | null) ?? '0', 10);
    const isLate = (formData.get('isLate') as string | null) === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Read file bytes and compute a SHA-256 hash for deduplication
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    // Build a deterministic storage path
    const safeName = institutionName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${institutionType}/${safeName}/${reportingYear}/${reportingMonth}/${file.name}`;

    // Upload to Supabase Storage using the service-role client
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Generate a 1-year signed URL (bucket is private)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const fileUrl = signedError || !signedData ? null : signedData.signedUrl;

    // Insert the submission record
    const { data: insertedRow, error: dbError } = await supabase
      .schema('operations')
      .from('submission_batches')
      .insert({
        institution_type: institutionType,
        report_type: reportType,
        reporting_month: reportingMonth,
        reporting_year: reportingYear,
        source_file_name: file.name,
        source_file_url: fileUrl,
        source_file_hash: fileHash,
        submitted_at: new Date().toISOString(),
        validation_status: 'pending',
        is_late: isLate,
        remarks: institutionName,
      })
      .select('id, validation_status')
      .single();

    if (dbError) {
      // Storage succeeded — still return a partial success so the UI doesn't break
      console.error('[submissions] DB insert failed:', dbError.message);
      return NextResponse.json({
        submissionId: null,
        filePath: storagePath,
        validationStatus: 'pending',
        warning: `File stored but DB record failed: ${dbError.message}`,
      });
    }

    return NextResponse.json({
      submissionId: insertedRow.id as string,
      filePath: storagePath,
      validationStatus: insertedRow.validation_status as string,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[submissions] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
