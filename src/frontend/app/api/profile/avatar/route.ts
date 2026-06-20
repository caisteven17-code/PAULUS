export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'avatar';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Save the avatar URL onto whichever profile row matches the given id
// (profiles.id or the Supabase auth id stored in external_auth_id), and mirror
// it into the auth user_metadata so the session carries it across logins.
async function saveAvatarUrl(supabase: ReturnType<typeof serviceClient>, userId: string, avatarUrl: string | null) {
  await supabase
    .schema('diocese')
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .or(`id.eq.${userId},external_auth_id.eq.${userId}`);

  // Best-effort: only works when userId is the Supabase auth id (it usually is).
  try {
    await supabase.auth.admin.updateUserById(userId, { user_metadata: { avatarUrl } });
  } catch {
    /* not the auth id — the profiles row is still the source of truth */
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userId = (formData.get('userId') as string | null) ?? '';

    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Please upload a JPG, PNG, WEBP, or GIF image.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 5 MB).' }, { status: 400 });
    }

    const supabase = serviceClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    // One stable file per user so new uploads overwrite the old photo.
    const storagePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Public bucket → permanent URL. Add a cache-busting query so the new
    // image shows immediately even though the path is reused.
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`;

    await saveAvatarUrl(supabase, userId, avatarUrl);

    return NextResponse.json({ avatarUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[profile/avatar] upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json().catch(() => ({ userId: '' }));
    if (!userId) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });

    const supabase = serviceClient();
    // Remove any stored files for this user, then clear the profile column.
    const { data: list } = await supabase.storage.from(BUCKET).list(userId);
    if (list && list.length > 0) {
      await supabase.storage.from(BUCKET).remove(list.map((f) => `${userId}/${f.name}`));
    }
    await saveAvatarUrl(supabase, userId, null);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[profile/avatar] delete error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
