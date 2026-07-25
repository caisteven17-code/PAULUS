'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Filter,
  ChevronDown,
  Bell,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  BrainCircuit,
  HeartPulse,
  Info,
  X,
  Search,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  Cpu,
  CheckCircle,
  FileText,
  Activity,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import ReactECharts from 'echarts-for-react';
import { ALL_PARISHES, APP_CONFIG, VICARIATES } from '../constants';
import dynamic from 'next/dynamic';
const GeospatialHeatMap = dynamic(
  () => import('../components/ui/GeospatialHeatMap').then((mod) => ({ default: mod.GeospatialHeatMap })),
  {
    ssr: false,
    loading: () => <InlineLoader label="Loading map" className="h-64 py-0" />,
  },
);
import { dataService } from '../services/dataService';
import { apiClient } from '../lib/api-client';
import { FinancialRecord, FinancialHealthScore, DiagnosticResult } from '../types';
import { auth } from '../firebase';
import { FinancialHealthGauge } from '../components/ui/FinancialHealthGauge';
import { HealthDimensionBar } from '../components/ui/HealthDimensionBar';
import { DiagnosticCard } from '../components/ui/DiagnosticCard';
import { StewardChatbot } from '../components/ui/StewardChatbot';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { ChartHelpToggle } from '../components/ui/ChartHelpToggle';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber } from '../lib/format';
import SeminaryAnalyticsDashboard from '../components/analytics/SeminaryAnalyticsDashboard';
import { DataImportExport } from '../components/projects/DataImportExport';
import { IAFRBreakdownReport } from '../components/financial/IAFRBreakdownReport';

const topTierParishesData = [
  { rank: 1, name: 'St. John Paul II Parish', location: 'SAN PABLO', class: 'Class A' },
  { rank: 2, name: 'St. James the Apostle Parish', location: 'SAN PABLO', class: 'Class C' },
  { rank: 3, name: 'Mary Help of Christians Parish', location: 'SAN PABLO', class: 'Class D' },
  { rank: 4, name: 'Chair of St. Peter Parish', location: 'SAN PABLO', class: 'Class A' },
  { rank: 5, name: 'St. John Bosco Parish', location: 'SAN PABLO', class: 'Class B' },
];

const contributionData = [
  { name: 'Holy Family', value: 12 },
  { name: 'San Isidro Labrador', value: 15 },
  { name: 'San Pedro Apostol', value: 10 },
  { name: 'Sta. Rosa De Lima', value: 8 },
  { name: 'St. Polycarp', value: 8 },
  { name: 'St. John the Baptist', value: 12 },
  { name: 'Immaculate Conception', value: 7 },
  { name: 'St. Paul the First Hermit', value: 9 },
  { name: 'San Bartolome', value: 6 },
  { name: 'San Antonio De Padua', value: 5 },
  { name: 'Our Lady of Guadalupe', value: 4 },
  { name: 'St. James', value: 3 },
  { name: 'Sts. Peter and Paul', value: 1 },
];
const CONTRIBUTION_COLORS = [
  '#1a472a',
  '#D4AF37',
  '#4ade80',
  '#E6C27A',
  '#3d6e36',
  '#B5952F',
  '#4e8245',
  '#8B7522',
  '#5f9654',
  '#70aa63',
  '#81be72',
  '#92d281',
];

// ─── Period Comparison constants ────────────────────────────────────────────
const CMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
// Static fallback for entity types on the mock data path (Seminaries/Diocesan
// Schools have no real per-institution pipeline, so DIOCESE_MONTHLY_BASE only
// needs a few representative years). Parishes have real AWS-backed history
// back to 2021 — see availableCmpYears below, which derives the real range
// from apiParishFinancialTrend instead of this fixed list.
const CMP_YEARS = ['2024', '2025', '2026'] as const;
type CmpMonth = (typeof CMP_MONTHS)[number];
type CmpYear = string;

const DIOCESE_MONTHLY_BASE: Record<string, { month: string; collections: number; disbursements: number }[]> = {
  Parishes: [
    { month: 'Jan', collections: 45_200_000, disbursements: 38_400_000 },
    { month: 'Feb', collections: 38_600_000, disbursements: 35_200_000 },
    { month: 'Mar', collections: 42_100_000, disbursements: 40_100_000 },
    { month: 'Apr', collections: 68_400_000, disbursements: 42_300_000 },
    { month: 'May', collections: 50_200_000, disbursements: 45_600_000 },
    { month: 'Jun', collections: 41_800_000, disbursements: 38_700_000 },
    { month: 'Jul', collections: 38_300_000, disbursements: 36_400_000 },
    { month: 'Aug', collections: 40_100_000, disbursements: 37_200_000 },
    { month: 'Sep', collections: 42_400_000, disbursements: 39_100_000 },
    { month: 'Oct', collections: 44_700_000, disbursements: 40_800_000 },
    { month: 'Nov', collections: 47_300_000, disbursements: 44_200_000 },
    { month: 'Dec', collections: 88_600_000, disbursements: 52_100_000 },
  ],
  Seminaries: [
    { month: 'Jan', collections: 980_000, disbursements: 1_120_000 },
    { month: 'Feb', collections: 870_000, disbursements: 1_050_000 },
    { month: 'Mar', collections: 920_000, disbursements: 1_200_000 },
    { month: 'Apr', collections: 1_050_000, disbursements: 1_300_000 },
    { month: 'May', collections: 890_000, disbursements: 1_450_000 },
    { month: 'Jun', collections: 3_200_000, disbursements: 1_600_000 },
    { month: 'Jul', collections: 1_100_000, disbursements: 1_080_000 },
    { month: 'Aug', collections: 1_050_000, disbursements: 1_060_000 },
    { month: 'Sep', collections: 1_020_000, disbursements: 1_090_000 },
    { month: 'Oct', collections: 980_000, disbursements: 1_100_000 },
    { month: 'Nov', collections: 3_100_000, disbursements: 1_500_000 },
    { month: 'Dec', collections: 1_200_000, disbursements: 1_800_000 },
  ],
  'Diocesan Schools': [
    { month: 'Jan', collections: 8_400_000, disbursements: 7_200_000 },
    { month: 'Feb', collections: 7_100_000, disbursements: 6_800_000 },
    { month: 'Mar', collections: 7_600_000, disbursements: 7_100_000 },
    { month: 'Apr', collections: 9_200_000, disbursements: 7_400_000 },
    { month: 'May', collections: 8_800_000, disbursements: 7_800_000 },
    { month: 'Jun', collections: 16_400_000, disbursements: 8_200_000 },
    { month: 'Jul', collections: 7_200_000, disbursements: 6_900_000 },
    { month: 'Aug', collections: 7_500_000, disbursements: 7_100_000 },
    { month: 'Sep', collections: 7_800_000, disbursements: 7_300_000 },
    { month: 'Oct', collections: 8_100_000, disbursements: 7_500_000 },
    { month: 'Nov', collections: 15_800_000, disbursements: 8_100_000 },
    { month: 'Dec', collections: 9_400_000, disbursements: 8_600_000 },
  ],
};
const CMP_YEAR_FACTOR: Record<string, number> = { '2024': 0.91, '2025': 1.0, '2026': 1.09 };
const getDiocesanMonthly = (entityType: string, year: CmpYear) => {
  const base = DIOCESE_MONTHLY_BASE[entityType] ?? DIOCESE_MONTHLY_BASE['Parishes'];
  const factor = CMP_YEAR_FACTOR[year] ?? 1.0;
  return base.map((d) => ({
    month: d.month,
    collections: Math.round(d.collections * factor),
    disbursements: Math.round(d.disbursements * factor),
  }));
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Legend keys with a real, reconciling account-level breakdown fetched live
// via getFinancialBreakdown — Section B subsections (receipts) plus Section
// C/D as whole-section rollups (expenses; Parish/Pastoral Expenses map 1:1
// to entire IAFR sections, so no subsectionCode is needed). amountField
// picks which of the endpoint's two columns (an item can carry both, since
// Section E genuinely mixes receipts and expenses) actually holds the real
// number for that item — reading the wrong one silently renders ₱0.00.
// Every popover here is hover = labels only, click = pin open with values
// (see pinnedLegendKey below); Sacraments is excluded from *this* mechanism
// specifically — its own reconciling 2-line breakdown (Parish Share +
// Over/Above) is rendered separately via renderSacramentsBreakdownPopover,
// sourced from the trend rows already in memory rather than a live fetch,
// but follows the same hover/pin convention.
const LEGEND_BREAKDOWN_CONFIG: Record<
  string,
  { sectionCode: string; subsectionCode?: string; amountField: 'receipts' | 'expenses' }
> = {
  mass_collections: { sectionCode: 'B', subsectionCode: 'mass_collections', amountField: 'receipts' },
  other_collections: { sectionCode: 'B', subsectionCode: 'other_collections', amountField: 'receipts' },
  other_receipts: { sectionCode: 'B', subsectionCode: 'other_receipts', amountField: 'receipts' },
  expenses_parish: { sectionCode: 'D', amountField: 'expenses' },
  expenses_pastoral: { sectionCode: 'C', amountField: 'expenses' },
};

const seasonalityData = [
  { month: 'Jan', value: 130 },
  { month: 'Feb', value: 115 },
  { month: 'Mar', value: 125 },
  { month: 'Apr', value: 185 }, // Easter
  { month: 'May', value: 145 },
  { month: 'Jun', value: 120 },
  { month: 'Jul', value: 110 },
  { month: 'Aug', value: 115 },
  { month: 'Sep', value: 120 },
  { month: 'Oct', value: 125 },
  { month: 'Nov', value: 135 },
  { month: 'Dec', value: 240 }, // Christmas
];

// Seminary Specific Analytics Data
const seminaryCohortData = [
  { stage: 'Propaedeutic', count: 15, color: '#1a472a' },
  { stage: 'Philosophy 1', count: 12, color: '#D4AF37' },
  { stage: 'Philosophy 2', count: 10, color: '#D4AF37' },
  { stage: 'Philosophy 3', count: 8, color: '#D4AF37' },
  { stage: 'Philosophy 4', count: 5, color: '#D4AF37' },
  { stage: 'Theology 1', count: 14, color: '#1a472a' },
  { stage: 'Theology 2', count: 12, color: '#1a472a' },
  { stage: 'Theology 3', count: 10, color: '#1a472a' },
  { stage: 'Theology 4', count: 9, color: '#1a472a' },
  { stage: 'Pastoral Year', count: 12, color: '#1a472a' },
  { stage: 'Deaconate', count: 8, color: '#D4AF37' },
];

const seminaryOriginData = [
  { name: 'Holy Family', count: 45 },
  { name: 'San Isidro Labrador', count: 32 },
  { name: 'San Pedro Apostol', count: 28 },
  { name: 'Sta. Rosa De Lima', count: 15 },
];

const ordinationForecastData = [
  { year: '2026', predicted: 4 },
  { year: '2027', predicted: 6 },
  { year: '2028', predicted: 3 },
  { year: '2029', predicted: 7 },
  { year: '2030', predicted: 5 },
];

const priestGapData = [
  { year: '2026', retirements: 5, ordinations: 4 },
  { year: '2027', retirements: 3, ordinations: 6 },
  { year: '2028', retirements: 6, ordinations: 3 },
  { year: '2029', retirements: 4, ordinations: 7 },
  { year: '2030', retirements: 5, ordinations: 5 },
];

const attritionRiskData = [
  { year: '1st Year', risk: 15 },
  { year: '2nd Year', risk: 8 },
  { year: '3rd Year', risk: 5 },
  { year: '4th Year', risk: 3 },
];

const enrollmentForecastData = [
  { year: '2021', enrollment: 85, capacity: 150 },
  { year: '2022', enrollment: 92, capacity: 150 },
  { year: '2023', enrollment: 105, capacity: 150 },
  { year: '2024', enrollment: 118, capacity: 150 },
  { year: '2025', enrollment: 125, capacity: 150 },
];

const vocationPipelineData = [
  { stage: 'Inquiry', count: 120, fill: '#1a472a', dropOff: '' },
  { stage: 'Application', count: 85, fill: '#1a472a', dropOff: '-29%' },
  { stage: 'Interview', count: 45, fill: '#D4AF37', dropOff: '-47%' },
  { stage: 'Accepted', count: 20, fill: '#1a472a', dropOff: '-56%' },
];

const AdvancedForecastChart = ({
  data,
  actualKey,
  forecastKey,
  yAxisLabel,
  title,
  entityType = 'Parishes',
  metrics = {
    mae: 35.22,
    rmse: 42.02,
    mape: 20.88,
    mase: 0.38,
    wape: 19.72,
    mpe: 4.46,
  },
  champion,
  dataSufficient,
}: {
  data: any[];
  actualKey: string;
  forecastKey: string;
  yAxisLabel: string;
  title: string;
  entityType?: string;
  metrics?: any;
  // Live champion-vs-candidates data from getFinancialForecast (see
  // apiParishForecast) — undefined for the diocese-wide "All Parishes" view
  // and non-parish entity types, where this endpoint has no aggregate path;
  // the two call sites below leave both undefined in that case, and every
  // branch here falls back to the mock `metrics` prop exactly as before.
  champion?: {
    champion_model: string;
    wape: number;
    all_candidates: Record<string, number>;
    metrics?: { wape?: number; mape_pct?: number; mpe_pct?: number; mase?: number };
  } | null;
  dataSufficient?: boolean;
}) => {
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [showModelComparison, setShowModelComparison] = useState(false);
  const hasLiveChampion = dataSufficient === true && !!champion?.champion_model && champion.champion_model !== 'N/A';
  // MAE/RMSE aren't computed by the backend's champion selection (WAPE-based
  // only) — those two cells always keep the illustrative mock values, but
  // MAPE/MASE/WAPE/MPE are real once a live champion is available. WAPE
  // comes back from the backend as a 0-1 fraction (full_metrics' existing
  // convention); MAPE/MPE are already 0-100 percentages and MASE is a plain
  // ratio, so only WAPE needs the *100 to match this table's display scale.
  const liveWape = champion?.metrics?.wape ?? champion?.wape;
  const displayMetrics = hasLiveChampion
    ? {
        mae: metrics.mae,
        rmse: metrics.rmse,
        mape: champion?.metrics?.mape_pct ?? metrics.mape,
        mase: champion?.metrics?.mase ?? metrics.mase,
        wape: liveWape != null ? Math.round(liveWape * 10000) / 100 : metrics.wape,
        mpe: champion?.metrics?.mpe_pct ?? metrics.mpe,
      }
    : metrics;
  const isCollections = actualKey === 'collections';
  const subjectLabel =
    entityType === 'Diocesan Schools' ? 'school' : entityType === 'Seminaries' ? 'seminary' : 'parish';
  const collectionsEventContext =
    entityType === 'Diocesan Schools'
      ? 'enrollment periods, tuition schedules, and school activities'
      : entityType === 'Seminaries'
        ? 'formation schedules, subsidy releases, and seminary activities'
        : 'Holy Week, when church attendance and giving are at their highest';
  const disbursementEventContext =
    entityType === 'Diocesan Schools'
      ? 'school operations, maintenance cycles, enrollment activities, and year-end obligations'
      : entityType === 'Seminaries'
        ? 'formation programs, maintenance cycles, and year-end obligations'
        : 'Christmas programs, year-end bonuses, and parish events';
  const pastEnd = 'Aug';
  const presentEnd = 'Oct';
  const futureEnd = 'Dec';

  const insights = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const presentIndex = months.indexOf(presentEnd);
    const lastActual = data[presentIndex];
    const lastActualVal: number = lastActual?.[actualKey] ?? 0;
    const prevActual = data[presentIndex - 1];
    const prevActualVal: number = prevActual?.[actualKey] ?? 0;
    const lastMonthChange = prevActualVal > 0 ? ((lastActualVal - prevActualVal) / prevActualVal) * 100 : 0;
    const futureForecast = data.slice(presentIndex + 1);
    const nextMonthData = futureForecast[0];
    const nextMonthVal: number = nextMonthData?.[forecastKey] ?? 0;
    const nextMonthName: string = nextMonthData?.month ?? 'Nov';
    const nextMonthChange = lastActualVal > 0 ? ((nextMonthVal - lastActualVal) / lastActualVal) * 100 : 0;
    const lastForecastData = futureForecast[futureForecast.length - 1];
    const lastForecastVal: number = lastForecastData?.[forecastKey] ?? 0;
    const lastForecastName: string = lastForecastData?.month ?? 'Dec';
    const actualData = data.slice(0, presentIndex + 1).filter((d) => d[actualKey] != null);
    const peakMonth = actualData.reduce(
      (max: any, d: any) => ((d[actualKey] ?? 0) > (max[actualKey] ?? 0) ? d : max),
      actualData[0],
    );
    const avgActual =
      actualData.reduce((sum: number, d: any) => sum + (d[actualKey] ?? 0), 0) / (actualData.length || 1);
    const decAboveAvg = lastForecastVal > 0 ? ((lastForecastVal - avgActual) / avgActual) * 100 : 0;
    const fmt = (v: number) => `₱${(v / 1_000_000).toFixed(2)}M`;
    const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    return {
      lastActualVal,
      prevActualVal,
      lastMonthChange,
      nextMonthName,
      nextMonthVal,
      nextMonthChange,
      lastForecastName,
      lastForecastVal,
      peakMonth,
      avgActual,
      decAboveAvg,
      fmt,
      pct,
    };
  }, [data, actualKey, forecastKey, presentEnd]);
  const interpretationText = isCollections
    ? `Looking at the graph, the ${subjectLabel} started the year collecting around ${insights.fmt(insights.prevActualVal > 0 ? insights.prevActualVal : insights.lastActualVal)} per month. Collections can jump around major activity periods such as ${collectionsEventContext}. After peak months, the numbers settle back to a normal range through mid-year. As of October, the ${subjectLabel} collected ${insights.fmt(insights.lastActualVal)}, and the model predicts this will continue to rise, reaching around ${insights.fmt(insights.nextMonthVal)} in ${insights.nextMonthName} and peaking at ${insights.fmt(insights.lastForecastVal)} in ${insights.lastForecastName}. The gold dashed line (the forecast) runs close to the actual green line throughout the year, which means the model's predictions are accurate and can be trusted for planning.`
    : `Looking at the graph, the ${subjectLabel}'s spending follows a clear pattern throughout the year. Expenses were relatively moderate in the early months but can spike during major activity periods. Spending then stabilized through mid-year. As of October, disbursements reached ${insights.fmt(insights.lastActualVal)}, and the model projects costs will rise to ${insights.fmt(insights.nextMonthVal)} in ${insights.nextMonthName} and peak at ${insights.fmt(insights.lastForecastVal)} in ${insights.lastForecastName}, driven by ${disbursementEventContext}. The gold dashed line (the forecast) closely tracks actual spending, so these projections are reliable enough to use for budget planning.`;

  // Process data to ensure historical line stops at present, and forecast starts at present
  const processedData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const presentIndex = months.indexOf(presentEnd);
    const pastIndex = months.indexOf(pastEnd);

    return data.map((item) => {
      const itemIndex = months.indexOf(item.month);
      return {
        ...item,
        [actualKey]: itemIndex <= presentIndex ? item[actualKey] : null,
        [forecastKey]: itemIndex >= pastIndex ? item[forecastKey] : null,
      };
    });
  }, [data, actualKey, forecastKey, presentEnd, pastEnd]);

  const bishopForecastOption = {
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
      textStyle: { fontSize: 10, fontWeight: 700, color: '#4B5563' },
      icon: 'circle',
      data: ['Historical (Actual)', 'Forecast (ML Model)'],
    },
    grid: { top: 55, right: 30, left: 50, bottom: 30 },
    xAxis: {
      type: 'category',
      data: processedData.map((d: any) => d.month),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: 600 },
      splitLine: { show: true, lineStyle: { color: '#F3F4F6', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 11, formatter: (v: number) => `${v / 1000000}M` },
      splitLine: { show: true, lineStyle: { color: '#F3F4F6' } },
    },
    series: [
      {
        name: 'Historical (Actual)',
        type: 'line',
        data: processedData.map((d: any) => d[actualKey] ?? null),
        smooth: true,
        lineStyle: { color: '#1a472a', width: 4 },
        itemStyle: { color: '#1a472a', borderColor: '#fff', borderWidth: 2 },
        symbolSize: 8,
        connectNulls: false,
        markArea: {
          silent: true,
          data: [
            [
              {
                xAxis: 'Jan',
                itemStyle: { color: '#F0F9FF', opacity: 0.4 },
                label: {
                  show: true,
                  position: 'insideTopLeft',
                  value: 'PAST (Train)',
                  color: '#0EA5E9',
                  fontSize: 9,
                  fontWeight: 700,
                },
              },
              { xAxis: pastEnd },
            ],
            [
              {
                xAxis: pastEnd,
                itemStyle: { color: '#FFF7ED', opacity: 0.4 },
                label: {
                  show: true,
                  position: 'insideTopLeft',
                  value: 'PRESENT (Holdout)',
                  color: '#F97316',
                  fontSize: 9,
                  fontWeight: 700,
                },
              },
              { xAxis: presentEnd },
            ],
            [
              {
                xAxis: presentEnd,
                itemStyle: { color: '#F0FDF4', opacity: 0.4 },
                label: {
                  show: true,
                  position: 'insideTopLeft',
                  value: 'FUTURE (Forecast)',
                  color: '#22C55E',
                  fontSize: 9,
                  fontWeight: 700,
                },
              },
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
        data: processedData.map((d: any) => d[forecastKey] ?? null),
        smooth: true,
        lineStyle: { color: '#D4AF37', width: 4, type: 'dashed' },
        itemStyle: { color: '#D4AF37', borderColor: '#fff', borderWidth: 2 },
        symbolSize: 8,
        connectNulls: false,
      },
    ],
  };

  return (
    <div className="flex flex-col w-full bg-white/50 rounded-2xl p-4 border border-gray-100/50">
      <div className="h-[340px] flex items-center">
        <div className="w-8 flex-shrink-0 flex items-center justify-center h-full">
          <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.4em] -rotate-90 whitespace-nowrap">
            {yAxisLabel}
          </span>
        </div>
        <ReactECharts option={bishopForecastOption} style={{ height: '100%', width: '100%' }} />
      </div>

      <div className="mt-8 bg-gray-50/50 rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Model Performance Metrics
          </span>
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
                <td className="text-center py-3 border-y border-gray-100">{displayMetrics.mae}</td>
                <td className="text-center py-3 border-y border-gray-100">{displayMetrics.rmse}</td>
                <td className="text-center py-3 border-y border-gray-100 text-gold-600 font-bold">
                  {displayMetrics.mape}%
                </td>
                <td className="text-center py-3 border-y border-gray-100">{displayMetrics.mase}</td>
                <td className="text-center py-3 border-y border-gray-100">{displayMetrics.wape}%</td>
                <td className="text-center py-3 pr-3 border-y border-r border-gray-100">{displayMetrics.mpe}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowInterpretation((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              How to Read This Chart
            </span>
            <span className="text-[9px] font-bold text-church-green bg-church-green/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Plain Language
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showInterpretation ? 'rotate-180' : ''}`}
          />
        </button>

        {showInterpretation && (
          <div className="px-4 py-4 bg-white">
            <p className="text-xs text-gray-600 leading-relaxed">{interpretationText}</p>
          </div>
        )}
      </div>

      {/* Champion-vs-candidates comparison — only rendered once live parish
          forecast data exists (dataSufficient !== undefined); the
          diocese-wide "All Parishes" view and non-parish entity types pass
          neither prop, so this block is skipped entirely, same as today. */}
      {dataSufficient !== undefined && (
        <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowModelComparison((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                Model Comparison
              </span>
              {hasLiveChampion && (
                <span className="text-[9px] font-bold text-gold-600 bg-gold-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {champion!.champion_model} Champion
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${showModelComparison ? 'rotate-180' : ''}`}
            />
          </button>

          {showModelComparison && (
            <div className="px-4 py-4 bg-white">
              {hasLiveChampion ? (
                <div className="space-y-1.5">
                  {Object.entries(champion!.all_candidates)
                    .sort(([, a], [, b]) => (a as number) - (b as number))
                    .map(([model, wapeScore]) => (
                      <div
                        key={model}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                          model === champion!.champion_model
                            ? 'bg-gold-500/10 border border-gold-500/30 font-bold text-gold-700'
                            : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        <span>
                          {model}
                          {model === champion!.champion_model ? ' (Champion)' : ''}
                        </span>
                        <span>{((wapeScore as number) * 100).toFixed(2)}% WAPE</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 leading-relaxed">
                  Not enough submitted history yet for a reliable model comparison.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const trendData = [
  {
    month: 'Jan',
    collections: 4250000,
    forecast: 4300000,
    expenses_parish: 2100000,
    expenses_pastoral: 1100000,
    collections_mass: 1700000,
    sacraments_rate: 637500,
    collections_other: 510000,
  },
  {
    month: 'Feb',
    collections: 3980000,
    forecast: 4100000,
    expenses_parish: 1950000,
    expenses_pastoral: 1050000,
    collections_mass: 1592000,
    sacraments_rate: 597000,
    collections_other: 477600,
  },
  {
    month: 'Mar',
    collections: 4120000,
    forecast: 4250000,
    expenses_parish: 2050000,
    expenses_pastoral: 1080000,
    collections_mass: 1648000,
    sacraments_rate: 618000,
    collections_other: 494400,
  },
  {
    month: 'Apr',
    collections: 5850000,
    forecast: 5700000,
    expenses_parish: 2800000,
    expenses_pastoral: 1500000,
    collections_mass: 2340000,
    sacraments_rate: 877500,
    collections_other: 702000,
  }, // Holy Week
  {
    month: 'May',
    collections: 4920000,
    forecast: 5050000,
    expenses_parish: 2400000,
    expenses_pastoral: 1300000,
    collections_mass: 1968000,
    sacraments_rate: 738000,
    collections_other: 590400,
  },
  {
    month: 'Jun',
    collections: 4350000,
    forecast: 4400000,
    expenses_parish: 2150000,
    expenses_pastoral: 1150000,
    collections_mass: 1740000,
    sacraments_rate: 652500,
    collections_other: 522000,
  },
  {
    month: 'Jul',
    collections: 4050000,
    forecast: 4200000,
    expenses_parish: 2000000,
    expenses_pastoral: 1070000,
    collections_mass: 1620000,
    sacraments_rate: 607500,
    collections_other: 486000,
  },
  {
    month: 'Aug',
    collections: 4480000,
    forecast: 4550000,
    expenses_parish: 2200000,
    expenses_pastoral: 1180000,
    collections_mass: 1792000,
    sacraments_rate: 672000,
    collections_other: 537600,
  },
  {
    month: 'Sep',
    collections: 4620000,
    forecast: 4700000,
    expenses_parish: 2250000,
    expenses_pastoral: 1220000,
    collections_mass: 1848000,
    sacraments_rate: 693000,
    collections_other: 554400,
  },
  {
    month: 'Oct',
    collections: 4850000,
    forecast: 4950000,
    expenses_parish: 2350000,
    expenses_pastoral: 1280000,
    collections_mass: 1940000,
    sacraments_rate: 727500,
    collections_other: 582000,
  },
  {
    month: 'Nov',
    collections: 5320000,
    forecast: 5400000,
    expenses_parish: 2600000,
    expenses_pastoral: 1400000,
    collections_mass: 2128000,
    sacraments_rate: 798000,
    collections_other: 638400,
  },
  {
    month: 'Dec',
    collections: 7450000,
    forecast: 7200000,
    expenses_parish: 3600000,
    expenses_pastoral: 1950000,
    collections_mass: 2980000,
    sacraments_rate: 1117500,
    collections_other: 894000,
  }, // Christmas
];

const topDisbursementCategories = [
  { category: 'Salaries & Wages', amount: 8500000, percentage: 35 },
  { category: 'Utilities (Electricity/Water)', amount: 4200000, percentage: 17 },
  { category: 'Pastoral Programs', amount: 3800000, percentage: 16 },
  { category: 'Repairs & Maintenance', amount: 3100000, percentage: 13 },
  { category: 'Charitable Works', amount: 2400000, percentage: 10 },
  { category: 'Other Operating Expenses', amount: 2200000, percentage: 9 },
];

const seasonalExpenseSpikes = [
  {
    event: 'Holy Week (Mar/Apr)',
    expectedSpike: '+25%',
    primaryDrivers: 'Event setup, extra utilities, guest priests',
  },
  { event: 'Fiesta Season (May)', expectedSpike: '+15%', primaryDrivers: 'Decorations, food, community events' },
  { event: 'Back to School (Aug)', expectedSpike: '+10%', primaryDrivers: 'Scholarships, school subsidies' },
  { event: 'Christmas (Dec)', expectedSpike: '+40%', primaryDrivers: 'Bonuses, decorations, charity outreach' },
];

const VICARIATE_TO_DISTRICT: Record<string, string> = {
  'Holy Family': 'District I',
  'San Isidro Labrador': 'District I',
  'San Pedro Apostol': 'District I',
  'Sta. Rosa De Lima': 'District II',
  'St. Polycarp': 'District II',
  'St. John the Baptist': 'District III',
  'Immaculate Conception': 'District IV',
  'St. Paul the First Hermit': 'District V',
  'San Bartolome': 'District VI',
  'San Antonio De Padua': 'District VII',
  'Our Lady of Guadalupe': 'District VIII',
  'St. James': 'District IX',
  'Sts. Peter and Paul': 'District X',
};

const getEntitiesData = (type: string) => {
  let data: any[] = [];
  if (type === 'Seminaries') {
    data = [
      {
        name: 'St. Peter Seminary',
        class: 'Class A',
        collections: 1200000,
        enrollment: 45,
        capacity: 60,
        staff: 12,
        vicariate: 'Holy Family',
      },
      {
        name: 'Holy Cross Seminary',
        class: 'Class B',
        collections: 900000,
        enrollment: 38,
        capacity: 50,
        staff: 10,
        vicariate: 'San Isidro Labrador',
      },
      {
        name: 'San Pablo Formation House',
        class: 'Class A',
        collections: 1500000,
        enrollment: 52,
        capacity: 70,
        staff: 15,
        vicariate: 'St. Polycarp',
      },
      {
        name: 'Diocesan Memorial Seminary',
        class: 'Class C',
        collections: 600000,
        enrollment: 25,
        capacity: 40,
        staff: 8,
        vicariate: 'San Pedro Apostol',
      },
      {
        name: 'Our Lady of Guadalupe Seminary',
        class: 'Class B',
        collections: 1100000,
        enrollment: 42,
        capacity: 55,
        staff: 11,
        vicariate: 'Sta. Rosa De Lima',
      },
    ];
  } else if (type === 'Diocesan Schools') {
    data = [
      {
        name: 'St. Mary Academy',
        vicariate: 'Holy Family',
        cluster: 'Cluster 1',
        class: 'Class A',
        collections: 4500000,
      },
      {
        name: 'Holy Family School',
        vicariate: 'San Isidro Labrador',
        cluster: 'Cluster 1',
        class: 'Class B',
        collections: 3200000,
      },
      {
        name: 'San Isidro Catholic School',
        vicariate: 'San Pedro Apostol',
        cluster: 'Cluster 1',
        class: 'Class C',
        collections: 2100000,
      },
      {
        name: 'St. John Parochial School',
        vicariate: 'Sta. Rosa De Lima',
        cluster: 'Cluster 2',
        class: 'Class B',
        collections: 2800000,
      },
      {
        name: 'Liceo de San Pablo',
        vicariate: 'St. Polycarp',
        cluster: 'Cluster 2',
        class: 'Class A',
        collections: 5200000,
      },
      {
        name: 'Liceo de Calamba',
        vicariate: 'St. John the Baptist',
        cluster: 'Cluster 3',
        class: 'Class A',
        collections: 4800000,
      },
      {
        name: 'Liceo de Cabuyao',
        vicariate: 'Immaculate Conception',
        cluster: 'Cluster 3',
        class: 'Class B',
        collections: 3500000,
      },
    ];
  } else {
    data = ALL_PARISHES;
  }

  return data.map((item) => ({
    ...item,
    district: VICARIATE_TO_DISTRICT[item.vicariate] || 'Other',
  }));
};

const formationStageData = [
  { stage: 'Propaedeutic', count: 12, color: '#1a472a' },
  { stage: 'Philosophy I', count: 10, color: '#D4AF37' },
  { stage: 'Philosophy II', count: 8, color: '#1a472a' },
  { stage: 'Theology I', count: 15, color: '#1a472a' },
  { stage: 'Theology II', count: 12, color: '#1a472a' },
  { stage: 'Theology III', count: 10, color: '#1a472a' },
  { stage: 'Theology IV', count: 8, color: '#1a472a' },
];

const seminaryCostBreakdownData = [
  { name: 'Faculty & Staff', value: 4500000 },
  { name: 'Maintenance', value: 2100000 },
  { name: 'Food & Board', value: 1800000 },
  { name: 'Utilities', value: 1200000 },
  { name: 'Student Aid', value: 900000 },
];
const COST_COLORS = ['#1a472a', '#D4AF37', '#4ade80', '#E6C27A', '#1a472a'];

const seminaryAgeData = [
  { age: '18-22', count: 15 },
  { age: '23-27', count: 28 },
  { age: '28-32', count: 18 },
  { age: '33-37', count: 10 },
  { age: '38+', count: 5 },
];

const formationProgressData = [
  { year: '2021', propaedeutic: 10, philosophy: 15, theology: 20 },
  { year: '2022', propaedeutic: 12, philosophy: 18, theology: 22 },
  { year: '2023', propaedeutic: 15, philosophy: 20, theology: 25 },
  { year: '2024', propaedeutic: 14, philosophy: 22, theology: 28 },
  { year: '2025', propaedeutic: 18, philosophy: 25, theology: 32 },
];

const endowmentGrowthData = [
  { year: '2021', value: 5.2 * 1000000 },
  { year: '2022', value: 5.8 * 1000000 },
  { year: '2023', value: 6.5 * 1000000 },
  { year: '2024', value: 7.2 * 1000000 },
  { year: '2025', value: 8.1 * 1000000 },
];

const vocationInterestData = [
  { month: 'Jan', inquiries: 12 },
  { month: 'Feb', inquiries: 15 },
  { month: 'Mar', inquiries: 28 },
  { month: 'Apr', inquiries: 35 },
  { month: 'May', inquiries: 42 },
  { month: 'Jun', inquiries: 30 },
  { month: 'Jul', inquiries: 25 },
  { month: 'Aug', inquiries: 45 },
  { month: 'Sep', inquiries: 55 },
  { month: 'Oct', inquiries: 40 },
  { month: 'Nov', inquiries: 32 },
  { month: 'Dec', inquiries: 28 },
];

const getTopTierData = (type: string) => {
  if (type === 'Seminaries') {
    return [
      { rank: 1, name: 'St. Peter Seminary', location: 'SAN PABLO', class: 'Class A', vicariate: 'Holy Family' },
      {
        rank: 2,
        name: 'Holy Cross Seminary',
        location: 'SAN PABLO',
        class: 'Class B',
        vicariate: 'San Isidro Labrador',
      },
    ];
  }
  if (type === 'Diocesan Schools') {
    return [
      { rank: 1, name: 'St. Mary Academy', location: 'SAN PABLO', class: 'Class A', vicariate: 'Holy Family' },
      {
        rank: 2,
        name: 'Holy Family School',
        location: 'SAN PABLO',
        class: 'Class B',
        vicariate: 'San Isidro Labrador',
      },
      {
        rank: 3,
        name: 'St. John Parochial School',
        location: 'SAN PABLO',
        class: 'Class B',
        vicariate: 'Sta. Rosa De Lima',
      },
      {
        rank: 4,
        name: 'San Isidro Catholic School',
        location: 'SAN PABLO',
        class: 'Class C',
        vicariate: 'San Pedro Apostol',
      },
    ];
  }

  const parishes = ALL_PARISHES.map((p, i) => ({
    rank: i + 1,
    name: p.name,
    location: 'SAN PABLO',
    class: p.class,
    vicariate: p.vicariate,
  }))
    .sort((a, b) => {
      // Sort by class (A first) then name
      if (a.class < b.class) return -1;
      if (a.class > b.class) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return parishes;
};

import { Timeframe } from '../App';

class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Chart Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-gray-50 rounded-md border border-gray-100">
          <div className="text-center p-4">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">Failed to load chart data</p>
            <p className="text-xs text-gray-400 mt-1">Please try refreshing the page</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface BishopDashboardProps {
  initialEntityType?: string;
  initialEntityFilter?: string;
  lockEntityFilter?: boolean;
  timeframe?: Timeframe;
  year?: number | null;
  onYearChange?: (year: number | null) => void;
  isEmbedded?: boolean;
  onNavigate?: (page: string) => void;
}

const stripVicariatePrefix = (name: string) => name.replace('Vicariate of ', '').replace(/ Parish$/, '');

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

export function BishopDashboard({
  initialEntityType = 'Parishes',
  initialEntityFilter,
  lockEntityFilter = false,
  timeframe = '6m',
  year = null,
  onYearChange,
  isEmbedded = false,
  onNavigate,
}: BishopDashboardProps) {
  const [analyticsView, setAnalyticsView] = useState<'descriptive' | 'predictive' | 'prescriptive' | 'health'>(
    'descriptive',
  );
  const [entityType, setEntityType] = useState(initialEntityType);
  const [seminaryActiveTab, setSeminaryActiveTab] = useState(0);

  useEffect(() => {
    setEntityType(initialEntityType);
  }, [initialEntityType]);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [geoInstitutions, setGeoInstitutions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<DiagnosticResult | null>(null);
  const [healthScores, setHealthScores] = useState<FinancialHealthScore[]>([]);
  const [isHealthScoreLoading, setIsHealthScoreLoading] = useState(false);
  // 'scoped' = follows the Year/Timeframe selection above (the default —
  // matches the other 3 KPI tiles); 'overall' = the parish's full trailing
  // history regardless of Year/Timeframe, for when a single-year snapshot
  // isn't what's wanted. Independent of filterMode — available whether
  // viewing the whole diocese or one selected parish.
  const [healthScoreViewMode, setHealthScoreViewMode] = useState<'scoped' | 'overall'>('scoped');
  const [collectionsFilter, setCollectionsFilter] = useState<
    'all' | 'collections_mass' | 'sacraments_rate' | 'other_receipts' | 'other_collections'
  >('all');
  const [disbursementsFilter, setDisbursementsFilter] = useState<'all' | 'expenses_parish' | 'expenses_pastoral'>(
    'all',
  );
  const [apiParishFinancialTrend, setApiParishFinancialTrend] = useState<any | null>(null);
  const [apiParishSeasonality, setApiParishSeasonality] = useState<any | null>(null);
  // Live champion-vs-candidates forecast data (getFinancialForecast) — only
  // resolvable for a single selected parish; _fetch_series in the Python
  // service has no "all" aggregate path, unlike financial_trend.py, so the
  // diocese-wide "All Parishes" view keeps its existing mock metrics (see
  // AdvancedForecastChart's dataSufficient/champion props, left undefined
  // there).
  const [apiParishForecast, setApiParishForecast] = useState<any | null>(null);
  const financialTrendCacheRef = useRef<Map<string, any>>(new Map());
  // True while a filter/year/parish change is refetching real data. The old
  // values stay on screen until the new response lands (avoids a jarring
  // flash to empty), so without this flag there's no way to tell "updating"
  // apart from "done" — exactly what made filter changes look stuck before.
  const [isDescriptiveLoading, setIsDescriptiveLoading] = useState(false);
  const [priestGapFilter, setPriestGapFilter] = useState<'all' | 'retirements' | 'ordinations'>('all');
  const [enrollmentFilter, setEnrollmentFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [formationFilter, setFormationFilter] = useState<'all' | 'propaedeutic' | 'philosophy' | 'theology'>('all');
  const [enrollmentForecastFilter, setEnrollmentForecastFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [staffRatioFilter, setStaffRatioFilter] = useState<'all' | 'seminarians' | 'staff'>('all');
  const [collectionsDisbursementsFilter, setCollectionsDisbursementsFilter] = useState<
    'all' | 'collections' | 'disbursements'
  >('all');

  const parishTrendData = useMemo(() => {
    // year === null is "All Years" — the fetch below sends no year param in
    // that case, so the server already returns the full unscoped history and
    // nothing further needs filtering here. When a specific year is picked,
    // the server has already narrowed monthly_series to it; re-filtering by
    // period is just a defensive no-op in that case, not load-bearing.
    const allRows = apiParishFinancialTrend?.monthly_series;
    if (!Array.isArray(allRows) || allRows.length === 0) return null;
    const rows =
      year === null ? allRows : allRows.filter((row: any) => String(row.period ?? '').startsWith(`${year}-`));
    if (rows.length === 0) return null;
    return rows.map((row: any) => {
      const period = String(row.period ?? '');
      const [, monthNum] = period.split('-');
      const monthIndex = Number(monthNum) - 1;
      const month = CMP_MONTHS[monthIndex] ?? period;
      return {
        month,
        period,
        collections: Number(row.total_receipts ?? 0),
        total_receipts: Number(row.total_receipts ?? 0),
        total_expenses: Number(row.total_expenses ?? 0),
        forecast: Number(row.trend ?? row.total_receipts ?? 0),
        expenses_parish: Number(row.expenses_parish ?? 0),
        expenses_pastoral: Number(row.expenses_pastoral ?? 0),
        collections_mass: Number(row.collections_mass ?? 0),
        sacraments_rate: Number(row.sacraments ?? 0),
        sacraments_parish_share: Number(row.sacraments_parish_share ?? 0),
        sacraments_over_above: Number(row.sacraments_over_above ?? 0),
        other_receipts: Number(row.other_receipts ?? 0),
        other_collections: Number(row.other_collections ?? 0),
      };
    });
  }, [apiParishFinancialTrend, year]);

  // Parishes has a real AWS-backed data source, so if it comes back empty or
  // fails, that's an honest "no data for this scope" — never silently
  // substitute the mock trendData, which would show fabricated numbers
  // indistinguishable from real ones. Seminaries/Schools have no real
  // per-institution financial pipeline yet, so they keep the mock fallback.
  const activeTrendData = useMemo(() => {
    if (entityType === 'Parishes') return parishTrendData ?? [];
    return trendData;
  }, [entityType, parishTrendData]);

  // "6 Months" is a swipeable/pageable window over the Collections and
  // Disbursement Breakdown charts: calendar-aligned half-year pages
  // (Jan–Jun / Jul–Dec). A specific Year gives exactly 2 pages; "All Years"
  // pages continuously across the full history. Boundaries derive from each
  // row's period string — never array-index math — so a missing month can't
  // shift every later page. 12m/All keep their existing non-paged behavior.
  const sixMonthPages = useMemo(() => {
    if (entityType !== 'Parishes') {
      // Mock rows (Seminaries/Schools) carry no real period field — plain
      // index chunks of the 12-month mock array.
      const pages: any[][] = [];
      for (let i = 0; i < activeTrendData.length; i += 6) pages.push(activeTrendData.slice(i, i + 6));
      return pages.length ? pages : [[]];
    }
    const byHalf = new Map<string, any[]>();
    activeTrendData.forEach((row: any) => {
      const [y, m] = String(row.period ?? '').split('-');
      if (!y || !m) return;
      const half = `${y}-${Number(m) <= 6 ? 'H1' : 'H2'}`;
      if (!byHalf.has(half)) byHalf.set(half, []);
      byHalf.get(half)!.push(row);
    });
    const keys = [...byHalf.keys()].sort();
    return keys.length ? keys.map((k) => byHalf.get(k)!) : [[]];
  }, [activeTrendData, entityType]);

  const [breakdownPage, setBreakdownPage] = useState(0);
  const trendTouchStartXRef = useRef<number | null>(null);

  // Land on the most recent half whenever the page set reshapes (Year/entity
  // change) so a stale index can't point past the new array's end.
  useEffect(() => {
    setBreakdownPage(Math.max(0, sixMonthPages.length - 1));
  }, [sixMonthPages.length, year, entityType]);

  const windowedTrendData = useMemo(() => {
    if (timeframe === '6m') return sixMonthPages[Math.min(breakdownPage, sixMonthPages.length - 1)] ?? [];
    if (timeframe === '1y') return activeTrendData.slice(-12);
    return activeTrendData;
  }, [activeTrendData, timeframe, sixMonthPages, breakdownPage]);

  // "Jan – Jun 2024"-style caption for the pager.
  const breakdownPageLabel = useMemo(() => {
    if (timeframe !== '6m' || windowedTrendData.length === 0) return null;
    const first: any = windowedTrendData[0];
    const last: any = windowedTrendData[windowedTrendData.length - 1];
    const yearPart = first?.period ? String(first.period).split('-')[0] : '';
    return `${first?.month ?? ''} – ${last?.month ?? ''}${yearPart ? ` ${yearPart}` : ''}`;
  }, [timeframe, windowedTrendData]);

  const handleTrendTouchStart = (e: React.TouchEvent) => {
    trendTouchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTrendTouchEnd = (e: React.TouchEvent) => {
    if (trendTouchStartXRef.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? trendTouchStartXRef.current) - trendTouchStartXRef.current;
    trendTouchStartXRef.current = null;
    if (timeframe !== '6m' || Math.abs(dx) < 50) return;
    // Swipe left → next (more recent) half; swipe right → previous.
    if (dx < 0) setBreakdownPage((p) => Math.min(sixMonthPages.length - 1, p + 1));
    else setBreakdownPage((p) => Math.max(0, p - 1));
  };

  // Clickable pager arrows overlaid on a breakdown chart's own card —
  // desktop counterpart of the touch swipe. Rendered only when 6M paging is
  // actually active and there's more than one page. The page-count label
  // used to be a third absolutely-positioned element here too
  // (bottom-1 right-3), sharing the same overlay space as the chart's own
  // bars/value-labels — at the most recent page the rightmost bar cluster's
  // labels sit in that exact bottom-right corner and visually collide with
  // it. Moved out to renderSixMonthPageLabel(), rendered in the plain
  // document flow next to the "Month" axis caption below the chart instead,
  // where there's no chart content to overlap.
  const renderSixMonthPager = () => {
    if (timeframe !== '6m' || sixMonthPages.length <= 1) return null;
    const arrowClass =
      'absolute top-1/2 -translate-y-1/2 z-20 p-2 bg-white/90 border border-gray-200 rounded-full shadow-md hover:bg-gray-50 disabled:opacity-25 disabled:cursor-default transition-all';
    return (
      <>
        <button
          type="button"
          className={`${arrowClass} left-1`}
          disabled={breakdownPage === 0}
          onClick={() => setBreakdownPage((p) => Math.max(0, p - 1))}
          title="Earlier 6 months"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className={`${arrowClass} right-1`}
          disabled={breakdownPage >= sixMonthPages.length - 1}
          onClick={() => setBreakdownPage((p) => Math.min(sixMonthPages.length - 1, p + 1))}
          title="Later 6 months"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </>
    );
  };

  // Page-count caption ("Jul – Dec 2025 · 10/10"), rendered inline next to
  // the "Month" axis label instead of overlaid on the chart — see the note
  // above renderSixMonthPager.
  const renderSixMonthPageLabel = () => {
    if (timeframe !== '6m' || sixMonthPages.length <= 1 || !breakdownPageLabel) return null;
    return (
      <span className="absolute right-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {breakdownPageLabel} · {breakdownPage + 1}/{sixMonthPages.length}
      </span>
    );
  };

  const activeTopDisbursementCategories = useMemo(() => {
    // AWS gold responses include the six IAFR Section D groups summed over the
    // last 12 months; the coarse parish/pastoral split is the fallback when
    // only monthly totals are available (Supabase path).
    const serverCategories = apiParishFinancialTrend?.disbursement_categories;
    if (Array.isArray(serverCategories) && serverCategories.length > 0) {
      const serverTotal = serverCategories.reduce((sum: number, c: any) => sum + Number(c.amount ?? 0), 0);
      if (serverTotal > 0) {
        return serverCategories.map((c: any) => ({
          category: String(c.category ?? ''),
          amount: Number(c.amount ?? 0),
          percentage: Math.round((Number(c.amount ?? 0) / serverTotal) * 100),
        }));
      }
    }
    if (entityType === 'Parishes') {
      // Real AWS data source for this tier — an empty/failed fetch is an
      // honest "no data," never a silent fall-through to mock categories.
      if (!parishTrendData) return [];
      const totals = parishTrendData.reduce(
        (acc, row) => {
          acc.expenses_parish += Number(row.expenses_parish ?? 0);
          acc.expenses_pastoral += Number(row.expenses_pastoral ?? 0);
          return acc;
        },
        { expenses_parish: 0, expenses_pastoral: 0 },
      );
      const total = totals.expenses_parish + totals.expenses_pastoral;
      if (total <= 0) return [];
      return [
        {
          category: 'Parish Expenses',
          amount: totals.expenses_parish,
          percentage: Math.round((totals.expenses_parish / total) * 100),
        },
        {
          category: 'Pastoral Expenses',
          amount: totals.expenses_pastoral,
          percentage: Math.round((totals.expenses_pastoral / total) * 100),
        },
      ].sort((a, b) => b.amount - a.amount);
    }
    // Seminaries/Schools: no real per-institution disbursement pipeline yet.
    return topDisbursementCategories;
  }, [entityType, apiParishFinancialTrend, parishTrendData]);

  const handleDiagnosticRequest = async (month: string) => {
    try {
      const result = await dataService.getDiagnostic('diocese', month);
      setSelectedDiagnostic(result);
    } catch (err) {
      console.error('Diagnostic error:', err);
    }
  };

  useEffect(() => {
    setEntityType(initialEntityType);
  }, [initialEntityType]);

  useEffect(() => {
    try {
      const unsubscribe = dataService.subscribeToAllRecords((newRecords) => {
        setRecords(newRecords);
        setIsLoading(false);
        setError(null);
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Data fetch error:', err);
      setError('Failed to load dashboard data. Please try again later.');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    apiClient
      .getGeoInstitutions()
      .then((data) => {
        if (data?.length) setGeoInstitutions(data);
      })
      .catch(() => {});
  }, []);

  const [liveDeclineData, setLiveDeclineData] = useState<any[]>([]);
  // Real "YYYY-MM" labels for the Trend Monitor's 4 month columns, sourced
  // from the AWS batch response (which carries real period strings per
  // row). Empty on the Supabase-fallback path (collectionsHistory has no
  // period info) — the table falls back to generic "Month 1..4" headers
  // when this is empty, since the monitor deliberately ignores the Year
  // filter and there'd otherwise be no way to tell which calendar months
  // are actually shown.
  const [trendMonitorPeriods, setTrendMonitorPeriods] = useState<string[]>([]);
  const [parishProfileIdByName, setParishProfileIdByName] = useState<Record<string, string>>({});
  // Real entity list (name/vicariate/class/collections) backing the entity
  // dropdown + all downstream filters, for whichever tab (Parishes/Diocesan
  // Schools/Seminaries) is active. Replaces the static mock lists
  // (ALL_PARISHES and the equivalents baked into getEntitiesData) once
  // loaded, so selecting an entity resolves to a real institution_id instead
  // of silently failing the name lookup and falling back to mock data.
  // null = not yet fetched for the current tab (render mock while loading);
  // [] = fetched successfully and the diocese genuinely has none of this type
  // (render a real empty state, never fall back to mock).
  const [realEntities, setRealEntities] = useState<
    { id: string; name: string; vicariate: string; class: string; district: string; collections: number }[] | null
  >(null);
  useEffect(() => {
    const apiType = entityType === 'Diocesan Schools' ? 'school' : entityType === 'Seminaries' ? 'seminary' : 'parish';
    let cancelled = false;
    setRealEntities(null);
    apiClient
      .getFinancialProfiles(apiType as any)
      .then((data) => {
        if (cancelled) return;
        const rows = data ?? [];
        if (apiType === 'parish') {
          // Backend fallback profiles carry synthetic numeric ids; only real
          // institution UUIDs are usable for the descriptive analytics calls.
          const map: Record<string, string> = {};
          rows.forEach((p: any) => {
            if (p?.name && typeof p?.id === 'string' && UUID_PATTERN.test(p.id)) map[p.name] = p.id;
          });
          setParishProfileIdByName(map);
        }
        setRealEntities(
          rows
            .filter((p: any) => p?.name)
            .map((p: any) => {
              const hist: number[] = p.collectionsHistory ?? [];
              return {
                id: p?.id != null ? String(p.id) : '',
                name: p.name as string,
                vicariate: (p.location as string) ?? '',
                class: (p.class as string) ?? '',
                district: (p.district as string) || 'Unassigned',
                collections: hist.reduce((sum, v) => sum + (Number(v) || 0), 0),
              };
            }),
        );
        setTrendMonitorPeriods([]);
        setLiveDeclineData(
          rows.map((p: any) => {
            const hist: number[] = p.collectionsHistory ?? [];
            const last4 = hist.slice(-4);
            const [w1 = 0, w2 = 0, w3 = 0, w4 = 0] = last4;
            const trend = w1 > 0 ? Math.round(((w4 - w1) / w1) * 100) : 0;
            return {
              name: p.name,
              vicariate: p.location ?? '',
              class: p.class ?? '',
              district: (p.district as string) || 'Unassigned',
              w1,
              w2,
              w3,
              w4,
              trend,
              type: trend < 0 ? 'down' : 'up',
            };
          }),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  // Parishes only: replace the Supabase-derived decline rows above with real
  // AWS warehouse data — one batch request for every parish, carrying each
  // parish's last months of true receipts plus a statistically-derived
  // decline flag (3-month slope) computed server-side. Deliberately not
  // keyed on `year`: a decline *monitor* always reflects the latest real
  // trend regardless of the Year filter. Seminaries/Schools keep the
  // Supabase path (no AWS pipeline exists for them).
  useEffect(() => {
    if (entityType !== 'Parishes' || realEntities === null) return;
    const withIds = realEntities.filter((e: any) => e.id && UUID_PATTERN.test(e.id));
    if (withIds.length === 0) return;
    let cancelled = false;
    apiClient
      .getFinancialTrendBatch(withIds.map((e: any) => e.id))
      .then((res) => {
        if (cancelled || !res?.data_sufficient) return;
        let periods: string[] = [];
        const rows = withIds
          .map((e: any) => {
            const r = res.results[e.id];
            if (!r || r.monthly_series.length < 4) return null;
            const last4 = r.monthly_series.slice(-4);
            // Every parish is loaded from the same diocese-wide monthly
            // batch, so the trailing-4 periods are the same across rows in
            // practice — capture them once, from whichever row we see
            // first with a full 4-month window, for the column headers.
            if (periods.length === 0) periods = last4.map((m: any) => m.period);
            const [w1, w2, w3, w4] = last4.map((m: any) => m.total_receipts);
            return {
              name: e.name,
              vicariate: e.vicariate,
              class: e.class,
              district: e.district || 'Unassigned',
              w1,
              w2,
              w3,
              w4,
              // % shown in the badge stays the familiar first-vs-last window
              // change, but the up/down direction comes from the server's
              // decline_detected slope — the authoritative signal.
              trend: w1 > 0 ? Math.round(((w4 - w1) / w1) * 100) : 0,
              type: r.decline_detected ? 'down' : 'up',
              recentAnomaly: r.recent_anomaly,
            };
          })
          .filter(Boolean);
        if (rows.length > 0) {
          setLiveDeclineData(rows);
          setTrendMonitorPeriods(periods);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType, realEntities]);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  // Trend Monitor direction filter — defaults to showing every entity (the
  // "general monitor" framing) rather than pre-filtering to decliners, so
  // the table isn't empty on load whenever nothing happens to be declining.
  const [trendDirectionFilter, setTrendDirectionFilter] = useState<'down' | 'up' | 'all'>('all');
  const [showFullEventBreakdown, setShowFullEventBreakdown] = useState(false);
  const [districtFilter, setDistrictFilter] = useState('All Districts');
  const [vicariateFilter, setVicariateFilter] = useState('All Vicariates');
  const [classFilter, setClassFilter] = useState('All Classes');
  const [entityFilter, setEntityFilter] = useState(initialEntityFilter || 'All Entities');
  const [filterMode, setFilterMode] = useState<'all' | 'per-entity'>(initialEntityFilter ? 'per-entity' : 'all');
  const [contributionView, setContributionView] = useState<'entity' | 'vicariate'>('vicariate');
  const [selectedVicariate, setSelectedVicariate] = useState<string | null>(null);
  const [selectedBarVicariate, setSelectedBarVicariate] = useState<string | null>(null);
  // Drill-down (Parishes only): Vicariate → Parish. Selecting a parish shows
  // its full IAFR report (IAFRBreakdownReport) instead of drilling further
  // into the chart — the report already shows every Section → Subsection →
  // Account with subtotals at once, so a level-at-a-time chart below Parish
  // would just duplicate the same numbers in a second projection.
  const [drillParish, setDrillParish] = useState<{ id: string; name: string } | null>(null);
  const [isDrillLoading, setIsDrillLoading] = useState(false);
  // Collections/Disbursement Breakdown legend hover preview (Item 8) —
  // separate from the drill-down state above. hoveredLegendKey drives a
  // labels-only preview popover on mouseenter; pinnedLegendKey drives the
  // same popover toggled open by click, now also showing ₱ values — hover
  // never reveals amounts, only what a category is made of. Keyed by
  // subsection key ('mass_collections' | 'other_collections' |
  // 'other_receipts' | 'expenses_parish' | 'expenses_pastoral') for the live
  // account-level fetch (LEGEND_BREAKDOWN_CONFIG), 'sacraments_breakdown' for
  // the locally computed Parish Share / Over/Above split (Section A account
  // rows are gross prescribed amounts that don't reconcile to the net legend
  // figure, so that finer, per-sacrament breakdown genuinely isn't available
  // — see renderSacramentsBreakdownPopover), or 'vicariate_collections' /
  // 'vicariate_disbursements' for the Vicariate chart's own legend, which is
  // hover-only/label-only with no pin and no fetch (see
  // renderVicariateCategoryPopover) since its bars already have a separate,
  // pre-existing click-to-drill mechanism that reveals real numbers.
  const [hoveredLegendKey, setHoveredLegendKey] = useState<string | null>(null);
  const [pinnedLegendKey, setPinnedLegendKey] = useState<string | null>(null);
  const [legendBreakdownCache, setLegendBreakdownCache] = useState<Record<string, any>>({});
  const [contributionSortOrder, setContributionSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [forecastTab, setForecastTab] = useState<'collections' | 'disbursements'>('collections');

  // Period Comparison state
  const [cmpMetric, setCmpMetric] = useState<'collections' | 'disbursements'>('collections');
  const [cmpMonth1, setCmpMonth1] = useState<CmpMonth>('Jan');
  const [cmpYear1, setCmpYear1] = useState<CmpYear>('2025');
  const [cmpMonth2, setCmpMonth2] = useState<CmpMonth>('Jan');
  const [cmpYear2, setCmpYear2] = useState<CmpYear>('2026');

  // Years actually offered in the Period 1/2 — Year pickers. Parishes have
  // real AWS-backed history back to 2021 (see apiParishFinancialTrend,
  // fetched unscoped by year — full history, not just the current Year
  // filter), so derive the real range from it instead of hardcoding a guess
  // that goes stale the moment more history loads. Non-Parish entity types
  // have no real per-institution pipeline yet, so they keep the static mock
  // range (CMP_YEARS) that DIOCESE_MONTHLY_BASE/CMP_YEAR_FACTOR are built for.
  const availableCmpYears = useMemo(() => {
    if (entityType === 'Parishes') {
      const rows = apiParishFinancialTrend?.monthly_series;
      if (Array.isArray(rows) && rows.length > 0) {
        const years = new Set<string>();
        rows.forEach((row: any) => {
          const y = String(row.period ?? '').split('-')[0];
          if (y) years.add(y);
        });
        if (years.size > 0) return [...years].sort();
      }
    }
    return [...CMP_YEARS];
  }, [entityType, apiParishFinancialTrend]);

  // Keep cmpYear1/cmpYear2 valid whenever availableCmpYears changes (e.g.
  // real data loads and replaces the static ['2024','2025','2026'] guess
  // with the true ['2021'..'2025'] range). A <select> whose bound value
  // isn't among its own <option>s renders the browser's fallback (first
  // option) while the React state stays at the stale value underneath —
  // so the dropdown visibly shows one year while the comparison silently
  // looks up a different one. Snapping to the last (most recent) available
  // year keeps what's displayed and what's actually queried in sync.
  useEffect(() => {
    if (availableCmpYears.length === 0) return;
    const latest = availableCmpYears[availableCmpYears.length - 1];
    setCmpYear1((y) => (availableCmpYears.includes(y) ? y : latest));
    setCmpYear2((y) => (availableCmpYears.includes(y) ? y : latest));
  }, [availableCmpYears]);

  // Parish names in local state come from the static ALL_PARISHES list, but the
  // descriptive analytics endpoints need real diocese.institutions UUIDs.
  // Financial profiles cover every active parish; geo institutions only the
  // geocoded subset, so profiles win on conflicts.
  const parishIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    geoInstitutions.forEach((inst: any) => {
      if (inst?.name && typeof inst?.id === 'string' && UUID_PATTERN.test(inst.id)) map[inst.name] = inst.id;
    });
    Object.assign(map, parishProfileIdByName);
    return map;
  }, [geoInstitutions, parishProfileIdByName]);

  const selectedParishInstitutionId = useMemo(() => {
    if (entityType !== 'Parishes' || filterMode !== 'per-entity') return null;
    if (!entityFilter || entityFilter === 'All Entities') return null;
    const selectedEntity = realEntities?.find((entity) => entity.name === entityFilter);
    if (selectedEntity?.id && UUID_PATTERN.test(selectedEntity.id)) return selectedEntity.id;
    return parishIdByName[entityFilter] ?? null;
  }, [entityType, filterMode, entityFilter, realEntities, parishIdByName]);

  // Vicariate to scope the diocese-wide ("all") descriptive fetch to, when
  // the Vicariate filter alone is active (vicariate is a real, first-class
  // warehouse column, so this stays a lightweight name-based filter). District
  // is NOT resolved here — the real data shows a single vicariate can span
  // multiple districts (or none), so district can't be expressed as a
  // vicariate set. Any District selection is instead resolved to concrete
  // institution ids below, alongside Class.
  const selectedVicariateScope = useMemo(() => {
    if (entityType !== 'Parishes' || filterMode !== 'all') return null;
    if (vicariateFilter !== 'All Vicariates') return [vicariateFilter];
    return null;
  }, [entityType, filterMode, vicariateFilter]);

  // Institution IDs to scope the real fetch to when District and/or Class is
  // active (combined with whatever Vicariate filter is also active).
  // `vicariates` alone can't express "District I" or "Class A" — the
  // warehouse query needs concrete institution ids for that, hence resolving
  // the combined filter against the real per-parish list fetched for the
  // entity dropdown (which now carries each institution's real district,
  // not a vicariate-derived guess). Returns null when neither District nor
  // Class is the differentiator, leaving the existing vicariates-only path
  // (Vicariate filter alone) untouched.
  const selectedInstitutionScopeIds = useMemo(() => {
    if (entityType !== 'Parishes' || filterMode !== 'all') return null;
    if (classFilter === 'All Classes' && districtFilter === 'All Districts') return null;
    if (!Array.isArray(realEntities)) return null;
    return realEntities
      .filter((e) => {
        const cMatch = classFilter === 'All Classes' || e.class === classFilter;
        const vMatch = vicariateFilter === 'All Vicariates' || e.vicariate === vicariateFilter;
        const dMatch = districtFilter === 'All Districts' || e.district === districtFilter;
        return cMatch && vMatch && dMatch;
      })
      .map((e) => e.id)
      .filter((id): id is string => Boolean(id));
  }, [entityType, filterMode, classFilter, vicariateFilter, districtFilter, realEntities]);

  // Same scope resolution as the financial-trend fetch above, reused by the
  // Collections Breakdown legend's hover preview (Item 8) so its
  // sub-category numbers always match whatever scope the chart itself is
  // currently showing.
  const breakdownScopeParams = useMemo(
    () => ({
      institutionId: filterMode === 'per-entity' && selectedParishInstitutionId ? selectedParishInstitutionId : 'all',
      vicariates: selectedVicariateScope ?? undefined,
      institutionIds: selectedInstitutionScopeIds ?? undefined,
    }),
    [filterMode, selectedParishInstitutionId, selectedVicariateScope, selectedInstitutionScopeIds],
  );

  // Real descriptive analytics (Parishes only). Each chart keeps its mock
  // dataset as the fallback: a failed or insufficient response leaves the
  // corresponding api* state null and the existing static rendering intact.
  const [apiParishCluster, setApiParishCluster] = useState<any | null>(null);
  useEffect(() => {
    if (entityType !== 'Parishes') return;
    let cancelled = false;
    apiClient
      .getParishCluster()
      .then((res: any) => {
        if (cancelled) return;
        if (res?.data_sufficient !== false && res?.cluster_counts && (res?.parishes?.length ?? 0) > 0) {
          setApiParishCluster(res);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  useEffect(() => {
    if (entityType !== 'Parishes') {
      setApiParishFinancialTrend(null);
      setApiParishSeasonality(null);
      setIsDescriptiveLoading(false);
      return;
    }
    if (filterMode === 'per-entity' && !selectedParishInstitutionId) {
      setApiParishFinancialTrend(null);
      setApiParishSeasonality(null);
      setIsDescriptiveLoading(false);
      return;
    }

    const institutionId = filterMode === 'per-entity' ? selectedParishInstitutionId! : 'all';
    const vicariates = selectedVicariateScope ?? undefined;
    const institutionIds = selectedInstitutionScopeIds ?? undefined;
    if (institutionIds && institutionIds.length === 0) {
      // District/Class filter (combined with Vicariate) matched zero real
      // parishes — sending institution_ids=[] would be indistinguishable
      // from "no filter" to the API client, which would silently fall back
      // to unscoped diocese-wide data. Treat this the same as the
      // per-entity-with-no-selection case above: an honest "no data" state.
      setApiParishFinancialTrend(null);
      setApiParishSeasonality(null);
      setIsDescriptiveLoading(false);
      return;
    }
    // `year` is included here even though monthly_series itself is always
    // full unscoped history now (the backend stopped date-filtering that
    // part — see financial_trend.py's _fetch_and_process_aws_parish) —
    // vicariate_totals/parish_totals/disbursement_categories in the same
    // response are still genuinely year-scoped server-side, so a request
    // for Year 2024 and Year 2026 can return different rollups even with
    // byte-identical monthly_series. Caching without `year` would serve one
    // year's rollups (e.g. the chart data) under another year's key.
    const requestKey = JSON.stringify({
      institutionId,
      year,
      vicariates: vicariates ? [...vicariates].sort() : [],
      institutionIds: institutionIds ? [...institutionIds].sort() : [],
    });
    const cachedFinancialTrend = financialTrendCacheRef.current.get(requestKey);
    let cancelled = false;
    setIsDescriptiveLoading(true);
    if (cachedFinancialTrend) setApiParishFinancialTrend(cachedFinancialTrend);

    Promise.all([
      // timeframe: 'all' + year: the backend returns full unscoped
      // monthly_series regardless of year (parishTrendData/kpiData/
      // kpiYoyTrends filter that down client-side by year, then 6m/12m),
      // but still scopes vicariate_totals/parish_totals/
      // disbursement_categories to this specific year — so the Vicariate/
      // Parish drill-down chart honestly reflects the selected Year (e.g.
      // shows "no data" for a year with none) instead of silently falling
      // back to the backend's own trailing-12-months default.
      apiClient
        .getFinancialTrend(
          'parish',
          institutionId,
          institutionIds
            ? { year, timeframe: 'all', institutionIds }
            : { year, timeframe: 'all', vicariates },
        )
        .then((res: any) => {
          if (cancelled) return;
          const usable =
            res?.data_sufficient !== false &&
            Array.isArray(res?.monthly_series) &&
            res.monthly_series.length > 0;
          if (usable) {
            financialTrendCacheRef.current.set(requestKey, res);
            setApiParishFinancialTrend(res);
          } else if (!cachedFinancialTrend) {
            setApiParishFinancialTrend(null);
          }
        })
        .catch(() => {
          if (!cancelled && !cachedFinancialTrend) setApiParishFinancialTrend(null);
        }),
      apiClient
        .getSeasonalityTrend('parish', institutionId, {
          year,
          timeframe: timeframe === '6m' ? '6m' : timeframe === '1y' ? '12m' : 'all',
        })
        .then((res: any) => {
          if (cancelled) return;
          const usable =
            res?.data_sufficient !== false &&
            Array.isArray(res?.monthly_trend) &&
            res.monthly_trend.length > 0;
          setApiParishSeasonality(usable ? res : null);
        })
        .catch(() => {
          if (!cancelled) setApiParishSeasonality(null);
        }),
    ]).then(() => {
      // Guarded the same way as every state update above — if a newer filter
      // change already superseded this request, let *that* effect run be the
      // one that clears the loading flag once it finishes, not this stale one.
      if (!cancelled) setIsDescriptiveLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    entityType,
    filterMode,
    selectedParishInstitutionId,
    selectedVicariateScope,
    selectedInstitutionScopeIds,
    timeframe,
    year,
  ]);

  // Live champion-vs-candidates comparison for the Predictive tab's forecast
  // chart — only fetchable for one specific parish (see apiParishForecast's
  // declaration above for why "All Parishes" is excluded). Independent of
  // the financial-trend/seasonality effect above: this doesn't need
  // vicariate/year scoping, so it only re-fetches on an actual parish change.
  useEffect(() => {
    if (entityType !== 'Parishes' || filterMode !== 'per-entity' || !selectedParishInstitutionId) {
      setApiParishForecast(null);
      return;
    }
    let cancelled = false;
    apiClient
      .getFinancialForecast('parish', selectedParishInstitutionId, 12)
      .then((res: any) => {
        if (!cancelled) setApiParishForecast(res);
      })
      .catch(() => {
        if (!cancelled) setApiParishForecast(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, filterMode, selectedParishInstitutionId]);

  // Same-month-last-year % change for each KPI tile, matching the "VS LY"
  useEffect(() => {
    if (!initialEntityFilter) return;
    setEntityFilter(initialEntityFilter);
    setFilterMode('per-entity');
    setDistrictFilter('All Districts');
    setVicariateFilter('All Vicariates');
    setClassFilter('All Classes');
  }, [initialEntityFilter]);

  const vocationSourceData = [
    { name: 'Parish Youth Groups', value: 45 },
    { name: 'Diocesan Schools', value: 30 },
    { name: 'University Ministry', value: 15 },
    { name: 'Direct Applications', value: 10 },
  ];
  const VOCATION_SOURCE_COLORS = ['#1a472a', '#D4AF37', '#4ade80', '#E6C27A'];

  const contributionData = useMemo(() => {
    const entities = getEntitiesData(entityType);

    if (contributionView === 'entity') {
      const total = entities.reduce((sum, p) => sum + (p.collections || 0), 0);
      const data = entities.map((p) => ({
        name: p.name,
        value: total > 0 ? Math.round(((p.collections || 0) / total) * 100) : 0,
        actualValue: p.collections || 0,
      }));
      return contributionSortOrder === 'asc'
        ? data.sort((a, b) => a.actualValue - b.actualValue).slice(0, 10)
        : data.sort((a, b) => b.actualValue - a.actualValue).slice(0, 10);
    }

    // Calculate dynamic contribution based on entities
    const vicariateTotals: Record<string, number> = {};
    entities.forEach((p) => {
      const v = p.vicariate || 'Other';
      vicariateTotals[v] = (vicariateTotals[v] || 0) + (p.collections || 0);
    });

    const total = Object.values(vicariateTotals).reduce((a, b) => a + b, 0);

    const data = Object.entries(vicariateTotals).map(([name, value]) => ({
      name,
      value: total > 0 ? Math.round((value / total) * 100) : 0,
      actualValue: value,
    }));
    return contributionSortOrder === 'asc'
      ? data.sort((a, b) => a.actualValue - b.actualValue)
      : data.sort((a, b) => b.actualValue - a.actualValue);
  }, [entityType, contributionView, contributionSortOrder]);

  useEffect(() => {
    setSelectedVicariate(null);
  }, [contributionView, entityType]);

  const parishContributionData = useMemo(() => {
    if (!selectedVicariate) return [];

    const entities = getEntitiesData(entityType);
    const entitiesInVicariate = entities.filter((p) => p.vicariate === selectedVicariate);
    const total = entitiesInVicariate.reduce((sum, p) => sum + (p.collections || 0), 0);

    const data = entitiesInVicariate.map((p) => ({
      name: p.name,
      value: total > 0 ? Math.round(((p.collections || 0) / total) * 100) : 0,
      actualValue: p.collections || 0,
    }));
    return contributionSortOrder === 'asc'
      ? data.sort((a, b) => a.actualValue - b.actualValue)
      : data.sort((a, b) => b.actualValue - a.actualValue);
  }, [selectedVicariate, contributionSortOrder, entityType]);

  const filteredTrendData = useMemo(() => {
    if (timeframe === '6m') return trendData.slice(-6);
    return trendData;
  }, [timeframe]);

  const filteredSeasonalityData = useMemo(() => {
    if (timeframe === '6m') return seasonalityData.slice(-3);
    if (timeframe === '1y') return seasonalityData.slice(-6);
    return seasonalityData;
  }, [timeframe]);

  const seminaryEnrollmentData = useMemo(() => {
    if (entityType !== 'Seminaries') return [];
    return [
      { name: 'St. Peter', enrollment: 45, capacity: 60, staff: 12 },
      { name: 'Holy Cross', enrollment: 38, capacity: 50, staff: 10 },
    ];
  }, [entityType]);

  const seminaryCostData = [
    { name: 'Faculty & Staff', value: 45 },
    { name: 'Maintenance', value: 20 },
    { name: 'Food & Board', value: 15 },
    { name: 'Utilities', value: 12 },
    { name: 'Others', value: 8 },
  ];
  const SEMINARY_COST_COLORS = ['#1a472a', '#D4AF37', '#4ade80', '#E6C27A', '#1a472a'];

  // null while the real list for this tab is still loading (mock renders
  // briefly instead of flashing empty); once loaded, real data always wins —
  // including a genuinely empty [] for entity types with no institutions yet.
  const currentEntities = useMemo(() => {
    if (realEntities === null) return getEntitiesData(entityType);
    // realEntities already carries each institution's real per-institution
    // district (added by getFinancialProfiles) — no need to re-derive one
    // from vicariate. The real data shows a single vicariate can span
    // multiple districts (or none), so a vicariate-keyed lookup was never a
    // valid stand-in to begin with.
    return realEntities;
  }, [entityType, realEntities]);

  useEffect(() => {
    let cancelled = false;
    const fetchHealthScores = async () => {
      setIsHealthScoreLoading(true);
      // Single batch request — per-entity requests (90+) starve the browser
      // connection pool and block every other API call in dev. In 'scoped'
      // mode, year/timeframe narrow the score to the same window the rest
      // of the dashboard is looking at; in 'overall' mode both are omitted
      // so the backend falls back to each entity's full trailing history.
      try {
        const scores = await dataService.calculateHealthScores(
          currentEntities.map((e: any) => ({
            // Real entities carry their institution UUID (e.id) — that's what
            // financial_records is actually keyed on. Falling back to e.name
            // only applies to the mock placeholder shown while realEntities is
            // still loading, which was never going to resolve to a real record
            // anyway.
            entityId: e.id ?? e.name,
            entityType: entityType === 'Parishes' ? 'parish' : entityType === 'Seminaries' ? 'seminary' : 'school',
            entityClass: e.class,
          })),
          healthScoreViewMode === 'scoped' ? year : undefined,
          healthScoreViewMode === 'scoped'
            ? timeframe === '6m'
              ? '6m'
              : timeframe === '1y'
                ? '12m'
                : 'all'
            : undefined,
        );
        if (cancelled) return;
        setHealthScores(scores);
      } catch {
        // Same honest-degradation convention as every other fetch in this
        // file: a failed/unavailable backend (e.g. the Python analytics
        // service briefly down) clears to an empty, not-fabricated state
        // instead of throwing an unhandled rejection that blanks the page.
        if (!cancelled) setHealthScores([]);
      } finally {
        if (!cancelled) setIsHealthScoreLoading(false);
      }
    };
    if (!isLoading) fetchHealthScores();
    return () => {
      cancelled = true;
    };
  }, [isLoading, entityType, currentEntities, year, timeframe, healthScoreViewMode]);

  const filteredEntities = useMemo(() => {
    return currentEntities.filter((p: any) => {
      const dMatch = entityType === 'Seminaries' || districtFilter === 'All Districts' || p.district === districtFilter;
      const vMatch =
        entityType === 'Seminaries' || vicariateFilter === 'All Vicariates' || p.vicariate === vicariateFilter;
      const cMatch = classFilter === 'All Classes' || p.class === classFilter;
      const pMatch = entityFilter === 'All Entities' || p.name === entityFilter;
      return dMatch && vMatch && cMatch && pMatch;
    });
  }, [currentEntities, districtFilter, vicariateFilter, classFilter, entityFilter, entityType]);

  const barChartData = useMemo(() => {
    // Only Vicariate → Parish levels feed this chart now — once a parish is
    // selected (drillParish), the full IAFR report table replaces the chart
    // entirely, so there's no "below Parish" level for this to compute.
    if (entityType === 'Parishes' && apiParishFinancialTrend) {
      const rows = selectedBarVicariate
        ? apiParishFinancialTrend.parish_totals
            ?.filter((row: any) => row.vicariate === selectedBarVicariate)
            .map((row: any) => ({
              name: row.name,
              collections: Number(row.total_receipts ?? 0),
              disbursements: Number(row.total_expenses ?? 0),
            }))
        : apiParishFinancialTrend.vicariate_totals?.map((row: any) => ({
            name: row.vicariate,
            collections: Number(row.total_receipts ?? 0),
            disbursements: Number(row.total_expenses ?? 0),
            isVicariate: true,
          }));
      if (Array.isArray(rows) && rows.length > 0) {
        return [...rows].sort((a: any, b: any) => b.collections - a.collections);
      }
      // vicariate_totals/parish_totals are diocese-wide-only rollups the
      // backend deliberately omits once already scoped to a specific
      // Vicariate/District (see financial_trend.py) — real data was
      // fetched, this particular breakdown just isn't meaningful for that
      // scope. Falling through to the filteredEntities grouping below would
      // silently substitute a different, Supabase-derived data source that
      // ignores the real AWS-backed scope entirely — worse than empty.
      return [];
    }

    if (entityType === 'Seminaries') {
      return filteredEntities.map((e) => ({
        ...e,
        disbursements: e.disbursements || Math.round(e.collections * 0.82),
      }));
    }

    if (selectedBarVicariate) {
      const groupKey = entityType === 'Diocesan Schools' ? 'cluster' : 'vicariate';
      return filteredEntities
        .filter((e) => e[groupKey] === selectedBarVicariate)
        .map((e) => ({
          ...e,
          disbursements: e.disbursements || Math.round(e.collections * 0.82),
        }))
        .sort((a, b) => b.collections - a.collections);
    }

    // Group by cluster (schools) or vicariate (parishes)
    const groupKey = entityType === 'Diocesan Schools' ? 'cluster' : 'vicariate';
    const totals: Record<string, { collections: number; disbursements: number }> = {};
    filteredEntities.forEach((e) => {
      const v = e[groupKey] || 'Other';
      if (!totals[v]) totals[v] = { collections: 0, disbursements: 0 };
      totals[v].collections += e.collections;
      totals[v].disbursements += e.disbursements || Math.round(e.collections * 0.82);
    });

    return Object.entries(totals)
      .map(([name, data]) => ({
        name,
        collections: data.collections,
        disbursements: data.disbursements,
        isVicariate: true,
      }))
      .sort((a, b) => b.collections - a.collections);
  }, [filteredEntities, selectedBarVicariate, entityType, apiParishFinancialTrend]);

  // Adaptive value scaling for the entity/drill bar chart: vicariate totals
  // are tens of millions, but a deep account-level drill can be a few
  // thousand pesos — a fixed /1,000,000 formatter would label those "0.0M".
  const barChartMax = useMemo(
    () => Math.max(0, ...barChartData.map((d: any) => Math.max(d.collections || 0, d.disbursements || 0))),
    [barChartData],
  );
  const formatBarValue = (v: number) =>
    v <= 0
      ? ''
      : barChartMax >= 2_000_000
        ? `${(v / 1_000_000).toFixed(1)}M`
        : v >= 1000
          ? `${Math.round(v / 1000)}k`
          : `${Math.round(v)}`;
  const formatBarAxis = (v: number) =>
    v === 0 ? '0' : barChartMax >= 2_000_000 ? `${Math.round(v / 1_000_000)}M` : `${Math.round(v / 1000)}k`;

  useEffect(() => {
    setSelectedBarVicariate(null);
    setDrillParish(null);
  }, [entityType]);

  // Reset the legend hover/pin cache whenever the underlying scope changes so
  // a stale preview or pinned value from a different Vicariate/Class/parish
  // can't linger.
  useEffect(() => {
    setHoveredLegendKey(null);
    setPinnedLegendKey(null);
    setLegendBreakdownCache({});
  }, [entityType, breakdownScopeParams.institutionId, breakdownScopeParams.vicariates, breakdownScopeParams.institutionIds, year]);

  useEffect(() => {
    const config = hoveredLegendKey ? LEGEND_BREAKDOWN_CONFIG[hoveredLegendKey] : undefined;
    if (entityType !== 'Parishes' || !hoveredLegendKey || !config || legendBreakdownCache[hoveredLegendKey]) {
      return;
    }
    let cancelled = false;
    apiClient
      .getFinancialBreakdown(breakdownScopeParams.institutionId, {
        year,
        sectionCode: config.sectionCode,
        subsectionCode: config.subsectionCode,
        vicariates: breakdownScopeParams.vicariates,
        institutionIds: breakdownScopeParams.institutionIds,
      })
      .then((res: any) => {
        if (cancelled) return;
        setLegendBreakdownCache((prev) => ({
          ...prev,
          [hoveredLegendKey]: res?.data_sufficient !== false && Array.isArray(res?.items) ? res : null,
        }));
      })
      .catch(() => {
        if (!cancelled) setLegendBreakdownCache((prev) => ({ ...prev, [hoveredLegendKey]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, hoveredLegendKey, breakdownScopeParams, year, legendBreakdownCache]);

  // Sacraments can't get the same itemized-by-account breakdown as the other
  // 3 legend items (see the note above _AWS_CATEGORY_COLS in
  // financial_trend.py: sacraments_parish_share is a flat-rate multiplication
  // of the aggregate gross total, not tracked per sacrament type). It can
  // show its own real 2-line split, though — Parish Share + Over/Above are
  // sacraments_parish_share and sacraments_over_above straight off the same
  // rows already rendered in the chart, so they sum exactly to the bars
  // currently on screen.
  const sacramentsBreakdownTotals = useMemo(
    () =>
      windowedTrendData.reduce(
        (acc: { parishShare: number; overAbove: number }, row: any) => ({
          parishShare: acc.parishShare + Number(row.sacraments_parish_share ?? 0),
          overAbove: acc.overAbove + Number(row.sacraments_over_above ?? 0),
        }),
        { parishShare: 0, overAbove: 0 }
      ),
    [windowedTrendData]
  );

  const renderSacramentsBreakdownPopover = () => {
    const showValues = pinnedLegendKey === 'sacraments_breakdown';
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 w-60 bg-white p-3 text-left"
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
      >
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Breakdown</p>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-600">Parish Share</span>
            {showValues && (
              <span className="font-bold text-church-green whitespace-nowrap">
                {formatCurrency(sacramentsBreakdownTotals.parishShare)}
              </span>
            )}
          </li>
          <li className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-600">Charge Over/Above</span>
            {showValues && (
              <span className="font-bold text-church-green whitespace-nowrap">
                {formatCurrency(sacramentsBreakdownTotals.overAbove)}
              </span>
            )}
          </li>
        </ul>
        {showValues && (
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold border-t border-gray-100 mt-2 pt-2">
            <span className="text-church-black">Total</span>
            <span className="text-church-green whitespace-nowrap">
              {formatCurrency(sacramentsBreakdownTotals.parishShare + sacramentsBreakdownTotals.overAbove)}
            </span>
          </div>
        )}
        {showValues ? (
          <p className="text-[10px] text-gray-400 leading-snug mt-2">
            Parish Share is net of the diocese/bishop&apos;s-fund share; not broken down further by sacrament type
            since that split is a flat rate applied to the parish&apos;s combined total, not tracked per sacrament.
          </p>
        ) : (
          <p className="text-[10px] text-gray-400 mt-2">Click to see amounts.</p>
        )}
      </div>
    );
  };

  // Popover for the live-fetched legend items (LEGEND_BREAKDOWN_CONFIG) —
  // Sacraments has its own local popover, see renderSacramentsBreakdownPopover
  // above. Hover shows labels only; click pins the same popover open with
  // amounts, reading whichever of the endpoint's receipts/expenses columns
  // actually holds this key's real numbers (amountField).
  const renderLegendBreakdownPopover = (key: string) => {
    const data = legendBreakdownCache[key];
    const showValues = pinnedLegendKey === key;
    const amountField = LEGEND_BREAKDOWN_CONFIG[key]?.amountField ?? 'receipts';
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 w-60 bg-white p-3 text-left"
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
      >
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Breakdown</p>
        {data === undefined && <p className="text-[11px] text-gray-400">Loading…</p>}
        {data === null && <p className="text-[11px] text-gray-400">No breakdown available.</p>}
        {Array.isArray(data?.items) && data.items.length > 0 && (
          <ul className="space-y-1.5">
            {data.items.map((item: any) => (
              <li key={item.key} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-gray-600">{item.label}</span>
                {showValues && (
                  <span className="font-bold text-church-green whitespace-nowrap">
                    {formatCurrency(item[amountField])}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {showValues && Array.isArray(data?.items) && data.items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold border-t border-gray-100 mt-2 pt-2">
            <span className="text-church-black">Total</span>
            <span className="text-church-green whitespace-nowrap">
              {formatCurrency(data.items.reduce((sum: number, item: any) => sum + (item[amountField] ?? 0), 0))}
            </span>
          </div>
        )}
        {Array.isArray(data?.items) && data.items.length > 0 && !showValues && (
          <p className="text-[10px] text-gray-400 mt-2">Click to see amounts.</p>
        )}
      </div>
    );
  };

  // Vicariate chart's own "Collections"/"Disbursements" legend — hover-only,
  // label-only, no fetch, no pin. Its bars already have a separate,
  // pre-existing click-to-drill mechanism (Vicariate → Parish → IAFR Section
  // → Subsection → Account) that reveals real numbers a different way, so
  // this popover only ever explains what each category is made of.
  const renderVicariateCategoryPopover = (kind: 'collections' | 'disbursements') => (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 w-52 bg-white p-3 text-left"
      style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
    >
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Made Up Of</p>
      <ul className="space-y-1">
        {(kind === 'collections'
          ? ['Mass Collections', 'Sacraments', 'Other Receipts', 'Other Collections']
          : ['Parish Expenses', 'Pastoral Expenses']
        ).map((label) => (
          <li key={label} className="text-[11px] text-gray-600">
            {label}
          </li>
        ))}
      </ul>
    </div>
  );

  const filteredTopTierData = useMemo(() => {
    let data = getTopTierData(entityType).map((item) => ({
      ...item,
      district: VICARIATE_TO_DISTRICT[item.vicariate] || 'Other',
    }));

    return data.filter((e: any) => {
      const dMatch = entityType === 'Seminaries' || districtFilter === 'All Districts' || e.district === districtFilter;
      const vMatch =
        entityType === 'Seminaries' || vicariateFilter === 'All Vicariates' || e.vicariate === vicariateFilter;
      const cMatch = classFilter === 'All Classes' || e.class === classFilter;
      const pMatch = entityFilter === 'All Entities' || e.name === entityFilter;
      return dMatch && vMatch && cMatch && pMatch;
    });
  }, [entityType, districtFilter, vicariateFilter, classFilter, entityFilter]);

  const dynamicTrendData = useMemo(() => {
    // Real AWS data source for Parishes — an empty/failed fetch is an
    // honest "no data," never a silent fall-through to the scaled mock.
    if (entityType === 'Parishes') return parishTrendData ?? [];
    const scale = filteredEntities.length / (currentEntities.length || 1);
    return filteredTrendData.map((d) => ({
      ...d,
      collections: d.collections * scale,
      forecast: d.forecast * scale,
    }));
  }, [entityType, parishTrendData, filteredEntities, currentEntities, filteredTrendData]);

  const dynamicSeasonalityData = useMemo(() => {
    if (entityType === 'Parishes') {
      if (Array.isArray(apiParishSeasonality?.monthly_trend) && apiParishSeasonality.monthly_trend.length > 0) {
        return apiParishSeasonality.monthly_trend.map((row: any) => ({
          month: row.month,
          value: Number(row.avg_collection ?? 0),
        }));
      }
      return [];
    }
    const scale = filteredEntities.length / (currentEntities.length || 1);
    return filteredSeasonalityData.map((d) => ({
      ...d,
      value: d.value * scale,
    }));
  }, [entityType, apiParishSeasonality, filteredEntities, currentEntities, filteredSeasonalityData]);

  const parishSeasonalityHighlights = useMemo(() => {
    const events = apiParishSeasonality?.event_averages;
    if (!Array.isArray(events) || events.length === 0) return [];
    return [...events]
      .sort((a: any, b: any) => Number(b.vs_baseline_pct ?? 0) - Number(a.vs_baseline_pct ?? 0))
      .slice(0, 3);
  }, [apiParishSeasonality]);

  // Full liturgical event breakdown (all 11, not just the top-3 headline
  // above), split into the two classification axes the backend tags each
  // event with: "season" (mutually exclusive — every month is exactly one)
  // vs. "day_type" (rank/day-of-week flags that can co-occur with any
  // season, e.g. Simbang Gabi falls within the Christmas/Advent season).
  // Showing them ungrouped would look like double-counting the same months.
  const parishSeasonalityGrouped = useMemo(() => {
    const events = apiParishSeasonality?.event_averages;
    if (!Array.isArray(events) || events.length === 0) return { seasons: [], dayTypes: [] };
    const sorted = [...events].sort(
      (a: any, b: any) => Number(b.vs_baseline_pct ?? 0) - Number(a.vs_baseline_pct ?? 0),
    );
    return {
      seasons: sorted.filter((e: any) => e.event_group === 'season'),
      dayTypes: sorted.filter((e: any) => e.event_group !== 'season'),
    };
  }, [apiParishSeasonality]);

  // Latest-month figures for the 3 top KPI tiles, read from the same
  // AWS-warehouse-backed fetch that powers the Collections Breakdown chart
  // below — real numbers, correctly scoped to whatever parish/vicariate/
  // district filter is active. 'N/A' (not a fabricated ratio) when no real
  // data is available for the current scope.
  // Total + Average across every month in the currently selected scope
  // (parishTrendData is already Year-scoped: 12 months for a specific year,
  // the full real history for "All Years") — replaces the old single-latest-
  // month snapshot, which showed the same figure for every Year selection
  // whenever the most recent real month happened to coincide (e.g. before
  // any 2026 records exist, both "2025" and "All Years" showed the same
  // Dec-2025 value). Net Surplus/Deficit is derived client-side from the
  // same two totals — no separate fetch needed.
  const kpiData = useMemo(() => {
    if (entityType === 'Parishes' && parishTrendData && parishTrendData.length > 0) {
      const n = parishTrendData.length;
      const totalCollections = parishTrendData.reduce((sum, row) => sum + row.total_receipts, 0);
      const totalDisbursements = parishTrendData.reduce((sum, row) => sum + row.total_expenses, 0);
      const totalNet = totalCollections - totalDisbursements;
      return {
        collectionsTotal: formatCurrency(totalCollections),
        collectionsAvg: formatCurrency(totalCollections / n),
        disbursementsTotal: formatCurrency(totalDisbursements),
        disbursementsAvg: formatCurrency(totalDisbursements / n),
        netTotal: formatCurrency(totalNet),
        netAvg: formatCurrency(totalNet / n),
        netIsDeficit: totalNet < 0,
      };
    }
    return {
      collectionsTotal: 'N/A',
      collectionsAvg: 'N/A',
      disbursementsTotal: 'N/A',
      disbursementsAvg: 'N/A',
      netTotal: 'N/A',
      netAvg: 'N/A',
      netIsDeficit: false,
    };
  }, [entityType, parishTrendData]);

  const districts = useMemo(
    () => ['All Districts', ...new Set(currentEntities.map((p) => p.district))].sort(),
    [currentEntities],
  );
  const vicariates = useMemo(() => {
    const filtered =
      districtFilter === 'All Districts'
        ? currentEntities
        : currentEntities.filter((p) => p.district === districtFilter);
    return ['All Vicariates', ...new Set(filtered.map((p) => p.vicariate))].sort();
  }, [currentEntities, districtFilter]);
  const classes = ['All Classes', 'Class A', 'Class B', 'Class C', 'Class D'];
  const entityNames = ['All Entities', ...new Set(currentEntities.map((p) => p.name))];

  // score.entityId is now a real institution UUID (see fetchHealthScores
  // above) — this resolves it back to a display name for the rankings list.
  const entityNameById = useMemo(
    () => new Map(currentEntities.map((e: any) => [e.id ?? e.name, e.name])),
    [currentEntities],
  );

  const filteredHealthScores = useMemo(() => {
    // Matches the entityId ?? name fallback used when the scores were
    // fetched, so real entities (keyed by UUID) and mock placeholders
    // (keyed by name) both resolve correctly here.
    const filteredIds = new Set(filteredEntities.map((e: any) => e.id ?? e.name));
    return healthScores.filter((s) => filteredIds.has(s.entityId));
  }, [healthScores, filteredEntities]);

  // Now that Health Score can be scoped to the selected Year/Timeframe, a
  // request can genuinely have too little data to score (e.g. year 2026,
  // before any records exist) — dataSufficient=false marks those as
  // placeholders, not real measurements, so they're excluded from every
  // aggregate/ranking below rather than quietly dragging the average down.
  const sufficientHealthScores = useMemo(
    () => filteredHealthScores.filter((s) => s.dataSufficient !== false),
    [filteredHealthScores],
  );

  const averageScore = useMemo(() => {
    if (sufficientHealthScores.length === 0) return null;
    return Math.round(
      sufficientHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) / sufficientHealthScores.length,
    );
  }, [sufficientHealthScores]);

  // The actual year range the displayed score(s) were computed from — spans
  // the earliest periodStartYear to the latest periodEndYear across every
  // entity folded into averageScore, so the label is honest even when
  // several parishes (each with a slightly different history) are averaged
  // together. null when none of them returned a real (non-default) period.
  const healthScorePeriodLabel = useMemo(() => {
    let start: number | undefined;
    let end: number | undefined;
    for (const s of sufficientHealthScores) {
      if (s.periodStartYear == null || s.periodEndYear == null) continue;
      start = start == null ? s.periodStartYear : Math.min(start, s.periodStartYear);
      end = end == null ? s.periodEndYear : Math.max(end, s.periodEndYear);
    }
    if (start == null || end == null) return null;
    return start === end ? `${start}` : `${start}-${end}`;
  }, [sufficientHealthScores]);

  const averageDimensions = useMemo(() => {
    if (sufficientHealthScores.length === 0)
      return { liquidity: 75, sustainability: 68, efficiency: 82, stability: 65, growth: 55 };
    const count = sufficientHealthScores.length;
    return {
      liquidity: Math.round(sufficientHealthScores.reduce((sum, s) => sum + s.dimensions.liquidity, 0) / count),
      sustainability: Math.round(
        sufficientHealthScores.reduce((sum, s) => sum + s.dimensions.sustainability, 0) / count,
      ),
      efficiency: Math.round(sufficientHealthScores.reduce((sum, s) => sum + s.dimensions.efficiency, 0) / count),
      stability: Math.round(sufficientHealthScores.reduce((sum, s) => sum + s.dimensions.stability, 0) / count),
      growth: Math.round(sufficientHealthScores.reduce((sum, s) => sum + s.dimensions.growth, 0) / count),
    };
  }, [sufficientHealthScores]);

  const trendText = useMemo(() => {
    if (averageScore == null) return 'Insufficient Data';
    if (averageScore > 75) return 'Optimal';
    if (averageScore > 60) return 'Stable';
    return 'Needs Attention';
  }, [averageScore]);

  // Change/Growth always reads chronologically (later period vs earlier
  // period) regardless of which picker (Period 1 or Period 2) the user put
  // each date in — otherwise picking a more recent date into "Period 1"
  // and an older one into "Period 2" shows a misleading decrease even when
  // the real trend over time is growth. The two value boxes and bar chart
  // still display in whatever order the user picked (p1/p2 stay as typed).
  const cmpChronKey = (m: CmpMonth, y: CmpYear) => Number(y) * 100 + (CMP_MONTHS.indexOf(m) + 1);

  // Period Comparison derived data
  const cmpResult = useMemo(() => {
    if (entityType === 'Parishes') {
      // Sourced from the full unfiltered history (apiParishFinancialTrend),
      // not the Year-scoped parishTrendData — Period Comparison lets the
      // user pick any two month/year pairs independent of the global Year
      // filter, and reading from the filtered view meant a comparison
      // reaching outside the selected Year silently fell through to the
      // fabricated getDiocesanMonthly path below instead of an honest
      // "no data" state.
      const allRows = apiParishFinancialTrend?.monthly_series;
      const monthly = new Map<string, { collections: number; disbursements: number }>();
      if (Array.isArray(allRows)) {
        allRows.forEach((row: any) => {
          if (!row.period) return;
          monthly.set(row.period, {
            collections: Number(row.total_receipts ?? 0),
            disbursements: Number(row.expenses_parish ?? 0) + Number(row.expenses_pastoral ?? 0),
          });
        });
      }
      const monthKey = (m: CmpMonth, y: CmpYear) => `${y}-${String(CMP_MONTHS.indexOf(m) + 1).padStart(2, '0')}`;
      const m1 = monthly.get(monthKey(cmpMonth1, cmpYear1));
      const m2 = monthly.get(monthKey(cmpMonth2, cmpYear2));
      // Real AWS-backed data source — an honest "no data for this
      // comparison" (never fall back to fabricated diocesan numbers, unlike
      // the Seminaries/Schools mock path below which still has no real
      // per-institution pipeline).
      if (!m1 || !m2) return null;
      const v1 = m1[cmpMetric];
      const v2 = m2[cmpMetric];
      const chronological = cmpChronKey(cmpMonth1, cmpYear1) <= cmpChronKey(cmpMonth2, cmpYear2);
      const earlierValue = chronological ? v1 : v2;
      const laterValue = chronological ? v2 : v1;
      const delta = laterValue - earlierValue;
      const pct = earlierValue > 0 ? (delta / earlierValue) * 100 : 0;
      return {
        p1: { label: `${cmpMonth1} ${cmpYear1}`, value: v1 },
        p2: { label: `${cmpMonth2} ${cmpYear2}`, value: v2 },
        delta,
        pct,
        baseLabel: chronological ? `${cmpMonth1} ${cmpYear1}` : `${cmpMonth2} ${cmpYear2}`,
        barData: [
          { period: `${cmpMonth1} ${cmpYear1}`, value: v1 },
          { period: `${cmpMonth2} ${cmpYear2}`, value: v2 },
        ],
      };
    }
    const monthly1 = getDiocesanMonthly(entityType, cmpYear1);
    const monthly2 = getDiocesanMonthly(entityType, cmpYear2);
    const m1 = monthly1.find((d) => d.month === cmpMonth1);
    const m2 = monthly2.find((d) => d.month === cmpMonth2);
    if (!m1 || !m2) return null;
    const v1 = m1[cmpMetric];
    const v2 = m2[cmpMetric];
    const chronological = cmpChronKey(cmpMonth1, cmpYear1) <= cmpChronKey(cmpMonth2, cmpYear2);
    const earlierValue = chronological ? v1 : v2;
    const laterValue = chronological ? v2 : v1;
    const delta = laterValue - earlierValue;
    const pct = earlierValue > 0 ? (delta / earlierValue) * 100 : 0;
    return {
      p1: { label: `${cmpMonth1} ${cmpYear1}`, value: v1 },
      p2: { label: `${cmpMonth2} ${cmpYear2}`, value: v2 },
      delta,
      pct,
      baseLabel: chronological ? `${cmpMonth1} ${cmpYear1}` : `${cmpMonth2} ${cmpYear2}`,
      barData: [
        { period: `${cmpMonth1} ${cmpYear1}`, value: v1 },
        { period: `${cmpMonth2} ${cmpYear2}`, value: v2 },
      ],
    };
  }, [entityType, apiParishFinancialTrend, cmpMetric, cmpMonth1, cmpYear1, cmpMonth2, cmpYear2]);

  const filteredDeclineData = useMemo(() => {
    // liveDeclineData already carries each parish's real district (see the
    // setLiveDeclineData population above) — no vicariate-derived stand-in.
    let data = liveDeclineData.filter((p: any) => {
        const dMatch =
          entityType === 'Seminaries' || districtFilter === 'All Districts' || p.district === districtFilter;
        const vMatch =
          entityType === 'Seminaries' || vicariateFilter === 'All Vicariates' || p.vicariate === vicariateFilter;
        const cMatch = classFilter === 'All Classes' || p.class === classFilter;
        const pMatch = entityFilter === 'All Entities' || p.name === entityFilter;
        const tMatch = trendDirectionFilter === 'all' || p.type === trendDirectionFilter;
        return dMatch && vMatch && cMatch && pMatch && tMatch;
      });
    if (sortConfig) {
      data.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [
    liveDeclineData,
    districtFilter,
    vicariateFilter,
    classFilter,
    entityFilter,
    trendDirectionFilter,
    sortConfig,
    entityType,
  ]);

  const handleSort = (key: string) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === 'asc' ? { key, direction: 'desc' } : { key, direction: 'asc' },
    );
  };

  // Skeleton pulse instead of the value itself while a filter/year/parish
  // change is refetching — so the tile visibly says "updating" rather than
  // silently holding the previous number with no indication anything is
  // happening (which is what made switches look stuck before).
  const renderKpiValue = (value: string) => {
    if (entityType === 'Parishes' && isDescriptiveLoading) {
      return <div className="h-[1.6rem] md:h-[1.9rem] w-[70%] bg-gray-100 rounded-lg animate-pulse" />;
    }
    return value;
  };

  // Smaller counterpart of renderKpiValue for a tile's secondary "Average"
  // line (Item 11) — same loading-skeleton convention, sized for inline text
  // rather than the large headline figure.
  const renderKpiSubValue = (value: string) => {
    if (entityType === 'Parishes' && isDescriptiveLoading) {
      return <span className="inline-block h-3 w-14 bg-gray-100 rounded animate-pulse align-middle" />;
    }
    return value;
  };

  // Semi-transparent overlay for chart containers while a filter/year/parish
  // change is refetching — the old chart stays visible-but-dimmed underneath
  // instead of flashing to empty, so it reads as "updating" not "broken."
  // Caller's wrapping element needs position: relative.
  const renderChartLoadingOverlay = () =>
    entityType === 'Parishes' &&
    (isDescriptiveLoading || isDrillLoading) && (
      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-2xl">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-church-green animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Updating...</span>
        </div>
      </div>
    );

  // Same gating as renderChartLoadingOverlay, but styled for the dark
  // (bg-[#1A1A1A]) Event Trends card instead of the light chart cards.
  const renderDarkChartLoadingOverlay = () =>
    entityType === 'Parishes' &&
    isDescriptiveLoading && (
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-2xl">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Updating...</span>
        </div>
      </div>
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <InlineLoader label="Loading dashboard" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-100 max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-700 mb-2">Data Loading Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Diocesan Schools currently has zero registered institutions in the
  // system. Showing the fabricated mock dashboard here would misrepresent
  // real diocesan finances, so this tab tells the truth instead: nothing to
  // show yet. Seminaries (1 real institution) still render normally below —
  // its per-entity list is real even though its financial charts remain
  // Section-D mock data pending real submissions.
  if (entityType === 'Diocesan Schools' && realEntities !== null && realEntities.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-200 max-w-md">
          <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-church-black mb-2">No Schools Registered Yet</h2>
          <p className="text-gray-500">
            No diocesan schools have been added to the system, so there is no financial data to display for this tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-[1600px] mx-auto ${isEmbedded ? 'px-0 py-0' : 'px-4 md:px-8 py-6'} space-y-6`}>
      {' '}
      {/* Filter Bar */}
      <div className="bg-black text-white rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between shadow-2xl border border-white/10 transition-all duration-500 min-w-0">
        <div className="flex items-center gap-2 md:gap-6 flex-1 min-w-0">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2.5 px-3 md:px-5 py-2 rounded-xl transition-all duration-300 cursor-pointer focus:outline-none border shrink-0 ${
              showFilters
                ? 'bg-gold-500 border-gold-600 text-black shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Filter className={`w-4 h-4 ${showFilters ? 'text-black' : 'text-white/40'}`} />
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Filters</span>
          </button>

          {showFilters && (
            <div className="flex items-center gap-2 md:gap-6 flex-1 animate-in fade-in slide-in-from-left-4 duration-500 min-w-0">
              <div className="hidden md:block h-8 w-px bg-white/10 mx-2 shrink-0"></div>

              <div className="flex items-center gap-2 md:gap-6 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1 md:pb-0">
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 shrink-0">
                  <button
                    disabled={lockEntityFilter || isDescriptiveLoading}
                    onClick={() => {
                      if (lockEntityFilter || isDescriptiveLoading) return;
                      setFilterMode('all');
                      setEntityFilter('All Entities');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                      filterMode === 'all'
                        ? 'bg-gold-500 text-black shadow-lg'
                        : lockEntityFilter || isDescriptiveLoading
                          ? 'text-white/20 cursor-not-allowed'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    All
                  </button>
                  <button
                    disabled={isDescriptiveLoading}
                    onClick={() => {
                      if (isDescriptiveLoading) return;
                      setFilterMode('per-entity');
                      setVicariateFilter('All Vicariates');
                      setClassFilter('All Classes');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                      filterMode === 'per-entity'
                        ? 'bg-gold-500 text-black shadow-lg'
                        : isDescriptiveLoading
                          ? 'text-white/20 cursor-not-allowed'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Individual
                  </button>
                </div>

                <div className="hidden md:block h-6 w-px bg-white/20 mx-2 shrink-0"></div>

                <div className="flex items-center gap-4 shrink-0">
                  {filterMode === 'all' && (
                    <>
                      {entityType !== 'Seminaries' && (
                        <>
                          <div className="relative group min-w-[120px]">
                            <select
                              value={districtFilter}
                              disabled={isDescriptiveLoading}
                              onChange={(e) => {
                                setDistrictFilter(e.target.value);
                                setVicariateFilter('All Vicariates');
                              }}
                              className={`w-full bg-transparent text-xs md:text-sm font-medium transition-colors appearance-none pr-6 focus:outline-none ${
                                isDescriptiveLoading ? 'opacity-40 cursor-not-allowed' : 'hover:text-gold-400 cursor-pointer'
                              }`}
                            >
                              {districts.map((d) => (
                                <option key={d} value={d} className="bg-church-green">
                                  {d}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                          </div>
                          <div className="hidden md:block h-6 w-px bg-white/20 mx-2"></div>
                        </>
                      )}

                      {entityType !== 'Seminaries' && (
                        <div className="relative group min-w-[120px]">
                          <select
                            value={vicariateFilter}
                            disabled={isDescriptiveLoading}
                            onChange={(e) => setVicariateFilter(e.target.value)}
                            className={`w-full bg-transparent text-xs md:text-sm font-medium transition-colors appearance-none pr-6 focus:outline-none ${
                              isDescriptiveLoading ? 'opacity-40 cursor-not-allowed' : 'hover:text-gold-400 cursor-pointer'
                            }`}
                          >
                            {vicariates.map((v) => (
                              <option key={v} value={v} className="bg-church-green">
                                {stripVicariatePrefix(v)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                        </div>
                      )}

                      <div className="relative group min-w-[100px]">
                        <select
                          value={classFilter}
                          disabled={isDescriptiveLoading}
                          onChange={(e) => setClassFilter(e.target.value)}
                          className={`w-full bg-transparent text-xs md:text-sm font-medium transition-colors appearance-none pr-6 focus:outline-none ${
                            isDescriptiveLoading ? 'opacity-40 cursor-not-allowed' : 'hover:text-gold-400 cursor-pointer'
                          }`}
                        >
                          {classes.map((c) => (
                            <option key={c} value={c} className="bg-church-green">
                              {c}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                      </div>
                    </>
                  )}

                  {filterMode === 'per-entity' && (
                    <div className="relative group min-w-[150px]">
                      <select
                        value={entityFilter}
                        onChange={(e) => {
                          if (!lockEntityFilter && !isDescriptiveLoading) setEntityFilter(e.target.value);
                        }}
                        disabled={lockEntityFilter || isDescriptiveLoading}
                        className={`w-full bg-transparent text-xs md:text-sm font-medium transition-colors appearance-none pr-6 focus:outline-none ${
                          lockEntityFilter
                            ? 'text-gold-300 cursor-default'
                            : isDescriptiveLoading
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:text-gold-400 cursor-pointer'
                        }`}
                      >
                        {entityNames.map((p) => (
                          <option key={p} value={p} className="bg-church-green">
                            {p}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-10 h-10 bg-black rounded-xl border border-white/10 flex items-center justify-center p-1.5 shadow-2xl group-hover:scale-110 transition-transform duration-500 shrink-0 ml-4">
          <img
            src={APP_CONFIG.logoPath}
            alt="Diocese of San Pablo"
            className="w-full h-full object-contain filter brightness-110 drop-shadow-[0_0_5px_rgba(212,175,55,0.2)]"
          />
        </div>
      </div>
      <div>
        {/* Welcome & Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Welcome Card */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-[#FFFBF0] via-white to-white border-none shadow-xl flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>
            <div className="space-y-6 relative z-10 p-2">
              <div className="inline-flex items-center gap-2 bg-gold-50 text-gold-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-gold-100 shadow-sm">
                <Sparkles size={12} />
                <span>
                  {filterMode === 'per-entity' && entityFilter !== 'All Entities' ? 'Welcome' : 'Welcome Back'}
                </span>
              </div>
              {filterMode === 'per-entity' && entityFilter !== 'All Entities' ? (
                <>
                  <h2 className="font-serif text-5xl text-church-green leading-[1.1] tracking-tight">
                    {entityType === 'Seminaries' ? 'Seminary' : entityType === 'Diocesan Schools' ? 'School' : 'Parish'}{' '}
                    <br />
                    <span className="text-gold-600 italic">Dashboard</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
                      {entityFilter}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-serif text-5xl text-church-green leading-[1.1] tracking-tight">
                    A warm greeting in the <br />
                    name of <span className="text-gold-600 italic">Jesus Christ.</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
                      System Overview •{' '}
                      {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-1.5">
                      <AlertCircle size={12} />
                      {entityType === 'Parishes'
                        ? '9 Parishes'
                        : entityType === 'Seminaries'
                          ? '2 Seminaries'
                          : '3 Schools'}{' '}
                      pending Submission
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Parish Profile — per-entity mode */}
          {filterMode === 'per-entity' && entityFilter !== 'All Entities' ? (
            <Card className="lg:col-span-2 bg-white border-none shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gold-500 rounded-l-[inherit]"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>
              <CardContent className="relative z-10 pt-6 pl-8">
                <div className="flex flex-col gap-1 mb-4">
                  <div className="bg-church-green/5 text-church-green px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest w-fit border border-church-green/10 mb-1">
                    {entityType === 'Parishes' ? 'Parish' : entityType === 'Seminaries' ? 'Seminary' : 'School'} Profile
                  </div>
                  <h1 className="text-2xl md:text-3xl font-serif font-black text-church-green tracking-tight leading-tight">
                    {entityFilter}
                  </h1>
                  {entityType === 'Parishes' && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mt-1">
                      <span>{filteredEntities[0]?.vicariate ?? '---'} Vicariate</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-gold-500"></span>
                      <span className="text-gold-600">{filteredEntities[0]?.class ?? '---'}</span>
                    </div>
                  )}
                  {entityType === 'Diocesan Schools' && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mt-1">
                      <span>{filteredEntities[0]?.cluster ?? 'Cluster not assigned'}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gold-50 transition-colors">
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
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Data Management</p>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
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
                      onClick={() => onNavigate?.('parish-data-submission')}
                      className="w-full rounded-lg bg-church-green px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-church-green/90 flex items-center justify-center gap-2"
                    >
                      <FileText size={14} />
                      Submit IAFR
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Submission Tracking — diocese-wide mode */
            <Card className="lg:col-span-2 bg-white border-none shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-orange-500/10 transition-colors duration-700"></div>
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-sm border border-orange-100">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-church-green tracking-tight uppercase">
                        {lockEntityFilter ? 'My Submission Status' : 'Submission Tracking'}
                      </CardTitle>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {lockEntityFilter ? `IAFR — Due every 15th of the month` : 'Entities missing financial reports'}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider ${lockEntityFilter ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}
                  >
                    {lockEntityFilter ? 'Your Reports' : 'Action Required'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 mt-4 pr-4 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative z-10">
                {/* ── Entity-specific view: IAFR submission status (due every 15th) ── */}
                {lockEntityFilter &&
                  (() => {
                    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const iafrRows = [
                      {
                        month: 'Jan 2026',
                        deadline: new Date(2026, 0, 15),
                        submitted: new Date(2026, 0, 13),
                        ok: true,
                      },
                      {
                        month: 'Feb 2026',
                        deadline: new Date(2026, 1, 15),
                        submitted: new Date(2026, 1, 11),
                        ok: true,
                      },
                      {
                        month: 'Mar 2026',
                        deadline: new Date(2026, 2, 15),
                        submitted: new Date(2026, 2, 14),
                        ok: true,
                      },
                      {
                        month: 'Apr 2026',
                        deadline: new Date(2026, 3, 15),
                        submitted: new Date(2026, 3, 12),
                        ok: true,
                      },
                      { month: 'May 2026', deadline: new Date(2026, 4, 15), submitted: null, ok: false },
                    ];
                    const fmt = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                    return (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                          IAFR — Due every 15th of the month
                        </p>
                        {iafrRows.map((row, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${row.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}
                              >
                                {row.ok ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-church-green">IAFR — {row.month}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                  {row.ok && row.submitted
                                    ? `Submitted ${fmt(row.submitted)}`
                                    : `Due ${fmt(row.deadline)}`}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border whitespace-nowrap shrink-0 ${row.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}
                            >
                              {row.ok ? 'Submitted' : 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                {/* ── Diocese-wide view: all entities with missing reports ── */}
                {!lockEntityFilter && (
                  <>
                    {entityType === 'Parishes' && (
                      <>
                        <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                              <AlertTriangle className="w-4 h-4 text-orange-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">Sto. Rosario Parish</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                South Vicariate • Class D
                              </p>
                              <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                                Last Submitted: 2 weeks ago
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-orange-100 whitespace-nowrap flex-shrink-0">
                            Collections
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                              <AlertTriangle className="w-4 h-4 text-orange-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">Christ the King Parish</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                Central Vicariate • Class C
                              </p>
                              <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                                Last Submitted: 3 weeks ago
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-orange-100 whitespace-nowrap flex-shrink-0">
                            Disbursements
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">Holy Family Parish</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                Central Vicariate • Class C
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-red-50 text-red-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-red-100 whitespace-nowrap flex-shrink-0">
                            All Reports
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                              <AlertTriangle className="w-4 h-4 text-orange-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">San Roque Parish</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                East Vicariate • Class B
                              </p>
                              <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                                Last Submitted: 10 days ago
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-orange-100 whitespace-nowrap flex-shrink-0">
                            Disbursements
                          </span>
                        </div>
                      </>
                    )}
                    {entityType === 'Seminaries' && (
                      <>
                        <div className="flex items-start justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                              <AlertTriangle className="w-4 h-4 text-orange-500 mt-1" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">St. Peter Seminary</p>
                              <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                                Last Submitted: 1 week ago
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-orange-100 whitespace-nowrap flex-shrink-0">
                            Collections
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                          <div className="flex gap-4 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
                              <AlertCircle className="w-4 h-4 text-red-500 mt-1" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-church-green truncate">Holy Cross Seminary</p>
                              <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                                Last Submitted: 3 weeks ago
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] bg-red-50 text-red-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-red-100 whitespace-nowrap flex-shrink-0">
                            All Reports
                          </span>
                        </div>
                      </>
                    )}
                    {entityType === 'Diocesan Schools' && (
                      <div className="flex items-start justify-between gap-4 border-b border-gray-50 pb-4 group/item hover:bg-gray-50/50 transition-colors rounded-xl p-2 -mx-2">
                        <div className="flex gap-4 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                            <AlertTriangle className="w-4 h-4 text-orange-500 mt-1" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-church-green truncate">St. Mary Academy</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                              Cluster 1
                            </p>
                            <p className="text-[10px] font-medium text-gray-500 mt-1 truncate italic">
                              Last Submitted: 2 weeks ago
                            </p>
                          </div>
                        </div>
                        <span className="text-[9px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border border-orange-100 whitespace-nowrap flex-shrink-0">
                          Disbursements
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6 lg:mt-8">
          {/* KPI Card — Total Collections (+ monthly average, Item 11) */}
          <div className="bg-white rounded-2xl shadow-xl hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <div className="flex items-center gap-1.5">
              <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
                Total Collections {year == null ? '(All Years)' : `(${year})`}
              </p>
              <ChartHelpToggle>
                These 3 tiles show the Total across every month in the selected Year (or the full history if
                &quot;All Years&quot; is selected), plus the monthly Average (Total ÷ number of months). Net
                Surplus/Deficit is Collections minus Disbursements for the same period, computed directly — not a
                separate figure.
              </ChartHelpToggle>
            </div>
            <div className="text-[clamp(1.3rem,1.6vw,1.9rem)] font-black text-church-green tracking-tight leading-none">
              {renderKpiValue(kpiData.collectionsTotal)}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="text-[10px] font-black text-gray-500">{renderKpiSubValue(kpiData.collectionsAvg)}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Avg / Month</span>
            </div>
          </div>

          {/* KPI Card — Net Surplus/Deficit (Item 11 — replaces the old Mass
              Collections tile; derived client-side, no separate fetch) */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Net Surplus / Deficit {year == null ? '(All Years)' : `(${year})`}
            </p>
            <div
              className={`text-[clamp(1.3rem,1.6vw,1.9rem)] font-black tracking-tight leading-none ${
                kpiData.netIsDeficit ? 'text-red-600' : 'text-church-green'
              }`}
            >
              {renderKpiValue(kpiData.netTotal)}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="text-[10px] font-black text-gray-500">{renderKpiSubValue(kpiData.netAvg)}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Avg / Month</span>
              <span
                className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-black border shadow-sm ${
                  kpiData.netIsDeficit
                    ? 'bg-red-50 text-red-700 border-red-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}
              >
                {kpiData.netIsDeficit ? 'Deficit' : 'Surplus'}
              </span>
            </div>
          </div>

          {/* KPI Card — Total Disbursements (+ monthly average, Item 11) */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Total Disbursements {year == null ? '(All Years)' : `(${year})`}
            </p>
            <div className="text-[clamp(1.3rem,1.6vw,1.9rem)] font-black text-church-green tracking-tight leading-none">
              {renderKpiValue(kpiData.disbursementsTotal)}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="text-[10px] font-black text-gray-500">
                {renderKpiSubValue(kpiData.disbursementsAvg)}
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Avg / Month</span>
            </div>
          </div>

          {/* KPI Card — Financial Health Score. Two modes, toggled here:
              'scoped' follows the Year/Timeframe selection above like the
              three tiles to its left (a single-year snapshot, honestly N/A
              when that period has too little data); 'overall' ignores
              Year/Timeframe and always uses the entity's full trailing
              history (a multi-year trend view). Available in both All and
              Individual filter modes — the toggle is independent of that. */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <p
                  className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight truncate"
                  title={
                    healthScorePeriodLabel
                      ? `Computed from financial records in ${healthScorePeriodLabel}.`
                      : 'Not enough financial records in the selected year/timeframe to compute a score.'
                  }
                >
                  Financial Health Score
                  {healthScorePeriodLabel && <span className="text-gray-300"> ({healthScorePeriodLabel})</span>}
                </p>
                <ChartHelpToggle>
                  Composite score from 5 weighted dimensions: Liquidity (25%) — cash coverage of near-term
                  obligations; Sustainability (25%) — reliance on collections vs. one-off income; Efficiency (20%) —
                  how much of every peso collected reaches its intended use; Stability (15%) — month-to-month
                  volatility after removing normal seasonal swings; Reporting Compliance (15%) — timeliness and
                  completeness of financial submissions. &quot;This Year&quot; scores the selected Year/Timeframe
                  only; &quot;Overall&quot; uses the entity&apos;s full trailing history instead.
                </ChartHelpToggle>
              </div>
              <div className="flex items-center bg-gray-50 border border-gray-100 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  disabled={isHealthScoreLoading}
                  onClick={() => setHealthScoreViewMode('scoped')}
                  title="Follows the Year/Timeframe filter above"
                  className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors ${
                    healthScoreViewMode === 'scoped'
                      ? 'bg-white text-church-green shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  } ${isHealthScoreLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  This Year
                </button>
                <button
                  type="button"
                  disabled={isHealthScoreLoading}
                  onClick={() => setHealthScoreViewMode('overall')}
                  title="Full trailing history, regardless of the Year/Timeframe filter above"
                  className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors ${
                    healthScoreViewMode === 'overall'
                      ? 'bg-white text-church-green shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  } ${isHealthScoreLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  Overall
                </button>
              </div>
            </div>
            <div className="text-[clamp(1.8rem,2.2vw,2.6rem)] font-black text-gold-600 tracking-tight leading-none">
              {isHealthScoreLoading ? (
                <div className="h-[1.6rem] md:h-[1.9rem] w-[70%] bg-gray-100 rounded-lg animate-pulse" />
              ) : averageScore == null ? (
                'N/A'
              ) : (
                averageScore
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-auto">
              <span className="bg-gold-50 text-gold-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-gold-100">
                {trendText} Zone
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Diagnostic</span>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        {/* Analytics Toggle (Line + Text) */}
        <div className="relative flex justify-center py-6">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[#E2E8F0]"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-church-light px-6 text-[11px] font-bold text-[#94A3B8] uppercase tracking-[0.4em]">
              {entityType === 'Seminaries' ? 'Seminary Strategic Analytics' : 'Diocese Analytics'}
            </span>
          </div>
        </div>

        {entityType === 'Seminaries' ? (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <SeminaryAnalyticsDashboard
              activeTab={seminaryActiveTab}
              onTabChange={setSeminaryActiveTab}
              lockEntityFilter={lockEntityFilter}
              filterMode={filterMode}
            />
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex justify-center mb-8">
              <div className="grid grid-cols-4 bg-black rounded-full p-1.5 w-full max-w-6xl items-center shadow-xl">
                {[
                  { label: 'Descriptive', view: 'descriptive' },
                  { label: 'Diagnostic', view: 'health' },
                  { label: 'Predictive', view: 'predictive' },
                  { label: 'Prescriptive', view: 'prescriptive' },
                ].map((tab) => (
                  <button
                    key={tab.view}
                    onClick={() => setAnalyticsView(tab.view as any)}
                    className={`w-full rounded-full text-[10px] font-black transition-all uppercase tracking-[0.2em] ${
                      analyticsView === tab.view
                        ? 'bg-white text-[#d4af37] py-4 shadow-lg'
                        : 'bg-transparent text-gray-500 py-3 hover:text-white/70'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Diagnostic View Content */}
            {analyticsView === 'health' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 gap-6">
                  <Card className="border-none shadow-xl bg-white overflow-hidden group relative">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-gold-500 z-10"></div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-gold-500/10 transition-colors duration-700"></div>
                    <CardHeader className="pb-2 relative z-20">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gold-500 text-black flex items-center justify-center shadow-lg shadow-gold-500/20">
                              <HeartPulse size={20} />
                            </div>
                            <h3 className="text-2xl font-black text-church-green tracking-tight uppercase">
                              Financial Health Overview
                            </h3>
                            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100 shadow-sm">
                              <TrendingUp size={12} />
                              <span>{trendText} Trend</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-400 font-medium ml-13">
                            Composite analysis across {sufficientHealthScores.length} {entityType.toLowerCase()}{' '}
                            {sufficientHealthScores.length === healthScores.length
                              ? 'in the diocese'
                              : 'in the selected filter'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                            Last Updated
                          </span>
                          <span className="text-xs font-black text-church-green">
                            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 relative z-20">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                        <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
                          <div className="absolute inset-0 bg-radial-gradient from-gold-500/10 to-transparent opacity-50 blur-2xl"></div>
                          <FinancialHealthGauge
                            score={averageScore ?? 0}
                            size={220}
                            description={
                              averageScore == null
                                ? 'Not enough financial records in the selected year/timeframe to compute a score.'
                                : `The diocese is currently in the ${trendText} Zone. Resource allocation is being monitored.`
                            }
                          />
                        </div>
                        <div className="lg:col-span-7">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3">
                            <div className="sm:col-span-2 mb-1 flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                                Health Dimensions
                              </h4>
                              <div className="h-px flex-1 bg-gradient-to-r from-gray-100 to-transparent mx-4"></div>
                            </div>
                            <HealthDimensionBar label="Liquidity" score={averageDimensions.liquidity} weight={25} />
                            <HealthDimensionBar
                              label="Sustainability"
                              score={averageDimensions.sustainability}
                              weight={25}
                            />
                            <HealthDimensionBar label="Efficiency" score={averageDimensions.efficiency} weight={20} />
                            <HealthDimensionBar label="Stability" score={averageDimensions.stability} weight={15} />
                            <div className="sm:col-span-2">
                              <HealthDimensionBar label="Reporting" score={averageDimensions.growth} weight={15} />
                            </div>
                          </div>

                          <div className="mt-6 p-4 bg-gradient-to-br from-church-green/5 to-transparent rounded-3xl border border-church-green/10 flex items-start gap-4 relative overflow-hidden group/note">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-church-green/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover/note:bg-church-green/10 transition-colors"></div>
                            <div className="w-12 h-12 rounded-2xl bg-gold-500 text-black flex items-center justify-center shrink-0 shadow-xl shadow-gold-500/20 transform group-hover/note:rotate-6 transition-transform">
                              <BrainCircuit size={24} />
                            </div>
                            <div className="relative z-10">
                              <h5 className="text-[10px] font-black text-church-green uppercase tracking-[0.2em] mb-1.5">
                                Steward's Insight
                              </h5>
                              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                "While overall health is strong, the{' '}
                                <span className="text-church-green font-black">Reporting</span> dimension needs
                                continued monitoring. Consider reviewing late or incomplete submissions in the Diagnostic
                                tab."
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div
                  className={`grid grid-cols-1 ${filterMode !== 'per-entity' && entityType !== 'Diocesan Schools' ? 'lg:grid-cols-3' : ''} gap-6`}
                >
                  {filterMode !== 'per-entity' && entityType !== 'Diocesan Schools' && (
                    <Card className="lg:col-span-2 border-none shadow-sm">
                      <CardHeader>
                        <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                          Parish Health Rankings
                        </h3>
                        <p className="text-sm text-gray-400">Top and bottom performing parishes by health score</p>
                      </CardHeader>
                      <CardContent className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">
                              Top Performers
                            </h4>
                            {[...sufficientHealthScores]
                              .sort((a, b) => b.compositeScore - a.compositeScore)
                              .slice(0, 5)
                              .map((score, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-[10px] font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="text-sm font-bold text-gray-800">
                                      {entityNameById.get(score.entityId) ?? score.entityId}
                                    </span>
                                  </div>
                                  <span className="text-sm font-bold text-emerald-700">{score.compositeScore}</span>
                                </div>
                              ))}
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">
                              Needs Attention
                            </h4>
                            {[...sufficientHealthScores]
                              .sort((a, b) => a.compositeScore - b.compositeScore)
                              .slice(0, 5)
                              .map((score, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-200 text-red-800 flex items-center justify-center text-[10px] font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="text-sm font-bold text-gray-800">
                                      {entityNameById.get(score.entityId) ?? score.entityId}
                                    </span>
                                  </div>
                                  <span className="text-sm font-bold text-red-700">{score.compositeScore}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-none shadow-sm bg-church-black text-white overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <HeartPulse size={120} />
                    </div>
                    <CardHeader className="relative z-10">
                      <h3 className="text-xl font-bold text-gold-400 uppercase tracking-wide">Health Insights</h3>
                      <p className="text-sm text-white/60">System summary</p>
                    </CardHeader>
                    <CardContent className="relative z-10 space-y-4">
                      <div className="bg-white/10 p-4 rounded-xl border border-white/10">
                        <p className="text-sm leading-relaxed">
                          The overall financial health is{' '}
                          <span
                            className={`font-bold ${
                              averageScore == null
                                ? 'text-white/50'
                                : averageScore > 70
                                  ? 'text-emerald-400'
                                  : averageScore > 40
                                    ? 'text-gold-400'
                                    : 'text-red-400'
                            }`}
                          >
                            {averageScore == null ? 'Insufficient Data' : averageScore > 70 ? 'Excellent' : averageScore > 40 ? 'Stable' : 'Critical'}
                          </span>
                          .{' '}
                          {averageScore == null
                            ? 'Not enough financial records in the selected year/timeframe to assess this yet.'
                            : averageScore > 40
                              ? 'Most entities show positive cash flow and sustainable reserve levels. Efficiency ratios are within acceptable benchmarks.'
                              : 'Several entities require immediate financial intervention due to high disbursement-to-collection ratios.'}
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
                          <p className="text-xs text-white/80">
                            Sustainability score is impacted by rising maintenance costs in older{' '}
                            {entityType === 'Diocesan Schools' ? 'school facilities' : 'parishes'}.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDiagnosticRequest('Jan')}
                        className="w-full mt-4 bg-gold-500 hover:bg-gold-600 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        <BrainCircuit size={18} />
                        Run Full Diagnostic
                      </button>
                    </CardContent>
                  </Card>
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

            {/* Descriptive View Content */}
            {analyticsView === 'descriptive' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                {entityType === 'Seminaries' ? (
                  <>
                    {/* Seminary Descriptive Row 1: Enrollment & Origin */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="lg:col-span-2 border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Seminarian Cohort Distribution
                          </h3>
                          <p className="text-sm text-gray-400">Current students categorized by formation stage</p>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Formation Stage
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 100, bottom: 20 },
                                xAxis: { type: 'value', axisLabel: { color: '#6B7280', fontSize: 12 } },
                                yAxis: {
                                  type: 'category',
                                  data: seminaryCohortData.map((d) => d.stage),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                series: [
                                  {
                                    type: 'bar',
                                    data: seminaryCohortData.map((d) => ({
                                      value: d.count,
                                      itemStyle: { color: d.color, borderRadius: [0, 6, 6, 0] },
                                    })),
                                    barWidth: 40,
                                    label: {
                                      show: true,
                                      position: 'right',
                                      formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Count
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Vocations by Region
                          </h3>
                          <p className="text-sm text-gray-400">Geographic origin of current seminarians</p>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px]">
                            <ReactECharts
                              option={{
                                color: SEMINARY_COST_COLORS,
                                tooltip: {
                                  trigger: 'item',
                                  formatter: '{b}: {c} ({d}%)',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                series: [
                                  {
                                    type: 'pie',
                                    radius: ['40%', '60%'],
                                    center: ['50%', '50%'],
                                    padAngle: 5,
                                    data: seminaryOriginData.map((d, i) => ({
                                      name: d.name,
                                      value: d.count,
                                      itemStyle: { color: SEMINARY_COST_COLORS[i % SEMINARY_COST_COLORS.length] },
                                    })),
                                    label: { show: false },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                            {seminaryOriginData.map((item, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: SEMINARY_COST_COLORS[i % SEMINARY_COST_COLORS.length] }}
                                ></div>
                                <span className="text-[10px] font-medium text-gray-600">{item.name}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Seminary Descriptive Row 2: Financials & Staffing */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Seminarian Age Demographics
                          </h3>
                          <p className="text-sm text-gray-400">Age distribution of current candidates</p>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: seminaryAgeData.map((d) => d.age),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    type: 'bar',
                                    data: seminaryAgeData.map((d) => ({
                                      value: d.count,
                                      itemStyle: { color: '#D4AF37', borderRadius: [6, 6, 0, 0] },
                                    })),
                                    barMaxWidth: 50,
                                    label: {
                                      show: true,
                                      position: 'top',
                                      formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Age Group
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Formation Progress Trends
                          </h3>
                          <p className="text-sm text-gray-400">Cohort growth across major formation stages</p>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                legend: { top: 0, data: ['Propaedeutic', 'Philosophy', 'Theology'] },
                                grid: { top: 40, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: formationProgressData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Propaedeutic',
                                    type: 'line',
                                    data: formationProgressData.map((d) => d.propaedeutic),
                                    lineStyle: { color: '#1a472a', width: 2 },
                                    itemStyle: { color: '#1a472a' },
                                    symbolSize: 8,
                                  },
                                  {
                                    name: 'Philosophy',
                                    type: 'line',
                                    data: formationProgressData.map((d) => d.philosophy),
                                    lineStyle: { color: '#D4AF37', width: 2 },
                                    itemStyle: { color: '#D4AF37' },
                                    symbolSize: 8,
                                  },
                                  {
                                    name: 'Theology',
                                    type: 'line',
                                    data: formationProgressData.map((d) => d.theology),
                                    lineStyle: { color: '#06b6d4', width: 2 },
                                    itemStyle: { color: '#06b6d4' },
                                    symbolSize: 8,
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Propaedeutic
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Philosophy
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Theology
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Seminary Descriptive Row 3: Financials & Staffing */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Operational Cost Structure
                          </h3>
                          <p className="text-sm text-gray-400">
                            Expense distribution for seminary maintenance and formation
                          </p>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Percentage (%)
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  formatter: (params: any[]) => `${params[0].axisValue}: ${params[0].value}%`,
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 55, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: seminaryCostData.map((d) => d.name),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12, formatter: (v: number) => `${v}%` },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    type: 'bar',
                                    data: seminaryCostData.map((d) => ({
                                      value: d.value,
                                      itemStyle: { color: '#1a472a', borderRadius: [6, 6, 0, 0] },
                                    })),
                                    label: {
                                      show: true,
                                      position: 'top',
                                      formatter: (p: any) => (p.value > 0 ? `${p.value}%` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Category
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                              Staff-to-Seminarian Ratio
                            </h3>
                            <p className="text-sm text-gray-400">
                              Faculty and support staff relative to student population
                            </p>
                          </div>
                          <select
                            value={staffRatioFilter}
                            onChange={(e) => setStaffRatioFilter(e.target.value as any)}
                            className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                          >
                            <option value="all">ALL CATEGORIES</option>
                            <option value="seminarians">SEMINARIANS</option>
                            <option value="staff">STAFF/FACULTY</option>
                          </select>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[350px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: seminaryEnrollmentData.map((d) => d.name),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  ...(staffRatioFilter === 'all' || staffRatioFilter === 'seminarians'
                                    ? [
                                        {
                                          name: 'Seminarians',
                                          type: 'bar',
                                          data: seminaryEnrollmentData.map((d) => ({
                                            value: d.enrollment,
                                            itemStyle: { color: '#D4AF37', borderRadius: [6, 6, 0, 0] },
                                          })),
                                          barWidth: staffRatioFilter === 'all' ? 25 : 50,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                  ...(staffRatioFilter === 'all' || staffRatioFilter === 'staff'
                                    ? [
                                        {
                                          name: 'Staff/Faculty',
                                          type: 'bar',
                                          data: seminaryEnrollmentData.map((d) => ({
                                            value: d.staff,
                                            itemStyle: { color: '#1a472a', borderRadius: [6, 6, 0, 0] },
                                          })),
                                          barWidth: staffRatioFilter === 'all' ? 25 : 50,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`flex items-center gap-2 transition-opacity ${staffRatioFilter === 'all' || staffRatioFilter === 'seminarians' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Seminarians
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 transition-opacity ${staffRatioFilter === 'all' || staffRatioFilter === 'staff' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Staff/Faculty
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Row 1: Collections Per Entity — hidden for individual entity views */}
                    {!lockEntityFilter && filterMode !== 'per-entity' && (
                      <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6 px-8">
                          <div className="flex items-center gap-4">
                            {(selectedBarVicariate || drillParish) && (
                              <button
                                onClick={() => {
                                  // Pop one level, deepest first — not clear-to-root.
                                  if (drillParish) setDrillParish(null);
                                  else setSelectedBarVicariate(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                title={
                                  drillParish
                                    ? 'Back to Parishes'
                                    : entityType === 'Diocesan Schools'
                                      ? 'Back to Clusters'
                                      : 'Back to Vicariates'
                                }
                              >
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m15 18-6-6 6-6" />
                                </svg>
                              </button>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-3xl font-extrabold text-gray-900 uppercase tracking-tight">
                                  {drillParish
                                    ? `IAFR Report for ${drillParish.name}`
                                    : selectedBarVicariate
                                      ? `COLLECTIONS / RECEIPTS & DISBURSEMENTS IN ${entityType === 'Diocesan Schools' ? 'CLUSTER' : 'VICARIATE'} OF ${selectedBarVicariate}`
                                      : `COLLECTIONS / RECEIPTS & DISBURSEMENTS BY ${entityType === 'Parishes' ? 'VICARIATE' : entityType === 'Seminaries' ? 'SEMINARY' : 'CLUSTER'}`}
                                </h3>
                                {entityType === 'Parishes' && !drillParish && (
                                  <ChartHelpToggle>
                                    Click a bar to drill deeper: Vicariate → Parish. Selecting a parish shows its full
                                    IAFR report — every Section, Subsection, and Account with subtotals, sourced from
                                    the diocese&apos;s own IAFR report structure, matching the printed financial
                                    report. Use the back arrow to go up one level at a time.
                                  </ChartHelpToggle>
                                )}
                              </div>
                              {(selectedBarVicariate || drillParish) && (
                                <p className="text-sm text-gray-500 font-medium mt-1">
                                  {drillParish
                                    ? 'Full IAFR report below — every section, subsection, and account with subtotals'
                                    : entityType === 'Parishes'
                                      ? 'Detailed Parish Breakdown — click a parish for its IAFR report'
                                      : 'Detailed Breakdown'}
                                </p>
                              )}
                            </div>
                          </div>
                          {!drillParish && (
                            <div className="flex items-center gap-4">
                              <select
                                value={collectionsDisbursementsFilter}
                                onChange={(e) => setCollectionsDisbursementsFilter(e.target.value as any)}
                                className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                              >
                                <option value="all">ALL CATEGORIES</option>
                                <option value="collections">COLLECTIONS</option>
                                <option value="disbursements">DISBURSEMENTS</option>
                              </select>
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="mt-4 px-8 pb-4">
                          {!drillParish && (
                            <>
                          {entityType === 'Parishes' && barChartData.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-8">
                              Per-vicariate breakdown isn't available once already scoped to a specific Vicariate,
                              District, or Class — reset those filters to "All" to see this chart.
                            </p>
                          )}
                          <div className="relative h-[400px] w-full mt-4">
                            {renderChartLoadingOverlay()}
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  formatter: (params: any[]) => {
                                    const lines = params
                                      .map((p) => {
                                        const label =
                                          p.seriesName === 'collections'
                                            ? drillParish
                                              ? 'Receipts'
                                              : selectedBarVicariate
                                                ? entityType === 'Diocesan Schools'
                                                  ? 'School Collections'
                                                  : 'Parish Collections'
                                                : entityType === 'Diocesan Schools'
                                                  ? 'Cluster Collections'
                                                  : 'Vicariate Collections'
                                            : drillParish
                                              ? 'Expenses'
                                              : 'Disbursements';
                                        return `${p.marker} ${label}: ${formatCurrency(p.value)}`;
                                      })
                                      .join('<br/>');
                                    return `${params[0].axisValue}<br/>${lines}`;
                                  },
                                  extraCssText:
                                    'border-radius:16px;border:none;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);padding:12px 16px',
                                },
                                grid: { top: 20, right: 30, left: 60, bottom: 80 },
                                xAxis: {
                                  type: 'category',
                                  data: barChartData.map((d: any) => d.name),
                                  axisLabel: { color: '#9CA3AF', fontSize: 10, rotate: 25, interval: 0 },
                                  axisLine: { lineStyle: { color: '#E5E7EB' } },
                                },
                                yAxis: {
                                  type: 'value',
                                  name: 'Amount (PHP)',
                                  nameLocation: 'middle',
                                  nameGap: 45,
                                  nameRotate: 90,
                                  axisLabel: {
                                    color: '#9CA3AF',
                                    fontSize: 11,
                                    formatter: formatBarAxis,
                                  },
                                  axisLine: { lineStyle: { color: '#E5E7EB' } },
                                  splitLine: { lineStyle: { color: '#F3F4F6' } },
                                },
                                series: [
                                  ...(collectionsDisbursementsFilter === 'all' ||
                                  collectionsDisbursementsFilter === 'collections'
                                    ? [
                                        {
                                          name: 'collections',
                                          type: 'bar',
                                          data: barChartData.map((d: any) => ({
                                            value: d.collections,
                                            itemStyle: { color: '#D4AF37', borderRadius: [8, 8, 0, 0] },
                                          })),
                                          barMaxWidth: 40,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (params: any) => formatBarValue(params.value),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                  ...(collectionsDisbursementsFilter === 'all' ||
                                  collectionsDisbursementsFilter === 'disbursements'
                                    ? [
                                        {
                                          name: 'disbursements',
                                          type: 'bar',
                                          data: barChartData.map((d: any) => ({
                                            value: d.disbursements,
                                            itemStyle: { color: '#1a472a', borderRadius: [8, 8, 0, 0] },
                                          })),
                                          barMaxWidth: 40,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (params: any) => formatBarValue(params.value),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                ],
                              }}
                              onEvents={{
                                // Navigation only — the AI Diagnostic popup was removed
                                // from bar clicks (the dedicated Diagnostic tier covers
                                // that); clicking now always means "drill deeper".
                                click: (params: any) => {
                                  const item: any = barChartData[params.dataIndex];
                                  if (!item || entityType === 'Seminaries') return;
                                  if (drillParish) return; // parish level — chart hidden, no deeper level here
                                  if (selectedBarVicariate) {
                                    // Parish bar → IAFR breakdown (needs the parish UUID;
                                    // Diocesan Schools has no AWS breakdown data)
                                    if (entityType === 'Parishes') {
                                      const pid = parishIdByName[item.name];
                                      if (pid) setDrillParish({ id: pid, name: item.name });
                                    }
                                    return;
                                  }
                                  setSelectedBarVicariate(item.name);
                                },
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          {/* Axis label above the legend — same order as every other chart */}
                          <div className="text-center mt-2 text-[11px] font-bold text-gray-400 uppercase tracking-[0.4em]">
                            {selectedBarVicariate
                              ? entityType === 'Diocesan Schools'
                                ? 'School'
                                : 'Parish'
                              : entityType === 'Parishes'
                                ? 'Vicariate'
                                : entityType === 'Seminaries'
                                  ? 'Seminary'
                                  : 'Cluster'}
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`relative flex items-center gap-2 transition-opacity ${collectionsDisbursementsFilter === 'all' || collectionsDisbursementsFilter === 'collections' ? 'opacity-100' : 'opacity-30'}`}
                              onMouseEnter={() =>
                                entityType === 'Parishes' && !drillParish && setHoveredLegendKey('vicariate_collections')
                              }
                              onMouseLeave={() => setHoveredLegendKey((k) => (k === 'vicariate_collections' ? null : k))}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                {drillParish ? 'Receipts' : 'Collections'}
                              </span>
                              {entityType === 'Parishes' &&
                                !drillParish &&
                                hoveredLegendKey === 'vicariate_collections' &&
                                renderVicariateCategoryPopover('collections')}
                            </div>
                            <div
                              className={`relative flex items-center gap-2 transition-opacity ${collectionsDisbursementsFilter === 'all' || collectionsDisbursementsFilter === 'disbursements' ? 'opacity-100' : 'opacity-30'}`}
                              onMouseEnter={() =>
                                entityType === 'Parishes' && !drillParish && setHoveredLegendKey('vicariate_disbursements')
                              }
                              onMouseLeave={() => setHoveredLegendKey((k) => (k === 'vicariate_disbursements' ? null : k))}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                {drillParish ? 'Expenses' : 'Disbursements'}
                              </span>
                              {entityType === 'Parishes' &&
                                !drillParish &&
                                hoveredLegendKey === 'vicariate_disbursements' &&
                                renderVicariateCategoryPopover('disbursements')}
                            </div>
                          </div>
                            </>
                          )}

                          {entityType === 'Parishes' && drillParish && (
                            <IAFRBreakdownReport
                              hideHeader
                              institutionId={drillParish.id}
                              institutionName={drillParish.name}
                              year={year}
                            />
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Detailed Collections Analytics */}
                    <Card className="border-none shadow-sm mt-6">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Collections Breakdown
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">Breakdown of collections across the diocese.</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <select
                            value={collectionsFilter}
                            onChange={(e) => setCollectionsFilter(e.target.value as any)}
                            className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                          >
                            <option value="all">ALL CATEGORIES</option>
                            <option value="collections_mass">MASS COLLECTIONS</option>
                            <option value="sacraments_rate">SACRAMENTS</option>
                            <option value="other_receipts">OTHER RECEIPTS</option>
                            <option value="other_collections">OTHER COLLECTIONS</option>
                          </select>
                        </div>
                      </CardHeader>
                      <CardContent className="mt-4">
                        {entityType === 'Parishes' && windowedTrendData.length === 0 && !isDescriptiveLoading && (
                          <p className="text-sm text-gray-400 text-center py-8">
                            No collections data available for the selected scope.
                          </p>
                        )}
                        <div
                          className="relative h-[350px] flex items-center"
                          onTouchStart={handleTrendTouchStart}
                          onTouchEnd={handleTrendTouchEnd}
                        >
                          {renderChartLoadingOverlay()}
                          <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                              Amount (Millions)
                            </span>
                          </div>
                          <div className="relative flex-1 h-full">
                          {renderSixMonthPager()}
                          <ReactECharts
                            option={{
                              color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                              tooltip: {
                                trigger: 'axis',
                                formatter: (params: any[]) =>
                                  `${params[0].axisValue}<br/>${params.map((p) => `${p.marker} ${p.seriesName}: ${formatCurrency(p.value)}`).join('<br/>')}`,
                              },
                              grid: { top: 20, right: 30, left: 55, bottom: 30 },
                              xAxis: {
                                type: 'category',
                                data: windowedTrendData.map((d) => d.month),
                                axisLabel: { color: '#6B7280', fontSize: 12 },
                              },
                              yAxis: {
                                type: 'value',
                                axisLabel: {
                                  color: '#6B7280',
                                  fontSize: 12,
                                  formatter: (v: number) => `${v / 1000000}M`,
                                },
                                splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                              },
                              series: [
                                ...(collectionsFilter === 'all' || collectionsFilter === 'collections_mass'
                                  ? [
                                      {
                                        name: 'Mass Collections',
                                        type: 'bar',
                                        data: windowedTrendData.map((d) => ({
                                          value: d.collections_mass,
                                          itemStyle: { color: '#D4AF37', borderRadius: [4, 4, 0, 0] },
                                        })),
                                        barWidth: collectionsFilter === 'all' ? 20 : 40,
                                        label: {
                                          show: true,
                                          position: 'top',
                                          formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                          color: '#9CA3AF',
                                          fontSize: 9,
                                          fontWeight: 700,
                                        },
                                      },
                                    ]
                                  : []),
                                ...(collectionsFilter === 'all' || collectionsFilter === 'sacraments_rate'
                                  ? [
                                      {
                                        name: 'Sacraments',
                                        type: 'bar',
                                        data: windowedTrendData.map((d) => ({
                                          value: d.sacraments_rate,
                                          itemStyle: { color: '#1a472a', borderRadius: [4, 4, 0, 0] },
                                        })),
                                        barWidth: collectionsFilter === 'all' ? 20 : 40,
                                        label: {
                                          show: true,
                                          position: 'top',
                                          formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                          color: '#9CA3AF',
                                          fontSize: 9,
                                          fontWeight: 700,
                                        },
                                      },
                                    ]
                                  : []),
                                ...(collectionsFilter === 'all' || collectionsFilter === 'other_receipts'
                                  ? [
                                      {
                                        name: 'Other Receipts',
                                        type: 'bar',
                                        data: windowedTrendData.map((d: any) => ({
                                          value: d.other_receipts ?? 0,
                                          itemStyle: { color: '#4ade80', borderRadius: [4, 4, 0, 0] },
                                        })),
                                        barWidth: collectionsFilter === 'all' ? 20 : 40,
                                        label: {
                                          show: true,
                                          position: 'top',
                                          formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                          color: '#9CA3AF',
                                          fontSize: 9,
                                          fontWeight: 700,
                                        },
                                      },
                                    ]
                                  : []),
                                ...(collectionsFilter === 'all' || collectionsFilter === 'other_collections'
                                  ? [
                                      {
                                        name: 'Other Collections',
                                        type: 'bar',
                                        data: windowedTrendData.map((d: any) => ({
                                          value: d.other_collections ?? 0,
                                          itemStyle: { color: '#06b6d4', borderRadius: [4, 4, 0, 0] },
                                        })),
                                        barWidth: collectionsFilter === 'all' ? 20 : 40,
                                        label: {
                                          show: true,
                                          position: 'top',
                                          formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                          color: '#9CA3AF',
                                          fontSize: 9,
                                          fontWeight: 700,
                                        },
                                      },
                                    ]
                                  : []),
                              ],
                            }}
                            style={{ height: '100%', width: '100%' }}
                          />
                          </div>
                        </div>
                        <div className="relative text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                          Month
                          {renderSixMonthPageLabel()}
                        </div>
                        <div className="flex items-center gap-6 justify-center mt-4">
                          <div
                            className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'collections_mass' ? 'opacity-100' : 'opacity-30'}`}
                            onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('mass_collections')}
                            onMouseLeave={() => setHoveredLegendKey((k) => (k === 'mass_collections' ? null : k))}
                            onClick={() =>
                              entityType === 'Parishes' &&
                              setPinnedLegendKey((k) => (k === 'mass_collections' ? null : 'mass_collections'))
                            }
                          >
                            <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Mass Collections
                            </span>
                            {entityType === 'Parishes' &&
                              (hoveredLegendKey === 'mass_collections' || pinnedLegendKey === 'mass_collections') &&
                              renderLegendBreakdownPopover('mass_collections')}
                          </div>
                          <div
                            className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'sacraments_rate' ? 'opacity-100' : 'opacity-30'}`}
                            onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('sacraments_breakdown')}
                            onMouseLeave={() => setHoveredLegendKey((k) => (k === 'sacraments_breakdown' ? null : k))}
                            onClick={() =>
                              entityType === 'Parishes' &&
                              setPinnedLegendKey((k) => (k === 'sacraments_breakdown' ? null : 'sacraments_breakdown'))
                            }
                          >
                            <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Sacraments
                            </span>
                            {entityType === 'Parishes' &&
                              (hoveredLegendKey === 'sacraments_breakdown' || pinnedLegendKey === 'sacraments_breakdown') &&
                              renderSacramentsBreakdownPopover()}
                          </div>
                          <div
                            className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'other_receipts' ? 'opacity-100' : 'opacity-30'}`}
                            onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('other_receipts')}
                            onMouseLeave={() => setHoveredLegendKey((k) => (k === 'other_receipts' ? null : k))}
                            onClick={() =>
                              entityType === 'Parishes' &&
                              setPinnedLegendKey((k) => (k === 'other_receipts' ? null : 'other_receipts'))
                            }
                          >
                            <div className="w-3 h-3 rounded-full bg-[#4ade80]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Other Receipts
                            </span>
                            {entityType === 'Parishes' &&
                              (hoveredLegendKey === 'other_receipts' || pinnedLegendKey === 'other_receipts') &&
                              renderLegendBreakdownPopover('other_receipts')}
                          </div>
                          <div
                            className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'other_collections' ? 'opacity-100' : 'opacity-30'}`}
                            onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('other_collections')}
                            onMouseLeave={() => setHoveredLegendKey((k) => (k === 'other_collections' ? null : k))}
                            onClick={() =>
                              entityType === 'Parishes' &&
                              setPinnedLegendKey((k) => (k === 'other_collections' ? null : 'other_collections'))
                            }
                          >
                            <div className="w-3 h-3 rounded-full bg-[#06b6d4]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Other Collections
                            </span>
                            {entityType === 'Parishes' &&
                              (hoveredLegendKey === 'other_collections' || pinnedLegendKey === 'other_collections') &&
                              renderLegendBreakdownPopover('other_collections')}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Disbursement Analytics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex flex-row items-start justify-between gap-4">
                            <div>
                              <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide leading-tight">
                                Disbursement Breakdown
                              </h3>
                              <p className="text-sm text-gray-400 mt-1">Breakdown of expenses across the diocese.</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 pt-1">
                              <select
                                value={disbursementsFilter}
                                onChange={(e) => setDisbursementsFilter(e.target.value as any)}
                                className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                              >
                                <option value="all">ALL CATEGORIES</option>
                                <option value="expenses_parish">PARISH EXPENSES</option>
                                <option value="expenses_pastoral">PASTORAL EXPENSES</option>
                              </select>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="mt-4">
                          {entityType === 'Parishes' && windowedTrendData.length === 0 && !isDescriptiveLoading && (
                            <p className="text-sm text-gray-400 text-center py-8">
                              No disbursements data available for the selected scope.
                            </p>
                          )}
                          <div
                            className="relative h-[350px] flex items-center"
                            onTouchStart={handleTrendTouchStart}
                            onTouchEnd={handleTrendTouchEnd}
                          >
                            {renderChartLoadingOverlay()}
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Amount (Millions)
                              </span>
                            </div>
                            <div className="relative flex-1 h-full">
                            {renderSixMonthPager()}
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  formatter: (params: any[]) =>
                                    `${params[0].axisValue}<br/>${params.map((p) => `${p.marker} ${p.seriesName}: ${formatCurrency(p.value)}`).join('<br/>')}`,
                                },
                                grid: { top: 20, right: 30, left: 55, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: windowedTrendData.map((d) => d.month),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: {
                                    color: '#6B7280',
                                    fontSize: 12,
                                    formatter: (v: number) => `${v / 1000000}M`,
                                  },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  ...(disbursementsFilter === 'all' || disbursementsFilter === 'expenses_parish'
                                    ? [
                                        {
                                          name: 'Parish Expenses',
                                          type: 'bar',
                                          data: windowedTrendData.map((d) => ({
                                            value: d.expenses_parish,
                                            itemStyle: { color: '#1a472a', borderRadius: [4, 4, 0, 0] },
                                          })),
                                          barMaxWidth: disbursementsFilter === 'all' ? 14 : 30,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                  ...(disbursementsFilter === 'all' || disbursementsFilter === 'expenses_pastoral'
                                    ? [
                                        {
                                          name: 'Pastoral Expenses',
                                          type: 'bar',
                                          data: windowedTrendData.map((d) => ({
                                            value: d.expenses_pastoral,
                                            itemStyle: { color: '#D4AF37', borderRadius: [4, 4, 0, 0] },
                                          })),
                                          barMaxWidth: disbursementsFilter === 'all' ? 14 : 30,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                            </div>
                          </div>
                          <div className="relative text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Month
                            {renderSixMonthPageLabel()}
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${disbursementsFilter === 'all' || disbursementsFilter === 'expenses_parish' ? 'opacity-100' : 'opacity-30'}`}
                              onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('expenses_parish')}
                              onMouseLeave={() => setHoveredLegendKey((k) => (k === 'expenses_parish' ? null : k))}
                              onClick={() =>
                                entityType === 'Parishes' &&
                                setPinnedLegendKey((k) => (k === 'expenses_parish' ? null : 'expenses_parish'))
                              }
                            >
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Parish Expenses
                              </span>
                              {entityType === 'Parishes' &&
                                (hoveredLegendKey === 'expenses_parish' || pinnedLegendKey === 'expenses_parish') &&
                                renderLegendBreakdownPopover('expenses_parish')}
                            </div>
                            <div
                              className={`relative flex items-center gap-2 cursor-pointer transition-opacity ${disbursementsFilter === 'all' || disbursementsFilter === 'expenses_pastoral' ? 'opacity-100' : 'opacity-30'}`}
                              onMouseEnter={() => entityType === 'Parishes' && setHoveredLegendKey('expenses_pastoral')}
                              onMouseLeave={() => setHoveredLegendKey((k) => (k === 'expenses_pastoral' ? null : k))}
                              onClick={() =>
                                entityType === 'Parishes' &&
                                setPinnedLegendKey((k) => (k === 'expenses_pastoral' ? null : 'expenses_pastoral'))
                              }
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Pastoral Expenses
                              </span>
                              {entityType === 'Parishes' &&
                                (hoveredLegendKey === 'expenses_pastoral' || pinnedLegendKey === 'expenses_pastoral') &&
                                renderLegendBreakdownPopover('expenses_pastoral')}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                            Top Disbursement Categories
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">Largest expense drivers year-to-date.</p>
                        </CardHeader>
                        <CardContent className="mt-4">
                          {entityType === 'Parishes' && activeTopDisbursementCategories.length === 0 && !isDescriptiveLoading && (
                            <p className="text-sm text-gray-400 text-center py-8">
                              No disbursement category data available for the selected scope.
                            </p>
                          )}
                          <div className="relative h-[350px] flex items-center">
                            {renderChartLoadingOverlay()}
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Category
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  formatter: (params: any[]) =>
                                    `${params[0].axisValue}: ${formatCurrency(params[0].value)}`,
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 135, bottom: 20 },
                                xAxis: {
                                  type: 'value',
                                  axisLabel: {
                                    color: '#6B7280',
                                    fontSize: 10,
                                    formatter: (v: number) => `${v / 1000}k`,
                                  },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                yAxis: {
                                  type: 'category',
                                  inverse: true,
                                  data: activeTopDisbursementCategories.map((d) => d.category),
                                  axisLabel: { color: '#6B7280', fontSize: 10 },
                                },
                                series: [
                                  {
                                    type: 'bar',
                                    data: activeTopDisbursementCategories.map((d) => ({
                                      value: d.amount,
                                      itemStyle: { color: '#1a472a', borderRadius: [0, 6, 6, 0] },
                                    })),
                                    barMaxWidth: 36,
                                    label: {
                                      show: true,
                                      position: 'right',
                                      formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Amount (PHP)
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}

                {/* Row 2: Monthly Collections Trend Monitor */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-orange-500" />
                        <h3 className="text-2xl font-bold text-church-green">Monthly Collections Trend Monitor</h3>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {trendDirectionFilter === 'down'
                          ? 'Flags entities with continuously decreasing collections over the past 4 months.'
                          : trendDirectionFilter === 'up'
                            ? 'Flags entities with continuously increasing collections over the past 4 months.'
                            : "Tracks every entity's collections trend over the past 4 months."}
                      </p>
                    </div>
                    <select
                      value={trendDirectionFilter}
                      onChange={(e) => setTrendDirectionFilter(e.target.value as 'down' | 'up' | 'all')}
                      className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors flex-shrink-0"
                    >
                      <option value="all">ALL TRENDS</option>
                      <option value="down">DECLINING</option>
                      <option value="up">INCREASING</option>
                    </select>
                  </CardHeader>
                  <CardContent className="mt-4">
                    <div className="overflow-x-auto max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs font-bold text-church-green border-b border-gray-200 sticky top-0 bg-white z-20">
                          <tr>
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('name')}
                            >
                              <div className="flex items-center gap-1">
                                Name
                                {sortConfig?.key === 'name' ? (
                                  sortConfig.direction === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-gold-600" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-gold-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-30" />
                                )}
                              </div>
                            </th>
                            {entityType !== 'Seminaries' && (
                              <th
                                className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                                onClick={() => handleSort('vicariate')}
                              >
                                <div className="flex items-center gap-1">
                                  Vicariate
                                  {sortConfig?.key === 'vicariate' ? (
                                    sortConfig.direction === 'asc' ? (
                                      <ArrowUp className="w-3 h-3 text-gold-600" />
                                    ) : (
                                      <ArrowDown className="w-3 h-3 text-gold-600" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                                  )}
                                </div>
                              </th>
                            )}
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('class')}
                            >
                              <div className="flex items-center gap-1">
                                Class
                                {sortConfig?.key === 'class' ? (
                                  sortConfig.direction === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-gold-600" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-gold-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-30" />
                                )}
                              </div>
                            </th>
                            {(['w1', 'w2', 'w3', 'w4'] as const).map((col, i) => (
                              <th
                                key={col}
                                className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                                onClick={() => handleSort(col)}
                              >
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const period = trendMonitorPeriods[i];
                                    if (!period) return `Month ${i + 1}`;
                                    const [y, m] = period.split('-');
                                    return `${CMP_MONTHS[Number(m) - 1] ?? m} ${y}`;
                                  })()}
                                  {sortConfig?.key === col ? (
                                    sortConfig.direction === 'asc' ? (
                                      <ArrowUp className="w-3 h-3 text-gold-600" />
                                    ) : (
                                      <ArrowDown className="w-3 h-3 text-gold-600" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                                  )}
                                </div>
                              </th>
                            ))}
                            <th
                              className="px-4 py-4 text-right cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('trend')}
                            >
                              <div className="flex items-center justify-end gap-1">
                                Trend
                                {sortConfig?.key === 'trend' ? (
                                  sortConfig.direction === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-gold-600" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-gold-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-30" />
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeclineData.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                                {liveDeclineData.length === 0
                                  ? 'Awaiting monthly submission data.'
                                  : trendDirectionFilter === 'down'
                                    ? 'No entities are currently declining.'
                                    : trendDirectionFilter === 'up'
                                      ? 'No entities are currently increasing.'
                                      : 'No entities match the current filters.'}
                              </td>
                            </tr>
                          ) : (
                            filteredDeclineData.map((row, i) => (
                              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-4 text-church-green/80">{row.name}</td>
                                {entityType !== 'Seminaries' && (
                                  <td className="px-4 py-4 text-church-green/80">
                                    {stripVicariatePrefix(row.vicariate)}
                                  </td>
                                )}
                                <td className="px-4 py-4 text-church-green/80">{row.class}</td>
                                <td className="px-4 py-4 font-medium text-church-green">{formatCurrency(row.w1)}</td>
                                <td className="px-4 py-4 font-medium text-church-green">{formatCurrency(row.w2)}</td>
                                <td className="px-4 py-4 font-medium text-church-green">{formatCurrency(row.w3)}</td>
                                <td className="px-4 py-4 font-medium text-church-green">{formatCurrency(row.w4)}</td>
                                <td className="px-4 py-4 text-right">
                                  <span
                                    className={`px-3 py-1 rounded-full font-bold text-[10px] flex items-center justify-end gap-1 w-fit ml-auto ${row.type === 'down' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}
                                  >
                                    <div
                                      className={`w-1.5 h-1.5 rounded-full ${row.type === 'down' ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                    ></div>
                                    {row.trend}%
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-6 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                      <p className="text-sm font-bold text-church-black/80">Interpretation:</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {trendDirectionFilter === 'up'
                          ? 'Entities with sustained growth may indicate pastoral or fundraising initiatives worth replicating elsewhere.'
                          : trendDirectionFilter === 'all'
                            ? 'Green entities are trending up, orange entities are trending down — sustained declines may require pastoral outreach, targeted fundraising, or expense controls to prevent deficit months.'
                            : 'Entities with a sustained decline may require pastoral outreach, targeted fundraising or expense controls to prevent deficit months.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Row 3: Top Tier */}
                {entityType !== 'Parishes' && entityType !== 'Diocesan Schools' && (
                  <Card className="border-none shadow-sm flex flex-col h-[520px]">
                    <CardHeader className="pb-4 pt-6 px-6 border-b border-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2.5 rounded-xl ${selectedVicariate ? 'bg-gold-50' : 'bg-church-green/10'}`}
                          >
                            {selectedVicariate ? (
                              <MapPin className="w-5 h-5 text-gold-600" />
                            ) : (
                              <TrendingUp className="w-5 h-5 text-church-green" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              {selectedVicariate && (
                                <button
                                  onClick={() => setSelectedVicariate(null)}
                                  className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gold-600"
                                  title="Back to Vicariates"
                                >
                                  <ArrowLeft className="w-4 h-4" />
                                </button>
                              )}
                              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                {selectedVicariate
                                  ? selectedVicariate
                                  : entityType === 'Seminaries'
                                    ? 'Contribution by Seminary'
                                    : 'Contribution by Vicariate'}
                              </h3>
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {selectedVicariate ? 'Parish Breakdown' : 'Collections share across the diocese'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!selectedVicariate && (
                            <div className="text-xs font-bold text-church-green bg-church-green/10 px-3 py-1.5 rounded-full">
                              Top {contributionData.length}
                            </div>
                          )}
                          <button
                            onClick={() => setContributionSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                            className={`p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500 flex items-center gap-1 ${selectedVicariate ? 'hover:text-gold-600' : 'hover:text-church-green'}`}
                            title={`Sort ${contributionSortOrder === 'desc' ? 'Ascending' : 'Descending'}`}
                          >
                            <ArrowUpDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col py-2 min-h-0 px-4">
                      <div className="flex-1 w-full overflow-y-auto pr-2 scrollbar-light space-y-1 pb-4 mt-2">
                        {(selectedVicariate ? parishContributionData : contributionData).map((entry, index, arr) => {
                          const maxActualValue = Math.max(...arr.map((d) => d.actualValue));
                          const widthPercent = Math.max(2, (entry.actualValue / maxActualValue) * 100);

                          return (
                            <div
                              key={`${entry.name}-${index}`}
                              onClick={() => {
                                if (!selectedVicariate) setSelectedVicariate(entry.name);
                              }}
                              className={`relative group p-3 rounded-xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 border border-transparent ${!selectedVicariate ? 'cursor-pointer hover:bg-gray-200 hover:border-gray-300' : 'hover:bg-gold-50/60 hover:border-gold-100'}`}
                            >
                              <div className="flex justify-between items-end mb-2.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-sm font-bold transition-colors text-gray-700 ${!selectedVicariate ? 'group-hover:text-church-green' : 'group-hover:text-gold-700'}`}
                                  >
                                    {stripVicariatePrefix(entry.name)}
                                  </span>
                                  {!selectedVicariate && (
                                    <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                                  )}
                                </div>
                                <div className="flex items-baseline gap-3">
                                  <span
                                    className={`text-sm font-black text-gray-900 transition-colors ${!selectedVicariate ? 'group-hover:text-church-green' : 'group-hover:text-gold-700'}`}
                                  >
                                    {formatCurrency(entry.actualValue)}
                                  </span>
                                  <span
                                    className={`text-xs font-bold px-2 py-0.5 rounded-md w-12 text-center transition-colors ${!selectedVicariate ? 'text-church-green bg-church-green/10 group-hover:bg-church-green group-hover:text-white' : 'text-gold-700 bg-gold-100/50 group-hover:bg-gold-600 group-hover:text-white'}`}
                                  >
                                    {entry.value}%
                                  </span>
                                </div>
                              </div>
                              <div
                                className={`h-2.5 w-full rounded-full overflow-hidden flex ${!selectedVicariate ? 'bg-gray-100' : 'bg-gold-100/50'}`}
                              >
                                <div
                                  className="h-full rounded-full transition-all duration-1000 ease-out relative shadow-sm group-hover:brightness-90"
                                  style={{
                                    width: `${widthPercent}%`,
                                    backgroundColor: !selectedVicariate ? '#1a472a' : '#D4AF37',
                                    opacity: Math.max(0.6, 1 - index * 0.04),
                                  }}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Row 4: Events */}
                <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                  <CardHeader>
                    <p className="text-[10px] font-bold tracking-widest text-gold-500 uppercase">EVENTS</p>
                    <h3 className="text-2xl font-bold text-white">Event Trends</h3>
                  </CardHeader>
                  <CardContent className="p-6 lg:p-10 space-y-12">
                    <div className="space-y-6">
                      {entityType === 'Parishes' && dynamicSeasonalityData.length === 0 && !isDescriptiveLoading && (
                        <p className="text-sm text-white/40 text-center py-8">
                          No seasonal trend data available for the selected scope.
                        </p>
                      )}
                      <div className="relative h-[320px] flex items-center">
                        {renderDarkChartLoadingOverlay()}
                        <div className="w-10 flex-shrink-0 flex items-center justify-center h-full">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                            Value
                          </span>
                        </div>
                        <div className="flex-1 h-full">
                          <ReactECharts
                            option={{
                              color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                              tooltip: {
                                trigger: 'axis',
                                itemStyle: { color: '#D4AF37' },
                                extraCssText: 'border-radius:12px;border:none;background:#2D2D2D;color:#fff',
                              },
                              grid: { top: 10, right: 10, left: 50, bottom: 30 },
                              xAxis: {
                                type: 'category',
                                data: dynamicSeasonalityData.map((d: any) => d.month),
                                axisLabel: { color: '#9CA3AF', fontSize: 10, fontWeight: 600 },
                                axisLine: { lineStyle: { color: '#333' } },
                                axisTick: { show: false },
                              },
                              yAxis: {
                                type: 'value',
                                axisLabel: {
                                  color: '#9CA3AF',
                                  fontSize: 10,
                                  formatter: (v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : String(v)),
                                },
                                axisLine: { show: false },
                                axisTick: { show: false },
                                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
                              },
                              series: [
                                {
                                  type: 'line',
                                  data: dynamicSeasonalityData.map((d: any) => d.value),
                                  smooth: true,
                                  lineStyle: { color: '#D4AF37', width: 3 },
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
                                  showSymbol: false,
                                },
                              ],
                            }}
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>
                      </div>
                      <div className="text-center text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em]">
                        Month
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {entityType === 'Seminaries' ? (
                        <>
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Enrollment Peak (+42%)
                            </p>
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Seminary Day (+15%)
                            </p>
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Graduation Month (+28%)
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          {parishSeasonalityHighlights.map((event: any, index: number) => {
                            const pct = Number(event.vs_baseline_pct ?? 0);
                            return (
                              <div
                                key={`${event.event_name}-${index}`}
                                className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group"
                              >
                                <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                                  Highlight
                                </p>
                                <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                                  {event.event_name} ({pct >= 0 ? '+' : ''}
                                  {pct.toFixed(0)}%)
                                </p>
                              </div>
                            );
                          })}
                          {parishSeasonalityHighlights.length === 0 && !isDescriptiveLoading && (
                            <p className="text-sm text-white/40 col-span-full">
                              No seasonal event data available for this scope yet.
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {entityType !== 'Seminaries' &&
                      (parishSeasonalityGrouped.seasons.length > 0 || parishSeasonalityGrouped.dayTypes.length > 0) && (
                        <div className="mt-6 border-t border-white/10 pt-4">
                          <button
                            type="button"
                            onClick={() => setShowFullEventBreakdown((v) => !v)}
                            className="text-[10px] font-bold text-gold-500 uppercase tracking-widest hover:text-gold-400 transition-colors"
                          >
                            {showFullEventBreakdown ? 'Hide full liturgical breakdown ▲' : 'See full liturgical breakdown ▼'}
                          </button>
                          {showFullEventBreakdown && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                              <div>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">
                                  Liturgical Seasons
                                </p>
                                <ul className="space-y-1.5">
                                  {parishSeasonalityGrouped.seasons.map((event: any, index: number) => {
                                    const pct = Number(event.vs_baseline_pct ?? 0);
                                    return (
                                      <li
                                        key={`season-${event.event_name}-${index}`}
                                        className="flex items-center justify-between gap-3 text-[12px] text-white/70"
                                      >
                                        <span>{event.event_name}</span>
                                        <span className="font-bold text-gold-400 whitespace-nowrap">
                                          {pct >= 0 ? '+' : ''}
                                          {pct.toFixed(0)}%
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">
                                  Notable Day Types
                                </p>
                                <ul className="space-y-1.5">
                                  {parishSeasonalityGrouped.dayTypes.map((event: any, index: number) => {
                                    const pct = Number(event.vs_baseline_pct ?? 0);
                                    return (
                                      <li
                                        key={`daytype-${event.event_name}-${index}`}
                                        className="flex items-center justify-between gap-3 text-[12px] text-white/70"
                                      >
                                        <span>{event.event_name}</span>
                                        <span className="font-bold text-gold-400 whitespace-nowrap">
                                          {pct >= 0 ? '+' : ''}
                                          {pct.toFixed(0)}%
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                  </CardContent>
                </Card>

                {/* Parish Clustering — diocese-wide view only */}
                {entityType === 'Parishes' &&
                  !lockEntityFilter &&
                  filterMode !== 'per-entity' &&
                  (() => {
                    const CLASS_COLORS: Record<string, string> = {
                      'Class A': '#D4AF37',
                      'Class B': '#10B981',
                      'Class C': '#60A5FA',
                      'Class D': '#F87171',
                      'Class E': '#A78BFA',
                    };
                    // A/B/C/D classification (see backend _parish_quadrant.py):
                    // D = currently subsidized by the diocese, regardless of
                    // stability. A/B/C = the remaining self-sufficient
                    // parishes, split into stability terciles (A = most
                    // stable third, C = most volatile third).
                    const CLUSTER_COLORS: Record<string, string> = {
                      A: '#D4AF37',
                      B: '#60A5FA',
                      C: '#10B981',
                      D: '#F87171',
                    };
                    const CLASS_STABILITY_LABEL: Record<string, string> = {
                      A: 'Most Stable',
                      B: 'Moderate Stability',
                      C: 'Most Volatile',
                      D: 'Subsidized',
                    };
                    const realCluster = apiParishCluster;
                    let pieData: { name: string; value: number; color: string }[];
                    let listRows: {
                      name: string;
                      subtitle: string;
                      label: string;
                      color: string;
                      reviewFlag: boolean;
                    }[];
                    let total: number;
                    let clusterKpis: { coverage: number } | null = null;

                    if (realCluster) {
                      pieData = Object.entries(CLUSTER_COLORS)
                        .map(([key, color]) => ({
                          name: `Class ${key}`,
                          value: (realCluster.cluster_counts?.[key] as number) ?? 0,
                          color,
                        }))
                        .filter((d) => d.value > 0);
                      const ranked = [...realCluster.parishes].sort(
                        (a: any, b: any) => (b.avg_monthly_collection ?? 0) - (a.avg_monthly_collection ?? 0),
                      );
                      listRows = ranked.map((p: any) => ({
                        name: p.institution_name || p.institution_id,
                        subtitle: `${formatCurrency(p.avg_monthly_collection ?? 0)}/mo avg • ${
                          (p.net_margin ?? 0) >= 0 ? '+' : ''
                        }${Math.round((p.net_margin ?? 0) * 100)}% margin • ${
                          CLASS_STABILITY_LABEL[p.cluster_label] ?? ''
                        }`,
                        label: `Class ${p.cluster_label}`,
                        color: CLUSTER_COLORS[p.cluster_label] || '#6B7280',
                        reviewFlag: p.cluster_label === 'D' && !!p.review_recommended,
                      }));
                      total = realCluster.parishes.length;
                      clusterKpis = {
                        coverage: Math.round((realCluster.kpis?.rule_coverage_rate ?? 0) * 100),
                      };
                    } else {
                      const classCounts: Record<string, number> = {};
                      filteredTopTierData.forEach((e) => {
                        const c = e.class || 'Other';
                        classCounts[c] = (classCounts[c] || 0) + 1;
                      });
                      pieData = Object.entries(classCounts)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([name, value]) => ({ name, value, color: CLASS_COLORS[name] || '#6B7280' }));
                      listRows = filteredTopTierData.map((entity) => ({
                        name: entity.name,
                        subtitle: `${entity.location}${entity.vicariate ? ` • ${stripVicariatePrefix(entity.vicariate)}` : ''}`,
                        label: entity.class || 'Other',
                        color: CLASS_COLORS[entity.class || ''] || '#6B7280',
                        reviewFlag: false,
                      }));
                      total = filteredTopTierData.length;
                    }

                    return (
                      <Card className="bg-[#1A1A1A] text-white border-none shadow-sm relative overflow-hidden rounded-xl flex flex-col">
                        <div className="absolute inset-0 opacity-[0.07] pointer-events-none z-0 flex items-center justify-center">
                          <img src="/src/assets/Church.png" alt="" className="w-full h-full object-contain scale-105" />
                        </div>

                        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-0 flex-1 min-h-0">
                          {/* ── Left: description + list ── */}
                          <div className="lg:col-span-7 flex flex-col px-6 pt-6 pb-6 border-r border-white/5">
                            <div className="mb-4">
                              <p className="text-[10px] font-black text-[#D4AF37]/70 uppercase tracking-[0.3em] mb-1">
                                Diocese Analytics
                              </p>
                              <div className="flex items-center gap-1.5">
                                <h3 className="text-xl font-bold text-white">Parish Classification</h3>
                                <ChartHelpToggle>
                                  Class D is any parish currently receiving diocese subsidy (Section B.3.03), full
                                  stop — regardless of how stable or volatile its own collections are. The remaining,
                                  self-sufficient parishes are ranked by Volatility Index (STL-residual volatility of
                                  receipts, scaled by each parish&apos;s own average, seasonally adjusted so
                                  predictable Christmas/Holy Week swings don&apos;t count against it) and split into
                                  thirds diocese-wide: Class A is the most stable third, B the middle third, C the
                                  most volatile third. Net Margin (organic, subsidy excluded) is shown for context
                                  but no longer determines the class. A Class D parish whose organic margin is
                                  comfortably positive is tagged &quot;Recommend Review&quot; — a flag for the diocese
                                  to consider, never an automatic change; the parish stays Class D until acted on.
                                  Rule Coverage is the share of parishes with enough history to be classified at all.
                                </ChartHelpToggle>
                              </div>
                              <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-sm">
                                {realCluster
                                  ? 'Parishes currently receiving diocese subsidy are Class D. The rest are self-sufficient and split into three tiers by how stable their collections are, seasonally adjusted — predictable Christmas/Holy Week swings don’t count as volatility. A: most stable · B: moderate stability · C: most volatile.'
                                  : 'Parishes are grouped by collection volume and pastoral capacity. Class A parishes are high-performing anchors; lower classes represent developing communities requiring targeted diocesan support.'}
                              </p>
                              {clusterKpis && (
                                <div className="flex gap-4 mt-3">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    Rule Coverage: <span className="text-[#D4AF37]">{clusterKpis.coverage}%</span>
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-dark max-h-[380px]">
                              {listRows.map((row, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/5"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center font-bold text-xs shrink-0">
                                      {i + 1}
                                    </div>
                                    <div>
                                      <p className="font-bold text-white text-sm leading-tight">{row.name}</p>
                                      <p className="text-[10px] font-bold text-gray-500 tracking-wider uppercase mt-0.5">
                                        {row.subtitle}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="font-bold text-sm" style={{ color: row.color }}>
                                      {row.label}
                                    </span>
                                    {row.reviewFlag && (
                                      <span
                                        className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10"
                                        title="Organic margin (excluding subsidy) is comfortably positive — consider reviewing this parish's continued need for subsidy."
                                      >
                                        Recommend Review
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* ── Right: pie chart ── */}
                          <div className="lg:col-span-5 flex flex-col items-center justify-center px-6 py-6 gap-5">
                            <div className="text-center">
                              <p className="text-[10px] font-black text-[#D4AF37]/70 uppercase tracking-[0.3em] mb-0.5">
                                Class Distribution
                              </p>
                              <p className="text-xs text-gray-500">
                                {total} parishes across {pieData.length} classes
                              </p>
                            </div>

                            {/* Donut chart */}
                            <div className="relative" style={{ width: 220, height: 220 }}>
                              <ReactECharts
                                option={{
                                  tooltip: {
                                    trigger: 'item',
                                    formatter: (params: any) =>
                                      `${params.name}: ${params.value} parishes (${Math.round((params.value / total) * 100)}%)`,
                                    backgroundColor: '#111',
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    textStyle: { color: '#fff', fontWeight: 700, fontSize: 12 },
                                    extraCssText: 'border-radius:12px',
                                  },
                                  series: [
                                    {
                                      type: 'pie',
                                      radius: ['56%', '82%'],
                                      center: ['50%', '50%'],
                                      padAngle: 3,
                                      data: pieData.map((d) => ({
                                        name: d.name,
                                        value: d.value,
                                        itemStyle: { color: d.color, opacity: 0.9 },
                                      })),
                                      label: { show: false },
                                      emphasis: { scale: false },
                                    },
                                  ],
                                }}
                                style={{ width: '100%', height: '100%' }}
                              />
                              {/* Center label */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <p className="text-3xl font-black text-white leading-none">{total}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">
                                  Parishes
                                </p>
                              </div>
                            </div>

                            {/* Legend */}
                            <div className="w-full grid grid-cols-2 gap-2">
                              {pieData.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-[11px] font-bold text-gray-300">{item.name}</span>
                                  </div>
                                  <span className="text-[11px] font-black" style={{ color: item.color }}>
                                    {item.value}{' '}
                                    <span className="text-gray-600 font-normal">
                                      ({Math.round((item.value / total) * 100)}%)
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })()}

                {/* Row 6: Geospatial Analysis — diocese-wide view only */}
                {entityType === 'Parishes' && !lockEntityFilter && filterMode !== 'per-entity' && (
                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-6 h-6 text-church-green" />
                        <h3 className="text-2xl font-bold text-church-green">Geospatial Collection Distribution</h3>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Heatmap showing the concentration of collections across the diocese.
                      </p>
                    </CardHeader>
                    <CardContent className="w-full mt-6">
                      <div className="h-[450px]">
                        <GeospatialHeatMap data={geoInstitutions.length > 0 ? geoInstitutions : undefined} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── Period Comparison — Parishes, Seminaries, Schools ── */}
                <Card className="border-none shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">
                          Financial Analytics
                        </p>
                        <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                          Period Comparison
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                          Compare {entityType} {cmpMetric} across two selected time periods
                        </p>
                      </div>
                      {/* Metric toggle */}
                      <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                        {(['collections', 'disbursements'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setCmpMetric(m)}
                            className={`px-4 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${
                              cmpMetric === m
                                ? 'bg-church-green text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4">
                    {/* Period selectors */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-2xl">
                      {/* Period 1 */}
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">
                          Period 1 — Month
                        </label>
                        <select
                          value={cmpMonth1}
                          onChange={(e) => setCmpMonth1(e.target.value as CmpMonth)}
                          className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-church-green/20"
                        >
                          {CMP_MONTHS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">
                          Period 1 — Year
                        </label>
                        <select
                          value={cmpYear1}
                          onChange={(e) => setCmpYear1(e.target.value as CmpYear)}
                          className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-church-green/20"
                        >
                          {availableCmpYears.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Period 2 */}
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">
                          Period 2 — Month
                        </label>
                        <select
                          value={cmpMonth2}
                          onChange={(e) => setCmpMonth2(e.target.value as CmpMonth)}
                          className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-church-green/20"
                        >
                          {CMP_MONTHS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-2">
                          Period 2 — Year
                        </label>
                        <select
                          value={cmpYear2}
                          onChange={(e) => setCmpYear2(e.target.value as CmpYear)}
                          className="w-full bg-white border border-gray-200 text-[11px] font-bold text-church-green rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:ring-2 focus:ring-church-green/20"
                        >
                          {availableCmpYears.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {entityType === 'Parishes' && !cmpResult && (
                      <p className="text-sm text-gray-400 text-center py-8">
                        No real data available for one or both of the selected periods.
                      </p>
                    )}

                    {cmpResult && (
                      <>
                        {/* Bar chart */}
                        <div className="h-[280px] mb-6">
                          <ReactECharts
                            option={{
                              color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                              tooltip: {
                                trigger: 'axis',
                                formatter: (params: any[]) =>
                                  `${params[0].axisValue}: ${formatCurrency(params[0].value)}`,
                                extraCssText:
                                  'border-radius:16px;border:none;box-shadow:0 10px 25px rgba(0,0,0,0.1);font-size:12px',
                              },
                              grid: { top: 20, right: 30, left: 60, bottom: 30 },
                              xAxis: {
                                type: 'category',
                                data: cmpResult.barData.map((d) => d.period),
                                axisLine: { show: false },
                                axisTick: { show: false },
                                axisLabel: { color: '#6B7280', fontSize: 11, fontWeight: 700 },
                              },
                              yAxis: {
                                type: 'value',
                                axisLine: { show: false },
                                axisTick: { show: false },
                                axisLabel: {
                                  color: '#9CA3AF',
                                  fontSize: 10,
                                  formatter: (v: number) => `${(v / 1_000_000).toFixed(1)}M`,
                                },
                                splitLine: { lineStyle: { color: '#F3F4F6' } },
                              },
                              series: [
                                {
                                  type: 'bar',
                                  data: cmpResult.barData.map((d, i) => ({
                                    value: d.value,
                                    itemStyle: { color: i === 0 ? '#1a472a' : '#D4AF37', borderRadius: [10, 10, 0, 0] },
                                  })),
                                  barMaxWidth: 90,
                                  label: {
                                    show: true,
                                    position: 'top',
                                    formatter: (p: any) => (p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(1)}M` : p.value >= 1000 ? `${Math.round(p.value / 1000)}k` : p.value > 0 ? `${Math.round(p.value)}` : ''),
                                    color: '#9CA3AF',
                                    fontSize: 9,
                                    fontWeight: 700,
                                  },
                                },
                              ],
                            }}
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>

                        {/* Summary cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                              {cmpResult.p1.label} &mdash;{' '}
                              {cmpMetric === 'collections' ? 'Collections' : 'Disbursements'}
                            </p>
                            <p className="text-2xl font-black text-church-green">
                              {formatCurrency(cmpResult.p1.value)}
                            </p>
                          </div>
                          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                              {cmpResult.p2.label} &mdash;{' '}
                              {cmpMetric === 'collections' ? 'Collections' : 'Disbursements'}
                            </p>
                            <p className="text-2xl font-black text-church-green">
                              {formatCurrency(cmpResult.p2.value)}
                            </p>
                          </div>
                          <div
                            className={`p-5 rounded-2xl border ${cmpResult.delta >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}
                          >
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                              Change / Growth
                            </p>
                            <p
                              className={`text-2xl font-black ${cmpResult.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                            >
                              {cmpResult.delta >= 0 ? '+' : ''}
                              {formatCurrency(cmpResult.delta)}
                            </p>
                            <p
                              className={`text-sm font-bold mt-1 flex items-center gap-1 ${cmpResult.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                            >
                              {cmpResult.delta >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              {cmpResult.delta >= 0 ? '+' : ''}
                              {cmpResult.pct.toFixed(1)}% vs {cmpResult.baseLabel}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Predictive View Content */}
            {analyticsView === 'predictive' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* Forecast chart — always visible for all entity types */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                        FORECASTING ENGINE
                      </p>
                      <h3 className="text-2xl font-bold text-gold-500">
                        {forecastTab === 'collections'
                          ? 'Monthly Collections Forecast'
                          : 'Monthly Disbursements Forecast'}
                      </h3>
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                      <button
                        onClick={() => setForecastTab('collections')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all uppercase tracking-widest ${forecastTab === 'collections' ? 'bg-gold-500 text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Collections
                      </button>
                      <button
                        onClick={() => setForecastTab('disbursements')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all uppercase tracking-widest ${forecastTab === 'disbursements' ? 'bg-gold-500 text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Disbursements
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="w-full mt-4">
                    {forecastTab === 'collections' ? (
                      <AdvancedForecastChart
                        data={dynamicTrendData}
                        actualKey="collections"
                        forecastKey="forecast"
                        yAxisLabel="Amount (PHP)"
                        title="MONTHLY COLLECTIONS"
                        entityType={entityType}
                        metrics={{ mae: 35.22, rmse: 42.02, mape: 20.88, mase: 0.38, wape: 19.72, mpe: 4.46 }}
                        // Only Collections gets live champion data: the
                        // backend's champion selection races candidates for
                        // receipts only — expenses always use a fixed
                        // Holt-Winters forecast with no comparable
                        // candidate race (see financial_forecast.py's
                        // _fetch_and_process), so Disbursements below keeps
                        // its mock metrics with no champion/dataSufficient
                        // props, same as before.
                        champion={apiParishForecast?.champion}
                        dataSufficient={apiParishForecast ? apiParishForecast.data_sufficient : undefined}
                      />
                    ) : (
                      <AdvancedForecastChart
                        data={dynamicTrendData}
                        actualKey="expenses_parish"
                        forecastKey="forecast"
                        yAxisLabel="Amount (PHP)"
                        title="MONTHLY DISBURSEMENTS"
                        entityType={entityType}
                        metrics={{ mae: 28.45, rmse: 34.12, mape: 15.67, mase: 0.412, wape: 14.89, mpe: 3.21 }}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Inflation Impact & Expense Spikes — always visible for all entity types */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                        EXPENSE PROJECTIONS
                      </p>
                      <h3 className="text-2xl font-bold text-gold-500">Disbursement Forecast</h3>
                      <p className="text-xs text-gray-400 mt-1">Based on historical year-over-year trend (+9%)</p>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <div
                        className="grid grid-cols-2 gap-4 overflow-y-auto max-h-[180px] [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: 'none' }}
                      >
                        {[
                          { label: 'UTILITIES', current: 210000, trend: 0.09 },
                          { label: 'WAGES', current: 360000, trend: 0.09 },
                          { label: 'SUPPLIES', current: 155000, trend: 0.09 },
                          { label: 'MAINTENANCE', current: 190000, trend: 0.09 },
                        ].map((item, i) => {
                          const projected = Math.round(item.current * (1 + item.trend));
                          const diff = projected - item.current;
                          return (
                            <div key={i} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-gray-400 tracking-wider">{item.label}</p>
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-church-black text-sm">
                                  {formatCurrency(item.current)}
                                </span>
                                <ArrowUpRight className="w-4 h-4 text-gold-500 shrink-0" />
                                <span className="font-bold text-gold-500 text-sm">{formatCurrency(projected)}</span>
                              </div>
                              <p className="text-[9px] text-amber-600 font-bold">
                                +{formatCurrency(diff)} projected increase
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">EVENTS</p>
                      <h3 className="text-2xl font-bold text-gold-500">Expense Spikes</h3>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <div
                        className="grid grid-cols-2 gap-4 overflow-y-auto max-h-[180px] [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: 'none' }}
                      >
                        {seasonalExpenseSpikes.map((item, i) => (
                          <div key={i} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-church-black">{item.event}</p>
                              <span className="font-bold text-red-500 bg-red-50 px-2 py-1 rounded text-xs">
                                {item.expectedSpike}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{item.primaryDrivers}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {entityType === 'Seminaries' ? (
                  <>
                    {/* Row 1: Pipeline & Attrition */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="lg:col-span-2 border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            PIPELINE FORECAST
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Ordination Pipeline (5-Year Forecast)</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: ordinationForecastData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Predicted Ordinations',
                                    type: 'line',
                                    data: ordinationForecastData.map((d) => d.predicted),
                                    smooth: true,
                                    lineStyle: { color: '#D4AF37', width: 3 },
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
                                    symbolSize: 8,
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            RISK ANALYSIS
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Historical Attrition Risk</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Risk Level (%)
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: attritionRiskData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Risk Level (%)',
                                    type: 'line',
                                    data: attritionRiskData.map((d) => d.risk),
                                    smooth: true,
                                    lineStyle: { color: '#EF4444', width: 3 },
                                    itemStyle: { color: '#EF4444' },
                                    symbolSize: 8,
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Row 2: Capacity & Yield */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                              CAPACITY PLANNING
                            </p>
                            <h3 className="text-2xl font-bold text-gold-500">Enrollment vs. Capacity Forecast</h3>
                          </div>
                          <select
                            value={enrollmentForecastFilter}
                            onChange={(e) => setEnrollmentForecastFilter(e.target.value as any)}
                            className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                          >
                            <option value="all">ALL CATEGORIES</option>
                            <option value="enrollment">PROJECTED ENROLLMENT</option>
                            <option value="capacity">MAXIMUM CAPACITY</option>
                          </select>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: enrollmentForecastData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  ...(enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'enrollment'
                                    ? [
                                        {
                                          name: 'Projected Enrollment',
                                          type: 'bar',
                                          data: enrollmentForecastData.map((d) => ({
                                            value: d.enrollment,
                                            itemStyle: { color: '#D4AF37', borderRadius: [6, 6, 0, 0] },
                                          })),
                                          barWidth: enrollmentForecastFilter === 'all' ? 30 : 60,
                                          label: {
                                            show: true,
                                            position: 'top',
                                            formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                            color: '#9CA3AF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                          },
                                        },
                                      ]
                                    : []),
                                  ...(enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'capacity'
                                    ? [
                                        {
                                          name: 'Maximum Capacity',
                                          type: 'line',
                                          data: enrollmentForecastData.map((d) => d.capacity),
                                          lineStyle: { color: '#EF4444', width: 2, type: 'dashed' },
                                          itemStyle: { color: '#EF4444' },
                                          showSymbol: false,
                                        },
                                      ]
                                    : []),
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`flex items-center gap-2 transition-opacity ${enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'enrollment' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Projected Enrollment
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 transition-opacity ${enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'capacity' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#EF4444]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Maximum Capacity
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            VOCATION PIPELINE
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Conversion Rates</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px]">
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'item',
                                  formatter: (params: any) => `${params.name}: ${params.value}`,
                                },
                                series: [
                                  {
                                    type: 'funnel',
                                    left: '10%',
                                    width: '80%',
                                    min: 0,
                                    max: 120,
                                    minSize: '0%',
                                    maxSize: '100%',
                                    sort: 'descending',
                                    gap: 4,
                                    label: {
                                      show: true,
                                      position: 'inside',
                                      color: '#fff',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      formatter: (params: any) => `${params.name}: ${params.value}`,
                                    },
                                    data: vocationPipelineData.map((d) => ({
                                      name: d.stage,
                                      value: d.count,
                                      itemStyle: { color: d.fill },
                                    })),
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Row 3: Supply/Demand & Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            FINANCIAL FORECAST
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Predicted Endowment Growth</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Amount (PHP)
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  formatter: (params: any[]) =>
                                    `${params[0].axisValue}: ${formatCurrency(params[0].value)}`,
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 55, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: endowmentGrowthData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: {
                                    color: '#6B7280',
                                    fontSize: 12,
                                    formatter: (v: number) => `${v / 1000000}M`,
                                  },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Endowment Value',
                                    type: 'line',
                                    data: endowmentGrowthData.map((d) => d.value),
                                    smooth: true,
                                    lineStyle: { color: '#D4AF37', width: 3 },
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
                                    symbolSize: 8,
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            INTEREST TRENDS
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Vocation Interest Trends</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Inquiries
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                grid: { top: 20, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: vocationInterestData.map((d) => d.month),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Monthly Inquiries',
                                    type: 'line',
                                    data: vocationInterestData.map((d) => d.inquiries),
                                    smooth: true,
                                    lineStyle: { color: '#1a472a', width: 3 },
                                    itemStyle: { color: '#1a472a' },
                                    symbolSize: 8,
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Month
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Row 4: Supply/Demand & Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="lg:col-span-2 border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">
                            STRATEGIC GAP
                          </p>
                          <h3 className="text-2xl font-bold text-gold-500">Priest Supply vs Demand Gap</h3>
                        </CardHeader>
                        <CardContent className="w-full mt-4">
                          <div className="h-[450px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Count
                              </span>
                            </div>
                            <ReactECharts
                              option={{
                                color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                                tooltip: {
                                  trigger: 'axis',
                                  extraCssText: 'border-radius:12px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.08)',
                                },
                                legend: { top: 0, data: ['Projected Retirements', 'Projected Ordinations'] },
                                grid: { top: 40, right: 30, left: 45, bottom: 30 },
                                xAxis: {
                                  type: 'category',
                                  data: priestGapData.map((d) => d.year),
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                },
                                yAxis: {
                                  type: 'value',
                                  axisLabel: { color: '#6B7280', fontSize: 12 },
                                  splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
                                },
                                series: [
                                  {
                                    name: 'Projected Retirements',
                                    type: 'bar',
                                    data: priestGapData.map((d) => ({
                                      value: d.retirements,
                                      itemStyle: { color: '#1a472a', borderRadius: [6, 6, 0, 0] },
                                    })),
                                    label: {
                                      show: true,
                                      position: 'top',
                                      formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                  {
                                    name: 'Projected Ordinations',
                                    type: 'bar',
                                    data: priestGapData.map((d) => ({
                                      value: d.ordinations,
                                      itemStyle: { color: '#D4AF37', borderRadius: [6, 6, 0, 0] },
                                    })),
                                    label: {
                                      show: true,
                                      position: 'top',
                                      formatter: (p: any) => (p.value > 0 ? `${Math.round(p.value)}` : ''),
                                      color: '#9CA3AF',
                                      fontSize: 9,
                                      fontWeight: 700,
                                    },
                                  },
                                ],
                              }}
                              style={{ height: '100%', width: '100%' }}
                            />
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Year
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Projected Retirements
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Projected Ordinations
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-black">Predictive Insights</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-[#FFF8E7] border border-[#E6C27A]/50 rounded-xl p-4 flex gap-3">
                            <AlertTriangle className="w-5 h-5 text-[#B5952F] flex-shrink-0" />
                            <div>
                              <p className="font-bold text-church-black text-sm">Capacity Warning</p>
                              <p className="text-xs font-medium text-white mt-2 bg-[#B5952F] px-2 py-1 rounded inline-block">
                                Projected: 2029
                              </p>
                              <p className="text-xs text-gray-600 mt-2">
                                Enrollment likely to exceed current housing capacity within 3 years.
                              </p>
                            </div>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Formation Success
                            </p>
                            <p className="text-sm text-church-black mt-1">
                              Current Theology II cohort shows 94% predicted ordination probability.
                            </p>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Staffing Forecast
                            </p>
                            <p className="text-sm text-church-black mt-1">
                              Requirement for 2 additional Spiritual Directors by 2027.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Predictions — Seminary */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="bg-church-black text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">PREDICTIONS</p>
                          <h3 className="text-2xl font-bold text-white">Collections Rise & Fall</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-gold-500 text-4xl font-bold">
                              <ArrowUpRight className="w-8 h-8" /> +14.2%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED RISE (Q1)
                            </p>
                          </div>
                          <div className="bg-[#222222] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                            <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                              <ArrowDownRight className="w-8 h-8" /> -3.8%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED DIP (Q2)
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-church-black text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">PREDICTIONS</p>
                          <h3 className="text-2xl font-bold text-white">Disbursement Rise & Fall</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-gold-500 text-4xl font-bold">
                              <ArrowUpRight className="w-8 h-8" /> +5.8%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED RISE (Q1)
                            </p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                              <ArrowDownRight className="w-8 h-8" /> -2.1%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED DIP (Q2)
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Row 2: Predictions, Events, Alerts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="bg-church-black text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">PREDICTIONS</p>
                          <h3 className="text-2xl font-bold text-white">Collections Rise & Fall</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-gold-500 text-4xl font-bold">
                              <ArrowUpRight className="w-8 h-8" /> +14.2%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED RISE (Q1)
                            </p>
                          </div>
                          <div className="bg-[#222222] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                            <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                              <ArrowDownRight className="w-8 h-8" /> -3.8%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED DIP (Q2)
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-church-black text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">PREDICTIONS</p>
                          <h3 className="text-2xl font-bold text-white">Disbursement Rise & Fall</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-gold-500 text-4xl font-bold">
                              <ArrowUpRight className="w-8 h-8" /> +5.8%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED RISE (Q1)
                            </p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center border border-white/5">
                            <div className="flex items-center gap-2 text-red-400 text-4xl font-bold">
                              <ArrowDownRight className="w-8 h-8" /> -2.1%
                            </div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mt-3 uppercase">
                              PROJECTED DIP (Q2)
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <h3 className="text-2xl font-bold text-church-black">Alerts</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          <div className="bg-[#FFF8E7] border border-[#E6C27A]/50 rounded-xl p-4 flex gap-3">
                            <AlertTriangle className="w-5 h-5 text-[#B5952F] flex-shrink-0" />
                            <div>
                              <p className="font-bold text-church-black text-sm">Projected Deficit Months</p>
                              <p className="text-xs font-medium text-white mt-2 bg-[#B5952F] px-2 py-1 rounded inline-block">
                                Watch: January
                              </p>
                            </div>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Inflation Notes
                            </p>
                            <p className="text-sm text-church-black mt-1">
                              Disbursements forecast assumes +1.2% monthly increase.
                            </p>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Event Spikes</p>
                            <p className="text-sm text-church-black mt-1">Expected uplift during holidays.</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Row 3: Risk & Rank Predictions */}
                    <div
                      className={`grid grid-cols-1 gap-6 ${entityType === 'Diocesan Schools' ? '' : 'lg:grid-cols-2'}`}
                    >
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                            RISK PREDICTION
                          </p>
                          <h3 className="text-2xl font-bold text-church-black">Monthly Bill Payment Risk</h3>
                        </CardHeader>
                        <CardContent className="space-y-6 mt-6">
                          {entityFilter !== 'All Entities' ? (
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-bold text-church-black text-lg">{entityFilter}</p>
                                <p className="text-xs font-bold text-amber-500 tracking-wider mt-1 uppercase">
                                  MEDIUM RISK: UTILITY APPEARS
                                </p>
                              </div>
                              <span className="font-bold text-amber-500 text-xl">45% Probability</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-center border-b border-gray-100 pb-6">
                                <div>
                                  <p className="font-bold text-church-black text-lg">
                                    {entityType === 'Diocesan Schools' ? 'Liceo de San Pablo' : 'St. Joseph Parish'}
                                  </p>
                                  <p className="text-xs font-bold text-rose-600 tracking-wider mt-1 uppercase">
                                    HIGH RISK: UTILITIES & SALARIES
                                  </p>
                                </div>
                                <span className="font-bold text-rose-600 text-xl">82% Probability</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-church-black text-lg">
                                    {entityType === 'Diocesan Schools'
                                      ? 'San Isidro Catholic School'
                                      : 'San Roque Parish'}
                                  </p>
                                  <p className="text-xs font-bold text-amber-500 tracking-wider mt-1 uppercase">
                                    MEDIUM RISK: UTILITY APPEARS
                                  </p>
                                </div>
                                <span className="font-bold text-amber-500 text-xl">45% Probability</span>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>

                      {entityType !== 'Diocesan Schools' && (
                        <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                          <CardHeader>
                            <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                              RANK PREDICTION
                            </p>
                            <h3 className="text-2xl font-bold text-white">Next Year Class Movement</h3>
                          </CardHeader>
                          <CardContent className="space-y-6 mt-6">
                            {(() => {
                              const entity = filteredEntities.length > 0 ? filteredEntities[0] : null;
                              const currentLetter = entity ? entity.class.replace('Class ', '') : 'B';
                              const nextLetter =
                                currentLetter === 'A' ? 'A' : String.fromCharCode(currentLetter.charCodeAt(0) - 1);
                              const displayName =
                                entityFilter !== 'All Entities'
                                  ? entityFilter.replace(/ Parish$/, '')
                                  : entityType === 'Diocesan Schools'
                                    ? 'San Isidro Catholic School'
                                    : 'San Roque';
                              return (
                                <div className="flex justify-between items-center border-b border-gray-800 pb-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gold-900/50 border border-gold-500/30 text-gold-500 flex items-center justify-center font-bold">
                                      {currentLetter}
                                    </div>
                                    <ArrowUpRight className="w-4 h-4 text-gray-500" />
                                    <div className="w-10 h-10 rounded-full bg-gold-500 text-white flex items-center justify-center font-bold">
                                      {nextLetter}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-white text-lg">{displayName}</p>
                                    <p className="text-[10px] font-bold text-emerald-400 tracking-wider mt-1 uppercase">
                                      92% CONFIDENCE
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Prescriptive View Content */}
            {analyticsView === 'prescriptive' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                {entityType === 'Seminaries' ? (
                  <div className="space-y-6">
                    {/* Row 1: Strategic Actions */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Donor Engagement Strategy */}
                      <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">DEVELOPMENT</p>
                          <h3 className="text-2xl font-bold text-white">Donor Engagement Strategy</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          {[
                            {
                              name: 'Endowment Campaign',
                              potential: 'High',
                              recommendation: 'Launch "Legacy of Faith" campaign targeting major donors.',
                              impact: `+${formatCurrency(15000000)} Growth`,
                            },
                            {
                              name: 'Alumni Network',
                              potential: 'Medium',
                              recommendation: 'Re-engage former seminarians for scholarship support.',
                              impact: `+${formatCurrency(2000000)}/yr`,
                            },
                            {
                              name: 'Parish Partnerships',
                              potential: 'High',
                              recommendation: 'Establish "Adopt-a-Seminarian" parish programs.',
                              impact: '+20% Support',
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                            >
                              <div>
                                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                <p className="text-xs text-gray-400 mt-1">{item.recommendation}</p>
                                <p className="text-[10px] font-bold text-gold-500 mt-2 uppercase tracking-tighter">
                                  POTENTIAL: {item.potential}
                                </p>
                              </div>
                              <span className="bg-gold-500/10 text-gold-400 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                {item.impact}
                              </span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Faculty Development Plan */}
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-church-black">ACADEMIC</p>
                          <h3 className="text-2xl font-bold text-church-black">Faculty Development Plan</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          {[
                            {
                              name: 'Advanced Degrees',
                              need: 'High',
                              action: 'Sponsor 2 faculty members for doctoral studies in Rome.',
                              saving: 'Long-term',
                            },
                            {
                              name: 'Spiritual Formation',
                              need: 'Critical',
                              action: 'Hire 1 additional full-time Spiritual Director.',
                              saving: 'Immediate',
                            },
                            {
                              name: 'Digital Integration',
                              need: 'Medium',
                              action: 'Implement new LMS for hybrid learning capabilities.',
                              saving: `${formatCurrency(200000)}/yr`,
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex justify-between items-center gap-4"
                            >
                              <div>
                                <h4 className="font-bold text-church-black text-sm">{item.name}</h4>
                                <p className="text-xs text-gray-500 mt-1">{item.action}</p>
                                <p className="text-[10px] font-bold text-church-black mt-2 uppercase tracking-tighter">
                                  NEED LEVEL: {item.need}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-gold-600 text-xs font-bold block">{item.saving}</span>
                                <span className="text-[10px] text-gray-400 uppercase font-bold">EST. IMPACT</span>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Strategic Targeting: Vocation Campaign Priority */}
                      <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                            STRATEGIC TARGETING
                          </p>
                          <h3 className="text-2xl font-bold text-white">Vocation Campaign Priority</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          {[
                            {
                              name: 'Northern Region',
                              potential: 'High',
                              recommendation: 'Deploy mobile vocation team for youth summit.',
                              impact: '+12% Pipeline',
                            },
                            {
                              name: 'Holy Rosary Parish',
                              potential: 'Medium',
                              recommendation: 'Initiate "Shadow a Seminarian" weekend program.',
                              impact: '+8% Pipeline',
                            },
                            {
                              name: 'St. Jude College Ministry',
                              potential: 'High',
                              recommendation: 'Establish permanent campus ministry presence.',
                              impact: '+15% Pipeline',
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                            >
                              <div>
                                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                <p className="text-xs text-gray-400 mt-1">{item.recommendation}</p>
                                <p className="text-[10px] font-bold text-gold-500 mt-2 uppercase tracking-tighter">
                                  POTENTIAL: {item.potential}
                                </p>
                              </div>
                              <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                {item.impact}
                              </span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Resource Allocation: Scholarship Optimization */}
                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                            RESOURCE ALLOCATION
                          </p>
                          <h3 className="text-2xl font-bold text-church-black">Scholarship Optimization</h3>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-4">
                          {[
                            {
                              name: 'Theology III Cohort',
                              need: 'High',
                              action: 'Increase tuition subsidy by 15% to prevent attrition.',
                              saving: `${formatCurrency(120000)}/yr`,
                            },
                            {
                              name: 'Philosophy I (New)',
                              need: 'Critical',
                              action: 'Allocate 5 full-ride merit scholarships for top recruits.',
                              saving: `${formatCurrency(450000)}/yr`,
                            },
                            {
                              name: 'Pastoral Year Interns',
                              need: 'Low',
                              action: 'Shift stipend burden to host parishes (Cost-sharing).',
                              saving: `${formatCurrency(85000)}/yr`,
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex justify-between items-center gap-4"
                            >
                              <div>
                                <h4 className="font-bold text-church-black text-sm">{item.name}</h4>
                                <p className="text-xs text-gray-500 mt-1">{item.action}</p>
                                <p className="text-[10px] font-bold text-church-black mt-2 uppercase tracking-tighter">
                                  NEED LEVEL: {item.need}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-gold-600 text-xs font-bold block">{item.saving}</span>
                                <span className="text-[10px] text-gray-400 uppercase font-bold">EST. IMPACT</span>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <>
                    {entityFilter !== 'All Entities' ? (
                      /* Per-parish prescriptive content */
                      <div className="space-y-6">
                        <div
                          className={`grid grid-cols-1 gap-6 ${entityType === 'Diocesan Schools' ? '' : 'lg:grid-cols-2'}`}
                        >
                          <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                            <CardHeader>
                              <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                                EFFICIENCY
                              </p>
                              <h3 className="text-2xl font-bold text-white">Utility Cost Reduction</h3>
                            </CardHeader>
                            <CardContent className="space-y-4 mt-4">
                              {[
                                {
                                  desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                  ratio: '25% Savings',
                                },
                                {
                                  desc: 'Adopt solar panels for daytime electrical load reduction.',
                                  ratio: '15% Savings',
                                },
                                {
                                  desc: 'Install sub-metering to identify high-consumption zones.',
                                  ratio: '10% Savings',
                                },
                              ].map((item, i) => (
                                <div
                                  key={i}
                                  className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                                >
                                  <div>
                                    <h4 className="font-bold text-white text-sm">{entityFilter}</h4>
                                    <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                                  </div>
                                  <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                    {item.ratio}
                                  </span>
                                </div>
                              ))}
                            </CardContent>
                          </Card>

                          {entityType !== 'Diocesan Schools' && (
                            <Card className="border-none shadow-sm">
                              <CardHeader>
                                <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                                  ACTION PLAN
                                </p>
                                <h3 className="text-2xl font-bold text-church-black">Ranking Upgrade</h3>
                              </CardHeader>
                              <CardContent className="space-y-4 mt-4">
                                {(() => {
                                  const ent = filteredEntities.length > 0 ? filteredEntities[0] : null;
                                  const cur = ent ? ent.class.replace('Class ', '') : 'B';
                                  const nxt = cur === 'A' ? 'A' : String.fromCharCode(cur.charCodeAt(0) - 1);
                                  return (
                                    <>
                                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex justify-between items-center gap-4">
                                        <div>
                                          <h4 className="font-bold text-church-black text-sm">{entityFilter}</h4>
                                          <p className="text-xs text-gray-500 mt-1">
                                            Increase pledge giving + align disbursements to baseline utilities and
                                            wages.
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <div className="w-6 h-6 rounded-full bg-church-black text-white flex items-center justify-center text-xs font-bold">
                                            {cur}
                                          </div>
                                          <ArrowUpRight className="w-4 h-4 text-gold-500" />
                                          <div className="w-6 h-6 rounded-full bg-gold-500 text-church-black flex items-center justify-center text-xs font-bold">
                                            {nxt}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5">
                                        <p className="text-xs font-bold text-church-black uppercase tracking-widest mb-2">
                                          Key Actions
                                        </p>
                                        <ul className="space-y-2 text-xs text-gray-500">
                                          <li>• Boost weekly Sunday collections through active pledge campaigns.</li>
                                          <li>• Review and trim non-essential operational disbursements.</li>
                                          <li>• Submit timely financial reports to maintain good standing.</li>
                                        </ul>
                                      </div>
                                    </>
                                  );
                                })()}
                              </CardContent>
                            </Card>
                          )}
                        </div>

                        <Card className="bg-[#1A1A1A] text-white border-none shadow-sm">
                          <CardHeader>
                            <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                              DISBURSEMENTS
                            </p>
                            <h3 className="text-2xl font-bold text-white">
                              {entityFilter.replace(/ Parish$/, '')} — Expense Optimization
                            </h3>
                          </CardHeader>
                          <CardContent className="space-y-4 mt-4">
                            {[
                              {
                                name: 'Liturgical Supplies',
                                desc: 'Consolidate bulk purchases of candles, hosts, and vestments on a quarterly basis to cut per-unit costs.',
                                impact: '10-15% Savings',
                              },
                              {
                                name: 'Pastoral Events',
                                desc: 'Co-host large parish events with neighboring churches to share logistical and venue costs.',
                                impact: '20% Cost Reduction',
                              },
                              {
                                name: 'Preventative Maintenance',
                                desc: 'Establish a mandatory quarterly maintenance schedule for parish facilities to prevent costly emergency repairs.',
                                impact: 'Long-term Stability',
                              },
                            ].map((item, i) => (
                              <div
                                key={i}
                                className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                              >
                                <div>
                                  <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                  <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                                </div>
                                <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                  {item.impact}
                                </span>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      /* Diocese-wide prescriptive content */
                      <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <Card
                            className={`bg-[#1A1A1A] text-white border-none shadow-sm ${entityType === 'Diocesan Schools' ? 'lg:col-span-2' : ''}`}
                          >
                            <CardHeader>
                              <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                                EFFICIENCY
                              </p>
                              <h3 className="text-2xl font-bold text-white">Utility Cost Reduction</h3>
                            </CardHeader>
                            <CardContent className="space-y-4 mt-4">
                              {(entityType === 'Parishes'
                                ? [
                                    {
                                      name: 'San Lorenzo Ruiz Parish',
                                      desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                      ratio: '25% Ratio',
                                    },
                                    {
                                      name: 'Our Lady of Lourdes Parish',
                                      desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                      ratio: '26% Ratio',
                                    },
                                    {
                                      name: 'Christ the King Parish',
                                      desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                      ratio: '29% Ratio',
                                    },
                                  ]
                                : [
                                    {
                                      name: 'St. Mary Academy',
                                      desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                      ratio: '25% Ratio',
                                    },
                                    {
                                      name: 'Holy Family School',
                                      desc: 'Shift to LED fixtures + scheduled AC maintenance, review peak-hour usage.',
                                      ratio: '26% Ratio',
                                    },
                                  ]
                              ).map((item, i) => (
                                <div
                                  key={i}
                                  className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                                >
                                  <div>
                                    <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                    <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                                  </div>
                                  <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                    {item.ratio}
                                  </span>
                                </div>
                              ))}
                            </CardContent>
                          </Card>

                          {entityType !== 'Diocesan Schools' && (
                            <Card className="border-none shadow-sm">
                              <CardHeader>
                                <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                                  ACTION PLAN
                                </p>
                                <h3 className="text-2xl font-bold text-church-black">Ranking Upgrades</h3>
                              </CardHeader>
                              <CardContent className="space-y-4 mt-4">
                                {[
                                  {
                                    name: 'Immaculate Conception Parish',
                                    desc: 'Increase pledge giving + align disbursements to baseline utilities and wages.',
                                    from: 'C',
                                    to: 'B',
                                  },
                                  {
                                    name: 'San Gabriel Archangel Parish',
                                    desc: 'Increase pledge giving + align disbursements to baseline utilities and wages.',
                                    from: 'D',
                                    to: 'C',
                                  },
                                  {
                                    name: 'San Isidro Labrador Parish',
                                    desc: 'Increase pledge giving + align disbursements to baseline utilities and wages.',
                                    from: 'D',
                                    to: 'C',
                                  },
                                ].map((item, i) => (
                                  <div
                                    key={i}
                                    className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex justify-between items-center gap-4"
                                  >
                                    <div>
                                      <h4 className="font-bold text-church-black text-sm">{item.name}</h4>
                                      <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="w-6 h-6 rounded-full bg-church-black text-white flex items-center justify-center text-xs font-bold">
                                        {item.from}
                                      </div>
                                      <ArrowUpRight className="w-4 h-4 text-gold-500" />
                                      <div className="w-6 h-6 rounded-full bg-gold-500 text-church-black flex items-center justify-center text-xs font-bold">
                                        {item.to}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                          <Card className="bg-[#1A1A1A] text-white border-none shadow-sm lg:col-span-2">
                            <CardHeader>
                              <p className="text-[10px] font-bold tracking-widest uppercase text-gold-500">
                                DISBURSEMENTS
                              </p>
                              <h3 className="text-2xl font-bold text-white">Diocese-Wide Expense Optimization</h3>
                            </CardHeader>
                            <CardContent className="space-y-4 mt-4">
                              {[
                                {
                                  name: 'Pastoral Program Synergy',
                                  desc: 'Encourage neighboring parishes within vicariates to co-host large pastoral events and training seminars to share costs.',
                                  impact: '20% Cost Reduction per Event',
                                },
                                {
                                  name: 'Preventative Maintenance',
                                  desc: 'Establish a mandatory quarterly maintenance schedule for all parish facilities to reduce emergency repair disbursements.',
                                  impact: 'Long-term Stability',
                                },
                              ].map((item, i) => (
                                <div
                                  key={i}
                                  className="bg-[#222222] border border-gray-800 rounded-xl p-5 flex justify-between items-center gap-4"
                                >
                                  <div>
                                    <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                    <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                                  </div>
                                  <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                                    {item.impact}
                                  </span>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {entityFilter === 'All Entities' && <StewardChatbot />}
    </div>
  );
}
