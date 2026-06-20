// Phase 1.1 + 2.6 BACKFILL. Idempotent — safe to run more than once.
// 1) Ensures every intended seminary/school exists in diocese.institutions so
//    school/seminary users can save events/projects and Entity Management,
//    homepage counts, and Add-User dropdowns all agree (single source of truth).
// 2) Reconciles diocese.profiles (birthday + onboarding_completed) from auth
//    metadata for users whose onboarding wrote to auth but not their profile.
//
// Run from the PAULUS folder:  node backfill-phase12.js
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

// Intended institutions (mirrors src/backend/src/constants.ts). class -> letter.
const SEMINARIES = [
  { name: "St. Peter's College Seminary",            vicariate: 'San Pablo', class: 'A', address: 'San Pablo City, Laguna' },
  { name: 'San Pablo Theological Formation Center',  vicariate: 'San Pablo', class: 'B', address: 'San Pablo City, Laguna' },
];
const SCHOOLS = [
  { name: 'Liceo de San Pablo',          cluster: '1', class: 'A', address: 'San Pablo City, Laguna' },
  { name: 'Canossa College San Pablo',   cluster: '2', class: 'B', address: 'San Pablo City, Laguna' },
];

async function ensureInstitution(type, row) {
  const existing = await d().from('institutions').select('id, deleted_at')
    .eq('name', row.name).eq('institution_type', type).limit(1).maybeSingle();
  if (existing.data?.id && !existing.data.deleted_at) {
    console.log(`  = exists: ${type} "${row.name}"`);
    return;
  }
  if (existing.data?.id && existing.data.deleted_at) {
    const { error } = await d().from('institutions').update({ deleted_at: null, is_active: true }).eq('id', existing.data.id);
    console.log(error ? `  ! restore failed "${row.name}": ${error.message}` : `  ^ restored archived: ${type} "${row.name}"`);
    return;
  }
  const payload = { name: row.name, institution_type: type, class: row.class, address: row.address, is_active: true };
  if (type === 'seminary') payload.vicariate = row.vicariate;
  if (type === 'school') payload.cluster = row.cluster;
  const { data, error } = await d().from('institutions').insert(payload).select('id, institution_code').single();
  console.log(error ? `  ! insert failed "${row.name}": ${error.code} ${error.message}` : `  + added: ${type} "${row.name}" (${data.institution_code})`);
}

(async () => {
  console.log('STEP 1 — Backfill seminaries/schools into diocese.institutions');
  for (const s of SEMINARIES) await ensureInstitution('seminary', s);
  for (const s of SCHOOLS) await ensureInstitution('school', s);

  console.log('\nSTEP 2 — Reconcile profiles (birthday + onboarding_completed) from auth metadata');
  const usersRes = await sb.auth.admin.listUsers({ perPage: 1000 });
  let fixed = 0;
  for (const u of usersRes.data?.users ?? []) {
    const meta = u.user_metadata ?? {};
    const metaOnboarded = meta.onboardingCompleted === true || meta.onboarding_completed === true;
    const metaBirthday = meta.birthday ?? meta.birth_date ?? null;
    if (!metaOnboarded && !metaBirthday) continue;
    const p = await d().from('profiles').select('id, birthday, onboarding_completed').eq('external_auth_id', u.id).maybeSingle();
    if (!p.data?.id) continue;
    const patch = {};
    if (metaOnboarded && p.data.onboarding_completed !== true) patch.onboarding_completed = true;
    if (metaBirthday && !p.data.birthday) patch.birthday = metaBirthday;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await d().from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', p.data.id);
    if (error) console.log(`  ! ${u.email}: ${error.message}`);
    else { console.log(`  ~ reconciled ${u.email}: ${JSON.stringify(patch)}`); fixed++; }
  }
  console.log(`  profiles reconciled: ${fixed}`);

  console.log('\nDONE. Re-run node diag-phase12.js to confirm.');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
