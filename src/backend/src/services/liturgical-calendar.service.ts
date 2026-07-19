import { Injectable } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { AnalyticsDbService } from './analytics-db.service';

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

interface WhereClause {
  sql: string;
  params: unknown[];
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
  constructor(private readonly analyticsDb: AnalyticsDbService) {}

  private async refreshAnalytics(): Promise<void> {
    try {
      await this.analyticsDb.query('SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics()');
    } catch (error) {
      console.error(
        '[liturgical-calendar.service] refreshAnalytics:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private buildWhere(filters: LiturgicalCalendarFilters, pendingOnly = false): WhereClause {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (position: number) => string, value: unknown) => {
      params.push(value);
      clauses.push(clause(params.length));
    };

    if (pendingOnly) {
      add((position) => `review_status = $${position}`, 'pending');
    } else if (filters.status && filters.status !== 'all') {
      add((position) => `review_status = $${position}`, filters.status);
    }
    if (filters.season && filters.season !== 'all') {
      add((position) => `liturgical_season = $${position}`, filters.season);
    }
    if (filters.month) add((position) => `month = $${position}`, filters.month);
    if (filters.year) add((position) => `year = $${position}`, filters.year);
    if (filters.celebration) {
      add((position) => `celebration_name ILIKE $${position}`, `%${filters.celebration}%`);
    }
    if (filters.reason) {
      add(
        (position) => `(review_notes ILIKE $${position} OR validation_reason ILIKE $${position})`,
        `%${filters.reason}%`,
      );
    }
    if (filters.validation && filters.validation !== 'all') {
      add(
        (position) => `validation_status = ANY($${position}::text[])`,
        filters.validation === 'matched' ? MATCHED_STATUSES : MISMATCHED_STATUSES,
      );
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  async getRecords(filters: LiturgicalCalendarFilters): Promise<LiturgicalCalendarPage> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const where = this.buildWhere(filters);
    try {
      const countRows = await this.analyticsDb.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM reference.liturgical_calendar ${where.sql}`,
        where.params,
      );
      const records = await this.analyticsDb.query<LiturgicalCalendarRecord & Record<string, unknown>>(
        `SELECT * FROM reference.liturgical_calendar ${where.sql}
         ORDER BY date ASC, id ASC LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        [...where.params, pageSize, offset],
      );
      return { records, total: Number(countRows[0]?.total ?? 0), page, pageSize };
    } catch (error) {
      console.error('[liturgical-calendar.service] getRecords:', error instanceof Error ? error.message : error);
      return { records: [], total: 0, page, pageSize };
    }
  }

  async approveRecord(id: string, reviewedBy: string): Promise<LiturgicalCalendarRecord | null> {
    try {
      const rows = await this.analyticsDb.query<LiturgicalCalendarRecord & Record<string, unknown>>(
        `UPDATE reference.liturgical_calendar
         SET review_status = 'approved', reviewed_by = $2, reviewed_at = now()
         WHERE id = $1 RETURNING *`,
        [id, reviewedBy],
      );
      if (rows[0]) await this.refreshAnalytics();
      return rows[0] ?? null;
    } catch (error) {
      console.error('[liturgical-calendar.service] approveRecord:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async approveWithRevisions(
    id: string,
    patch: { date?: string; celebration_name?: string; name_source?: string },
    reviewedBy: string,
  ): Promise<{ record?: LiturgicalCalendarRecord; errorMessage?: string }> {
    try {
      const existingRows = await this.analyticsDb.query<
        { date: string; celebration_name: string } & Record<string, unknown>
      >('SELECT date, celebration_name FROM reference.liturgical_calendar WHERE id = $1', [id]);
      const existing = existingRows[0];
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
        revised: {
          date: patch.date,
          celebration_name: patch.celebration_name,
          name_source: patch.name_source,
        },
      };
      const rows = await this.analyticsDb.query<LiturgicalCalendarRecord & Record<string, unknown>>(
        `UPDATE reference.liturgical_calendar SET
           review_status = 'approved_with_revisions', reviewed_by = $2, reviewed_at = now(),
           revision_payload = $3::jsonb,
           date = COALESCE($4::date, date),
           year = COALESCE($5::smallint, year),
           month = COALESCE($6::smallint, month),
           day = COALESCE($7::smallint, day),
           weekday = COALESCE($8::text, weekday),
           celebration_name = COALESCE($9::text, celebration_name)
         WHERE id = $1 RETURNING *`,
        [
          id,
          reviewedBy,
          JSON.stringify(revisionPayload),
          patch.date ?? null,
          revisedDate?.getUTCFullYear() ?? null,
          revisedDate ? revisedDate.getUTCMonth() + 1 : null,
          revisedDate?.getUTCDate() ?? null,
          revisedDate?.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) ?? null,
          patch.celebration_name ?? null,
        ],
      );
      if (rows[0]) await this.refreshAnalytics();
      return rows[0] ? { record: rows[0] } : { errorMessage: 'Record not found.' };
    } catch (error) {
      console.error(
        '[liturgical-calendar.service] approveWithRevisions:',
        error instanceof Error ? error.message : error,
      );
      if (error instanceof DatabaseError && error.code === '23505') {
        return {
          errorMessage: `Another event from the same source already exists on ${patch.date}. Revise that event instead, or change only the celebration name here.`,
        };
      }
      return { errorMessage: 'Failed to revise the record.' };
    }
  }

  async rejectRecord(id: string, reason: string, reviewedBy: string): Promise<LiturgicalCalendarRecord | null> {
    try {
      const rows = await this.analyticsDb.query<LiturgicalCalendarRecord & Record<string, unknown>>(
        `UPDATE reference.liturgical_calendar
         SET review_status = 'rejected', reviewed_by = $2,
             reviewed_at = now(), review_notes = $3
         WHERE id = $1 RETURNING *`,
        [id, reviewedBy, reason],
      );
      if (rows[0]) await this.refreshAnalytics();
      return rows[0] ?? null;
    } catch (error) {
      console.error('[liturgical-calendar.service] rejectRecord:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async approveAll(filters: LiturgicalCalendarFilters, reviewedBy: string): Promise<{ approved: number }> {
    const where = this.buildWhere({ ...filters, status: undefined }, true);
    try {
      const rows = await this.analyticsDb.query<{ id: string }>(
        `UPDATE reference.liturgical_calendar
         SET review_status = 'approved', reviewed_by = $${where.params.length + 1}, reviewed_at = now()
         ${where.sql} RETURNING id`,
        [...where.params, reviewedBy],
      );
      if (rows.length) await this.refreshAnalytics();
      return { approved: rows.length };
    } catch (error) {
      console.error('[liturgical-calendar.service] approveAll:', error instanceof Error ? error.message : error);
      return { approved: 0 };
    }
  }
}
