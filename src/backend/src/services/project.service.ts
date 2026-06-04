import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { Project, Donation, ProjectExpense } from '../types';
import { newId } from '../utils/store';

@Injectable()
export class ProjectService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private toProject(row: any): Project {
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
      entityId: row.entity_id,
      entityType: row.entity_type,
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
      entity_id: p.entityId,
      entity_type: p.entityType,
    };
    if (p.id && p.id.startsWith('PRJ-')) row.id = p.id;
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
    if (d.id && d.id.startsWith('DON-')) row.id = d.id;
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
    if (e.id && e.id.startsWith('EXP-')) row.id = e.id;
    return row;
  }

  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    let query = this.supabaseService.supabaseServer
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (entityType === 'diocese') {
      // bishop sees all
    } else {
      if (entityId) query = query.eq('entity_id', entityId);
      if (entityType) query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getProjects error:', error.message);
      return [];
    }
    return (data ?? []).map((d) => this.toProject(d));
  }

  async saveProject(project: Project): Promise<Project> {
    const row = this.fromProject(project);
    const { data, error } = await this.supabaseService.supabaseServer.from('projects').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveProject error:', error?.message);
      return project;
    }
    return this.toProject(data);
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.supabaseService.supabaseServer.from('projects').delete().eq('id', id);
    if (error) console.error('[project.service] deleteProject error:', error.message);
  }

  async getDonations(projectId?: string): Promise<Donation[]> {
    let query = this.supabaseService.supabaseServer
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getDonations error:', error.message);
      return [];
    }
    return (data ?? []).map((d) => this.toDonation(d));
  }

  async saveDonation(donation: Donation): Promise<Donation> {
    const row = this.fromDonation(donation);
    const { data, error } = await this.supabaseService.supabaseServer.from('donations').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveDonation error:', error?.message);
      return donation;
    }
    return this.toDonation(data);
  }

  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    let query = this.supabaseService.supabaseServer
      .from('project_expenses')
      .select('*')
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getExpenses error:', error.message);
      return [];
    }
    return (data ?? []).map((d) => this.toExpense(d));
  }

  async saveExpense(expense: ProjectExpense): Promise<ProjectExpense> {
    const row = this.fromExpense(expense);
    const { data, error } = await this.supabaseService.supabaseServer
      .from('project_expenses')
      .upsert(row)
      .select()
      .single();
    if (error || !data) {
      console.error('[project.service] saveExpense error:', error?.message);
      return expense;
    }
    return this.toExpense(data);
  }
}
