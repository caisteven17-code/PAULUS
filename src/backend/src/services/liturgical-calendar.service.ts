import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export type LiturgicalReviewStatus = 'pending' | 'approved' | 'approved_with_revisions' | 'rejected';

export interface LiturgicalCalendarRecord {
  id: string;
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  celebration_name: string;
  rank?: string;
  liturgical_season?: string;
  psalter_week?: string;
  source_name: string;
  source_url: string;
  review_status: LiturgicalReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  revision_payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface LiturgicalCalendarFilters {
  status?: string;
  season?: string;
  month?: number;
  year?: number;
  reason?: string;
  page?: number;
  pageSize?: number;
}

export interface LiturgicalCalendarPage {
  records: LiturgicalCalendarRecord[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class LiturgicalCalendarService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private db() {
    return this.supabaseService.admin.schema('reference');
  }

  private applyFilters(query: any, filters: LiturgicalCalendarFilters) {
    if (filters.status && filters.status !== 'all') {
      query = query.eq('review_status', filters.status);
    }
    if (filters.season && filters.season !== 'all') {
      query = query.eq('liturgical_season', filters.season);
    }
    if (filters.month) {
      query = query.eq('month', filters.month);
    }
    if (filters.year) {
      query = query.eq('year', filters.year);
    }
    if (filters.reason) {
      query = query.ilike('review_notes', `%${filters.reason}%`);
    }
    return query;
  }

  async getRecords(filters: LiturgicalCalendarFilters): Promise<LiturgicalCalendarPage> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const from = (page - 1) * pageSize;

    let query = this.db().from('liturgical_calendar').select('*', { count: 'exact' });
    query = this.applyFilters(query, filters);
    query = query.order('date', { ascending: true }).range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('[liturgical-calendar.service] getRecords:', error.message);
      return { records: [], total: 0, page, pageSize };
    }
    return { records: (data ?? []) as LiturgicalCalendarRecord[], total: count ?? 0, page, pageSize };
  }

  async approveRecord(id: string, reviewedBy: string): Promise<LiturgicalCalendarRecord | null> {
    const { data, error } = await this.db()
      .from('liturgical_calendar')
      .update({
        review_status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) {
      console.error('[liturgical-calendar.service] approveRecord:', error?.message);
      return null;
    }
    return data as LiturgicalCalendarRecord;
  }

  async approveWithRevisions(
    id: string,
    patch: { date?: string; celebration_name?: string },
    reviewedBy: string,
  ): Promise<{ record?: LiturgicalCalendarRecord; errorMessage?: string }> {
    const { data: existing, error: fetchError } = await this.db()
      .from('liturgical_calendar')
      .select('date, celebration_name')
      .eq('id', id)
      .single();
    if (fetchError || !existing) {
      console.error('[liturgical-calendar.service] approveWithRevisions fetch:', fetchError?.message);
      return { errorMessage: 'Record not found.' };
    }

    const update: Record<string, unknown> = {
      review_status: 'approved_with_revisions',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      revision_payload: {
        previous: { date: existing.date, celebration_name: existing.celebration_name },
        revised: patch,
      },
    };
    if (patch.date) {
      const revisedDate = new Date(`${patch.date}T00:00:00Z`);
      if (Number.isNaN(revisedDate.getTime())) {
        return { errorMessage: 'The revised date is not a valid calendar date.' };
      }
      update.date = patch.date;
      update.year = revisedDate.getUTCFullYear();
      update.month = revisedDate.getUTCMonth() + 1;
      update.day = revisedDate.getUTCDate();
      update.weekday = revisedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    }
    if (patch.celebration_name) {
      update.celebration_name = patch.celebration_name;
    }

    const { data, error } = await this.db()
      .from('liturgical_calendar')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) {
      console.error('[liturgical-calendar.service] approveWithRevisions:', error?.message);
      if (error?.code === '23505') {
        return {
          errorMessage: `Another event from the same source already exists on ${patch.date}. Revise that event instead, or change only the celebration name here.`,
        };
      }
      return { errorMessage: 'Failed to revise the record.' };
    }
    return { record: data as LiturgicalCalendarRecord };
  }

  async rejectRecord(id: string, reason: string, reviewedBy: string): Promise<LiturgicalCalendarRecord | null> {
    const { data, error } = await this.db()
      .from('liturgical_calendar')
      .update({
        review_status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: reason,
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) {
      console.error('[liturgical-calendar.service] rejectRecord:', error?.message);
      return null;
    }
    return data as LiturgicalCalendarRecord;
  }

  /** Bulk-approves every still-pending record matching the given filters. */
  async approveAll(filters: LiturgicalCalendarFilters, reviewedBy: string): Promise<{ approved: number }> {
    let query = this.db()
      .from('liturgical_calendar')
      .update({
        review_status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('review_status', 'pending');
    query = this.applyFilters(query, { ...filters, status: undefined });

    const { data, error } = await query.select('id');
    if (error) {
      console.error('[liturgical-calendar.service] approveAll:', error.message);
      return { approved: 0 };
    }
    return { approved: data?.length ?? 0 };
  }
}
