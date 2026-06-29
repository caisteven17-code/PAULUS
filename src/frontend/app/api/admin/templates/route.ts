export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'report-templates';
const VALID_TYPES = ['parish', 'school', 'seminary', 'diocese'] as const;
type InstitutionType = (typeof VALID_TYPES)[number];

function makeServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function isValidType(value: string | null): value is InstitutionType {
  return !!value && (VALID_TYPES as readonly string[]).includes(value);
}

// GET ?institutionType=parish -> { xlsx?: signedUrl, csv?: signedUrl }
export async function GET(req: NextRequest) {
  const institutionType = req.nextUrl.searchParams.get('institutionType');
  if (!isValidType(institutionType)) {
    return NextResponse.json({ error: 'institutionType must be one of parish, school, seminary, diocese.' }, { status: 400 });
  }

  const supabase = makeServiceClient();
  const urls: Partial<Record<'xlsx' | 'csv', string>> = {};

  for (const ext of ['xlsx', 'csv'] as const) {
    const path = `${institutionType}/template.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (!error && data?.signedUrl) {
      urls[ext] = data.signedUrl;
    }
  }

  return NextResponse.json(urls);
}

// POST multipart form { file, institutionType } -> uploads to {institutionType}/template.{ext}
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const institutionType = formData.get('institutionType') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!isValidType(institutionType)) {
      return NextResponse.json({ error: 'institutionType must be one of parish, school, seminary, diocese.' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (extension !== 'xlsx' && extension !== 'csv') {
      return NextResponse.json({ error: 'Only .xlsx and .csv templates are supported.' }, { status: 400 });
    }

    const supabase = makeServiceClient();
    const arrayBuffer = await file.arrayBuffer();
    const path = `${institutionType}/template.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(arrayBuffer), {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    return NextResponse.json({ path, institutionType, extension });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
