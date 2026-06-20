import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuditLogService } from './audit-log.service';
import { buildFieldChanges } from './field-changes';

export interface DiocesanEvent {
  id: string;
  institution_id?: string;
  institution_name?: string;
  institution_type?: string;
  event_name: string;
  event_level: 'Major event' | 'Minor event';
  event_type?: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  linked_project_id?: string;
  created_at?: string;
  deleted_at?: string;
}

const DIOCESE_INSTITUTION_NAME = 'Diocese of San Pablo';

@Injectable()
export class EventService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private db() {
    return this.supabaseService.admin.schema('diocese');
  }

  private isUuid(value?: string): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private async writeAuditLog(payload: {
    userName: string;
    userRole: string;
    action: string;
    detail: string;
    severity?: 'info' | 'warning' | 'error' | 'success';
    institutionId?: string;
    entity?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.auditLogService.logEvent({
      userName: payload.userName,
      userRole: payload.userRole,
      category: 'events',
      severity: payload.severity ?? 'info',
      action: payload.action,
      detail: payload.detail,
      institutionId: payload.institutionId,
      entity: payload.entity,
      metadata: payload.metadata,
    });
  }

  /**
   * Resolve an institutions row id from a uuid or a name (+ optional type).
   * For institutionType 'diocese' the diocesan row is found (or created) so
   * diocese-level users can own events without picking an institution.
   */
  async resolveInstitutionId(institutionId?: string, institutionName?: string, institutionType?: string): Promise<string | null> {
    if (this.isUuid(institutionId)) {
      const { data } = await this.db().from('institutions').select('id').eq('id', institutionId).maybeSingle();
      if (data?.id) return data.id;
    }

    if (institutionType === 'diocese') {
      const { data } = await this.db()
        .from('institutions')
        .select('id')
        .eq('institution_type', 'diocese')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;

      const { data: created, error } = await this.db()
        .from('institutions')
        .insert({ name: institutionName || DIOCESE_INSTITUTION_NAME, institution_type: 'diocese' })
        .select('id')
        .single();
      if (error) {
        console.error('[event.service] resolveInstitutionId (create diocese):', error.message);
        return null;
      }
      return created?.id ?? null;
    }

    if (!institutionName) return null;

    let query = this.db()
      .from('institutions')
      .select('id')
      .eq('name', institutionName)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (institutionType === 'parish' || institutionType === 'school' || institutionType === 'seminary') {
      query = query.eq('institution_type', institutionType);
    }

    const { data } = await query.limit(1).maybeSingle();
    if (data?.id) return data.id;

    // Auto-register seminary/school/parish institutions not yet in diocese.institutions.
    if (institutionType === 'school' || institutionType === 'seminary' || institutionType === 'parish') {
      const { data: created, error: insertErr } = await this.db()
        .from('institutions')
        .insert({ name: institutionName.trim(), institution_type: institutionType, is_active: true })
        .select('id')
        .single();
      if (!insertErr && created?.id) return created.id;
      // If insert failed (duplicate), fetch the existing record.
      const { data: existing } = await this.db()
        .from('institutions')
        .select('id')
        .eq('name', institutionName.trim())
        .eq('institution_type', institutionType)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }

    return null;
  }

  private toEvent(row: any, institution?: { name?: string; institution_type?: string }): DiocesanEvent {
    return {
      id: row.id,
      institution_id: row.institution_id ?? undefined,
      institution_name: institution?.name,
      institution_type: institution?.institution_type,
      event_name: row.event_name,
      event_level: row.event_level,
      event_type: row.event_type ?? undefined,
      start_date: row.start_date,
      end_date: row.end_date ?? undefined,
      notes: row.notes ?? undefined,
      linked_project_id: row.linked_project_id ?? undefined,
      created_at: row.created_at,
      deleted_at: row.deleted_at ?? undefined,
    };
  }

  /** Attach institution names so the diocese overview can show event owners. */
  private async attachInstitutions(rows: any[]): Promise<DiocesanEvent[]> {
    if (rows.length === 0) return [];

    const institutionIds = Array.from(new Set(rows.map((r: any) => r.institution_id).filter(Boolean)));
    const byId = new Map<string, any>();
    if (institutionIds.length > 0) {
      const { data: institutions } = await this.db()
        .from('institutions')
        .select('id, name, institution_type')
        .in('id', institutionIds);
      for (const inst of institutions ?? []) byId.set(inst.id, inst);
    }

    return rows.map((row: any) => this.toEvent(row, byId.get(row.institution_id)));
  }

  private async resolveScope(filters: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  }): Promise<{ scopedInstitutionId: string | null; unresolvable: boolean }> {
    if (!filters.institutionId && !filters.institutionName) {
      return { scopedInstitutionId: null, unresolvable: false };
    }
    const scopedInstitutionId = await this.resolveInstitutionId(
      filters.institutionId,
      filters.institutionName,
      filters.institutionType,
    );
    // A scope was requested but couldn't be resolved — return nothing rather
    // than leaking every institution's events.
    return { scopedInstitutionId, unresolvable: !scopedInstitutionId };
  }

  async getEvents(filters: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  } = {}): Promise<DiocesanEvent[]> {
    const { scopedInstitutionId, unresolvable } = await this.resolveScope(filters);
    if (unresolvable) return [];

    let query = this.db()
      .from('events')
      .select('*')
      .is('deleted_at', null)
      .order('start_date', { ascending: true });

    if (scopedInstitutionId) {
      query = query.eq('institution_id', scopedInstitutionId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[event.service] getEvents:', error.message);
      return [];
    }

    return this.attachInstitutions(data ?? []);
  }

  async getArchivedEvents(filters: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  } = {}): Promise<DiocesanEvent[]> {
    const { scopedInstitutionId, unresolvable } = await this.resolveScope(filters);
    if (unresolvable) return [];

    let query = this.db()
      .from('events')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (scopedInstitutionId) {
      query = query.eq('institution_id', scopedInstitutionId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[event.service] getArchivedEvents:', error.message);
      return [];
    }

    return this.attachInstitutions(data ?? []);
  }

  async saveEvent(
    event: Omit<DiocesanEvent, 'id' | 'created_at' | 'institution_name' | 'institution_type'> & {
      institutionName?: string;
      institutionType?: string;
    },
    userName = 'Unknown User',
    userRole = 'unknown',
  ): Promise<DiocesanEvent | null> {
    const institutionId = await this.resolveInstitutionId(
      event.institution_id,
      event.institutionName,
      event.institutionType,
    );
    if (!institutionId) {
      console.error('[event.service] saveEvent: could not resolve institution', event.institutionName ?? event.institution_id);
      return null;
    }

    const row: Record<string, unknown> = {
      institution_id: institutionId,
      event_name: event.event_name,
      event_level: event.event_level,
      start_date: event.start_date,
    };
    if (event.event_type) row.event_type = event.event_type;
    if (event.end_date) row.end_date = event.end_date;
    if (event.notes) row.notes = event.notes;
    if (event.linked_project_id) row.linked_project_id = event.linked_project_id;

    const { data, error } = await this.db().from('events').insert(row).select().single();
    if (error || !data) {
      console.error('[event.service] saveEvent:', error?.message);
      return null;
    }

    const { data: institution } = await this.db()
      .from('institutions')
      .select('name, institution_type')
      .eq('id', institutionId)
      .maybeSingle();

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Event Created',
      detail: `"${event.event_name}" was created and scheduled for ${event.start_date} by ${userName}`,
      severity: 'success',
      institutionId,
      entity: institution?.name,
      metadata: {
        event_id: data.id,
        institutionId,
        institutionName: institution?.name,
        institutionType: institution?.institution_type,
        event_level: event.event_level,
      },
    });

    return this.toEvent(data, institution ?? undefined);
  }

  async updateEvent(
    id: string,
    patch: {
      event_name?: string;
      event_level?: DiocesanEvent['event_level'];
      event_type?: string;
      start_date?: string;
      end_date?: string;
      notes?: string;
    },
    userName: string,
    userRole: string,
  ): Promise<DiocesanEvent | null> {
    const updates: Record<string, unknown> = {};
    if (patch.event_name !== undefined) updates.event_name = patch.event_name;
    if (patch.event_level !== undefined) updates.event_level = patch.event_level;
    if (patch.start_date !== undefined) updates.start_date = patch.start_date;
    // Optional fields: empty string clears the value
    if ('event_type' in patch) updates.event_type = patch.event_type || null;
    if ('end_date' in patch) updates.end_date = patch.end_date || null;
    if ('notes' in patch) updates.notes = patch.notes || null;

    // Snapshot the row before the update so the audit log can show before -> after.
    const { data: before } = await this.db()
      .from('events')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    const { data, error } = await this.db()
      .from('events')
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      console.error('[event.service] updateEvent:', error?.message);
      return null;
    }

    const { data: institution } = await this.db()
      .from('institutions')
      .select('name, institution_type')
      .eq('id', data.institution_id)
      .maybeSingle();

    const changes = buildFieldChanges(before, data, Object.keys(updates));

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Event Edited',
      detail: `"${data.event_name}" was edited by ${userName}`,
      severity: 'info',
      institutionId: data.institution_id,
      entity: institution?.name,
      metadata: {
        event_id: id,
        institutionId: data.institution_id,
        institutionName: institution?.name,
        institutionType: institution?.institution_type,
        changes,
      },
    });

    return this.toEvent(data, institution ?? undefined);
  }

  async archiveEvent(id: string, userName: string, userRole: string): Promise<{ ok: boolean }> {
    const { data, error } = await this.db()
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('event_name, institution_id')
      .single();

    if (error || !data) {
      console.error('[event.service] archiveEvent:', error?.message);
      return { ok: false };
    }

    const { data: institution } = await this.db()
      .from('institutions')
      .select('name, institution_type')
      .eq('id', data.institution_id)
      .maybeSingle();

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Event Archived',
      detail: `"${data.event_name}" was archived by ${userName}`,
      severity: 'warning',
      institutionId: data.institution_id,
      entity: institution?.name,
      metadata: {
        event_id: id,
        institutionId: data.institution_id,
        institutionName: institution?.name,
        institutionType: institution?.institution_type,
        archived_by: userName,
      },
    });

    return { ok: true };
  }

  async restoreEvent(id: string, userName: string, userRole: string): Promise<{ ok: boolean }> {
    const { data, error } = await this.db()
      .from('events')
      .update({ deleted_at: null })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('event_name, institution_id')
      .single();

    if (error || !data) {
      console.error('[event.service] restoreEvent:', error?.message);
      return { ok: false };
    }

    const { data: institution } = await this.db()
      .from('institutions')
      .select('name, institution_type')
      .eq('id', data.institution_id)
      .maybeSingle();

    await this.writeAuditLog({
      userName,
      userRole,
      action: 'Event Restored',
      detail: `"${data.event_name}" was restored from archive by ${userName}`,
      severity: 'info',
      institutionId: data.institution_id,
      entity: institution?.name,
      metadata: {
        event_id: id,
        institutionId: data.institution_id,
        institutionName: institution?.name,
        institutionType: institution?.institution_type,
        restored_by: userName,
      },
    });

    return { ok: true };
  }
}
