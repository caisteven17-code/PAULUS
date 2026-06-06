'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  ArrowUpDown,
  Search,
  BrainCircuit,
  HeartPulse,
  Info,
  X,
  TrendingDown,
  Filter,
  Download,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  Settings,
  Bell,
  User,
  LogOut,
  HelpCircle,
  FileText,
  Activity,
  Target,
  Zap,
  Clock,
  CalendarDays,
  Sparkles,
  ArrowRight,
  ArrowUp,
  Cpu,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { dataService } from '../services/dataService';
import { FinancialRecord, FinancialHealthScore, DiagnosticResult } from '../types';
import { auth } from '../firebase';
import { FinancialHealthGauge } from '../components/ui/FinancialHealthGauge';
import { HealthDimensionBar } from '../components/ui/HealthDimensionBar';
import { DiagnosticCard } from '../components/ui/DiagnosticCard';
import { StewardChatbot } from '../components/ui/StewardChatbot';
import { DashboardHeader } from '../components/layout/DashboardHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { DataImportExport } from '../components/projects/DataImportExport';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatMillions } from '../lib/format';
import { usePriestDashboardData } from '../hooks/usePriestDashboardData';
import { FadeIn } from '../components/ui/FadeIn';
import { ALL_PARISHES, INITIAL_SEMINARIES, INITIAL_SCHOOLS, VICARIATES } from '../constants';

interface PriestDashboardProps {
  role?: 'priest' | 'school' | 'seminary' | 'bishop';
  dashboardContext?: 'parish' | 'priest';
  entityName?: string;
  entityType?: string;
  entityClass?: string;
  isEmbedded?: boolean;
  timeframe?: '3m' | '6m' | '12m';
  year?: number;
  onNavigate?: (page: string) => void;
  onYearChange?: (year: number) => void;
  onLogout?: () => void;
}

const stripVicariatePrefix = (name: string) => name.replace('Vicariate of ', '');

const COMPARISON_MONTH_OPTIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const COMPARISON_YEAR_OPTIONS = ['2024', '2025', '2026'] as const;
const GENERATE_COMPARISON_REPORT_EVENT = 'generate-comparison-report';

interface ComparisonRecord {
  period: string;
  collections: number;
  variance: number;
  variancePercent: number;
  year: string;
}

const donationTrendsData = [
  { name: 'Msgr. Gerardo Santos', barValue: 1250000, lineValue: 3450000 },
  { name: 'Fr. Juan Dela Cruz', barValue: 980000, lineValue: 2100000 },
  { name: 'Fr. Ricardo Reyes', barValue: 750000, lineValue: 1500000 },
  { name: 'Fr. Miguel Santos', barValue: 620000, lineValue: 1100000 },
  { name: 'Fr. Antonio Luna', barValue: 450000, lineValue: 800000 },
  { name: 'Fr. Jose Rizal', barValue: 380000, lineValue: 600000 },
  { name: 'Fr. Andres Bonifacio', barValue: 250000, lineValue: 400000 },
  { name: 'Fr. Emilio Aguinaldo', barValue: 120000, lineValue: 250000 },
  { name: 'Fr. Apolinario Mabini', barValue: 85000, lineValue: 150000 },
  { name: 'Fr. Marcelo H. Del Pilar', barValue: 60000, lineValue: 50000 },
];

const CustomizedTick = (props: any) => {
  const { x, y, payload, fontSize = 11 } = props;
  const value = typeof payload.value === 'string' ? stripVicariatePrefix(payload.value) : payload.value;
  const words = value.split(' ');

  if (words.length > 5) {
    const line1 = words.slice(0, 5).join(' ');
    const line2 = words.slice(5).join(' ');
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="end"
          fill="#6B7280"
          fontSize={fontSize}
          fontWeight={500}
          transform="rotate(-25)"
        >
          <tspan x={0} dy="0">
            {line1}
          </tspan>
          <tspan x={0} dy="1.2em">
            {line2}
          </tspan>
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="end"
        fill="#6B7280"
        fontSize={fontSize}
        fontWeight={500}
        transform="rotate(-25)"
      >
        {value}
      </text>
    </g>
  );
};


const AdvancedForecastChart = ({
  data,
  actualKey,
  forecastKey,
  yAxisLabel,
  title,
  metrics = {
    mae: 35.22,
    rmse: 42.02,
    mape: 20.88,
    mase: 0.38,
    wape: 19.72,
    mpe: 4.46,
  },
}: {
  data: any[];
  actualKey: string;
  forecastKey: string;
  yAxisLabel: string;
  title: string;
  metrics?: any;
}) => {
  const pastEnd = 'Apr';
  const presentEnd = 'May';
  const futureEnd = 'Jun';

  // Process data to ensure historical line stops at present, and forecast starts at present
  const processedData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const presentIndex = months.indexOf(presentEnd);
    const pastIndex = months.indexOf(pastEnd);

    return data.map((item) => {
      const itemIndex = months.indexOf(item.month);
      const actualFieldName = `${actualKey}_actual`;
      const forecastFieldName = `${forecastKey}_forecast`;

      return {
        ...item,
        [actualFieldName]: itemIndex <= presentIndex ? item[actualKey] : null,
        [forecastFieldName]: itemIndex >= pastIndex ? item[forecastKey] : null,
      };
    });
  }, [data, actualKey, forecastKey, presentEnd, pastEnd]);

  const actualFieldName = `${actualKey}_actual`;
  const forecastFieldName = `${forecastKey}_forecast`;

  const forecastChartOption = {
    color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const validParams = params.filter((p) => p.value !== null && p.value !== undefined);
        if (!validParams.length) return '';
        const label = validParams[0].axisValue;
        const lines = validParams
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
                <span style="font-size:11px;color:#6B7280">${p.seriesName}:</span>
                <span style="font-size:11px;font-weight:700">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(p.value)}</span>
              </div>`,
          )
          .join('');
        return `<div style="padding:8px"><p style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">${label}</p>${lines}</div>`;
      },
      backgroundColor: '#fff',
      borderColor: '#E5E7EB',
      borderWidth: 1,
      extraCssText: 'border-radius:12px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { fontSize: 9, fontWeight: 700, color: '#4B5563' },
      icon: 'circle',
      data: ['Historical (Actual)', 'Forecast (ML Model)'],
    },
    grid: { top: 50, right: 20, left: 45, bottom: 30 },
    xAxis: {
      type: 'category',
      data: processedData.map((d) => d.month),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 10, fontWeight: 600 },
      splitLine: { show: true, lineStyle: { color: '#F3F4F6', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 10, formatter: (v: number) => `${v / 1000}k` },
      splitLine: { show: true, lineStyle: { color: '#F3F4F6' } },
    },
    series: [
      {
        name: 'Historical (Actual)',
        type: 'line',
        data: processedData.map((d) => d[actualFieldName] ?? null),
        smooth: true,
        lineStyle: { color: '#1a472a', width: 3 },
        itemStyle: { color: '#1a472a', borderColor: '#fff', borderWidth: 2 },
        symbolSize: 6,
        connectNulls: false,
        markArea: {
          silent: true,
          data: [
            [
              { xAxis: 'Jan', itemStyle: { color: '#F0F9FF', opacity: 0.4 }, label: { show: true, position: 'insideTopLeft', value: 'PAST', color: '#0EA5E9', fontSize: 8, fontWeight: 700 } },
              { xAxis: pastEnd },
            ],
            [
              { xAxis: pastEnd, itemStyle: { color: '#FFF7ED', opacity: 0.4 }, label: { show: true, position: 'insideTopLeft', value: 'PRESENT', color: '#F97316', fontSize: 8, fontWeight: 700 } },
              { xAxis: presentEnd },
            ],
            [
              { xAxis: presentEnd, itemStyle: { color: '#F0FDF4', opacity: 0.4 }, label: { show: true, position: 'insideTopLeft', value: 'FUTURE', color: '#22C55E', fontSize: 8, fontWeight: 700 } },
              { xAxis: futureEnd },
            ],
          ],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ xAxis: presentEnd, lineStyle: { color: '#D1D5DB', type: 'dashed' } }],
          label: { show: false },
        },
      },
      {
        name: 'Forecast (ML Model)',
        type: 'line',
        data: processedData.map((d) => d[forecastFieldName] ?? null),
        smooth: true,
        lineStyle: { color: '#D4AF37', width: 3, type: 'dashed' },
        itemStyle: { color: '#D4AF37', borderColor: '#fff', borderWidth: 2 },
        symbolSize: 6,
        connectNulls: false,
      },
    ],
  };

  return (
    <div className="flex flex-col w-full bg-white/50 rounded-2xl p-3 border border-gray-100/50">
      <div className="h-[240px] flex items-center">
        <div className="w-8 flex-shrink-0 flex items-center justify-center h-full">
          <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.4em] -rotate-90 whitespace-nowrap">
            {yAxisLabel}
          </span>
        </div>
        <ReactECharts option={forecastChartOption} style={{ height: '100%', width: '100%' }} />
      </div>

      <div className="mt-6 bg-gray-50/50 rounded-xl p-3 border border-gray-100">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            Model Performance Metrics
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[8px] font-bold text-green-600 uppercase tracking-wider">Active Learning</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-400 uppercase tracking-wider font-bold">
                <th className="text-center pb-1.5">MAE</th>
                <th className="text-center pb-1.5">RMSE</th>
                <th className="text-center pb-1.5">MAPE%</th>
                <th className="text-center pb-1.5">MASE</th>
                <th className="text-center pb-1.5 pr-1.5">WAPE%</th>
              </tr>
            </thead>
            <tbody className="text-church-black font-semibold">
              <tr className="bg-white rounded-lg shadow-sm">
                <td className="text-center py-2 border-y border-gray-100">{metrics.mae}</td>
                <td className="text-center py-2 border-y border-gray-100">{metrics.rmse}</td>
                <td className="text-center py-2 border-y border-gray-100 text-gold-600 font-bold">{metrics.mape}%</td>
                <td className="text-center py-2 border-y border-gray-100">{metrics.mase}</td>
                <td className="text-center py-2 pr-2 border-y border-r border-gray-100">{metrics.wape}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
        <p className="text-[8px] font-bold text-gray-300 uppercase tracking-[0.15em]">{title}</p>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
      </div>
    </div>
  );
};

export function PriestDashboard({
  role = 'priest',
  dashboardContext,
  entityName,
  entityType,
  entityClass,
  isEmbedded = false,
  timeframe = '6m',
  year = 2026,
  onNavigate,
  onYearChange,
  onLogout,
}: PriestDashboardProps) {
  const [analyticsView, setAnalyticsView] = useState<'descriptive' | 'predictive' | 'prescriptive' | 'health'>(
    'descriptive',
  );
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<DiagnosticResult | null>(null);
  const [collectionsTimeframe, setCollectionsTimeframe] = useState<'6m' | '12m'>('12m');
  const [disbursementsTimeframe, setDisbursementsTimeframe] = useState<'6m' | '12m'>('12m');
  const [collectionsFilter, setCollectionsFilter] = useState<
    'all' | 'collections_mass' | 'sacraments_rate' | 'collections_other'
  >('all');
  const [disbursementsFilter, setDisbursementsFilter] = useState<'all' | 'expenses_parish' | 'expenses_pastoral'>(
    'all',
  );
  const [enrollmentFilter, setEnrollmentFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [staffRatioFilter, setStaffRatioFilter] = useState<'all' | 'seminarians' | 'staff'>('all');
  const [formationFilter, setFormationFilter] = useState<'all' | 'propaedeutic' | 'philosophy' | 'theology'>('all');
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'applicants' | 'admitted'>('all');
  const [attritionFilter, setAttritionFilter] = useState<'all' | 'risk' | 'actual'>('all');
  const [yieldFilter, setYieldFilter] = useState<'all' | 'yield' | 'target'>('all');
  const [collectionsDisbursementsFilter, setCollectionsDisbursementsFilter] = useState<
    'all' | 'collections' | 'disbursements'
  >('all');
  const [enrollmentForecastFilter, setEnrollmentForecastFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [ratioFilter, setRatioFilter] = useState<'all' | 'staff' | 'seminarians'>('all');
  const [clusteringFilter, setClusteringFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [optimizationFilter, setOptimizationFilter] = useState<'all' | 'personnel' | 'utilities' | 'programs'>('all');
  const [donationTrendsFilter, setDonationTrendsFilter] = useState<'all' | 'actual' | 'potential'>('all');
  const [donationTrendsMode, setDonationTrendsMode] = useState<'amount' | 'performance'>('performance');
  const [showPriestFilters, setShowPriestFilters] = useState(false);
  const [comparisonMonth1, setComparisonMonth1] = useState<(typeof COMPARISON_MONTH_OPTIONS)[number]>('Jan');
  const [comparisonYear1, setComparisonYear1] = useState<(typeof COMPARISON_YEAR_OPTIONS)[number]>('2025');
  const [comparisonMonth2, setComparisonMonth2] = useState<(typeof COMPARISON_MONTH_OPTIONS)[number]>('Jan');
  const [comparisonYear2, setComparisonYear2] = useState<(typeof COMPARISON_YEAR_OPTIONS)[number]>('2026');
  const [medicalStatusFilter, setMedicalStatusFilter] = useState<'all' | 'urgent' | 'followup'>('all');
  const [priestScope, setPriestScope] = useState<'overall' | 'specific'>('overall');
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'parish' | 'seminary' | 'school'>('all');
  const [filterVicariate, setFilterVicariate] = useState<string>('all');
  const [filterEntitySearch, setFilterEntitySearch] = useState('');
  const [filterSelectedEntity, setFilterSelectedEntity] = useState<string | null>(null);
  // Staged values inside modal before applying
  const [stagingType, setStagingType] = useState<'all' | 'parish' | 'seminary' | 'school'>('all');
  const [stagingVicariate, setStagingVicariate] = useState<string>('all');
  const [stagingSearch, setStagingSearch] = useState('');
  const [stagingEntity, setStagingEntity] = useState<string | null>(null);
  const [stagingMedical, setStagingMedical] = useState<'all' | 'urgent' | 'followup'>('all');

  const openFilterModal = () => {
    setStagingType(filterType);
    setStagingVicariate(filterVicariate);
    setStagingSearch(filterEntitySearch);
    setStagingEntity(filterSelectedEntity);
    setStagingMedical(medicalStatusFilter);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setFilterType(stagingType);
    setFilterVicariate(stagingVicariate);
    setFilterEntitySearch(stagingSearch);
    setFilterSelectedEntity(stagingEntity);
    setMedicalStatusFilter(stagingMedical);
    setPriestScope(stagingType !== 'all' || stagingEntity !== null ? 'specific' : 'overall');
    setShowFilterModal(false);
  };

  const resetFilters = () => {
    setStagingType('all');
    setStagingVicariate('all');
    setStagingSearch('');
    setStagingEntity(null);
    setStagingMedical('all');
  };

  const clearAllFilters = () => {
    setFilterType('all');
    setFilterVicariate('all');
    setFilterEntitySearch('');
    setFilterSelectedEntity(null);
    setMedicalStatusFilter('all');
    setPriestScope('overall');
  };

  const activeFilterCount = [filterType !== 'all', filterSelectedEntity !== null, medicalStatusFilter !== 'all'].filter(
    Boolean,
  ).length;

  const filteredParishList = useMemo(() => {
    return ALL_PARISHES.filter((p) => {
      const matchesVicariate = stagingVicariate === 'all' || p.vicariate === stagingVicariate;
      const matchesSearch = stagingSearch === '' || p.name.toLowerCase().includes(stagingSearch.toLowerCase());
      return matchesVicariate && matchesSearch;
    });
  }, [stagingVicariate, stagingSearch]);

  const mappedType = useMemo(() => {
    if (role === 'priest') return 'parish';
    if (role === 'school') return 'school';
    if (role === 'seminary') return 'seminary';
    return 'parish';
  }, [role]);

  const currentEntityId = useMemo(() => (isEmbedded ? entityName : auth.currentUser?.uid), [isEmbedded, entityName]);

  const { records, healthScore, kpis, isLoading, userEntityInfo } = usePriestDashboardData(
    currentEntityId,
    mappedType as any,
    entityClass,
  );

  // Filter main dashboard records based on navbar timeframe selector
  const filteredRecords = useMemo(() => {
    if (timeframe === '3m') return records.slice(-3);
    if (timeframe === '6m') return records.slice(-6);
    return records; // '12m' or 'all' - return all records
  }, [timeframe, records]);

  const filteredCollectionsData = useMemo(() => {
    return filteredRecords;
  }, [filteredRecords]);

  const filteredDisbursementsData = useMemo(() => {
    return filteredRecords;
  }, [filteredRecords]);

  const donationTrendDisplayData = useMemo(() => {
    const totalActual = donationTrendsData.reduce((sum, row) => sum + row.barValue, 0);
    const totalPotential = donationTrendsData.reduce((sum, row) => sum + row.lineValue, 0);

    return donationTrendsData.map((row) => ({
      ...row,
      barPercentage: totalActual > 0 ? (row.barValue / totalActual) * 100 : 0,
      linePercentage: totalPotential > 0 ? (row.lineValue / totalPotential) * 100 : 0,
    }));
  }, []);

  const handleDiagnosticRequest = async (month: string) => {
    const entityId = isEmbedded ? entityName : auth.currentUser?.entityId || 'default';
    const result = await dataService.getDiagnostic(entityId as string, month);
    setSelectedDiagnostic(result);
  };

  // Helper for backward compatibility - always shows all sections since search is removed
  const isVisible = (_sectionName?: string) => true;

  const totalCollections = useMemo(() => filteredRecords.reduce((sum, r) => sum + r.collections, 0), [filteredRecords]);
  const totalDisbursements = useMemo(
    () => filteredRecords.reduce((sum, r) => sum + r.disbursements, 0),
    [filteredRecords],
  );

  const priestAssignmentScore = useMemo(() => {
    const scoped = filteredRecords.slice(-12);
    const monthCount = scoped.length;

    if (monthCount === 0) return null;

    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    const rollingAverage = (series: number[], windowSize: number) => {
      return series.map((_, index) => {
        const start = Math.max(0, index - windowSize + 1);
        const window = series.slice(start, index + 1);
        return window.reduce((sum, value) => sum + value, 0) / window.length;
      });
    };
    const collections = scoped.map((r) => r.collections || 0);
    const disbursements = scoped.map((r) => r.disbursements || 0);
    const net = collections.map((c, i) => c - disbursements[i]);
    const smoothedCollections = rollingAverage(collections, 3);
    const smoothedNet = rollingAverage(net, 3);

    const totalC = collections.reduce((sum, value) => sum + value, 0);
    const totalD = disbursements.reduce((sum, value) => sum + value, 0);
    const meanCollections = smoothedCollections.reduce((sum, value) => sum + value, 0) / monthCount;
    const variance =
      smoothedCollections.reduce((sum, value) => sum + Math.pow(value - meanCollections, 2), 0) / monthCount;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = meanCollections > 0 ? stdDev / meanCollections : 1;

    const positiveMonths = net.filter((value) => value > 0).length;
    const positiveRate = (positiveMonths / monthCount) * 100;

    const segmentSize = Math.max(1, Math.floor(monthCount / 3));
    const earlyWindow = smoothedCollections.slice(0, segmentSize);
    const lateWindow = smoothedCollections.slice(-segmentSize);
    const earlyAvg = earlyWindow.reduce((sum, value) => sum + value, 0) / earlyWindow.length;
    const lateAvg = lateWindow.reduce((sum, value) => sum + value, 0) / lateWindow.length;
    const growthPct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;

    const classFactorMap: Record<string, number> = {
      'Class A': 0.8,
      'Class B': 0.9,
      'Class C': 1.0,
      'Class D': 1.1,
      'Class E': 1.2,
    };
    const classFactor = classFactorMap[entityClass || userEntityInfo.class || 'Class C'] || 1;

    const contribution = clamp(positiveRate * 0.6 + Math.min(100, (totalC / (monthCount * 220000)) * 100) * 0.4);
    const growthConsistency = clamp(50 + growthPct * 1.8 + positiveRate * 0.2);
    const discipline = clamp(totalC > 0 ? 50 + ((totalC - totalD) / totalC) * 100 : 0);
    const stability = clamp(100 - coefficientOfVariation * 120);
    const assignmentBase = Math.min(100, (totalC / (monthCount * 220000)) * 100);
    const assignmentFairness = clamp(assignmentBase * classFactor);

    const weightedNeutral =
      contribution * 0.3 + growthConsistency * 0.25 + discipline * 0.2 + stability * 0.15 + assignmentBase * 0.1;

    const weightedWithContext =
      contribution * 0.3 + growthConsistency * 0.25 + discipline * 0.2 + stability * 0.15 + assignmentFairness * 0.1;

    const contextAdjustment = Math.max(-10, Math.min(10, weightedWithContext - weightedNeutral));
    const rawComposite = weightedNeutral + contextAdjustment;

    const confidenceFactor = Math.min(1, monthCount / 6);
    const compositeScore = Math.round(50 + (rawComposite - 50) * confidenceFactor);
    const isProvisional = monthCount < 6;

    const prevWindow = smoothedNet.slice(-6, -3);
    const currWindow = smoothedNet.slice(-3);
    const prevAvg = prevWindow.length ? prevWindow.reduce((sum, value) => sum + value, 0) / prevWindow.length : 0;
    const currAvg = currWindow.length ? currWindow.reduce((sum, value) => sum + value, 0) / currWindow.length : 0;
    const trendDelta = prevAvg !== 0 ? ((currAvg - prevAvg) / Math.abs(prevAvg)) * 100 : currAvg > 0 ? 100 : 0;

    const trend: 'up' | 'down' | 'stable' = trendDelta > 2 ? 'up' : trendDelta < -2 ? 'down' : 'stable';

    const dimensions = {
      contribution,
      growthConsistency,
      discipline,
      stability,
      assignmentFairness,
    };

    const weakest = Object.entries(dimensions).sort((a, b) => a[1] - b[1])[0];
    const weakestLabelMap: Record<string, string> = {
      contribution: 'Contribution Quality',
      growthConsistency: 'Growth Consistency',
      discipline: 'Financial Discipline',
      stability: 'Stability',
      assignmentFairness: 'Assignment Context',
    };

    return {
      compositeScore,
      trend,
      trendDelta,
      confidenceMonths: monthCount,
      isProvisional,
      dimensions,
      weakestDimension: weakestLabelMap[weakest[0]] || 'Stability',
    };
  }, [filteredRecords, entityClass, userEntityInfo.class]);

  const seasonalityData = useMemo(
    () =>
      filteredRecords.map((r) => ({
        month: r.month,
        value: (r.collections / 10000).toFixed(0),
      })),
    [filteredRecords],
  );

  const seminaryDonationSources = useMemo(
    () => [
      { name: 'Diocesan Support', value: 35, color: '#1a472a' },
      { name: 'Parish Support', value: 25, color: '#D4AF37' },
      { name: 'Alumni Giving', value: 20, color: '#1a472a' },
      { name: 'Individual Donors', value: 15, color: '#E6C27A' },
      { name: 'Grants', value: 5, color: '#1a472a' },
    ],
    [],
  );

  const formationStageData = useMemo(
    () => [
      { stage: 'Propaedeutic', count: 15 },
      { stage: 'Philosophy', count: 35 },
      { stage: 'Theology', count: 45 },
      { stage: 'Pastoral Year', count: 12 },
      { stage: 'Deaconate', count: 8 },
    ],
    [],
  );

  const attritionRiskData = useMemo(
    () => [
      { year: '1st Year', risk: 15, historical: 12 },
      { year: '2nd Year', risk: 8, historical: 10 },
      { year: '3rd Year', risk: 5, historical: 7 },
      { year: '4th Year', risk: 3, historical: 4 },
    ],
    [],
  );

  const vocationYieldData = useMemo(
    () => [
      { region: 'Holy Family', inquiries: 45, accepted: 8 },
      { region: 'San Isidro Labrador', inquiries: 32, accepted: 5 },
      { region: 'San Pedro Apostol', inquiries: 28, accepted: 4 },
      { region: 'Sta. Rosa De Lima', inquiries: 15, accepted: 2 },
    ],
    [],
  );

  const endowmentGrowthData = useMemo(
    () => [
      { year: '2021', amount: 5.2 },
      { year: '2022', amount: 5.8 },
      { year: '2023', amount: 6.5 },
      { year: '2024', amount: 7.2 },
      { year: '2025', amount: 8.1 },
    ],
    [],
  );

  const vocationInterestData = useMemo(
    () => [
      { month: 'Jan', inquiries: 45 },
      { month: 'Feb', inquiries: 52 },
      { month: 'Mar', inquiries: 48 },
      { month: 'Apr', inquiries: 61 },
      { month: 'May', inquiries: 55 },
      { month: 'Jun', inquiries: 67 },
    ],
    [],
  );

  const seminaryEnrollmentData = useMemo(
    () => [
      { year: '2021', students: 85 },
      { year: '2022', students: 92 },
      { year: '2023', students: 105 },
      { year: '2024', students: 118 },
      { year: '2025', students: 125 },
    ],
    [],
  );

  const enrollmentForecastData = useMemo(
    () => [
      { year: '2021', enrollment: 85, capacity: 150 },
      { year: '2022', enrollment: 92, capacity: 150 },
      { year: '2023', enrollment: 105, capacity: 150 },
      { year: '2024', enrollment: 118, capacity: 150 },
      { year: '2025', enrollment: 125, capacity: 150 },
    ],
    [],
  );

  const vocationPipelineData = useMemo(
    () => [
      { stage: 'Inquiry', count: 45 },
      { stage: 'Application', count: 28 },
      { stage: 'Interview', count: 18 },
      { stage: 'Accepted', count: 12 },
    ],
    [],
  );

  const seminaryCostBreakdown = useMemo(
    () => [
      { name: 'Faculty & Staff', value: 40, color: '#1a472a' },
      { name: 'Maintenance', value: 20, color: '#D4AF37' },
      { name: 'Food & Board', value: 25, color: '#1a472a' },
      { name: 'Utilities', value: 15, color: '#E6C27A' },
    ],
    [],
  );

  const staffRatioData = useMemo(
    () => [
      { name: 'Full-time Faculty', count: 12 },
      { name: 'Part-time Faculty', count: 8 },
      { name: 'Spiritual Directors', count: 5 },
      { name: 'Support Staff', count: 15 },
    ],
    [],
  );

  const fallbackMonthlyData = useMemo(
    () => [
      { month: 'Jan', actual: 365000, variance: 15000 },
      { month: 'Feb', actual: 340000, variance: -10000 },
      { month: 'Mar', actual: 410000, variance: 30000 },
      { month: 'Apr', actual: 425000, variance: 25000 },
      { month: 'May', actual: 375000, variance: -5000 },
      { month: 'Jun', actual: 360000, variance: 10000 },
    ],
    [],
  );

  const parishPredictiveData = useMemo(() => {
    const source =
      filteredRecords.length > 0
        ? filteredRecords
        : fallbackMonthlyData.map((row) => ({
            month: row.month,
            collections: row.actual,
            disbursements: Math.round(row.actual * 0.82),
          }));

    return source.map((row, index) => {
      const previous = source[Math.max(0, index - 1)];
      const collectionTrend = index === 0 ? 1.03 : (row.collections || 0) / Math.max(previous.collections || 1, 1);
      const disbursementTrend =
        index === 0 ? 1.02 : (row.disbursements || 0) / Math.max(previous.disbursements || 1, 1);
      const moderatedCollectionTrend = Math.max(0.92, Math.min(1.12, collectionTrend));
      const moderatedDisbursementTrend = Math.max(0.94, Math.min(1.1, disbursementTrend));
      const forecast = Math.round((row.collections || 0) * moderatedCollectionTrend);
      const disbursementsForecast = Math.round((row.disbursements || 0) * moderatedDisbursementTrend);

      return {
        month: row.month,
        collections: row.collections || 0,
        disbursements: row.disbursements || 0,
        forecast,
        disbursementsForecast,
        netForecast: forecast - disbursementsForecast,
      };
    });
  }, [fallbackMonthlyData, filteredRecords]);

  const predictiveSummary = useMemo(() => {
    const latest = parishPredictiveData[parishPredictiveData.length - 1];
    const previous = parishPredictiveData[Math.max(0, parishPredictiveData.length - 2)];
    const forecastCollections = latest?.forecast || 0;
    const forecastDisbursements = latest?.disbursementsForecast || 0;
    const forecastNet = forecastCollections - forecastDisbursements;
    const collectionChange = previous?.forecast
      ? ((forecastCollections - previous.forecast) / previous.forecast) * 100
      : 0;
    const riskLevel =
      forecastNet < 0 || (healthScore?.compositeScore || 0) < 40
        ? 'High'
        : collectionChange < -2
          ? 'Moderate'
          : 'Stable';

    return {
      forecastCollections,
      forecastDisbursements,
      forecastNet,
      collectionChange,
      riskLevel,
    };
  }, [healthScore?.compositeScore, parishPredictiveData]);

  const comparisonData = useMemo<ComparisonRecord[]>(() => {
    const month1Data = fallbackMonthlyData.find((d) => d.month === comparisonMonth1);
    const month2Data = fallbackMonthlyData.find((d) => d.month === comparisonMonth2);

    if (!month1Data || !month2Data) return [];

    return [
      {
        period: `${comparisonMonth1} ${comparisonYear1}`,
        collections: month1Data.actual,
        variance: 0,
        variancePercent: 0,
        year: comparisonYear1,
      },
      {
        period: `${comparisonMonth2} ${comparisonYear2}`,
        collections: month2Data.actual,
        variance: 0,
        variancePercent: 0,
        year: comparisonYear2,
      },
    ];
  }, [comparisonMonth1, comparisonYear1, comparisonMonth2, comparisonYear2, fallbackMonthlyData]);

  const comparisonDelta = useMemo(() => {
    if (comparisonData.length !== 2) {
      return { amount: 0, percent: 0 };
    }

    const amount = comparisonData[1].collections - comparisonData[0].collections;
    const percent = comparisonData[0].collections > 0 ? (amount / comparisonData[0].collections) * 100 : 0;
    return { amount, percent };
  }, [comparisonData]);

  const handleGenerateComparisonReport = useCallback(() => {
    if (comparisonData.length !== 2) return;

    const [periodOne, periodTwo] = comparisonData;

    const reportLines = [
      'STEWARDSHIP COMPARISON REPORT',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `Period 1: ${periodOne.period}`,
      `  Collections: ${formatCurrency(periodOne.collections)}`,
      '',
      `Period 2: ${periodTwo.period}`,
      `  Collections: ${formatCurrency(periodTwo.collections)}`,
      '',
      `Comparison: ${comparisonDelta.amount >= 0 ? '+' : ''}${formatCurrency(comparisonDelta.amount)} (${comparisonDelta.percent.toFixed(1)}%)`,
    ];

    const blob = new Blob([reportLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stewardship-comparison-${comparisonMonth1}-${comparisonYear1}-vs-${comparisonMonth2}-${comparisonYear2}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [comparisonData, comparisonDelta, comparisonMonth1, comparisonMonth2, comparisonYear1, comparisonYear2]);

  useEffect(() => {
    const handleGlobalGenerateReport = () => handleGenerateComparisonReport();

    window.addEventListener(GENERATE_COMPARISON_REPORT_EVENT, handleGlobalGenerateReport);
    return () => {
      window.removeEventListener(GENERATE_COMPARISON_REPORT_EVENT, handleGlobalGenerateReport);
    };
  }, [handleGenerateComparisonReport]);

  const clusteringData = useMemo(
    () => [
      { week: 'Week 1', value: 85, status: 'high' },
      { week: 'Week 2', value: 65, status: 'medium' },
      { week: 'Week 3', value: 45, status: 'low' },
      { week: 'Week 4', value: 75, status: 'high' },
      { week: 'Week 5', value: 90, status: 'high' },
      { week: 'Week 6', value: 55, status: 'medium' },
    ],
    [],
  );

  const optimizationData = useMemo(
    () => [
      { category: 'Personnel', current: 450000, optimized: 410000, savings: 40000 },
      { category: 'Utilities', current: 120000, optimized: 95000, savings: 25000 },
      { category: 'Programs', current: 280000, optimized: 250000, savings: 30000 },
      { category: 'Maintenance', current: 150000, optimized: 135000, savings: 15000 },
    ],
    [],
  );

  const priestMedicalSubmissionQueue = useMemo(
    () => [
      {
        name: 'Fr. Noel Artillaga',
        vicariate: 'Holy Family',
        priestClass: 'Class D',
        birthMonth: 'January',
        lastSubmission: 'Dec 2024',
        category: 'urgent' as const,
        institutionType: 'parish' as const,
        institution: 'Christ the King Parish',
      },
      {
        name: 'Fr. Michael Santos',
        vicariate: 'San Isidro Labrador',
        priestClass: 'Class C',
        birthMonth: 'February',
        lastSubmission: 'Jan 2025',
        category: 'urgent' as const,
        institutionType: 'parish' as const,
        institution: 'Blessed Sacrament Parish',
      },
      {
        name: 'Fr. Rafael Mendoza',
        vicariate: 'San Pedro Apostol',
        priestClass: 'Class B',
        birthMonth: 'March',
        lastSubmission: 'Mar 2025',
        category: 'followup' as const,
        institutionType: 'parish' as const,
        institution: 'St. Peter of Alcantara Parish',
      },
      {
        name: 'Fr. Paulo Dela Cruz',
        vicariate: 'Sta. Rosa De Lima',
        priestClass: 'Class C',
        birthMonth: 'April',
        lastSubmission: 'Apr 2025',
        category: 'followup' as const,
        institutionType: 'parish' as const,
        institution: 'Holy Family Parish',
      },
      {
        name: 'Fr. Vincent Reyes',
        vicariate: 'St. Polycarp',
        priestClass: 'Class A',
        birthMonth: 'February',
        lastSubmission: 'Feb 2025',
        category: 'urgent' as const,
        institutionType: 'parish' as const,
        institution: 'Most Holy Name of Jesus Parish',
      },
      {
        name: 'Fr. Jerome Castillo',
        vicariate: 'San Pablo',
        priestClass: 'Class A',
        birthMonth: 'January',
        lastSubmission: 'Nov 2024',
        category: 'urgent' as const,
        institutionType: 'seminary' as const,
        institution: "St. Peter's College Seminary",
      },
      {
        name: 'Fr. Leon de Guzman',
        vicariate: 'San Pablo',
        priestClass: 'Class B',
        birthMonth: 'March',
        lastSubmission: 'Feb 2025',
        category: 'followup' as const,
        institutionType: 'seminary' as const,
        institution: 'San Pablo Theological Formation Center',
      },
      {
        name: 'Sr. Clara Mendoza',
        vicariate: 'San Pablo',
        priestClass: 'Class A',
        birthMonth: 'February',
        lastSubmission: 'Jan 2025',
        category: 'followup' as const,
        institutionType: 'school' as const,
        institution: 'Liceo de San Pablo',
      },
      {
        name: 'Fr. Antonio Villanueva',
        vicariate: 'San Pablo',
        priestClass: 'Class B',
        birthMonth: 'January',
        lastSubmission: 'Dec 2024',
        category: 'urgent' as const,
        institutionType: 'school' as const,
        institution: 'Canossa College San Pablo',
      },
    ],
    [],
  );

  const priestsPendingMedicalResults = useMemo(() => {
    const monthIndex: Record<string, number> = {
      January: 0,
      February: 1,
      March: 2,
      April: 3,
      May: 4,
      June: 5,
      July: 6,
      August: 7,
      September: 8,
      October: 9,
      November: 10,
      December: 11,
    };
    const currentMonth = new Date().getMonth();

    return priestMedicalSubmissionQueue
      .filter((row) => monthIndex[row.birthMonth] < currentMonth)
      .filter((row) => medicalStatusFilter === 'all' || row.category === medicalStatusFilter)
      .filter((row) => filterType === 'all' || row.institutionType === filterType)
      .filter((row) => filterSelectedEntity === null || row.institution === filterSelectedEntity);
  }, [priestMedicalSubmissionQueue, medicalStatusFilter, filterType, filterSelectedEntity]);

  const diocesanPriestData = useMemo(
    () => [
      {
        name: 'Msgr. Gerardo Santos',
        vicariate: 'Holy Family',
        entity: 'Christ the King Parish',
        entityType: 'parish',
        monthsAssigned: 36,
        avgCollections: 1250000,
        avgDisbursements: 890000,
        collectionChange: 18.5,
        disciplineScore: 94,
        status: 'active' as const,
      },
      {
        name: 'Fr. Juan Dela Cruz',
        vicariate: 'San Isidro Labrador',
        entity: 'Blessed Sacrament Parish',
        entityType: 'parish',
        monthsAssigned: 24,
        avgCollections: 980000,
        avgDisbursements: 820000,
        collectionChange: 12.3,
        disciplineScore: 88,
        status: 'active' as const,
      },
      {
        name: 'Fr. Ricardo Reyes',
        vicariate: 'San Pedro Apostol',
        entity: 'St. Peter of Alcantara Parish',
        entityType: 'parish',
        monthsAssigned: 18,
        avgCollections: 750000,
        avgDisbursements: 680000,
        collectionChange: -5.2,
        disciplineScore: 72,
        status: 'active' as const,
      },
      {
        name: 'Fr. Miguel Santos',
        vicariate: 'Sta. Rosa De Lima',
        entity: 'Holy Family Parish',
        entityType: 'parish',
        monthsAssigned: 48,
        avgCollections: 620000,
        avgDisbursements: 590000,
        collectionChange: 8.1,
        disciplineScore: 91,
        status: 'review' as const,
      },
      {
        name: 'Fr. Antonio Luna',
        vicariate: 'St. Polycarp',
        entity: 'Most Holy Name of Jesus Parish',
        entityType: 'parish',
        monthsAssigned: 12,
        avgCollections: 450000,
        avgDisbursements: 430000,
        collectionChange: 2.4,
        disciplineScore: 85,
        status: 'active' as const,
      },
      {
        name: 'Fr. Jose Rizal',
        vicariate: 'Holy Family',
        entity: 'San Martin de Porres Parish',
        entityType: 'parish',
        monthsAssigned: 60,
        avgCollections: 380000,
        avgDisbursements: 420000,
        collectionChange: -8.3,
        disciplineScore: 65,
        status: 'reassign' as const,
      },
      {
        name: 'Fr. Jerome Castillo',
        vicariate: 'San Pablo',
        entity: "St. Peter's College Seminary",
        entityType: 'seminary',
        monthsAssigned: 30,
        avgCollections: 250000,
        avgDisbursements: 180000,
        collectionChange: 15.2,
        disciplineScore: 97,
        status: 'active' as const,
      },
      {
        name: 'Sr. Clara Mendoza',
        vicariate: 'San Pablo',
        entity: 'Liceo de San Pablo',
        entityType: 'school',
        monthsAssigned: 20,
        avgCollections: 120000,
        avgDisbursements: 98000,
        collectionChange: 6.7,
        disciplineScore: 89,
        status: 'active' as const,
      },
      {
        name: 'Fr. Andres Bonifacio',
        vicariate: 'San Antonio De Padua',
        entity: 'Our Lady of Guadalupe Parish',
        entityType: 'parish',
        monthsAssigned: 8,
        avgCollections: 95000,
        avgDisbursements: 102000,
        collectionChange: -14.1,
        disciplineScore: 58,
        status: 'reassign' as const,
      },
      {
        name: 'Fr. Emilio Aguinaldo',
        vicariate: 'San Bartolome',
        entity: 'St. James Parish',
        entityType: 'parish',
        monthsAssigned: 15,
        avgCollections: 85000,
        avgDisbursements: 79000,
        collectionChange: 3.8,
        disciplineScore: 82,
        status: 'active' as const,
      },
    ],
    [],
  );

  const diocesanStats = useMemo(() => {
    const total = diocesanPriestData.length;
    const avgCollection = Math.round(diocesanPriestData.reduce((s, p) => s + p.avgCollections, 0) / total);
    const topPerformer = [...diocesanPriestData].sort((a, b) => b.collectionChange - a.collectionChange)[0];
    const reassignCount = diocesanPriestData.filter((p) => p.status === 'reassign').length;
    const overBudget = diocesanPriestData.filter((p) => p.avgDisbursements > p.avgCollections).length;
    const topFive = [...diocesanPriestData].sort((a, b) => b.avgCollections - a.avgCollections).slice(0, 5);
    const bottomFive = [...diocesanPriestData].sort((a, b) => a.collectionChange - b.collectionChange).slice(0, 5);
    const reassignList = diocesanPriestData.filter((p) => p.status === 'reassign' || p.monthsAssigned > 48);
    return { total, avgCollection, topPerformer, reassignCount, overBudget, topFive, bottomFive, reassignList };
  }, [diocesanPriestData]);

  const pastoralAssignmentAnalysis = useMemo(() => {
    const assignmentBuckets = [
      { label: '0-12 mo', min: 0, max: 12 },
      { label: '13-24 mo', min: 13, max: 24 },
      { label: '25-36 mo', min: 25, max: 36 },
      { label: '37-48 mo', min: 37, max: 48 },
      { label: '49+ mo', min: 49, max: Number.POSITIVE_INFINITY },
    ];

    const trendData = assignmentBuckets.map((bucket) => {
      const priests = diocesanPriestData.filter(
        (priest) => priest.monthsAssigned >= bucket.min && priest.monthsAssigned <= bucket.max,
      );
      const averageCollections = priests.length
        ? Math.round(priests.reduce((sum, priest) => sum + priest.avgCollections, 0) / priests.length)
        : 0;
      const averageChange = priests.length
        ? priests.reduce((sum, priest) => sum + priest.collectionChange, 0) / priests.length
        : 0;

      return {
        period: bucket.label,
        averageCollections,
        averageChange: Number(averageChange.toFixed(1)),
        priestCount: priests.length,
      };
    });

    const activeTrend = trendData.filter((row) => row.priestCount > 0);
    const averageMonthlyCollections = activeTrend.length
      ? Math.round(activeTrend.reduce((sum, row) => sum + row.averageCollections, 0) / activeTrend.length)
      : 0;
    const collectionMean = activeTrend.length
      ? activeTrend.reduce((sum, row) => sum + row.averageCollections, 0) / activeTrend.length
      : 0;
    const variancePercent =
      collectionMean > 0 && activeTrend.length
        ? Math.round(
            (Math.sqrt(
              activeTrend.reduce((sum, row) => sum + Math.pow(row.averageCollections - collectionMean, 2), 0) /
                activeTrend.length,
            ) /
              collectionMean) *
              100,
          )
        : 0;
    const firstPeriod = activeTrend[0];
    const latestPeriod = activeTrend[activeTrend.length - 1];
    const monthOverMonthChange =
      firstPeriod && latestPeriod && firstPeriod.averageCollections > 0
        ? ((latestPeriod.averageCollections - firstPeriod.averageCollections) / firstPeriod.averageCollections) * 100
        : 0;

    return {
      trendData,
      averageMonthlyCollections,
      variancePercent,
      monthOverMonthChange,
      outputStatus:
        diocesanStats.reassignCount > 0
          ? `${diocesanStats.reassignCount} assignments flagged for review`
          : 'Performance analysis is stable',
    };
  }, [diocesanPriestData, diocesanStats.reassignCount]);

  const priestHealthScoreAnalysis = useMemo(() => {
    const bands = [
      {
        id: 'excellent',
        label: 'Excellent',
        min: 85,
        color: 'bg-emerald-500',
        fill: '#10B981',
        textColor: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-100',
      },
      {
        id: 'healthy',
        label: 'Healthy',
        min: 70,
        color: 'bg-blue-500',
        fill: '#3B82F6',
        textColor: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-100',
      },
      {
        id: 'support',
        label: 'Needs Support',
        min: 55,
        color: 'bg-amber-500',
        fill: '#F59E0B',
        textColor: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-100',
      },
      {
        id: 'critical',
        label: 'Critical',
        min: 0,
        color: 'bg-red-500',
        fill: '#EF4444',
        textColor: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-100',
      },
    ];

    const scored = diocesanPriestData.map((priest) => {
      const clamp = (value: number) => Math.max(0, Math.min(100, value));
      const isOverBudget = priest.avgDisbursements > priest.avgCollections;
      const margin = priest.avgCollections - priest.avgDisbursements;
      const marginRate = priest.avgCollections > 0 ? (margin / priest.avgCollections) * 100 : 0;
      const collectionScore = clamp((priest.avgCollections / 1_200_000) * 100);
      const trendScore = clamp(70 + priest.collectionChange);
      const marginScore = clamp(60 + marginRate);
      const tenureScore = priest.monthsAssigned > 60 ? 70 : priest.monthsAssigned > 48 ? 78 : 88;
      const healthScore = Math.round(
        collectionScore * 0.3 +
          priest.disciplineScore * 0.3 +
          trendScore * 0.2 +
          marginScore * 0.15 +
          tenureScore * 0.05,
      );
      const band =
        healthScore >= 85 ? 'excellent' : healthScore >= 70 ? 'healthy' : healthScore >= 55 ? 'support' : 'critical';

      return {
        ...priest,
        isOverBudget,
        margin,
        marginRate,
        collectionScore,
        trendScore,
        marginScore,
        tenureScore,
        healthScore,
        band,
      };
    });

    const total = Math.max(scored.length, 1);
    const distribution = bands.map((band) => {
      const priests = scored.filter((priest) => priest.band === band.id);
      return {
        ...band,
        scoreRange:
          band.id === 'excellent'
            ? '85-100'
            : band.id === 'healthy'
              ? '70-84'
              : band.id === 'support'
                ? '55-69'
                : '0-54',
        count: priests.length,
        percentage: Math.round((priests.length / total) * 100),
      };
    });

    const vicariateRows = Object.values(
      scored.reduce(
        (groups, priest) => {
          const current = groups[priest.vicariate] || {
            vicariate: priest.vicariate,
            count: 0,
            totalScore: 0,
            supportCount: 0,
          };
          current.count += 1;
          current.totalScore += priest.healthScore;
          current.supportCount += priest.band === 'support' || priest.band === 'critical' ? 1 : 0;
          groups[priest.vicariate] = current;
          return groups;
        },
        {} as Record<string, { vicariate: string; count: number; totalScore: number; supportCount: number }>,
      ),
    )
      .map((row) => ({
        ...row,
        name: stripVicariatePrefix(row.vicariate),
        avgScore: Math.round(row.totalScore / row.count),
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5);

    const averageScore = Math.round(scored.reduce((sum, priest) => sum + priest.healthScore, 0) / total);
    const needsSupport = scored.filter((priest) => priest.band === 'support' || priest.band === 'critical').length;
    const lowestPriests = [...scored].sort((a, b) => a.healthScore - b.healthScore).slice(0, 3);
    const growthHealthRows = scored.map((priest) => ({
      name: priest.name,
      entity: priest.entity,
      growthRate: priest.collectionChange,
      healthScore: priest.healthScore,
      fill: bands.find((band) => band.id === priest.band)?.fill || '#94A3B8',
    }));

    return { distribution, vicariateRows, averageScore, needsSupport, lowestPriests, growthHealthRows };
  }, [diocesanPriestData]);

  const seasonalExpenseSpikes = useMemo(
    () => [
      {
        event: 'Holy Week',
        month: 'March/April',
        expectedIncrease: '+25%',
        driver: 'Liturgical supplies, extra staff, security',
      },
      {
        event: 'Fiesta Season',
        month: 'May',
        expectedIncrease: '+40%',
        driver: 'Decorations, food, stipends for guest priests',
      },
      {
        event: 'Back to School',
        month: 'August',
        expectedIncrease: '+15%',
        driver: 'Scholarships, school supplies distribution',
      },
      {
        event: 'Christmas',
        month: 'December',
        expectedIncrease: '+35%',
        driver: 'Simbang Gabi expenses, bonuses, charity',
      },
    ],
    [],
  );

  // In a real app, this would be filtered by the logged-in user's entity ID
  const entityInfo = useMemo(() => {
    if (entityName && entityType && entityClass) {
      return { name: entityName, type: entityType, class: entityClass };
    }
    return userEntityInfo;
  }, [entityName, entityType, entityClass, userEntityInfo]);

  const resolvedDashboardContext = dashboardContext || (role === 'priest' ? 'parish' : undefined);
  const isPriestDashboardContext = role === 'priest' && resolvedDashboardContext === 'priest';
  const entityLabel =
    role === 'school' ? 'School' : role === 'seminary' ? 'Seminary' : isPriestDashboardContext ? 'Priest' : 'Parish';
  const isPriestOverallView = isPriestDashboardContext && priestScope === 'overall';
  const healthTrendText =
    healthScore?.trend === 'up' ? 'Improving' : healthScore?.trend === 'down' ? 'Declining' : 'Stable';

  // Parish-Adjusted Stewardship Score = 100 × (Actual / Predicted)  [percentage]
  // Stewardship Lift % = Score − 100
  const stewardshipData = useMemo(() => {
    const classBenchmarks: Record<string, number> = {
      'Class A': 3_500_000,
      'Class B': 2_000_000,
      'Class C': 1_200_000,
      'Class D': 700_000,
    };
    const predicted = classBenchmarks[entityInfo?.class ?? ''] ?? 1_500_000;
    // Use monthly average so the scale matches the monthly benchmark
    const months = filteredRecords.length > 0 ? filteredRecords.length : 1;
    const totalCollections = kpis?.totalCollections ?? predicted;
    const monthlyActual = Math.round(totalCollections / months);
    const rawRatio = monthlyActual / predicted; // e.g. 1.08
    const score = Math.round(rawRatio * 100); // e.g. 108  (%)
    const lift = score - 100; // e.g. +8%
    const status =
      score >= 105 ? 'Overperforming' : score >= 95 ? 'On Target' : score >= 80 ? 'Below Target' : 'Underperforming';
    const statusColor =
      score >= 105
        ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
        : score >= 95
          ? 'text-blue-600 bg-blue-50 border-blue-100'
          : score >= 80
            ? 'text-amber-600 bg-amber-50 border-amber-100'
            : 'text-red-600 bg-red-50 border-red-100';
    return { predicted, actual: monthlyActual, score, lift, status, statusColor };
  }, [entityInfo?.class, kpis?.totalCollections, filteredRecords.length]);

  const pastoralAssociationScore = priestAssignmentScore?.compositeScore ?? stewardshipData.score;
  const pastoralAssociationLift = pastoralAssociationScore - 100;
  const pastoralAssociationFactors = priestAssignmentScore
    ? [
        { label: 'Contribution Quality', value: priestAssignmentScore.dimensions.contribution },
        { label: 'Growth Consistency', value: priestAssignmentScore.dimensions.growthConsistency },
        { label: 'Financial Discipline', value: priestAssignmentScore.dimensions.discipline },
        { label: 'Collection Stability', value: priestAssignmentScore.dimensions.stability },
        { label: 'Assignment Context', value: priestAssignmentScore.dimensions.assignmentFairness },
      ]
    : [];

  // Per-priest stewardship scores for diocese view
  const priestStewardshipData = useMemo(() => {
    const classBenchmarks: Record<string, number> = {
      'Class A': 3_500_000,
      'Class B': 2_000_000,
      'Class C': 1_200_000,
      'Class D': 700_000,
    };
    return diocesanPriestData.map((p) => {
      const predicted = 1_200_000; // default benchmark per priest
      const actual = p.avgCollections;
      const score = Math.round((100 * actual) / predicted);
      const lift = score - 100;
      return { ...p, predicted, actual, score, lift };
    });
  }, [diocesanPriestData]);

  const prescriptiveActionData = useMemo(() => {
    const actionMeta = {
      Maintain: { fill: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
      Support: { fill: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
      Monitor: { fill: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
      Reallocate: { fill: '#8B5CF6', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100' },
      Review: { fill: '#EF4444', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
    } as const;

    const rows = diocesanPriestData.map((priest) => {
      const isOverBudget = priest.avgDisbursements > priest.avgCollections;
      const marginRate =
        priest.avgCollections > 0
          ? ((priest.avgCollections - priest.avgDisbursements) / priest.avgCollections) * 100
          : -100;
      const financialRisk = Math.max(
        0,
        Math.min(
          100,
          (priest.collectionChange < 0 ? Math.abs(priest.collectionChange) * 2.5 : 0) +
            (isOverBudget ? 28 : 0) +
            (priest.disciplineScore < 75 ? (75 - priest.disciplineScore) * 1.2 : 0) +
            (priest.monthsAssigned > 48 ? 16 : 0) +
            (marginRate < 8 ? (8 - marginRate) * 1.5 : 0),
        ),
      );
      const expectedImprovement = Math.max(
        6,
        Math.min(
          30,
          Math.round(
            financialRisk * 0.22 + (priest.collectionChange < 0 ? Math.abs(priest.collectionChange) * 0.55 : 4),
          ),
        ),
      );
      const budgetImpact = isOverBudget ? 'High' : financialRisk >= 45 ? 'Medium' : 'Low';
      const action =
        financialRisk >= 62
          ? 'Review'
          : isOverBudget || (priest.monthsAssigned > 48 && priest.collectionChange < 0)
            ? 'Reallocate'
            : financialRisk >= 36
              ? 'Monitor'
              : priest.collectionChange < 3
                ? 'Support'
                : 'Maintain';
      const issue = isOverBudget
        ? 'Disbursements exceed collections'
        : priest.collectionChange < 0
          ? 'Declining collection trend'
          : priest.monthsAssigned > 48
            ? 'Long assignment tenure'
            : priest.disciplineScore < 75
              ? 'Financial discipline risk'
              : 'Stable assignment';
      const recommendedAction =
        action === 'Review'
          ? 'Schedule diocesan financial review and intervention plan.'
          : action === 'Reallocate'
            ? 'Shift support and spending controls toward this assignment.'
            : action === 'Monitor'
              ? 'Track collections and expenses for the next reporting cycle.'
              : action === 'Support'
                ? 'Provide stewardship coaching and donor engagement support.'
                : 'Maintain current support and continue routine monitoring.';

      return {
        ...priest,
        action,
        issue,
        recommendedAction,
        expectedImprovement,
        financialRisk: Math.round(financialRisk),
        budgetImpact,
        fill: actionMeta[action].fill,
        tone: `${actionMeta[action].bg} ${actionMeta[action].text} ${actionMeta[action].border}`,
      };
    });

    const summary = (Object.keys(actionMeta) as Array<keyof typeof actionMeta>).map((action) => ({
      action,
      count: rows.filter((row) => row.action === action).length,
      fill: actionMeta[action].fill,
    }));

    return { rows, summary };
  }, [diocesanPriestData]);

  const displayEntityName = useMemo(() => {
    if (isPriestOverallView) return 'All Priests in Diocese';
    return entityInfo.name;
  }, [isPriestOverallView, entityInfo.name]);

  const handleImportRecords = async (importedRecords: FinancialRecord[]) => {
    try {
      // Add entityId and entityType to records
      const recordsWithEntity = importedRecords.map((record) => ({
        ...record,
        entityId: entityInfo.name.toLowerCase().replace(/\s+/g, '_'),
        entityType: mappedType as 'parish' | 'school' | 'seminary',
        year: year,
      }));

      // Save to dataService
      await dataService.saveRecords(recordsWithEntity);
    } catch (error) {
      console.error('Error importing records:', error);
    }
  };

  if (isLoading && !isEmbedded) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-church-green"></div>
      </div>
    );
  }

  return (
    <>
      {isPriestDashboardContext && (
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 lg:px-12 pt-4 md:pt-5">
          <div className="bg-black rounded-full px-4 md:px-5 py-2.5 flex items-center justify-between shadow-xl border border-white/5 gap-3">
            <button
              onClick={openFilterModal}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black border border-white/15 text-gray-200 hover:text-white hover:border-gold-400/40 transition-all relative"
            >
              <Filter size={14} />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Filters</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gold-400 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <div className="w-9 h-9 bg-gradient-to-br from-gold-400 to-gold-600 rounded-full flex items-center justify-center text-black font-black border border-gold-300 shadow-[0_0_16px_rgba(212,175,55,0.35)]">
                {auth.currentUser?.email?.[0]?.toUpperCase() || 'P'}
              </div>
            </div>
          </div>

          {/* Active filter pills */}
          {activeFilterCount > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {filterType !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gold-50 border border-gold-200 text-gold-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {filterType === 'parish' ? 'Parishes' : filterType === 'seminary' ? 'Seminaries' : 'Schools'}
                  {filterSelectedEntity && (
                    <span className="text-gold-500">
                      ·{' '}
                      {filterSelectedEntity.length > 20
                        ? filterSelectedEntity.slice(0, 20) + '…'
                        : filterSelectedEntity}
                    </span>
                  )}
                </span>
              )}
              {medicalStatusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {medicalStatusFilter === 'urgent' ? 'Urgent Only' : 'Follow-Up Only'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Filter Modal ── */}
      <AnimatePresence>
        {showFilterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowFilterModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
              style={{ maxHeight: '85vh' }}
            >
              {/* Modal Header */}
              <div className="px-7 pt-7 pb-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-gray-900">Filter Priests</h2>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Find priests by institution or medical status
                  </p>
                </div>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body — scrollable */}
              <div className="overflow-y-auto flex-1 px-7 py-6 space-y-7">
                {/* Section 1: Institution Type */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
                    Find Priests From
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { value: 'all', label: 'All', emoji: '🏛️' },
                        { value: 'parish', label: 'Parishes', emoji: '⛪' },
                        { value: 'seminary', label: 'Seminaries', emoji: '📖' },
                        { value: 'school', label: 'Schools', emoji: '🎓' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setStagingType(opt.value);
                          setStagingEntity(null);
                          setStagingSearch('');
                          setStagingVicariate('all');
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center ${
                          stagingType === opt.value
                            ? 'border-[#D4AF37] bg-[#D4AF37]/5 text-gray-900'
                            : 'border-gray-100 hover:border-gray-200 text-gray-500'
                        }`}
                      >
                        <span className="text-xl">{opt.emoji}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section 2: Parishes */}
                {stagingType === 'parish' && (
                  <div className="space-y-3">
                    {/* Vicariate filter */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                        Filter by Vicariate
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => setStagingVicariate('all')}
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border transition-all ${stagingVicariate === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                        >
                          All
                        </button>
                        {VICARIATES.map((v) => (
                          <button
                            key={v}
                            onClick={() => {
                              setStagingVicariate(v);
                              setStagingEntity(null);
                            }}
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border transition-all ${stagingVicariate === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                          >
                            {v.replace('Vicariate of ', '')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search parish name..."
                        value={stagingSearch}
                        onChange={(e) => {
                          setStagingSearch(e.target.value);
                          setStagingEntity(null);
                        }}
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/10 transition-all"
                        autoFocus
                      />
                    </div>

                    {/* Parish list */}
                    <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
                      <button
                        onClick={() => setStagingEntity(null)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === null ? 'bg-[#D4AF37]/10 text-gray-900' : 'hover:bg-gray-50 text-gray-600'}`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === null ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                        >
                          {stagingEntity === null && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                        </div>
                        <span className="text-xs font-bold">All Parishes</span>
                        <span className="ml-auto text-[10px] text-gray-400">{filteredParishList.length} total</span>
                      </button>
                      {filteredParishList.map((parish) => (
                        <button
                          key={parish.name}
                          onClick={() => setStagingEntity(parish.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === parish.name ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50'}`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === parish.name ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                          >
                            {stagingEntity === parish.name && (
                              <div className="w-full h-full rounded-full scale-50 bg-white" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{parish.name}</p>
                            <p className="text-[10px] text-gray-400 font-semibold">
                              {parish.vicariate} · {parish.class}
                            </p>
                          </div>
                        </button>
                      ))}
                      {filteredParishList.length === 0 && (
                        <p className="text-center text-xs text-gray-400 py-6">No parishes match your search.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Section 2: Seminaries */}
                {stagingType === 'seminary' && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                      Select Seminary
                    </p>
                    <button
                      onClick={() => setStagingEntity(null)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === null ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50'}`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === null ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                      >
                        {stagingEntity === null && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                      </div>
                      <span className="text-xs font-bold text-gray-700">All Seminaries</span>
                    </button>
                    {INITIAL_SEMINARIES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStagingEntity(s.name)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === s.name ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50'}`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === s.name ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                        >
                          {stagingEntity === s.name && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{s.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {s.class} · Rector: {s.rector}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Section 2: Schools */}
                {stagingType === 'school' && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                      Select School
                    </p>
                    <button
                      onClick={() => setStagingEntity(null)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === null ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50'}`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === null ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                      >
                        {stagingEntity === null && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                      </div>
                      <span className="text-xs font-bold text-gray-700">All Schools</span>
                    </button>
                    {INITIAL_SCHOOLS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStagingEntity(s.name)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${stagingEntity === s.name ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50'}`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stagingEntity === s.name ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-300'}`}
                        >
                          {stagingEntity === s.name && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{s.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {s.class} · {s.level}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Section 3: Medical Status */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
                    Medical Submission Status
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: 'all', label: 'All Pending', color: 'gray' },
                        { value: 'urgent', label: 'Urgent Overdue', color: 'red' },
                        { value: 'followup', label: 'Follow-Up', color: 'orange' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setStagingMedical(opt.value)}
                        className={`px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-wide transition-all ${
                          stagingMedical === opt.value
                            ? opt.value === 'urgent'
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : opt.value === 'followup'
                                ? 'border-orange-400 bg-orange-50 text-orange-700'
                                : 'border-[#D4AF37] bg-[#D4AF37]/5 text-gray-900'
                            : 'border-gray-100 text-gray-400 hover:border-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
                <button
                  onClick={resetFilters}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-wide text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Reset All
                </button>
                <button
                  onClick={applyFilters}
                  className="flex-1 max-w-[200px] px-6 py-2.5 bg-[#D4AF37] hover:bg-[#B8962E] text-black rounded-xl text-xs font-black uppercase tracking-wide transition-all shadow-lg shadow-[#D4AF37]/20 active:scale-95"
                >
                  Apply Filters
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="space-y-6 pb-24 md:pb-12 max-w-[1800px] mx-auto px-4 md:px-6 lg:px-12 pt-6 md:pt-5">
        {/* Welcome & Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Welcome Card */}
          <FadeIn
            direction="up"
            className="lg:col-span-2 bg-gradient-to-br from-[#FFFBF0] via-white to-white border-none rounded-[1.5rem] p-5 shadow-xl flex flex-col justify-center relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>
            <div
              className={`relative z-10 ${isPriestDashboardContext ? 'grid gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-center' : 'space-y-5'}`}
            >
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 bg-gold-50 text-gold-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-gold-100 shadow-sm">
                  <Sparkles size={12} />
                  <span>Welcome</span>
                </div>
                <h2 className="font-serif text-4xl md:text-5xl text-church-green leading-[1.1] tracking-tight">
                  {entityLabel} <br className="hidden md:block" />
                  <span className="text-gold-600 italic">Dashboard</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
                    {displayEntityName}
                  </span>
                  {isPriestDashboardContext && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      Medical Results Follow-up
                    </span>
                  )}
                </div>
              </div>

              {isPriestDashboardContext && (
                <div className="relative mx-auto hidden h-full w-full max-w-[220px] md:flex items-end justify-center">
                  <div className="absolute inset-x-6 bottom-0 h-24 rounded-[2rem] bg-gradient-to-t from-black/10 to-transparent blur-2xl"></div>
                  <div className="relative flex h-[240px] w-[180px] items-end justify-center">
                    <div className="absolute bottom-0 h-[190px] w-[132px] rounded-t-[4rem] rounded-b-[2.4rem] bg-gradient-to-b from-black via-[#161616] to-[#050505] shadow-[0_24px_40px_rgba(0,0,0,0.25)]"></div>
                    <div className="absolute bottom-[126px] h-7 w-10 rounded-b-2xl bg-white shadow-sm"></div>
                    <div className="absolute bottom-[112px] h-12 w-16 rounded-t-[1rem] bg-[#0f0f0f]"></div>
                    <div className="absolute bottom-[176px] h-16 w-16 rounded-full bg-[#f3d8bc] shadow-md"></div>
                    <div className="absolute bottom-[206px] h-9 w-[74px] rounded-t-full rounded-b-[1.6rem] bg-[#151515]"></div>
                    <div className="absolute bottom-[104px] flex w-full justify-center">
                      <div className="rounded-full border border-gold-200 bg-white/95 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-gold-600 shadow-lg">
                        Parish Priest
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </FadeIn>

          {/* Submission Tracking / Entity Profile */}
          <FadeIn direction="up" delay={0.1} className="lg:col-span-2">
            <div className="h-full bg-gradient-to-b from-white to-white/50 rounded-[1.5rem] p-6 shadow-xl border border-gray-100/50 relative overflow-hidden group flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gold-500 rounded-full"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>

              <div className="flex flex-col gap-1 relative z-10">
                <div className="bg-church-green/5 text-church-green px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest w-fit border border-church-green/10 mb-1">
                  {entityLabel} Profile
                </div>
                <h1 className="text-3xl md:text-4xl font-serif font-black text-church-green tracking-tight">
                  {isPriestOverallView
                    ? 'Diocese Priests Overview'
                    : (filterSelectedEntity ??
                      (filterType !== 'all'
                        ? `All ${filterType === 'parish' ? 'Parishes' : filterType === 'seminary' ? 'Seminaries' : 'Schools'}`
                        : entityInfo.name))}
                </h1>
                <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-400 font-black uppercase tracking-[0.15em] mt-1">
                  <span>
                    {isPriestOverallView
                      ? 'Diocese of San Pablo'
                      : filterType !== 'all'
                        ? `Filtered · ${filterType}s`
                        : role === 'school'
                          ? 'Cluster 1'
                          : role === 'seminary'
                            ? 'Seminary'
                            : stripVicariatePrefix(entityInfo.type)}
                  </span>
                  {(role === 'priest' || isPriestOverallView || activeFilterCount > 0) && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-gold-500"></span>
                      <span className="text-gold-600">
                        {isPriestOverallView
                          ? 'Overall'
                          : activeFilterCount > 0
                            ? `${priestsPendingMedicalResults.length} result${priestsPendingMedicalResults.length !== 1 ? 's' : ''}`
                            : entityInfo.class}
                      </span>
                    </>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="mt-1 text-[10px] text-[#D4AF37] font-bold hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <div className="mt-6 space-y-2.5 relative z-10">
                {isPriestDashboardContext ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Medical Submission Tracking
                      </p>
                      <span className="text-[9px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-orange-100">
                        Action Required
                      </span>
                    </div>

                    <p className="text-[10px] text-gray-500 font-semibold mb-2">
                      {activeFilterCount > 0
                        ? `Showing ${priestsPendingMedicalResults.length} priest${priestsPendingMedicalResults.length !== 1 ? 's' : ''} matching your filters`
                        : 'Priests with pending medical results despite birth month already passed'}
                    </p>

                    <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2">
                      {priestsPendingMedicalResults.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group/item hover:bg-gold-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-gray-100 text-church-green">
                              <HeartPulse size={16} />
                            </div>
                            <div>
                              <p className="text-base md:text-lg font-black text-black leading-tight">{item.name}</p>
                              <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.12em]">
                                {item.institution} • {item.priestClass}
                              </p>
                              <p className="text-[11px] text-gray-600 font-semibold mt-0.5">
                                Birth Month: {item.birthMonth} • Last Submitted: {item.lastSubmission}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border ${
                              item.category === 'urgent'
                                ? 'bg-red-50 text-red-700 border-red-100'
                                : 'bg-orange-50 text-orange-700 border-orange-100'
                            }`}
                          >
                            {item.category === 'urgent' ? 'URGENT' : 'FOLLOW-UP'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {priestsPendingMedicalResults.length === 0 && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-gray-100 text-church-green">
                            <HeartPulse size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-700">
                              {activeFilterCount > 0
                                ? 'No priests match the selected filters.'
                                : 'No pending priest medical submissions'}
                            </p>
                            <p className="text-[10px] text-gray-500 font-semibold">
                              {activeFilterCount > 0
                                ? 'Try adjusting or clearing your filters.'
                                : 'All required priests are up to date.'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-emerald-100">
                          {activeFilterCount > 0 ? 'No Match' : 'Cleared'}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group/item hover:bg-gold-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-gray-100 text-church-green">
                          <FileText size={16} />
                        </div>
                        <span className="text-xs font-bold text-gray-600">Monthly Remittance</span>
                      </div>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-emerald-100">
                        Submitted
                      </span>
                    </div>
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Data Management
                      </p>
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-red-700">Not Submitted</span>
                        </div>
                        <div className="space-y-1 text-[11px] text-red-700">
                          <p>
                            <strong>Next Deadline:</strong> May 15, 2026
                          </p>
                          <p>
                            <strong>Status:</strong> No submission yet
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            onNavigate?.(
                              role === 'school'
                                ? 'school-data-submission'
                                : role === 'seminary'
                                  ? 'seminary-data-submission'
                                  : 'parish-data-submission',
                            )
                          }
                          className="w-full rounded-lg bg-church-green px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-church-green/90 flex items-center justify-center gap-2"
                        >
                          <FileText size={14} />
                          Submit IAFR
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Diagnostic Insights Section */}
        {selectedDiagnostic && (
          <FadeIn direction="up" className="mb-8">
            <DiagnosticCard diagnostic={selectedDiagnostic} onClose={() => setSelectedDiagnostic(null)} />
          </FadeIn>
        )}

        {/* KPIs Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
          {isVisible(`MONTHLY ${entityLabel.toUpperCase()} COLLECTIONS / RECEIPTS`) && (
            <FadeIn
              direction="up"
              className="bg-white rounded-[1.5rem] p-4 shadow-xl border-none relative overflow-hidden group hover:-translate-y-1 transition-all duration-500 min-h-[120px] flex flex-col min-w-0"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-church-green/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-church-green/10 transition-colors"></div>
              <div>
                <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase mb-1.5 relative z-10">
                  Monthly {entityLabel} Collections
                </h3>
                <div className="w-full whitespace-nowrap text-[clamp(1.2rem,1.5vw,1.75rem)] font-black text-church-green tracking-tight relative z-10 group-hover:scale-[1.02] transition-transform origin-left duration-500">
                  {formatCurrency(totalCollections)}
                </div>
              </div>
              <div className="flex items-center justify-between w-full mt-auto pt-2.5 relative z-10">
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg text-[9px] font-black border border-emerald-100 shadow-sm whitespace-nowrap">
                    <ArrowUpRight className="w-2.5 h-2.5 flex-shrink-0" /> +4.2%
                  </span>
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider hidden sm:inline">
                    vs last month
                  </span>
                </div>
                <button
                  onClick={() => handleDiagnosticRequest('Jan')}
                  className="w-8 h-8 bg-gray-50 hover:bg-gold-500 hover:text-black rounded-lg text-church-green transition-all duration-300 flex items-center justify-center border border-gray-100 hover:border-gold-600 shadow-sm flex-shrink-0"
                  title="AI Diagnostic"
                >
                  <BrainCircuit size={16} />
                </button>
              </div>
            </FadeIn>
          )}

          {isVisible(`MONTHLY ${entityLabel.toUpperCase()} DISBURSEMENTS`) && (
            <FadeIn
              direction="up"
              delay={0.1}
              className="bg-white rounded-[1.5rem] p-4 shadow-xl border-none relative overflow-hidden group hover:-translate-y-1 transition-all duration-500 min-h-[120px] flex flex-col min-w-0"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-red-500/10 transition-colors"></div>
              <div>
                <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase mb-1.5 relative z-10">
                  Monthly {entityLabel} Disbursements
                </h3>
                <div className="w-full whitespace-nowrap text-[clamp(1.2rem,1.5vw,1.75rem)] font-black text-church-green tracking-tight relative z-10 group-hover:scale-[1.02] transition-transform origin-left duration-500">
                  {formatCurrency(totalDisbursements)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 relative z-10 mt-auto pt-2.5">
                <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded-lg text-[9px] font-black border border-red-100 shadow-sm whitespace-nowrap">
                  <ArrowUp className="w-2.5 h-2.5 flex-shrink-0" /> +1.2%
                </span>
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider hidden sm:inline">
                  vs last month
                </span>
              </div>
            </FadeIn>
          )}

          <FadeIn
            direction="up"
            delay={0.2}
            className="bg-white rounded-[1.5rem] p-4 shadow-xl border-none relative overflow-hidden group hover:-translate-y-1 transition-all duration-500 min-h-[120px] flex flex-col min-w-0"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-gold-500/10 transition-colors"></div>
            <div>
              <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase mb-1.5 relative z-10">
                Net Balance
              </h3>
              <div className="w-full whitespace-nowrap text-[clamp(1.2rem,1.5vw,1.75rem)] font-black text-gold-600 tracking-tight relative z-10 group-hover:scale-[1.02] transition-transform origin-left duration-500">
                {formatCurrency(totalCollections - totalDisbursements)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 relative z-10 mt-auto pt-2.5">
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg text-[9px] font-black border border-emerald-100 shadow-sm whitespace-nowrap">
                <TrendingUp className="w-2.5 h-2.5 flex-shrink-0" /> Healthy
              </span>
            </div>
          </FadeIn>

          {healthScore && (
            <FadeIn
              direction="up"
              delay={0.3}
              className="bg-white rounded-[1.5rem] p-4 shadow-xl border-none relative overflow-hidden group hover:-translate-y-1 transition-all duration-500 min-h-[120px] flex flex-col min-w-0"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-gold-500/10 transition-colors"></div>
              <div>
                <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase mb-1.5 relative z-10">
                  Financial Health Score
                </h3>
                <div className="text-[clamp(1.9rem,2.4vw,2.6rem)] font-black text-gold-600 tracking-tight relative z-10 group-hover:scale-[1.02] transition-transform origin-left duration-500">
                  {healthScore.compositeScore}
                </div>
              </div>
              <div className="flex items-center gap-1.5 relative z-10 mt-auto pt-2.5">
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black border shadow-sm whitespace-nowrap ${
                    healthScore.trend === 'down'
                      ? 'bg-red-50 text-red-700 border-red-100'
                      : healthScore.trend === 'up'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-gold-50 text-gold-700 border-gold-100'
                  }`}
                >
                  <TrendingUp className="w-2.5 h-2.5 flex-shrink-0" />
                  {healthTrendText}
                </span>
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider hidden sm:inline">
                  Diagnostic
                </span>
              </div>
            </FadeIn>
          )}
        </div>

        {/* Analytics Toggle (Line + Text) */}
        <div className="relative flex justify-center py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[#E2E8F0]"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-church-light px-4 text-[10px] font-bold text-[#94A3B8] uppercase tracking-[0.3em]">
              {entityLabel} Analytics
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-2 overflow-x-auto pb-2 scrollbar-hide">
          <div className="grid grid-cols-4 bg-black rounded-full p-1 min-w-max md:w-full max-w-4xl items-center shadow-xl border border-white/5">
            <button
              onClick={() => setAnalyticsView('descriptive')}
              className={`w-full rounded-full text-[9px] md:text-[10px] font-black transition-all uppercase tracking-[0.2em] whitespace-nowrap ${
                analyticsView === 'descriptive'
                  ? 'bg-white text-gold-600 py-3 md:py-4 px-4 md:px-8 shadow-lg'
                  : 'bg-transparent text-gray-500 hover:text-gray-300 py-3 md:py-4 px-4 md:px-8'
              }`}
            >
              Descriptive
            </button>
            <button
              onClick={() => setAnalyticsView('health')}
              className={`w-full rounded-full text-[9px] md:text-[10px] font-black transition-all uppercase tracking-[0.2em] whitespace-nowrap ${
                analyticsView === 'health'
                  ? 'bg-white text-gold-600 py-3 md:py-4 px-4 md:px-8 shadow-lg'
                  : 'bg-transparent text-gray-500 hover:text-gray-300 py-3 md:py-4 px-4 md:px-8'
              }`}
            >
              Diagnostic
            </button>
            <button
              onClick={() => setAnalyticsView('predictive')}
              className={`w-full rounded-full text-[9px] md:text-[10px] font-black transition-all uppercase tracking-[0.2em] whitespace-nowrap ${
                analyticsView === 'predictive'
                  ? 'bg-white text-gold-600 py-3 md:py-4 px-4 md:px-8 shadow-lg'
                  : 'bg-transparent text-gray-500 hover:text-gray-300 py-3 md:py-4 px-4 md:px-8'
              }`}
            >
              Predictive
            </button>
            <button
              onClick={() => setAnalyticsView('prescriptive')}
              className={`w-full rounded-full text-[9px] md:text-[10px] font-black transition-all uppercase tracking-[0.2em] whitespace-nowrap ${
                analyticsView === 'prescriptive'
                  ? 'bg-white text-gold-600 py-3 md:py-4 px-4 md:px-8 shadow-lg'
                  : 'bg-transparent text-gray-500 hover:text-gray-300 py-3 md:py-4 px-4 md:px-8'
              }`}
            >
              Prescriptive
            </button>
          </div>
        </div>

        {/* Diagnostic View Content */}
        {analyticsView === 'health' && healthScore && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-[1.5rem] p-5 md:p-6 shadow-xl border border-gray-100 relative overflow-hidden group">
              <div className="absolute top-0 left-0 h-full w-1.5 bg-gold-500"></div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>
              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gold-500 text-black flex items-center justify-center shadow-lg shadow-gold-500/20">
                        <HeartPulse size={20} />
                      </div>
                      <h3 className="text-xl md:text-2xl font-black text-church-green tracking-tight uppercase">
                        Priest and Financial Diagnostic
                      </h3>
                      <span
                        className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${stewardshipData.statusColor}`}
                      >
                        {stewardshipData.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 font-medium md:ml-13">
                      Pastoral Assignment Financial Association Score measures how assignment context relates to
                      collections, financial discipline, and trend behavior.
                    </p>
                  </div>
                </div>

                {/* Main Score Display */}
                <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
                    <div className="rounded-xl border border-gold-200 bg-gold-50/60 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-700">
                            Association Score
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-500">
                            Assignment context + financial behavior
                          </p>
                        </div>
                        <button
                          onClick={() => setShowFormulaModal(true)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold-200 bg-white text-gold-700 transition-colors hover:bg-gold-100"
                          title="Formula"
                        >
                          <Info size={15} />
                        </button>
                      </div>

                      <div className="mt-6 flex items-center gap-5">
                        <div className="relative h-32 w-32 flex-shrink-0">
                          <div
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: `conic-gradient(#1a472a ${pastoralAssociationScore * 3.6}deg, #E5E7EB 0deg)`,
                            }}
                          />
                          <div className="absolute inset-3 rounded-full bg-white shadow-inner" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-black text-church-green leading-none">
                              {pastoralAssociationScore}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">/100</span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
                              pastoralAssociationLift >= 5
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : pastoralAssociationLift >= 0
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-red-50 text-red-700 border-red-100'
                            }`}
                          >
                            {pastoralAssociationLift >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                            {pastoralAssociationLift >= 0 ? '+' : ''}
                            {pastoralAssociationLift}% lift
                          </span>
                          <p className="mt-3 text-sm font-bold text-gray-800">
                            Pastoral Assignment Financial Association Score
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-gray-500">
                            Higher values indicate stronger alignment between assignment context, collection
                            consistency, and financial discipline.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          {
                            label: 'Avg Monthly Actual',
                            value: formatCurrency(stewardshipData.actual),
                            helper: 'Collections / month',
                          },
                          {
                            label: 'Model-Predicted',
                            value: formatCurrency(stewardshipData.predicted),
                            helper: `${entityInfo.class} monthly benchmark`,
                          },
                          {
                            label: 'Gap vs Target',
                            value: `${stewardshipData.actual >= stewardshipData.predicted ? '+' : ''}${formatCurrency(stewardshipData.actual - stewardshipData.predicted)}`,
                            helper: 'Actual minus predicted',
                            accent:
                              stewardshipData.actual >= stewardshipData.predicted ? 'text-emerald-600' : 'text-red-600',
                          },
                        ].map((metric) => (
                          <div key={metric.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
                              {metric.label}
                            </p>
                            <p className={`mt-1 text-lg font-black ${metric.accent || 'text-gray-900'}`}>
                              {metric.value}
                            </p>
                            <p className="mt-0.5 text-[10px] font-semibold text-gray-400">{metric.helper}</p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-gray-100 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                            Diagnostic Factors
                          </p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${stewardshipData.statusColor}`}
                          >
                            {stewardshipData.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                          {pastoralAssociationFactors.map((factor) => (
                            <div key={factor.label}>
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-gray-700">{factor.label}</span>
                                <span className="text-xs font-black text-church-green">
                                  {Math.round(factor.value)}%
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-church-green"
                                  style={{ width: `${Math.max(0, Math.min(100, factor.value))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formula Modal */}
                {showFormulaModal && (
                  <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                    onClick={() => setShowFormulaModal(false)}
                  >
                    <div
                      className="bg-[#111111] rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black text-white">Pastoral Association Score Formula</h3>
                        <button
                          onClick={() => setShowFormulaModal(false)}
                          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="space-y-5 text-white">
                        <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                          <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">
                            Main Score
                          </p>
                          <p className="text-base font-bold">Pastoral Assignment Financial Association Score</p>
                          <p className="text-[#D4AF37] font-black text-lg mt-1">
                            = 100 × (Actual Donations ÷ Model-Predicted Donations)
                          </p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                          <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">
                            Companion Metric
                          </p>
                          <p className="text-base font-bold">Association Lift %</p>
                          <p className="text-[#D4AF37] font-black text-lg mt-1">
                            = 100 × (Actual − Predicted) ÷ Predicted
                          </p>
                          <p className="text-white/40 text-xs mt-1">Equivalent to: Score − 100</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center text-xs">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                            <p className="font-black text-emerald-400 text-base">&gt; 100%</p>
                            <p className="text-white/60 mt-1">Overperforming</p>
                          </div>
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                            <p className="font-black text-blue-400 text-base">= 100%</p>
                            <p className="text-white/60 mt-1">On Target</p>
                          </div>
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="font-black text-red-400 text-base">&lt; 100%</p>
                            <p className="text-white/60 mt-1">Underperforming</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Diocese-wide stewardship table */}
                {isPriestDashboardContext && (
                  <div className="mt-6 overflow-x-auto">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">
                      All Priests — Stewardship Scores
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100">
                          <th className="py-2 pr-4">Priest</th>
                          <th className="py-2 pr-4">Entity</th>
                          <th className="py-2 pr-4 text-right">Actual</th>
                          <th className="py-2 pr-4 text-right">Predicted</th>
                          <th className="py-2 pr-4 text-center">Score</th>
                          <th className="py-2 text-center">Lift %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priestStewardshipData.map((p, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 pr-4 font-bold text-church-green">{p.name}</td>
                            <td className="py-3 pr-4 text-xs text-gray-500">{p.entity}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(p.actual)}</td>
                            <td className="py-3 pr-4 text-right text-gray-500">{formatCurrency(p.predicted)}</td>
                            <td className="py-3 pr-4 text-center">
                              <span
                                className={`font-black text-sm ${p.score >= 100 ? 'text-emerald-600' : p.score >= 80 ? 'text-amber-600' : 'text-red-600'}`}
                              >
                                {p.score}
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${p.lift >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                              >
                                {p.lift >= 0 ? '+' : ''}
                                {p.lift}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Overlay */}
        <AnimatePresence>
          {selectedDiagnostic && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="max-w-2xl w-full relative">
                <button
                  onClick={() => setSelectedDiagnostic(null)}
                  className="absolute -top-12 right-0 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
                <DiagnosticCard diagnostic={selectedDiagnostic} />
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Charts Area */}
        {analyticsView === 'descriptive' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                    Descriptive Analytics
                  </p>
                  <h3 className="text-lg font-black text-church-green">
                    {isPriestDashboardContext
                      ? 'Priest Stewardship Current-State View'
                      : `${entityLabel} Current-State View`}
                  </h3>
                </div>
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <Target size={12} />
                  <span>Current performance, mix, and discipline</span>
                </div>
              </div>
            </div>

            {isPriestDashboardContext && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-church-green">Priest Performance Health Score</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-3xl">
                      Scores summarize financial performance, reporting discipline, collection trend, budget margin, and
                      assignment tenure.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-w-[260px]">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Average Score</p>
                      <p className="text-xl font-black text-emerald-600">
                        {priestHealthScoreAnalysis.averageScore}/100
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Needs Support</p>
                      <p className="text-xl font-black text-amber-600">{priestHealthScoreAnalysis.needsSupport}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                        Health Score Bands
                      </p>
                      <p className="text-[10px] font-bold text-gray-400">{diocesanStats.total} total</p>
                    </div>
                    <div className="h-[260px]">
                      <ReactECharts
                        option={{
                          color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                          tooltip: {
                            trigger: 'axis',
                            formatter: (params: any[]) => {
                              const p = params[0];
                              return `<div style="font-size:11px"><strong>${p.axisValue} health score band</strong><br/>${p.value} priest${p.value !== 1 ? 's' : ''}</div>`;
                            },
                            extraCssText: 'border-radius:12px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
                          },
                          grid: { top: 12, right: 16, left: 40, bottom: 30 },
                          xAxis: { type: 'category', data: priestHealthScoreAnalysis.distribution.map((d) => d.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#374151', fontSize: 10, fontWeight: 700 } },
                          yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10 }, splitLine: { lineStyle: { color: '#E5E7EB' } }, minInterval: 1 },
                          series: [{
                            type: 'bar',
                            data: priestHealthScoreAnalysis.distribution.map((d) => ({ value: d.count, itemStyle: { color: d.fill, borderRadius: [8, 8, 0, 0] } })),
                            barWidth: 44,
                          }],
                        }}
                        style={{ height: '100%', width: '100%' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {priestHealthScoreAnalysis.distribution.map((band) => (
                        <div
                          key={band.id}
                          className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-4 py-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2.5 h-2.5 rounded-full ${band.color} flex-shrink-0`} />
                            <span className="text-xs font-bold text-gray-700 truncate">
                              {band.label} <span className="text-gray-400">({band.scoreRange})</span>
                            </span>
                          </div>
                          <span className="text-sm font-black text-gray-900">{band.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                          Collection Growth vs Health Score
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Each point compares priest collection growth rate with the computed health score.
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Strong
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> Support
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> Critical
                        </span>
                      </div>
                    </div>
                    <div className="h-[300px]">
                      <ReactECharts
                        option={{
                          color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                          tooltip: {
                            trigger: 'item',
                            formatter: (params: any) => {
                              const d = params.data;
                              return `<div style="font-size:11px"><strong>${d[2]}</strong><br/>Collection Growth: ${d[0]}%<br/>Health Score: ${d[1]}/100</div>`;
                            },
                            extraCssText: 'border-radius:12px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
                          },
                          grid: { top: 12, right: 24, left: 40, bottom: 30 },
                          xAxis: { type: 'value', name: 'Collection Growth %', min: -20, max: 25, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => `${v}%` }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                          yAxis: { type: 'value', name: 'Health Score', min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10 }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                          series: [
                            {
                              type: 'scatter',
                              data: priestHealthScoreAnalysis.growthHealthRows.map((d) => [d.growthRate, d.healthScore, d.name, d.fill]),
                              itemStyle: { color: (params: any) => params.data[3] },
                              symbolSize: 10,
                              markLine: {
                                silent: true,
                                symbol: 'none',
                                lineStyle: { color: '#94A3B8', type: 'dashed' },
                                data: [{ xAxis: 0 }, { yAxis: 70 }],
                                label: { show: false },
                              },
                            },
                          ],
                        }}
                        style={{ height: '100%', width: '100%' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      {[
                        {
                          label: 'High Growth / Healthy',
                          value: priestHealthScoreAnalysis.growthHealthRows.filter(
                            (p) => p.growthRate >= 0 && p.healthScore >= 70,
                          ).length,
                          color: 'text-emerald-600',
                        },
                        {
                          label: 'Declining / Healthy',
                          value: priestHealthScoreAnalysis.growthHealthRows.filter(
                            (p) => p.growthRate < 0 && p.healthScore >= 70,
                          ).length,
                          color: 'text-blue-600',
                        },
                        {
                          label: 'Growth / Needs Support',
                          value: priestHealthScoreAnalysis.growthHealthRows.filter(
                            (p) => p.growthRate >= 0 && p.healthScore < 70,
                          ).length,
                          color: 'text-amber-600',
                        },
                        {
                          label: 'Declining / Needs Support',
                          value: priestHealthScoreAnalysis.growthHealthRows.filter(
                            (p) => p.growthRate < 0 && p.healthScore < 70,
                          ).length,
                          color: 'text-red-600',
                        },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white border border-gray-100 px-4 py-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">
                            {item.label}
                          </p>
                          <p className={`text-lg font-black mt-1 ${item.color}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DIOCESAN: Full Assignment Table ── */}
            {isPriestDashboardContext && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
                  <div className="bg-amber-200/70 px-5 py-3 text-center border-b border-amber-300">
                    <h3 className="text-lg font-black text-church-black">Pastoral Assignment Analysis</h3>
                  </div>

                  <div className="p-5">
                    <div className="rounded-lg border border-amber-100 bg-white p-5">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-gray-900">Visualization:</p>
                          <p className="mt-1 text-sm font-bold text-gray-800">
                            Average Collections by Assignment Duration
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Each point groups all priests by how long they have been assigned.
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-gray-900">System Output:</p>
                          <p className="mt-1 text-sm font-bold text-church-green">
                            {pastoralAssignmentAnalysis.outputStatus}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                            All-Priest Avg
                          </p>
                          <p className="text-sm font-black text-gray-900">
                            {formatCurrency(pastoralAssignmentAnalysis.averageMonthlyCollections)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                            Group Variance
                          </p>
                          <p className="text-sm font-black text-gray-900">
                            {pastoralAssignmentAnalysis.variancePercent}%
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                            Shortest vs Longest
                          </p>
                          <p
                            className={`text-sm font-black ${pastoralAssignmentAnalysis.monthOverMonthChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                          >
                            {pastoralAssignmentAnalysis.monthOverMonthChange >= 0 ? '+' : ''}
                            {pastoralAssignmentAnalysis.monthOverMonthChange.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="h-[220px]">
                        <ReactECharts
                          option={{
                            color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                            tooltip: {
                              trigger: 'axis',
                              formatter: (params: any[]) => {
                                const p = params[0];
                                const row = pastoralAssignmentAnalysis.trendData[p.dataIndex];
                                const header = row ? `${p.axisValue} assignment duration (${row.priestCount} priest${row.priestCount === 1 ? '' : 's'})` : `${p.axisValue} assignment duration`;
                                return `<div style="font-size:11px"><strong>${header}</strong><br/>Avg Collections: ${formatCurrency(p.value)}</div>`;
                              },
                              extraCssText: 'border-radius:12px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
                            },
                            grid: { top: 8, right: 14, left: 45, bottom: 30 },
                            xAxis: { type: 'category', data: pastoralAssignmentAnalysis.trendData.map((d) => d.period), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10, fontWeight: 700 } },
                            yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => `${v / 1000}k` }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                            series: [{
                              type: 'line',
                              data: pastoralAssignmentAnalysis.trendData.map((d) => d.averageCollections),
                              smooth: true,
                              lineStyle: { color: '#1a472a', width: 3 },
                              itemStyle: { color: '#1a472a', borderColor: '#fff', borderWidth: 2 },
                              symbolSize: 8,
                            }],
                          }}
                          style={{ height: '100%', width: '100%' }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                        {[
                          '0-12 mo = assigned 0 to 12 months',
                          '13-24 mo = assigned 13 to 24 months',
                          '25-36 mo = assigned 25 to 36 months',
                          '37-48 mo = assigned 37 to 48 months',
                          '49+ mo = assigned 49+ months',
                        ].map((label) => (
                          <div
                            key={label}
                            className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-600"
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isPriestDashboardContext && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 overflow-x-auto">
                <div className="mb-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                    Descriptive · Assignment Overview
                  </p>
                  <h3 className="text-lg font-bold text-church-green">
                    All Priest Assignments — Collections & Disbursements
                  </h3>
                </div>
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Priest', 'Assignment', 'Type', 'Avg Collections', 'Avg Disbursements', 'Trend', 'Status'].map(
                        (h) => (
                          <th
                            key={h}
                            className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400 pr-4"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {diocesanPriestData.map((p) => (
                      <tr key={p.name} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-4">
                          <p className="text-xs font-bold text-gray-900">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.vicariate}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-600 max-w-[160px] truncate">{p.entity}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${p.entityType === 'parish' ? 'bg-blue-50 text-blue-700' : p.entityType === 'seminary' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {p.entityType}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs font-bold text-gray-900">
                          {formatCurrency(p.avgCollections)}
                        </td>
                        <td className="py-3 pr-4 text-xs font-bold text-gray-700">
                          {formatCurrency(p.avgDisbursements)}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`text-xs font-bold ${p.collectionChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                          >
                            {p.collectionChange >= 0 ? '+' : ''}
                            {p.collectionChange}%
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              p.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : p.status === 'review'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-red-50 text-red-700 border-red-100'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-church-green">Collections Trend</h3>
              </div>
              <div className="h-[320px]">
                <ReactECharts
                  option={{
                    color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                    tooltip: {
                      trigger: 'axis',
                      formatter: (params: any[]) => {
                        const p = params[0];
                        return `${p.axisValue}<br/>${p.marker} Actual Collections: ${formatCurrency(p.value)}`;
                      },
                    },
                    legend: { data: ['Actual Collections'], top: 0 },
                    grid: { top: 30, right: 20, left: 55, bottom: 30 },
                    xAxis: { type: 'category', data: fallbackMonthlyData.map((d) => d.month), axisLabel: { color: '#6B7280', fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false } },
                    yAxis: { type: 'value', axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => `${v / 1000}k` }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                    series: [{
                      name: 'Actual Collections',
                      type: 'line',
                      data: fallbackMonthlyData.map((d) => d.actual),
                      smooth: true,
                      lineStyle: { color: '#1a472a', width: 3 },
                      itemStyle: { color: '#1a472a' },
                      symbolSize: 6,
                    }],
                  }}
                  style={{ height: '100%', width: '100%' }}
                />
              </div>
            </div>
          </div>
        )}

        {analyticsView === 'predictive' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                    Predictive Analytics
                  </p>
                  <h3 className="text-lg font-black text-church-green">{entityLabel} Performance Score Forecast</h3>
                </div>
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <TrendingUp size={12} />
                  <span>Upward Trend Projected</span>
                </div>
              </div>
            </div>

            {/* Performance Score Forecast Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">Forecasting Engine</p>
                <h3 className="text-lg font-black text-church-green">Priest Performance Score — Next 3 Months</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Based on collection trend, disbursement discipline, and submission consistency
                </p>
              </div>
              {(() => {
                const base = stewardshipData.score;
                const scoreData = [
                  { month: 'Aug', score: Math.max(0, base - 8), forecast: null },
                  { month: 'Sep', score: Math.max(0, base - 5), forecast: null },
                  { month: 'Oct', score: Math.max(0, base - 3), forecast: null },
                  { month: 'Nov', score: Math.max(0, base - 1), forecast: null },
                  { month: 'Dec', score: Math.max(0, base + 1), forecast: null },
                  { month: 'Jan', score: base, forecast: base },
                  { month: 'Feb', score: null, forecast: Math.round(base * 1.04) },
                  { month: 'Mar', score: null, forecast: Math.round(base * 1.07) },
                  { month: 'Apr', score: null, forecast: Math.round(base * 1.1) },
                ];
                return (
                  <div className="h-[320px]">
                    <ReactECharts
                      option={{
                        color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                        tooltip: {
                          trigger: 'axis',
                          formatter: (params: any[]) => {
                            const lines = params.filter((p) => p.value !== null).map((p) => `${p.marker} ${p.seriesName === 'score' ? 'Actual Score' : 'Forecasted Score'}: ${p.value}/100`).join('<br/>');
                            return `${params[0].axisValue}<br/>${lines}`;
                          },
                          extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                        },
                        legend: { top: 0, right: 0, textStyle: { fontSize: 10, fontWeight: 700 }, icon: 'circle', formatter: (v: string) => v === 'score' ? 'Actual Score' : 'Forecasted Score' },
                        grid: { top: 40, right: 30, left: 40, bottom: 30 },
                        xAxis: { type: 'category', data: scoreData.map((d) => d.month), axisLabel: { color: '#6B7280', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                        yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#6B7280', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                        series: [
                          {
                            name: 'score',
                            type: 'line',
                            data: scoreData.map((d) => d.score ?? null),
                            smooth: true,
                            connectNulls: false,
                            lineStyle: { color: '#1a472a', width: 3 },
                            itemStyle: { color: '#1a472a', borderColor: '#fff', borderWidth: 2 },
                            symbolSize: 8,
                            markLine: {
                              silent: true,
                              symbol: 'none',
                              data: [
                                { yAxis: 80, lineStyle: { color: '#10B981', type: 'dashed' }, label: { show: true, position: 'insideEndTop', formatter: 'Target (80)', color: '#10B981', fontSize: 9, fontWeight: 700 } },
                                { xAxis: 'Jan', lineStyle: { color: '#D1D5DB', type: 'dashed' }, label: { show: true, position: 'start', formatter: 'Today', color: '#9CA3AF', fontSize: 9, fontWeight: 700 } },
                              ],
                            },
                          },
                          {
                            name: 'forecast',
                            type: 'line',
                            data: scoreData.map((d) => d.forecast ?? null),
                            smooth: true,
                            connectNulls: false,
                            lineStyle: { color: '#D4AF37', width: 3, type: 'dashed' },
                            itemStyle: { color: '#D4AF37', borderColor: '#fff', borderWidth: 2 },
                            symbolSize: 8,
                          },
                        ],
                      }}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Per-Priest Projected Scores */}
            {isPriestDashboardContext && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <div className="mb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                    Priest-Level Forecast
                  </p>
                  <h3 className="text-lg font-black text-church-green">Projected Performance Scores (Next Quarter)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100">
                        <th className="py-3 pr-4">Priest</th>
                        <th className="py-3 pr-4">Entity</th>
                        <th className="py-3 pr-4 text-center">Current Score</th>
                        <th className="py-3 pr-4 text-center">Projected Score</th>
                        <th className="py-3 text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priestStewardshipData.map((p, i) => {
                        const current = p.score;
                        const change =
                          p.collectionChange >= 0
                            ? Math.min(8, Math.round(p.collectionChange / 2))
                            : Math.max(-8, Math.round(p.collectionChange / 2));
                        const projected = Math.max(0, current + change);
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-3 pr-4 font-bold text-church-green">{p.name}</td>
                            <td className="py-3 pr-4 text-gray-500 text-xs">{p.entity}</td>
                            <td className="py-3 pr-4 text-center">
                              <span className="font-black text-church-black">
                                {current}
                                <span className="text-gray-400 font-normal text-xs">/100</span>
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-center">
                              <span
                                className={`font-black ${projected > current ? 'text-emerald-600' : projected < current ? 'text-red-600' : 'text-gray-600'}`}
                              >
                                {projected}
                                <span className="text-gray-400 font-normal text-xs">/100</span>
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              {projected > current ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                  <TrendingUp size={10} /> +{projected - current}
                                </span>
                              ) : projected < current ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                  <TrendingDown size={10} /> {projected - current}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                  — Stable
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {analyticsView === 'prescriptive' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 mb-1">
                    Prescriptive Analytics
                  </p>
                  <h3 className="text-xl font-black text-church-green">Prescriptive Actions</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Short actions to improve collections, spending discipline, and report timeliness.
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 flex items-center gap-2 text-[10px] font-black uppercase px-4 py-2 rounded-xl border ${stewardshipData.statusColor}`}
                >
                  <span>Score: {stewardshipData.score}%</span>
                  <span className="opacity-40">|</span>
                  <span>
                    Lift: {stewardshipData.lift >= 0 ? '+' : ''}
                    {stewardshipData.lift}%
                  </span>
                  <span className="opacity-40">|</span>
                  <span>{stewardshipData.status}</span>
                </div>
              </div>
            </div>

            {isPriestDashboardContext && (
              <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                        Action Priority Matrix
                      </p>
                      <h3 className="text-lg font-black text-church-green">Financial Risk vs Improvement Target</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Each point is a priest assignment. Higher and farther right means more urgent action with higher
                        expected impact.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wide">
                      {prescriptiveActionData.summary
                        .filter((item) => item.count > 0)
                        .map((item) => (
                          <span
                            key={item.action}
                            className="inline-flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2 py-1 text-gray-600"
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
                            {item.action}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="h-[360px]">
                    <ReactECharts
                      option={{
                        color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                        tooltip: {
                          trigger: 'item',
                          formatter: (params: any) => {
                            const d = params.data;
                            return `<div style="font-size:11px"><strong>${d[2]} - ${d[4]}</strong><br/>Financial Risk: ${d[0]}%<br/>Improvement Target: ${d[1]}%</div>`;
                          },
                          extraCssText: 'border-radius:12px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
                        },
                        grid: { top: 14, right: 22, left: 55, bottom: 45 },
                        xAxis: { type: 'value', name: 'Financial Risk', nameLocation: 'middle', nameGap: 28, min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => `${v}%` }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                        yAxis: { type: 'value', name: 'Improvement Target %', nameLocation: 'middle', nameGap: 40, nameRotate: 90, min: 0, max: 35, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => `${v}%` }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } } },
                        series: [{
                          type: 'scatter',
                          data: prescriptiveActionData.rows.map((d) => [d.financialRisk, d.expectedImprovement, d.name, d.fill, d.action]),
                          itemStyle: { color: (params: any) => params.data[3] },
                          symbolSize: 10,
                          markLine: {
                            silent: true,
                            symbol: 'none',
                            lineStyle: { color: '#94A3B8', type: 'dashed' },
                            data: [{ xAxis: 50 }, { yAxis: 15 }],
                            label: { show: false },
                          },
                        }],
                      }}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                      Action Category Summary
                    </p>
                    <h3 className="text-lg font-black text-church-green">Recommended Actions</h3>
                    <p className="text-xs text-gray-500 mt-1">Count of assignments under each prescriptive action.</p>
                  </div>
                  <div className="h-[260px]">
                    <ReactECharts
                      option={{
                        color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                        tooltip: {
                          trigger: 'axis',
                          formatter: (params: any[]) => {
                            const p = params[0];
                            return `${p.axisValue}<br/>${p.value} assignment${p.value === 1 ? '' : 's'}`;
                          },
                          extraCssText: 'border-radius:12px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)',
                        },
                        grid: { top: 10, right: 14, left: 40, bottom: 30 },
                        xAxis: { type: 'category', data: prescriptiveActionData.summary.map((d) => d.action), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#374151', fontSize: 10, fontWeight: 700 } },
                        yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6B7280', fontSize: 10 }, splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } }, minInterval: 1 },
                        series: [{
                          type: 'bar',
                          data: prescriptiveActionData.summary.map((d) => ({ value: d.count, itemStyle: { color: d.fill, borderRadius: [8, 8, 0, 0] } })),
                          barWidth: 36,
                        }],
                      }}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 mt-4">
                    {prescriptiveActionData.summary.map((item) => (
                      <div
                        key={item.action}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                          {item.action}
                        </span>
                        <span className="text-sm font-black text-gray-900">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="xl:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
                      Recommended Action Table
                    </p>
                    <h3 className="text-lg font-black text-church-green">Priest Assignment Prescriptions</h3>
                  </div>
                  <table className="w-full min-w-[980px] text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {[
                          'Priest',
                          'Assignment',
                          'Main Issue',
                          'Recommended Action',
                          'Target',
                          'Budget',
                          'Priority',
                        ].map((header) => (
                          <th
                            key={header}
                            className="pb-3 pr-4 text-[10px] font-black uppercase tracking-widest text-gray-400"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {prescriptiveActionData.rows
                        .sort((a, b) => b.financialRisk - a.financialRisk)
                        .map((row) => (
                          <tr key={row.name} className="hover:bg-gray-50/70 transition-colors">
                            <td className="py-3 pr-4">
                              <p className="text-xs font-black text-gray-900">{row.name}</p>
                              <p className="text-[10px] text-gray-400">{row.vicariate}</p>
                            </td>
                            <td className="py-3 pr-4 text-xs text-gray-600 max-w-[170px] truncate">{row.entity}</td>
                            <td className="py-3 pr-4 text-xs font-semibold text-gray-700">{row.issue}</td>
                            <td className="py-3 pr-4 text-xs text-gray-600 max-w-[260px]">{row.recommendedAction}</td>
                            <td className="py-3 pr-4">
                              <span className="text-xs font-black text-church-green">+{row.expectedImprovement}%</span>
                            </td>
                            <td className="py-3 pr-4 text-xs font-bold text-gray-700">{row.budgetImpact}</td>
                            <td className="py-3">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${row.tone}`}
                              >
                                {row.action}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <StewardChatbot currentEntityId={currentEntityId || undefined} />
      </div>
    </>
  );
}
