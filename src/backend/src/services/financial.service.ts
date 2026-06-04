import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { FinancialRecord, EntityClass } from '../types';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS } from '../constants';
import { newId } from '../utils/store';

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

const INSTITUTION_SCORES: Record<string, { score: number; type: string }> = {
  default: { score: 83, type: 'parish' },
  parish_01: { score: 83, type: 'parish' },
  school_01: { score: 76, type: 'school' },
  seminary_01: { score: 72, type: 'seminary' },
  'San Pablo Cathedral': { score: 91.4, type: 'parish' },
  'San Isidro Labrador (Biñan)': { score: 88.7, type: 'parish' },
  'St. John the Baptist (Calamba)': { score: 86.2, type: 'parish' },
  'St. Polycarp (Cabuyao)': { score: 84.5, type: 'parish' },
  'Immaculate Conception (Los Baños)': { score: 82.9, type: 'parish' },
  'St. Rose of Lima (Sta. Rosa)': { score: 81.1, type: 'parish' },
  'Holy Family Parish (Sta. Rosa)': { score: 79.8, type: 'parish' },
  'San Antonio de Padua (Pila)': { score: 78.3, type: 'parish' },
  'St. Augustine (Bay)': { score: 77.0, type: 'parish' },
  'St. Sebastian (Lumban)': { score: 75.6, type: 'parish' },
  'St. James the Apostle (Paete)': { score: 44.8, type: 'parish' },
  'St. Gregory the Great (Majayjay)': { score: 42.1, type: 'parish' },
  'St. Bartholomew (Nagcarlan)': { score: 39.5, type: 'parish' },
  'St. Mary Magdalene (Magdalena)': { score: 37.2, type: 'parish' },
  'St. John the Baptist (Liliw)': { score: 35.4, type: 'parish' },
  'St. Peter of Alcantara (Pakil)': { score: 33.1, type: 'parish' },
  'Our Lady of Holy Rosary (Luisiana)': { score: 31.8, type: 'parish' },
  'St. Sebastian (Famy)': { score: 29.5, type: 'parish' },
  'St. Joseph the Worker (Cavinti)': { score: 27.2, type: 'parish' },
  'Our Lady of Nativity (Pangil)': { score: 25.1, type: 'parish' },
  'San Lorenzo Ruiz (San Pablo)': { score: 18.5, type: 'parish' },
  'St. Therese of the Child Jesus (Los Baños)': { score: 95.2, type: 'parish' },
  'Liceo de San Pablo': { score: 69.4, type: 'school' },
  'Liceo de Calamba': { score: 66.7, type: 'school' },
  'Liceo de Cabuyao': { score: 63.5, type: 'school' },
  'Liceo de Los Baños': { score: 60.2, type: 'school' },
  'Liceo de Bay': { score: 57.8, type: 'school' },
  "St. Peter's College Seminary": { score: 59.3, type: 'seminary' },
  'San Pablo Formation House': { score: 56.1, type: 'seminary' },
  'Diocesan Memorial Seminary': { score: 53.4, type: 'seminary' },
  'Holy Cross Seminary': { score: 50.2, type: 'seminary' },
  'Our Lady of Guadalupe Seminary': { score: 47.5, type: 'seminary' },
};

@Injectable()
export class FinancialService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private toRecord(row: any): FinancialRecord {
    return {
      id: row.id,
      month: row.month,
      year: row.year != null ? Number(row.year) : undefined,
      collections: Number(row.collections),
      consumableCollections: Number(row.consumable_collections),
      disbursements: Number(row.disbursements),
      netReceipts: row.net_receipts != null ? Number(row.net_receipts) : undefined,
      sacraments_rate: row.sacraments_rate != null ? Number(row.sacraments_rate) : undefined,
      sacraments_arancel: row.sacraments_arancel != null ? Number(row.sacraments_arancel) : undefined,
      sacraments_parishShare: row.sacraments_parish_share != null ? Number(row.sacraments_parish_share) : undefined,
      sacraments_overAbove: row.sacraments_over_above != null ? Number(row.sacraments_over_above) : undefined,
      collections_mass: row.collections_mass != null ? Number(row.collections_mass) : undefined,
      collections_other: row.collections_other != null ? Number(row.collections_other) : undefined,
      collections_otherReceipts:
        row.collections_other_receipts != null ? Number(row.collections_other_receipts) : undefined,
      expenses_pastoral: row.expenses_pastoral != null ? Number(row.expenses_pastoral) : undefined,
      expenses_parish: row.expenses_parish != null ? Number(row.expenses_parish) : undefined,
      others_massIntentionsNotClaimed:
        row.others_mass_intentions_not_claimed != null ? Number(row.others_mass_intentions_not_claimed) : undefined,
      others_massIntentionsClaimed:
        row.others_mass_intentions_claimed != null ? Number(row.others_mass_intentions_claimed) : undefined,
      others_specialCollections:
        row.others_special_collections != null ? Number(row.others_special_collections) : undefined,
      pastoralParishFundTotalNetReceipts:
        row.pastoral_parish_fund_total_net_receipts != null
          ? Number(row.pastoral_parish_fund_total_net_receipts)
          : undefined,
      entityId: row.entity_id,
      entityType: row.entity_type,
      entityClass: row.entity_class ?? undefined,
      timestamp: row.record_timestamp ?? undefined,
    };
  }

  private fromRecord(r: FinancialRecord): Record<string, unknown> {
    const row: Record<string, unknown> = {
      month: r.month,
      year: r.year ?? null,
      collections: r.collections,
      consumable_collections: r.consumableCollections,
      disbursements: r.disbursements,
      net_receipts: r.netReceipts ?? null,
      sacraments_rate: r.sacraments_rate ?? null,
      sacraments_arancel: r.sacraments_arancel ?? null,
      sacraments_parish_share: r.sacraments_parishShare ?? null,
      sacraments_over_above: r.sacraments_overAbove ?? null,
      collections_mass: r.collections_mass ?? null,
      collections_other: r.collections_other ?? null,
      collections_other_receipts: r.collections_otherReceipts ?? null,
      expenses_pastoral: r.expenses_pastoral ?? null,
      expenses_parish: r.expenses_parish ?? null,
      others_mass_intentions_not_claimed: r.others_massIntentionsNotClaimed ?? null,
      others_mass_intentions_claimed: r.others_massIntentionsClaimed ?? null,
      others_special_collections: r.others_specialCollections ?? null,
      pastoral_parish_fund_total_net_receipts: r.pastoralParishFundTotalNetReceipts ?? null,
      entity_id: r.entityId,
      entity_type: r.entityType,
      entity_class: r.entityClass ?? null,
      record_timestamp: r.timestamp ?? null,
    };
    if (r.id && r.id.startsWith('FIN-')) {
      row.id = r.id;
    }
    return row;
  }

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

    if (INSTITUTION_SCORES[entityId]) {
      healthProfile = 0.3 + ((INSTITUTION_SCORES[entityId].score - 25) / 70) * 1.5;
    }

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

  async getRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialRecord[]> {
    const { data, error } = await this.supabaseService.supabaseServer
      .from('financial_records')
      .select('*')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('record_timestamp', { ascending: true });

    if (error) {
      console.error('[financial.service] getRecords error:', error.message);
      return this.generateRecords(entityId, entityType, entityClass);
    }

    if (data && data.length > 0) return data.map((d) => this.toRecord(d));

    // Seed data
    const generated = this.generateRecords(entityId, entityType, entityClass);
    const rows = generated.map((g) => this.fromRecord(g));
    const { error: insertError } = await this.supabaseService.supabaseServer.from('financial_records').insert(rows);
    if (insertError) console.error('[financial.service] seed insert error:', insertError.message);
    return generated;
  }

  async getAllRecords(): Promise<FinancialRecord[]> {
    const { data, error } = await this.supabaseService.supabaseServer
      .from('financial_records')
      .select('*')
      .order('record_timestamp', { ascending: true });

    if (error) {
      console.error('[financial.service] getAllRecords error:', error.message);
      return [];
    }

    if (data && data.length > 0) return data.map((d) => this.toRecord(d));

    const entities: { id: string; type: 'parish' | 'seminary' | 'school'; class: EntityClass }[] = [];
    ALL_PARISHES.forEach((p) => entities.push({ id: p.name, type: 'parish', class: p.class as EntityClass }));
    INITIAL_SEMINARIES.forEach((s) => entities.push({ id: s.name, type: 'seminary', class: s.class as EntityClass }));
    INITIAL_SCHOOLS.forEach((s) => entities.push({ id: s.name, type: 'school', class: s.class as EntityClass }));

    Object.entries(INSTITUTION_SCORES).forEach(([name, info]) => {
      if (!entities.find((e) => e.id === name)) {
        let cls: EntityClass = 'Class C';
        if (info.score > 85) cls = 'Class A';
        else if (info.score > 75) cls = 'Class B';
        else if (info.score < 35) cls = 'Class E';
        else if (info.score < 45) cls = 'Class D';
        entities.push({ id: name, type: info.type as any, class: cls });
      }
    });

    const allGenerated: FinancialRecord[] = [];
    for (const e of entities) {
      const records = this.generateRecords(e.id, e.type, e.class);
      allGenerated.push(...records);
    }

    const { error: bulkErr } = await this.supabaseService.supabaseServer
      .from('financial_records')
      .insert(allGenerated.map((g) => this.fromRecord(g)));
    if (bulkErr) console.error('[financial.service] bulk seed error:', bulkErr.message);

    return allGenerated;
  }

  async saveRecord(record: FinancialRecord): Promise<FinancialRecord> {
    const row = this.fromRecord(record);
    const { data, error } = await this.supabaseService.supabaseServer
      .from('financial_records')
      .upsert(row)
      .select()
      .single();

    if (error || !data) {
      console.error('[financial.service] saveRecord error:', error?.message);
      return record;
    }
    return this.toRecord(data);
  }

  async deleteRecord(id: string): Promise<void> {
    const { error } = await this.supabaseService.supabaseServer.from('financial_records').delete().eq('id', id);
    if (error) console.error('[financial.service] deleteRecord error:', error.message);
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
