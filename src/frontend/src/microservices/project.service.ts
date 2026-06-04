/**
 * Project Service — manages Projects, Donations, and Expenses via Supabase.
 */

import type { Project, Donation, ProjectExpense } from '../types';
import { supabaseServer } from '../lib/supabase';
import { newId } from './store';

// ------------------------------------------------------------------
// Mappers — Supabase snake_case row ↔ TypeScript camelCase type
// ------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProject(row: any): Project {
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

function fromProject(p: Project): Record<string, unknown> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDonation(row: any): Donation {
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

function fromDonation(d: Donation): Record<string, unknown> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toExpense(row: any): ProjectExpense {
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

function fromExpense(e: ProjectExpense): Record<string, unknown> {
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

// ------------------------------------------------------------------
// Public service
// ------------------------------------------------------------------
export const projectService = {
  // ── Projects ────────────────────────────────────────────────────
  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    let query = supabaseServer.from('projects').select('*').order('created_at', { ascending: false });

    if (entityType === 'diocese') {
      // bishop sees all — no filter
    } else {
      if (entityId) query = query.eq('entity_id', entityId);
      if (entityType) query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getProjects:', error.message);
      return [];
    }
    return (data ?? []).map(toProject);
  },

  async saveProject(project: Project): Promise<Project> {
    const row = fromProject(project);
    const { data, error } = await supabaseServer.from('projects').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveProject:', error?.message);
      return project;
    }
    return toProject(data);
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabaseServer.from('projects').delete().eq('id', id);
    if (error) console.error('[project.service] deleteProject:', error.message);
  },

  // ── Donations ───────────────────────────────────────────────────
  async getDonations(projectId?: string): Promise<Donation[]> {
    let query = supabaseServer.from('donations').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getDonations:', error.message);
      return [];
    }
    return (data ?? []).map(toDonation);
  },

  async saveDonation(donation: Donation): Promise<Donation> {
    const row = fromDonation(donation);
    const { data, error } = await supabaseServer.from('donations').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveDonation:', error?.message);
      return donation;
    }
    return toDonation(data);
  },

  // ── Expenses ────────────────────────────────────────────────────
  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    let query = supabaseServer.from('project_expenses').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) {
      console.error('[project.service] getExpenses:', error.message);
      return [];
    }
    return (data ?? []).map(toExpense);
  },

  async saveExpense(expense: ProjectExpense): Promise<ProjectExpense> {
    const row = fromExpense(expense);
    const { data, error } = await supabaseServer.from('project_expenses').upsert(row).select().single();
    if (error || !data) {
      console.error('[project.service] saveExpense:', error?.message);
      return expense;
    }
    return toExpense(data);
  },
};
