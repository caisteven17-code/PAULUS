import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export const ANNOUNCEMENT_BUCKET = 'announcement-attachments';
const MANAGE_ROLES = new Set(['bishop', 'chancellor', 'diocesan_oeconomus']);

export function announcementAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } });
}

export async function announcementCaller(req: NextRequest) {
  const supabase = announcementAdmin();
  const claimedRole = req.headers.get('x-user-role') ?? '';
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  let profileId: string | null = null;
  let role = claimedRole;
  if (token && !token.startsWith('demo-')) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) {
      const { data: profile } = await supabase.schema('diocese').from('profiles').select('id').eq('external_auth_id', data.user.id).maybeSingle();
      profileId = profile?.id ?? null;
      if (!profileId) {
        const { data: legacyProfile } = await supabase.schema('diocese').from('profiles').select('id').eq('auth_user_id', data.user.id).maybeSingle();
        profileId = legacyProfile?.id ?? null;
      }
    }
  }
  if (!profileId && req.headers.get('x-user-name')) {
    const { data: profile } = await supabase.schema('diocese').from('profiles').select('id').ilike('full_name', req.headers.get('x-user-name')!).limit(1).maybeSingle();
    profileId = profile?.id ?? null;
    if (!profileId) {
      const { data: legacyProfile } = await supabase.schema('diocese').from('profiles').select('id').ilike('display_name', req.headers.get('x-user-name')!).limit(1).maybeSingle();
      profileId = legacyProfile?.id ?? null;
    }
  }
  if (!profileId && req.headers.get('x-user-id')) {
    const { data: profile } = await supabase.schema('diocese').from('profiles').select('id').eq('id', req.headers.get('x-user-id')!).maybeSingle();
    profileId = profile?.id ?? null;
  }
  return { supabase, profileId, canManage: MANAGE_ROLES.has(role) };
}

export async function canReadAnnouncement(supabase: ReturnType<typeof announcementAdmin>, announcementId: string, profileId: string | null, canManage: boolean) {
  if (canManage) return true;
  const { data } = await supabase.schema('diocese').from('announcements').select('audience_type, status, start_date, end_date').eq('id', announcementId).is('deleted_at', null).maybeSingle();
  if (!data || data.status !== 'active' || new Date(data.start_date).getTime() > Date.now() || (data.end_date && new Date(data.end_date).getTime() < Date.now())) return false;
  if (data.audience_type !== 'specific') return true;
  if (!profileId) return false;
  const { data: recipient } = await supabase.schema('diocese').from('announcement_recipients').select('id').eq('announcement_id', announcementId).eq('profile_id', profileId).maybeSingle();
  return Boolean(recipient);
}
