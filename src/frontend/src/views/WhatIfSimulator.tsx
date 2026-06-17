'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  History,
  Info,
  LayoutDashboard,
  Play,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Target,
  Trash2,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { apiClient } from '../lib/api-client';
import { InlineLoader } from '../components/ui/LoadingScreen';

type AITwinMode = 'parish' | 'priest' | 'seminary' | 'school';
type FinancialAITwinMode = Exclude<AITwinMode, 'priest'>;

interface AITwinProps {
  mode?: AITwinMode;
}

interface FinancialTwinProfile {
  id: string; // institution UUID for live profiles, 'demo-*' for fallback data
  institutionCode?: string; // human-readable code, e.g. P-0001
  classRaw?: string; // raw institution class letter (A/B/C/D) for estimates
  name: string;
  cashBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  healthScore: number;
  collectionsHistory: number[];
  expensesHistory: number[];
}

// Baseline estimates used when an institution has no financial submissions yet.
// Keyed by institution class; income/expenses in PHP per month.
const CLASS_BASELINES: Record<string, { income: number; expenses: number; balance: number }> = {
  A: { income: 120000, expenses: 95000, balance: 500000 },
  B: { income: 70000, expenses: 58000, balance: 250000 },
  C: { income: 35000, expenses: 30000, balance: 100000 },
  D: { income: 15000, expenses: 14000, balance: 40000 },
};

const TYPE_BASELINES: Record<FinancialAITwinMode, { income: number; expenses: number; balance: number }> = {
  parish: CLASS_BASELINES.C,
  seminary: { income: 450000, expenses: 430000, balance: 800000 },
  school: { income: 600000, expenses: 560000, balance: 900000 },
};

const baselineFor = (mode: FinancialAITwinMode, classRaw?: string) =>
  (mode === 'parish' && classRaw && CLASS_BASELINES[classRaw]) || TYPE_BASELINES[mode];

interface MlForecastPoint {
  period: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

interface MlForecast {
  receipts: MlForecastPoint[];
  expenses: MlForecastPoint[];
  championModel: string;
}

// Zeroed stand-in used only for initial state before institutions load.
const PLACEHOLDER_PROFILE: FinancialTwinProfile = {
  id: '',
  name: '',
  cashBalance: 0,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  healthScore: 0,
  collectionsHistory: [],
  expensesHistory: [],
};

const financialTwinConfigs = {
  parish: {
    label: 'Parish',
    labelLower: 'parish',
    pluralLower: 'parishes',
    selectTitle: 'Select Parish',
    title: 'Parish Cash Flow Simulator',
    description:
      'Run what-if financial scenarios using parish trend, volatility, and runway analytics as the baseline.',
    incomeChangeLabel: 'Collections Change',
    externalSupportLabel: 'External Support',
    storageKey: 'church_sim_scenarios',
  },
  seminary: {
    label: 'Seminary',
    labelLower: 'seminary',
    pluralLower: 'seminaries',
    selectTitle: 'Select Seminary',
    title: 'Seminary Financial Simulator',
    description:
      'Model formation income, subsidy exposure, operating costs, and runway scenarios for diocesan seminaries.',
    incomeChangeLabel: 'Formation Income Change',
    externalSupportLabel: 'Diocesan Subsidy',
    storageKey: 'seminary_twin_scenarios',
  },
  school: {
    label: 'School',
    labelLower: 'school',
    pluralLower: 'schools',
    selectTitle: 'Select School',
    title: 'School Financial Simulator',
    description:
      'Model tuition income, enrollment-sensitive cash flow, operating costs, and support scenarios for diocesan schools.',
    incomeChangeLabel: 'Tuition Income Change',
    externalSupportLabel: 'Mission Support',
    storageKey: 'school_twin_scenarios',
  },
} as const;

interface ParishSimulationParams {
  collectionsChange: number;
  expensesChange: number;
  oneTimeIncome: number;
  oneTimeExpense: number;
  externalSupport: number;
  timeline: number;
}

interface ParishSavedScenario {
  id: string;
  name: string;
  parishId: string;
  params: ParishSimulationParams;
  timestamp: number;
  fullScenario?: any;
}

const formatRunwayMonths = (months: number) => (months === 1 ? '1 month' : `${months} months`);

const priests = [
  {
    id: 'noel-artillaga',
    name: 'Rev. Fr. Noel Artillaga',
    currentParish: 'San Isidro Labrador Parish',
    previousAssignments: 3,
    assignmentHealth: 84,
    stewardship: 81,
    reporting: 90,
    adaptability: 74,
    yearsInPost: 6,
    strength: 'Stabilizes reporting discipline and donor trust quickly.',
    assignmentHistory: [
      {
        parish: 'St. Dominic Parish',
        startHealth: 48,
        endHealth: 74,
        reporting: 88,
        volatilityReduction: 19,
        netGrowth: 15,
      },
      {
        parish: 'Holy Family Parish',
        startHealth: 56,
        endHealth: 79,
        reporting: 92,
        volatilityReduction: 16,
        netGrowth: 14,
      },
      {
        parish: 'San Isidro Labrador Parish',
        startHealth: 66,
        endHealth: 84,
        reporting: 90,
        volatilityReduction: 12,
        netGrowth: 10,
      },
    ],
  },
  {
    id: 'michael-santos',
    name: 'Rev. Fr. Michael Santos',
    currentParish: 'Christ the King Parish',
    previousAssignments: 1,
    assignmentHealth: 72,
    stewardship: 76,
    reporting: 82,
    adaptability: 88,
    yearsInPost: 3,
    strength: 'Strong turnaround profile for volatile parishes.',
    assignmentHistory: [
      {
        parish: 'Christ the King Parish',
        startHealth: 45,
        endHealth: 72,
        reporting: 82,
        volatilityReduction: 14,
        netGrowth: 18,
      },
    ],
  },
  {
    id: 'rafael-mendoza',
    name: 'Rev. Fr. Rafael Mendoza',
    currentParish: 'Sto. Rosario Parish',
    previousAssignments: 0,
    assignmentHealth: 67,
    stewardship: 70,
    reporting: 78,
    adaptability: 83,
    yearsInPost: 2,
    strength: 'Good fit for transition-heavy assignments and recovery plans.',
    assignmentHistory: [],
  },
];

const reassignmentParishes = [
  {
    id: 'our-lady-peace',
    name: 'Our Lady of Peace Parish',
    vicariate: 'Central Vicariate',
    parishClass: 'Class A',
    healthScore: 81,
    growthPotential: 62,
    stabilityNeed: 38,
    urgency: 22,
    leadershipComplexity: 45,
    currentMomentum: 76,
  },
  {
    id: 'san-roque',
    name: 'San Roque Parish',
    vicariate: 'South Vicariate',
    parishClass: 'Class D',
    healthScore: 46,
    growthPotential: 85,
    stabilityNeed: 88,
    urgency: 84,
    leadershipComplexity: 70,
    currentMomentum: 42,
  },
  {
    id: 'sto-rosario',
    name: 'Sto. Rosario Parish',
    vicariate: 'North Vicariate',
    parishClass: 'Class C',
    healthScore: 58,
    growthPotential: 76,
    stabilityNeed: 69,
    urgency: 61,
    leadershipComplexity: 58,
    currentMomentum: 55,
  },
  {
    id: 'st-peter',
    name: "St. Peter's Parish",
    vicariate: 'East Vicariate',
    parishClass: 'Class B',
    healthScore: 69,
    growthPotential: 67,
    stabilityNeed: 55,
    urgency: 44,
    leadershipComplexity: 52,
    currentMomentum: 63,
  },
];

interface PriestSimulationParams {
  targetParishId: string;
  timeline: number;
  transitionSupport: 'standard' | 'assisted' | 'intensive';
  handoffWeeks: number;
}

interface PriestSavedScenario {
  id: string;
  name: string;
  priestId: string;
  params: PriestSimulationParams;
  timestamp: number;
  fullScenario?: any;
}

const transitionSupportFactor = {
  standard: 0,
  assisted: 4,
  intensive: 8,
} as const;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function calculateParishAnalytics(parish: FinancialTwinProfile) {
  const incomeAvg = average(parish.collectionsHistory);
  const expenseAvg = average(parish.expensesHistory);
  const monthlyNet = incomeAvg - expenseAvg;
  const earlyIncome = average(parish.collectionsHistory.slice(0, 3));
  const lateIncome = average(parish.collectionsHistory.slice(-3));
  const momentum = earlyIncome > 0 ? ((lateIncome - earlyIncome) / earlyIncome) * 100 : 0;
  const variance = average(parish.collectionsHistory.map((value) => Math.pow(value - incomeAvg, 2)));
  const volatility = incomeAvg > 0 ? Math.sqrt(variance) / incomeAvg : 0;
  const efficiency = incomeAvg > 0 ? ((incomeAvg - expenseAvg) / incomeAvg) * 100 : -100;
  const runwayMonths = monthlyNet < 0 ? Math.floor(parish.cashBalance / Math.abs(monthlyNet)) : -1;

  return {
    efficiency,
    incomeAvg,
    monthlyNet,
    momentum,
    runwayMonths,
    volatility,
  };
}

function calculatePriestAnalytics(priest: (typeof priests)[number]) {
  const evidenceCount = priest.assignmentHistory.length;
  const averageTurnaround =
    evidenceCount > 0
      ? average(priest.assignmentHistory.map((assignment) => assignment.endHealth - assignment.startHealth))
      : 0;
  const averageReporting =
    evidenceCount > 0 ? average(priest.assignmentHistory.map((assignment) => assignment.reporting)) : priest.reporting;
  const averageVolatilityReduction =
    evidenceCount > 0 ? average(priest.assignmentHistory.map((assignment) => assignment.volatilityReduction)) : 0;
  const averageNetGrowth =
    evidenceCount > 0 ? average(priest.assignmentHistory.map((assignment) => assignment.netGrowth)) : 0;

  return {
    averageNetGrowth,
    averageReporting,
    averageTurnaround,
    averageVolatilityReduction,
    evidenceCount,
    evidenceStrength: evidenceCount >= 2 ? 1 : evidenceCount === 1 ? 0.7 : 0.35,
  };
}

function calculateParishResults(
  params: ParishSimulationParams,
  parish: FinancialTwinProfile,
  entityLabel = 'parish',
  mlForecast: MlForecast | null = null,
) {
  const analytics = calculateParishAnalytics(parish);
  const baseMonthlyIncome = analytics.incomeAvg;
  const baseMonthlyExpenses = average(parish.expensesHistory);

  // Per-month baseline: ML forecast when available, otherwise flat average.
  // The user's % adjustments scale each month individually, so a seasonal
  // forecast keeps its shape (Holy Week peak, lean months) under simulation.
  const forecastIncomeAt = (i: number): number => {
    if (!mlForecast?.receipts.length) return baseMonthlyIncome;
    const pts = mlForecast.receipts;
    return Number(pts[Math.min(i, pts.length - 1)].value);
  };
  const forecastExpensesAt = (i: number): number => {
    if (!mlForecast?.expenses.length) return baseMonthlyExpenses;
    const pts = mlForecast.expenses;
    return Number(pts[Math.min(i, pts.length - 1)].value);
  };

  let currentCash = parish.cashBalance + params.oneTimeIncome - params.oneTimeExpense + params.externalSupport;
  let baselineCash = parish.cashBalance;
  const projectedData = [{ month: 'Now', baseline: parish.cashBalance, simulated: currentCash }];

  let netSum = 0;
  let firstDepletionMonth = -1;
  for (let i = 1; i <= params.timeline; i += 1) {
    const baseIncome = forecastIncomeAt(i - 1);
    const baseExpenses = forecastExpensesAt(i - 1);
    const simIncome = baseIncome * (1 + params.collectionsChange / 100);
    const simExpenses = baseExpenses * (1 + params.expensesChange / 100);
    const monthNet = simIncome - simExpenses;
    netSum += monthNet;

    baselineCash += baseIncome - baseExpenses;
    currentCash += monthNet;
    if (firstDepletionMonth === -1 && currentCash <= 0) firstDepletionMonth = i;
    projectedData.push({
      month: `Month ${i}`,
      baseline: Math.max(0, baselineCash),
      simulated: Math.max(0, currentCash),
    });
  }

  const monthlyNet = netSum / params.timeline;

  let runwayMonths = -1;
  if (firstDepletionMonth !== -1) {
    runwayMonths = firstDepletionMonth;
  } else if (monthlyNet < 0 && currentCash > 0) {
    // Did not deplete inside the timeline; extrapolate from the average burn.
    runwayMonths = params.timeline + Math.floor(currentCash / Math.abs(monthlyNet));
  }

  let riskLevel = 'Low';
  let riskColor = 'text-emerald-500';
  let riskBg = 'bg-emerald-500/10';

  if (runwayMonths !== -1) {
    if (runwayMonths < 3) {
      riskLevel = 'Critical';
      riskColor = 'text-rose-500';
      riskBg = 'bg-rose-500/10';
    } else if (runwayMonths < 6) {
      riskLevel = 'High';
      riskColor = 'text-orange-500';
      riskBg = 'bg-orange-500/10';
    } else if (runwayMonths < 12) {
      riskLevel = 'Medium';
      riskColor = 'text-amber-500';
      riskBg = 'bg-amber-500/10';
    }
  }

  let recommendation = `Analytics suggest the ${entityLabel} is stable enough to preserve reserves while testing modest growth interventions.`;
  if (monthlyNet < 0) {
    if (runwayMonths < 6) {
      recommendation = `Analytics indicate a short cash runway and weak operating margin. Projected deficit is ${formatCurrency(Math.abs(monthlyNet))} monthly, so expense containment or diocesan support should be prioritized.`;
    } else {
      recommendation = `Historical analytics show spending pressure outpacing ${entityLabel} income. Review operating costs and introduce income-strengthening actions before sustainability weakens further.`;
    }
  } else if (params.collectionsChange > 10 || analytics.momentum > 5) {
    recommendation = `Recent income momentum is positive. The scenario assumes that ${entityLabel} growth programs and stakeholder engagement continue to support that trend.`;
  } else if (analytics.volatility > 0.12) {
    recommendation =
      'Income is historically volatile. Treat this scenario as sensitive to seasonal swings and compare it against submission and expense discipline before acting.';
  }

  return {
    analytics,
    monthlyNet,
    projectedData,
    recommendation,
    riskBg,
    riskColor,
    riskLevel,
    runwayMonths,
  };
}

function calculatePriestScenario(
  priest: (typeof priests)[number],
  parish: (typeof reassignmentParishes)[number],
  params: PriestSimulationParams,
) {
  const priestAnalytics = calculatePriestAnalytics(priest);
  const supportBoost = transitionSupportFactor[params.transitionSupport];
  const fitScore = Math.round(
    clamp(
      priest.assignmentHealth * 0.16 +
        priest.stewardship * 0.14 +
        priestAnalytics.averageTurnaround * 1.2 +
        priestAnalytics.averageVolatilityReduction * 0.9 +
        priestAnalytics.averageNetGrowth * 0.8 +
        priest.adaptability * 0.12 +
        parish.stabilityNeed * 0.16 +
        parish.urgency * 0.12 +
        parish.growthPotential * 0.08 +
        supportBoost +
        priestAnalytics.evidenceStrength * 8,
    ),
  );

  const transitionRisk = Math.max(
    18,
    Math.round(
      parish.urgency * 0.32 +
        parish.leadershipComplexity * 0.24 +
        (100 - priestAnalytics.averageReporting) * 0.14 +
        (100 - priest.adaptability) * 0.18 -
        priestAnalytics.averageVolatilityReduction * 0.35 -
        supportBoost * 1.8 -
        params.handoffWeeks * 1.2,
    ),
  );

  const confidence = Math.min(
    96,
    Math.round(
      56 +
        priestAnalytics.averageReporting * 0.12 +
        priest.yearsInPost * 2 +
        priestAnalytics.evidenceCount * 7 +
        params.handoffWeeks * 1.5 +
        supportBoost * 0.8 -
        parish.leadershipComplexity * 0.08,
    ),
  );

  const sourceDip = Math.max(
    4,
    Math.round(
      18 -
        priest.yearsInPost * 1.2 -
        priestAnalytics.averageVolatilityReduction * 0.25 -
        supportBoost * 0.5 +
        params.handoffWeeks * 0.4,
    ),
  );
  const targetLift = Math.max(
    6,
    Math.round(
      (fitScore - 50) * 0.3 +
        priestAnalytics.averageTurnaround * 0.4 +
        parish.growthPotential * 0.12 +
        parish.stabilityNeed * 0.08 -
        transitionRisk * 0.06 +
        supportBoost * 0.9,
    ),
  );

  const months = Array.from({ length: params.timeline + 1 }, (_, index) => index);
  const projectedData = months.map((month) => {
    const adoptionCurve = month / Math.max(params.timeline, 1);
    const sourceRecovery = sourceDip * Math.max(0, 1 - adoptionCurve * 0.8);
    const targetGain = targetLift * adoptionCurve;

    return {
      month: month === 0 ? 'Now' : `M${month}`,
      stayCase: priest.assignmentHealth + adoptionCurve * 2,
      sourceParish: Math.max(35, priest.assignmentHealth - sourceRecovery),
      targetParish: Math.min(98, parish.healthScore + targetGain),
    };
  });

  const dioceseLift = Math.round(targetLift - sourceDip * 0.45);
  const riskBand = transitionRisk >= 72 ? 'High' : transitionRisk >= 52 ? 'Medium' : 'Low';
  const riskTone =
    riskBand === 'High'
      ? { text: 'text-rose-600', bg: 'bg-rose-50 border-rose-100' }
      : riskBand === 'Medium'
        ? { text: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' }
        : { text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' };

  const recommendation =
    fitScore >= 80 && transitionRisk < 60
      ? `${priest.name} is a strong reassignment candidate for ${parish.name}. Historical assignment analytics show above-average turnaround, stewardship, and stability improvement that align with this parish's current needs.`
      : fitScore >= 70
        ? `${priest.name} can be reassigned to ${parish.name}, but the analytics indicate a mixed fit. The scenario should be reviewed against parish urgency, complexity, and limited historical evidence before transfer.`
        : `${parish.name} is not the best immediate placement for ${priest.name}. Based on prior assignment analytics, a lower-complexity or lower-volatility parish would currently be a better match.`;

  return {
    analytics: priestAnalytics,
    confidence,
    dioceseLift,
    fitScore,
    projectedData,
    recommendation,
    riskBand,
    riskText: riskTone.text,
    riskBg: riskTone.bg,
    targetLift,
    transitionRisk,
    vacatedParishDip: sourceDip,
  };
}

function ParishAITwin({ mode = 'parish' }: { mode?: FinancialAITwinMode }) {
  const config = financialTwinConfigs[mode];
  const [liveProfiles, setLiveProfiles] = useState<FinancialTwinProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const profiles = liveProfiles;
  const [selectedParishId, setSelectedParishId] = useState<string>('');

  // Fetch real institution financial profiles; fall back to hardcoded on failure.
  // Institutions without submissions get class-based baseline estimates so the
  // simulation still produces meaningful numbers.
  useEffect(() => {
    const entityType = mode === 'seminary' ? 'seminary' : mode === 'school' ? 'school' : 'parish';
    apiClient
      .getFinancialProfiles(entityType as any)
      .then((data) => {
        if (!data) return;
        const mapped: FinancialTwinProfile[] = data.map((p: any) => {
          const hasFinancials = (p.monthlyCollections ?? 0) > 0 || (p.monthlyExpenses ?? 0) > 0;
          const estimate = baselineFor(mode, p.classRaw);
          const income = hasFinancials ? p.monthlyCollections : estimate.income;
          const expenses = hasFinancials ? p.monthlyExpenses : estimate.expenses;
          return {
            id: p.id,
            institutionCode: p.institutionCode || undefined,
            classRaw: p.classRaw || undefined,
            name: p.name,
            cashBalance: hasFinancials ? (p.currentBalance ?? 0) : estimate.balance,
            monthlyIncome: income,
            monthlyExpenses: expenses,
            healthScore: p.healthScore ?? 50,
            collectionsHistory: p.collectionsHistory?.length === 6 ? p.collectionsHistory : Array(6).fill(income),
            expensesHistory: p.expensesHistory?.length === 6 ? p.expensesHistory : Array(6).fill(expenses),
          };
        });
        setLiveProfiles(mapped);
        setSelectedParishId('');
        setProfilesLoaded(true);
      })
      .catch((err) => {
        console.error('[WhatIfSimulator] failed to load institution profiles:', err);
        setLoadError(true);
        setProfilesLoaded(true);
      });
  }, [mode]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<ParishSavedScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<any>(null);
  const [scenarioNameModal, setScenarioNameModal] = useState<{ open: boolean; name: string; onConfirm: (name: string) => void }>({ open: false, name: '', onConfirm: () => {} });

  // Load scenarios from Supabase on mount
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        setLoadingScenarios(true);
        const scenarios = await apiClient.listInstitutionScenarios();
        // Filter by current mode and not archived
        const filtered = (scenarios || [])
          .filter(
            (s: any) =>
              s.institutionType === (mode === 'seminary' ? 'seminary' : mode === 'school' ? 'school' : 'parish') &&
              !s.isArchived,
          )
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            parishId: s.institutionId,
            params: {
              collectionsChange: s.incomeChange,
              expensesChange: s.expensesChange,
              oneTimeIncome: s.oneTimeIncome,
              oneTimeExpense: s.oneTimeExpense,
              externalSupport: s.externalSupport,
              timeline: s.timelineMonths,
            },
            timestamp: new Date(s.createdAt).getTime(),
            // Store the full scenario data for detail view
            fullScenario: s,
          }))
          .sort((a: any, b: any) => b.timestamp - a.timestamp);
        setSavedScenarios(filtered);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      } finally {
        setLoadingScenarios(false);
      }
    };
    loadScenarios();
  }, [mode]);
  const [params, setParams] = useState<ParishSimulationParams>({
    collectionsChange: 0,
    expensesChange: 0,
    oneTimeIncome: 0,
    oneTimeExpense: 0,
    externalSupport: 0,
    timeline: 12,
  });

  const selectedParish = useMemo(
    () => (selectedParishId ? profiles.find((parish) => parish.id === selectedParishId) : undefined),
    [profiles, selectedParishId],
  );
  const selectedParishAnalytics = useMemo(
    () => calculateParishAnalytics(selectedParish ?? PLACEHOLDER_PROFILE),
    [selectedParish],
  );

  // ML forecast baseline. Fetched once per institution (24 periods = max
  // timeline, sliced client-side). Null until loaded or when the predictive
  // service reports insufficient data — the class/average baseline then applies.
  const [mlForecast, setMlForecast] = useState<MlForecast | null>(null);
  const [forecastSource, setForecastSource] = useState<string>('Estimate');

  useEffect(() => {
    setMlForecast(null);
    setForecastSource('Estimate');
    if (!selectedParish?.id) return;

    const entityType = mode === 'seminary' ? 'seminary' : mode === 'school' ? 'school' : 'parish';
    let cancelled = false;
    apiClient
      .getFinancialForecast(entityType, selectedParish.id, 24)
      .then((data: any) => {
        if (cancelled) return;
        if (data?.data_sufficient && data.forecast_receipts?.length) {
          setMlForecast({
            receipts: data.forecast_receipts,
            expenses: data.forecast_expenses ?? [],
            championModel: data.champion?.champion_model ?? 'ML',
          });
          setForecastSource(data.champion?.champion_model ?? 'ML');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedParish?.id, mode]);

  const [simulationResults, setSimulationResults] = useState(() =>
    calculateParishResults(params, selectedParish ?? PLACEHOLDER_PROFILE, config.labelLower, null),
  );

  useEffect(() => {
    if (!selectedParish) return;
    setSimulationResults(calculateParishResults(params, selectedParish, config.labelLower, mlForecast));
  }, [selectedParishId, mode, mlForecast]);

  const handleRunSimulation = () => {
    if (!selectedParish) return;
    setIsSimulating(true);
    setTimeout(() => {
      setSimulationResults(calculateParishResults(params, selectedParish, config.labelLower, mlForecast));
      setIsSimulating(false);
    }, 800);
  };

  const handleSaveScenario = async () => {
    if (!selectedParish?.id) return;
    setScenarioNameModal({
      open: true,
      name: '',
      onConfirm: async (name: string) => {
        if (!name) return;
        try {
      const entityType = mode === 'seminary' ? 'seminary' : mode === 'school' ? 'school' : 'parish';
      const scenario = await apiClient.createInstitutionScenario({
        institutionType: entityType,
        institutionId: selectedParish.id,
        institutionName: selectedParish.name,
        name,
        incomeChange: params.collectionsChange,
        expensesChange: params.expensesChange,
        oneTimeIncome: params.oneTimeIncome,
        oneTimeExpense: params.oneTimeExpense,
        externalSupport: params.externalSupport,
        timelineMonths: params.timeline,
        // Include results
        monthlyNet: simulationResults.monthlyNet,
        runwayMonths: simulationResults.runwayMonths,
        riskLevel: simulationResults.riskLevel as 'Low' | 'Medium' | 'High' | 'Critical',
        finalBalance:
          simulationResults.projectedData[simulationResults.projectedData.length - 1]?.simulated || 0,
        projectedData: simulationResults.projectedData,
        recommendation: simulationResults.recommendation,
      });

      // Add to local state
      const nextScenario: ParishSavedScenario = {
        id: scenario.id,
        name: scenario.name,
        parishId: selectedParishId,
        params: { ...params },
        timestamp: Date.now(),
        fullScenario: scenario,
      };
      setSavedScenarios([nextScenario, ...savedScenarios]);
      setScenarioNameModal({ open: false, name: '', onConfirm: () => {} });
        } catch (error: any) {
          console.error('Failed to save scenario:', error);
          const detail = String(error?.message ?? '').split('→ 400: ')[1] ?? 'Could not save the scenario. Please try again.';
          alert(detail);
        }
      },
    });
  };

  const handleDeleteScenario = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    try {
      await apiClient.deleteInstitutionScenario(id);
      const updated = savedScenarios.filter((scenario) => scenario.id !== id);
      setSavedScenarios(updated);
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
  };

  const handleLoadScenario = (scenario: ParishSavedScenario) => {
    const parish = profiles.find((item) => item.id === scenario.parishId) || profiles[0];
    if (!parish) return;
    setSelectedParishId(parish.id);
    setParams(scenario.params);
    setSimulationResults(calculateParishResults(scenario.params, parish, config.labelLower, mlForecast));
  };

  const handleReset = () => {
    setParams({
      collectionsChange: 0,
      expensesChange: 0,
      oneTimeIncome: 0,
      oneTimeExpense: 0,
      externalSupport: 0,
      timeline: 12,
    });
  };

  const healthTone = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10';
    return 'text-rose-500 bg-rose-500/10';
  };

  if (!profilesLoaded) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
        <div className="space-y-1 mb-8">
          <div className="flex items-center gap-2 text-gold-500">
            <Zap className="w-5 h-5 fill-current" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Intelligence</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-church-black">{config.title}</h1>
        </div>
        <div className="bg-white rounded-[32px] p-12 shadow-sm border border-church-grey/10">
          <InlineLoader label={`Loading ${config.pluralLower}`} className="py-0" />
        </div>
      </div>
    );
  }

  if (profilesLoaded && profiles.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
        <div className="space-y-1 mb-8">
          <div className="flex items-center gap-2 text-gold-500">
            <Zap className="w-5 h-5 fill-current" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Intelligence</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-church-black">{config.title}</h1>
        </div>
        <div className="bg-white rounded-[32px] p-12 shadow-sm border border-church-grey/10 text-center space-y-3">
          <Info className="w-10 h-10 text-church-grey mx-auto" />
          <h3 className="text-lg font-bold text-church-black">
            {loadError ? `Could not load ${config.pluralLower}` : `No ${config.pluralLower} registered yet`}
          </h3>
          <p className="text-sm text-church-grey max-w-md mx-auto">
            {loadError
              ? 'The institution service did not respond. Check that the backend is running, then reload this page.'
              : `${config.label} institutions will appear here once an administrator registers them. Simulations can run as soon as an institution exists, even before financial submissions arrive.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-gold-500">
            <Zap className="w-5 h-5 fill-current" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Intelligence</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-church-black">{config.title}</h1>
          <p className="text-church-grey text-sm">{config.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-church-grey/20 text-church-grey hover:bg-white transition-all text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSaveScenario}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-church-black text-white hover:bg-church-grey transition-all text-sm font-bold shadow-lg shadow-black/10"
          >
            <Save className="w-4 h-4" />
            Save Scenario
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gold-500/10 flex items-center justify-center">
                <Search className="w-5 h-5 text-gold-600" />
              </div>
              <h3 className="text-lg font-bold text-church-black">{config.selectTitle}</h3>
            </div>
            <div className="relative">
              <select
                value={selectedParishId}
                onChange={(event) => setSelectedParishId(event.target.value)}
                className={`w-full pl-4 pr-10 py-4 bg-church-light border border-church-grey/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gold-500 appearance-none font-medium ${selectedParishId ? 'text-church-black' : 'text-church-grey'}`}
              >
                <option value="" disabled>
                  Select a {config.labelLower} here
                </option>
                {profiles.map((parish) => (
                  <option key={parish.id} value={parish.id}>
                    {parish.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-church-grey">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
            {selectedParish && (
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`p-4 rounded-2xl border border-church-grey/5 flex flex-col gap-1 ${healthTone(selectedParish.healthScore)}`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Health Score</span>
                  <span className="text-2xl font-bold">{selectedParish.healthScore}</span>
                </div>
                <div className="p-4 rounded-2xl bg-church-light border border-church-grey/5 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-church-grey uppercase tracking-wider">Current Runway</span>
                  <span className="text-2xl font-bold text-church-black">
                    {selectedParish.monthlyIncome >= selectedParish.monthlyExpenses
                      ? 'No depletion'
                      : formatRunwayMonths(
                          Math.floor(
                            selectedParish.cashBalance /
                              (selectedParish.monthlyExpenses - selectedParish.monthlyIncome),
                          ),
                        )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-church-black">Simulation Controls</h3>
              </div>
              <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
                What-If Mode
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-church-black flex items-center gap-2">
                    {config.incomeChangeLabel}
                    <Info className="w-3.5 h-3.5 text-church-grey" />
                  </label>
                  <span
                    className={`text-sm font-bold ${params.collectionsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {params.collectionsChange > 0 ? '+' : ''}
                    {params.collectionsChange}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={params.collectionsChange}
                  onChange={(event) => setParams({ ...params, collectionsChange: Number(event.target.value) })}
                  className="w-full h-2 bg-church-light rounded-lg appearance-none cursor-pointer accent-gold-500"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-church-black flex items-center gap-2">
                    Expenses Change
                    <Info className="w-3.5 h-3.5 text-church-grey" />
                  </label>
                  <span
                    className={`text-sm font-bold ${params.expensesChange <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {params.expensesChange > 0 ? '+' : ''}
                    {params.expensesChange}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={params.expensesChange}
                  onChange={(event) => setParams({ ...params, expensesChange: Number(event.target.value) })}
                  className="w-full h-2 bg-church-light rounded-lg appearance-none cursor-pointer accent-gold-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">
                    One-time Income
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-church-grey font-bold">P</span>
                    <input
                      type="number"
                      value={params.oneTimeIncome || ''}
                      onChange={(event) => setParams({ ...params, oneTimeIncome: Number(event.target.value) })}
                      className="w-full pl-8 pr-4 py-3 bg-church-light border border-church-grey/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">
                    One-time Expense
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-church-grey font-bold">P</span>
                    <input
                      type="number"
                      value={params.oneTimeExpense || ''}
                      onChange={(event) => setParams({ ...params, oneTimeExpense: Number(event.target.value) })}
                      className="w-full pl-8 pr-4 py-3 bg-church-light border border-church-grey/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">
                    {config.externalSupportLabel}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-church-grey font-bold">P</span>
                    <input
                      type="number"
                      value={params.externalSupport || ''}
                      onChange={(event) => setParams({ ...params, externalSupport: Number(event.target.value) })}
                      className="w-full pl-8 pr-4 py-3 bg-church-light border border-church-grey/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">
                    Timeline (Months)
                  </label>
                  <select
                    value={params.timeline}
                    onChange={(event) => setParams({ ...params, timeline: Number(event.target.value) })}
                    className="w-full px-4 py-3 bg-church-light border border-church-grey/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                  >
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>12 Months</option>
                    <option value={24}>24 Months</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-4 bg-gold-500 text-church-black rounded-2xl font-bold hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSimulating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-church-black/30 border-t-church-black rounded-full animate-spin" />
                    Calculating Scenarios...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Run Simulation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-8">
          {!selectedParish ? (
            <div className="bg-white rounded-[32px] p-12 shadow-sm border border-church-grey/10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
              <div className="w-16 h-16 rounded-full bg-gold-500/10 flex items-center justify-center">
                <TrendingUp className="w-8 h-8 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-church-black">Select a {config.labelLower} to get started</h3>
              <p className="text-sm text-church-grey max-w-sm">
                Choose a {config.labelLower} from the dropdown on the left to load its financial baseline and run
                what-if scenarios.
              </p>
            </div>
          ) : (
          <>
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-church-black">Analytics-Based Scenario Results</h3>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                    mlForecast
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-amber-500/10 text-amber-600'
                  }`}
                  title={
                    mlForecast
                      ? `Baseline driven by the ${forecastSource} forecasting model trained on this institution's submissions.`
                      : 'No financial submissions yet — baseline uses class-based estimates. ML forecasting activates automatically once 6+ months of records exist.'
                  }
                >
                  {mlForecast ? `ML Forecast — ${forecastSource}` : 'Class-Based Estimate'}
                </div>
                <div
                  className={`px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm ${simulationResults.riskBg} ${simulationResults.riskColor}`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {simulationResults.riskLevel} Risk Level
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="min-w-0 p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col gap-2.5">
                <span className="block text-[10px] font-bold text-church-grey uppercase tracking-widest leading-tight">
                  New Cash Runway
                </span>
                <span className="block max-w-full whitespace-nowrap text-[clamp(1.35rem,2.1vw,1.9rem)] leading-none font-bold text-church-black">
                  {simulationResults.runwayMonths === -1
                    ? 'No depletion'
                    : formatRunwayMonths(simulationResults.runwayMonths)}
                </span>
              </div>
              <div className="min-w-0 p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col gap-2.5">
                <span className="block text-[10px] font-bold text-church-grey uppercase tracking-widest leading-tight">
                  Monthly Net Flow
                </span>
                <span
                  className={`block max-w-full whitespace-nowrap text-[clamp(1rem,1.5vw,1.45rem)] leading-none font-bold tracking-tight ${simulationResults.monthlyNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {formatCurrency(Math.abs(simulationResults.monthlyNet))}
                </span>
              </div>
              <div className="min-w-0 p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col gap-2.5">
                <span className="block text-[10px] font-bold text-church-grey uppercase tracking-widest leading-tight">
                  Final Balance
                </span>
                <span className="block max-w-full whitespace-nowrap text-[clamp(1rem,1.5vw,1.45rem)] leading-none font-bold tracking-tight text-church-black">
                  {formatCurrency(
                    simulationResults.projectedData[simulationResults.projectedData.length - 1].simulated,
                  )}
                </span>
              </div>
            </div>

            <div className="h-[420px] w-full">
              <ReactECharts
                style={{ height: '420px', width: '100%' }}
                option={{
                  color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      params.map((p: any) => `${p.seriesName}: ${formatCurrency(Number(p.value ?? 0))}`).join('<br/>'),
                  },
                  legend: { data: ['Baseline', 'Simulated'] },
                  grid: { left: 60, right: 20, bottom: 30, top: 40 },
                  xAxis: {
                    type: 'category',
                    data: simulationResults.projectedData.map((d) => d.month),
                    axisLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF' },
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: {
                      formatter: (v: number) => `P${Math.round(v / 1000)}k`,
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: '#9CA3AF',
                    },
                  },
                  series: [
                    {
                      name: 'Baseline',
                      type: 'line',
                      data: simulationResults.projectedData.map((d) => d.baseline),
                      smooth: true,
                      lineStyle: { color: '#9CA3AF', width: 2, type: 'dashed' },
                      itemStyle: { color: '#9CA3AF' },
                      areaStyle: { color: 'transparent' },
                    },
                    {
                      name: 'Simulated',
                      type: 'line',
                      data: simulationResults.projectedData.map((d) => d.simulated),
                      smooth: true,
                      lineStyle: { color: '#D4AF37', width: 4 },
                      itemStyle: { color: '#D4AF37' },
                      areaStyle: {
                        color: {
                          type: 'linear',
                          x: 0,
                          y: 0,
                          x2: 0,
                          y2: 1,
                          colorStops: [
                            { offset: 0, color: 'rgba(212,175,55,0.3)' },
                            { offset: 1, color: 'rgba(212,175,55,0)' },
                          ],
                        },
                      },
                    },
                  ],
                }}
              />
            </div>

            <div className="p-6 rounded-[24px] bg-gold-500/5 border border-gold-500/10 space-y-3">
              <div className="flex items-center gap-2 text-gold-600">
                <Zap className="w-4 h-4 fill-current" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Analytics-Based Recommendation</span>
              </div>
              <p className="text-sm text-church-black font-medium leading-relaxed">
                {simulationResults.recommendation}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                  <History className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-church-black">Saved Scenarios</h3>
              </div>
              <span className="text-xs font-bold text-church-grey">
                {loadingScenarios ? 'Loading...' : `${savedScenarios.length} Saved`}
              </span>
            </div>

            {loadingScenarios ? (
              <div className="py-4">
                <InlineLoader label="Loading scenarios" />
              </div>
            ) : savedScenarios.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Scenario List */}
                <div className="lg:col-span-1 space-y-2">
                  {savedScenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => setSelectedScenarioDetail(scenario.fullScenario)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedScenarioDetail?.id === scenario.id
                          ? 'bg-gold-50 border-gold-500'
                          : 'bg-church-light border-church-grey/5 hover:border-gold-500/30'
                      }`}
                    >
                      <h4 className="text-sm font-bold text-church-black">{scenario.name}</h4>
                      <p className="text-[10px] text-church-grey font-medium mt-1">
                        {new Date(scenario.timestamp).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Scenario Detail Panel */}
                <div className="lg:col-span-2">
                  {selectedScenarioDetail ? (
                    <div className="space-y-5 p-5 rounded-2xl bg-church-light border border-church-grey/5">
                      {/* Header */}
                      <div className="border-b border-church-grey/10 pb-4">
                        <h4 className="text-lg font-bold text-church-black">{selectedScenarioDetail.name}</h4>
                        <p className="text-xs text-church-grey font-medium mt-2">
                          Saved: {new Date(selectedScenarioDetail.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-church-grey font-medium">
                          Institution: {selectedScenarioDetail.institutionName}
                        </p>
                      </div>

                      {/* Parameters Section */}
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-widest text-church-grey mb-3">
                          Parameters Used
                        </h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Income Change
                            </p>
                            <p
                              className={`text-base font-bold ${selectedScenarioDetail.incomeChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                            >
                              {selectedScenarioDetail.incomeChange > 0 ? '+' : ''}
                              {selectedScenarioDetail.incomeChange}%
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Expenses Change
                            </p>
                            <p
                              className={`text-base font-bold ${selectedScenarioDetail.expensesChange <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                            >
                              {selectedScenarioDetail.expensesChange > 0 ? '+' : ''}
                              {selectedScenarioDetail.expensesChange}%
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              One-time Income
                            </p>
                            <p className="text-base font-bold text-church-black">
                              {formatCurrency(selectedScenarioDetail.oneTimeIncome)}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Timeline
                            </p>
                            <p className="text-base font-bold text-church-black">
                              {selectedScenarioDetail.timelineMonths} months
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Apply Button */}
                      <button
                        onClick={() => {
                          setParams({
                            collectionsChange: selectedScenarioDetail.incomeChange,
                            expensesChange: selectedScenarioDetail.expensesChange,
                            oneTimeIncome: selectedScenarioDetail.oneTimeIncome,
                            oneTimeExpense: selectedScenarioDetail.oneTimeExpense,
                            externalSupport: selectedScenarioDetail.externalSupport,
                            timeline: selectedScenarioDetail.timelineMonths,
                          });
                          setSelectedScenarioDetail(null);
                        }}
                        className="w-full py-3 bg-gold-500 text-church-black rounded-xl font-bold hover:bg-gold-600 transition-all text-sm"
                      >
                        Apply Parameters Again
                      </button>

                      {/* Results Section */}
                      <div className="border-t border-church-grey/10 pt-4">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-church-grey mb-3">
                          Saved Results
                        </h5>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Monthly Net
                            </p>
                            <p
                              className={`text-sm font-bold ${selectedScenarioDetail.monthlyNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                            >
                              {formatCurrency(selectedScenarioDetail.monthlyNet)}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Runway
                            </p>
                            <p className="text-sm font-bold text-church-black">
                              {selectedScenarioDetail.runwayMonths === -1
                                ? 'No depletion'
                                : formatRunwayMonths(selectedScenarioDetail.runwayMonths)}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Risk Level
                            </p>
                            <p className="text-sm font-bold text-church-black">{selectedScenarioDetail.riskLevel}</p>
                          </div>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          handleDeleteScenario(selectedScenarioDetail.id);
                          setSelectedScenarioDetail(null);
                        }}
                        className="w-full py-2 bg-rose-50 text-rose-600 rounded-lg font-bold hover:bg-rose-100 transition-all text-xs"
                      >
                        Delete Scenario
                      </button>
                    </div>
                  ) : (
                    <div className="py-12 flex items-center justify-center h-full rounded-2xl bg-church-light border border-dashed border-church-grey/20">
                      <p className="text-sm text-church-grey font-medium">Select a scenario to view details</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-church-light flex items-center justify-center">
                  <History className="w-8 h-8 text-church-grey/30" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-church-black">No saved scenarios yet</p>
                  <p className="text-xs text-church-grey">
                    Run a {config.labelLower} simulator scenario and save it to see it here.
                  </p>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* Scenario Name Modal */}
      {scenarioNameModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full space-y-6">
            <h3 className="text-xl font-bold text-church-black">Save Scenario</h3>
            <div>
              <label className="block text-sm font-bold text-church-black mb-2">Scenario Name</label>
              <input
                type="text"
                value={scenarioNameModal.name}
                onChange={(e) =>
                  setScenarioNameModal({ ...scenarioNameModal, name: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    scenarioNameModal.onConfirm(scenarioNameModal.name);
                  }
                  if (e.key === 'Escape') {
                    setScenarioNameModal({ open: false, name: '', onConfirm: () => {} });
                  }
                }}
                autoFocus
                placeholder="Enter scenario name"
                className="w-full px-4 py-2 border border-church-grey/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setScenarioNameModal({ open: false, name: '', onConfirm: () => {} })}
                className="px-4 py-2 rounded-xl border border-church-grey/20 text-church-grey font-bold hover:bg-church-light transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => scenarioNameModal.onConfirm(scenarioNameModal.name)}
                disabled={!scenarioNameModal.name.trim()}
                className="px-6 py-2 rounded-xl bg-gold-500 text-church-black font-bold hover:bg-gold-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PriestAITwin() {
  const [selectedPriestId, setSelectedPriestId] = useState('');
  const [params, setParams] = useState<PriestSimulationParams>({
    targetParishId: '',
    timeline: 12,
    transitionSupport: 'assisted',
    handoffWeeks: 6,
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<PriestSavedScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<any>(null);
  const [scenarioNameModal, setScenarioNameModal] = useState<{ open: boolean; name: string; onConfirm: (name: string) => void }>({ open: false, name: '', onConfirm: () => {} });

  // Load scenarios from Supabase on mount
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        setLoadingScenarios(true);
        const scenarios = await apiClient.listPriestScenarios();
        const mapped = (scenarios || [])
          .filter((s: any) => !s.isArchived)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            priestId: s.priestId,
            params: {
              targetParishId: s.targetParishId,
              timeline: s.timelineMonths,
              transitionSupport: s.transitionSupport,
              handoffWeeks: s.handoffWeeks,
            },
            timestamp: new Date(s.createdAt).getTime(),
            fullScenario: s,
          }))
          .sort((a: any, b: any) => b.timestamp - a.timestamp);
        setSavedScenarios(mapped);
      } catch (error) {
        console.error('Failed to load priest scenarios:', error);
      } finally {
        setLoadingScenarios(false);
      }
    };
    loadScenarios();
  }, []);

  const selectedPriest = useMemo(
    () => (selectedPriestId ? priests.find((priest) => priest.id === selectedPriestId) : undefined),
    [selectedPriestId],
  );
  const selectedParish = useMemo(
    () => (params.targetParishId ? reassignmentParishes.find((parish) => parish.id === params.targetParishId) : undefined),
    [params.targetParishId],
  );

  const [results, setResults] = useState<ReturnType<typeof calculatePriestScenario> | null>(null);
  const assignmentEvidenceLevel = selectedPriest
    ? selectedPriest.previousAssignments >= 2
      ? 'full'
      : selectedPriest.previousAssignments === 1
        ? 'provisional'
        : 'insufficient'
    : 'insufficient';
  const hasFullRanking = assignmentEvidenceLevel === 'full';

  useEffect(() => {
    if (selectedPriest && selectedParish) {
      setResults(calculatePriestScenario(selectedPriest, selectedParish, params));
    }
  }, [selectedPriest, selectedParish]);

  const ranking = useMemo(() => {
    if (!selectedPriest) return [];
    return reassignmentParishes
      .map((parish) => ({
        parish,
        score: calculatePriestScenario(selectedPriest, parish, params).fitScore,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  }, [selectedPriest, params]);

  const runSimulation = () => {
    if (!selectedPriest || !selectedParish) return;
    setIsSimulating(true);
    setTimeout(() => {
      setResults(calculatePriestScenario(selectedPriest, selectedParish, params));
      setIsSimulating(false);
    }, 700);
  };

  const saveScenario = async () => {
    if (!selectedPriest || !selectedParish || !results) return;
    setScenarioNameModal({
      open: true,
      name: '',
      onConfirm: async (name: string) => {
        if (!name) return;
        try {
      const scenario = await apiClient.createPriestScenario({
        priestId: selectedPriestId,
        priestName: selectedPriest!.name,
        targetParishId: params.targetParishId,
        targetParishName: selectedParish!.name,
        name,
        transitionSupport: params.transitionSupport,
        handoffWeeks: params.handoffWeeks,
        timelineMonths: params.timeline,
        fitScore: results!.fitScore,
        targetLift: results!.targetLift,
        vacatedParishDip: results!.vacatedParishDip,
        dioceseLift: results!.dioceseLift,
        transitionRisk: results!.transitionRisk,
        riskBand: results!.riskBand as 'Low' | 'Medium' | 'High',
        confidence: results!.confidence,
        projectedData: results!.projectedData,
        recommendation: results!.recommendation,
      });

      const nextScenario: PriestSavedScenario = {
        id: scenario.id,
        name: scenario.name,
        priestId: selectedPriestId,
        params: { ...params },
        timestamp: Date.now(),
        fullScenario: scenario,
      };

      setSavedScenarios([nextScenario, ...savedScenarios]);
      setScenarioNameModal({ open: false, name: '', onConfirm: () => {} });
        } catch (error: any) {
          console.error('Failed to save scenario:', error);
          const detail = String(error?.message ?? '').split('→ 400: ')[1] ?? 'Could not save the scenario. Please try again.';
          alert(detail);
        }
      },
    });
  };

  const deleteScenario = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    try {
      await apiClient.deletePriestScenario(id);
      const updated = savedScenarios.filter((scenario) => scenario.id !== id);
      setSavedScenarios(updated);
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
  };

  const loadScenario = (scenario: PriestSavedScenario) => {
    setSelectedPriestId(scenario.priestId);
    setParams(scenario.params);
    const priest = priests.find((item) => item.id === scenario.priestId) || priests[0];
    const parish =
      reassignmentParishes.find((item) => item.id === scenario.params.targetParishId) || reassignmentParishes[0];
    setResults(calculatePriestScenario(priest, parish, scenario.params));
  };

  const resetScenario = () => {
    setSelectedPriestId('');
    setParams({ targetParishId: '', timeline: 12, transitionSupport: 'assisted', handoffWeeks: 6 });
    setResults(null);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-gold-500">
            <Zap className="w-5 h-5 fill-current" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Priest Decision Support</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-church-black">Priest Reassignment Simulation</h1>
          <p className="text-church-grey text-sm">
            Model priest-to-parish reassignment impact using prior assignment analytics and current parish need
            indicators.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetScenario}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-church-grey/20 text-church-grey hover:bg-white transition-all text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={saveScenario}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-church-black text-white hover:bg-church-grey transition-all text-sm font-bold shadow-lg shadow-black/10"
          >
            <Save className="w-4 h-4" />
            Save Scenario
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gold-500/10 flex items-center justify-center">
                <User className="w-5 h-5 text-gold-600" />
              </div>
              <h3 className="text-lg font-bold text-church-black">Reassignment Setup</h3>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">Priest</label>
                <select
                  value={selectedPriestId}
                  onChange={(event) => setSelectedPriestId(event.target.value)}
                  className={`w-full px-4 py-4 bg-church-light border border-church-grey/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium ${selectedPriestId ? 'text-church-black' : 'text-church-grey'}`}
                >
                  <option value="" disabled>Select a priest here</option>
                  {priests.map((priest) => (
                    <option key={priest.id} value={priest.id}>
                      {priest.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-church-grey uppercase tracking-widest ml-1">
                  Receiving Parish
                </label>
                <select
                  value={params.targetParishId}
                  onChange={(event) => setParams({ ...params, targetParishId: event.target.value })}
                  className={`w-full px-4 py-4 bg-church-light border border-church-grey/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium ${params.targetParishId ? 'text-church-black' : 'text-church-grey'}`}
                >
                  <option value="" disabled>Select a receiving parish here</option>
                  {reassignmentParishes.map((parish) => (
                    <option key={parish.id} value={parish.id}>
                      {parish.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(selectedPriest || selectedParish) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedPriest && (
                  <div className="p-5 rounded-[24px] bg-gold-50 border border-gold-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gold-700">
                      Current Priest Profile
                    </span>
                    <p className="text-base font-black text-church-black">{selectedPriest.currentParish}</p>
                    <p className="text-xs text-gray-600 font-semibold">{selectedPriest.strength}</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pt-1">
                      {selectedPriest.previousAssignments} previous assignment
                      {selectedPriest.previousAssignments === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
                {selectedParish && (
                  <div className="p-5 rounded-[24px] bg-blue-50 border border-blue-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                      Target Parish Context
                    </span>
                    <p className="text-base font-black text-church-black">{selectedParish.vicariate}</p>
                    <p className="text-xs text-gray-600 font-semibold">
                      {selectedParish.parishClass} • Urgency {selectedParish.urgency}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={runSimulation}
              disabled={isSimulating}
              className="w-full py-4 bg-gold-500 text-church-black rounded-2xl font-bold hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSimulating ? (
                <>
                  <div className="w-5 h-5 border-2 border-church-black/30 border-t-church-black rounded-full animate-spin" />
                  Simulating Reassignment...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Run Reassignment Simulation
                </>
              )}
            </button>

            <div
              className={`rounded-2xl border px-4 py-3 ${
                assignmentEvidenceLevel === 'full'
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : assignmentEvidenceLevel === 'provisional'
                    ? 'bg-amber-50 border-amber-100 text-amber-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">
                {assignmentEvidenceLevel === 'full'
                  ? 'Full assignment evidence'
                  : assignmentEvidenceLevel === 'provisional'
                    ? 'Provisional evidence only'
                    : 'Insufficient reassignment history'}
              </p>
              <p className="mt-1 text-xs font-semibold">
                {assignmentEvidenceLevel === 'full'
                  ? 'This priest has served at least 2 prior parishes, so full fit ranking is enabled.'
                  : assignmentEvidenceLevel === 'provisional'
                    ? 'This priest has served only 1 prior parish. Results are provisional and confidence should be interpreted cautiously.'
                    : 'This priest has not yet served at least 2 prior parishes. Full parish ranking is withheld.'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-church-black">
                {hasFullRanking ? 'Best-Fit Parish Ranking' : 'Parish Ranking Availability'}
              </h3>
            </div>

            {hasFullRanking ? (
              <div className="space-y-3">
                {ranking.map((entry, index) => (
                  <div
                    key={entry.parish.id}
                    className={`p-4 rounded-2xl border ${index === 0 ? 'bg-gold-50 border-gold-100' : 'bg-church-light border-church-grey/5'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-church-black">{entry.parish.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          {entry.parish.vicariate} • {entry.parish.parishClass}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-church-black">{entry.score}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Match Score</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-church-grey/10 bg-church-light px-5 py-6">
                <p className="text-sm font-black text-church-black">
                  {assignmentEvidenceLevel === 'provisional'
                    ? 'Best-fit ranking is hidden because this priest has only 1 prior parish assignment.'
                    : 'Best-fit ranking is hidden because this priest has fewer than 2 prior parish assignments.'}
                </p>
                <p className="mt-2 text-xs font-semibold text-gray-500">
                  The reassignment simulator can still run, but ranking across multiple parishes is withheld until there
                  is enough assignment history.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-8">
          {(!selectedPriest || !selectedParish || !results) ? (
            <div className="bg-white rounded-[32px] p-12 shadow-sm border border-church-grey/10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
              <div className="w-16 h-16 rounded-full bg-gold-500/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-church-black">Select a priest and receiving parish to get started</h3>
              <p className="text-sm text-church-grey max-w-sm">
                Choose a priest and a target parish from the dropdowns on the left, then run the simulation to see the
                reassignment impact.
              </p>
            </div>
          ) : (
          <>
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-lg font-bold text-church-black leading-tight">Reassignment Impact Summary</h3>
                  <p className="mt-1 max-w-2xl text-xs text-gray-500 font-semibold leading-relaxed">
                    Decision support only. Scenario outputs are computed from historical assignment analytics and
                    current parish need indicators.
                  </p>
                </div>
              </div>
              <div
                className={`justify-self-start md:justify-self-end px-4 py-2 rounded-xl border font-bold text-sm flex items-center gap-2 ${results.riskBg} ${results.riskText}`}
              >
                <ShieldAlert className="w-4 h-4" />
                {results.riskBand} Transition Risk
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="min-h-[190px] p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col justify-between gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Priest-Parish Match
                </span>
                <p className="text-3xl font-black text-church-black">{results.fitScore}</p>
              </div>
              <div className="min-h-[190px] p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col justify-between gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Expected Gain For New Parish
                </span>
                <p className="text-3xl font-black text-emerald-600">+{results.targetLift}</p>
              </div>
              <div className="min-h-[190px] p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col justify-between gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Expected Loss For Old Parish
                </span>
                <p className="text-3xl font-black text-rose-600">-{results.vacatedParishDip}</p>
              </div>
              <div className="min-h-[190px] p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col justify-between gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Reliability Of This Scenario
                </span>
                <div className="space-y-1">
                  <p className="text-3xl font-black text-church-black">
                    {assignmentEvidenceLevel === 'insufficient' ? 'N/A' : `${results.confidence}%`}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {assignmentEvidenceLevel === 'full'
                      ? 'Validated'
                      : assignmentEvidenceLevel === 'provisional'
                        ? 'Provisional'
                        : 'Withheld'}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-[420px] w-full">
              <ReactECharts
                style={{ height: '420px', width: '100%' }}
                option={{
                  color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                  tooltip: { trigger: 'axis' },
                  legend: {
                    data: ['If Priest Stays', 'Old Parish After Transfer', 'New Parish After Transfer'],
                    textStyle: { fontSize: 11, fontWeight: 'bold' },
                  },
                  grid: { left: 50, right: 20, bottom: 30, top: 50 },
                  xAxis: {
                    type: 'category',
                    data: results.projectedData.map((d) => d.month),
                    axisLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF' },
                  },
                  yAxis: { type: 'value', axisLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF' } },
                  series: [
                    {
                      name: 'If Priest Stays',
                      type: 'line',
                      data: results.projectedData.map((d) => d.stayCase),
                      smooth: true,
                      lineStyle: { color: '#111111', width: 2, type: 'dashed' },
                      itemStyle: { color: '#111111' },
                      showSymbol: false,
                    },
                    {
                      name: 'Old Parish After Transfer',
                      type: 'line',
                      data: results.projectedData.map((d) => d.sourceParish),
                      smooth: true,
                      lineStyle: { color: '#EF4444', width: 3 },
                      itemStyle: { color: '#EF4444' },
                      symbolSize: 4,
                    },
                    {
                      name: 'New Parish After Transfer',
                      type: 'line',
                      data: results.projectedData.map((d) => d.targetParish),
                      smooth: true,
                      lineStyle: { color: '#D4AF37', width: 4 },
                      itemStyle: { color: '#D4AF37' },
                      symbolSize: 4,
                    },
                  ],
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-6 rounded-[24px] bg-gold-500/5 border border-gold-500/10">
                <div className="flex items-center gap-2 text-gold-600 mb-2">
                  <Zap className="w-4 h-4 fill-current" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    Analytics-Based Recommendation
                  </span>
                </div>
                <p className="text-sm text-church-black font-medium leading-relaxed">
                  {assignmentEvidenceLevel === 'insufficient'
                    ? 'This simulation is shown only as an early directional scenario. Full reassignment recommendation is withheld until the priest has served at least 2 prior parishes.'
                    : assignmentEvidenceLevel === 'provisional'
                      ? `Provisional only: ${results.recommendation.replace(' if diocesan handoff support is maintained.', '.').replace('but the move should be staged with a formal turnover plan and close reporting oversight in the first 6 months.', 'but the recommendation should be reviewed cautiously against limited assignment history.')}`
                      : results.recommendation}
                </p>
              </div>
              <div className="p-6 rounded-[24px] bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2 text-blue-700 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Analytics Logic</span>
                </div>
                <ul className="space-y-2 text-sm text-church-black font-medium">
                  <li>Priority review window: first 6 months after reassignment.</li>
                  <li>Compare the receiving parish gain against the vacated parish dip before endorsing transfer.</li>
                  <li>
                    Fit is computed from priest turnaround history, reporting discipline, stability improvement, and the
                    receiving parish's urgency and stability need.
                  </li>
                  <li>
                    {assignmentEvidenceLevel === 'full'
                      ? 'This recommendation is based on sufficient prior assignment history.'
                      : assignmentEvidenceLevel === 'provisional'
                        ? 'This recommendation is provisional because only 1 prior parish assignment is available.'
                        : 'This recommendation is directional only because prior assignment history is insufficient.'}
                  </li>
                  <li>
                    Expected diocesan net lift:{' '}
                    {results.dioceseLift > 0 ? `+${results.dioceseLift}` : results.dioceseLift} points.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-500/10 flex items-center justify-center">
                  <History className="w-5 h-5 text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-church-black">Saved Reassignment Scenarios</h3>
              </div>
              <span className="text-xs font-bold text-church-grey">
                {loadingScenarios ? 'Loading...' : `${savedScenarios.length} Saved`}
              </span>
            </div>

            {loadingScenarios ? (
              <div className="py-4">
                <InlineLoader label="Loading scenarios" />
              </div>
            ) : savedScenarios.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Scenario List */}
                <div className="lg:col-span-1 space-y-2">
                  {savedScenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => setSelectedScenarioDetail(scenario.fullScenario)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedScenarioDetail?.id === scenario.id
                          ? 'bg-gold-50 border-gold-500'
                          : 'bg-church-light border-church-grey/5 hover:border-gold-500/30'
                      }`}
                    >
                      <h4 className="text-sm font-bold text-church-black">{scenario.name}</h4>
                      <p className="text-[10px] text-church-grey font-medium mt-1">
                        {new Date(scenario.timestamp).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Scenario Detail Panel */}
                <div className="lg:col-span-2">
                  {selectedScenarioDetail ? (
                    <div className="space-y-5 p-5 rounded-2xl bg-church-light border border-church-grey/5">
                      {/* Header */}
                      <div className="border-b border-church-grey/10 pb-4">
                        <h4 className="text-lg font-bold text-church-black">{selectedScenarioDetail.name}</h4>
                        <p className="text-xs text-church-grey font-medium mt-2">
                          Saved: {new Date(selectedScenarioDetail.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-church-grey font-medium">
                          Priest: {selectedScenarioDetail.priestName}
                        </p>
                        <p className="text-xs text-church-grey font-medium">
                          Target: {selectedScenarioDetail.targetParishName}
                        </p>
                      </div>

                      {/* Parameters Section */}
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-widest text-church-grey mb-3">
                          Parameters Used
                        </h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Transition Support
                            </p>
                            <p className="text-base font-bold text-church-black capitalize">
                              {selectedScenarioDetail.transitionSupport}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Handoff Weeks
                            </p>
                            <p className="text-base font-bold text-church-black">{selectedScenarioDetail.handoffWeeks}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">Timeline</p>
                            <p className="text-base font-bold text-church-black">
                              {selectedScenarioDetail.timelineMonths} months
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Apply Button */}
                      <button
                        onClick={() => {
                          loadScenario(selectedScenarioDetail);
                          setSelectedScenarioDetail(null);
                        }}
                        className="w-full py-3 bg-gold-500 text-church-black rounded-xl font-bold hover:bg-gold-600 transition-all text-sm"
                      >
                        Apply Parameters Again
                      </button>

                      {/* Results Section */}
                      <div className="border-t border-church-grey/10 pt-4">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-church-grey mb-3">
                          Saved Results
                        </h5>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Fit Score
                            </p>
                            <p className="text-sm font-bold text-church-black">{selectedScenarioDetail.fitScore}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">Risk Band</p>
                            <p className="text-sm font-bold text-church-black">{selectedScenarioDetail.riskBand}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-church-grey">
                              Confidence
                            </p>
                            <p className="text-sm font-bold text-church-black">{selectedScenarioDetail.confidence}%</p>
                          </div>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          deleteScenario(selectedScenarioDetail.id);
                          setSelectedScenarioDetail(null);
                        }}
                        className="w-full py-2 bg-rose-50 text-rose-600 rounded-lg font-bold hover:bg-rose-100 transition-all text-xs"
                      >
                        Delete Scenario
                      </button>
                    </div>
                  ) : (
                    <div className="py-12 flex items-center justify-center h-full rounded-2xl bg-church-light border border-dashed border-church-grey/20">
                      <p className="text-sm text-church-grey font-medium">Select a scenario to view details</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-church-light flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-church-grey/30" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-church-black">No reassignment scenarios saved yet</p>
                  <p className="text-xs text-church-grey">
                    Run a transfer simulation and save it for the clergy review cycle.
                  </p>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* Scenario Name Modal */}
      {scenarioNameModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full space-y-6">
            <h3 className="text-xl font-bold text-church-black">Save Scenario</h3>
            <div>
              <label className="block text-sm font-bold text-church-black mb-2">Scenario Name</label>
              <input
                type="text"
                value={scenarioNameModal.name}
                onChange={(e) =>
                  setScenarioNameModal({ ...scenarioNameModal, name: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    scenarioNameModal.onConfirm(scenarioNameModal.name);
                  }
                  if (e.key === 'Escape') {
                    setScenarioNameModal({ open: false, name: '', onConfirm: () => {} });
                  }
                }}
                autoFocus
                placeholder="Enter scenario name"
                className="w-full px-4 py-2 border border-church-grey/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setScenarioNameModal({ open: false, name: '', onConfirm: () => {} })}
                className="px-4 py-2 rounded-xl border border-church-grey/20 text-church-grey font-bold hover:bg-church-light transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => scenarioNameModal.onConfirm(scenarioNameModal.name)}
                disabled={!scenarioNameModal.name.trim()}
                className="px-6 py-2 rounded-xl bg-gold-500 text-church-black font-bold hover:bg-gold-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WhatIfSimulator({ mode = 'parish' }: AITwinProps) {
  return mode === 'priest' ? <PriestAITwin /> : <ParishAITwin mode={mode} />;
}
