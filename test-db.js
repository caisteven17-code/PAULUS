const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic parser for .env file since dotenv might not be in root
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.trim();
    }
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Missing environment variables!");
  console.log("URL:", url);
  console.log("Key exists:", !!serviceRole);
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

async function run() {
  console.log("Testing Supabase connection...");
  
  console.log("\n1. Fetching roles...");
  const { data: roles, error: rolesErr } = await supabase.from('roles').select('*');
  if (rolesErr) {
    console.error("Roles Error:", rolesErr);
  } else {
    console.log("Roles count:", roles.length);
    console.log("Sample roles:", roles.slice(0, 3));
  }

  console.log("\n2. Fetching permissions...");
  const { data: perms, error: permsErr } = await supabase.from('permissions').select('*');
  if (permsErr) {
    console.error("Permissions Error:", permsErr);
  } else {
    console.log("Permissions count:", perms.length);
    console.log("Sample permissions:", perms.slice(0, 3));
  }

  console.log("\n3. Fetching role_permissions...");
  const { data: rolePerms, error: rolePermsErr } = await supabase.from('role_permissions').select('*');
  if (rolePermsErr) {
    console.error("Role-Permissions Error:", rolePermsErr);
  } else {
    console.log("Role-Permissions count:", rolePerms.length);
    console.log("Sample role-permissions:", rolePerms.slice(0, 3));
  }
}

run();
