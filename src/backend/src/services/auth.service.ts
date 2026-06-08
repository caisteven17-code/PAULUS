import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuthUser, AppRole } from '../types';

const ROLE_PERMISSION_DEFINITIONS = [
  {
    id: 'view_diocese',
    name: 'Diocesan Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view all records across the entire diocese.',
  },
  {
    id: 'view_parish',
    name: 'Parish Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view records specific to their assigned parish.',
  },
  {
    id: 'view_seminary',
    name: 'Seminary Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view records specific to their assigned seminary.',
  },
  {
    id: 'view_school',
    name: 'School Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view records specific to their assigned school.',
  },
  {
    id: 'view_school_cluster',
    name: 'Cluster School Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view assigned cluster schools.',
  },
  {
    id: 'view_school_all',
    name: 'All Schools Level',
    category: 'Viewing Permissions',
    description: 'Allows the user to view all schools in the diocese.',
  },
  {
    id: 'download_csv',
    name: 'Download CSV Templates',
    category: 'Data Management',
    description: 'Allows the user to download blank CSV templates for data entry.',
  },
  {
    id: 'upload_csv_admin',
    name: 'Upload Master CSV',
    category: 'Data Management',
    description: 'Allows the user to upload and process master CSV templates for the diocese.',
  },
  {
    id: 'upload_csv_entity',
    name: 'Upload Entity CSV',
    category: 'Data Management',
    description: 'Allows the user to upload updated CSVs for their specific entity.',
  },
  {
    id: 'create_users',
    name: 'Create User Accounts',
    category: 'User Management',
    description: 'Allows the user to create new accounts for other personnel.',
  },
  {
    id: 'manage_roles',
    name: 'Manage User Roles',
    category: 'User Management',
    description: 'Allows the user to modify role permissions and assign roles to users.',
  },
  {
    id: 'digital_twin',
    name: 'Digital Twin',
    category: 'Digital Twin',
    description: 'Allows the user to launch scenario simulations and mirror other institution dashboards.',
  },
  {
    id: 'manage_entities',
    name: 'Manage Entity Management',
    category: 'Entity Management',
    description: 'Allows the user to manage and configure diocesan institutions, parishes, schools, and seminaries.',
  },
  {
    id: 'manage_projects',
    name: 'Manage Projects',
    category: 'Projects',
    description: 'Allows the user to create, edit, and manage projects.',
  },
  {
    id: 'view_projects',
    name: 'View Projects Only',
    category: 'Projects',
    description: 'Allows the user to view project lists and details without administrative modifications.',
  },
  {
    id: 'manage_announcements',
    name: 'Manage Announcements',
    category: 'Announcements',
    description: 'Allows the user to create, edit, and publish announcements across the diocese.',
  },
  {
    id: 'view_announcements',
    name: 'View Announcements Only',
    category: 'Announcements',
    description: 'Allows the user to view announcements and news bulletins without publishing rights.',
  },
  {
    id: 'view_priests',
    name: 'Priest Profiles & Dashboard',
    category: 'Priest Management',
    description: 'Allows the user to view priest health trackers, assignments, and personnel dashboards.',
  },
  {
    id: 'manage_assignments',
    name: 'Priest Assignment Simulator',
    category: 'Priest Management',
    description: 'Allows the user to launch scenario planning and simulate clergy assignments.',
  },
  {
    id: 'view_audit_logs',
    name: 'View Audit Logs',
    category: 'User Management',
    description: 'Allows the user to view administrative action audit logs.',
  },
  {
    id: 'view_parish_dashboard',
    name: 'Parish Dashboard',
    category: 'Dashboard Access',
    description: 'Allows the user to access parish dashboards.',
  },
  {
    id: 'view_seminary_dashboard',
    name: 'Seminary Dashboard',
    category: 'Dashboard Access',
    description: 'Allows the user to access seminary dashboards.',
  },
  {
    id: 'view_school_dashboard',
    name: 'School Dashboard',
    category: 'Dashboard Access',
    description: 'Allows the user to access school dashboards.',
  },
  {
    id: 'manage_own_institution',
    name: 'Manage Own Institution',
    category: 'Entity Management',
    description: 'Allows the user to update their assigned institution profile.',
  },
] as const;

@Injectable()
export class AppAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private isUuid(value?: string): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private domainInstitutionType(entityType?: string): string | null {
    if (entityType === 'parish' || entityType === 'school' || entityType === 'seminary') return entityType;
    if (entityType === 'diocese') return 'chancery';
    return null;
  }

  private async resolveInstitutionId(
    entityId?: string,
    entityName?: string,
    entityType?: string,
  ): Promise<string | null> {
    const institutions = this.supabaseService.admin.schema('diocese').from('institutions');

    if (this.isUuid(entityId)) {
      const { data } = await institutions.select('id').eq('id', entityId).maybeSingle();
      if (data?.id) return data.id;
    }

    if (!entityName) return null;

    const institutionType = this.domainInstitutionType(entityType);
    let query = this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id')
      .eq('name', entityName)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (institutionType) query = query.eq('institution_type', institutionType);

    const { data } = await query.maybeSingle();
    if (data?.id) return data.id;

    const fallback = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id')
      .eq('name', entityName)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    return fallback.data?.id ?? null;
  }

  private async upsertDioceseProfile(userId: string, body: any, fallbackEmail?: string): Promise<void> {
    const email = body.email ?? fallbackEmail ?? '';
    const roleId = body.role ?? 'parish_priest';
    const fullName = body.displayName ?? email.split('@')[0] ?? '';
    const institutionId = await this.resolveInstitutionId(body.entityId, body.entityName, body.entityType);

    const { error } = await this.supabaseService.admin.schema('diocese').from('profiles').upsert(
      {
        external_auth_id: userId,
        full_name: fullName,
        email,
        role_id: roleId,
        institution_id: institutionId,
        is_active: true,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'external_auth_id' },
    );

    if (!error) return;

    // '23503' = foreign_key_violation — role_id not found in diocese.roles (roles not seeded yet).
    // Retry with no role so the profile row still lands in the DB; role can be fixed once roles are seeded.
    if (error.code === '23503') {
      const { error: retryError } = await this.supabaseService.admin.schema('diocese').from('profiles').upsert(
        {
          external_auth_id: userId,
          full_name: fullName,
          email,
          role_id: null,
          institution_id: institutionId,
          is_active: false, // CHECK constraint requires is_active=false when role_id is null
          deleted_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'external_auth_id' },
      );
      if (retryError) throw retryError;
      return;
    }

    throw error;
  }

  private mapSupabaseUser(supabaseUser: any): AuthUser {
    const meta = supabaseUser.user_metadata ?? supabaseUser.raw_user_meta_data ?? {};
    return {
      id: supabaseUser.id,
      uid: supabaseUser.id,
      email: supabaseUser.email ?? '',
      role: (meta.role as AppRole) ?? 'bishop',
      accessRole: meta.role,
      roleId: meta.role,
      entityId: meta.entityId ?? meta.entity_id ?? undefined,
      entityName: meta.entityName ?? meta.entity_name ?? undefined,
      entityType: meta.entityType ?? meta.entity_type ?? undefined,
      displayName: meta.displayName ?? meta.display_name ?? supabaseUser.email ?? '',
      status: 'active',
    };
  }

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
    const { data, error } = await this.supabaseService.supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) return null;
    return {
      token: data.session.access_token,
      user: this.mapSupabaseUser(data.user),
    };
  }

  async logout(token: string): Promise<void> {
    const { error } = await this.supabaseService.supabaseBrowser.auth.signOut();
    if (error) console.error('[auth.service] logout error:', error.message);
  }

  async getSession(token: string): Promise<AuthUser | null> {
    const { data, error } = await this.supabaseService.supabaseServer.auth.getUser(token);
    if (error || !data.user) return null;
    return this.mapSupabaseUser(data.user);
  }

  async listUsers() {
    const { data, error } = await this.supabaseService.supabaseServer.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return (data.users ?? []).map((u) => {
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email: u.email ?? '',
        displayName: (meta.displayName ?? meta.display_name ?? u.email ?? '') as string,
        role: (meta.role ?? 'parish_priest') as string,
        roleId: (meta.role ?? 'parish_priest') as string,
        entityName: (meta.entityName ?? meta.entity_name ?? '') as string,
        entityType: (meta.entityType ?? meta.entity_type ?? 'parish') as string,
        entityId: (meta.entityId ?? meta.entity_id ?? '') as string,
        status: u.banned_until ? 'archived' : ((meta.status ?? 'active') as string),
        createdAt: u.created_at ?? null,
        lastSignIn: u.last_sign_in_at ?? null,
      };
    });
  }

  async createUser(body: any) {
    const { email, password, displayName, role, entityName, entityType, entityId } = body;
    const { data, error } = await this.supabaseService.supabaseServer.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        displayName: displayName ?? email.split('@')[0],
        role: role ?? 'parish_priest',
        entityName: entityName ?? '',
        entityType: entityType ?? 'parish',
        entityId: entityId ?? '',
        status: 'active',
      },
      email_confirm: true,
    });
    if (error) throw error;

    try {
      await this.upsertDioceseProfile(data.user.id, { email, displayName, role, entityName, entityType, entityId });
    } catch (profileError) {
      // Log but do not roll back the auth user — the account exists and the user can log in.
      // The profile row can be repaired once the diocese schema/roles are seeded.
      console.error('[auth.service] Profile upsert failed for user', data.user.id, ':', (profileError as any)?.message ?? profileError);
    }

    return {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: (data.user.user_metadata?.displayName ?? data.user.email ?? '') as string,
      role: (data.user.user_metadata?.role ?? 'parish_priest') as string,
      roleId: (data.user.user_metadata?.role ?? 'parish_priest') as string,
      entityName: (data.user.user_metadata?.entityName ?? '') as string,
      entityType: (data.user.user_metadata?.entityType ?? 'parish') as string,
      entityId: (data.user.user_metadata?.entityId ?? '') as string,
      status: 'active',
    };
  }

  async updateUser(id: string, body: any) {
    const { email, displayName, role, entityName, entityType, entityId } = body;
    const updates: Record<string, any> = {
      user_metadata: { displayName, role, entityName, entityType, entityId },
    };
    if (email) updates.email = email;

    const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(id, updates);
    if (error) throw error;
    await this.upsertDioceseProfile(id, {
      email: data.user.email ?? email,
      displayName,
      role,
      entityName,
      entityType,
      entityId,
    });
    const meta = data.user.user_metadata ?? {};
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: (meta.displayName ?? data.user.email ?? '') as string,
      role: (meta.role ?? 'parish_priest') as string,
      roleId: (meta.role ?? 'parish_priest') as string,
      entityName: (meta.entityName ?? '') as string,
      entityType: (meta.entityType ?? 'parish') as string,
      entityId: (meta.entityId ?? '') as string,
      status: data.user.banned_until ? 'archived' : ((meta.status ?? 'active') as string),
    };
  }

  async deleteUser(id: string, action: 'archive' | 'restore') {
    if (action === 'archive') {
      const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(id, {
        user_metadata: { status: 'archived' },
        ban_duration: '876600h', // ~100 years
      });
      if (error) throw error;
      await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .update({ is_active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('external_auth_id', id);
      const meta = data.user.user_metadata ?? {};
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        displayName: (meta.displayName ?? data.user.email ?? '') as string,
        role: (meta.role ?? 'parish_priest') as string,
        roleId: (meta.role ?? 'parish_priest') as string,
        entityName: (meta.entityName ?? '') as string,
        entityType: (meta.entityType ?? 'parish') as string,
        entityId: (meta.entityId ?? '') as string,
        status: 'archived',
      };
    }

    if (action === 'restore') {
      const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(id, {
        user_metadata: { status: 'active' },
        ban_duration: 'none',
      });
      if (error) throw error;
      await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .update({ is_active: true, deleted_at: null, updated_at: new Date().toISOString() })
        .eq('external_auth_id', id);
      const meta = data.user.user_metadata ?? {};
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        displayName: (meta.displayName ?? data.user.email ?? '') as string,
        role: (meta.role ?? 'parish_priest') as string,
        roleId: (meta.role ?? 'parish_priest') as string,
        entityName: (meta.entityName ?? '') as string,
        entityType: (meta.entityType ?? 'parish') as string,
        entityId: (meta.entityId ?? '') as string,
        status: 'active',
      };
    }
    throw new Error(`Unknown action: ${action}`);
  }

  async listRoles() {
    const { data: rolesData, error: rolesError } = await this.supabaseService.admin
      .schema('diocese')
      .from('roles')
      .select('*')
      .order('is_predefined', { ascending: false })
      .order('name');

    if (rolesError) throw rolesError;

    const { data: permsData, error: permsError } = await this.supabaseService.admin
      .schema('diocese')
      .from('role_permissions')
      .select('*');

    if (permsError) throw permsError;

    return (rolesData ?? []).map((role) => {
      const permissions: Record<string, boolean> = {};
      const permissionKeys = ROLE_PERMISSION_DEFINITIONS.map((permission) => permission.id);

      permissionKeys.forEach((k) => {
        permissions[k] = false;
      });

      const activePerms = (permsData ?? []).filter((p: any) => p.role_id === role.id);
      activePerms.forEach((p: any) => {
        permissions[p.permission_id] = true;
      });

      return {
        id: role.id,
        name: role.name,
        color: role.color,
        permissions,
        is_predefined: role.is_predefined,
      };
    });
  }

  async saveRoles(rolesList: any[]) {
    const { error: permissionsUpsertError } = await this.supabaseService.admin
      .schema('diocese')
      .from('permissions')
      .upsert(ROLE_PERMISSION_DEFINITIONS, { onConflict: 'id' });
    if (permissionsUpsertError) throw permissionsUpsertError;

    const { data: dbPermissions, error: permissionsError } = await this.supabaseService.admin
      .schema('diocese')
      .from('permissions')
      .select('id');
    if (permissionsError) throw permissionsError;

    const validPermissionIds = new Set((dbPermissions ?? []).map((permission) => permission.id));

    const { data: dbRoles, error: rolesError } = await this.supabaseService.admin
      .schema('diocese')
      .from('roles')
      .select('*');
    if (rolesError) throw rolesError;

    const payloadIds = new Set(rolesList.map((r) => r.id));

    const rolesToDelete = (dbRoles ?? []).filter((r) => !r.is_predefined && !payloadIds.has(r.id));
    for (const role of rolesToDelete) {
      const { error: deleteRoleError } = await this.supabaseService.admin
        .schema('diocese')
        .from('roles')
        .delete()
        .eq('id', role.id);
      if (deleteRoleError) throw deleteRoleError;
    }

    for (const role of rolesList) {
      if (!role.is_predefined) {
        const { error: upsertErr } = await this.supabaseService.admin
          .schema('diocese')
          .from('roles')
          .upsert({
            id: role.id,
            name: role.name,
            color: role.color,
            is_predefined: false,
            updated_at: new Date().toISOString(),
          });
        if (upsertErr) throw upsertErr;
      }

      const { error: deletePermissionsError } = await this.supabaseService.admin
        .schema('diocese')
        .from('role_permissions')
        .delete()
        .eq('role_id', role.id);
      if (deletePermissionsError) throw deletePermissionsError;

      const activeKeys = Object.entries(role.permissions ?? {})
        .filter(([key, val]) => val === true && validPermissionIds.has(key))
        .map(([key]) => ({
          role_id: role.id,
          permission_id: key,
          granted: true,
        }));

      if (activeKeys.length > 0) {
        const { error: insertPermErr } = await this.supabaseService.admin
          .schema('diocese')
          .from('role_permissions')
          .insert(activeKeys);
        if (insertPermErr) throw insertPermErr;
      }
    }

    return { ok: true };
  }
}
