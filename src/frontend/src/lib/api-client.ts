/**
 * API Client — the single entry point for all frontend → microservice calls.
 *
 * Each method mirrors the old dataService interface so views don't need
 * to be rewritten. Internally, every call is a fetch() to one of the
 * Next.js API route handlers defined in app/api/.
 */

import type {
  FinancialRecord,
  FinancialHealthScore,
  DiagnosticResult,
  EntityClass,
  Project,
  Donation,
  ProjectExpense,
} from '../types';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
async function get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { credentials: 'include' });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

async function del(path: string, params?: Record<string, string>): Promise<void> {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

// ------------------------------------------------------------------
// Subscription helper — polls the API and fires callback on change.
// Mirrors the original window.event-based subscriptions.
// ------------------------------------------------------------------
function createPoller(
  fetcher: () => Promise<unknown>,
  callback: (data: any) => void,
  intervalMs = 30000, // 30 seconds (reduces request frequency & terminal noise in dev)
): () => void {
  let active = true;

  const tick = async () => {
    if (!active) return;
    try { callback(await fetcher()); } catch { /* ignore */ }
  };

  tick(); // immediate first call
  const id = window.setInterval(tick, intervalMs);
  return () => { active = false; window.clearInterval(id); };
}

// ------------------------------------------------------------------
// Auth client
// ------------------------------------------------------------------
export const authClient = {
  async login(email: string, password: string) {
    return post<{ user: any }>('/api/auth', { email, password });
  },
  async logout() {
    await fetch('/api/auth', { method: 'DELETE', credentials: 'include' });
  },
  async getSession() {
    return get<{ user: any }>('/api/auth');
  },
};

// ------------------------------------------------------------------
// Main data client — drop-in replacement for dataService
// ------------------------------------------------------------------
export const apiClient = {
  // ----------------------------------------------------------------
  // Financial records
  // ----------------------------------------------------------------
  async getRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialRecord[]> {
    return get('/api/financial/records', { entityId, entityType, entityClass });
  },

  async getAllRecords(): Promise<FinancialRecord[]> {
    return get('/api/financial/records', { all: 'true' });
  },

  async saveRecord(record: FinancialRecord): Promise<FinancialRecord> {
    return post('/api/financial/records', record);
  },

  async saveRecords(records: FinancialRecord[]): Promise<void> {
    await Promise.all(records.map(r => this.saveRecord(r)));
  },

  async deleteRecord(id: string): Promise<void> {
    await del('/api/financial/records', { id });
    window.dispatchEvent(new Event('storage_update'));
  },

  parseCSV(
    csvText: string,
    entityId = 'default',
    entityType: 'parish' | 'seminary' | 'school' = 'parish',
  ): Promise<FinancialRecord[]> {
    return post('/api/financial/parse', { csv: csvText, entityId, entityType });
  },

  generateTemplateCSV(entityType = 'parish'): Promise<string> {
    return fetch(`/api/financial/templates?entityType=${entityType}`, { credentials: 'include' })
      .then(r => r.text());
  },

  // ----------------------------------------------------------------
  // Analytics
  // ----------------------------------------------------------------
  async calculateHealthScore(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialHealthScore> {
    return get('/api/analytics/health', { entityId, entityType, entityClass });
  },

  async getDiagnostic(entityId: string, month: string): Promise<DiagnosticResult> {
    return get('/api/analytics/diagnostic', { entityId, month });
  },

  // ----------------------------------------------------------------
  // Projects
  // ----------------------------------------------------------------
  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    return get('/api/projects', { entityId, entityType });
  },

  async saveProject(project: Project): Promise<Project> {
    return post('/api/projects', project);
  },

  async deleteProject(id: string): Promise<void> {
    await del('/api/projects', { id });
    window.dispatchEvent(new Event('projects_update'));
  },

  // ----------------------------------------------------------------
  // Donations
  // ----------------------------------------------------------------
  async getDonations(projectId?: string): Promise<Donation[]> {
    return get('/api/projects/donations', { projectId });
  },

  async saveDonation(donation: Donation): Promise<Donation> {
    const saved = await post<Donation>('/api/projects/donations', donation);
    window.dispatchEvent(new Event('donations_update'));
    return saved;
  },

  // ----------------------------------------------------------------
  // Expenses
  // ----------------------------------------------------------------
  async getExpenses(projectId?: string): Promise<ProjectExpense[]> {
    return get('/api/projects/expenses', { projectId });
  },

  async saveExpense(expense: ProjectExpense): Promise<ProjectExpense> {
    const saved = await post<ProjectExpense>('/api/projects/expenses', expense);
    window.dispatchEvent(new Event('expenses_update'));
    return saved;
  },

  // ----------------------------------------------------------------
  // Entities
  // ----------------------------------------------------------------
  async getEntities(type?: 'parish' | 'school' | 'seminary') {
    return get('/api/entities', type ? { type } : undefined);
  },

  // ----------------------------------------------------------------
  // Subscriptions (polling-based, backward-compatible)
  // ----------------------------------------------------------------
  subscribeToRecords(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    callback: (records: FinancialRecord[]) => void,
  ) {
    return createPoller(() => this.getRecords(entityId, entityType), callback);
  },

  subscribeToAllRecords(callback: (records: FinancialRecord[]) => void) {
    return createPoller(() => this.getAllRecords(), callback);
  },

  subscribeToProjects(
    callback: (projects: Project[]) => void,
    entityId?: string,
    entityType?: string,
  ) {
    return createPoller(() => this.getProjects(entityId, entityType), callback);
  },

  subscribeToDonations(callback: (donations: Donation[]) => void, projectId?: string) {
    return createPoller(() => this.getDonations(projectId), callback);
  },

  subscribeToExpenses(callback: (expenses: ProjectExpense[]) => void, projectId?: string) {
    return createPoller(() => this.getExpenses(projectId), callback);
  },
};
