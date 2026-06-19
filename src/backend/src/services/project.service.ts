import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { Project, Donation, ProjectExpense } from '../types';

@Injectable()
export class ProjectService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private db() {
    return this.supabaseService.supabaseServer.schema('diocese');
  }

  private isUuid(value?: string): boolean {
    return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveInstitutionIds(entityId?: string, entityType?: string, entityName?: string): Promise<string[]> {
    if (entityId && this.isUuid(entityId)) return [entityId];

    const candidates = [entityId, entityName]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    if (entityType === 'diocese' && !candidates.some((value) => value.toLowerCase() === 'diocese of san pablo')) {
      candidates.push('Diocese of San Pablo');
    }

    let query: any = this.db().from('institutions').select('id, name').is('deleted_at', null);
    if (entityType) query = query.eq('institution_type', entityType);

    const { data, error } = await query;
    if (error) {
      console.error('[project.service] resolveInstitutionIds error:', error.message);
      return [];
    }

    if (!candidates.length) return (data ?? []).map((row: any) => row.id);

    const candidateSet = new Set(candidates.map((value) => value.toLowerCase()));
    const found = (data ?? [])
      .filter((row: any) => candidateSet.has(String(row.name ?? '').toLowerCase()))
      .map((row: any) => row.id);

    // Auto-register seminary/school institutions that are not yet in diocese.institutions.
    if (found.length === 0 && entityName && entityType && entityType !== 'diocese') {
      const insertName = entityName.trim();
      const { data: created, error: insertErr } = await this.db()
        .from('institutions')
        .insert({ name: insertName, institution_type: entityType, is_active: true })
        .select('id')
        .single();
      if (!insertErr && created?.id) return [created.id];
      // If insert failed (e.g. duplicate), try fetching the existing record.
      const { data: existing } = await this.db()
        .from('institutions')
        .select('id')
        .eq('name', insertName)
        .eq('institution_type', entityType)
        .is('deleted_at', null)
        .single();
      if (existing?.id) return [existing.id];
    }

    return found;
  }

  private toProject(row: any): Project {
    const institution = Array.isArray(row.institution) ? row.institution[0] : row.institution;
    const entityType = (row.entity_type ?? institution?.institution_type ?? 'parish') as Project['entityType'];
    const entityId = row.entity_id ?? row.institution_id ?? '';

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      fundUsage: row.fund_usage ?? '',
      targetAmount: Number(row.target_amount),
      currentAmount: Number(row.current_amount),
      startDate: row.start_date ?? '',
      endDate: row.end_date ?? '',
      category: row.category,
      status: row.status,
      beneficiaries: row.beneficiaries ?? undefined,
      coverImage: row.cover_image ?? undefined,
      contactPerson: row.contact_person ?? undefined,
      healthScore: Number(row.health_score ?? 0),
      successProbability: Number(row.success_probability ?? 0),
      recommendation: row.recommendation ?? '',
      totalExpenses: row.total_expenses != null ? Number(row.total_expenses) : undefined,
      entityId,
      entityName: institution?.name ?? row.entity_name ?? row.entity_id ?? entityId,
      entityType,
    };
  }

  private fromProject(p: Project): Record<string, unknown> {
    const row: Record<string, unknown> = {
      name: p.name,
      description: p.description,
      fund_usage: p.fundUsage,
      target_amount: p.targetAmount,
      current_amount: p.currentAmount,
      start_date: p.startDate,
      end_date: p.endDate,
      category: p.category,
      status: p.status,
      beneficiaries: p.beneficiaries ?? null,
      cover_image: p.coverImage ?? null,
      contact_person: p.contactPerson ?? null,
      health_score: p.healthScore,
      success_probability: p.successProbability,
      recommendation: p.recommendation,
      total_expenses: p.totalExpenses ?? null,
      institution_id: p.entityId,
    };
    if (p.id && (this.isUuid(p.id) || p.id.startsWith('PRJ-'))) row.id = p.id;
    return row;
  }

  private toDonation(row: any): Donation {
    return {
      id: row.id,
      projectId: row.project_id,
      donorName: row.donor_name ?? undefined,
      amount: Number(row.amount),
      date: row.date ?? '',
      paymentMethod: row.payment_method,
      receiptIssued: row.receipt_issued ?? false,
      receiptProofName: row.receipt_proof_name ?? undefined,
      notes: row.notes ?? undefined,
    };
  }

  private fromDonation(d: Donation): Record<string, unknown> {
    const row: Record<string, unknown> = {
      project_id: d.projectId,
      donor_name: d.donorName ?? null,
      amount: d.amount,
      date: d.date,
      payment_method: d.paymentMethod,
      receipt_issued: d.receiptIssued ?? false,
      receipt_proof_name: d.receiptProofName ?? null,
      notes: d.notes ?? null,
    };
    if (d.id && (this.isUuid(d.id) || d.id.startsWith('DON-'))) row.id = d.id;
    return row;
  }

  private toExpense(row: any): ProjectExpense {
    return {
      id: row.id,
      projectId: row.project_id,
      description: row.description,
      amount: Number(row.amount),
      date: row.date ?? '',
      paymentMethod: row.payment_method,
      notes: row.notes ?? undefined,
      receiptReference: row.receipt_reference ?? undefined,
      proofFileName: row.proof_file_name ?? undefined,
    };
  }

  private fromExpense(e: ProjectExpense): Record<string, unknown> {
    const row: Record<string, unknown> = {
      project_id: e.projectId,
      description: e.description,
      amount: e.amount,
      date: e.date,
      payment_method: e.paymentMethod,
      notes: e.notes ?? null,
      receipt_reference: e.receiptReference ?? null,
      proof_file_name: e.proofFileName ?? null,
    };
    if (e.id && (this.isUuid(e.id) || e.id.startsWith('EXP-'))) row.id = e.id;
    return row;
  }

  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    let query: any = this.db()
      .from('projects')
      .select('*, institution:institutions(id, name, institution_type)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (entityType === 'diocese') {
      // bishop sees all
    } else {
      const ids = await this.resolveInstitutionIds(entityId, entityType);
      if ((entityId || entityType) && ids.length === 0) return [];
      if (ids.length === 1) query = query.eq('institution_id', ids[0]);
      if (ids.length > 1) query = query.in('institution_id', ids);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getProjects error:', error.message);
      return [];
    }
    return (data ?? []).map((d: any) => this.toProject(d));
  }

  async saveProject(project: Project): Promise<Project> {
    let institutionId = project.entityId;
    if (!this.isUuid(institutionId)) {
      const ids = await this.resolveInstitutionIds(project.entityId, project.entityType, project.entityName);
      institutionId = ids[0];
    }

    if (!institutionId) {
      throw new Error(
        `Could not resolve institution for project save. entityId="${project.entityId}", entityName="${project.entityName}", entityType="${project.entityType}"`,
      );
    }

    const row = this.fromProject({ ...project, entityId: institutionId });
    const { data, error } = await this.db()
      .from('projects')
      .upsert(row)
      .select('*, institution:institutions(id, name, institution_type)')
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Project save failed.');
    }
    return this.toProject(data);
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.db().from('projects').delete().eq('id', id);
    if (error) console.error('[project.service] deleteProject error:', error.message);
  }

  async getDonations(projectId?: string): Promise<Donation[]> {
    let query: any = this.db()
      .from('donations')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getDonations error:', error.message);
      return [];
    }
    return (data ?? []).map((d: any) => this.toDonation(d));
  }

  async saveDonation(donation: Donation): Promise<Donation> {
    const row = this.fromDonation(donation);
    const { data, error } = await this.db().from('donations').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveDonation error:', error?.message);
      return donation;
    }
    return this.toDonation(data);
  }

  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    let query: any = this.db()
      .from('project_expenses')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getExpenses error:', error.message);
      return [];
    }
    return (data ?? []).map((d: any) => this.toExpense(d));
  }

  async saveExpense(expense: ProjectExpense): Promise<ProjectExpense> {
    const row = this.fromExpense(expense);
    const { data, error } = await this.db().from('project_expenses').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveExpense error:', error?.message);
      return expense;
    }
    return this.toExpense(data);
  }
}
