import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialHealthScore, DiagnosticResult, EntityClass } from '../types';

const PYTHON_ANALYTICS_URL = (process.env.ANALYTICS_PYTHON_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private pythonRetryAfter = 0;
  private pythonUnavailableLogged = false;

  constructor(
    @Inject(forwardRef(() => FinancialService))
    private readonly financialService: FinancialService,
  ) {}

  private clamp(value: number, min = 0, max = 100) {
    return Math.min(max, Math.max(min, value));
  }

  private async callPython(path: string): Promise<any | null> {
    if (Date.now() < this.pythonRetryAfter) return null;

    try {
      const res = await fetch(`${PYTHON_ANALYTICS_URL}${path}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      if (this.pythonUnavailableLogged) {
        this.logger.log('Python analytics connection restored');
        this.pythonUnavailableLogged = false;
      }
      this.pythonRetryAfter = 0;
      return await res.json();
    } catch {
      this.pythonRetryAfter = Date.now() + 10_000;
      if (this.pythonUnavailableLogged) return null;
      this.pythonUnavailableLogged = true;
      this.logger.log('Python analytics is still starting; using NestJS fallback temporarily');
      return null;
    }
  }

  private buildAnalysis(
    compositeScore: number,
    entityType: string,
    liquidity: number,
    efficiency: number,
    growthRate: number,
  ): { analysis: string; recommendations: string[] } {
    let analysis: string;
    const recommendations: string[] = [];

    if (compositeScore >= 80) {
      analysis = `Excellent financial health. The ${entityType} shows strong liquidity and sustainable practices.`;
      recommendations.push('Consider expanding mission outreach programs.', 'Maintain current reserves.');
    } else if (compositeScore >= 60) {
      analysis = `Good financial health with some areas for optimization. The ${entityType} is stable but could improve efficiency.`;
      recommendations.push('Review discretionary spending.', 'Optimize collection processes.');
    } else if (compositeScore >= 40) {
      analysis = `Fair financial health. There are concerns regarding sustainability and liquidity that need attention.`;
      recommendations.push('Implement stricter budget controls.', 'Seek additional revenue streams.');
    } else {
      analysis = `Critical financial health. Immediate intervention is required to ensure the ${entityType}'s operational stability.`;
      recommendations.push('Urgent financial audit recommended.', 'Suspend non-essential disbursements.');
    }

    if (liquidity < 50) analysis += ' Liquidity is a major concern.';
    if (efficiency < 50) analysis += ' Operational efficiency is below target.';
    if (growthRate < 0) analysis += ' Recent collections show a downward trend.';

    return { analysis, recommendations };
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private mapPythonScore(python: any): FinancialHealthScore {
    return {
      entityId: python.entity_id,
      entityType: python.entity_type,
      entityClass: python.entity_class,
      compositeScore: python.composite_score,
      dimensions: python.dimensions,
      trend: python.trend,
      percentageChange: python.percentage_change,
      analysis: python.analysis,
      recommendations: python.recommendations,
      periodStartYear: python.period_start_year,
      periodEndYear: python.period_end_year,
      dataSufficient: python.data_sufficient,
      timestamp: python.timestamp,
    } as FinancialHealthScore;
  }

  async calculateHealthScore(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
    year?: number,
    timeframe?: '6m' | '12m' | 'all',
  ): Promise<FinancialHealthScore> {
    const params = new URLSearchParams();
    if (entityClass) params.set('entity_class', entityClass);
    if (year) params.set('year', String(year));
    if (timeframe) params.set('timeframe', timeframe);
    const query = params.toString();
    // Python queries UUID-typed institution_id columns directly. Legacy/demo
    // entities can still be keyed by their display name, so keep those on the
    // NestJS path, which already resolves names safely before querying.
    const python = this.isUuid(entityId)
      ? await this.callPython(`/analytics/health/${entityType}/${entityId}${query ? `?${query}` : ''}`)
      : null;
    if (python) return this.mapPythonScore(python);

    return this.calculateHealthScoreFallback(entityId, entityType, entityClass, year, timeframe);
  }

  // Dashboards score every institution at once. Calling calculateHealthScore
  // per entity means one Python HTTP round trip per institution — each has
  // its own real network latency, so 90+ of them in flight together doesn't
  // parallelize away the cost, and the slowest stragglers land past the
  // gateway's timeout. A single batched call lets Python fetch every
  // institution's records in one Supabase query per entity type instead of
  // one query per institution.
  async calculateHealthScoresBatch(
    entities: { entityId: string; entityType: 'parish' | 'seminary' | 'school'; entityClass?: EntityClass }[],
    year?: number,
    timeframe?: '6m' | '12m' | 'all',
  ): Promise<FinancialHealthScore[]> {
    const pythonEntities = entities.filter((e) => this.isUuid(e.entityId));
    const pythonResults = new Map<string, any>();

    if (pythonEntities.length > 0 && Date.now() >= this.pythonRetryAfter) {
      try {
        const res = await fetch(`${PYTHON_ANALYTICS_URL}/analytics/health-scores`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            entities: pythonEntities.map((e) => ({
              institution_id: e.entityId,
              entity_type: e.entityType,
              entity_class: e.entityClass,
            })),
            year,
            timeframe,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as any[];
          data.forEach((python, i) => pythonResults.set(pythonEntities[i].entityId, python));
          this.pythonRetryAfter = 0;
        }
      } catch {
        this.pythonRetryAfter = Date.now() + 10_000;
        this.logger.log('Python analytics batch call failed; using NestJS fallback for this batch');
      }
    }

    return Promise.all(
      entities.map((e) => {
        const python = pythonResults.get(e.entityId);
        if (python) return this.mapPythonScore(python);
        return this.calculateHealthScoreFallback(e.entityId, e.entityType, e.entityClass, year, timeframe);
      }),
    );
  }

  private async calculateHealthScoreFallback(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
    year?: number,
    timeframe?: '6m' | '12m' | 'all',
  ): Promise<FinancialHealthScore> {
    let records = await this.financialService.getRecords(entityId, entityType, entityClass);
    if (year) records = records.filter((r) => r.year === year);
    const window = timeframe === '6m' ? 6 : timeframe === '12m' ? 12 : undefined;
    if (window) records = records.slice(-window);
    // Fewer than 2 points means there's no month-over-month growth to
    // measure — an honest "insufficient," not a noisy real number, same
    // threshold the Python path uses.
    if (records.length < 2) return this.getDefaultHealthScore(entityId, entityType);

    const totalCollections = records.reduce((s, r) => s + r.collections, 0);
    const totalDisbursements = records.reduce((s, r) => s + r.disbursements, 0);

    const avgCollections = totalCollections / records.length;
    const avgDisbursements = totalDisbursements / records.length;

    const latest = records[records.length - 1];
    const prev = records.length > 1 ? records[records.length - 2] : latest;

    const operatingMargin = (avgCollections - avgDisbursements) / (avgCollections || 1);
    const expenseRatio = avgDisbursements / (avgCollections || 1);

    const liquidity = this.clamp((avgCollections / (avgDisbursements || 1)) * 100);
    const sustainability = this.clamp(50 + operatingMargin * 200);
    const efficiency = this.clamp(100 - Math.max(0, expenseRatio - 0.75) * 200);

    const stdDev = Math.sqrt(records.reduce((s, r) => s + (r.collections - avgCollections) ** 2, 0) / records.length);
    const revenueStability = this.clamp(100 - (stdDev / (avgCollections || 1)) * 250);

    const growthRate = (latest.collections - prev.collections) / (prev.collections || 1);
    const growthStability = this.clamp(50 + growthRate * 250);
    const stability = Math.round(revenueStability * 0.7 + growthStability * 0.3);
    const reportingCompliance = this.clamp((records.length / Math.max(12, records.length)) * 100);

    const compositeScore = Math.round(
      this.clamp(
        liquidity * 0.25 +
          sustainability * 0.25 +
          efficiency * 0.2 +
          stability * 0.15 +
          reportingCompliance * 0.15,
      ),
    );

    const { analysis, recommendations } = this.buildAnalysis(
      compositeScore,
      entityType,
      liquidity,
      efficiency,
      growthRate,
    );

    return {
      entityId,
      entityType,
      entityClass,
      compositeScore,
      dimensions: {
        liquidity: Math.round(liquidity),
        sustainability: Math.round(sustainability),
        efficiency: Math.round(efficiency),
        stability: Math.round(stability),
        growth: Math.round(reportingCompliance),
      },
      trend: compositeScore > 70 ? 'up' : compositeScore < 40 ? 'down' : 'stable',
      percentageChange: growthRate * 100,
      analysis,
      recommendations,
      periodStartYear: records.reduce<number | undefined>(
        (min, r) => (r.year != null && (min == null || r.year < min) ? r.year : min),
        undefined,
      ),
      periodEndYear: records.reduce<number | undefined>(
        (max, r) => (r.year != null && (max == null || r.year > max) ? r.year : max),
        undefined,
      ),
      dataSufficient: true,
      timestamp: new Date().toISOString(),
    };
  }

  getDefaultHealthScore(entityId: string, entityType: string): FinancialHealthScore {
    return {
      entityId,
      entityType: entityType as any,
      compositeScore: 72,
      dimensions: { liquidity: 75, sustainability: 68, efficiency: 82, stability: 65, growth: 55 },
      trend: 'stable',
      percentageChange: 2.4,
      dataSufficient: false,
      timestamp: new Date().toISOString(),
    };
  }

  async getDiagnostic(entityId: string, month: string): Promise<DiagnosticResult> {
    const records = await this.financialService.getRecords(entityId, 'parish');
    const target = records.find((r) => r.month === month) ?? records[records.length - 1];

    const avgCollections = records.reduce((s, r) => s + r.collections, 0) / records.length;
    const avgDisbursements = records.reduce((s, r) => s + r.disbursements, 0) / records.length;

    const isCollectionAnomaly = Math.abs(target.collections - avgCollections) / avgCollections > 0.2;
    const isDisbursementAnomaly = Math.abs(target.disbursements - avgDisbursements) / avgDisbursements > 0.2;

    if (!isCollectionAnomaly && !isDisbursementAnomaly) {
      return { entityId, targetMonth: month, anomalyDetected: false, timestamp: new Date().toISOString() };
    }

    return {
      entityId,
      targetMonth: month,
      anomalyDetected: true,
      anomalyType: isDisbursementAnomaly ? 'High Disbursements' : 'Collection Fluctuation',
      severity: 'medium',
      rootCauses: [
        { factor: isDisbursementAnomaly ? 'Unexpected Maintenance' : 'Seasonal Variation', contribution: 60 },
        { factor: 'Economic Factors', contribution: 40 },
      ],
      confidenceScore: 85,
      analysis: `Significant deviation from average ${isDisbursementAnomaly ? 'disbursements' : 'collections'} detected. Likely due to ${isDisbursementAnomaly ? 'unplanned expenses' : 'seasonal trends'}.`,
      timestamp: new Date().toISOString(),
    };
  }
}
