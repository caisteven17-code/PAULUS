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

type AITwinMode = 'parish' | 'priest' | 'seminary' | 'school';
type FinancialAITwinMode = Exclude<AITwinMode, 'priest'>;

interface AITwinProps {
  mode?: AITwinMode;
}

interface FinancialTwinProfile {
  id: number;
  name: string;
  cashBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  healthScore: number;
  collectionsHistory: number[];
  expensesHistory: number[];
}

const parishProfiles: FinancialTwinProfile[] = [
  {
    id: 1,
    name: "St. Matthew's Parish",
    cashBalance: 200000,
    monthlyIncome: 50000,
    monthlyExpenses: 60000,
    healthScore: 58,
    collectionsHistory: [44000, 45200, 46800, 47100, 48300, 49500],
    expensesHistory: [57000, 58100, 58900, 59600, 60200, 61100],
  },
  {
    id: 2,
    name: 'San Roque Parish',
    cashBalance: 80000,
    monthlyIncome: 35000,
    monthlyExpenses: 45000,
    healthScore: 41,
    collectionsHistory: [29000, 30100, 31400, 32900, 34700, 36100],
    expensesHistory: [46100, 45800, 45400, 45200, 44700, 44500],
  },
  {
    id: 3,
    name: 'Our Lady of Peace',
    cashBalance: 350000,
    monthlyIncome: 80000,
    monthlyExpenses: 70000,
    healthScore: 82,
    collectionsHistory: [74800, 76200, 77900, 79300, 80700, 82100],
    expensesHistory: [67600, 68400, 69100, 70200, 71100, 71900],
  },
  {
    id: 4,
    name: "St. Peter's Parish",
    cashBalance: 120000,
    monthlyIncome: 45000,
    monthlyExpenses: 48000,
    healthScore: 65,
    collectionsHistory: [39600, 40800, 42300, 43700, 45200, 46800],
    expensesHistory: [46200, 46900, 47400, 47800, 48200, 48600],
  },
];

const seminaryProfiles: FinancialTwinProfile[] = [
  {
    id: 1,
    name: "St. Peter's College Seminary",
    cashBalance: 980000,
    monthlyIncome: 520000,
    monthlyExpenses: 610000,
    healthScore: 74,
    collectionsHistory: [468000, 482000, 501000, 515000, 526000, 538000],
    expensesHistory: [588000, 596000, 604000, 611000, 618000, 624000],
  },
  {
    id: 2,
    name: 'Diocesan Memorial Seminary',
    cashBalance: 640000,
    monthlyIncome: 410000,
    monthlyExpenses: 455000,
    healthScore: 68,
    collectionsHistory: [384000, 392000, 401000, 407000, 414000, 423000],
    expensesHistory: [438000, 442000, 449000, 453000, 458000, 462000],
  },
];

const schoolProfiles: FinancialTwinProfile[] = [
  {
    id: 1,
    name: 'San Pablo Diocesan Catholic School',
    cashBalance: 1250000,
    monthlyIncome: 870000,
    monthlyExpenses: 805000,
    healthScore: 82,
    collectionsHistory: [812000, 828000, 842000, 856000, 874000, 892000],
    expensesHistory: [782000, 789000, 796000, 802000, 809000, 816000],
  },
  {
    id: 2,
    name: 'Sacred Heart School',
    cashBalance: 540000,
    monthlyIncome: 430000,
    monthlyExpenses: 468000,
    healthScore: 61,
    collectionsHistory: [398000, 405000, 414000, 421000, 427000, 435000],
    expensesHistory: [448000, 454000, 459000, 463000, 469000, 474000],
  },
  {
    id: 3,
    name: 'Holy Family School',
    cashBalance: 790000,
    monthlyIncome: 610000,
    monthlyExpenses: 585000,
    healthScore: 76,
    collectionsHistory: [572000, 584000, 596000, 604000, 616000, 628000],
    expensesHistory: [560000, 566000, 573000, 581000, 589000, 596000],
  },
];

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
    profiles: parishProfiles,
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
    profiles: seminaryProfiles,
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
    profiles: schoolProfiles,
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
  parishId: number;
  params: ParishSimulationParams;
  timestamp: number;
}

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

function calculateParishResults(params: ParishSimulationParams, parish: FinancialTwinProfile, entityLabel = 'parish') {
  const analytics = calculateParishAnalytics(parish);
  const baseMonthlyIncome = analytics.incomeAvg;
  const baseMonthlyExpenses = average(parish.expensesHistory);

  const simMonthlyIncome = baseMonthlyIncome * (1 + params.collectionsChange / 100);
  const simMonthlyExpenses = baseMonthlyExpenses * (1 + params.expensesChange / 100);
  const monthlyNet = simMonthlyIncome - simMonthlyExpenses;

  let currentCash = parish.cashBalance + params.oneTimeIncome - params.oneTimeExpense + params.externalSupport;
  let baselineCash = parish.cashBalance;
  const baselineMonthlyNet = baseMonthlyIncome - baseMonthlyExpenses;
  const projectedData = [{ month: 'Now', baseline: parish.cashBalance, simulated: currentCash }];

  for (let i = 1; i <= params.timeline; i += 1) {
    baselineCash += baselineMonthlyNet;
    currentCash += monthlyNet;
    projectedData.push({
      month: `Month ${i}`,
      baseline: Math.max(0, baselineCash),
      simulated: Math.max(0, currentCash),
    });
  }

  let runwayMonths = -1;
  if (monthlyNet < 0) {
    runwayMonths = Math.floor(currentCash / Math.abs(monthlyNet));
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
  const [liveProfiles, setLiveProfiles] = useState<FinancialTwinProfile[]>(config.profiles);
  const profiles = liveProfiles;
  const [selectedParishId, setSelectedParishId] = useState<number>(profiles[0]?.id ?? 1);

  // Fetch real institution financial profiles; fall back to hardcoded on failure
  useEffect(() => {
    const entityType = mode === 'seminary' ? 'seminary' : mode === 'school' ? 'school' : 'parish';
    apiClient
      .getFinancialProfiles(entityType as any)
      .then((data) => {
        if (data?.length) {
          const mapped: FinancialTwinProfile[] = data.map((p: any, i: number) => ({
            id: i + 1,
            name: p.name,
            cashBalance: p.currentBalance ?? 0,
            monthlyIncome: p.monthlyCollections ?? 0,
            monthlyExpenses: p.monthlyExpenses ?? 0,
            healthScore: p.healthScore ?? 50,
            collectionsHistory:
              p.collectionsHistory?.length === 6 ? p.collectionsHistory : Array(6).fill(p.monthlyCollections ?? 0),
            expensesHistory:
              p.expensesHistory?.length === 6 ? p.expensesHistory : Array(6).fill(p.monthlyExpenses ?? 0),
          }));
          setLiveProfiles(mapped);
          setSelectedParishId(1);
        }
      })
      .catch(() => {});
  }, [mode]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<ParishSavedScenario[]>(() => {
    const saved = localStorage.getItem(config.storageKey);
    return saved ? JSON.parse(saved) : [];
  });
  const [params, setParams] = useState<ParishSimulationParams>({
    collectionsChange: 0,
    expensesChange: 0,
    oneTimeIncome: 0,
    oneTimeExpense: 0,
    externalSupport: 0,
    timeline: 12,
  });

  const selectedParish = useMemo(
    () => profiles.find((parish) => parish.id === selectedParishId) || profiles[0],
    [profiles, selectedParishId],
  );
  const selectedParishAnalytics = useMemo(() => calculateParishAnalytics(selectedParish), [selectedParish]);

  const [simulationResults, setSimulationResults] = useState(() =>
    calculateParishResults(params, selectedParish, config.labelLower),
  );

  useEffect(() => {
    setSimulationResults(calculateParishResults(params, selectedParish, config.labelLower));
  }, [selectedParishId, mode]);

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setSimulationResults(calculateParishResults(params, selectedParish, config.labelLower));
      setIsSimulating(false);
    }, 800);
  };

  const handleSaveScenario = () => {
    const name = prompt('Enter a name for this scenario:');
    if (!name) return;

    const nextScenario: ParishSavedScenario = {
      id: Math.random().toString(36).slice(2, 9),
      name,
      parishId: selectedParishId,
      params: { ...params },
      timestamp: Date.now(),
    };

    const updated = [nextScenario, ...savedScenarios];
    setSavedScenarios(updated);
    localStorage.setItem(config.storageKey, JSON.stringify(updated));
  };

  const handleDeleteScenario = (id: string) => {
    const updated = savedScenarios.filter((scenario) => scenario.id !== id);
    setSavedScenarios(updated);
    localStorage.setItem(config.storageKey, JSON.stringify(updated));
  };

  const handleLoadScenario = (scenario: ParishSavedScenario) => {
    setSelectedParishId(scenario.parishId);
    setParams(scenario.params);
    const parish = profiles.find((item) => item.id === scenario.parishId) || profiles[0];
    setSimulationResults(calculateParishResults(scenario.params, parish, config.labelLower));
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
                onChange={(event) => setSelectedParishId(Number(event.target.value))}
                className="w-full pl-4 pr-10 py-4 bg-church-light border border-church-grey/10 rounded-2xl text-church-black focus:outline-none focus:ring-2 focus:ring-gold-500 appearance-none font-medium"
              >
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
                    ? 'âˆž'
                    : `${Math.floor(selectedParish.cashBalance / (selectedParish.monthlyExpenses - selectedParish.monthlyIncome))}m`}
                </span>
              </div>
            </div>
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
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-church-grey/10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-church-black">Analytics-Based Scenario Results</h3>
              </div>
              <div
                className={`px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm ${simulationResults.riskBg} ${simulationResults.riskColor}`}
              >
                <AlertTriangle className="w-4 h-4" />
                {simulationResults.riskLevel} Risk Level
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="min-w-0 p-5 rounded-[24px] bg-church-light border border-church-grey/5 flex flex-col gap-2.5">
                <span className="block text-[10px] font-bold text-church-grey uppercase tracking-widest leading-tight">
                  New Cash Runway
                </span>
                <span className="block max-w-full whitespace-nowrap text-[clamp(1.35rem,2.1vw,1.9rem)] leading-none font-bold text-church-black">
                  {simulationResults.runwayMonths === -1 ? 'âˆž' : `${simulationResults.runwayMonths}m`}
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
              <span className="text-xs font-bold text-church-grey">{savedScenarios.length} Saved</span>
            </div>

            {savedScenarios.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedScenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="p-5 rounded-2xl bg-church-light border border-church-grey/5 hover:border-gold-500/30 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-church-black group-hover:text-gold-600 transition-colors">
                          {scenario.name}
                        </h4>
                        <p className="text-[10px] text-church-grey font-medium">
                          {profiles.find((parish) => parish.id === scenario.parishId)?.name} -{' '}
                          {new Date(scenario.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteScenario(scenario.id)}
                        className="p-2 text-church-grey hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleLoadScenario(scenario)}
                      className="w-full py-2.5 bg-white border border-church-grey/10 rounded-xl text-xs font-bold text-church-black hover:bg-gold-500 hover:text-white hover:border-gold-500 transition-all flex items-center justify-center gap-2"
                    >
                      Load Scenario
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
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
        </div>
      </div>
    </div>
  );
}

function PriestAITwin() {
  const [selectedPriestId, setSelectedPriestId] = useState(priests[0].id);
  const [params, setParams] = useState<PriestSimulationParams>({
    targetParishId: reassignmentParishes[1].id,
    timeline: 12,
    transitionSupport: 'assisted',
    handoffWeeks: 6,
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<PriestSavedScenario[]>(() => {
    const saved = localStorage.getItem('priest_reassignment_scenarios');
    return saved ? JSON.parse(saved) : [];
  });

  const selectedPriest = useMemo(
    () => priests.find((priest) => priest.id === selectedPriestId) || priests[0],
    [selectedPriestId],
  );
  const selectedParish = useMemo(
    () => reassignmentParishes.find((parish) => parish.id === params.targetParishId) || reassignmentParishes[0],
    [params.targetParishId],
  );

  const [results, setResults] = useState(() => calculatePriestScenario(selectedPriest, selectedParish, params));
  const assignmentEvidenceLevel =
    selectedPriest.previousAssignments >= 2
      ? 'full'
      : selectedPriest.previousAssignments === 1
        ? 'provisional'
        : 'insufficient';
  const hasFullRanking = assignmentEvidenceLevel === 'full';

  useEffect(() => {
    setResults(calculatePriestScenario(selectedPriest, selectedParish, params));
  }, [selectedPriest, selectedParish]);

  const ranking = useMemo(() => {
    return reassignmentParishes
      .map((parish) => ({
        parish,
        score: calculatePriestScenario(selectedPriest, parish, params).fitScore,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  }, [selectedPriest, params]);

  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setResults(calculatePriestScenario(selectedPriest, selectedParish, params));
      setIsSimulating(false);
    }, 700);
  };

  const saveScenario = () => {
    const name = prompt('Enter a name for this reassignment scenario:');
    if (!name) return;

    const nextScenario: PriestSavedScenario = {
      id: Math.random().toString(36).slice(2, 9),
      name,
      priestId: selectedPriestId,
      params: { ...params },
      timestamp: Date.now(),
    };

    const updated = [nextScenario, ...savedScenarios];
    setSavedScenarios(updated);
    localStorage.setItem('priest_reassignment_scenarios', JSON.stringify(updated));
  };

  const deleteScenario = (id: string) => {
    const updated = savedScenarios.filter((scenario) => scenario.id !== id);
    setSavedScenarios(updated);
    localStorage.setItem('priest_reassignment_scenarios', JSON.stringify(updated));
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
    setSelectedPriestId(priests[0].id);
    setParams({
      targetParishId: reassignmentParishes[1].id,
      timeline: 12,
      transitionSupport: 'assisted',
      handoffWeeks: 6,
    });
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
                  className="w-full px-4 py-4 bg-church-light border border-church-grey/10 rounded-2xl text-church-black focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                >
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
                  className="w-full px-4 py-4 bg-church-light border border-church-grey/10 rounded-2xl text-church-black focus:outline-none focus:ring-2 focus:ring-gold-500 font-medium"
                >
                  {reassignmentParishes.map((parish) => (
                    <option key={parish.id} value={parish.id}>
                      {parish.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="p-5 rounded-[24px] bg-blue-50 border border-blue-100 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  Target Parish Context
                </span>
                <p className="text-base font-black text-church-black">{selectedParish.vicariate}</p>
                <p className="text-xs text-gray-600 font-semibold">
                  {selectedParish.parishClass} • Urgency {selectedParish.urgency}
                </p>
              </div>
            </div>

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
              <span className="text-xs font-bold text-church-grey">{savedScenarios.length} Saved</span>
            </div>

            {savedScenarios.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedScenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="p-5 rounded-2xl bg-church-light border border-church-grey/5 hover:border-gold-500/30 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-church-black group-hover:text-gold-600 transition-colors">
                          {scenario.name}
                        </h4>
                        <p className="text-[10px] text-church-grey font-medium">
                          {(priests.find((priest) => priest.id === scenario.priestId) || priests[0]).name} •{' '}
                          {new Date(scenario.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteScenario(scenario.id)}
                        className="p-2 text-church-grey hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => loadScenario(scenario)}
                      className="w-full py-2.5 bg-white border border-church-grey/10 rounded-xl text-xs font-bold text-church-black hover:bg-gold-500 hover:text-white hover:border-gold-500 transition-all flex items-center justify-center gap-2"
                    >
                      Load Scenario
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
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
        </div>
      </div>
    </div>
  );
}

export function WhatIfSimulator({ mode = 'parish' }: AITwinProps) {
  return mode === 'priest' ? <PriestAITwin /> : <ParishAITwin mode={mode} />;
}
