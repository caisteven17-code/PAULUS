import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

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
}

const DIOCESE_INSTITUTION_NAME = 'Diocese of San Pablo';

@Injectable()
export class EventService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private db() {
    return this.supabaseService.admin.schema('diocese');
  }

  private isUuid(value?: string): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
    return data?.id ?? null;
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
    };
  }

  async getEvents(filters: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  } = {}): Promise<DiocesanEvent[]> {
    let scopedInstitutionId: string | null = null;
    if (filters.institutionId || filters.institutionName) {
      scopedInstitutionId = await this.resolveInstitutionId(
        filters.institutionId,
        filters.institutionName,
        filters.institutionType,
      );
      // A scope was requested but couldn't be resolved — return nothing rather
      // than leaking every institution's events.
      if (!scopedInstitutionId) return [];
    }

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

    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Attach institution names so the diocese overview can show event owners.
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

  async saveEvent(
    event: Omit<DiocesanEvent, 'id' | 'created_at' | 'institution_name' | 'institution_type'> & {
      institutionName?: string;
      institutionType?: string;
    },
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

    return this.toEvent(data, institution ?? undefined);
  }
}
