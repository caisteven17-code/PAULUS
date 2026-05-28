import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuthUser, AppRole } from '../types';

@Injectable()
export class AppAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private mapSupabaseUser(supabaseUser: any): AuthUser {
    const meta = supabaseUser.user_metadata ?? supabaseUser.raw_user_meta_data ?? {};
    return {
      id:          supabaseUser.id,
      uid:         supabaseUser.id,
      email:       supabaseUser.email ?? '',
      role:        (meta.role as AppRole) ?? 'bishop',
      accessRole:  meta.role,
      roleId:      meta.role,
      entityId:    meta.entityId    ?? meta.entity_id    ?? undefined,
      entityName:  meta.entityName  ?? meta.entity_name  ?? undefined,
      entityType:  meta.entityType  ?? meta.entity_type  ?? undefined,
      displayName: meta.displayName ?? meta.display_name ?? supabaseUser.email ?? '',
      status:      'active',
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
      user:  this.mapSupabaseUser(data.user),
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
    return (data.users ?? []).map(u => {
      const meta = u.user_metadata ?? {};
      return {
        id:          u.id,
        email:       u.email ?? '',
        displayName: (meta.displayName ?? meta.display_name ?? u.email ?? '') as string,
        role:        (meta.role ?? 'parish_priest') as string,
        roleId:      (meta.role ?? 'parish_priest') as string,
        entityName:  (meta.entityName  ?? meta.entity_name  ?? '') as string,
        entityType:  (meta.entityType  ?? meta.entity_type  ?? 'parish') as string,
        entityId:    (meta.entityId    ?? meta.entity_id    ?? '') as string,
        status:      u.banned_until ? 'archived' : ((meta.status ?? 'active') as string),
        createdAt:   u.created_at ?? null,
        lastSignIn:  u.last_sign_in_at ?? null,
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
        role:        role       ?? 'parish_priest',
        entityName:  entityName ?? '',
        entityType:  entityType ?? 'parish',
        entityId:    entityId   ?? '',
        status:      'active',
      },
      email_confirm: true,
    });
    if (error) throw error;
    return {
      id:          data.user.id,
      email:       data.user.email ?? '',
      displayName: (data.user.user_metadata?.displayName ?? data.user.email ?? '') as string,
      role:        (data.user.user_metadata?.role ?? 'parish_priest') as string,
      roleId:      (data.user.user_metadata?.role ?? 'parish_priest') as string,
      entityName:  (data.user.user_metadata?.entityName ?? '') as string,
      entityType:  (data.user.user_metadata?.entityType ?? 'parish') as string,
      entityId:    (data.user.user_metadata?.entityId ?? '') as string,
      status:      'active',
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
    const meta = data.user.user_metadata ?? {};
    return {
      id:          data.user.id,
      email:       data.user.email ?? '',
      displayName: (meta.displayName ?? data.user.email ?? '') as string,
      role:        (meta.role ?? 'parish_priest') as string,
      roleId:      (meta.role ?? 'parish_priest') as string,
      entityName:  (meta.entityName ?? '') as string,
      entityType:  (meta.entityType ?? 'parish') as string,
      entityId:    (meta.entityId ?? '') as string,
      status:      data.user.banned_until ? 'archived' : ((meta.status ?? 'active') as string),
    };
  }

  async deleteUser(id: string, action: 'archive' | 'restore') {
    if (action === 'archive') {
      const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(id, {
        user_metadata: { status: 'archived' },
        ban_duration:  '876600h', // ~100 years
      });
      if (error) throw error;
      const meta = data.user.user_metadata ?? {};
      return {
        id:          data.user.id,
        email:       data.user.email ?? '',
        displayName: (meta.displayName ?? data.user.email ?? '') as string,
        role:        (meta.role ?? 'parish_priest') as string,
        roleId:      (meta.role ?? 'parish_priest') as string,
        entityName:  (meta.entityName ?? '') as string,
        entityType:  (meta.entityType ?? 'parish') as string,
        entityId:    (meta.entityId ?? '') as string,
        status:      'archived',
      };
    }

    if (action === 'restore') {
      const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(id, {
        user_metadata: { status: 'active' },
        ban_duration:  'none',
      });
      if (error) throw error;
      const meta = data.user.user_metadata ?? {};
      return {
        id:          data.user.id,
        email:       data.user.email ?? '',
        displayName: (meta.displayName ?? data.user.email ?? '') as string,
        role:        (meta.role ?? 'parish_priest') as string,
        roleId:      (meta.role ?? 'parish_priest') as string,
        entityName:  (meta.entityName ?? '') as string,
        entityType:  (meta.entityType ?? 'parish') as string,
        entityId:    (meta.entityId ?? '') as string,
        status:      'active',
      };
    }
    throw new Error(`Unknown action: ${action}`);
  }

  async listRoles() {
    const { data: rolesData, error: rolesError } = await this.supabaseService.supabaseServer
      .from('roles')
      .select('*')
      .order('is_predefined', { ascending: false })
      .order('name');
    
    if (rolesError) throw rolesError;

    const { data: permsData, error: permsError } = await this.supabaseService.supabaseServer
      .from('role_permissions')
      .select('*');

    if (permsError) throw permsError;

    return (rolesData ?? []).map(role => {
      const permissions: Record<string, boolean> = {};
      const permissionKeys = [
        'view_diocese', 'view_parish', 'view_seminary', 'view_school', 
        'view_school_cluster', 'view_school_all', 'download_csv', 
        'upload_csv_admin', 'upload_csv_entity', 'create_users', 
        'manage_roles', 'digital_twin', 'manage_entities', 
        'manage_projects', 'view_projects', 'manage_announcements', 
        'view_announcements', 'view_priests', 'manage_assignments', 
        'view_audit_logs', 'view_parish_dashboard', 'view_seminary_dashboard', 
        'view_school_dashboard'
      ];
      
      permissionKeys.forEach(k => {
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
    const { data: dbRoles, error: rolesError } = await this.supabaseService.supabaseServer
      .from('roles')
      .select('*');
    if (rolesError) throw rolesError;

    const payloadIds = new Set(rolesList.map(r => r.id));
    
    const rolesToDelete = (dbRoles ?? []).filter(r => !r.is_predefined && !payloadIds.has(r.id));
    for (const role of rolesToDelete) {
      await this.supabaseService.supabaseServer
        .from('roles')
        .delete()
        .eq('id', role.id);
    }

    for (const role of rolesList) {
      if (!role.is_predefined) {
        const { error: upsertErr } = await this.supabaseService.supabaseServer
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

      await this.supabaseService.supabaseServer
        .from('role_permissions')
        .delete()
        .eq('role_id', role.id);

      const activeKeys = Object.entries(role.permissions ?? {})
        .filter(([_, val]) => val === true)
        .map(([key]) => ({
          role_id: role.id,
          permission_id: key,
        }));

      if (activeKeys.length > 0) {
        const { error: insertPermErr } = await this.supabaseService.supabaseServer
          .from('role_permissions')
          .insert(activeKeys);
        if (insertPermErr) throw insertPermErr;
      }
    }

    return { ok: true };
  }
}
