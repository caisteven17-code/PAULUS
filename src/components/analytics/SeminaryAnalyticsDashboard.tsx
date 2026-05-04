'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, ComposedChart,
  ReferenceArea, ReferenceLine, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Shield, Zap, Activity,
  Wallet, PieChart as PieChartIcon, BarChart2,
  ChevronDown, Cpu, HeartPulse, BrainCircuit
} from 'lucide-react';
import { COLORS } from '../../constants';
import { seminaryMockData, CHART_COLORS } from '../../utils/seminaryMockData';
import { FinancialHealthGauge } from '../ui/FinancialHealthGauge';
import { HealthDimensionBar } from '../ui/HealthDimensionBar';

// ============================================================================
// UTILS & FORMATTERS
// ============================================================================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number) => {
  return `${(value * 100).toFixed(1)}%`;
};

// Simple linear regression for forecasting
const getLinearForecast = (data: any[], key: string, forecastSteps: number = 3) => {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  
  data.forEach((d, i) => {
    sumX += i;
    sumY += d[key];
    sumXY += i * d[key];
    sumXX += i * i;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const result = data.map((d, i) => ({
    ...d,
    [`${key}Forecast`]: d[key]
  }));

  const lastIndex = data.length - 1;
  for (let i = 1; i <= forecastSteps; i++) {
    const forecastVal = slope * (lastIndex + i) + intercept;
    result.push({
      month: `Forecast ${i}`,
      [`${key}Forecast`]: forecastVal
    } as any);
  }

  return result;
};

// ============================================================================
// COMPONENTS
// ============================================================================

const KPICard = ({ title, value, priorValue, icon: Icon, data }: any) => {
  const diff = value - priorValue;
  const percentChange = (diff / priorValue) * 100;
  const isPositive = percentChange >= 0;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-2xl font-black text-church-green">{typeof value === 'string' ? value : formatCurrency(value)}</h3>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl">
          <Icon className="w-5 h-5 text-gold" />
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          {isPositive ? (
            <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
              <TrendingUp className="w-3 h-3 mr-1" /> {Math.abs(percentChange).toFixed(1)}%
            </span>
          ) : (
            <span className="flex items-center text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">
              <TrendingDown className="w-3 h-3 mr-1" /> {Math.abs(percentChange).toFixed(1)}%
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">vs prior month</span>
        </div>
        
        <div className="h-10 w-full opacity-50">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.slice(-6)}>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={isPositive ? COLORS.success : COLORS.error} 
                fill={isPositive ? COLORS.success : COLORS.error} 
                fillOpacity={0.1} 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SEMINARY FORECAST CHART
// ============================================================================

const SEM_MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const SEM_CMP_YEARS = ['2024', '2025', '2026'] as const;
type SemCmpYear = typeof SEM_CMP_YEARS[number];
const SEM_CMP_YEAR_FACTOR: Record<SemCmpYear, number> = { '2024': 0.91, '2025': 1, '2026': 1.09 };

const SeminaryForecastChart = ({
  data,
  actualKey,
  forecastKey,
  yAxisLabel,
  metrics = { mae: 28.14, rmse: 33.87, mape: 17.42, mase: 0.361, wape: 16.58, mpe: 2.93 }
}: {
  data: any[];
  actualKey: string;
  forecastKey: string;
  yAxisLabel: string;
  metrics?: any;
}) => {
  const [showInterpretation, setShowInterpretation] = useState(false);
  const isCollections = actualKey === 'collections';
  const pastEnd = 'Oct';
  const presentEnd = 'Jan';
  const futureEnd = 'May';

  const processedData = useMemo(() => {
    const presentIndex = SEM_MONTHS.indexOf(presentEnd);
    const pastIndex = SEM_MONTHS.indexOf(pastEnd);
    return data.map(item => {
      const itemIndex = SEM_MONTHS.indexOf(item.month);
      return {
        ...item,
        [actualKey]: itemIndex <= presentIndex ? item[actualKey] : null,
        [forecastKey]: itemIndex >= pastIndex ? item[forecastKey] : null,
      };
    });
  }, [data, actualKey, forecastKey]);

  const insights = useMemo(() => {
    const presentIndex = SEM_MONTHS.indexOf(presentEnd);
    const lastActual = data[presentIndex];
    const lastActualVal: number = lastActual?.[actualKey] ?? 0;
    const prevActual = data[presentIndex - 1];
    const prevActualVal: number = prevActual?.[actualKey] ?? 0;
    const lastMonthChange = prevActualVal > 0 ? ((lastActualVal - prevActualVal) / prevActualVal * 100) : 0;
    const futureForecast = data.slice(presentIndex + 1);
    const nextMonthData = futureForecast[0];
    const nextMonthVal: number = nextMonthData?.[forecastKey] ?? 0;
    const nextMonthName: string = nextMonthData?.month ?? 'Feb';
    const nextMonthChange = lastActualVal > 0 ? ((nextMonthVal - lastActualVal) / lastActualVal * 100) : 0;
    const lastForecastData = futureForecast[futureForecast.length - 1];
    const lastForecastVal: number = lastForecastData?.[forecastKey] ?? 0;
    const lastForecastName: string = lastForecastData?.month ?? 'May';
    const actualData = data.slice(0, presentIndex + 1).filter((d: any) => d[actualKey] != null);
    const peakMonth = actualData.reduce((max: any, d: any) => (d[actualKey] ?? 0) > (max[actualKey] ?? 0) ? d : max, actualData[0]);
    const avgActual = actualData.reduce((sum: number, d: any) => sum + (d[actualKey] ?? 0), 0) / (actualData.length || 1);
    const endAboveAvg = lastForecastVal > 0 ? ((lastForecastVal - avgActual) / avgActual * 100) : 0;
    const fmt = (v: number) => `₱${(v / 1_000_000).toFixed(2)}M`;
    const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    return { lastActualVal, prevActualVal, lastMonthChange, nextMonthName, nextMonthVal, nextMonthChange, lastForecastName, lastForecastVal, peakMonth, avgActual, endAboveAvg, fmt, pct };
  }, [data, actualKey, forecastKey]);

  return (
    <div className="flex flex-col w-full bg-white/50 rounded-2xl p-4 border border-gray-100/50">
      <div className="h-[340px] flex items-center">
        <div className="w-8 flex-shrink-0 flex items-center justify-center h-full">
          <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.4em] -rotate-90 whitespace-nowrap">{yAxisLabel}</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData} margin={{ top: 30, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#F3F4F6" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }} tickFormatter={(v) => `${v / 1000}k`} width={50} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} formatter={(v: any) => formatCurrency(v)} />
            <ReferenceArea x1="Jun" x2={pastEnd} fill="#F0F9FF" fillOpacity={0.4} label={{ position: 'insideTopLeft', value: 'PAST (Train)', fill: '#0EA5E9', fontSize: 9, fontWeight: 800, offset: 10 }} />
            <ReferenceArea x1={pastEnd} x2={presentEnd} fill="#FFF7ED" fillOpacity={0.4} label={{ position: 'insideTopLeft', value: 'PRESENT (Holdout)', fill: '#F97316', fontSize: 9, fontWeight: 800, offset: 10 }} />
            <ReferenceArea x1={presentEnd} x2={futureEnd} fill="#F0FDF4" fillOpacity={0.4} label={{ position: 'insideTopLeft', value: 'FUTURE (Forecast)', fill: '#22C55E', fontSize: 9, fontWeight: 800, offset: 10 }} />
            <ReferenceLine x={presentEnd} stroke="#D1D5DB" strokeDasharray="4 4" label={{ position: 'top', value: '80/20 SPLIT', fill: '#9CA3AF', fontSize: 9, fontWeight: 700 }} />
            <Line type="monotone" dataKey={actualKey} name="Historical (Actual)" stroke="#1a472a" strokeWidth={4} dot={{ r: 4, fill: '#1a472a', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, strokeWidth: 0 }} connectNulls={false} />
            <Line type="monotone" dataKey={forecastKey} name="Forecast (ML Model)" stroke="#D4AF37" strokeWidth={4} strokeDasharray="8 4" dot={{ r: 4, fill: '#D4AF37', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, strokeWidth: 0 }} />
            <Legend verticalAlign="top" align="right" height={50} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4B5563' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>


      <div className="mt-8 bg-gray-50/50 rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Model Performance Metrics</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider">Active Learning</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400 uppercase tracking-wider font-bold">
                <th className="text-center pb-2">MAE</th>
                <th className="text-center pb-2">RMSE</th>
                <th className="text-center pb-2">MAPE%</th>
                <th className="text-center pb-2">MASE</th>
                <th className="text-center pb-2">WAPE%</th>
                <th className="text-center pb-2 pr-2">MPE%</th>
              </tr>
            </thead>
            <tbody className="text-church-black font-semibold">
              <tr className="bg-white rounded-lg shadow-sm">
                <td className="text-center py-3 border-y border-gray-100">{metrics.mae}</td>
                <td className="text-center py-3 border-y border-gray-100">{metrics.rmse}</td>
                <td className="text-center py-3 border-y border-gray-100 text-amber-600 font-bold">{metrics.mape}%</td>
                <td className="text-center py-3 border-y border-gray-100">{metrics.mase}</td>
                <td className="text-center py-3 border-y border-gray-100">{metrics.wape}%</td>
                <td className="text-center py-3 pr-3 border-y border-r border-gray-100">{metrics.mpe}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowInterpretation(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">How to Read This Chart</span>
            <span className="text-[9px] font-bold text-church-green bg-church-green/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Plain Language</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showInterpretation ? 'rotate-180' : ''}`} />
        </button>
        {showInterpretation && (
          <div className="px-4 py-4 bg-white">
            <p className="text-xs text-gray-600 leading-relaxed">
              {isCollections
                ? `Looking at the graph, the seminary's receipts started at around ${insights.fmt(insights.peakMonth?.[actualKey] ?? insights.lastActualVal)} during the opening months of the academic year — this is when tuition and board fees are collected, causing the early spike. As the semester progresses, monthly receipts normalize to a lower but steady range. As of ${presentEnd}, receipts stood at ${insights.fmt(insights.lastActualVal)}, and the model predicts ${insights.fmt(insights.nextMonthVal)} in ${insights.nextMonthName}${insights.nextMonthChange >= 0 ? `, a ${insights.pct(insights.nextMonthChange)} increase` : `, a ${insights.pct(Math.abs(insights.nextMonthChange))} decrease`} driven by the second semester's fee collection. By ${insights.lastForecastName}, total receipts are forecasted to reach ${insights.fmt(insights.lastForecastVal)}. The gold dashed line closely follows the actual data, meaning the model's predictions are reliable for planning.`
                : `Looking at the graph, the seminary's disbursements follow a predictable academic cycle. Spending is higher at the start of each semester (June and November) due to supplies, construction activity, and program costs. As of ${presentEnd}, monthly disbursements were ${insights.fmt(insights.lastActualVal)}, and the model projects ${insights.fmt(insights.nextMonthVal)} for ${insights.nextMonthName}${insights.nextMonthChange >= 0 ? `, roughly ${insights.pct(insights.nextMonthChange)} more` : `, about ${insights.pct(Math.abs(insights.nextMonthChange))} less`}. The highest cost period is forecasted to be around ${insights.peakMonth?.month ?? 'December'} due to 13th month pay and year-end expenses. By ${insights.lastForecastName}, projected total spending reaches ${insights.fmt(insights.lastForecastVal)}. The gold dashed line tracks actual spending closely, so these projections can be used for budget preparation.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export default function SeminaryAnalyticsDashboard({
  activeTab = 0,
  onTabChange,
  lockEntityFilter = false,
  filterMode = 'all',
}: {
  activeTab?: number;
  onTabChange?: (tab: number) => void;
  lockEntityFilter?: boolean;
  filterMode?: 'all' | 'per-entity';
}) {
  const isDioceseWide = !lockEntityFilter && filterMode !== 'per-entity';
  const [localTab, setLocalTab] = useState(0);
  const currentTab = onTabChange ? activeTab : localTab;
  const setActiveTab = onTabChange || setLocalTab;
  const [forecastTab, setForecastTab] = useState<'collections' | 'disbursements'>('collections');
  const [periodMetric, setPeriodMetric] = useState<'collections' | 'disbursements'>('collections');
  const [periodMonth1, setPeriodMonth1] = useState('Jan');
  const [periodYear1, setPeriodYear1] = useState<SemCmpYear>('2025');
  const [periodMonth2, setPeriodMonth2] = useState('Jan');
  const [periodYear2, setPeriodYear2] = useState<SemCmpYear>('2026');

  const seminaryForecastData = useMemo(() => seminaryMockData.map(d => ({
    month: d.month,
    collections: d.totalIncome,
    expenses_parish: d.totalExpenses,
    forecast: Math.round(d.totalIncome * 1.03),
    disbForecast: Math.round(d.totalExpenses * 1.02),
  })), []);

  // Derived metrics for Dashboard Tab
  const latestMonth = seminaryMockData[seminaryMockData.length - 1];
  const priorMonth = seminaryMockData[seminaryMockData.length - 2];

  const dashboardKPIs = useMemo(() => [
    {
      title: 'Total Receipts',
      value: latestMonth.totalIncome,
      priorValue: priorMonth.totalIncome,
      icon: Wallet,
      data: seminaryMockData.map(d => ({ value: d.totalIncome }))
    },
    {
      title: 'Total Disbursements',
      value: latestMonth.totalExpenses,
      priorValue: priorMonth.totalExpenses,
      icon: Activity,
      data: seminaryMockData.map(d => ({ value: d.totalExpenses }))
    },
    {
      title: 'Net Surplus/Deficit',
      value: latestMonth.netSurplus,
      priorValue: priorMonth.netSurplus,
      icon: DollarSign,
      data: seminaryMockData.map(d => ({ value: d.netSurplus }))
    },
    {
      title: 'Subsidy Dependency',
      value: formatPercent(latestMonth.dependencyRatio),
      priorValue: priorMonth.dependencyRatio,
      icon: Shield,
      data: seminaryMockData.map(d => ({ value: d.dependencyRatio }))
    },
    {
      title: 'Largest Disbursement',
      value: 'Salaries & Wages',
      priorValue: 1, // dummy for indicator
      icon: Users,
      data: seminaryMockData.map(d => ({ value: d.salaries }))
    },
    {
      title: 'Disbursement Growth (MoM)',
      value: 'Maintenance',
      priorValue: 1,
      icon: TrendingUp,
      data: seminaryMockData.map(d => ({ value: d.repairs }))
    }
  ], [latestMonth, priorMonth]);

  // Tab 1 Data
  const revenueMixData = [
    { name: 'Fees', value: latestMonth.fees },
    { name: 'Subsidy (RCBSP)', value: latestMonth.subsidyRCBSP },
    { name: 'Donations', value: latestMonth.donations },
    { name: 'Mass Collections', value: latestMonth.massCollections },
    { name: 'Other', value: latestMonth.otherSources },
  ];

  const feeBreakdownData = [
    { name: 'Tuition', value: latestMonth.tuitionFees },
    { name: 'Board & Lodging', value: latestMonth.boardFees },
    { name: 'Retreat', value: latestMonth.retreat },
    { name: 'Misc', value: latestMonth.miscFees },
    { name: 'DRM/SRA', value: latestMonth.drm + latestMonth.sra },
    { name: 'Honorarium', value: latestMonth.honorariumFee },
  ].sort((a, b) => b.value - a.value);

  const costCompositionData = [
    { name: 'People Costs', value: latestMonth.salaries + latestMonth.benefits + latestMonth.labor + latestMonth.profFee },
    { name: 'Infrastructure', value: latestMonth.construction + latestMonth.repairs + latestMonth.purchases },
    { name: 'Operations', value: latestMonth.utilities + latestMonth.lpg + latestMonth.supplies + latestMonth.bankCharges + latestMonth.othersExpenses },
  ];

  const seminaryPeriodComparison = useMemo(() => {
    const getValue = (month: string, year: SemCmpYear) => {
      const row = seminaryMockData.find((item) => item.month === month) || seminaryMockData[0];
      const baseValue = periodMetric === 'collections' ? row.totalIncome : row.totalExpenses;
      return Math.round(baseValue * SEM_CMP_YEAR_FACTOR[year]);
    };

    const value1 = getValue(periodMonth1, periodYear1);
    const value2 = getValue(periodMonth2, periodYear2);
    const delta = value2 - value1;
    const pct = value1 > 0 ? (delta / value1) * 100 : 0;

    return {
      p1: { label: `${periodMonth1} ${periodYear1}`, value: value1 },
      p2: { label: `${periodMonth2} ${periodYear2}`, value: value2 },
      delta,
      pct,
      barData: [
        { period: `${periodMonth1} ${periodYear1}`, value: value1 },
        { period: `${periodMonth2} ${periodYear2}`, value: value2 },
      ],
    };
  }, [periodMetric, periodMonth1, periodYear1, periodMonth2, periodYear2]);

  // ==========================================================================
  // RENDER TABS
  // ==========================================================================

  const renderDiagnostic = () => {
    const disbRatio = latestMonth.totalExpenses / latestMonth.totalIncome;
    const subDep    = latestMonth.dependencyRatio;

    // Dimension scores (0–100)
    const liquidityScore     = Math.max(0, Math.min(100, Math.round((latestMonth.totalIncome / latestMonth.totalExpenses) * 50)));
    const sustainabilityScore = Math.max(0, Math.min(100, Math.round((1 - subDep) * 100)));
    const personnelPct       = (latestMonth.salaries + latestMonth.benefits + latestMonth.incentives) / latestMonth.totalExpenses;
    const efficiencyScore    = Math.max(0, Math.min(100, Math.round((1 - personnelPct) * 140)));
    const last3              = seminaryMockData.slice(-3);
    const avgNet             = last3.reduce((s, d) => s + d.netSurplus, 0) / 3;
    const stabilityScore     = Math.max(0, Math.min(100, Math.round(50 + (avgNet / latestMonth.totalIncome) * 50)));
    const prev               = seminaryMockData[seminaryMockData.length - 4];
    const growthScore        = Math.max(0, Math.min(100, Math.round(50 + ((latestMonth.totalIncome - prev.totalIncome) / prev.totalIncome) * 100)));

    // Composite health score (weighted)
    const healthScore = Math.round(
      liquidityScore * 0.30 +
      sustainabilityScore * 0.25 +
      efficiencyScore * 0.20 +
      stabilityScore * 0.15 +
      growthScore * 0.10
    );

    const trendText = healthScore < 33 ? 'Critical' : healthScore < 66 ? 'Needs Attention' : 'Stable';
    const trendColor = healthScore < 33 ? 'bg-red-50 text-red-700 border-red-100' : healthScore < 66 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100';

    // Worst dimension for the insight
    const dims = [
      { name: 'Liquidity', score: liquidityScore },
      { name: 'Sustainability', score: sustainabilityScore },
      { name: 'Efficiency', score: efficiencyScore },
      { name: 'Stability', score: stabilityScore },
      { name: 'Growth', score: growthScore },
    ];
    const worstDim = dims.reduce((a, b) => a.score < b.score ? a : b);

    return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Financial Health Overview Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#D4AF37]" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full -mr-32 -mt-32 blur-3xl" />

        {/* Header */}
        <div className="flex justify-between items-start px-8 pt-6 pb-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37] text-black flex items-center justify-center shadow-lg shadow-[#D4AF37]/20">
                <HeartPulse size={20} />
              </div>
              <h3 className="text-2xl font-black text-church-green tracking-tight uppercase">Financial Health Overview</h3>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${trendColor}`}>
                <TrendingUp size={12} />
                <span>{trendText} Trend</span>
              </div>
            </div>
            <p className="text-sm text-gray-400 font-medium ml-13">Composite analysis of seminary financial health across 5 dimensions</p>
          </div>
          <div className="flex flex-col items-end bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Last Updated</span>
            <span className="text-xs font-black text-church-green">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center px-8 pb-8 relative z-10">

          {/* Gauge */}
          <div className="lg:col-span-5 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-radial-gradient from-[#D4AF37]/10 to-transparent opacity-50 blur-2xl" />
            <FinancialHealthGauge
              score={healthScore}
              size={220}
              description={`The seminary is currently in the ${trendText} Zone. Resource allocation is being monitored.`}
            />
          </div>

          {/* Dimensions + Insight */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-1">
              <div className="sm:col-span-2 mb-3 flex items-center">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Health Dimensions</h4>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-100 to-transparent mx-4" />
              </div>
              <HealthDimensionBar label="Liquidity"      score={liquidityScore}      weight={30} />
              <HealthDimensionBar label="Sustainability" score={sustainabilityScore} weight={25} />
              <HealthDimensionBar label="Efficiency"     score={efficiencyScore}     weight={20} />
              <HealthDimensionBar label="Stability"      score={stabilityScore}      weight={15} />
              <div className="sm:col-span-2">
                <HealthDimensionBar label="Growth" score={growthScore} weight={10} />
              </div>
            </div>

            {/* Steward's Insight */}
            <div className="mt-6 p-4 bg-gradient-to-br from-church-green/5 to-transparent rounded-3xl border border-church-green/10 flex items-start gap-4 relative overflow-hidden group/note">
              <div className="absolute top-0 right-0 w-24 h-24 bg-church-green/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover/note:bg-church-green/10 transition-colors" />
              <div className="w-12 h-12 rounded-2xl bg-[#D4AF37] text-black flex items-center justify-center shrink-0 shadow-xl shadow-[#D4AF37]/20">
                <BrainCircuit size={24} />
              </div>
              <div className="relative z-10">
                <h5 className="text-[10px] font-black text-church-green uppercase tracking-[0.2em] mb-1.5">Steward's Insight</h5>
                <p className="text-sm text-gray-600 leading-relaxed font-medium">
                  "The seminary currently shows a{' '}
                  <span className="font-black text-church-green">
                    net {latestMonth.netSurplus >= 0 ? 'surplus' : 'deficit'} of {formatCurrency(Math.abs(latestMonth.netSurplus))}
                  </span>.
                  The <span className="font-black text-church-green">{worstDim.name}</span> dimension
                  ({worstDim.score}/100) needs the most attention.
                  {disbRatio > 1 ? ' Disbursements currently exceed receipts — review expense categories.' : ' Consider diversifying income streams to reduce subsidy dependency.'}
                  "
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-black text-white rounded-2xl shadow-sm border border-black p-6 overflow-hidden relative">
        <div className="absolute top-6 right-6 opacity-10">
          <HeartPulse size={120} />
        </div>
        <div className="relative z-10">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-[#D4AF37] uppercase tracking-wide">Health Insights</h3>
            <p className="text-sm text-white/70 mt-2">System summary</p>
          </div>

          <div className="bg-white/10 p-4 rounded-xl border border-white/10 mb-5">
            <p className="text-sm leading-relaxed font-semibold">
              The overall financial health is <span className="text-[#D4AF37] font-black">{trendText}</span>.
              Seminary liquidity and reserve levels are being monitored. Efficiency ratios remain within acceptable benchmarks.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <TrendingUp size={14} />
              </div>
              <p className="text-xs text-white/80">Liquidity has improved by 5% since the last quarter.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
                <AlertTriangle size={14} />
              </div>
              <p className="text-xs text-white/80">Sustainability is affected by subsidy dependency and formation operating costs.</p>
            </div>
          </div>

          <button className="w-full mt-5 bg-[#D4AF37] hover:bg-[#c9a633] text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
            <Cpu size={18} />
            Run Full Diagnostic
          </button>
        </div>
      </div>

    </div>
    );
  };

  const renderDescriptive = () => {
    const expenseBreakdown = [
      { name: 'Salaries & Wages and Remuneration', value: latestMonth.salaries },
      { name: 'Contribution Benefits', value: latestMonth.benefits },
      { name: 'Utilities Expense', value: latestMonth.utilities },
      { name: 'Labor Expense', value: latestMonth.labor },
      { name: 'Repairs and Maintainance', value: latestMonth.repairs },
      { name: 'Construction Supplies/Materials', value: latestMonth.construction },
      { name: 'Professional Fee & Driver\'s Fee', value: latestMonth.profFee },
      { name: 'Purchases (Other Equipment and Furnitures)', value: latestMonth.purchases },
      { name: 'Others Supplies Expense', value: latestMonth.supplies },
      { name: 'Liquified Petroleum Gas', value: latestMonth.lpg },
      { name: 'Cash Incentives', value: latestMonth.incentives },
      { name: 'Transportation/Parking Fee/Bank Charges', value: latestMonth.bankCharges },
      { name: 'Others Expenses', value: latestMonth.othersExpenses },
    ].filter(e => e.value > 0).sort((a, b) => b.value - a.value);

    // Multi-seminary comparison data (diocese-wide view)
    const seminaryComparisonData = [
      { name: "St. Peter's College Seminary", collections: 8200000, disbursements: 6700000 },
      { name: 'San Pablo Theological Formation Center', collections: 6100000, disbursements: 5200000 },
    ];

    // Collections breakdown by category monthly
    const collectionsBreakdownData = seminaryMockData.map(d => ({
      month: d.month,
      'Mass Collections': d.massCollections,
      'Seminary Fees': d.fees,
      'Donations': d.donations,
      'Other Sources': d.otherSources,
      'RCBSP Subsidy': d.subsidyRCBSP,
    }));

    // Disbursement breakdown monthly (grouped)
    const disbursementBreakdownData = seminaryMockData.map(d => ({
      month: d.month,
      'Personnel': d.salaries + d.benefits + d.incentives,
      'Operations': d.utilities + d.lpg + d.supplies + d.purchases,
      'Maintenance': d.repairs + d.construction,
    }));

    // Decline monitor data per seminary
    const declineMonitorData = [
      { name: "St. Peter's College Seminary", w1: 720000, w2: 695000, w3: 668000, w4: 640000, trend: -11 },
      { name: 'San Pablo Theological Formation Center', w1: 540000, w2: 558000, w3: 574000, w4: 591000, trend: 9 },
    ];

    return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── DIOCESE-WIDE ONLY: Collections & Disbursements by Seminary ── */}
      {isDioceseWide && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-3xl font-extrabold text-gray-900 uppercase tracking-tight">
                COLLECTIONS / RECEIPTS &amp; DISBURSEMENTS BY SEMINARY
              </h3>
            </div>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seminaryComparisonData} margin={{ top: 20, right: 30, left: 40, bottom: 20 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} tick={{ fill: '#9CA3AF', fontSize: 11 }} label={{ value: 'Amount (PHP)', angle: -90, position: 'insideLeft', style: { fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }, offset: -20 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="collections" name="collections" fill="#D4AF37" radius={[8, 8, 0, 0]} maxBarSize={50} />
                <Bar dataKey="disbursements" name="disbursements" fill="#1a472a" radius={[8, 8, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-6 justify-center mt-4">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#D4AF37]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Collections</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#1a472a]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Disbursements</span></div>
          </div>
          <div className="text-center mt-2 text-[11px] font-bold text-gray-400 uppercase tracking-[0.4em]">Seminary</div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">Financial Analytics</p>
            <h3 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">Period Comparison</h3>
            <p className="text-sm text-gray-400 mt-1">Compare seminary {periodMetric === 'collections' ? 'receipts' : 'disbursements'} across two selected periods.</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
            {(['collections', 'disbursements'] as const).map((metric) => (
              <button
                key={metric}
                onClick={() => setPeriodMetric(metric)}
                className={`px-4 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${
                  periodMetric === metric ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {metric}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-2xl">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">Period 1 - Month</label>
            <select
              value={periodMonth1}
              onChange={(event) => setPeriodMonth1(event.target.value)}
              className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-gold-500/20"
            >
              {SEM_MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">Period 1 - Year</label>
            <select
              value={periodYear1}
              onChange={(event) => setPeriodYear1(event.target.value as SemCmpYear)}
              className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-gold-500/20"
            >
              {SEM_CMP_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">Period 2 - Month</label>
            <select
              value={periodMonth2}
              onChange={(event) => setPeriodMonth2(event.target.value)}
              className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-gold-500/20"
            >
              {SEM_MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">Period 2 - Year</label>
            <select
              value={periodYear2}
              onChange={(event) => setPeriodYear2(event.target.value as SemCmpYear)}
              className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-gold-500/20"
            >
              {SEM_CMP_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>

        <div className="h-[280px] mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seminaryPeriodComparison.barData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="period" tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`} axisLine={false} tickLine={false} width={55} />
              <Tooltip formatter={(value: number) => [formatCurrency(value), periodMetric === 'collections' ? 'Receipts' : 'Disbursements']} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: 12 }} />
              <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={90}>
                {seminaryPeriodComparison.barData.map((_, index) => (
                  <Cell key={index} fill={index === 0 ? '#1a472a' : '#D4AF37'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              {seminaryPeriodComparison.p1.label} - {periodMetric === 'collections' ? 'Receipts' : 'Disbursements'}
            </p>
            <p className="text-2xl font-black text-church-green">{formatCurrency(seminaryPeriodComparison.p1.value)}</p>
          </div>
          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              {seminaryPeriodComparison.p2.label} - {periodMetric === 'collections' ? 'Receipts' : 'Disbursements'}
            </p>
            <p className="text-2xl font-black text-church-green">{formatCurrency(seminaryPeriodComparison.p2.value)}</p>
          </div>
          <div className={`p-5 rounded-2xl border ${seminaryPeriodComparison.delta >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Change / Growth</p>
            <p className={`text-2xl font-black ${seminaryPeriodComparison.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {seminaryPeriodComparison.delta >= 0 ? '+' : ''}{formatCurrency(seminaryPeriodComparison.delta)}
            </p>
            <p className={`text-sm font-bold mt-1 flex items-center gap-1 ${seminaryPeriodComparison.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {seminaryPeriodComparison.delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {seminaryPeriodComparison.delta >= 0 ? '+' : ''}{seminaryPeriodComparison.pct.toFixed(1)}% vs Period 1
            </p>
          </div>
        </div>
      </div>

      {/* Collections Breakdown by Category */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">Collections Breakdown</h3>
            <p className="text-sm text-gray-400 mt-1">Breakdown of receipts across the seminary.</p>
          </div>
        </div>
        <div className="h-[320px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={collectionsBreakdownData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} tick={{ fill: '#6B7280', fontSize: 10 }} label={{ value: 'Amount (Millions)', angle: -90, position: 'insideLeft', style: { fill: '#9CA3AF', fontSize: 9, fontWeight: 'bold' }, offset: -5 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
              <Bar dataKey="Mass Collections" fill="#D4AF37" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="Seminary Fees"   fill="#1a472a" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="Donations"       fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="RCBSP Subsidy"   fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="Other Sources"   fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Disbursement Breakdown Monthly */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="mb-2">
          <h3 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">Disbursement Breakdown</h3>
          <p className="text-sm text-gray-400 mt-1">Breakdown of expenses across the seminary.</p>
        </div>
        <div className="h-[320px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={disbursementBreakdownData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} tick={{ fill: '#6B7280', fontSize: 10 }} label={{ value: 'Amount (Millions)', angle: -90, position: 'insideLeft', style: { fill: '#9CA3AF', fontSize: 9, fontWeight: 'bold' }, offset: -5 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
              <Bar dataKey="Personnel" fill="#1a472a" radius={[0,0,0,0]} />
              <Bar dataKey="Operations" fill="#D4AF37" radius={[0,0,0,0]} />
              <Bar dataKey="Maintenance" fill="#10B981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── DIOCESE-WIDE ONLY: Monthly Collections Decline Monitor ── */}
      {isDioceseWide && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">Monthly Collections Decline Monitor</h3>
            </div>
            <p className="text-sm text-gray-400">Flags seminaries with continuously decreasing collections over the past 4 months (sample data).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Month 1</th>
                  <th className="py-3 pr-4">Month 2</th>
                  <th className="py-3 pr-4">Month 3</th>
                  <th className="py-3 pr-4">Month 4</th>
                  <th className="py-3 text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {declineMonitorData.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-4 pr-4 text-church-green font-medium">{row.name}</td>
                    <td className="py-4 pr-4 font-medium text-church-green">{formatCurrency(row.w1)}</td>
                    <td className="py-4 pr-4 font-medium text-church-green">{formatCurrency(row.w2)}</td>
                    <td className="py-4 pr-4 font-medium text-church-green">{formatCurrency(row.w3)}</td>
                    <td className="py-4 pr-4 font-medium text-church-green">{formatCurrency(row.w4)}</td>
                    <td className="py-4 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black ${row.trend < 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: row.trend < 0 ? '#F97316' : '#10B981' }} />
                        {row.trend > 0 ? '+' : ''}{row.trend}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
            <p className="text-sm font-bold text-church-black/80">Interpretation:</p>
            <p className="text-sm text-gray-400 mt-1">Seminaries with sustained receipt decline may require diocesan support, additional fundraising drives, or review of subsidy allocation.</p>
          </div>
        </div>
      )}

      {/* Chart 1: Receipts vs Disbursements Monthly - full width */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[460px] flex flex-col">
        <h3 className="text-2xl font-bold text-church-green mb-1 uppercase tracking-wide">Monthly Receipts vs Disbursements</h3>
        <p className="text-sm text-gray-400 mb-4">Derived from receipts, seminary fees, subsidy, and the full seminary disbursement column set. Net surplus or deficit is shown as the overlay line.</p>
        <div className="h-[280px] min-h-[280px] flex items-center">
          <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">Amount (PHP)</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={seminaryMockData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" axisLine={true} tickLine={true} tick={{ fill: '#6B7280', fontSize: 11 }} />
              <YAxis axisLine={true} tickLine={true} tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `${v/1000}k`} width={55} />
              <Tooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="totalIncome" name="Total Receipts" fill="#1a472a" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Bar dataKey="totalExpenses" name="Total Disbursements" fill="#D4AF37" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Line type="monotone" dataKey="netSurplus" name="Net Surplus/Deficit" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 justify-center border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#1a472a]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Receipts</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#D4AF37]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Disbursements</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#EF4444]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Net Surplus/Deficit</span></div>
        </div>
      </div>

    </div>
    );
  };

  const renderPredictive = () => {
    const forecastData = getLinearForecast(seminaryMockData, 'totalIncome', 4);
    const expenseData = seminaryMockData.map(d => ({
      ...d,
      isHigh: d.totalExpenses > 1300000 ? d.totalExpenses : null,
      isNormal: d.totalExpenses <= 1300000 ? d.totalExpenses : null
    }));

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Forecast chart with Collections/Disbursements toggle */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-row items-start justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-church-green">FORECASTING ENGINE</p>
              <h3 className="text-2xl font-bold text-amber-600">
                {forecastTab === 'collections' ? 'Monthly Receipts Forecast' : 'Monthly Disbursements Forecast'}
              </h3>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
              <button
                onClick={() => setForecastTab('collections')}
                className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all uppercase tracking-widest ${forecastTab === 'collections' ? 'bg-amber-500 text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Receipts
              </button>
              <button
                onClick={() => setForecastTab('disbursements')}
                className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all uppercase tracking-widest ${forecastTab === 'disbursements' ? 'bg-amber-500 text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Disbursements
              </button>
            </div>
          </div>
          {forecastTab === 'collections' ? (
            <SeminaryForecastChart
              data={seminaryForecastData}
              actualKey="collections"
              forecastKey="forecast"
              yAxisLabel="Amount (PHP)"
              metrics={{ mae: 28.14, rmse: 33.87, mape: 17.42, mase: 0.361, wape: 16.58, mpe: 2.93 }}
            />
          ) : (
            <SeminaryForecastChart
              data={seminaryForecastData}
              actualKey="expenses_parish"
              forecastKey="disbForecast"
              yAxisLabel="Amount (PHP)"
              metrics={{ mae: 22.31, rmse: 27.45, mape: 13.18, mase: 0.294, wape: 12.74, mpe: 1.87 }}
            />
          )}
        </div>

        {/* Disbursement Forecast + Expense Spikes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-church-green mb-1">EXPENSE PROJECTIONS</p>
            <h3 className="text-2xl font-bold text-amber-600">Disbursement Forecast</h3>
            <p className="text-xs text-gray-400 mt-1 mb-4">Based on historical year-over-year trend (+9%)</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'UTILITIES', current: latestMonth.utilities },
                { label: 'WAGES', current: latestMonth.salaries },
                { label: 'SUPPLIES', current: latestMonth.supplies },
                { label: 'MAINTENANCE', current: latestMonth.repairs },
              ].map((item, i) => {
                const projected = Math.round(item.current * 1.09);
                return (
                  <div key={i} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider">{item.label}</p>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-church-black text-sm">{formatCurrency(item.current)}</span>
                      <ArrowUpRight className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-bold text-amber-500 text-sm">{formatCurrency(projected)}</span>
                    </div>
                    <p className="text-[9px] text-amber-600 font-bold">+{formatCurrency(projected - item.current)} projected increase</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-church-green mb-1">EVENTS</p>
            <h3 className="text-2xl font-bold text-amber-600">Expense Spikes</h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {[
                { event: 'Start of Sem (Jun)', spike: '+38%', drivers: 'Tuition, board fees, enrollment supplies' },
                { event: '2nd Semester (Nov)', spike: '+35%', drivers: 'Second semester fee collection' },
                { event: 'December', spike: '+42%', drivers: '13th month pay, Christmas programs' },
                { event: 'Summer (Apr–May)', spike: '+28%', drivers: 'Construction, repair projects' },
              ].map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-church-black">{item.event}</p>
                    <span className="font-bold text-red-500 bg-red-50 px-2 py-1 rounded text-xs">{item.spike}</span>
                  </div>
                  <p className="text-xs text-gray-500">{item.drivers}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collections Rise & Fall + Disbursement Rise & Fall + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#111111] rounded-2xl shadow-sm p-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#D4AF37] mb-1">PREDICTIONS</p>
            <h3 className="text-2xl font-bold text-white mb-4">Collections Rise & Fall</h3>
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                <div className="flex items-center gap-2 text-[#D4AF37] text-4xl font-bold">
                  <ArrowUpRight className="w-8 h-8" /> +14.2%
                </div>
                <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">PROJECTED RISE (Q1)</p>
              </div>
              <div className="bg-[#222222] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                  <ArrowDownRight className="w-8 h-8" /> -3.8%
                </div>
                <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">PROJECTED DIP (Q2)</p>
              </div>
            </div>
          </div>

          <div className="bg-[#111111] rounded-2xl shadow-sm p-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#D4AF37] mb-1">PREDICTIONS</p>
            <h3 className="text-2xl font-bold text-white mb-4">Disbursement Rise & Fall</h3>
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                <div className="flex items-center gap-2 text-[#D4AF37] text-4xl font-bold">
                  <ArrowUpRight className="w-8 h-8" /> +5.8%
                </div>
                <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">PROJECTED RISE (Q1)</p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                  <ArrowDownRight className="w-8 h-8" /> -2.1%
                </div>
                <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">PROJECTED DIP (Q2)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-2xl font-bold text-church-black mb-4">Alerts</h3>
            <div className="space-y-4">
              <div className="bg-[#FFF8E7] border border-[#E6C27A]/50 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-[#B5952F] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-church-black text-sm">Projected Deficit Months</p>
                  <p className="text-xs font-medium text-white mt-2 bg-[#B5952F] px-2 py-1 rounded inline-block">Watch: June</p>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subsidy Dependency</p>
                <p className="text-sm text-church-black mt-1">High subsidy reliance — diversify income streams before next academic year.</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Event Spikes</p>
                <p className="text-sm text-church-black mt-1">Expected cost uplift at semester openings and December.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[#D4AF37] mb-1">Risk Prediction</p>
          <h3 className="text-2xl font-bold text-church-black">Monthly Bill Payment Risk</h3>
          <div className="space-y-6 mt-6">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-6">
              <div>
                <p className="font-bold text-church-black text-lg">St. Peter's College Seminary</p>
                <p className="text-xs font-bold text-rose-600 tracking-wider mt-1 uppercase">High Risk: Utilities & Salaries</p>
              </div>
              <span className="font-bold text-rose-600 text-xl whitespace-nowrap">82% Probability</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-church-black text-lg">Diocesan Memorial Seminary</p>
                <p className="text-xs font-bold text-amber-500 tracking-wider mt-1 uppercase">Medium Risk: Utility Arrears</p>
              </div>
              <span className="font-bold text-amber-500 text-xl whitespace-nowrap">45% Probability</span>
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderPrescriptive = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Utility Cost Reduction */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#D4AF37] mb-1">EFFICIENCY</p>
        <h3 className="text-2xl font-bold text-white mb-4">Utility Cost Reduction</h3>
        <div className="space-y-4">
          {[
            { name: "St. Peter's College Seminary", desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.', ratio: '25% Ratio' },
            { name: 'San Pablo Theological Formation Center', desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.', ratio: '28% Ratio' },
          ].map((item, i) => (
            <div key={i} className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4">
              <div>
                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
              </div>
              <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">{item.ratio}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Diocese-Wide Expense Optimization */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#D4AF37] mb-1">DISBURSEMENTS</p>
        <h3 className="text-2xl font-bold text-white mb-4">Diocese-Wide Expense Optimization</h3>
        <div className="space-y-4">
          {[
            { name: 'Pastoral Program Synergy', desc: 'Encourage neighboring parishes within vicariates to co-host large pastoral events and training seminars to share costs.', impact: '20% Cost Reduction per Event' },
            { name: 'Preventative Maintenance', desc: 'Establish a mandatory quarterly maintenance schedule for all parish facilities to reduce emergency repair disbursements.', impact: 'Long-term Stability' },
          ].map((item, i) => (
            <div key={i} className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4">
              <div>
                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
              </div>
              <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">{item.impact}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );

  return (
    <div className="w-full">
      {/* Tabs Navigation - Matches Parish BishopDashboard style exactly */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-black rounded-full p-1.5 w-full max-w-6xl items-center shadow-xl">
          {[
            { label: 'Descriptive', icon: PieChartIcon },
            { label: 'Diagnostic', icon: Activity },
            { label: 'Predictive', icon: BarChart2 },
            { label: 'Prescriptive', icon: Zap }
          ].map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`
                flex-1 rounded-full text-[10px] font-black transition-all uppercase tracking-[0.2em]
                ${currentTab === idx 
                  ? 'bg-white text-[#d4af37] py-4 shadow-lg' 
                  : 'bg-transparent text-gray-500 py-3 hover:text-white/70'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="animate-in fade-in duration-700">
        {currentTab === 0 && renderDescriptive()}
        {currentTab === 1 && renderDiagnostic()}
        {currentTab === 2 && renderPredictive()}
        {currentTab === 3 && renderPrescriptive()}
      </div>

      {/* Footer / Status */}
      <div className="mt-16 flex flex-col md:flex-row justify-between items-center border-t border-gray-100 pt-8 gap-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">Strategic Intelligence Unit • Diocese of San Pablo</p>
        <div className="flex gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-church-green shadow-[0_0_8px_rgba(26,71,42,0.3)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Historical Data</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.3)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Forecast Layer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
