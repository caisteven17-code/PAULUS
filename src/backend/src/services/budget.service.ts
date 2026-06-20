import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface InstitutionBudget {
  id: string;
  institution_id: string;
  institution_name?: string;
  institution_type?: string;
  year: number;
  month: number;
  amount: number;
  notes?: string;
  updated_at?: string;
}

export interface BudgetEntryInput {
  month: number;
  amount: number;
  notes?: string;
}

@Injectable()
export class BudgetService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private db() {
    return this.supabaseService.admin.schema('diocese');
  }

  private isUuid(value?: string): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  /** Resolve an institutions row id from a uuid or a name (+ optional type). */
  async resolveInstitutionId(institutionId?: string, institutionName?: string, institutionType?: string): Promise<string | null> {
    if (this.isUuid(institutionId)) {
      const { data } = await this.db().from('institutions').select('id').eq('id', institutionId).maybeSingle();
      if (data?.id) return data.id;
    }

    if (!institutionName) return null;

    let query = this.db()
      .from('institutions')
      .select('id')
      .eq('name', institutionName)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (
      institutionType === 'parish' ||
      institutionType === 'school' ||
      institutionType === 'seminary' ||
      institutionType === 'diocese'
    ) {
      query = query.eq('institution_type', institutionType);
    }

    const { data } = await query.limit(1).maybeSingle();
    return data?.id ?? null;
  }

  private toBudget(row: any, institution?: { name?: string; institution_type?: string }): InstitutionBudget {
    return {
      id: row.id,
      institution_id: row.institution_id,
      institution_name: institution?.name,
      institution_type: institution?.institution_type,
      year: row.year,
      month: row.month,
      amount: row.amount != null ? Number(row.amount) : 0,
      notes: row.notes ?? undefined,
      updated_at: row.updated_at,
    };
  }

  async getBudgets(filters: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
    year?: number;
  }): Promise<InstitutionBudget[]> {
    let scopedInstitutionId: string | null = null;
    if (filters.institutionId || filters.institutionName) {
      scopedInstitutionId = await this.resolveInstitutionId(
        filters.institutionId,
        filters.institutionName,
        filters.institutionType,
      );
      // A scope was requested but couldn't be resolved — return nothing rather
      // than leaking every institution's budget.
      if (!scopedInstitutionId) return [];
    }

    let query = this.db()
      .from('institution_budgets')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: true });

    if (scopedInstitutionId) query = query.eq('institution_id', scopedInstitutionId);
    if (filters.year) query = query.eq('year', filters.year);

    const { data, error } = await query;
    if (error) {
      console.error('[budget.service] getBudgets:', error.message);
      return [];
    }

    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Attach institution names for the diocese overview.
    const institutionIds = Array.from(new Set(rows.map((r: any) => r.institution_id)));
    const { data: institutions } = await this.db()
      .from('institutions')
      .select('id, name, institution_type')
      .in('id', institutionIds);

    const byId = new Map((institutions ?? []).map((i: any) => [i.id, i]));
    return rows.map((row: any) => this.toBudget(row, byId.get(row.institution_id)));
  }

  /** Upsert one year's worth of monthly entries for a single institution. */
  async saveBudgets(input: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
    year: number;
    entries: BudgetEntryInput[];
  }): Promise<InstitutionBudget[] | null> {
    const institutionId = await this.resolveInstitutionId(
      input.institutionId,
      input.institutionName,
      input.institutionType,
    );
    if (!institutionId) {
      console.error('[budget.service] saveBudgets: could not resolve institution', input.institutionName ?? input.institutionId);
      return null;
    }

    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    // Past-year budget plans are historical and cannot be edited.
    if (year < new Date().getFullYear()) {
      console.warn(`[budget.service] saveBudgets rejected: year ${year} is in the past.`);
      return null;
    }

    const rows = (input.entries ?? [])
      .filter((e) => Number.isInteger(Number(e.month)) && Number(e.month) >= 1 && Number(e.month) <= 12)
      .map((e) => ({
        institution_id: institutionId,
        year,
        month: Number(e.month),
        amount: Math.max(0, Number(e.amount) || 0),
        notes: e.notes?.trim() ? e.notes.trim() : null,
      }));
    if (rows.length === 0) return [];

    const { data, error } = await this.db()
      .from('institution_budgets')
      .upsert(rows, { onConflict: 'institution_id,year,month' })
      .select();

    if (error || !data) {
      console.error('[budget.service] saveBudgets:', error?.message);
      return null;
    }

    const { data: institution } = await this.db()
      .from('institutions')
      .select('name, institution_type')
      .eq('id', institutionId)
      .maybeSingle();

    return data.map((row: any) => this.toBudget(row, institution ?? undefined));
  }
}
