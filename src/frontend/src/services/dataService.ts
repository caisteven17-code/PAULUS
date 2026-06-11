'use client';

/**
 * dataService — legacy facade that now delegates every call to the
 * microservices API client (src/lib/api-client.ts).
 *
 * All existing callers throughout the app continue to work without
 * modification.  The actual business logic now lives in the server-side
 * NestJS backend via the api-client.
 */

import { apiClient } from '../lib/api-client';
import type {
  FinancialRecord,
  FinancialHealthScore,
  DiagnosticResult,
  EntityClass,
  Project,
  Donation,
  ProjectExpense,
} from '../types';

export const dataService = {
  // ------------------------------------------------------------------
  // Financial records
  // ------------------------------------------------------------------
  async getRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialRecord[]> {
    return apiClient.getRecords(entityId, entityType, entityClass);
  },

  async getAllRecords(): Promise<FinancialRecord[]> {
    return apiClient.getAllRecords();
  },

  async saveRecord(record: FinancialRecord): Promise<void> {
    await apiClient.saveRecord(record);
    window.dispatchEvent(new Event('storage_update'));
  },

  async saveRecords(records: FinancialRecord[]): Promise<void> {
    await apiClient.saveRecords(records);
    window.dispatchEvent(new Event('storage_update'));
  },

  async deleteRecord(id: string): Promise<void> {
    await apiClient.deleteRecord(id);
  },

  parseCSV(csvText: string, entityId = 'default', entityType: any = 'parish'): Promise<FinancialRecord[]> {
    return apiClient.parseCSV(csvText, entityId, entityType);
  },

  generateTemplateCSV(entityType = 'parish'): Promise<string> {
    return apiClient.generateTemplateCSV(entityType);
  },

  // ------------------------------------------------------------------
  // Analytics
  // ------------------------------------------------------------------
  async calculateHealthScore(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialHealthScore> {
    return apiClient.calculateHealthScore(entityId, entityType, entityClass);
  },

  async calculateHealthScores(
    entities: { entityId: string; entityType: 'parish' | 'seminary' | 'school'; entityClass?: EntityClass }[],
  ): Promise<FinancialHealthScore[]> {
    return apiClient.calculateHealthScores(entities);
  },

  /** Kept for backward compatibility — delegates to analyticsService. */
  getDefaultHealthScore(entityId: string, entityType: any): FinancialHealthScore {
    return {
      entityId,
      entityType,
      compositeScore: 72,
      dimensions: { liquidity: 75, sustainability: 68, efficiency: 82, stability: 65, growth: 55 },
      trend: 'stable',
      percentageChange: 2.4,
      timestamp: new Date().toISOString(),
    };
  },

  async getDiagnostic(entityId: string, month: string): Promise<DiagnosticResult> {
    return apiClient.getDiagnostic(entityId, month);
  },

  // ------------------------------------------------------------------
  // Projects
  // ------------------------------------------------------------------
  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    return apiClient.getProjects(entityId, entityType);
  },

  async saveProject(project: Project): Promise<Project> {
    return apiClient.saveProject(project);
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.deleteProject(id);
  },

  async getAdminEntities(type?: 'parish' | 'school' | 'seminary', includeAll = false): Promise<any> {
    return apiClient.getAdminEntities(type, includeAll);
  },

  // ------------------------------------------------------------------
  // Donations
  // ------------------------------------------------------------------
  async getDonations(projectId?: string): Promise<Donation[]> {
    return apiClient.getDonations(projectId);
  },

  async saveDonation(donation: Donation): Promise<Donation> {
    return apiClient.saveDonation(donation);
  },

  // ------------------------------------------------------------------
  // Expenses
  // ------------------------------------------------------------------
  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    return apiClient.getExpenses(projectId);
  },

  async saveExpense(expense: ProjectExpense): Promise<ProjectExpense> {
    return apiClient.saveExpense(expense);
  },

  // ------------------------------------------------------------------
  // Subscriptions
  // ------------------------------------------------------------------
  subscribeToRecords(entityId: string, entityType: string, callback: (records: FinancialRecord[]) => void) {
    return apiClient.subscribeToRecords(entityId, entityType as any, callback);
  },

  subscribeToAllRecords(callback: (records: FinancialRecord[]) => void) {
    return apiClient.subscribeToAllRecords(callback);
  },

  subscribeToProjects(callback: (projects: Project[]) => void, entityId?: string, entityType?: string) {
    return apiClient.subscribeToProjects(callback, entityId, entityType);
  },

  subscribeToDonations(callback: (donations: Donation[]) => void, projectId?: string) {
    return apiClient.subscribeToDonations(callback, projectId);
  },

  subscribeToExpenses(callback: (expenses: ProjectExpense[]) => void, projectId?: string) {
    return apiClient.subscribeToExpenses(callback, projectId);
  },
};
