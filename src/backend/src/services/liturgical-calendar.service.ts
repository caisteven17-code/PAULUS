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
  source_name: string;
  source_url: string;
  source_reference?: string;
  validation_status?: string;
  validation_reason?: string;
  gcatholic_match_status?: string;
  romcal_match_status?: string;
  litcal_match_status?: string;
  gcatholic_celebration_name?: string;
  romcal_celebration_name?: string;
  litcal_celebration_name?: string;
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
  celebration?: string;
  reason?: string;
  validation?: 'all' | 'matched' | 'mismatched';
  page?: number;
  pageSize?: number;
}

export interface LiturgicalCalendarPage {
  records: LiturgicalCalendarRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const MATCHED_STATUSES = [
  'matched_both',
  'matched_gcatholic_only',
  'matched_romcal_only',
  'matched_litcal_only',
  'source_of_truth_only',
];
const MISMATCHED_STATUSES = ['mismatched_all', 'validator_missing'];

@Injectable()
export class LiturgicalCalendarService {
  constructor(private readonly supabase: SupabaseService) {}

  private table() {
    return this.supabase.admin.schema('reference').from('liturgical_calendar');
  }

  private safeSearch(value: string): string {
    // PostgREST .or() uses commas and parentheses as syntax. Remove only those
    // control characters while retaining normal human search text.
    return value.replace(/[(),]/g, ' ').trim();
  }

  async getRecords(filters: LiturgicalCalendarFilters): Promise<LiturgicalCalendarPage> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let query = this.table().select('*', { count: 'exact' });
    if (filters.status && filters.status !== 'all') query = query.eq('review_status', filters.status);
    if (filters.season && filters.season !== 'all') query = query.eq('liturgical_season', filters.season);
    if (filters.month) query = query.eq('month', filters.month);
    if (filters.year) query = query.eq('year', filters.year);
    if (filters.celebration) query = query.ilike('celebration_name', `%${filters.celebration}%`);
    if (filters.reason) {
      const reason = this.safeSearch(filters.reason);
      query = query.or(`review_notes.ilike.%${reason}%,validation_reason.ilike.%${reason}%`);
    }
    if (filters.validation && filters.validation !== 'all') {
      query = query.in(
        'validation_status',
        filters.validation === 'matched' ? MATCHED_STATUSES : MISMATCHED_STATUSES,
      );
    }

    const { data, error, count } = await query
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error('[liturgical-calendar.service] getRecords:', error.message);
      return { records: [], total: 0, page, pageSize };
    }
    return {
      records: (data ?? []) as unknown as LiturgicalCalendarRecord[],
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async approveRecord(id: string, reviewedBy: string): Promise<LiturgicalCalendarRecord | null> {
    const { data, error } = await this.table()
      .update({ review_status: 'approved', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[liturgical-calendar.service] approveRecord:', error.message);
      return null;
    }
    return data as unknown as LiturgicalCalendarRecord | null;
  }

  async approveWithRevisions(
    id: string,
    patch: { date?: string; celebration_name?: string; name_source?: string },
    reviewedBy: string,
  ): Promise<{ record?: LiturgicalCalendarRecord; errorMessage?: string }> {
    const { data: existing, error: readError } = await this.table()
      .select('date,celebration_name')
      .eq('id', id)
      .maybeSingle();
    if (readError) return { errorMessage: readError.message };
    if (!existing) return { errorMessage: 'Record not found.' };

    let revisedDate: Date | undefined;
    if (patch.date) {
      revisedDate = new Date(`${patch.date}T00:00:00Z`);
      if (Number.isNaN(revisedDate.getTime())) {
        return { errorMessage: 'The revised date is not a valid calendar date.' };
      }
    }
    const revisionPayload = {
      previous: { date: existing.date, celebration_name: existing.celebration_name },
      revised: patch,
    };
    const update: Record<string, unknown> = {
      review_status: 'approved_with_revisions',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      revision_payload: revisionPayload,
    };
    if (patch.date && revisedDate) {
      update.date = patch.date;
      update.year = revisedDate.getUTCFullYear();
      update.month = revisedDate.getUTCMonth() + 1;
      update.day = revisedDate.getUTCDate();
      update.weekday = revisedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    }
    if (patch.celebration_name) update.celebration_name = patch.celebration_name;

    const { data, error } = await this.table().update(update).eq('id', id).select('*').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        return {
          errorMessage: `Another event from the same source already exists on ${patch.date}. Revise that event instead, or change only the celebration name here.`,
        };
      }
      return { errorMessage: error.message || 'Failed to revise the record.' };
    }
    return data
      ? { record: data as unknown as LiturgicalCalendarRecord }
      : { errorMessage: 'Record not found.' };
  }

  async rejectRecord(
    id: string,
    reason: string,
    reviewedBy: string,
  ): Promise<LiturgicalCalendarRecord | null> {
    const { data, error } = await this.table()
      .update({
        review_status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: reason,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[liturgical-calendar.service] rejectRecord:', error.message);
      return null;
    }
    return data as unknown as LiturgicalCalendarRecord | null;
  }

  async approveAll(filters: LiturgicalCalendarFilters, reviewedBy: string): Promise<{ approved: number }> {
    let query = this.table()
      .update({ review_status: 'approved', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
      .eq('review_status', 'pending');
    if (filters.season && filters.season !== 'all') query = query.eq('liturgical_season', filters.season);
    if (filters.month) query = query.eq('month', filters.month);
    if (filters.year) query = query.eq('year', filters.year);
    if (filters.celebration) query = query.ilike('celebration_name', `%${filters.celebration}%`);
    if (filters.reason) {
      const reason = this.safeSearch(filters.reason);
      query = query.or(`review_notes.ilike.%${reason}%,validation_reason.ilike.%${reason}%`);
    }
    if (filters.validation && filters.validation !== 'all') {
      query = query.in(
        'validation_status',
        filters.validation === 'matched' ? MATCHED_STATUSES : MISMATCHED_STATUSES,
      );
    }
    const { data, error } = await query.select('id');
    if (error) {
      console.error('[liturgical-calendar.service] approveAll:', error.message);
      return { approved: 0 };
    }
    return { approved: data?.length ?? 0 };
  }
}
