export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { postToPusher } from '../_proxy';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const uploadedBy = (formData.get('uploadedBy') as string | null) ?? null;
  const files = formData.getAll('files').filter((item): item is File => item instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'Upload at least one Excel file.' }, { status: 400 });
  }

  const encoded = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    })),
  );

  return postToPusher('/pusher/validate', { files: encoded, uploadedBy });
}
