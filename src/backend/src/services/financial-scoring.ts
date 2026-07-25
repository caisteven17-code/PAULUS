// Pure financial-health scoring helpers extracted from entity.service.ts —
// no dependency on SupabaseService or any other injected state.

export function computeFinancialHealthScore(
  income: number,
  expenses: number,
  balance: number,
  history: number[],
): { healthScore: number; risk: 'Low' | 'Moderate' | 'High' } {
  if (income === 0 && expenses === 0 && balance === 0) return { healthScore: 50, risk: 'Moderate' };

  const surplusRatio = income > 0 ? (income - expenses) / income : -1;
  const surplusScore = Math.max(0, Math.min(1, surplusRatio + 0.5));
  const coverageScore = expenses > 0 ? Math.min(1, balance / (expenses * 3)) : income > 0 ? 0.5 : 0;

  let consistencyScore = 0.5;
  if (history.length >= 3) {
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    if (avg > 0) {
      const variance = history.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / history.length;
      consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / avg);
    }
  }

  const raw = 0.4 * surplusScore + 0.3 * coverageScore + 0.3 * consistencyScore;
  const healthScore = Math.min(99, Math.max(10, Math.round(raw * 100)));
  const risk: 'Low' | 'Moderate' | 'High' = healthScore >= 75 ? 'Low' : healthScore >= 55 ? 'Moderate' : 'High';
  return { healthScore, risk };
}

export function computeCollectionTrend(history: number[]): string {
  if (history.length < 4) return '0.0%';
  const half = Math.floor(history.length / 2);
  const older = history.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const recent = history.slice(-half).reduce((a, b) => a + b, 0) / half;
  if (older === 0) return '0.0%';
  const pct = ((recent - older) / older) * 100;
  return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

export function generateFinancialInsight(score: number, trend: string): string {
  const up = trend.startsWith('+');
  if (score >= 80)
    return up
      ? 'Consistent collection growth with disciplined operating expenses.'
      : 'Strong reserves despite mixed collection trend.';
  if (score >= 65) return 'Stable financial position with moderate growth potential.';
  if (score >= 50) return 'Adequate reserves; monitor expense trajectory closely.';
  return 'Tight margins — financial review is recommended.';
}

export function buildFallbackProfile(
  id: string,
  name: string,
  type: 'parish' | 'seminary' | 'school',
  location: string,
  cls: string,
  monthlyCollections: number,
): any {
  const monthlyExpenses = Math.round(monthlyCollections * 0.85);
  const currentBalance = monthlyCollections * 2;
  const { healthScore, risk } = computeFinancialHealthScore(monthlyCollections, monthlyExpenses, currentBalance, []);
  return {
    id,
    name,
    type,
    location,
    class: cls,
    healthScore,
    risk,
    currentBalance,
    monthlyCollections,
    monthlyExpenses,
    collectionsHistory: Array(6).fill(monthlyCollections),
    expensesHistory: Array(6).fill(monthlyExpenses),
    trend: '0.0%',
    insight: monthlyCollections > 0 ? 'Baseline data from diocese records.' : 'Awaiting submission data.',
  };
}
