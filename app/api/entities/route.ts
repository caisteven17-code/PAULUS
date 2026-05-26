/**
 * Entity Catalogue API Route — /api/entities
 *
 * GET  ?type=parish|school|seminary   Returns entities of that type
 * GET  (no type)                       Returns all entity types grouped
 *
 * Reads from the Supabase `parishes`, `seminaries`, `diocesan_schools` tables first.
 * Falls back to compiled-in constants when the tables are empty or unreachable
 * (handy during local development before the DB is seeded).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../src/lib/supabase';
import { entityService } from '../../../src/microservices/entity.service';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');

  switch (type) {
    case 'parish': {
      const { data, error } = await supabaseServer
        .from('parishes')
        .select('id,name,vicariate,class,pastor,address,contact_number,email,lat,lng,primary_patron,secondary_patron,fiesta_date')
        .eq('status', 'active')
        .order('vicariate')
        .order('name');
      if (!error && data?.length) return NextResponse.json(data);
      return NextResponse.json(entityService.getParishes());
    }

    case 'school': {
      const { data, error } = await supabaseServer
        .from('diocesan_schools')
        .select('id,name,vicariate,class,principal,address,level,enrollment,capacity,staff')
        .eq('status', 'active')
        .order('name');
      if (!error && data?.length) return NextResponse.json(data);
      return NextResponse.json(entityService.getSchools());
    }

    case 'seminary': {
      const { data, error } = await supabaseServer
        .from('seminaries')
        .select('id,name,vicariate,class,rector,address,enrollment,capacity,staff')
        .eq('status', 'active')
        .order('name');
      if (!error && data?.length) return NextResponse.json(data);
      return NextResponse.json(entityService.getSeminaries());
    }

    default: {
      const [par, sem, sch] = await Promise.all([
        supabaseServer.from('parishes')        .select('id,name,vicariate,class,pastor,address').eq('status', 'active').order('name'),
        supabaseServer.from('seminaries')      .select('id,name,vicariate,class,rector,address').eq('status', 'active').order('name'),
        supabaseServer.from('diocesan_schools').select('id,name,vicariate,class,principal,address').eq('status', 'active').order('name'),
      ]);
      if (!par.error && par.data?.length) {
        return NextResponse.json({
          parishes:   par.data,
          seminaries: sem.data ?? [],
          schools:    sch.data ?? [],
        });
      }
      return NextResponse.json(entityService.getAll());
    }
  }
}
