// Diagnostic: check whether migration 194 (pinned columns) has been applied.
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
  const res = await supabase.schema('diocese').from('announcements').select('id, pinned').limit(1);
  if (res.error) {
    console.log('PINNED COLUMN MISSING (migration 194 not applied):', res.error.message);
  } else {
    console.log('Migration 194 already applied — pinned column exists.');
  }
})();
