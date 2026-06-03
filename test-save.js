const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
const supabase = createClient(url, serviceRole);

// Mock roles payload from the frontend Settings.tsx
const mockRolesList = [
  {
    id: 'bishop',
    name: 'Bishop',
    color: '#D4AF37',
    is_predefined: true,
    permissions: {
      view_diocese: true,
      download_csv: true,
      upload_csv_admin: true,
      upload_csv_entity: true,
      create_users: true,
      manage_roles: true,
      digital_twin: true,
      manage_entities: true,
      manage_projects: true,
      view_projects: true,
      manage_announcements: true,
      view_announcements: true,
      view_priests: true,
      manage_assignments: true,
      view_audit_logs: true
    }
  },
  {
    id: 'custom_role_test',
    name: 'Custom Test Role',
    color: '#FF5733',
    is_predefined: false,
    permissions: {
      view_parish: true,
      download_csv: true,
      view_projects: true
    }
  }
];

async function run() {
  try {
    console.log("Starting mock saveRoles database operation...");
    
    // 1. Get current roles in the DB
    const { data: dbRoles, error: rolesError } = await supabase.from('roles').select('*');
    if (rolesError) throw rolesError;

    const payloadIds = new Set(mockRolesList.map(r => r.id));
    
    // Delete any roles in the database that are NOT predefined and are not in the new roles payload
    const rolesToDelete = (dbRoles ?? []).filter(r => !r.is_predefined && !payloadIds.has(r.id));
    console.log("Roles to delete:", rolesToDelete.map(r => r.id));
    
    for (const role of rolesToDelete) {
      const { error: delErr } = await supabase.from('roles').delete().eq('id', role.id);
      if (delErr) {
        console.error(`Error deleting role ${role.id}:`, delErr);
        throw delErr;
      }
    }

    // 2. Upsert custom roles and synchronize permissions
    for (const role of mockRolesList) {
      if (!role.is_predefined) {
        console.log(`Upserting role: ${role.id} (${role.name})...`);
        const { error: upsertErr } = await supabase
          .from('roles')
          .upsert({
            id: role.id,
            name: role.name,
            color: role.color,
            is_predefined: false,
            updated_at: new Date().toISOString(),
          });
        if (upsertErr) {
          console.error(`Error upserting role ${role.id}:`, upsertErr);
          throw upsertErr;
        }
      }

      console.log(`Clearing role_permissions for: ${role.id}...`);
      const { error: delPermsErr } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', role.id);
      
      if (delPermsErr) {
        console.error(`Error deleting permissions for role ${role.id}:`, delPermsErr);
        throw delPermsErr;
      }

      const activeKeys = Object.entries(role.permissions ?? {})
        .filter(([_, val]) => val === true)
        .map(([key]) => ({
          role_id: role.id,
          permission_id: key,
        }));

      console.log(`Inserting ${activeKeys.length} permissions for: ${role.id}...`);
      if (activeKeys.length > 0) {
        const { error: insertPermErr } = await supabase
          .from('role_permissions')
          .insert(activeKeys);
        if (insertPermErr) {
          console.error(`Error inserting permissions for role ${role.id}:`, insertPermErr);
          throw insertPermErr;
        }
      }
    }

    console.log("SUCCESS: Mock saveRoles complete!");
  } catch (err) {
    console.error("FAILURE: saveRoles failed with error:", err);
  }
}

run();
