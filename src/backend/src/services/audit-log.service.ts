import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

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
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

@Injectable()
export class AuditLogService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private toAuditEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      user: row.user_name ?? 'System',
      role: row.user_role,
      isSystem: Boolean(row.is_system),
      category: row.category,
      severity: row.severity,
      action: row.action,
      detail: row.detail,
      timestamp: formatTimestamp(row.created_at),
      date: formatDate(row.created_at),
      ip: row.ip_address ?? 'unknown',
      entity: row.entity ?? undefined,
    };
  }

  async getAuditLogs(filters?: {
    category?: string;
    severity?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    let query = this.supabaseService.admin
      .schema('diocese')
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters?.limit ?? 500);

    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[audit-log.service] getAuditLogs:', error.message);
      return [];
    }

    return (data ?? []).map((row) => this.toAuditEntry(row));
  }
}
