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
import { supabaseBrowser } from './supabase';

// Get JWT token from session or localStorage demo session
async function getAuthToken(): Promise<string | null> {
  try {
    const sessionUser = auth.currentUser;
    if (sessionUser?.id || sessionUser?.uid) {
      // Try to get the actual JWT token from Supabase. Must use the real
      // imported client — `window.supabase` is never set anywhere in this
      // app, so reading it here always resolved to undefined, which meant
      // every real, fully-authenticated Supabase session still silently
      // fell through to the "Bearer demo-*" token below. The gateway
      // rejects demo-* tokens outright for descriptive analytics, so real
      // users saw the exact same blank charts as an actual demo session.
      const { data } = await supabaseBrowser.auth.getSession();
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

// Identify the caller to the backend for permission checks and audit logs.
// Header values must be ASCII, so strip anything outside printable range.
function getUserHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const sessionUser = auth.currentUser as any;
    let name = sessionUser?.name || sessionUser?.displayName || sessionUser?.email;
    let role = sessionUser?.roleId || sessionUser?.accessRole || sessionUser?.role;

    if (!name || !role) {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        const user = JSON.parse(stored);
        name = name || user?.name || user?.displayName || user?.email;
        role = role || user?.roleId || user?.accessRole || user?.role;
      }
    }

    const sanitize = (v: unknown) =>
      String(v)
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();

    if (name) headers['x-user-name'] = sanitize(name);
    if (role) headers['x-user-role'] = sanitize(role);
  } catch {
    // Ignore — backend falls back to "Unknown User"
  }
  return headers;
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
  const headers: Record<string, string> = { ...getUserHeaders() };
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }

  const res = await fetch(url.toString(), { credentials: 'include', headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getUserHeaders() };
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
      // NestJS puts the human-readable text in `message`; `error` is just the
      // generic status name ("Bad Request"), so prefer message.
      detail = j?.message ?? j?.error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`POST ${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getUserHeaders() };
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token;
  }

  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.message ?? j?.error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`PATCH ${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

async function del(path: string, params?: Record<string, string>): Promise<void> {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = { ...getUserHeaders() };
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
  let inFlight = false;

  const tick = async () => {
    if (!active || inFlight) return;
    // setInterval fires on a strict wall-clock schedule regardless of
    // whether the previous fetch finished — without this guard, a fetcher
    // slower than intervalMs (analytics calls can take 10s+) causes
    // requests to pile up indefinitely the longer the page stays mounted,
    // each new tick adding to the backlog instead of waiting its turn.
    inFlight = true;
    try {
      callback(await fetcher());
    } catch {
      /* ignore */
    } finally {
      inFlight = false;
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
    year?: number | null,
    timeframe?: '6m' | '12m' | 'all',
  ): Promise<FinancialHealthScore> {
    return get('/api/analytics/health', {
      entityId,
      entityType,
      entityClass,
      year: year ? String(year) : undefined,
      timeframe,
    });
  },

  // Batch variant — one request scores every entity; use this from dashboards
  // instead of firing one request per institution. year/timeframe are a
  // single global selection applied to every entity in the batch.
  async calculateHealthScores(
    entities: { entityId: string; entityType: 'parish' | 'seminary' | 'school'; entityClass?: EntityClass }[],
    year?: number | null,
    timeframe?: '6m' | '12m' | 'all',
  ): Promise<FinancialHealthScore[]> {
    // JSON.stringify keeps an explicit null (unlike undefined, which it drops),
    // so year=null ("All Years") must be normalized here — otherwise the
    // backend would receive a literal `"year": null` instead of an omitted
    // key, unlike every other year-scoped call in this file which already
    // goes through a GET query string (where null and undefined are already
    // equivalent).
    return post('/api/analytics/health', { entities, year: year ?? undefined, timeframe });
  },

  async getDiagnostic(entityId: string, month: string): Promise<DiagnosticResult> {
    return get('/api/analytics/diagnostic', { entityId, month });
  },

  // ----------------------------------------------------------------
  // Analytics — descriptive
  // ----------------------------------------------------------------
  getFinancialTrend: (
    entityType: string,
    institutionId: string,
    params?: {
      year?: number | null;
      timeframe?: '6m' | '12m' | 'all';
      vicariates?: string[];
      institutionIds?: string[];
    },
  ) =>
    get(`/api/analytics/descriptive/financial-trend/${entityType}/${institutionId}`, {
      year: params?.year ? String(params.year) : undefined,
      timeframe: params?.timeframe,
      vicariates: params?.vicariates?.length ? params.vicariates.join(',') : undefined,
      institution_ids: params?.institutionIds?.length ? params.institutionIds.join(',') : undefined,
    }),

  // Decline-monitor batch: recent months + decline/anomaly flags for N
  // institutions in one request. Deliberately takes no year — the monitor
  // always reflects each parish's true latest trend regardless of the Year
  // filter (see the Python endpoint's docstring).
  getFinancialTrendBatch: (
    institutionIds: string[],
  ): Promise<{
    data_sufficient: boolean;
    results: Record<
      string,
      {
        monthly_series: { period: string; total_receipts: number; total_expenses: number }[];
        decline_detected: boolean;
        latest_z_score: number;
        recent_anomaly: boolean;
      }
    >;
    timestamp: string;
  }> => post('/api/analytics/descriptive/financial-trend-batch', { institution_ids: institutionIds }),

  // IAFR account-level drill-down: no codes → sections A-F; sectionCode →
  // that section's subsections; sectionCode + subsectionCode → individual
  // accounts. Backed by the AWS breakdown fact table.
  getFinancialBreakdown: (
    institutionId: string,
    params?: {
      year?: number | null;
      sectionCode?: string;
      subsectionCode?: string;
      vicariates?: string[];
      institutionIds?: string[];
    },
  ) =>
    get(`/api/analytics/descriptive/financial-breakdown/${institutionId}`, {
      year: params?.year ? String(params.year) : undefined,
      section_code: params?.sectionCode,
      subsection_code: params?.subsectionCode,
      vicariates: params?.vicariates?.length ? params.vicariates.join(',') : undefined,
      institution_ids: params?.institutionIds?.length ? params.institutionIds.join(',') : undefined,
    }),

  getPastoralAssignment: (institutionId: string) =>
    get(`/api/analytics/descriptive/pastoral-assignment/${institutionId}`),

  getParishCluster: () => get('/api/analytics/descriptive/parish-cluster'),

  getSeasonalityTrend: (
    entityType: string,
    institutionId: string,
    params?: { year?: number | null; timeframe?: '6m' | '12m' | 'all' },
  ) =>
    get(`/api/analytics/descriptive/seasonality/${entityType}/${institutionId}`, {
      year: params?.year ? String(params.year) : undefined,
      timeframe: params?.timeframe,
    }),

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

  async processSubmission(
    submissionId: string,
    storagePath: string,
  ): Promise<{
    submissionBatchId: string;
    validationStatus: 'passed' | 'failed' | 'warning' | 'pending';
    monthsProcessed: number;
    rows: Array<{ month: string; year: number; financialRecordId: string }>;
    summary: { errorCount: number; lineItemCount: number; reconciliationCheckCount?: number };
  }> {
    const res = await fetch(`/api/submissions/${submissionId}/process`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storagePath }),
    });
    if (!res.ok) throw new Error(`POST /api/submissions/${submissionId}/process → ${res.status}`);
    return res.json();
  },

  // ----------------------------------------------------------------
  // Digital Twin (bishop sandbox — counterfactual replay + private scenarios)
  // ----------------------------------------------------------------
  runDigitalTwinReplay: (
    entityType: 'parish' | 'seminary' | 'school',
    institutionId: string,
    body: {
      start_month: number; // 1-12
      start_year: number;
      modified_receipts?: number;
      modified_expenses?: number;
    },
  ) => post<any>(`/api/analytics/prescriptive/counterfactual-replay/${entityType}/${institutionId}`, body),

  async createDigitalTwinScenario(dto: {
    institutionType: 'parish' | 'seminary' | 'school';
    institutionId?: string | null;
    institutionName: string;
    name: string;
    description?: string;
    startingMonth?: number | null;
    startingYear?: number | null;
    modifiedValues: Record<string, number>;
    replayResults?: any;
  }): Promise<any> {
    return post('/api/scenarios/digital-twin', dto);
  },

  async listDigitalTwinScenarios(): Promise<any[]> {
    return get('/api/scenarios/digital-twin');
  },

  async deleteDigitalTwinScenario(id: string): Promise<void> {
    await del(`/api/scenarios/digital-twin/${id}`);
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
  async getEvents(params?: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  }): Promise<any[]> {
    return get('/api/events', {
      institutionId: params?.institutionId,
      institutionName: params?.institutionName,
      institutionType: params?.institutionType,
    });
  },

  async saveEvent(event: Record<string, any>): Promise<any> {
    return post('/api/events', event);
  },

  async updateEvent(id: string, updates: Record<string, any>): Promise<any> {
    return patch(`/api/events/${encodeURIComponent(id)}`, updates);
  },

  async archiveEvent(id: string): Promise<{ ok: boolean }> {
    return post(`/api/events/${encodeURIComponent(id)}/archive`, {});
  },

  async restoreEvent(id: string): Promise<{ ok: boolean }> {
    return post(`/api/events/${encodeURIComponent(id)}/restore`, {});
  },

  async getArchivedEvents(params?: {
    institutionId?: string;
    institutionName?: string;
    institutionType?: string;
  }): Promise<any[]> {
    return get('/api/events/archived', {
      institutionId: params?.institutionId,
      institutionName: params?.institutionName,
      institutionType: params?.institutionType,
    });
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
    celebration?: string;
    reason?: string;
    validation?: 'all' | 'matched' | 'mismatched';
    page?: number;
    pageSize?: number;
  }): Promise<{ records: any[]; total: number; page: number; pageSize: number }> {
    const params: Record<string, string | undefined> = {
      status: filters.status,
      season: filters.season,
      month: filters.month ? String(filters.month) : undefined,
      year: filters.year ? String(filters.year) : undefined,
      celebration: filters.celebration || undefined,
      reason: filters.reason || undefined,
      validation: filters.validation && filters.validation !== 'all' ? filters.validation : undefined,
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
      name_source?: string;
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
    filters: {
      season?: string;
      month?: number;
      year?: number;
      celebration?: string;
      reason?: string;
      validation?: 'all' | 'matched' | 'mismatched';
    },
    reviewedBy?: string,
  ): Promise<{ approved: number }> {
    return post('/api/liturgical-calendar', { filters, reviewedBy });
  },
};
