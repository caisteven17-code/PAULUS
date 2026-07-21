export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { ANNOUNCEMENT_BUCKET, announcementCaller, canReadAnnouncement } from '../../../attachment-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  const { supabase, profileId, canManage } = await announcementCaller(req);
  if (!(await canReadAnnouncement(supabase, id, profileId, canManage))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data } = await supabase.schema('diocese').from('announcement_attachments').select('storage_path, original_name').eq('id', attachmentId).eq('announcement_id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  const download = req.nextUrl.searchParams.get('download') === '1';
  const { data: signed, error } = await supabase.storage.from(ANNOUNCEMENT_BUCKET).createSignedUrl(data.storage_path, 600, download ? { download: data.original_name } : undefined);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  const { supabase, canManage } = await announcementCaller(req);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data } = await supabase.schema('diocese').from('announcement_attachments').select('storage_path').eq('id', attachmentId).eq('announcement_id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  await supabase.storage.from(ANNOUNCEMENT_BUCKET).remove([data.storage_path]);
  await supabase.schema('diocese').from('announcement_attachments').delete().eq('id', attachmentId);
  return NextResponse.json({ ok: true });
}
