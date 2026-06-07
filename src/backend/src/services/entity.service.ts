import { Injectable } from '@nestjs/common';
import { Parish, DiocesanSchool, Seminary } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { SupabaseService } from './supabase.service';

type EntityType = 'parish' | 'seminary' | 'school';

const MONTH_ORDER: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

@Injectable()
export class EntityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private tableFor(type: string | null): string | null {
    if (type === 'parish') return 'parishes';
    if (type === 'seminary') return 'seminaries';
    if (type === 'school') return 'diocesan_schools';
    return null;
  }

  getParishes(): Parish[] {
    return ALL_PARISHES as Parish[];
  }

  getSchools(): DiocesanSchool[] {
    return INITIAL_SCHOOLS as DiocesanSchool[];
  }

  getSeminaries(): Seminary[] {
    return INITIAL_SEMINARIES as Seminary[];
  }

  getAll(): { parishes: Parish[]; schools: DiocesanSchool[]; seminaries: Seminary[] } {
    return {
      parishes: this.getParishes(),
      schools: this.getSchools(),
      seminaries: this.getSeminaries(),
    };
  }

  // Live database administrative calls (falling back to constants)
  async getAdminEntities(type?: EntityType, includeAll = false): Promise<any> {
    const table = this.tableFor(type ?? null);
    if (table) {
      let q: any = this.supabaseService.supabaseServer.from(table).select('*').order('name');
      if (!includeAll) q = q.eq('status', 'active');

      const { data, error } = await q;
      if (error || !data?.length) {
        return type === 'parish' ? this.getParishes() : type === 'seminary' ? this.getSeminaries() : this.getSchools();
      }
      return data;
    }

    const [par, sem, sch] = await Promise.all([
      this.supabaseService.supabaseServer.from('parishes').select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('seminaries').select('*').eq('status', 'active').order('name'),
      this.supabaseService.supabaseServer.from('diocesan_schools').select('*').eq('status', 'active').order('name'),
    ]);

    if (par.error) {
      return this.getAll();
    }

    return {
      parishes: par.data ?? [],
      seminaries: sem.data ?? [],
      schools: sch.data ?? [],
    };
  }

  async createAdminEntity(type: EntityType, entity: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table) throw new Error('Invalid type');

    const { data, error } = await this.supabaseService.supabaseServer.from(table).insert(entity).select().single();
    if (error) throw error;
    return data;
  }

  async updateAdminEntity(type: EntityType, id: string, updates: any): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    const { data, error } = await this.supabaseService.supabaseServer
      .from(table)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateOwnInstitution(type: EntityType, id: string, contactNumber?: string, email?: string): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (type === 'parish') {
      if (contactNumber !== undefined) updatePayload.contact_number = contactNumber;
      if (email !== undefined) updatePayload.email = email;
    } else {
      if (contactNumber !== undefined) {
        updatePayload.contact_number = contactNumber;
        updatePayload.contactNumber = contactNumber;
      }
      if (email !== undefined) updatePayload.email = email;
    }

    const { data, error } = await this.supabaseService.supabaseServer
      .from(table)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getGeoInstitutions(): Promise<any[]> {
    const { data: institutions, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('institutions')
      .select('id, name, vicariate, class, latitude, longitude')
      .eq('institution_type', 'parish')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('name');

    if (error || !institutions?.length) {
      return ALL_PARISHES.map((p: any) => ({
        id: p.id ?? null,
        name: p.name,
        vicariate: p.vicariate ?? '',
        class: p.class ?? '',
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        collections: p.collections ?? 0,
      }));
    }

    const ids = institutions.map((i: any) => i.id);
    const { data: records } = await this.supabaseService.admin
      .schema('parishes')
      .from('financial_records')
      .select('institution_id, net_receipts, year, month')
      .in('institution_id', ids)
      .eq('is_current_version', true)
      .is('deleted_at', null);

    const collectionsMap: Record<string, number> = {};
    (records ?? []).forEach((r: any) => {
      const existing = collectionsMap[r.institution_id];
      if (existing === undefined) {
        collectionsMap[r.institution_id] = r.net_receipts ?? 0;
      } else {
        const existingRecord = (records ?? []).find(
          (x: any) =>
            x.institution_id === r.institution_id && collectionsMap[r.institution_id] === (x.net_receipts ?? 0),
        );
        const existingYear = existingRecord?.year ?? 0;
        const existingMonth = MONTH_ORDER[existingRecord?.month ?? ''] ?? 0;
        if (r.year > existingYear || (r.year === existingYear && MONTH_ORDER[r.month] > existingMonth)) {
          collectionsMap[r.institution_id] = r.net_receipts ?? 0;
        }
      }
    });

    return institutions.map((i: any) => ({
      id: i.id,
      name: i.name,
      vicariate: i.vicariate ?? '',
      class: i.class ? `Class ${i.class}` : '',
      lat: i.latitude,
      lng: i.longitude,
      collections: collectionsMap[i.id] ?? 0,
    }));
  }

  // ─── Financial profiles (Digital Twin + What-If Simulator) ───────────────────

  async getFinancialProfiles(type?: EntityType): Promise<any[]> {
    const result: any[] = [];

    if (!type || type === 'parish') {
      const { data: institutions } = await this.supabaseService.admin
        .schema('diocese')
        .from('institutions')
        .select('id, name, vicariate, class')
        .eq('institution_type', 'parish')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');

      if (institutions?.length) {
        const ids = institutions.map((i: any) => i.id);
        const { data: records } = await this.supabaseService.admin
          .schema('parishes')
          .from('financial_records')
          .select('institution_id, net_receipts, year, month, ending_balance_after_remit, beginning_balance')
          .in('institution_id', ids)
          .eq('is_current_version', true)
          .is('deleted_at', null);

        // Group records by institution and sort desc by year/month
        const byInst: Record<string, any[]> = {};
        (records ?? []).forEach((r: any) => {
          if (!byInst[r.institution_id]) byInst[r.institution_id] = [];
          byInst[r.institution_id].push(r);
        });
        Object.values(byInst).forEach((recs) =>
          recs.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return (MONTH_ORDER[b.month] ?? 0) - (MONTH_ORDER[a.month] ?? 0);
          }),
        );

        for (const inst of institutions) {
          const recs = (byInst[inst.id] ?? []).slice(0, 6);
          const collectionsHistory = recs.map((r: any) => Number(r.net_receipts ?? 0)).reverse();
          const expensesHistory = recs
            .map((r: any) =>
              Math.max(
                0,
                Number(r.net_receipts ?? 0) +
                  Number(r.beginning_balance ?? 0) -
                  Number(r.ending_balance_after_remit ?? 0),
              ),
            )
            .reverse();
          const currentBalance = Number(recs[0]?.ending_balance_after_remit ?? 0);
          const monthlyCollections = collectionsHistory.length
            ? collectionsHistory.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, collectionsHistory.length)
            : 0;
          const monthlyExpenses = expensesHistory.length
            ? expensesHistory.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, expensesHistory.length)
            : 0;
          const { healthScore, risk } = this.computeFinancialHealthScore(
            monthlyCollections,
            monthlyExpenses,
            currentBalance,
            collectionsHistory,
          );
          const trend = this.computeCollectionTrend(collectionsHistory);

          result.push({
            id: inst.id,
            name: inst.name,
            type: 'parish',
            location: inst.vicariate ?? '',
            class: inst.class ? `Class ${inst.class}` : '',
            healthScore,
            risk,
            currentBalance,
            monthlyCollections,
            monthlyExpenses,
            collectionsHistory,
            expensesHistory,
            trend,
            insight: this.generateFinancialInsight(healthScore, trend),
          });
        }
      } else {
        // Fallback: use ALL_PARISHES constants
        ALL_PARISHES.forEach((p: any, i: number) => {
          const mc = Math.round((p.collections ?? 0) / 12);
          result.push(this.buildFallbackProfile(String(i + 1), p.name, 'parish', p.vicariate ?? '', p.class ?? '', mc));
        });
      }
    }

    // Schools and seminaries: use constants until their institutions are seeded in diocese.institutions
    if (!type || type === 'school') {
      INITIAL_SCHOOLS.forEach((s: any) =>
        result.push(this.buildFallbackProfile(s.id, s.name, 'school', s.vicariate ?? '', s.class ?? '', 0)),
      );
    }

    if (!type || type === 'seminary') {
      INITIAL_SEMINARIES.forEach((s: any) =>
        result.push(this.buildFallbackProfile(s.id, s.name, 'seminary', s.vicariate ?? '', s.class ?? '', 0)),
      );
    }

    return result;
  }

  private computeFinancialHealthScore(
    income: number,
    expenses: number,
    balance: number,
    history: number[],
  ): { healthScore: number; risk: 'Low' | 'Moderate' | 'High' } {
    if (income === 0 && expenses === 0 && balance === 0) return { healthScore: 50, risk: 'Moderate' };

    const surplusRatio = income > 0 ? (income - expenses) / income : -1;
    const surplusScore = Math.max(0, Math.min(1, surplusRatio + 0.5));
    const coverageScore = expenses > 0 ? Math.min(1, balance / (expenses * 3)) : income > 0 ? 0.5 : 0;

    let consistencyScore = 0.5;
    if (history.length >= 3) {
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      if (avg > 0) {
        const variance = history.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / history.length;
        consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / avg);
      }
    }

    const raw = 0.4 * surplusScore + 0.3 * coverageScore + 0.3 * consistencyScore;
    const healthScore = Math.min(99, Math.max(10, Math.round(raw * 100)));
    const risk: 'Low' | 'Moderate' | 'High' = healthScore >= 75 ? 'Low' : healthScore >= 55 ? 'Moderate' : 'High';
    return { healthScore, risk };
  }

  private computeCollectionTrend(history: number[]): string {
    if (history.length < 4) return '0.0%';
    const half = Math.floor(history.length / 2);
    const older = history.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const recent = history.slice(-half).reduce((a, b) => a + b, 0) / half;
    if (older === 0) return '0.0%';
    const pct = ((recent - older) / older) * 100;
    return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  }

  private generateFinancialInsight(score: number, trend: string): string {
    const up = trend.startsWith('+');
    if (score >= 80)
      return up
        ? 'Consistent collection growth with disciplined operating expenses.'
        : 'Strong reserves despite mixed collection trend.';
    if (score >= 65) return 'Stable financial position with moderate growth potential.';
    if (score >= 50) return 'Adequate reserves; monitor expense trajectory closely.';
    return 'Tight margins — financial review is recommended.';
  }

  private buildFallbackProfile(
    id: string,
    name: string,
    type: EntityType,
    location: string,
    cls: string,
    monthlyCollections: number,
  ): any {
    const monthlyExpenses = Math.round(monthlyCollections * 0.85);
    const currentBalance = monthlyCollections * 2;
    const { healthScore, risk } = this.computeFinancialHealthScore(
      monthlyCollections,
      monthlyExpenses,
      currentBalance,
      [],
    );
    return {
      id,
      name,
      type,
      location,
      class: cls,
      healthScore,
      risk,
      currentBalance,
      monthlyCollections,
      monthlyExpenses,
      collectionsHistory: Array(6).fill(monthlyCollections),
      expensesHistory: Array(6).fill(monthlyExpenses),
      trend: '0.0%',
      insight: monthlyCollections > 0 ? 'Baseline data from diocese records.' : 'Awaiting submission data.',
    };
  }

  // ─── Priest health records ────────────────────────────────────────────────────

  async getPriestHealthRecords(): Promise<any[]> {
    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('priest_health_records')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    if (error) return [];
    return (data ?? []).map((r: any) => this.mapHealthRecord(r));
  }

  async savePriestHealthRecord(record: any): Promise<any> {
    const payload: any = {
      name: record.name,
      position: record.position ?? '',
      parish: record.parish ?? '',
      birth_date: record.birthDate ?? null,
      last_checkup: record.lastCheckup ?? null,
      health_status: record.healthStatus ?? 'good',
      notes: record.notes ?? '',
      email: record.email ?? '',
      phone: record.phone ?? '',
      updated_at: new Date().toISOString(),
    };

    if (record.id && !String(record.id).startsWith('__new')) {
      const { data, error } = await this.supabaseService.admin
        .schema('diocese')
        .from('priest_health_records')
        .update(payload)
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      return this.mapHealthRecord(data);
    }

    const { data, error } = await this.supabaseService.admin
      .schema('diocese')
      .from('priest_health_records')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return this.mapHealthRecord(data);
  }

  async deletePriestHealthRecord(id: string): Promise<void> {
    const { error } = await this.supabaseService.admin
      .schema('diocese')
      .from('priest_health_records')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  private mapHealthRecord(r: any): any {
    return {
      id: r.id,
      name: r.name,
      position: r.position,
      parish: r.parish,
      birthDate: r.birth_date,
      age: this.calculateAge(r.birth_date),
      lastCheckup: r.last_checkup,
      healthStatus: r.health_status,
      notes: r.notes,
      email: r.email,
      phone: r.phone,
    };
  }

  private calculateAge(birthDate: string | null): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  async deleteAdminEntity(type: EntityType, id: string, hardDelete = false): Promise<any> {
    const table = this.tableFor(type);
    if (!table || !id) throw new Error('type and id are required');

    if (hardDelete) {
      const { data, error } = await this.supabaseService.supabaseServer
        .from(table)
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabaseService.supabaseServer
        .from(table)
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }
}
