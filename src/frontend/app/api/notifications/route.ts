export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../src/lib/supabase';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  summary?: string;
  time: string;
  type: 'announcement' | 'summary';
  tone: 'gold' | 'blue' | 'rose' | 'orange' | 'amber';
  icon: 'megaphone' | 'info' | 'shield' | 'cloud-off' | 'file-warning';
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortTime(value: string | number | null | undefined): string {
  if (!value) return 'Today';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function excerpt(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function resolveProfile(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const fallbackId = req.headers.get('x-user-id') || '';
  const fallbackName = req.headers.get('x-user-name') || '';
  const fallbackEmail = req.headers.get('x-user-email') || '';
  const fallbackEntityId = req.headers.get('x-entity-id') || '';
  const fallbackEntityName = req.headers.get('x-entity-name') || '';
  const fallbackEntityType = req.headers.get('x-entity-type') || '';

  if (token && !token.startsWith('demo-')) {
    const { data } = await supabaseServer.auth.getUser(token);
    const authId = data.user?.id;
    if (authId) {
      const { data: profile } = await supabaseServer
        .schema('diocese')
        .from('profiles')
        .select('id, email, full_name, institution_id, institutions(id, name, institution_type)')
        .or(`external_auth_id.eq.${authId},auth_user_id.eq.${authId},id.eq.${authId}`)
        .maybeSingle();
      if (profile) return profile as any;
    }
  }

  if (fallbackId) {
    const { data: profile } = await supabaseServer
      .schema('diocese')
      .from('profiles')
      .select('id, email, full_name, institution_id, institutions(id, name, institution_type)')
      .eq('id', fallbackId)
      .maybeSingle();
    if (profile) return profile as any;
  }

  if (fallbackEmail || fallbackName) {
    if (fallbackEmail) {
      const { data: profile } = await supabaseServer
        .schema('diocese')
        .from('profiles')
        .select('id, email, full_name, institution_id, institutions(id, name, institution_type)')
        .ilike('email', fallbackEmail)
        .limit(1)
        .maybeSingle();
      if (profile) return profile as any;
    }

    if (fallbackName) {
      const { data: profile } = await supabaseServer
        .schema('diocese')
        .from('profiles')
        .select('id, email, full_name, institution_id, institutions(id, name, institution_type)')
        .ilike('full_name', fallbackName)
        .limit(1)
        .maybeSingle();
      if (profile) return profile as any;
    }
  }

  if (fallbackEntityId || fallbackEntityName) {
    const query = supabaseServer.schema('diocese').from('institutions').select('id, name, institution_type').limit(1);
    const { data: institution } = fallbackEntityId
      ? await query.eq('id', fallbackEntityId).maybeSingle()
      : await query.ilike('name', fallbackEntityName).maybeSingle();

    if (institution) {
      return {
        id: fallbackId || null,
        email: fallbackEmail || null,
        full_name: fallbackName || null,
        institution_id: institution.id,
        institutions: institution,
      };
    }
  }

  return {
    id: fallbackId || null,
    email: fallbackEmail || null,
    full_name: fallbackName || null,
    institution_id: fallbackEntityId || null,
    institutions: fallbackEntityId
      ? { id: fallbackEntityId, name: fallbackEntityName, institution_type: fallbackEntityType }
      : null,
  };
}

async function getAnnouncementNotifications(profileId: string | null): Promise<NotificationItem[]> {
  const now = new Date().toISOString();
  const baseSelect = 'id, title, content, audience_type, priority, created_at, published_at, start_date, end_date';

  const { data: generalRows } = await supabaseServer
    .schema('diocese')
    .from('announcements')
    .select(baseSelect)
    .eq('status', 'active')
    .neq('audience_type', 'specific')
    .lte('start_date', now)
    .is('deleted_at', null)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const items: NotificationItem[] = (generalRows ?? [])
    .filter((row: any) => !row.end_date || new Date(row.end_date).getTime() >= Date.now())
    .map((row: any) => ({
      id: `announcement-general-${row.id}`,
      title: row.title || 'General Announcement',
      message: excerpt(row.content, 'There is a new general announcement for you.'),
      time: shortTime(row.published_at ?? row.created_at ?? row.start_date),
      type: 'announcement',
      tone: 'gold',
      icon: 'megaphone',
    }));

  if (profileId) {
    const { data: recipientRows } = await supabaseServer
      .schema('diocese')
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('profile_id', profileId)
      .limit(20);
    const ids = [...new Set((recipientRows ?? []).map((row: any) => row.announcement_id).filter(Boolean))];

    if (ids.length > 0) {
      const { data: specificRows } = await supabaseServer
        .schema('diocese')
        .from('announcements')
        .select(baseSelect)
        .in('id', ids)
        .eq('status', 'active')
        .eq('audience_type', 'specific')
        .lte('start_date', now)
        .is('deleted_at', null)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

      items.push(
        ...(specificRows ?? [])
          .filter((row: any) => !row.end_date || new Date(row.end_date).getTime() >= Date.now())
          .map((row: any) => ({
            id: `announcement-specific-${row.id}`,
            title: row.title || 'For You Announcement',
            message: excerpt(row.content, 'A new announcement has been posted for you.'),
            time: shortTime(row.published_at ?? row.created_at ?? row.start_date),
            type: 'announcement' as const,
            tone: 'blue' as const,
            icon: 'info' as const,
          })),
      );
    }
  }

  return items;
}

async function getSecurityNotification(profile: any): Promise<NotificationItem | null> {
  if (!profile?.id && !profile?.email) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const identityFilters = [profile?.id ? `user_id.eq.${profile.id}` : '', profile?.email ? `user_name.ilike.${profile.email}` : '']
    .filter(Boolean)
    .join(',');

  let query = supabaseServer
    .schema('diocese')
    .from('audit_logs')
    .select('id, action, detail, created_at')
    .eq('category', 'auth')
    .eq('severity', 'warning')
    .ilike('action', '%Account locked%')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  if (identityFilters) query = query.or(identityFilters);

  const { data, error } = await query;
  if (error || !data?.length) return null;

  const row = data[0] as any;
  return {
    id: `security-${row.id}`,
    title: 'Account Access Alert',
    message: 'A recent account security warning was recorded.',
    summary: excerpt(row.detail, 'We detected a possible login attempt. Please review your account security.'),
    time: shortTime(row.created_at),
    type: 'summary',
    tone: 'rose',
    icon: 'shield',
  };
}

async function getWarehouseNotification(): Promise<NotificationItem | null> {
  const analyticsUrl = (process.env.ANALYTICS_PYTHON_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

  try {
    const response = await fetch(`${analyticsUrl}/warehouse/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`health check returned ${response.status}`);

    const health = await response.json();
    if (health?.status !== 'degraded' && health?.status !== 'unhealthy') return null;

    const issues = [
      health?.critical_alerts ? `${health.critical_alerts} critical alert(s)` : '',
      health?.warning_alerts ? `${health.warning_alerts} warning alert(s)` : '',
      health?.dead_letter_retries ? `${health.dead_letter_retries} failed retry item(s)` : '',
      health?.worker_heartbeat_stale ? 'worker heartbeat is stale' : '',
    ].filter(Boolean);

    return {
      id: 'warehouse-health',
      title: 'AWS Service Alert',
      message: `AWS warehouse status is ${health.status}.`,
      summary: issues.length ? issues.join(', ') : 'The warehouse health check reported a service issue.',
      time: shortTime(health?.checked_at),
      type: 'summary',
      tone: 'orange',
      icon: 'cloud-off',
    };
  } catch (error) {
    return {
      id: 'warehouse-unreachable',
      title: 'AWS Service Alert',
      message: 'AWS analytics service cannot be reached.',
      summary: error instanceof Error ? error.message : 'The warehouse health check failed.',
      time: 'Now',
      type: 'summary',
      tone: 'orange',
      icon: 'cloud-off',
    };
  }
}

async function getMissingFinancialNotification(profile: any): Promise<NotificationItem | null> {
  const institutionId = profile?.institution_id || profile?.institutions?.id;
  const institutionType = profile?.institutions?.institution_type;
  if (!institutionId || !['parish', 'school', 'seminary'].includes(institutionType)) return null;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data, error } = await supabaseServer
    .schema('operations')
    .from('submission_batches')
    .select('id, validation_status, submitted_at')
    .eq('institution_id', institutionId)
    .eq('reporting_year', year)
    .eq('reporting_month', month)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })
    .limit(1);

  if (error || data?.length) return null;

  const period = `${MONTH_NAMES[month - 1]} ${year}`;
  return {
    id: 'missing-financial-records',
    title: 'Missing Financial Records',
    message: `No financial submission found for ${period}.`,
    summary: `Your institution has not submitted financial records for ${period}. Please upload them as soon as possible.`,
    time: 'Today',
    type: 'summary',
    tone: 'amber',
    icon: 'file-warning',
  };
}

export async function GET(req: NextRequest) {
  try {
    const profile = await resolveProfile(req);
    const results = await Promise.allSettled([
      getAnnouncementNotifications(profile?.id ?? null),
      getSecurityNotification(profile),
      getWarehouseNotification(),
      getMissingFinancialNotification(profile),
    ]);

    const notifications = results.flatMap((result) => {
      if (result.status !== 'fulfilled' || !result.value) return [];
      return Array.isArray(result.value) ? result.value : [result.value];
    });

    return NextResponse.json({
      notifications,
      unreadCount: notifications.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[notifications] Failed to build notifications:', error);
    return NextResponse.json({ notifications: [], unreadCount: 0, error: 'Failed to load notifications.' }, { status: 500 });
  }
}
