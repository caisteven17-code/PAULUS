import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

// Institution Scenarios
export interface CreateInstitutionScenarioDto {
  institutionType: 'parish' | 'seminary' | 'school';
  institutionId: string;
  institutionName: string;
  name: string;
  description?: string;
  incomeChange: number;
  expensesChange: number;
  oneTimeIncome: number;
  oneTimeExpense: number;
  externalSupport: number;
  timelineMonths: number;
  // Results (calculated at save time)
  monthlyNet: number;
  runwayMonths: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  finalBalance: number;
  projectedData: any[];
  recommendation: string;
}

export interface InstitutionScenario extends CreateInstitutionScenarioDto {
  id: string;
  createdById: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isArchived: boolean;
}

// Priest Scenarios
export interface CreatePriestScenarioDto {
  priestId: string;
  priestName: string;
  targetParishId: string;
  targetParishName: string;
  name: string;
  description?: string;
  transitionSupport: 'standard' | 'assisted' | 'intensive';
  handoffWeeks: number;
  timelineMonths: number;
  // Results (calculated at save time)
  fitScore: number;
  targetLift: number;
  vacatedParishDip: number;
  dioceseLift: number;
  transitionRisk: number;
  riskBand: 'Low' | 'Medium' | 'High';
  confidence: number;
  projectedData: any[];
  recommendation: string;
}

export interface PriestScenario extends CreatePriestScenarioDto {
  id: string;
  createdById: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isArchived: boolean;
}

// Digital Twin Scenarios (bishop sandbox — adjusted values + historical replay)
export interface CreateDigitalTwinScenarioDto {
  institutionType: 'parish' | 'seminary' | 'school';
  institutionId?: string | null;
  institutionName: string;
  name: string;
  description?: string;
  startingMonth?: number | null;
  startingYear?: number | null;
  modifiedValues: Record<string, number>;
  replayResults?: any;
}

export interface DigitalTwinScenario extends CreateDigitalTwinScenarioDto {
  id: string;
  createdById: string;
  calculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isArchived: boolean;
}

@Injectable()
export class ScenarioService {
  constructor(private supabase: SupabaseService) {}

  // The JWT `sub` is the Supabase auth user id (profiles.external_auth_id),
  // but scenario rows reference profiles.id. Resolve before any query.
  // Demo/offline sessions carry a random non-UUID id and resolve to null.
  private async tryResolveProfileId(authUserId: string): Promise<string | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId);
    if (!isUuid) return null;

    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('profiles')
      .select('id')
      .or(`id.eq.${authUserId},external_auth_id.eq.${authUserId}`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return data?.id ?? null;
  }

  private async resolveProfileId(authUserId: string): Promise<string> {
    const profileId = await this.tryResolveProfileId(authUserId);
    if (!profileId) {
      throw new BadRequestException(
        'Session is not linked to a registered profile. Sign in with a registered account to save scenarios.',
      );
    }
    return profileId;
  }

  // ===== INSTITUTION SCENARIOS =====

  async createInstitutionScenario(
    createdById: string,
    dto: CreateInstitutionScenarioDto,
  ): Promise<InstitutionScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('institution_simulator_scenarios')
      .insert([
        {
          created_by_id: createdById,
          institution_type: dto.institutionType,
          institution_id: dto.institutionId,
          institution_name: dto.institutionName,
          name: dto.name,
          description: dto.description || null,
          income_change: dto.incomeChange,
          expenses_change: dto.expensesChange,
          one_time_income: dto.oneTimeIncome,
          one_time_expense: dto.oneTimeExpense,
          external_support: dto.externalSupport,
          timeline_months: dto.timelineMonths,
          monthly_net: dto.monthlyNet,
          runway_months: dto.runwayMonths,
          risk_level: dto.riskLevel,
          final_balance: dto.finalBalance,
          projected_data: dto.projectedData,
          recommendation: dto.recommendation,
          calculated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapInstitutionScenario(data);
  }

  async listInstitutionScenarios(createdById: string): Promise<InstitutionScenario[]> {
    const profileId = await this.tryResolveProfileId(createdById);
    if (!profileId) return []; // unlinked demo session — nothing saved, nothing to list
    createdById = profileId;
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('institution_simulator_scenarios')
      .select('*')
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data || []).map((item) => this.mapInstitutionScenario(item));
  }

  async getInstitutionScenario(
    scenarioId: string,
    createdById: string,
  ): Promise<InstitutionScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('institution_simulator_scenarios')
      .select('*')
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .single();

    if (error || !data) throw new NotFoundException('Scenario not found');
    return this.mapInstitutionScenario(data);
  }

  async deleteInstitutionScenario(scenarioId: string, createdById: string): Promise<void> {
    createdById = await this.resolveProfileId(createdById);
    const { error } = await this.supabase.admin
      .schema('diocese')
      .from('institution_simulator_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById);

    if (error) throw new BadRequestException(error.message);
  }

  async archiveInstitutionScenario(
    scenarioId: string,
    createdById: string,
    isArchived: boolean,
  ): Promise<InstitutionScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('institution_simulator_scenarios')
      .update({ is_archived: isArchived })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapInstitutionScenario(data);
  }

  // ===== PRIEST SCENARIOS =====

  async createPriestScenario(
    createdById: string,
    dto: CreatePriestScenarioDto,
  ): Promise<PriestScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('priest_reassignment_scenarios')
      .insert([
        {
          created_by_id: createdById,
          priest_id: dto.priestId,
          priest_name: dto.priestName,
          target_parish_id: dto.targetParishId,
          target_parish_name: dto.targetParishName,
          name: dto.name,
          description: dto.description || null,
          transition_support: dto.transitionSupport,
          handoff_weeks: dto.handoffWeeks,
          timeline_months: dto.timelineMonths,
          fit_score: dto.fitScore,
          target_lift: dto.targetLift,
          vacated_parish_dip: dto.vacatedParishDip,
          diocese_lift: dto.dioceseLift,
          transition_risk: dto.transitionRisk,
          risk_band: dto.riskBand,
          confidence: dto.confidence,
          projected_data: dto.projectedData,
          recommendation: dto.recommendation,
          calculated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapPriestScenario(data);
  }

  async listPriestScenarios(createdById: string): Promise<PriestScenario[]> {
    const profileId = await this.tryResolveProfileId(createdById);
    if (!profileId) return []; // unlinked demo session — nothing saved, nothing to list
    createdById = profileId;
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('priest_reassignment_scenarios')
      .select('*')
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data || []).map((item) => this.mapPriestScenario(item));
  }

  async getPriestScenario(scenarioId: string, createdById: string): Promise<PriestScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('priest_reassignment_scenarios')
      .select('*')
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .single();

    if (error || !data) throw new NotFoundException('Scenario not found');
    return this.mapPriestScenario(data);
  }

  async deletePriestScenario(scenarioId: string, createdById: string): Promise<void> {
    createdById = await this.resolveProfileId(createdById);
    const { error } = await this.supabase.admin
      .schema('diocese')
      .from('priest_reassignment_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById);

    if (error) throw new BadRequestException(error.message);
  }

  async archivePriestScenario(
    scenarioId: string,
    createdById: string,
    isArchived: boolean,
  ): Promise<PriestScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('priest_reassignment_scenarios')
      .update({ is_archived: isArchived })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapPriestScenario(data);
  }

  // ===== DIGITAL TWIN SCENARIOS =====

  async createDigitalTwinScenario(
    createdById: string,
    dto: CreateDigitalTwinScenarioDto,
  ): Promise<DigitalTwinScenario> {
    createdById = await this.resolveProfileId(createdById);
    // Demo/fallback institutions carry non-UUID ids; store null (column is uuid).
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      dto.institutionId ?? '',
    );
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('digital_twin_scenarios')
      .insert([
        {
          created_by_id: createdById,
          institution_type: dto.institutionType,
          institution_id: isUuid ? dto.institutionId : null,
          institution_name: dto.institutionName,
          name: dto.name,
          description: dto.description || null,
          starting_month: dto.startingMonth ?? null,
          starting_year: dto.startingYear ?? null,
          modified_values: dto.modifiedValues,
          replay_results: dto.replayResults ?? null,
          calculated_at: dto.replayResults ? new Date().toISOString() : null,
        },
      ])
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapDigitalTwinScenario(data);
  }

  async listDigitalTwinScenarios(createdById: string): Promise<DigitalTwinScenario[]> {
    const profileId = await this.tryResolveProfileId(createdById);
    if (!profileId) return []; // unlinked demo session — nothing saved, nothing to list
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('digital_twin_scenarios')
      .select('*')
      .eq('created_by_id', profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data || []).map((item) => this.mapDigitalTwinScenario(item));
  }

  async getDigitalTwinScenario(scenarioId: string, createdById: string): Promise<DigitalTwinScenario> {
    createdById = await this.resolveProfileId(createdById);
    const { data, error } = await this.supabase.admin
      .schema('diocese')
      .from('digital_twin_scenarios')
      .select('*')
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .single();

    if (error || !data) throw new NotFoundException('Scenario not found');
    return this.mapDigitalTwinScenario(data);
  }

  async deleteDigitalTwinScenario(scenarioId: string, createdById: string): Promise<void> {
    createdById = await this.resolveProfileId(createdById);
    const { error } = await this.supabase.admin
      .schema('diocese')
      .from('digital_twin_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById);

    if (error) throw new BadRequestException(error.message);
  }

  // ===== HELPERS =====

  private mapDigitalTwinScenario(data: any): DigitalTwinScenario {
    return {
      id: data.id,
      createdById: data.created_by_id,
      institutionType: data.institution_type,
      institutionId: data.institution_id,
      institutionName: data.institution_name,
      name: data.name,
      description: data.description,
      startingMonth: data.starting_month,
      startingYear: data.starting_year,
      modifiedValues: data.modified_values,
      replayResults: data.replay_results,
      calculatedAt: data.calculated_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
      isArchived: data.is_archived,
    };
  }

  private mapInstitutionScenario(data: any): InstitutionScenario {
    return {
      id: data.id,
      createdById: data.created_by_id,
      institutionType: data.institution_type,
      institutionId: data.institution_id,
      institutionName: data.institution_name,
      name: data.name,
      description: data.description,
      incomeChange: Number(data.income_change),
      expensesChange: Number(data.expenses_change),
      oneTimeIncome: Number(data.one_time_income),
      oneTimeExpense: Number(data.one_time_expense),
      externalSupport: Number(data.external_support),
      timelineMonths: data.timeline_months,
      monthlyNet: Number(data.monthly_net),
      runwayMonths: data.runway_months,
      riskLevel: data.risk_level,
      finalBalance: Number(data.final_balance),
      projectedData: data.projected_data,
      recommendation: data.recommendation,
      calculatedAt: data.calculated_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
      isArchived: data.is_archived,
    };
  }

  private mapPriestScenario(data: any): PriestScenario {
    return {
      id: data.id,
      createdById: data.created_by_id,
      priestId: data.priest_id,
      priestName: data.priest_name,
      targetParishId: data.target_parish_id,
      targetParishName: data.target_parish_name,
      name: data.name,
      description: data.description,
      transitionSupport: data.transition_support,
      handoffWeeks: data.handoff_weeks,
      timelineMonths: data.timeline_months,
      fitScore: data.fit_score,
      targetLift: data.target_lift,
      vacatedParishDip: data.vacated_parish_dip,
      dioceseLift: data.diocese_lift,
      transitionRisk: data.transition_risk,
      riskBand: data.risk_band,
      confidence: data.confidence,
      projectedData: data.projected_data,
      recommendation: data.recommendation,
      calculatedAt: data.calculated_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
      isArchived: data.is_archived,
    };
  }
}
