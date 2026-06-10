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
import { auth } from '../firebase';

// Get JWT token from session or localStorage demo session
async function getAuthToken(): Promise<string | null> {
  try {
    const sessionUser = auth.currentUser;
    if (sessionUser?.id || sessionUser?.uid) {
      // Try to get the actual JWT token from Supabase
      const { data } = (await (window as any).supabase?.auth?.getSession()) || {};
      if (data?.session?.access_token) {
        return `Bearer ${data.session.access_token}`;
      }
      // Fallback: create a mock token for demo purposes
      return `Bearer demo-${sessionUser.id || sessionUser.uid}`;
    }
  } catch (error) {
    // Fall through to localStorage fallback
  }

  // Demo fallback: check localStorage for currentUser
  try {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      const user = JSON.parse(userStr);
      return `Bearer demo-${user.id || 'demo-user'}`;
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

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
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }

  const res = await fetch(url.toString(), { credentials: 'include', headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }

  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error ?? j?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`POST ${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

async function del(path: string, params?: Record<string, string>): Promise<void> {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }

  const res = await fetch(url.toString(), { method: 'DELETE', credentials: 'include', headers });
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
    try {
      callback(await fetcher());
    } catch {
      /* ignore */
    }
  };

  tick(); // immediate first call
  const id = window.setInterval(tick, intervalMs);
  return () => {
    active = false;
    window.clearInterval(id);
  };
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
    await Promise.all(records.map((r) => this.saveRecord(r)));
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
    return fetch(`/api/financial/templates?entityType=${entityType}`, { credentials: 'include' }).then((r) => r.text());
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
  // Analytics — descriptive
  // ----------------------------------------------------------------
  getFinancialTrend: (entityType: string, institutionId: string) =>
    get(`/api/analytics/descriptive/financial-trend/${entityType}/${institutionId}`),

  getPastoralAssignment: (institutionId: string) =>
    get(`/api/analytics/descriptive/pastoral-assignment/${institutionId}`),

  getParishCluster: () => get('/api/analytics/descriptive/parish-cluster'),

  getSeasonalityTrend: (entityType: string, institutionId: string) =>
    get(`/api/analytics/descriptive/seasonality/${entityType}/${institutionId}`),

  getProjectsDescriptive: (institutionId: string) => get(`/api/analytics/descriptive/projects/${institutionId}`),

  // ----------------------------------------------------------------
  // Analytics — diagnostic
  // ----------------------------------------------------------------
  getPriestFinancialDiagnostic: (institutionId: string) =>
    get(`/api/analytics/diagnostic/priest-financial/${institutionId}`),

  getClusterSeasonalDiagnostic: (entityType: string, institutionId: string) =>
    get(`/api/analytics/diagnostic/cluster-seasonal/${entityType}/${institutionId}`),

  getProjectRiskDiagnostic: (institutionId: string) => get(`/api/analytics/diagnostic/project-risk/${institutionId}`),

  // ----------------------------------------------------------------
  // Analytics — predictive
  // ----------------------------------------------------------------
  getFinancialForecast: (entityType: string, institutionId: string, periods = 12) =>
    get(`/api/analytics/predictive/financial-forecast/${entityType}/${institutionId}`, {
      periods: String(periods),
    }),

  getPastoralForecast: (institutionId: string, periods = 6) =>
    get(`/api/analytics/predictive/pastoral-forecast/${institutionId}`, { periods: String(periods) }),

  getClusterForecast: () => get('/api/analytics/predictive/cluster-forecast'),

  getSeasonalForecast: (entityType: string, institutionId: string, periods = 6) =>
    get(`/api/analytics/predictive/seasonal-forecast/${entityType}/${institutionId}`, {
      periods: String(periods),
    }),

  getProjectForecast: (institutionId: string) => get(`/api/analytics/predictive/project-forecast/${institutionId}`),

  // ----------------------------------------------------------------
  // Analytics — prescriptive
  // ----------------------------------------------------------------
  getFinancialRecommendation: (entityType: string, institutionId: string) =>
    get(`/api/analytics/prescriptive/financial-recommendation/${entityType}/${institutionId}`),

  runInstitutionSimulation: (entityType: string, institutionId: string, body: object) =>
    post(`/api/analytics/prescriptive/institution-simulation/${entityType}/${institutionId}`, body),

  getPastoralAction: (institutionId: string) => get(`/api/analytics/prescriptive/pastoral-action/${institutionId}`),

  runPastoralSimulation: (institutionId: string, body: object) =>
    post(`/api/analytics/prescriptive/pastoral-simulation/${institutionId}`, body),

  getParishUpgrade: () => get('/api/analytics/prescriptive/parish-upgrade'),

  getSeasonalStrategy: (entityType: string, institutionId: string) =>
    get(`/api/analytics/prescriptive/seasonal-strategy/${entityType}/${institutionId}`),

  getProjectPortfolio: (institutionId: string) => get(`/api/analytics/prescriptive/project-portfolio/${institutionId}`),

  // ----------------------------------------------------------------
  // Projects
  // ----------------------------------------------------------------
  async getProjects(entityId?: string, entityType?: string): Promise<Project[]> {
    return get('/api/projects', { entityId, entityType });
  },

  async saveProject(project: Project): Promise<Project> {
    const saved = await post<Project>('/api/projects', project);
    window.dispatchEvent(new Event('projects_update'));
    return saved;
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

  async getAdminEntities(type?: 'parish' | 'school' | 'seminary', includeAll = false) {
    return get('/api/admin/entities', { type, all: includeAll ? 'true' : undefined });
  },

  async getGeoInstitutions(): Promise<
    { id: string; name: string; vicariate: string; class: string; lat: number; lng: number; collections: number }[]
  > {
    return get('/api/entities/geo');
  },

  async getFinancialProfiles(type?: 'parish' | 'seminary' | 'school'): Promise<any[]> {
    return get('/api/entities/financial-profiles', type ? { type } : undefined);
  },

  // ----------------------------------------------------------------
  // Priest health records
  // ----------------------------------------------------------------
  async getHealthRecords(): Promise<any[]> {
    return get('/api/health-records');
  },

  async saveHealthRecord(record: any): Promise<any> {
    return post('/api/health-records', record);
  },

  async deleteHealthRecord(id: string): Promise<void> {
    await del(`/api/health-records/${id}`);
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

  subscribeToProjects(callback: (projects: Project[]) => void, entityId?: string, entityType?: string) {
    return createPoller(() => this.getProjects(entityId, entityType), callback);
  },

  subscribeToDonations(callback: (donations: Donation[]) => void, projectId?: string) {
    return createPoller(() => this.getDonations(projectId), callback);
  },

  subscribeToExpenses(callback: (expenses: ProjectExpense[]) => void, projectId?: string) {
    return createPoller(() => this.getExpenses(projectId), callback);
  },

  // ----------------------------------------------------------------
  // Submissions — real file upload to Supabase Storage + DB record
  // ----------------------------------------------------------------
  async submitReport(
    formData: FormData,
  ): Promise<{ submissionId: string; filePath: string; validationStatus: string }> {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      credentials: 'include',
      body: formData, // do NOT set Content-Type — browser sets multipart boundary automatically
    });
    if (!res.ok) throw new Error(`POST /api/submissions → ${res.status}`);
    return res.json();
  },

  // ----------------------------------------------------------------
  // Simulator Scenarios
  // ----------------------------------------------------------------
  async createInstitutionScenario(dto: {
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
    monthlyNet: number;
    runwayMonths: number;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    finalBalance: number;
    projectedData: any[];
    recommendation: string;
  }): Promise<any> {
    return post('/api/scenarios/institution', dto);
  },

  async listInstitutionScenarios(): Promise<any[]> {
    return get('/api/scenarios/institution');
  },

  async getInstitutionScenario(id: string): Promise<any> {
    return get(`/api/scenarios/institution/${id}`);
  },

  async deleteInstitutionScenario(id: string): Promise<void> {
    await del(`/api/scenarios/institution/${id}`);
  },

  async archiveInstitutionScenario(id: string, isArchived: boolean): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = token;
    }

    const res = await fetch(`/api/scenarios/institution/${id}?action=archive`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ isArchived }),
    });
    if (!res.ok) throw new Error(`PATCH /api/scenarios/institution/${id}?action=archive → ${res.status}`);
    return res.json();
  },

  async createPriestScenario(dto: {
    priestId: string;
    priestName: string;
    targetParishId: string;
    targetParishName: string;
    name: string;
    description?: string;
    transitionSupport: 'standard' | 'assisted' | 'intensive';
    handoffWeeks: number;
    timelineMonths: number;
    fitScore: number;
    targetLift: number;
    vacatedParishDip: number;
    dioceseLift: number;
    transitionRisk: number;
    riskBand: 'Low' | 'Medium' | 'High';
    confidence: number;
    projectedData: any[];
    recommendation: string;
  }): Promise<any> {
    return post('/api/scenarios/priest', dto);
  },

  async listPriestScenarios(): Promise<any[]> {
    return get('/api/scenarios/priest');
  },

  async getPriestScenario(id: string): Promise<any> {
    return get(`/api/scenarios/priest/${id}`);
  },

  async deletePriestScenario(id: string): Promise<void> {
    await del(`/api/scenarios/priest/${id}`);
  },

  async archivePriestScenario(id: string, isArchived: boolean): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = token;
    }

    const res = await fetch(`/api/scenarios/priest/${id}?action=archive`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ isArchived }),
    });
    if (!res.ok) throw new Error(`PATCH /api/scenarios/priest/${id}?action=archive → ${res.status}`);
    return res.json();
  },

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  async getEvents(params?: { institutionId?: string; institutionName?: string; institutionType?: string }): Promise<any[]> {
    return get('/api/events', {
      institutionId: params?.institutionId,
      institutionName: params?.institutionName,
      institutionType: params?.institutionType,
    });
  },

  async saveEvent(event: Record<string, any>): Promise<any> {
    return post('/api/events', event);
  },

  // ----------------------------------------------------------------
  // Institution budgets
  // ----------------------------------------------------------------
  async getBudgets(params?: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
    year?: number;
  }): Promise<any[]> {
    return get('/api/budgets', {
      institutionId: params?.institutionId,
      institutionName: params?.institutionName,
      institutionType: params?.institutionType,
      year: params?.year ? String(params.year) : undefined,
    });
  },

  async saveBudgets(payload: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
    year: number;
    entries: { month: number; amount: number; notes?: string }[];
  }): Promise<any[]> {
    return post('/api/budgets', payload);
  },

  // ----------------------------------------------------------------
  // Liturgical calendar review (human-in-the-loop validation)
  // ----------------------------------------------------------------
  async getLiturgicalCalendar(filters: {
    status?: string;
    season?: string;
    month?: number;
    year?: number;
    reason?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ records: any[]; total: number; page: number; pageSize: number }> {
    const params: Record<string, string | undefined> = {
      status: filters.status,
      season: filters.season,
      month: filters.month ? String(filters.month) : undefined,
      year: filters.year ? String(filters.year) : undefined,
      reason: filters.reason || undefined,
      page: filters.page ? String(filters.page) : undefined,
      pageSize: filters.pageSize ? String(filters.pageSize) : undefined,
    };
    return get('/api/liturgical-calendar', params);
  },

  async reviewLiturgicalRecord(
    id: string,
    body: {
      action: 'approve' | 'approve_with_revisions' | 'reject';
      reviewedBy?: string;
      date?: string;
      celebration_name?: string;
      reason?: string;
    },
  ): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = token;
    }
    const res = await fetch(`/api/liturgical-calendar/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.error ?? j?.message ?? '';
      } catch {
        /* ignore */
      }
      throw new Error(`PATCH /api/liturgical-calendar/${id} → ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.json();
  },

  async approveAllLiturgicalRecords(
    filters: { season?: string; month?: number; year?: number; reason?: string },
    reviewedBy?: string,
  ): Promise<{ approved: number }> {
    return post('/api/liturgical-calendar', { filters, reviewedBy });
  },
};
