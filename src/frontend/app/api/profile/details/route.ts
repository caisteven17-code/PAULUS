export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Saves a user's own profile details (birthday, contact number) to
// diocese.profiles — the browser client can't write there directly because of
// row-level security, so this runs with the service role.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId: string = body?.userId ?? '';
    if (!userId) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });

    // Only set the fields that were provided.
    const profileUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
    if ('birthday' in body) profileUpdate.birthday = body.birthday || null;
    if ('contactNumber' in body) profileUpdate.contact_number = body.contactNumber || '';

    const supabase = serviceClient();
    const { error } = await supabase
      .schema('diocese')
      .from('profiles')
      .update(profileUpdate)
      .or(`id.eq.${userId},external_auth_id.eq.${userId}`);

    if (error) {
      return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 });
    }

    // Mirror into the auth metadata so the session keeps the value across logins.
    try {
      const meta: Record<string, any> = {};
      if ('birthday' in body) meta.birthday = body.birthday || null;
      if ('contactNumber' in body) meta.contactNumber = body.contactNumber || '';
      if (Object.keys(meta).length > 0) {
        await supabase.auth.admin.updateUserById(userId, { user_metadata: meta });
      }
    } catch {
      /* userId may be the profile id rather than the auth id — profiles row is the source of truth */
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[profile/details] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
