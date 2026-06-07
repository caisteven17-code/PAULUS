import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface AuditLogEntry {
  id: string;
  user: string;
  role: string;
  isSystem: boolean;
  category: 'auth' | 'finance' | 'analytics' | 'reports' | 'system' | 'access';
  severity: 'info' | 'warning' | 'error' | 'success';
  action: string;
  detail: string;
  timestamp: string;
  date: string;
  ip: string;
  entity?: string;
  changes?: FieldChange[];
}

export interface LogEventPayload {
  userId?: string;
  userName: string;
  userRole: string;
  isSystem?: boolean;
  category: AuditLogEntry['category'];
  severity: AuditLogEntry['severity'];
  action: string;
  detail: string;
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

function deriveCategory(tableName: string): AuditLogEntry['category'] {
  if (['financial_records', 'submission_batches', 'projects', 'donations', 'project_expenses'].includes(tableName)) {
    return 'finance';
  }
  if (['roles', 'permissions', 'role_permissions', 'profiles'].includes(tableName)) {
    return 'access';
  }
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

  async logEvent(event: LogEventPayload): Promise<void> {
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('audit_logs')
      .insert({
        user_id: event.userId ?? null,
        user_name: event.userName,
        user_role: event.userRole,
        is_system: event.isSystem ?? false,
        category: event.category,
        severity: event.severity,
        action: event.action,
        detail: event.detail,
        entity: event.entity ?? null,
        ip_address: event.ipAddress ?? null,
        metadata: event.metadata ?? null,
      });

    if (error) console.error('[audit-log.service] logEvent:', error.message);
  }

  async getAuditLogs(filters?: { category?: string; severity?: string; limit?: number }): Promise<AuditLogEntry[]> {
    const limit = filters?.limit ?? 500;

    const [mutationsResult, appEventsResult] = await Promise.all([
      this.supabaseService.admin
        .schema('audit')
        .from('change_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(limit),
      this.supabaseService.admin
        .schema('diocese')
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    if (mutationsResult.error) console.error('[audit-log.service] change_log:', mutationsResult.error.message);
    if (appEventsResult.error) console.error('[audit-log.service] audit_logs:', appEventsResult.error.message);

    const mutationRows = mutationsResult.data ?? [];
    const appRows = appEventsResult.data ?? [];

    // Batch-resolve profile names for mutation rows
    const userIds = [...new Set(mutationRows.filter((r) => r.changed_by).map((r) => r.changed_by as string))];
    const profileMap: Record<string, { full_name: string; role_id: string }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await this.supabaseService.admin
        .schema('diocese')
        .from('profiles')
        .select('id, full_name, role_id')
        .in('id', userIds);

      for (const p of profiles ?? []) {
        profileMap[p.id] = { full_name: p.full_name ?? 'Unknown', role_id: p.role_id ?? 'unknown' };
      }
    }

    type SortableEntry = AuditLogEntry & { _sortKey: number };

    const mutations: SortableEntry[] = mutationRows.map((row) => {
      const isSystem = !row.changed_by;
      const profile = row.changed_by ? profileMap[row.changed_by] : null;
      const values = row.new_values ?? row.old_values;
      const { timestamp, date } = fmt(row.changed_at);

      return {
        id: 'CL-' + (row.id as string).slice(0, 8).toUpperCase(),
        user: isSystem ? 'System' : (profile?.full_name ?? 'Unknown User'),
        role: isSystem ? 'Automated' : (profile?.role_id ?? 'Unknown'),
        isSystem,
        category: deriveCategory(row.table_name),
        severity: deriveSeverity(row.operation),
        action: deriveAction(row.operation, row.table_name),
        detail: deriveDetail(row.operation, row.table_schema, row.table_name, values),
        timestamp,
        date,
        ip: 'N/A',
        entity: extractEntity(row.table_schema, values),
        changes: computeChanges(row.old_values, row.new_values),
        _sortKey: new Date(row.changed_at).getTime(),
      };
    });

    const appEvents: SortableEntry[] = appRows.map((row) => {
      const { timestamp, date } = fmt(row.created_at);
      return {
        id: 'AL-' + (row.id as string).slice(0, 8).toUpperCase(),
        user: row.user_name,
        role: row.user_role,
        isSystem: row.is_system,
        category: row.category as AuditLogEntry['category'],
        severity: row.severity as AuditLogEntry['severity'],
        action: row.action,
        detail: row.detail,
        timestamp,
        date,
        ip: row.ip_address ?? 'N/A',
        entity: row.entity ?? undefined,
        _sortKey: new Date(row.created_at).getTime(),
      };
    });

    const { category, severity } = filters ?? {};

    return ([...mutations, ...appEvents] as SortableEntry[])
      .sort((a, b) => b._sortKey - a._sortKey)
      .filter((entry) => {
        if (category && category !== 'all' && entry.category !== category) return false;
        if (severity && entry.severity !== severity) return false;
        return true;
      })
      .slice(0, limit)
      .map(({ _sortKey, ...entry }) => entry as AuditLogEntry);
  }
}
