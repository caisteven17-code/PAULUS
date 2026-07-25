import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { FinancialRecord, EntityClass } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { newId } from '../utils/store';

// Loose shape of a `financial_records` row as returned by the untyped Supabase
// client — the schema is fixed but Supabase's own client here isn't generated,
// so unlisted columns fall through the index signature as `unknown`.
interface DomainRow {
  id?: string;
  month: string;
  year?: number | string | null;
  institution_class?: EntityClass;
  record_timestamp?: string;
  institution?: { name?: string } | null;
  institution_id?: string;
  [column: string]: unknown;
}

export const DEFAULT_RECORDS: Omit<FinancialRecord, 'entityId' | 'entityType'>[] = [
  { month: 'Jan', collections: 800000, consumableCollections: 650000, disbursements: 640000 },
  { month: 'Feb', collections: 720000, consumableCollections: 580000, disbursements: 610000 },
  { month: 'Mar', collections: 740000, consumableCollections: 600000, disbursements: 620000 },
  { month: 'Apr', collections: 950000, consumableCollections: 780000, disbursements: 680000 },
  { month: 'May', collections: 820000, consumableCollections: 670000, disbursements: 650000 },
  { month: 'Jun', collections: 760000, consumableCollections: 610000, disbursements: 630000 },
  { month: 'Jul', collections: 730000, consumableCollections: 590000, disbursements: 620000 },
  { month: 'Aug', collections: 750000, consumableCollections: 600000, disbursements: 620000 },
  { month: 'Sep', collections: 760000, consumableCollections: 610000, disbursements: 625000 },
  { month: 'Oct', collections: 770000, consumableCollections: 620000, disbursements: 630000 },
  { month: 'Nov', collections: 780000, consumableCollections: 630000, disbursements: 635000 },
  { month: 'Dec', collections: 1100000, consumableCollections: 900000, disbursements: 750000 },
];

@Injectable()
export class FinancialService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // ------------------------------------------------------------------
  // Domain schema helpers
  // ------------------------------------------------------------------

  private schema(entityType: string): string {
    if (entityType === 'parish') return 'parishes';
    if (entityType === 'school') return 'schools';
    return 'seminaries';
  }

  private db(schema: string) {
    return (this.supabaseService.supabaseServer as any).schema(schema);
  }

  private async resolveInstitutionId(name: string): Promise<string | null> {
    try {
      const { data } = await this.db('diocese').from('institutions').select('id').eq('name', name).single();
      return data?.id ?? null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Domain → FinancialRecord mapping per entity type
  // ------------------------------------------------------------------

  private num(v: unknown): number {
    return v != null ? Number(v) : 0;
  }

  private parishToRecord(row: DomainRow, name: string | undefined, entityClass?: EntityClass): FinancialRecord {
    const n = this.num.bind(this);
    const collections =
      n(row.sacraments_total) +
      n(row.confirmation_total) +
      n(row.mass_intentions_total) +
      n(row.mass_collection_weekday) +
      n(row.mass_collection_sunday) +
      n(row.mass_collection_saturday) +
      n(row.other_collections_total) +
      n(row.donations) +
      n(row.interest_income) +
      n(row.subsidy_inflow) +
      n(row.special_collections) +
      n(row.second_collections) +
      n(row.charge_over_above) +
      n(row.other_receipts);
    const disbursements =
      n(row.priest_share) +
      n(row.mass_stipend) +
      n(row.other_pastoral_expenses) +
      n(row.salaries_wages_benefits) +
      n(row.govt_contributions) +
      n(row.utilities) +
      n(row.communications) +
      n(row.other_rectory_expenses) +
      n(row.construction_expenses) +
      n(row.remittance_to_diocese) +
      n(row.bishops_fund_share) +
      n(row.special_collections_remittance);
    return {
      id: row.id,
      month: row.month,
      year: row.year != null ? Number(row.year) : undefined,
      entityId: name,
      entityType: 'parish',
      entityClass: row.institution_class ?? entityClass,
      collections,
      consumableCollections: n(row.consumable_collections),
      disbursements,
      netReceipts: n(row.net_receipts),
      expenses_pastoral: n(row.priest_share) + n(row.mass_stipend) + n(row.other_pastoral_expenses),
      expenses_parish:
        n(row.salaries_wages_benefits) +
        n(row.govt_contributions) +
        n(row.utilities) +
        n(row.communications) +
        n(row.other_rectory_expenses),
      collections_mass:
        n(row.mass_collection_weekday) + n(row.mass_collection_sunday) + n(row.mass_collection_saturday),
      collections_other: n(row.other_collections_total),
      collections_otherReceipts: n(row.other_receipts),
      sacraments_rate: n(row.sacraments_total),
      sacraments_arancel: n(row.confirmation_total),
      sacraments_parishShare: n(row.mass_intentions_claimed),
      sacraments_overAbove: n(row.charge_over_above),
      others_massIntentionsClaimed: n(row.mass_intentions_claimed),
      others_massIntentionsNotClaimed: n(row.mass_intentions_unclaimed),
      others_specialCollections: n(row.special_collections),
      pastoralParishFundTotalNetReceipts: n(row.pastoral_parish_fund_total_net_receipts),
      timestamp: row.record_timestamp ?? undefined,
    };
  }

  private schoolToRecord(row: DomainRow, name: string | undefined, entityClass?: EntityClass): FinancialRecord {
    const n = this.num.bind(this);
    const collections =
      n(row.tuition_revenues) + n(row.miscellaneous_fees) + n(row.other_income) + n(row.subsidy_inflow);
    const disbursements =
      n(row.faculty_payroll) +
      n(row.admin_staff_payroll) +
      n(row.utilities) +
      n(row.facilities_maintenance) +
      n(row.supplies) +
      n(row.other_expenses);
    return {
      id: row.id,
      month: row.month,
      year: row.year != null ? Number(row.year) : undefined,
      entityId: name,
      entityType: 'school',
      entityClass: row.institution_class ?? entityClass,
      collections,
      consumableCollections: n(row.tuition_revenues) + n(row.miscellaneous_fees) + n(row.other_income),
      disbursements,
      netReceipts: n(row.net_receipts),
      expenses_pastoral: n(row.faculty_payroll),
      expenses_parish:
        n(row.admin_staff_payroll) +
        n(row.utilities) +
        n(row.facilities_maintenance) +
        n(row.supplies) +
        n(row.other_expenses),
      timestamp: row.record_timestamp ?? undefined,
    };
  }

  private seminaryToRecord(row: DomainRow, name: string | undefined, entityClass?: EntityClass): FinancialRecord {
    const n = this.num.bind(this);
    const collections =
      n(row.donations) +
      n(row.seminary_fees) +
      n(row.mass_collections) +
      n(row.other_sources) +
      n(row.subsidy_from_rbscp) +
      n(row.tuition_fees) +
      n(row.board_lodging_fees) +
      n(row.drm_modules) +
      n(row.sra_reading_lab) +
      n(row.retreat) +
      n(row.honorarium_fee) +
      n(row.miscellaneous_fees);
    return {
      id: row.id,
      month: row.month,
      year: row.year != null ? Number(row.year) : undefined,
      entityId: name,
      entityType: 'seminary',
      entityClass: row.institution_class ?? entityClass,
      collections,
      consumableCollections:
        n(row.seminary_fees) + n(row.mass_collections) + n(row.tuition_fees) + n(row.board_lodging_fees),
      disbursements: n(row.total_expenses),
      netReceipts: n(row.net_surplus),
      expenses_pastoral: n(row.salaries_wages) + n(row.contribution_benefits) + n(row.cash_incentives),
      expenses_parish:
        n(row.daily_food) + n(row.food_others) + n(row.utilities) + n(row.repairs_maintenance) + n(row.other_expenses),
      timestamp: row.record_timestamp ?? undefined,
    };
  }

  private domainToRecord(row: DomainRow, name: string | undefined, entityType: string, entityClass?: EntityClass): FinancialRecord {
    if (entityType === 'parish') return this.parishToRecord(row, name, entityClass);
    if (entityType === 'school') return this.schoolToRecord(row, name, entityClass);
    return this.seminaryToRecord(row, name, entityClass);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async getRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialRecord[]> {
    try {
      const institutionId = await this.resolveInstitutionId(entityId);
      if (!institutionId) return this.generateRecords(entityId, entityType, entityClass);

      const { data, error } = await this.db(this.schema(entityType))
        .from('financial_records')
        .select('*')
        .eq('institution_id', institutionId)
        .order('record_timestamp', { ascending: true });

      if (error || !data || data.length === 0) {
        return this.generateRecords(entityId, entityType, entityClass);
      }

      return data.map((row: DomainRow) => this.domainToRecord(row, entityId, entityType, entityClass));
    } catch {
      return this.generateRecords(entityId, entityType, entityClass);
    }
  }

  async getAllRecords(): Promise<FinancialRecord[]> {
    const entityGroups: { name: string; type: 'parish' | 'school' | 'seminary'; class: EntityClass }[] = [];
    ALL_PARISHES.forEach((p) => entityGroups.push({ name: p.name, type: 'parish', class: p.class as EntityClass }));
    INITIAL_SCHOOLS.forEach((s) => entityGroups.push({ name: s.name, type: 'school', class: s.class as EntityClass }));
    INITIAL_SEMINARIES.forEach((s) =>
      entityGroups.push({ name: s.name, type: 'seminary', class: s.class as EntityClass }),
    );

    try {
      const schemas: Array<'parish' | 'school' | 'seminary'> = ['parish', 'school', 'seminary'];
      const results = await Promise.all(
        schemas.map(async (type) => {
          const { data, error } = await this.db(this.schema(type))
            .from('financial_records')
            .select('*, institution:institution_id(name)')
            .order('record_timestamp', { ascending: true });

          if (error || !data || data.length === 0) return [];
          return data.map((row: DomainRow) => this.domainToRecord(row, row.institution?.name ?? row.institution_id, type));
        }),
      );

      const allFromDb = results.flat();
      if (allFromDb.length > 0) return allFromDb;
    } catch {
      // fall through to generated
    }

    // Fall back: generate for every known entity
    return entityGroups.flatMap((e) => this.generateRecords(e.name, e.type, e.class));
  }

  async saveRecord(record: FinancialRecord): Promise<FinancialRecord> {
    // Write path: domain tables require different column sets per entity type.
    // For the prototype, writes are handled by the submission workflow.
    return record;
  }

  async deleteRecord(_id: string): Promise<void> {
    // Deletes are managed through the submission workflow, not directly here.
  }

  // ------------------------------------------------------------------
  // Mock data generation (used when DB is empty or unreachable)
  // ------------------------------------------------------------------

  private hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  private pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  private generateRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): FinancialRecord[] {
    const seed = this.hashString(entityId);
    let baseMultiplier = 0.1 + this.pseudoRandom(seed) * 9.9;
    let healthProfile = 0.2 + this.pseudoRandom(seed + 123) * 1.8;

    let classBonus = 0;
    if (entityClass === 'Class A') {
      classBonus = 0.3;
      baseMultiplier *= 2.0;
    }
    if (entityClass === 'Class B') {
      classBonus = 0.15;
      baseMultiplier *= 1.4;
    }
    if (entityClass === 'Class D') {
      classBonus = -0.15;
      baseMultiplier *= 0.7;
    }
    if (entityClass === 'Class E') {
      classBonus = -0.3;
      baseMultiplier *= 0.4;
    }

    const efficiencyFactor = 1.0 / healthProfile + this.pseudoRandom(seed + 456) * 0.5 - classBonus;
    const sustainabilityFactor = 0.7 * healthProfile + this.pseudoRandom(seed + 789) * 0.4 + classBonus;
    const fiestaMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][
      Math.floor(this.pseudoRandom(seed + 999) * 11)
    ];

    const YEARS = [2024, 2025, 2026];
    const yearMultipliers: Record<number, number> = { 2024: 0.92, 2025: 1.0, 2026: 1.07 };

    return YEARS.flatMap((year) =>
      DEFAULT_RECORDS.map((r, i) => {
        const ms = seed + i + year;
        const yMult = yearMultipliers[year] ?? 1.0;
        let colVar = 0.7 + this.pseudoRandom(ms) * 0.6;
        let disVar = 0.8 + this.pseudoRandom(ms + 100) * 0.4;

        if (r.month === fiestaMonth) {
          colVar *= 2.0;
          disVar *= 1.5;
        }
        if (entityType === 'school') {
          if (r.month === 'Jun' || r.month === 'Nov') colVar *= 3.0;
          if (r.month === 'Apr' || r.month === 'May') colVar *= 0.3;
        }
        if (entityType === 'seminary' && r.month === 'Aug') colVar *= 1.8;
        if (this.pseudoRandom(ms + 500) > 0.9) {
          if (this.pseudoRandom(ms + 600) > 0.5) colVar *= 1.7;
          else disVar *= 2.0;
        }

        const collections = Math.round(r.collections * baseMultiplier * colVar * yMult);
        const consumableCollections = Math.round(
          r.consumableCollections *
            baseMultiplier *
            sustainabilityFactor *
            (0.8 + this.pseudoRandom(ms + 200) * 0.4) *
            yMult,
        );
        const disbursements = Math.round(r.disbursements * baseMultiplier * efficiencyFactor * disVar * yMult);
        const netReceipts = collections - disbursements;

        return {
          id: newId(),
          month: r.month,
          year,
          entityId,
          entityType,
          entityClass,
          collections,
          consumableCollections,
          disbursements,
          netReceipts,
          sacraments_rate: Math.round(collections * 0.15),
          sacraments_arancel: Math.round(collections * 0.1),
          sacraments_parishShare: Math.round(collections * 0.08),
          sacraments_overAbove: Math.round(collections * 0.05),
          collections_mass: Math.round(collections * 0.4),
          collections_other: Math.round(collections * 0.12),
          collections_otherReceipts: Math.round(collections * 0.1),
          expenses_pastoral: Math.round(disbursements * 0.35),
          expenses_parish: Math.round(disbursements * 0.65),
          others_massIntentionsNotClaimed: Math.round(collections * 0.02),
          others_massIntentionsClaimed: Math.round(collections * 0.03),
          others_specialCollections: Math.round(collections * 0.05),
          pastoralParishFundTotalNetReceipts: netReceipts * 0.8,
        };
      }),
    );
  }

  parseCSV(
    csvText: string,
    entityId = 'default',
    entityType: 'parish' | 'seminary' | 'school' = 'parish',
  ): FinancialRecord[] {
    return csvText
      .split('\n')
      .slice(1)
      .filter((l) => l.trim())
      .map((line) => {
        const [month, collections, consumableCollections, disbursements] = line.split(',');
        return {
          month: month.trim(),
          collections: parseFloat(collections) || 0,
          consumableCollections: parseFloat(consumableCollections) || 0,
          disbursements: parseFloat(disbursements) || 0,
          entityId,
          entityType,
        };
      });
  }

  generateTemplateCSV(entityType = 'parish'): string {
    if (entityType === 'seminary') {
      return (
        'Month,Enrollment,Capacity,Staff,Collections,Disbursements\n' +
        DEFAULT_RECORDS.map(
          (r) => `${r.month},${Math.floor(Math.random() * 50)},60,8,${r.collections},${r.disbursements}`,
        ).join('\n')
      );
    }
    if (entityType === 'school') {
      return (
        'Month,Enrollment,Capacity,Staff,Level,Collections,Disbursements\n' +
        DEFAULT_RECORDS.map(
          (r) => `${r.month},${Math.floor(Math.random() * 1000)},1500,45,K-12,${r.collections},${r.disbursements}`,
        ).join('\n')
      );
    }
    if (entityType === 'diocese') {
      return (
        'Month,General Fund,Mission Fund,Cemetery Fund,Total Income,Total Expenses\n' +
        DEFAULT_RECORDS.map(
          (r) =>
            `${r.month},${r.collections * 0.6},${r.collections * 0.2},${r.collections * 0.2},${r.collections},${r.disbursements}`,
        ).join('\n')
      );
    }
    return (
      'Month,Collections / Receipts,Consumable Collections,Disbursements\n' +
      DEFAULT_RECORDS.map((r) => `${r.month},${r.collections},${r.consumableCollections},${r.disbursements}`).join('\n')
    );
  }
}
