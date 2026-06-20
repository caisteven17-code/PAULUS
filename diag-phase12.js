// READ-ONLY diagnostic for Phase 1 & 2. Makes only SELECTs — changes nothing.
// Run from the PAULUS folder:  node diag-phase12.js
const fs = require('fs');
const path = require('path');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { createClient } = require('@supabase/supabase-js');
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log('Missing SUPABASE_URL/SERVICE_ROLE_KEY in .env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const d = () => sb.schema('diocese');

const line = (s = '') => console.log(s);
const hr = (t) => { line(); line('============================================================'); line('  ' + t); line('============================================================'); };

(async () => {
  // ── A. INSTITUTION REGISTRY (Phase 1.1 + 2.4) ─────────────────────────────
  hr('A. diocese.institutions (the registry events/projects resolve against)');
  const inst = await d().from('institutions').select('id, name, institution_type, is_active, deleted_at, institution_code').order('institution_type').order('name');
  if (inst.error) { line('ERROR: ' + inst.error.message); }
  else {
    const byType = {};
    for (const r of inst.data) (byType[r.institution_type] ||= []).push(r);
    for (const t of Object.keys(byType)) {
      line(`\n${t.toUpperCase()} — ${byType[t].length} row(s):`);
      for (const r of byType[t]) line(`   ${r.institution_code || '(no code)'} | ${r.name} | active=${r.is_active} | deleted=${r.deleted_at ? 'YES' : 'no'} | id=${r.id}`);
    }
    line(`\nTOTAL institutions rows: ${inst.data.length}`);
  }

  hr('B. Legacy admin tables (what Entity Management writes to) — existence + counts');
  for (const tbl of ['parishes', 'diocesan_schools', 'seminaries']) {
    const r = await sb.from(tbl).select('id, name', { count: 'exact' }).limit(100);
    if (r.error) line(`public.${tbl}: NOT USABLE (${r.error.code || ''} ${r.error.message})`);
    else {
      line(`public.${tbl}: ${r.count} row(s)`);
      for (const x of (r.data || [])) line(`   - ${x.name} | id=${x.id}`);
    }
  }

  hr('C. Look for the schools/seminaries from the bug report across BOTH registries');
  for (const name of ['Canossa College San Pablo', 'San Pablo Theological Formation Center', "St. Peter's College Seminary"]) {
    const i = await d().from('institutions').select('id, institution_type, is_active, deleted_at').eq('name', name);
    line(`"${name}" in diocese.institutions: ${i.error ? 'ERR ' + i.error.message : (i.data.length ? JSON.stringify(i.data) : 'NOT FOUND')}`);
  }

  // ── D. PROFILES columns + onboarding data (Phase 2.6) ─────────────────────
  hr('D. diocese.profiles — do birthday / onboarding_completed columns exist?');
  for (const col of ['birthday', 'onboarding_completed', 'avatar_url']) {
    const r = await d().from('profiles').select(col).limit(1);
    line(`column "${col}": ${r.error ? 'MISSING / not selectable -> ' + r.error.message : 'EXISTS'}`);
  }
  const prof = await d().from('profiles').select('*').limit(1);
  line('\nSample profiles row columns: ' + (prof.error ? 'ERR ' + prof.error.message : Object.keys(prof.data?.[0] || {}).join(', ') || '(no rows)'));

  hr('E. Onboarded test account (Parvs Obni) — auth metadata vs profile');
  const usersRes = await sb.auth.admin.listUsers({ perPage: 1000 });
  const users = (usersRes.data?.users || []).filter(u => /obni|parvs/i.test((u.email || '') + JSON.stringify(u.user_metadata || {})));
  if (!users.length) line('No matching auth user found for obni/parvs.');
  for (const u of users) {
    const m = u.user_metadata || {};
    line(`\nAUTH: ${u.email} | id=${u.id}`);
    line(`   onboardingCompleted(meta)=${m.onboardingCompleted} | birthday(meta)=${m.birthday ?? m.birth_date} | role=${m.role}`);
    const p = await d().from('profiles').select('*').eq('external_auth_id', u.id).maybeSingle();
    line('   PROFILE: ' + (p.error ? 'ERR ' + p.error.message : JSON.stringify(p.data)));
  }

  // ── F. RBAC — roles & the Priest Simulator permission (Phase 1.2) ──────────
  hr('F. RBAC: roles, the simulator permission, and which roles grant it');
  const roles = await d().from('roles').select('id, name, is_predefined').is('deleted_at', null).order('name');
  line('ROLES: ' + (roles.error ? 'ERR ' + roles.error.message : ''));
  for (const r of (roles.data || [])) line(`   ${r.id} | ${r.name} | predefined=${r.is_predefined}`);

  const perms = await d().from('permissions').select('id, name, category').is('deleted_at', null);
  const simPerms = (perms.data || []).filter(p => /simul/i.test(p.id + p.name));
  line('\nSIMULATOR-RELATED PERMISSIONS: ' + (perms.error ? 'ERR ' + perms.error.message : ''));
  for (const p of simPerms) line(`   ${p.id} | ${p.name} | ${p.category}`);

  if (simPerms.length) {
    const ids = simPerms.map(p => p.id);
    const rp = await d().from('role_permissions').select('role_id, permission_id, granted').in('permission_id', ids);
    const roleName = Object.fromEntries((roles.data || []).map(r => [r.id, r.name]));
    line('\nROLE x SIMULATOR grants:');
    for (const r of (rp.data || [])) line(`   ${roleName[r.role_id] || r.role_id} -> ${r.permission_id} = ${r.granted ? 'GRANTED' : 'denied'}`);
  }

  line('\n\n=== END OF DIAGNOSTIC ===');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
