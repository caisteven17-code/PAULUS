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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables!");
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

const TARGET_ROLE_PERMISSIONS = {
  bishop: [
    'view_diocese', 'download_csv', 'upload_csv_admin', 'upload_csv_entity',
    'create_users', 'manage_roles', 'digital_twin', 'manage_entities',
    'manage_projects', 'manage_announcements', 'view_priests', 'manage_assignments',
    'view_audit_logs', 'view_parish_dashboard', 'view_seminary_dashboard', 'view_school_dashboard'
  ],
  chancellor: [
    'view_diocese', 'manage_announcements', 'view_priests', 'manage_assignments'
  ],
  diocesan_oeconomus: [
    'view_diocese', 'download_csv', 'upload_csv_admin', 'upload_csv_entity',
    'create_users', 'manage_roles', 'digital_twin', 'manage_entities',
    'manage_projects', 'manage_announcements', 'view_priests', 'manage_assignments',
    'view_audit_logs', 'view_parish_dashboard', 'view_seminary_dashboard', 'view_school_dashboard'
  ],
  finance_staff: [
    'view_diocese', 'download_csv', 'upload_csv_admin', 'upload_csv_entity',
    'manage_projects', 'view_announcements', 'view_priests',
    'view_parish_dashboard', 'view_seminary_dashboard', 'view_school_dashboard'
  ],
  parish_priest: [
    'view_parish', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_priests', 'manage_assignments', 'view_parish_dashboard'
  ],
  parish_secretary: [
    'view_parish', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_parish_dashboard'
  ],
  seminary_rector: [
    'view_seminary', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_priests', 'manage_assignments', 'view_seminary_dashboard'
  ],
  seminary_oeconomus: [
    'view_seminary', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_seminary_dashboard'
  ],
  school_superintendent: [
    'view_school_all', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_school_dashboard'
  ],
  finance_supervisor: [
    'view_school_cluster', 'download_csv', 'upload_csv_entity', 'view_projects',
    'view_announcements', 'view_school_dashboard'
  ],
  finance_officer: [
    'view_school', 'download_csv', 'upload_csv_entity', 'manage_projects',
    'view_announcements', 'view_school_dashboard'
  ],
  school_principal: [
    'view_school', 'view_projects', 'view_announcements', 'view_school_dashboard'
  ]
};

async function run() {
  console.log("Starting Predefined Roles Permissions database sync...");
  
  const roleIds = Object.keys(TARGET_ROLE_PERMISSIONS);
  
  // 1. Delete existing entries in role_permissions table for these predefined roles
  console.log("1. Cleaning up existing permissions for predefined roles in database...");
  const { error: deleteErr } = await supabase
    .from('role_permissions')
    .delete()
    .in('role_id', roleIds);
    
  if (deleteErr) {
    console.error("Error deleting old permissions:", deleteErr);
    process.exit(1);
  }
  console.log("Successfully cleaned up old permissions.");
  
  // 2. Prepare new records
  const recordsToInsert = [];
  for (const roleId of roleIds) {
    const permissions = TARGET_ROLE_PERMISSIONS[roleId];
    for (const permId of permissions) {
      recordsToInsert.push({
        role_id: roleId,
        permission_id: permId
      });
    }
  }
  
  // 3. Batch insert new records
  console.log(`2. Inserting ${recordsToInsert.length} updated permission mapping records...`);
  const { error: insertErr } = await supabase
    .from('role_permissions')
    .insert(recordsToInsert);
    
  if (insertErr) {
    console.error("Error inserting updated permissions:", insertErr);
    process.exit(1);
  }
  
  console.log("Database Sync Completed Successfully!");
}

run();
