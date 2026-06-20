import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export type AuditCategory =
  | 'auth'
  | 'users'
  | 'projects'
  | 'finance'
  | 'data'
  | 'events'
  | 'announcements'
  | 'calendar'
  | 'analytics'
  | 'system';

export interface AuditLogEntry {
  id: string;
  user: string;
  role: string;
  email?: string;
  avatarUrl?: string;
  isSystem: boolean;
  category: AuditCategory;
  severity: 'info' | 'warning' | 'error' | 'success';
  action: string;
  detail: string;
  timestamp: string;
  date: string;
  occurredAt: string;
  ip: string;
  institutionId?: string;
  institutionType?: 'diocese' | 'parish' | 'school' | 'seminary';
  entity?: string;
  changes?: FieldChange[];
  metadata?: Record<string, any>;
}

export interface LogEventPayload {
  userId?: string;
  userName: string;
  userRole: string;
  isSystem?: boolean;
  category: AuditCategory;
  severity: AuditLogEntry['severity'];
  action: string;
  detail: string;
  institutionId?: string;
  entity?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

// ── Helpers ────────────────────────────────────────────────

function fmt(iso: string): { timestamp: string; date: string } {
  const d = new Date(iso);
  return {
    timestamp: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

function deriveCategory(tableName: string): AuditCategory {
  if (['financial_records', 'submission_batches', 'institution_budgets'].includes(tableName)) return 'finance';
  if (['projects', 'donations', 'project_expenses',
       'institution_simulator_scenarios', 'priest_reassignment_scenarios',
       'digital_twin_scenarios'].includes(tableName)) return 'projects';
  if (['profiles'].includes(tableName)) return 'users';
  if (['roles', 'permissions', 'role_permissions', 'institutions'].includes(tableName)) return 'system';
  if (['events'].includes(tableName)) return 'events';
  if (['announcements'].includes(tableName)) return 'announcements';
  if (['liturgical_calendar'].includes(tableName)) return 'calendar';
  return 'system';
}

function deriveSeverity(operation: string): AuditLogEntry['severity'] {
  if (operation === 'INSERT') return 'success';
  if (operation === 'DELETE') return 'warning';
  return 'info';
}

function deriveAction(operation: string, tableName: string): string {
  const label = tableName.replace(/_/g, ' ');
  const verb = operation === 'INSERT' ? 'Created' : operation === 'UPDATE' ? 'Updated' : 'Deleted';
  return `${verb} ${label}`;
}

function deriveDetail(operation: string, tableSchema: string, tableName: string, values: any): string {
  const name = values?.name ?? values?.full_name ?? values?.institution_name ?? null;
  const base = `${operation} on ${tableSchema}.${tableName}`;
  return name ? `${base} — ${name}` : base;
}

function extractEntity(tableSchema: string, values: any): string | undefined {
  if (values?.name) return String(values.name);
  if (values?.full_name) return String(values.full_name);
  if (['parishes', 'schools', 'seminaries'].includes(tableSchema)) {
    return tableSchema.charAt(0).toUpperCase() + tableSchema.slice(1);
  }
  return undefined;
}

const SKIP_DIFF_KEYS = new Set(['updated_at', 'created_at']);

function auditReference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LOG-${Date.now()}-${rand}`;
}

function computeChanges(oldValues: any, newValues: any): FieldChange[] | undefined {
  if (!oldValues || !newValues) return undefined;

  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changes: FieldChange[] = [];

  for (const key of allKeys) {
    if (SKIP_DIFF_KEYS.has(key)) continue;
    const from = oldValues[key] ?? null;
    const to = newValues[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({
        field: key.replace(/_/g, ' '),
        from: from !== null ? String(from) : null,
        to: to !== null ? String(to) : null,
      });
    }
  }

  return changes.length > 0 ? changes : undefined;
}

// ── Service ────────────────────────────────────────────────

@Injectable()
export class AuditLogService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private isUnknownRole(role?: string | null): boolean {
    return !role || ['unknown', 'null', 'undefined'].includes(String(role).trim().toLowerCase());
  }

  private isUuid(value?: string | null): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveInstitution(institutionId?: string | null, entityName?: string | null, entityType?: string | null) {
    if (this.isUuid(institutionId)) {
      const { data } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('id, name')
        .eq('id', institutionId)
        .maybeSingle();
      if (data?.id) return { institutionId: data.id as string, entity: data.name as string };
    }

    if (!entityName) return { institutionId: null, entity: entityName ?? null };

    let query = this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id, name')
      .eq('name', entityName)
      .limit(1);

    if (entityType) query = query.eq('institution_type', entityType);

    const { data } = await query.maybeSingle();
    return {
      institutionId: data?.id ?? null,
      entity: data?.name ?? entityName,
    };
  }

  private async resolveAuditContext(event: LogEventPayload): Promise<{
    userId: string | null;
    userName: string;
    userRole: string;
    institutionId: string | null;
    entity: string | null;
  }> {
    const meta = event.metadata ?? {};
    const metadataEmail = meta.email ? String(meta.email).toLowerCase().trim() : null;
    const email = metadataEmail || (String(event.userName).includes('@') ? event.userName.toLowerCase().trim() : null);
    const metadataEntityId = meta.institutionId ?? meta.entityId;
    const metadataEntityName = meta.institutionName ?? meta.entityName;
    const metadataEntityType = meta.institutionType ?? meta.entityType;
    const fallback = {
      userId: this.isUuid(event.userId) ? event.userId! : null,
      userName: event.userName || 'Unknown',
      userRole: this.isUnknownRole(event.userRole) ? 'Unknown' : event.userRole,
      institutionId: this.isUuid(event.institutionId) ? event.institutionId! : this.isUuid(metadataEntityId) ? String(metadataEntityId) : null,
      entity: event.entity || (metadataEntityName ? String(metadataEntityName) : null),
    };

    let profile: any = null;

    if (this.isUuid(event.userId)) {
      const { data } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .select('id, external_auth_id, full_name, email, role_id, institution_id')
        .or(`id.eq.${event.userId},external_auth_id.eq.${event.userId}`)
        .limit(1)
        .maybeSingle();
      profile = data;
    }

    if (!profile && email) {
      const { data } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .select('id, external_auth_id, full_name, email, role_id, institution_id')
        .eq('email', email)
        .limit(1)
        .maybeSingle();
      profile = data;
    }

    // Last resort: the frontend often sends only a display name (x-user-name),
    // not an id or email. Resolve the profile by full name so user_id, role and
    // institution still populate instead of leaving the row unlinked.
    if (!profile) {
      const displayName = String(event.userName ?? '').trim();
      const skip = !displayName || displayName.includes('@') ||
        ['unknown', 'unknown user', 'system'].includes(displayName.toLowerCase());
      if (!skip) {
        const { data } = await this.supabaseService.admin
          .schema('diocese')
          .from('profiles')
          .select('id, external_auth_id, full_name, email, role_id, institution_id')
          .ilike('full_name', displayName)
          .limit(1)
          .maybeSingle();
        profile = data;
      }
    }

    // The audit "entity" reflects the actor's own institution (who performed the
    // action). Only when the actor has no institution assigned do we fall back to
    // the institution the caller passed for the affected record, so the column is
    // still meaningful instead of NULL.
    const institution = await this.resolveInstitution(
      profile?.institution_id ?? fallback.institutionId,
      fallback.entity,
      metadataEntityType ? String(metadataEntityType) : null,
    );

    return {
      userId: profile?.id ?? fallback.userId,
      userName: profile?.full_name || profile?.email || fallback.userName,
      userRole: profile?.role_id || fallback.userRole,
      institutionId: institution.institutionId,
      entity: institution.entity,
    };
  }

  async logEvent(event: LogEventPayload): Promise<void> {
    const context = await this.resolveAuditContext(event);
    const reference = auditReference();
    const occurredAt = new Date().toISOString();

    const modernPayload = {
      log_reference: reference,
      user_id: context.userId,
      user_name: context.userName,
      user_role: context.userRole,
      is_system: event.isSystem ?? false,
      category: event.category,
      severity: event.severity,
      action: event.action,
      detail: event.detail,
      institution_id: context.institutionId,
      entity: context.entity,
      metadata: event.metadata ?? null,
      occurred_at: occurredAt,
    };

    const modernWithoutLegacyColumns = {
      user_id: context.userId,
      user_name: context.userName,
      user_role: context.userRole,
      is_system: event.isSystem ?? false,
      category: event.category,
      severity: event.severity,
      action: event.action,
      detail: event.detail,
      institution_id: context.institutionId,
      entity: context.entity,
      metadata: event.metadata ?? null,
    };

    const { metadata: _m, ...modernWithoutMetadata } = modernPayload;
    const { metadata: _mw, ...modernWithoutLegacyOrMetadata } = modernWithoutLegacyColumns;
    const { institution_id: _i1, ...modernWithoutInstitution } = modernPayload;
    const { institution_id: _i2, ...modernWithoutLegacyOrInstitution } = modernWithoutLegacyColumns;
    const { metadata: _mi, ...modernWithoutInstitutionOrMetadata } = modernWithoutInstitution;
    const { metadata: _mli, ...modernWithoutLegacyInstitutionOrMetadata } = modernWithoutLegacyOrInstitution;
    const attempts = [
      modernPayload,
      modernWithoutMetadata,
      modernWithoutInstitution,
      modernWithoutInstitutionOrMetadata,
      modernWithoutLegacyColumns,
      modernWithoutLegacyOrMetadata,
      modernWithoutLegacyOrInstitution,
      modernWithoutLegacyInstitutionOrMetadata,
    ];
    let lastError: any = null;

    for (const payload of attempts) {
      const { error } = await this.supabaseService.admin
        .schema('diocese')
        .from('audit_logs')
        .insert(payload as any);
      if (!error) return;
      lastError = error;
    }

    if (lastError) console.error('[audit-log.service] logEvent:', lastError.message);
  }

  async getAuditLogs(filters?: {
    category?: string;
    severity?: string;
    limit?: number;
    institutionType?: string;
    institutionId?: string;
    institutionName?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AuditLogEntry[]> {
    const limit = filters?.limit ?? 500;
    const fetchLimit = Math.max(limit, 2000);

    const [mutationsResult, appEventsResult] = await Promise.all([
      this.supabaseService.admin
        .schema('audit')
        .from('change_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(fetchLimit),
      this.supabaseService.admin
        .schema('diocese')
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(fetchLimit),
    ]);

    // audit.change_log is optional — silently skip if the schema doesn't exist
    if (mutationsResult.error && !mutationsResult.error.message?.includes('Invalid schema')) {
      console.error('[audit-log.service] change_log:', mutationsResult.error.message);
    }
    if (appEventsResult.error) console.error('[audit-log.service] audit_logs:', appEventsResult.error.message);

    const mutationRows = mutationsResult.error ? [] : (mutationsResult.data ?? []);
    const appRows = appEventsResult.data ?? [];

    const institutionIds = [
      ...new Set([
        ...appRows.filter((r) => r.institution_id).map((r) => r.institution_id as string),
        ...mutationRows
          .map((r) => (r.new_values ?? r.old_values)?.institution_id as string | undefined)
          .filter(Boolean),
      ]),
    ];
    const institutionMap: Record<string, { name: string; institution_type: 'diocese' | 'parish' | 'school' | 'seminary' }> = {};

    if (institutionIds.length > 0) {
      const { data: institutions } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('id, name, institution_type')
        .in('id', institutionIds);

      for (const institution of institutions ?? []) {
        institutionMap[institution.id] = {
          name: institution.name,
          institution_type: institution.institution_type,
        };
      }
    }

    // Batch-resolve profile info for both mutation actors (changed_by) and
    // application-event actors (user_id) so we can show name + email in the list.
    const userIds = [
      ...new Set([
        ...mutationRows.filter((r) => r.changed_by).map((r) => r.changed_by as string),
        ...appRows.filter((r) => r.user_id).map((r) => r.user_id as string),
      ]),
    ];
    const profileMap: Record<string, { full_name: string; role_id: string; email: string | null; avatarUrl: string | null }> = {};

    if (userIds.length > 0) {
      // Try selecting avatar_url; fall back if migration 206 hasn't been applied.
      let profiles: any[] | null = (
        await this.supabaseService.admin
          .schema('diocese')
          .from('profiles')
          .select('id, full_name, role_id, email, avatar_url')
          .in('id', userIds)
      ).data;
      if (!profiles) {
        profiles = (
          await this.supabaseService.admin
            .schema('diocese')
            .from('profiles')
            .select('id, full_name, role_id, email')
            .in('id', userIds)
        ).data;
      }

      for (const p of profiles ?? []) {
        profileMap[p.id] = {
          full_name: p.full_name ?? 'Unknown',
          role_id: p.role_id ?? 'unknown',
          email: p.email ?? null,
          avatarUrl: (p as any).avatar_url ?? null,
        };
      }
    }

    type SortableEntry = AuditLogEntry & { _sortKey: number };

    const mutations: SortableEntry[] = mutationRows.map((row) => {
      const isSystem = !row.changed_by;
      const profile = row.changed_by ? profileMap[row.changed_by] : null;
      const values = row.new_values ?? row.old_values;
      const institutionId = values?.institution_id ?? undefined;
      const institution = institutionId ? institutionMap[institutionId] : null;
      const { timestamp, date } = fmt(row.changed_at);

      return {
        id: 'CL-' + (row.id as string).slice(0, 8).toUpperCase(),
        user: isSystem ? 'System' : (profile?.full_name ?? 'Unknown User'),
        role: isSystem ? 'Automated' : (profile?.role_id ?? 'Unknown'),
        email: isSystem ? undefined : (profile?.email ?? undefined),
        avatarUrl: isSystem ? undefined : (profile?.avatarUrl ?? undefined),
        isSystem,
        category: deriveCategory(row.table_name),
        severity: deriveSeverity(row.operation),
        action: deriveAction(row.operation, row.table_name),
        detail: deriveDetail(row.operation, row.table_schema, row.table_name, values),
        timestamp,
        date,
        occurredAt: row.changed_at,
        ip: 'N/A',
        institutionId,
        institutionType: institution?.institution_type,
        entity: institution?.name ?? extractEntity(row.table_schema, values),
        changes: computeChanges(row.old_values, row.new_values),
        _sortKey: new Date(row.changed_at).getTime(),
      };
    });

    const appEvents: SortableEntry[] = appRows.map((row) => {
      const occurredAt = row.created_at ?? row.occurred_at ?? new Date().toISOString();
      const { timestamp, date } = fmt(occurredAt);
      const prof = row.user_id ? profileMap[row.user_id] : null;
      const institution = row.institution_id ? institutionMap[row.institution_id] : null;
      const emailFromName =
        typeof row.user_name === 'string' && row.user_name.includes('@') ? row.user_name : undefined;
      return {
        id: 'AL-' + (row.id as string).slice(0, 8).toUpperCase(),
        user: row.user_name,
        role: row.user_role ?? 'Unknown',
        email: row.is_system ? undefined : (prof?.email ?? emailFromName),
        avatarUrl: row.is_system ? undefined : (prof?.avatarUrl ?? undefined),
        isSystem: row.is_system,
        category: row.category as AuditLogEntry['category'],
        severity: row.severity as AuditLogEntry['severity'],
        action: row.action,
        detail: row.detail,
        timestamp,
        date,
        occurredAt,
        ip: 'N/A',
        institutionId: row.institution_id ?? undefined,
        institutionType: institution?.institution_type,
        entity: row.entity ?? institution?.name ?? undefined,
        changes: Array.isArray(row.metadata?.changes) ? row.metadata.changes : undefined,
        metadata: row.metadata ?? undefined,
        _sortKey: new Date(occurredAt).getTime(),
      };
    });

    const { category, severity, institutionType, institutionId, institutionName, dateFrom, dateTo } = filters ?? {};
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() : null;
    const normalizedInstitutionName = institutionName?.trim().toLowerCase();

    return ([...mutations, ...appEvents] as SortableEntry[])
      .sort((a, b) => b._sortKey - a._sortKey)
      .filter((entry) => {
        const matchesInstitutionName =
          !!normalizedInstitutionName && entry.entity?.toLowerCase() === normalizedInstitutionName;
        if (category && category !== 'all' && entry.category !== category) return false;
        if (severity && entry.severity !== severity) return false;
        if (institutionType && institutionType !== 'all' && entry.institutionType !== institutionType && !matchesInstitutionName) {
          return false;
        }
        if (
          institutionId &&
          institutionId !== 'all' &&
          entry.institutionId !== institutionId &&
          !matchesInstitutionName
        ) {
          return false;
        }
        if (fromTs !== null && Number.isFinite(fromTs) && entry._sortKey < fromTs) return false;
        if (toTs !== null && Number.isFinite(toTs) && entry._sortKey > toTs) return false;
        return true;
      })
      .slice(0, limit)
      .map(({ _sortKey, ...entry }) => entry as AuditLogEntry);
  }
}
