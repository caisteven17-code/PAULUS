import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface DiocesanEvent {
  id: string;
  institution_id?: string;
  event_name: string;
  event_level: 'Major event' | 'Minor event';
  event_type?: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  linked_project_id?: string;
  created_at?: string;
}

@Injectable()
export class EventService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private db() {
    return this.supabaseService.admin.schema('diocese');
  }

  private toEvent(row: any): DiocesanEvent {
    return {
      id: row.id,
      institution_id: row.institution_id ?? undefined,
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

  async getEvents(institutionId?: string): Promise<DiocesanEvent[]> {
    let query = this.db()
      .from('events')
      .select('*')
      .is('deleted_at', null)
      .order('start_date', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[event.service] getEvents:', error.message);
      return [];
    }
    return (data ?? []).map((row: any) => this.toEvent(row));
  }

  async saveEvent(event: Omit<DiocesanEvent, 'id' | 'created_at'>): Promise<DiocesanEvent | null> {
    const row: Record<string, unknown> = {
      event_name: event.event_name,
      event_level: event.event_level,
      start_date: event.start_date,
    };
    if (event.institution_id) row.institution_id = event.institution_id;
    if (event.event_type) row.event_type = event.event_type;
    if (event.end_date) row.end_date = event.end_date;
    if (event.notes) row.notes = event.notes;
    if (event.linked_project_id) row.linked_project_id = event.linked_project_id;

    const { data, error } = await this.db().from('events').insert(row).select().single();
    if (error || !data) {
      console.error('[event.service] saveEvent:', error?.message);
      return null;
    }
    return this.toEvent(data);
  }
}
