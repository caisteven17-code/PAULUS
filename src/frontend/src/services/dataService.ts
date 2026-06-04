'use client';

/**
 * dataService — legacy facade that now delegates every call to the
 * microservices API client (src/lib/api-client.ts).
 *
 * All existing callers throughout the app continue to work without
 * modification.  The actual business logic now lives in the server-side
 * microservices under src/microservices/.
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

// Re-export DEFAULT_RECORDS for any component that imports it directly.
export { DEFAULT_RECORDS } from '../microservices/financial.service';

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

  async saveProject(project: Project): Promise<void> {
    await apiClient.saveProject(project);
    window.dispatchEvent(new Event('projects_update'));
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.deleteProject(id);
  },

  // ------------------------------------------------------------------
  // Donations
  // ------------------------------------------------------------------
  async getDonations(projectId?: string): Promise<Donation[]> {
    return apiClient.getDonations(projectId);
  },

  async saveDonation(donation: Donation): Promise<void> {
    await apiClient.saveDonation(donation);
  },

  // ------------------------------------------------------------------
  // Expenses
  // ------------------------------------------------------------------
  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    return apiClient.getExpenses(projectId);
  },

  async saveExpense(expense: ProjectExpense): Promise<void> {
    await apiClient.saveExpense(expense);
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
