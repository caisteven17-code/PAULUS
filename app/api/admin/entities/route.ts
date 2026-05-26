/**
 * Admin Entity Management API — /api/admin/entities
 *
 * Full CRUD for parishes, seminaries, and diocesan_schools stored in Supabase.
 * Falls back to the constants file when tables are not yet seeded.
 * Uses the service-role key (bypasses RLS) — SERVER-SIDE ONLY.
 *
 * GET    ?type=parish|seminary|school   list active entities (or all if ?all=true)
 * GET    (no type)                      return all three collections
 * POST                                  create entity; body must include { type, ...fields }
 * PATCH                                 update entity; body must include { type, id, ...fields }
 * DELETE                                soft-delete; body must include { type, id }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../../src/lib/supabase';
import { entityService } from '../../../../src/microservices/entity.service';

type EntityType = 'parish' | 'seminary' | 'school';

function tableFor(type: string | null): string | null {
  if (type === 'parish')   return 'parishes';
  if (type === 'seminary') return 'seminaries';
  if (type === 'school')   return 'diocesan_schools';
  return null;
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as EntityType | null;
  const includeAll = req.nextUrl.searchParams.get('all') === 'true';
  const table = tableFor(type);

  if (table) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabaseServer.from(table).select('*').order('name');
    if (!includeAll) q = q.eq('status', 'active');

    const { data, error } = await q;
    if (error || !data?.length) {
      // Fallback to compiled-in constants
      const fallback =
        type === 'parish'   ? entityService.getParishes()   :
        type === 'seminary' ? entityService.getSeminaries() :
                              entityService.getSchools();
      return NextResponse.json(fallback);
    }
    return NextResponse.json(data);
  }

  // All entity types
  const [par, sem, sch] = await Promise.all([
    supabaseServer.from('parishes')       .select('*').eq('status', 'active').order('name'),
    supabaseServer.from('seminaries')     .select('*').eq('status', 'active').order('name'),
    supabaseServer.from('diocesan_schools').select('*').eq('status', 'active').order('name'),
  ]);

  if (par.error) {
    return NextResponse.json(entityService.getAll());
  }

  return NextResponse.json({
    parishes:   par.data ?? [],
    seminaries: sem.data ?? [],
    schools:    sch.data ?? [],
  });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown> & { type: EntityType };
  const { type, ...entity } = body;
  const table = tableFor(type);
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  const { data, error } = await supabaseServer.from(table).insert(entity).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json() as Record<string, unknown> & { type: EntityType; id: string };
  const { type, id, ...updates } = body;
  const table = tableFor(type);
  if (!table || !id) {
    return NextResponse.json({ error: 'type and id are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { type, id } = await req.json() as { type: EntityType; id: string };
  const table = tableFor(type);
  if (!table || !id) {
    return NextResponse.json({ error: 'type and id are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from(table)
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
