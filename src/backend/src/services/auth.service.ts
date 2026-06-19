import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { EmailService, OtpPurpose } from './email.service';
import { AuthUser, AppRole } from '../types';

const OTP_TTL_MS = 10 * 60 * 1000; // codes live 10 minutes
const OTP_RESEND_THROTTLE_MS = 55 * 1000; // server-side guard behind the 60s client timer
const OTP_VERIFIED_WINDOW_MS = 15 * 60 * 1000; // verified code usable for follow-up action

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
    id: 'validate_liturgical_calendar',
    name: 'Validate Liturgical Calendar',
    category: 'Data Management',
    description:
      'Allows the user to review imported liturgical calendar events — approving, revising, or rejecting dates before they are used by the system.',
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
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly emailService: EmailService,
  ) {}

  private isUuid(value?: string): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private domainInstitutionType(entityType?: string): string | null {
    if (entityType === 'parish' || entityType === 'school' || entityType === 'seminary') return entityType;
    if (entityType === 'diocese') return 'diocese';
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

  private profileCodePrefix(roleId: string): string {
    const map: Record<string, string> = {
      parish_priest: 'PR',
      bishop: 'BSH',
      seminary_rector: 'REC',
      admin: 'ADM',
      school_principal: 'SCH-ADM',
      finance_staff: 'FIN',
    };
    return map[roleId] ?? 'USR';
  }

  private async upsertDioceseProfile(userId: string, body: any, fallbackEmail?: string): Promise<void> {
    const email = body.email ?? fallbackEmail ?? '';
    const roleId = body.role ?? 'parish_priest';
    const fullName = body.displayName ?? email.split('@')[0] ?? '';
    const institutionId = await this.resolveInstitutionId(body.entityId, body.entityName, body.entityType);

    const profileFields = {
      full_name: fullName,
      email,
      role_id: roleId,
      institution_id: institutionId,
      is_active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };

    // ── Step 1: Try UPDATE first ──────────────────────────────────────────────
    // UPDATE never fires the BEFORE INSERT trigger (trg_profile_code), so it
    // never touches diocese.code_counters. This covers every edit of an
    // existing user and avoids the "permission denied" error entirely.
    const { data: updatedRows, error: updateErr } = await this.supabaseService.admin
      .schema('diocese')
      .from('profiles')
      .update(profileFields)
      .eq('external_auth_id', userId)
      .select('id');

    if (!updateErr && (updatedRows?.length ?? 0) > 0) return;

    // ── Step 2: Profile row doesn't exist yet — INSERT ────────────────────────
    // Migration 192 adds SECURITY DEFINER to the trigger functions so the
    // INSERT-triggered profile_code generation works for all callers.
    const { error: insertErr } = await this.supabaseService.admin
      .schema('diocese')
      .from('profiles')
      .insert({ external_auth_id: userId, ...profileFields });

    if (!insertErr) return;

    // ── Step 3: code_counters permission error (migration 192 not applied yet) ─
    // Bypass the trigger by supplying a placeholder profile_code so the
    // WHEN (NEW.profile_code IS NULL) condition is not met.
    const isPermErr =
      insertErr.code === '42501' ||
      insertErr.message?.toLowerCase().includes('code_counters') ||
      insertErr.message?.toLowerCase().includes('permission denied');

    if (isPermErr) {
      const placeholder = `${this.profileCodePrefix(roleId)}-TEMP-${userId.slice(0, 8).toUpperCase()}`;
      const { error: bypassErr } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .insert({ external_auth_id: userId, ...profileFields, profile_code: placeholder });
      if (!bypassErr) return;
      // FK violation on role_id with placeholder code
      if (bypassErr.code === '23503') {
        const { error: e } = await this.supabaseService.admin
          .schema('diocese')
          .from('profiles')
          .insert({ external_auth_id: userId, ...profileFields, role_id: null, is_active: false, profile_code: placeholder });
        if (e) throw e;
        return;
      }
      throw bypassErr;
    }

    // ── Step 4: FK violation on role_id (roles not yet seeded) ───────────────
    if (insertErr.code === '23503') {
      const { error: fkErr } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .insert({ external_auth_id: userId, ...profileFields, role_id: null, is_active: false });
      if (fkErr) throw fkErr;
      return;
    }

    throw insertErr;
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

  // ── OTP / Onboarding / Password reset ──────────────────────────────────────

  private otpTable() {
    return this.supabaseService.admin.schema('diocese').from('otp_verifications');
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async findAuthUserByEmail(email: string) {
    const { data, error } = await this.supabaseService.supabaseServer.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const lower = email.toLowerCase();
    return (data.users ?? []).find((u) => (u.email ?? '').toLowerCase() === lower) ?? null;
  }

  /**
   * Generates a 6-digit OTP, stores it in diocese.otp_verifications and emails it.
   * purpose 'forgot_password' requires the email to belong to a user who has
   * completed onboarding (that is when an email counts as "registered").
   */
  async sendOtp(emailRaw: string, purpose: OtpPurpose): Promise<{ ok: true; devMode: boolean }> {
    const email = emailRaw.toLowerCase().trim();

    if (purpose === 'forgot_password') {
      const user = await this.findAuthUserByEmail(email);
      if (!user || user.user_metadata?.onboardingCompleted !== true) {
        throw new Error('NOT_REGISTERED');
      }
      if (user.banned_until) throw new Error('ACCOUNT_ARCHIVED');
    }

    // Server-side resend throttle (client also enforces a 60s timer)
    const { data: recent } = await this.otpTable()
      .select('created_at')
      .eq('email', email)
      .eq('purpose', purpose)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.created_at && Date.now() - new Date(recent.created_at).getTime() < OTP_RESEND_THROTTLE_MS) {
      throw new Error('RATE_LIMITED');
    }

    // Invalidate any previous unused codes for this email+purpose
    await this.otpTable().delete().eq('email', email).eq('purpose', purpose).eq('used', false);

    const code = this.generateOtpCode();
    const { error: insertError } = await this.otpTable().insert({
      email,
      otp_code: code,
      purpose,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (insertError) throw insertError;

    try {
      const { devMode } = await this.emailService.sendOtpEmail(email, code, purpose);
      return { ok: true, devMode };
    } catch (sendError) {
      // Email never left the server — remove the code so the user can retry
      // immediately instead of hitting the 60s resend throttle.
      await this.otpTable().delete().eq('email', email).eq('purpose', purpose).eq('otp_code', code);
      throw sendError;
    }
  }

  async sendSecurityAlert(email: string, ipAddress?: string): Promise<{ ok: true; devMode: boolean }> {
    const { devMode } = await this.emailService.sendSecurityAlertEmail({
      email: email.toLowerCase().trim(),
      ipAddress,
      attemptedAt: new Date().toISOString(),
    });
    return { ok: true, devMode };
  }

  /** Validates a pending OTP and marks it used. */
  async verifyOtp(emailRaw: string, codeRaw: string, purpose: OtpPurpose): Promise<{ ok: true }> {
    const email = emailRaw.toLowerCase().trim();
    const code = codeRaw.trim();

    const { data, error } = await this.otpTable()
      .select('*')
      .eq('email', email)
      .eq('otp_code', code)
      .eq('purpose', purpose)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('INVALID_CODE');
    if (new Date(data.expires_at).getTime() < Date.now()) throw new Error('EXPIRED_CODE');

    const { error: updateError } = await this.otpTable()
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', data.id);
    if (updateError) throw updateError;

    return { ok: true };
  }

  /**
   * Follow-up actions (complete-onboarding, reset-password) re-check that the
   * supplied code was verified recently, so the OTP step cannot be skipped.
   */
  private async assertRecentlyVerifiedOtp(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const { data, error } = await this.otpTable()
      .select('used_at')
      .eq('email', email)
      .eq('otp_code', code.trim())
      .eq('purpose', purpose)
      .eq('used', true)
      .order('used_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const usedAt = data?.used_at ? new Date(data.used_at).getTime() : 0;
    if (!usedAt || Date.now() - usedAt > OTP_VERIFIED_WINDOW_MS) {
      throw new Error('OTP_NOT_VERIFIED');
    }
  }

  /**
   * Saves the onboarding form after its OTP was verified: updates the auth user
   * (email, password, metadata) and persists birthday / contact number /
   * onboarding_completed to diocese.profiles.
   */
  async completeOnboarding(body: {
    userId: string;
    email: string;
    password: string;
    contactNumber: string;
    birthday: string;
    otpCode: string;
  }): Promise<AuthUser> {
    const { userId, password, contactNumber, birthday, otpCode } = body;
    const email = body.email.toLowerCase().trim();

    await this.assertRecentlyVerifiedOtp(email, otpCode, 'onboarding');

    const { data: current, error: getError } =
      await this.supabaseService.supabaseServer.auth.admin.getUserById(userId);
    if (getError || !current?.user) throw new Error('USER_NOT_FOUND');

    const mergedMeta: Record<string, any> = {
      ...(current.user.user_metadata ?? {}),
      contactNumber,
      birthday,
      onboardingCompleted: true,
    };

    const { data, error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
      user_metadata: mergedMeta,
    });
    if (error) throw error;

    try {
      // Make sure the diocese.profiles row exists, then store the onboarding fields
      await this.upsertDioceseProfile(userId, {
        email,
        displayName: mergedMeta.displayName ?? mergedMeta.display_name,
        role: mergedMeta.role,
        entityName: mergedMeta.entityName ?? mergedMeta.entity_name,
        entityType: mergedMeta.entityType ?? mergedMeta.entity_type,
        entityId: mergedMeta.entityId ?? mergedMeta.entity_id,
      });
      const { error: profileError } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .update({
          email,
          birthday: birthday || null,
          contact_number: contactNumber ?? '',
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('external_auth_id', userId);
      if (profileError) throw profileError;
    } catch (profileError) {
      console.error(
        '[auth.service] Onboarding profile update failed for user',
        userId,
        ':',
        (profileError as any)?.message ?? profileError,
      );
    }

    return this.mapSupabaseUser(data.user);
  }

  /** Sets a new password after the forgot-password OTP was verified. */
  async resetPassword(body: { email: string; otpCode: string; newPassword: string }): Promise<{ ok: true }> {
    const email = body.email.toLowerCase().trim();

    await this.assertRecentlyVerifiedOtp(email, body.otpCode, 'forgot_password');

    const user = await this.findAuthUserByEmail(email);
    if (!user) throw new Error('NOT_REGISTERED');

    const { error } = await this.supabaseService.supabaseServer.auth.admin.updateUserById(user.id, {
      password: body.newPassword,
    });
    if (error) throw error;

    return { ok: true };
  }
}
