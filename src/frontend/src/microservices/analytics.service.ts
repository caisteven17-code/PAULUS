/**
 * Analytics Service — microservice responsible for computing financial health
 * scores and generating diagnostic reports.
 *
 * Owns: FinancialHealthScore, DiagnosticResult computation.
 * Depends on: Financial Service (reads records).
 */

import type { FinancialHealthScore, DiagnosticResult, EntityClass } from '../types';
import { financialService } from './financial.service';

// ------------------------------------------------------------------
// Static dimension data for well-known institutions
// ------------------------------------------------------------------
const INSTITUTION_DATA: Record<
  string,
  { score: number; type: string; dimensions: FinancialHealthScore['dimensions'] }
> = {
  default: {
    score: 83,
    type: 'parish',
    dimensions: { liquidity: 89, sustainability: 100, efficiency: 78, stability: 40, growth: 99 },
  },
  parish_01: {
    score: 83,
    type: 'parish',
    dimensions: { liquidity: 89, sustainability: 100, efficiency: 78, stability: 40, growth: 99 },
  },
  school_01: {
    score: 76,
    type: 'school',
    dimensions: { liquidity: 78, sustainability: 82, efficiency: 75, stability: 70, growth: 75 },
  },
  seminary_01: {
    score: 72,
    type: 'seminary',
    dimensions: { liquidity: 70, sustainability: 75, efficiency: 85, stability: 65, growth: 68 },
  },
  'San Pablo Cathedral': {
    score: 91.4,
    type: 'parish',
    dimensions: { liquidity: 88, sustainability: 92, efficiency: 90, stability: 95, growth: 94 },
  },
  'San Isidro Labrador (Biñan)': {
    score: 88.7,
    type: 'parish',
    dimensions: { liquidity: 85, sustainability: 88, efficiency: 86, stability: 92, growth: 98 },
  },
  'St. John the Baptist (Calamba)': {
    score: 86.2,
    type: 'parish',
    dimensions: { liquidity: 82, sustainability: 84, efficiency: 85, stability: 94, growth: 92 },
  },
  'St. Polycarp (Cabuyao)': {
    score: 84.5,
    type: 'parish',
    dimensions: { liquidity: 78, sustainability: 86, efficiency: 82, stability: 90, growth: 95 },
  },
  'Immaculate Conception (Los Baños)': {
    score: 82.9,
    type: 'parish',
    dimensions: { liquidity: 80, sustainability: 82, efficiency: 80, stability: 88, growth: 85 },
  },
  'St. Rose of Lima (Sta. Rosa)': {
    score: 81.1,
    type: 'parish',
    dimensions: { liquidity: 75, sustainability: 85, efficiency: 78, stability: 86, growth: 90 },
  },
  'Holy Family Parish (Sta. Rosa)': {
    score: 79.8,
    type: 'parish',
    dimensions: { liquidity: 72, sustainability: 80, efficiency: 84, stability: 85, growth: 88 },
  },
  'San Antonio de Padua (Pila)': {
    score: 78.3,
    type: 'parish',
    dimensions: { liquidity: 76, sustainability: 78, efficiency: 75, stability: 82, growth: 84 },
  },
  'St. Augustine (Bay)': {
    score: 77.0,
    type: 'parish',
    dimensions: { liquidity: 74, sustainability: 75, efficiency: 76, stability: 84, growth: 82 },
  },
  'St. Sebastian (Lumban)': {
    score: 75.6,
    type: 'parish',
    dimensions: { liquidity: 70, sustainability: 74, efficiency: 72, stability: 80, growth: 92 },
  },
  'St. James the Apostle (Paete)': {
    score: 44.8,
    type: 'parish',
    dimensions: { liquidity: 55, sustainability: 35, efficiency: 40, stability: 60, growth: 42 },
  },
  'St. Gregory the Great (Majayjay)': {
    score: 42.1,
    type: 'parish',
    dimensions: { liquidity: 52, sustainability: 32, efficiency: 38, stability: 55, growth: 45 },
  },
  'St. Bartholomew (Nagcarlan)': {
    score: 39.5,
    type: 'parish',
    dimensions: { liquidity: 48, sustainability: 30, efficiency: 35, stability: 52, growth: 40 },
  },
  'St. Mary Magdalene (Magdalena)': {
    score: 37.2,
    type: 'parish',
    dimensions: { liquidity: 45, sustainability: 28, efficiency: 32, stability: 50, growth: 38 },
  },
  'St. John the Baptist (Liliw)': {
    score: 35.4,
    type: 'parish',
    dimensions: { liquidity: 42, sustainability: 25, efficiency: 34, stability: 48, growth: 35 },
  },
  'St. Peter of Alcantara (Pakil)': {
    score: 33.1,
    type: 'parish',
    dimensions: { liquidity: 40, sustainability: 22, efficiency: 30, stability: 45, growth: 32 },
  },
  'Our Lady of Holy Rosary (Luisiana)': {
    score: 31.8,
    type: 'parish',
    dimensions: { liquidity: 38, sustainability: 20, efficiency: 28, stability: 42, growth: 48 },
  },
  'St. Sebastian (Famy)': {
    score: 29.5,
    type: 'parish',
    dimensions: { liquidity: 35, sustainability: 18, efficiency: 25, stability: 40, growth: 42 },
  },
  'St. Joseph the Worker (Cavinti)': {
    score: 27.2,
    type: 'parish',
    dimensions: { liquidity: 32, sustainability: 16, efficiency: 22, stability: 38, growth: 40 },
  },
  'Our Lady of Nativity (Pangil)': {
    score: 25.1,
    type: 'parish',
    dimensions: { liquidity: 30, sustainability: 15, efficiency: 20, stability: 35, growth: 28 },
  },
  'San Lorenzo Ruiz (San Pablo)': {
    score: 18.5,
    type: 'parish',
    dimensions: { liquidity: 20, sustainability: 10, efficiency: 15, stability: 25, growth: 12 },
  },
  'St. Therese of the Child Jesus (Los Baños)': {
    score: 95.2,
    type: 'parish',
    dimensions: { liquidity: 94, sustainability: 96, efficiency: 92, stability: 98, growth: 95 },
  },
  'Liceo de San Pablo': {
    score: 69.4,
    type: 'school',
    dimensions: { liquidity: 72, sustainability: 70, efficiency: 68, stability: 70, growth: 65 },
  },
  'Liceo de Calamba': {
    score: 66.7,
    type: 'school',
    dimensions: { liquidity: 68, sustainability: 65, efficiency: 65, stability: 68, growth: 72 },
  },
  'Liceo de Cabuyao': {
    score: 63.5,
    type: 'school',
    dimensions: { liquidity: 65, sustainability: 62, efficiency: 62, stability: 65, growth: 60 },
  },
  'Liceo de Los Baños': {
    score: 60.2,
    type: 'school',
    dimensions: { liquidity: 62, sustainability: 60, efficiency: 58, stability: 62, growth: 58 },
  },
  'Liceo de Bay': {
    score: 57.8,
    type: 'school',
    dimensions: { liquidity: 60, sustainability: 58, efficiency: 55, stability: 60, growth: 55 },
  },
  "St. Peter's College Seminary": {
    score: 59.3,
    type: 'seminary',
    dimensions: { liquidity: 58, sustainability: 52, efficiency: 92, stability: 45, growth: 18 },
  },
  'San Pablo Formation House': {
    score: 56.1,
    type: 'seminary',
    dimensions: { liquidity: 55, sustainability: 48, efficiency: 90, stability: 42, growth: 15 },
  },
  'Diocesan Memorial Seminary': {
    score: 53.4,
    type: 'seminary',
    dimensions: { liquidity: 52, sustainability: 45, efficiency: 88, stability: 40, growth: 12 },
  },
  'Holy Cross Seminary': {
    score: 50.2,
    type: 'seminary',
    dimensions: { liquidity: 50, sustainability: 42, efficiency: 86, stability: 38, growth: 10 },
  },
  'Our Lady of Guadalupe Seminary': {
    score: 47.5,
    type: 'seminary',
    dimensions: { liquidity: 48, sustainability: 40, efficiency: 85, stability: 35, growth: 8 },
  },
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function buildAnalysis(
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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ------------------------------------------------------------------
// Public service methods
// ------------------------------------------------------------------
export const analyticsService = {
  async calculateHealthScore(
    entityId: string,
    entityType: 'parish' | 'seminary' | 'school',
    entityClass?: EntityClass,
  ): Promise<FinancialHealthScore> {
    // Well-known institution — use pre-computed dimensions
    if (INSTITUTION_DATA[entityId]) {
      const data = INSTITUTION_DATA[entityId];
      const seed = hashString(entityId);
      const compositeScore = Math.round(data.score);
      const { analysis, recommendations } = buildAnalysis(
        compositeScore,
        entityType,
        data.dimensions.liquidity,
        data.dimensions.efficiency,
        0,
      );

      return {
        entityId,
        entityType,
        entityClass,
        compositeScore,
        dimensions: data.dimensions,
        trend: data.score > 70 ? 'up' : data.score < 40 ? 'down' : 'stable',
        percentageChange: pseudoRandom(seed) * 10 - 5,
        analysis,
        recommendations,
        timestamp: new Date().toISOString(),
      };
    }

    // Compute from stored/generated records
    const records = await financialService.getRecords(entityId, entityType, entityClass);
    if (records.length === 0) return this.getDefaultHealthScore(entityId, entityType);

    const totalCollections = records.reduce((s, r) => s + r.collections, 0);
    const totalDisbursements = records.reduce((s, r) => s + r.disbursements, 0);
    const totalConsumable = records.reduce((s, r) => s + r.consumableCollections, 0);

    const avgCollections = totalCollections / records.length;
    const avgDisbursements = totalDisbursements / records.length;
    const avgConsumable = totalConsumable / records.length;

    const latest = records[records.length - 1];
    const prev = records.length > 1 ? records[records.length - 2] : latest;

    const liquidity = clamp((avgCollections / (avgDisbursements || 1) - 0.5) * 100);
    const sustainability = clamp((avgConsumable / (avgDisbursements || 1) - 0.4) * 125);
    const efficiency = clamp(100 - (avgDisbursements / (avgCollections || 1) - 0.5) * 100);

    const stdDev = Math.sqrt(records.reduce((s, r) => s + (r.collections - avgCollections) ** 2, 0) / records.length);
    const stability = clamp(100 - (stdDev / (avgCollections || 1)) * 250);

    const growthRate = (latest.collections - prev.collections) / (prev.collections || 1);
    const growth = clamp(50 + growthRate * 500);

    const compositeScore = Math.round(
      clamp(liquidity * 0.3 + sustainability * 0.25 + efficiency * 0.2 + stability * 0.15 + growth * 0.1),
    );

    const { analysis, recommendations } = buildAnalysis(compositeScore, entityType, liquidity, efficiency, growthRate);

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
        growth: Math.round(growth),
      },
      trend: compositeScore > 70 ? 'up' : compositeScore < 40 ? 'down' : 'stable',
      percentageChange: growthRate * 100,
      analysis,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  },

  getDefaultHealthScore(entityId: string, entityType: string): FinancialHealthScore {
    return {
      entityId,
      entityType: entityType as any,
      compositeScore: 72,
      dimensions: { liquidity: 75, sustainability: 68, efficiency: 82, stability: 65, growth: 55 },
      trend: 'stable',
      percentageChange: 2.4,
      timestamp: new Date().toISOString(),
    };
  },

  async getDiagnostic(entityId: string, month: string): Promise<DiagnosticResult> {
    const records = await financialService.getRecords(entityId, 'parish');
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
  },
};
