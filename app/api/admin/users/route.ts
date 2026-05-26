/**
 * Admin User Management API — /api/admin/users
 *
 * Uses the Supabase service-role key (bypasses RLS).
 * SERVER-SIDE ONLY — never import supabaseServer in browser code.
 *
 * GET    — list all Supabase Auth users (up to 1 000)
 * POST   — create a new user with email, password & user_metadata
 * PATCH  — update an existing user's metadata / email
 * DELETE — archive (ban) or restore a user; body: { id, action: 'archive'|'restore' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../../src/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u: any) {
  const meta: Record<string, unknown> = u.user_metadata ?? {};
  return {
    id:          u.id,
    email:       u.email ?? '',
    displayName: (meta.displayName ?? meta.display_name ?? u.email ?? '') as string,
    role:        (meta.role ?? 'parish_priest') as string,
    roleId:      (meta.role ?? 'parish_priest') as string,
    entityName:  (meta.entityName  ?? meta.entity_name  ?? '') as string,
    entityType:  (meta.entityType  ?? meta.entity_type  ?? 'parish') as string,
    entityId:    (meta.entityId    ?? meta.entity_id    ?? '') as string,
    // Treat banned users as archived
    status:      u.banned_until ? 'archived' : ((meta.status ?? 'active') as string),
    createdAt:   u.created_at ?? null,
    lastSignIn:  u.last_sign_in_at ?? null,
  };
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabaseServer.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data.users ?? []).map(mapUser));
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    email: string;
    password: string;
    displayName?: string;
    role?: string;
    entityName?: string;
    entityType?: string;
    entityId?: string;
  };

  const { email, password, displayName, role, entityName, entityType, entityId } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    user_metadata: {
      displayName: displayName ?? email.split('@')[0],
      role:        role       ?? 'parish_priest',
      entityName:  entityName ?? '',
      entityType:  entityType ?? 'parish',
      entityId:    entityId   ?? '',
      status:      'active',
    },
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(mapUser(data.user), { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string;
    email?: string;
    displayName?: string;
    role?: string;
    entityName?: string;
    entityType?: string;
    entityId?: string;
  };

  const { id, email, displayName, role, entityName, entityType, entityId } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    user_metadata: { displayName, role, entityName, entityType, entityId },
  };
  if (email) updates.email = email;

  const { data, error } = await supabaseServer.auth.admin.updateUserById(id, updates);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(mapUser(data.user));
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { id, action } = await req.json() as { id: string; action: 'archive' | 'restore' };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (action === 'archive') {
    const { data, error } = await supabaseServer.auth.admin.updateUserById(id, {
      user_metadata: { status: 'archived' },
      ban_duration:  '876600h', // ~100 years
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(mapUser(data.user));
  }

  if (action === 'restore') {
    const { data, error } = await supabaseServer.auth.admin.updateUserById(id, {
      user_metadata: { status: 'active' },
      ban_duration:  'none',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(mapUser(data.user));
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
