// Diagnostic: dump diocese.announcements rows and re-run the exact "active board" query
// the announcement service uses, to see why /api/announcements returns [].
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
if (!url || !key) {
  console.log('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  const all = await supabase.schema('diocese').from('announcements').select('*').order('created_at', { ascending: false });
  if (all.error) {
    console.log('RAW SELECT ERROR:', all.error.message);
    return;
  }
  console.log(`Total rows: ${all.data.length}`);
  for (const r of all.data) {
    console.log(`- [${r.status}] "${r.title}" start_date=${r.start_date} end_date=${r.end_date} published_at=${r.published_at} deleted_at=${r.deleted_at} created_at=${r.created_at}`);
  }

  const now = new Date().toISOString();
  console.log(`\nNow (UTC): ${now}`);
  const active = await supabase
    .schema('diocese')
    .from('announcements')
    .select('*')
    .eq('status', 'active')
    .lte('start_date', now)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (active.error) console.log('ACTIVE QUERY ERROR:', active.error.message);
  else console.log(`Active-board query returns: ${active.data.length} row(s)`);
})();
