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

@Injectable()
export class ScenarioService {
  constructor(private supabase: SupabaseService) {}

  // ===== INSTITUTION SCENARIOS =====

  async createInstitutionScenario(
    createdById: string,
    dto: CreateInstitutionScenarioDto,
  ): Promise<InstitutionScenario> {
    const { data, error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
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
    const { error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
      .from('priest_reassignment_scenarios')
      .select('*')
      .eq('created_by_id', createdById)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data || []).map((item) => this.mapPriestScenario(item));
  }

  async getPriestScenario(scenarioId: string, createdById: string): Promise<PriestScenario> {
    const { data, error } = await this.supabase.admin
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
    const { error } = await this.supabase.admin
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
    const { data, error } = await this.supabase.admin
      .from('priest_reassignment_scenarios')
      .update({ is_archived: isArchived })
      .eq('id', scenarioId)
      .eq('created_by_id', createdById)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.mapPriestScenario(data);
  }

  // ===== HELPERS =====

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
