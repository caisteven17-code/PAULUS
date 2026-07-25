// Diagnostic: inspect diocese.audit_logs actual state (columns + bad rows).
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
const supabase = createClient(url, key);
const d = () => supabase.schema('diocese');

async function columnExists(table, col) {
  const res = await d().from(table).select(col).limit(1);
  return !res.error;
}

(async () => {
  console.log('=== audit_logs column probe ===');
  const cols = ['id', 'user_id', 'user_name', 'user_role', 'role', 'institution_id',
                'entity', 'category', 'severity', 'action', 'detail', 'is_system',
                'metadata', 'ip_address', 'log_reference', 'created_at', 'occurred_at', 'deleted_at'];
  const present = {};
  for (const c of cols) present[c] = await columnExists('audit_logs', c);
  console.log(Object.entries(present).map(([c, ok]) => `${ok ? '✓' : '✗'} ${c}`).join('\n'));

  const orderCol = present.occurred_at ? 'occurred_at' : present.created_at ? 'created_at' : 'id';

  console.log('\n=== sample rows (latest 12) ===');
  const sel = ['id', 'user_id', 'user_name', 'user_role', 'institution_id', 'entity', 'category', 'action']
    .filter((c) => present[c]).join(', ');
  const { data: rows, error } = await d().from('audit_logs').select(sel).order(orderCol, { ascending: false }).limit(12);
  if (error) { console.log('ERROR:', error.message); return; }
  for (const r of rows) {
    console.log(`${(r.action || '').padEnd(22)} | uid=${(r.user_id || 'NULL').toString().slice(0, 8).padEnd(8)} | inst=${(r.institution_id || 'NULL').toString().slice(0, 8).padEnd(8)} | entity=${r.entity || 'NULL'} | name=${r.user_name} | role=${r.user_role || 'NULL'}`);
  }

  console.log('\n=== bad-row counts ===');
  const all = await d().from('audit_logs').select('user_id, institution_id, entity', { count: 'exact' });
  if (all.error) { console.log('ERROR:', all.error.message); return; }
  const data = all.data || [];
  const nullUser = data.filter((r) => !r.user_id).length;
  const nullInst = data.filter((r) => !r.institution_id).length;
  const genericEntity = data.filter((r) => ['event', 'events', 'announcement', 'announcements'].includes(String(r.entity || '').toLowerCase())).length;
  console.log(`total rows:            ${data.length}`);
  console.log(`user_id NULL:          ${nullUser}`);
  console.log(`institution_id NULL:   ${nullInst}`);
  console.log(`generic entity label:  ${genericEntity}`);

  // How many of the null/generic ones are *resolvable*?
  console.log('\n=== resolvability of broken rows ===');
  const { data: profs } = await d().from('profiles').select('id, external_auth_id, full_name, email, role_id, institution_id');
  const { data: insts } = await d().from('institutions').select('id, name');
  const profById = new Map((profs || []).map((p) => [p.id, p]));
  const profByExt = new Map((profs || []).filter((p) => p.external_auth_id).map((p) => [p.external_auth_id, p]));
  const profByEmail = new Map((profs || []).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const instByName = new Map((insts || []).filter((i) => i.name).map((i) => [i.name.toLowerCase(), i]));

  const full = await d().from('audit_logs').select('user_id, user_name, institution_id, entity');
  let userIdIsExternal = 0, userIdResolvableByEmail = 0, userIdOrphan = 0, instResolvable = 0;
  for (const r of full.data || []) {
    if (r.user_id && !profById.has(r.user_id)) {
      if (profByExt.has(r.user_id)) userIdIsExternal++;
      else userIdOrphan++;
    }
    if (!r.user_id && r.user_name && profByEmail.has(String(r.user_name).toLowerCase())) userIdResolvableByEmail++;
    if (!r.institution_id && r.entity && instByName.has(String(r.entity).toLowerCase())) instResolvable++;
  }
  console.log(`user_id is actually an external_auth_id: ${userIdIsExternal} (would BREAK a FK)`);
  console.log(`user_id orphan (no profile match):       ${userIdOrphan} (would BREAK a FK)`);
  console.log(`null user_id resolvable via email:       ${userIdResolvableByEmail}`);
  console.log(`null institution_id resolvable via name: ${instResolvable}`);
  console.log(`profiles: ${(profs || []).length}, institutions: ${(insts || []).length}`);
})();
