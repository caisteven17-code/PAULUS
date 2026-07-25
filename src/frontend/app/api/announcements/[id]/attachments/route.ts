export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ANNOUNCEMENT_BUCKET, announcementCaller } from '../../attachment-auth';

const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain']);
const MAX_FILES = 5;
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, canManage } = await announcementCaller(req);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const form = await req.formData();
  const files = form.getAll('files').filter((value): value is File => value instanceof File);
  if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Select 1 to ${MAX_FILES} files.` }, { status: 400 });
  const { count } = await supabase.schema('diocese').from('announcement_attachments').select('id', { count: 'exact', head: true }).eq('announcement_id', id);
  if ((count ?? 0) + files.length > MAX_FILES) return NextResponse.json({ error: `An announcement can have at most ${MAX_FILES} attachments.` }, { status: 400 });
  const created: any[] = [];
  for (const [index, file] of files.entries()) {
    if (!ALLOWED.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is unsupported or larger than 25 MB.` }, { status: 400 });
    const attachmentId = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const storagePath = `announcements/${id}/${attachmentId}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(ANNOUNCEMENT_BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    const row = { id: attachmentId, announcement_id: id, storage_path: storagePath, original_name: file.name, mime_type: file.type, file_size: file.size, attachment_kind: file.type.startsWith('image/') ? 'image' : 'document', display_order: (count ?? 0) + index };
    const { error } = await supabase.schema('diocese').from('announcement_attachments').insert(row);
    if (error) { await supabase.storage.from(ANNOUNCEMENT_BUCKET).remove([storagePath]); return NextResponse.json({ error: error.message }, { status: 500 }); }
    created.push({ id: row.id, originalName: row.original_name, mimeType: row.mime_type, fileSize: row.file_size, kind: row.attachment_kind, displayOrder: row.display_order, altText: null });
  }
  return NextResponse.json(created, { status: 201 });
}
