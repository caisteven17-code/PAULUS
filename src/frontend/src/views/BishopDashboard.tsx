'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  FunnelChart,
  Funnel,
  LabelList,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { ALL_PARISHES, APP_CONFIG, VICARIATES } from '../constants';
import dynamic from 'next/dynamic';
const GeospatialHeatMap = dynamic(
  () => import('../components/ui/GeospatialHeatMap').then((mod) => ({ default: mod.GeospatialHeatMap })),
  {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading map...</div>,
  },
);
import { dataService } from '../services/dataService';
import { FinancialRecord, FinancialHealthScore, DiagnosticResult } from '../types';
import { auth } from '../firebase';
import { FinancialHealthGauge } from '../components/ui/FinancialHealthGauge';
import { HealthDimensionBar } from '../components/ui/HealthDimensionBar';
import { DiagnosticCard } from '../components/ui/DiagnosticCard';
import { StewardChatbot } from '../components/ui/StewardChatbot';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber } from '../lib/format';
import SeminaryAnalyticsDashboard from '../components/analytics/SeminaryAnalyticsDashboard';
import { DataImportExport } from '../components/projects/DataImportExport';

const weeklyDeclineDataRaw = [
  {
    parish: 'San Gabriel Arkanghel Parish',
    vicariate: 'St. Paul the First Hermit',
    class: 'Class B',
    w1: 412000,
    w2: 386000,
    w3: 351000,
    w4: 322000,
    trend: -22,
    type: 'down',
  },
  {
    parish: 'Our Lady of the Pillar Parish',
    vicariate: 'St. Paul the First Hermit',
    class: 'Class C',
    w1: 412000,
    w2: 279000,
    w3: 261000,
    w4: 248000,
    trend: -14,
    type: 'down',
  },
  {
    parish: 'Sto. Rosario Parish',
    vicariate: 'San Pedro Apostol',
    class: 'Class D',
    w1: 301000,
    w2: 318000,
    w3: 296000,
    w4: 281000,
    trend: -6,
    type: 'down',
  },
  {
    parish: 'Mother of Good Counsel Parish',
    vicariate: 'Holy Family',
    class: 'Class D',
    w1: 214000,
    w2: 203000,
    w3: 191000,
    w4: 176000,
    trend: -18,
    type: 'down',
  },
  {
    parish: 'Chair of St. Peter Parish',
    vicariate: 'Sta. Rosa De Lima',
    class: 'Class A',
    w1: 612000,
    w2: 598000,
    w3: 583000,
    w4: 576000,
    trend: -6,
    type: 'down',
  },
];

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
const CMP_YEARS = ['2024', '2025', '2026'] as const;
type CmpMonth = (typeof CMP_MONTHS)[number];
type CmpYear = (typeof CMP_YEARS)[number];

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
const CMP_YEAR_FACTOR: Record<CmpYear, number> = { '2024': 0.91, '2025': 1.0, '2026': 1.09 };
const getDiocesanMonthly = (entityType: string, year: CmpYear) => {
  const base = DIOCESE_MONTHLY_BASE[entityType] ?? DIOCESE_MONTHLY_BASE['Parishes'];
  const factor = CMP_YEAR_FACTOR[year];
  return base.map((d) => ({
    month: d.month,
    collections: Math.round(d.collections * factor),
    disbursements: Math.round(d.disbursements * factor),
  }));
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

const CustomForecastTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Filter out null values (future actuals)
    const validPayload = payload.filter((entry: any) => entry.value !== null && entry.value !== undefined);

    if (validPayload.length === 0) return null;

    return (
      <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
        <div className="space-y-1.5">
          {validPayload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-xs font-medium text-gray-600">{entry.name}:</span>
              </div>
              <span className="text-xs font-bold text-church-black">
                {new Intl.NumberFormat('en-PH', {
                  style: 'currency',
                  currency: 'PHP',
                  maximumFractionDigits: 0,
                }).format(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

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
}: {
  data: any[];
  actualKey: string;
  forecastKey: string;
  yAxisLabel: string;
  title: string;
  entityType?: string;
  metrics?: any;
}) => {
  const [showInterpretation, setShowInterpretation] = useState(false);
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

  return (
    <div className="flex flex-col w-full bg-white/50 rounded-2xl p-4 border border-gray-100/50">
      <div className="h-[340px] flex items-center">
        <div className="w-8 flex-shrink-0 flex items-center justify-center h-full">
          <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.4em] -rotate-90 whitespace-nowrap">
            {yAxisLabel}
          </span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData} margin={{ top: 30, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#F3F4F6" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
              tickFormatter={(value) => `${value / 1000000}M`}
              width={45}
            />
            <Tooltip content={<CustomForecastTooltip />} />

            <ReferenceArea
              x1="Jan"
              x2={pastEnd}
              fill="#F0F9FF"
              fillOpacity={0.4}
              label={{
                position: 'insideTopLeft',
                value: 'PAST (Train)',
                fill: '#0EA5E9',
                fontSize: 9,
                fontWeight: 800,
                offset: 10,
              }}
            />
            <ReferenceArea
              x1={pastEnd}
              x2={presentEnd}
              fill="#FFF7ED"
              fillOpacity={0.4}
              label={{
                position: 'insideTopLeft',
                value: 'PRESENT (Holdout)',
                fill: '#F97316',
                fontSize: 9,
                fontWeight: 800,
                offset: 10,
              }}
            />
            <ReferenceArea
              x1={presentEnd}
              x2={futureEnd}
              fill="#F0FDF4"
              fillOpacity={0.4}
              label={{
                position: 'insideTopLeft',
                value: 'FUTURE (Forecast)',
                fill: '#22C55E',
                fontSize: 9,
                fontWeight: 800,
                offset: 10,
              }}
            />

            <ReferenceLine x={presentEnd} stroke="#D1D5DB" strokeDasharray="4 4" />

            <Line
              type="monotone"
              dataKey={actualKey}
              name="Historical (Actual)"
              stroke="#1a472a"
              strokeWidth={4}
              dot={{ r: 4, fill: '#1a472a', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, strokeWidth: 0 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey={forecastKey}
              name="Forecast (ML Model)"
              stroke="#D4AF37"
              strokeWidth={4}
              strokeDasharray="8 4"
              dot={{ r: 4, fill: '#D4AF37', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, strokeWidth: 0 }}
            />

            <Legend
              verticalAlign="top"
              align="right"
              height={50}
              iconType="circle"
              wrapperStyle={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#4B5563',
              }}
            />
          </LineChart>
        </ResponsiveContainer>
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
                <td className="text-center py-3 border-y border-gray-100">{metrics.mae}</td>
                <td className="text-center py-3 border-y border-gray-100">{metrics.rmse}</td>
                <td className="text-center py-3 border-y border-gray-100 text-gold-600 font-bold">{metrics.mape}%</td>
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

const getDeclineData = (type: string) => {
  const entities = getEntitiesData(type);

  return entities.map((entity: any, index: number) => {
    // Generate some mock monthly data
    // Use index to create some variety in trends
    const isStruggling = index % 3 === 0;
    const baseVal = 300000 + index * 50000;
    const m1 = baseVal;

    // If struggling, trend downwards. If not, trend upwards or stay stable.
    const m2 = baseVal * (isStruggling ? 0.95 : 1.02);
    const m3 = m2 * (isStruggling ? 0.92 : 1.03);
    const m4 = m3 * (isStruggling ? 0.88 : 1.01);

    const trend = Math.round(((m4 - m1) / m1) * 100);

    return {
      name: entity.name,
      vicariate: entity.vicariate || 'Holy Family',
      class: entity.class || ['Class A', 'Class B', 'Class C', 'Class D'][index % 4],
      w1: m1,
      w2: m2,
      w3: m3,
      w4: m4,
      trend: trend,
      type: trend < 0 ? 'down' : 'up',
    };
  });
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
  year?: number;
  onYearChange?: (year: number) => void;
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
  year = 2026,
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<DiagnosticResult | null>(null);
  const [healthScores, setHealthScores] = useState<FinancialHealthScore[]>([]);
  const [collectionsTimeframe, setCollectionsTimeframe] = useState<'6m' | '12m'>('12m');
  const [disbursementsTimeframe, setDisbursementsTimeframe] = useState<'6m' | '12m'>('12m');
  const [collectionsFilter, setCollectionsFilter] = useState<
    'all' | 'collections_mass' | 'sacraments_rate' | 'collections_other'
  >('all');
  const [disbursementsFilter, setDisbursementsFilter] = useState<'all' | 'expenses_parish' | 'expenses_pastoral'>(
    'all',
  );
  const [priestGapFilter, setPriestGapFilter] = useState<'all' | 'retirements' | 'ordinations'>('all');
  const [enrollmentFilter, setEnrollmentFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [formationFilter, setFormationFilter] = useState<'all' | 'propaedeutic' | 'philosophy' | 'theology'>('all');
  const [enrollmentForecastFilter, setEnrollmentForecastFilter] = useState<'all' | 'enrollment' | 'capacity'>('all');
  const [staffRatioFilter, setStaffRatioFilter] = useState<'all' | 'seminarians' | 'staff'>('all');
  const [collectionsDisbursementsFilter, setCollectionsDisbursementsFilter] = useState<
    'all' | 'collections' | 'disbursements'
  >('all');

  const filteredCollectionsData = useMemo(() => {
    return collectionsTimeframe === '6m' ? trendData.slice(-6) : trendData;
  }, [collectionsTimeframe]);

  const filteredDisbursementsData = useMemo(() => {
    return disbursementsTimeframe === '6m' ? trendData.slice(-6) : trendData;
  }, [disbursementsTimeframe]);

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
  const [districtFilter, setDistrictFilter] = useState('All Districts');
  const [vicariateFilter, setVicariateFilter] = useState('All Vicariates');
  const [classFilter, setClassFilter] = useState('All Classes');
  const [entityFilter, setEntityFilter] = useState(initialEntityFilter || 'All Entities');
  const [filterMode, setFilterMode] = useState<'all' | 'per-entity'>(initialEntityFilter ? 'per-entity' : 'all');
  const [contributionView, setContributionView] = useState<'entity' | 'vicariate'>('vicariate');
  const [selectedVicariate, setSelectedVicariate] = useState<string | null>(null);
  const [selectedBarVicariate, setSelectedBarVicariate] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [contributionSortOrder, setContributionSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [forecastTab, setForecastTab] = useState<'collections' | 'disbursements'>('collections');

  // Period Comparison state
  const [cmpMetric, setCmpMetric] = useState<'collections' | 'disbursements'>('collections');
  const [cmpMonth1, setCmpMonth1] = useState<CmpMonth>('Jan');
  const [cmpYear1, setCmpYear1] = useState<CmpYear>('2025');
  const [cmpMonth2, setCmpMonth2] = useState<CmpMonth>('Jan');
  const [cmpYear2, setCmpYear2] = useState<CmpYear>('2026');

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

  const currentEntities = useMemo(() => getEntitiesData(entityType), [entityType]);

  useEffect(() => {
    const fetchHealthScores = async () => {
      const scores = await Promise.all(
        currentEntities.map((e) =>
          dataService.calculateHealthScore(
            e.name,
            entityType === 'Parishes' ? 'parish' : entityType === 'Seminaries' ? 'seminary' : 'school',
            e.class,
          ),
        ),
      );
      setHealthScores(scores);
    };
    if (!isLoading) fetchHealthScores();
  }, [isLoading, entityType, currentEntities]);

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
  }, [filteredEntities, selectedBarVicariate, entityType]);

  useEffect(() => {
    setSelectedBarVicariate(null);
  }, [entityType]);

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

  const filteredDeclineData = useMemo(() => {
    let data = getDeclineData(entityType)
      .map((item) => ({
        ...item,
        district: VICARIATE_TO_DISTRICT[item.vicariate] || 'Other',
      }))
      .filter((p: any) => {
        const dMatch =
          entityType === 'Seminaries' || districtFilter === 'All Districts' || p.district === districtFilter;
        const vMatch =
          entityType === 'Seminaries' || vicariateFilter === 'All Vicariates' || p.vicariate === vicariateFilter;
        const cMatch = classFilter === 'All Classes' || p.class === classFilter;
        const pMatch = entityFilter === 'All Entities' || p.name === entityFilter;
        return dMatch && vMatch && cMatch && pMatch;
      });

    if (sortConfig) {
      data.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [districtFilter, vicariateFilter, classFilter, entityFilter, sortConfig, entityType]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const dynamicTrendData = useMemo(() => {
    const scale = filteredEntities.length / (currentEntities.length || 1);
    return filteredTrendData.map((d) => ({
      ...d,
      collections: d.collections * scale,
      forecast: d.forecast * scale,
    }));
  }, [filteredEntities, currentEntities, filteredTrendData]);

  const dynamicSeasonalityData = useMemo(() => {
    const scale = filteredEntities.length / (currentEntities.length || 1);
    return filteredSeasonalityData.map((d) => ({
      ...d,
      value: d.value * scale,
    }));
  }, [filteredEntities, currentEntities, filteredSeasonalityData]);

  const kpiData = useMemo(() => {
    const useFilteredEntityTotals = entityFilter !== 'All Entities' || records.length === 0;
    const totalCollections = !useFilteredEntityTotals
      ? records.reduce((sum, e) => sum + (e.collections || 0), 0)
      : filteredEntities.reduce((sum, e) => sum + e.collections, 0);

    const totalConsumable = !useFilteredEntityTotals
      ? records.reduce((sum, e) => sum + (e.consumableCollections || 0), 0)
      : totalCollections * 0.22;

    const totalDisbursements = !useFilteredEntityTotals
      ? records.reduce((sum, e) => sum + (e.disbursements || 0), 0)
      : totalCollections * 0.76;

    // Calculate class breakdown
    const classCounts: Record<string, number> = {};
    filteredEntities.forEach((e) => {
      const cls = e.class.replace('Class ', '');
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    });
    const classBreakdown = Object.entries(classCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cls, count]) => `${cls}:${count}`)
      .join(' | ');

    return {
      collections: formatCurrency(totalCollections),
      consumable: formatCurrency(totalConsumable),
      disbursements: formatCurrency(totalDisbursements),
      count: formatNumber(filteredEntities.length),
      classBreakdown: classBreakdown || 'None',
      totalEnrollment: formatNumber(filteredEntities.reduce((sum, e) => sum + (e.enrollment || 0), 0)),
    };
  }, [entityFilter, filteredEntities, records]);

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
  const classes = ['All Classes', 'Class A', 'Class B', 'Class C', 'Class D', 'Class E'];
  const entityNames = ['All Entities', ...new Set(currentEntities.map((p) => p.name))];

  const filteredHealthScores = useMemo(() => {
    const filteredNames = new Set(filteredEntities.map((e) => e.name));
    return healthScores.filter((s) => filteredNames.has(s.entityId));
  }, [healthScores, filteredEntities]);

  const averageScore = useMemo(() => {
    if (filteredHealthScores.length === 0) return 72;
    return Math.round(filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) / filteredHealthScores.length);
  }, [filteredHealthScores]);

  const averageDimensions = useMemo(() => {
    if (filteredHealthScores.length === 0)
      return { liquidity: 75, sustainability: 68, efficiency: 82, stability: 65, growth: 55 };
    const count = filteredHealthScores.length;
    return {
      liquidity: Math.round(filteredHealthScores.reduce((sum, s) => sum + s.dimensions.liquidity, 0) / count),
      sustainability: Math.round(filteredHealthScores.reduce((sum, s) => sum + s.dimensions.sustainability, 0) / count),
      efficiency: Math.round(filteredHealthScores.reduce((sum, s) => sum + s.dimensions.efficiency, 0) / count),
      stability: Math.round(filteredHealthScores.reduce((sum, s) => sum + s.dimensions.stability, 0) / count),
      growth: Math.round(filteredHealthScores.reduce((sum, s) => sum + s.dimensions.growth, 0) / count),
    };
  }, [filteredHealthScores]);

  const trendText = useMemo(() => {
    if (averageScore > 75) return 'Optimal';
    if (averageScore > 60) return 'Stable';
    return 'Needs Attention';
  }, [averageScore]);

  // Period Comparison derived data
  const cmpResult = useMemo(() => {
    const monthly1 = getDiocesanMonthly(entityType, cmpYear1);
    const monthly2 = getDiocesanMonthly(entityType, cmpYear2);
    const m1 = monthly1.find((d) => d.month === cmpMonth1);
    const m2 = monthly2.find((d) => d.month === cmpMonth2);
    if (!m1 || !m2) return null;
    const v1 = m1[cmpMetric];
    const v2 = m2[cmpMetric];
    const delta = v2 - v1;
    const pct = v1 > 0 ? (delta / v1) * 100 : 0;
    return {
      p1: { label: `${cmpMonth1} ${cmpYear1}`, value: v1 },
      p2: { label: `${cmpMonth2} ${cmpYear2}`, value: v2 },
      delta,
      pct,
      barData: [
        { period: `${cmpMonth1} ${cmpYear1}`, value: v1 },
        { period: `${cmpMonth2} ${cmpYear2}`, value: v2 },
      ],
    };
  }, [entityType, cmpMetric, cmpMonth1, cmpYear1, cmpMonth2, cmpYear2]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-church-green"></div>
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
                    disabled={lockEntityFilter}
                    onClick={() => {
                      if (lockEntityFilter) return;
                      setFilterMode('all');
                      setEntityFilter('All Entities');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                      filterMode === 'all'
                        ? 'bg-gold-500 text-black shadow-lg'
                        : lockEntityFilter
                          ? 'text-white/20 cursor-not-allowed'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setFilterMode('per-entity');
                      setVicariateFilter('All Vicariates');
                      setClassFilter('All Classes');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                      filterMode === 'per-entity'
                        ? 'bg-gold-500 text-black shadow-lg'
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
                              onChange={(e) => {
                                setDistrictFilter(e.target.value);
                                setVicariateFilter('All Vicariates');
                              }}
                              className="w-full bg-transparent text-xs md:text-sm font-medium hover:text-gold-400 transition-colors appearance-none pr-6 cursor-pointer focus:outline-none"
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
                            onChange={(e) => setVicariateFilter(e.target.value)}
                            className="w-full bg-transparent text-xs md:text-sm font-medium hover:text-gold-400 transition-colors appearance-none pr-6 cursor-pointer focus:outline-none"
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
                          onChange={(e) => setClassFilter(e.target.value)}
                          className="w-full bg-transparent text-xs md:text-sm font-medium hover:text-gold-400 transition-colors appearance-none pr-6 cursor-pointer focus:outline-none"
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
                          if (!lockEntityFilter) setEntityFilter(e.target.value);
                        }}
                        disabled={lockEntityFilter}
                        className={`w-full bg-transparent text-xs md:text-sm font-medium transition-colors appearance-none pr-6 focus:outline-none ${
                          lockEntityFilter ? 'text-gold-300 cursor-default' : 'hover:text-gold-400 cursor-pointer'
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
          {/* KPI Card — Monthly Total Collections */}
          <div className="bg-white rounded-2xl shadow-xl hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Monthly Total Collections
            </p>
            <div className="text-[clamp(1.3rem,1.6vw,1.9rem)] font-black text-church-green tracking-tight leading-none">
              {kpiData.collections}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-emerald-100 shadow-sm">
                <ArrowUpRight className="w-3 h-3" /> +12.5%
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">vs LY</span>
              <button
                onClick={() => handleDiagnosticRequest('Jan')}
                className="ml-auto w-8 h-8 bg-gray-50 hover:bg-gold-500 hover:text-black rounded-xl text-church-green transition-all duration-300 flex items-center justify-center border border-gray-100 hover:border-gold-600 shadow-sm"
                title="AI Diagnostic"
              >
                <BrainCircuit size={16} />
              </button>
            </div>
          </div>

          {/* KPI Card — Consumable Collections */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Consumable Collections
            </p>
            <div className="text-[clamp(1.3rem,1.6vw,1.9rem)] font-black text-church-green tracking-tight leading-none">
              {kpiData.consumable}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-emerald-100 shadow-sm">
                <ArrowUpRight className="w-3 h-3" /> +8.1%
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">vs LY</span>
            </div>
          </div>

          {/* KPI Card — Monthly Disbursements */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Monthly Disbursements
            </p>
            <div className="text-[clamp(1.3rem,1.6vw,1.9rem)] font-black text-church-green tracking-tight leading-none">
              {kpiData.disbursements}
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-red-100 shadow-sm">
                <ArrowUp className="w-3 h-3" /> +5.2%
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">vs LY</span>
            </div>
          </div>

          {/* KPI Card — Financial Health Score */}
          <div className="bg-white rounded-2xl shadow-xl group hover:-translate-y-1 transition-all duration-500 min-h-[150px] flex flex-col p-5 gap-3">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] leading-tight">
              Financial Health Score
            </p>
            <div className="text-[clamp(1.8rem,2.2vw,2.6rem)] font-black text-gold-600 tracking-tight leading-none">
              {averageScore}
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
                            Composite analysis across {filteredHealthScores.length} {entityType.toLowerCase()}{' '}
                            {filteredHealthScores.length === healthScores.length
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
                            score={averageScore}
                            size={220}
                            description={`The diocese is currently in the ${trendText} Zone. Resource allocation is being monitored.`}
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
                            <HealthDimensionBar label="Liquidity" score={averageDimensions.liquidity} weight={30} />
                            <HealthDimensionBar
                              label="Sustainability"
                              score={averageDimensions.sustainability}
                              weight={25}
                            />
                            <HealthDimensionBar label="Efficiency" score={averageDimensions.efficiency} weight={20} />
                            <HealthDimensionBar label="Stability" score={averageDimensions.stability} weight={15} />
                            <div className="sm:col-span-2">
                              <HealthDimensionBar label="Growth" score={averageDimensions.growth} weight={10} />
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
                                <span className="text-church-green font-black">Growth</span> dimension has dipped by 3%
                                this quarter. Consider reviewing the vicariate contribution trends in the Diagnostic
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
                            {[...filteredHealthScores]
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
                                    <span className="text-sm font-bold text-gray-800">{score.entityId}</span>
                                  </div>
                                  <span className="text-sm font-bold text-emerald-700">{score.compositeScore}</span>
                                </div>
                              ))}
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">
                              Needs Attention
                            </h4>
                            {[...filteredHealthScores]
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
                                    <span className="text-sm font-bold text-gray-800">{score.entityId}</span>
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
                              filteredHealthScores.length > 0 &&
                              filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) /
                                filteredHealthScores.length >
                                70
                                ? 'text-emerald-400'
                                : filteredHealthScores.length > 0 &&
                                    filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) /
                                      filteredHealthScores.length >
                                      40
                                  ? 'text-gold-400'
                                  : 'text-red-400'
                            }`}
                          >
                            {filteredHealthScores.length > 0
                              ? filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) /
                                  filteredHealthScores.length >
                                70
                                ? 'Excellent'
                                : filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) /
                                      filteredHealthScores.length >
                                    40
                                  ? 'Stable'
                                  : 'Critical'
                              : 'Calculating...'}
                          </span>
                          .
                          {filteredHealthScores.length > 0 &&
                          filteredHealthScores.reduce((sum, s) => sum + s.compositeScore, 0) /
                            filteredHealthScores.length >
                            40
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
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={seminaryCohortData}
                                layout="vertical"
                                margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  horizontal={true}
                                  vertical={false}
                                  stroke="#E5E7EB"
                                />
                                <XAxis
                                  type="number"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  dataKey="stage"
                                  type="category"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={40}>
                                  {seminaryCohortData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={seminaryOriginData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={5}
                                  dataKey="count"
                                >
                                  {seminaryOriginData.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={SEMINARY_COST_COLORS[index % SEMINARY_COST_COLORS.length]}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={seminaryAgeData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="age"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Bar dataKey="count" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={50} />
                              </BarChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={formationProgressData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="propaedeutic"
                                  name="Propaedeutic"
                                  stroke="#1a472a"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="philosophy"
                                  name="Philosophy"
                                  stroke="#D4AF37"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="theology"
                                  name="Theology"
                                  stroke="#1a472a"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={seminaryCostData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="name"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  unit="%"
                                  width={50}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Bar dataKey="value" fill="#1a472a" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={seminaryEnrollmentData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="name"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                {(staffRatioFilter === 'all' || staffRatioFilter === 'seminarians') && (
                                  <Bar
                                    dataKey="enrollment"
                                    name="Seminarians"
                                    fill="#D4AF37"
                                    radius={[6, 6, 0, 0]}
                                    barSize={staffRatioFilter === 'all' ? 25 : 50}
                                  />
                                )}
                                {(staffRatioFilter === 'all' || staffRatioFilter === 'staff') && (
                                  <Bar
                                    dataKey="staff"
                                    name="Staff/Faculty"
                                    fill="#1a472a"
                                    radius={[6, 6, 0, 0]}
                                    barSize={staffRatioFilter === 'all' ? 25 : 50}
                                  />
                                )}
                              </BarChart>
                            </ResponsiveContainer>
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
                            {selectedBarVicariate && (
                              <button
                                onClick={() => setSelectedBarVicariate(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                title={entityType === 'Diocesan Schools' ? 'Back to Clusters' : 'Back to Vicariates'}
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
                              <h3 className="text-3xl font-extrabold text-gray-900 uppercase tracking-tight">
                                {selectedBarVicariate
                                  ? `COLLECTIONS / RECEIPTS & DISBURSEMENTS IN ${stripVicariatePrefix(selectedBarVicariate)}`
                                  : `COLLECTIONS / RECEIPTS & DISBURSEMENTS BY ${entityType === 'Parishes' ? 'VICARIATE' : entityType === 'Seminaries' ? 'SEMINARY' : 'CLUSTER'}`}
                              </h3>
                              {selectedBarVicariate && (
                                <p className="text-sm text-gray-500 font-medium mt-1">Detailed Parish Breakdown</p>
                              )}
                            </div>
                          </div>
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
                        </CardHeader>
                        <CardContent className="mt-4 px-8 pb-4">
                          <div className="h-[400px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={barChartData}
                                margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
                                barCategoryGap="15%"
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  vertical={false}
                                  horizontal={true}
                                  stroke="#F3F4F6"
                                />
                                <XAxis
                                  dataKey="name"
                                  axisLine={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                                  tickLine={true}
                                  tick={<CustomizedTick fontSize={11} />}
                                  interval={0}
                                  height={75}
                                />
                                <YAxis
                                  axisLine={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                                  tickLine={true}
                                  tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 500 }}
                                  tickFormatter={(value) => (value === 0 ? '0' : `${Math.round(value / 1000000)}M`)}
                                  domain={[0, (dataMax: number) => dataMax * 1.15]}
                                  label={{
                                    value: 'Amount (PHP)',
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: {
                                      textAnchor: 'middle',
                                      fill: '#9CA3AF',
                                      fontSize: 10,
                                      fontWeight: 'bold',
                                      letterSpacing: '0.1em',
                                    },
                                    offset: -20,
                                  }}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F9FAFB' }}
                                  formatter={(value, name) => {
                                    const label =
                                      name === 'collections'
                                        ? selectedBarVicariate
                                          ? entityType === 'Diocesan Schools'
                                            ? 'School Collections'
                                            : 'Parish Collections'
                                          : entityType === 'Diocesan Schools'
                                            ? 'Cluster Collections'
                                            : 'Vicariate Collections'
                                        : 'Disbursements';
                                    return [formatCurrency(Number(value ?? 0)), label];
                                  }}
                                  contentStyle={{
                                    borderRadius: '16px',
                                    border: 'none',
                                    boxShadow:
                                      '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                    padding: '12px 16px',
                                  }}
                                />
                                {(collectionsDisbursementsFilter === 'all' ||
                                  collectionsDisbursementsFilter === 'collections') && (
                                  <Bar
                                    dataKey="collections"
                                    name="collections"
                                    fill="#D4AF37"
                                    radius={[8, 8, 0, 0]}
                                    maxBarSize={40}
                                    onClick={(data) => {
                                      if (!selectedBarVicariate && data && data.name && entityType !== 'Seminaries') {
                                        setSelectedBarVicariate(data.name);
                                      }
                                      if (data && data.name) {
                                        handleDiagnosticRequest(data.name);
                                      }
                                    }}
                                    className={
                                      !selectedBarVicariate && entityType !== 'Seminaries'
                                        ? 'cursor-pointer hover:opacity-90 transition-all duration-300'
                                        : ''
                                    }
                                  >
                                    <LabelList
                                      dataKey="collections"
                                      position="top"
                                      content={(props: any) => {
                                        const { x, y, width, value } = props;
                                        if (!value || value === 0) return null;
                                        return (
                                          <g>
                                            <text
                                              x={x + width / 2}
                                              y={y - 22}
                                              fill="#9CA3AF"
                                              textAnchor="middle"
                                              fontSize={9}
                                              fontWeight="bold"
                                            >
                                              PHP
                                            </text>
                                            <text
                                              x={x + width / 2}
                                              y={y - 10}
                                              fill="#9CA3AF"
                                              textAnchor="middle"
                                              fontSize={9}
                                              fontWeight="bold"
                                            >
                                              {(value / 1000000).toFixed(1)}M
                                            </text>
                                          </g>
                                        );
                                      }}
                                    />
                                  </Bar>
                                )}
                                {(collectionsDisbursementsFilter === 'all' ||
                                  collectionsDisbursementsFilter === 'disbursements') && (
                                  <Bar
                                    dataKey="disbursements"
                                    name="disbursements"
                                    fill="#1a472a"
                                    radius={[8, 8, 0, 0]}
                                    maxBarSize={40}
                                    onClick={(data) => {
                                      if (!selectedBarVicariate && data && data.name && entityType !== 'Seminaries') {
                                        setSelectedBarVicariate(data.name);
                                      }
                                      if (data && data.name) {
                                        handleDiagnosticRequest(data.name);
                                      }
                                    }}
                                    className={
                                      !selectedBarVicariate && entityType !== 'Seminaries'
                                        ? 'cursor-pointer hover:opacity-90 transition-all duration-300'
                                        : ''
                                    }
                                  >
                                    <LabelList
                                      dataKey="disbursements"
                                      position="top"
                                      content={(props: any) => {
                                        const { x, y, width, value } = props;
                                        if (!value || value === 0) return null;
                                        return (
                                          <g>
                                            <text
                                              x={x + width / 2}
                                              y={y - 22}
                                              fill="#9CA3AF"
                                              textAnchor="middle"
                                              fontSize={9}
                                              fontWeight="bold"
                                            >
                                              PHP
                                            </text>
                                            <text
                                              x={x + width / 2}
                                              y={y - 10}
                                              fill="#9CA3AF"
                                              textAnchor="middle"
                                              fontSize={9}
                                              fontWeight="bold"
                                            >
                                              {(value / 1000000).toFixed(1)}M
                                            </text>
                                          </g>
                                        );
                                      }}
                                    />
                                  </Bar>
                                )}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`flex items-center gap-2 transition-opacity ${collectionsDisbursementsFilter === 'all' || collectionsDisbursementsFilter === 'collections' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Collections
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 transition-opacity ${collectionsDisbursementsFilter === 'all' || collectionsDisbursementsFilter === 'disbursements' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Disbursements
                              </span>
                            </div>
                          </div>
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
                          <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                              onClick={() => setCollectionsTimeframe('6m')}
                              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${collectionsTimeframe === '6m' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                              6M
                            </button>
                            <button
                              onClick={() => setCollectionsTimeframe('12m')}
                              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${collectionsTimeframe === '12m' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                              12M
                            </button>
                          </div>
                          <select
                            value={collectionsFilter}
                            onChange={(e) => setCollectionsFilter(e.target.value as any)}
                            className="bg-gray-100 border-none text-[10px] font-bold text-church-green rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                          >
                            <option value="all">ALL CATEGORIES</option>
                            <option value="collections_mass">MASS COLLECTIONS</option>
                            <option value="sacraments_rate">SACRAMENTS</option>
                            <option value="collections_other">OTHER COLLECTIONS</option>
                          </select>
                        </div>
                      </CardHeader>
                      <CardContent className="mt-4">
                        <div className="h-[350px] flex items-center">
                          <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                              Amount (Millions)
                            </span>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={filteredCollectionsData}
                              margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                              <XAxis
                                dataKey="month"
                                axisLine={true}
                                tickLine={true}
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                              />
                              <YAxis
                                axisLine={true}
                                tickLine={true}
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                tickFormatter={(value) => `${value / 1000000}M`}
                                width={50}
                              />
                              <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                              {(collectionsFilter === 'all' || collectionsFilter === 'collections_mass') && (
                                <Bar
                                  dataKey="collections_mass"
                                  name="Mass Collections"
                                  fill="#D4AF37"
                                  radius={[4, 4, 0, 0]}
                                  barSize={collectionsFilter === 'all' ? 20 : 40}
                                />
                              )}
                              {(collectionsFilter === 'all' || collectionsFilter === 'sacraments_rate') && (
                                <Bar
                                  dataKey="sacraments_rate"
                                  name="Sacraments"
                                  fill="#1a472a"
                                  radius={[4, 4, 0, 0]}
                                  barSize={collectionsFilter === 'all' ? 20 : 40}
                                />
                              )}
                              {(collectionsFilter === 'all' || collectionsFilter === 'collections_other') && (
                                <Bar
                                  dataKey="collections_other"
                                  name="Other Collections"
                                  fill="#4ade80"
                                  radius={[4, 4, 0, 0]}
                                  barSize={collectionsFilter === 'all' ? 20 : 40}
                                />
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                          Month
                        </div>
                        <div className="flex items-center gap-6 justify-center mt-4">
                          <div
                            className={`flex items-center gap-2 transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'collections_mass' ? 'opacity-100' : 'opacity-30'}`}
                          >
                            <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Mass Collections
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'sacraments_rate' ? 'opacity-100' : 'opacity-30'}`}
                          >
                            <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Sacraments
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 transition-opacity ${collectionsFilter === 'all' || collectionsFilter === 'collections_other' ? 'opacity-100' : 'opacity-30'}`}
                          >
                            <div className="w-3 h-3 rounded-full bg-[#4ade80]"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Other</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Disbursement Analytics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div>
                            <h3 className="text-2xl font-bold text-church-green uppercase tracking-wide">
                              Disbursement Breakdown
                            </h3>
                            <p className="text-sm text-gray-400 mt-1">Breakdown of expenses across the diocese.</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                              <button
                                onClick={() => setDisbursementsTimeframe('6m')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${disbursementsTimeframe === '6m' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                6M
                              </button>
                              <button
                                onClick={() => setDisbursementsTimeframe('12m')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${disbursementsTimeframe === '12m' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                12M
                              </button>
                            </div>
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
                        </CardHeader>
                        <CardContent className="mt-4">
                          <div className="h-[350px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Amount (Millions)
                              </span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={filteredDisbursementsData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="month"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  tickFormatter={(value) => `${value / 1000000}M`}
                                  width={50}
                                />
                                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                                {(disbursementsFilter === 'all' || disbursementsFilter === 'expenses_parish') && (
                                  <Bar
                                    dataKey="expenses_parish"
                                    name="Parish Expenses"
                                    fill="#1a472a"
                                    radius={[4, 4, 0, 0]}
                                    barSize={disbursementsFilter === 'all' ? 25 : 50}
                                  />
                                )}
                                {(disbursementsFilter === 'all' || disbursementsFilter === 'expenses_pastoral') && (
                                  <Bar
                                    dataKey="expenses_pastoral"
                                    name="Pastoral Expenses"
                                    fill="#D4AF37"
                                    radius={[4, 4, 0, 0]}
                                    barSize={disbursementsFilter === 'all' ? 25 : 50}
                                  />
                                )}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Month
                          </div>
                          <div className="flex items-center gap-6 justify-center mt-4">
                            <div
                              className={`flex items-center gap-2 transition-opacity ${disbursementsFilter === 'all' || disbursementsFilter === 'expenses_parish' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#1a472a]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Parish Expenses
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 transition-opacity ${disbursementsFilter === 'all' || disbursementsFilter === 'expenses_pastoral' ? 'opacity-100' : 'opacity-30'}`}
                            >
                              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Pastoral Expenses
                              </span>
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
                          <div className="h-[350px] flex items-center">
                            <div className="w-6 flex-shrink-0 flex items-center justify-center h-full">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                                Category
                              </span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={topDisbursementCategories}
                                layout="vertical"
                                margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  horizontal={true}
                                  vertical={false}
                                  stroke="#E5E7EB"
                                />
                                <XAxis
                                  type="number"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 10 }}
                                  tickFormatter={(value) => `${value / 1000}k`}
                                />
                                <YAxis
                                  dataKey="category"
                                  type="category"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 10 }}
                                  width={130}
                                />
                                <Tooltip
                                  formatter={(value) => formatCurrency(Number(value ?? 0))}
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Bar dataKey="amount" fill="#1a472a" radius={[0, 6, 6, 0]} barSize={55} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="text-center mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">
                            Amount (PHP)
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}

                {/* Row 2: Monthly Collections Decline Monitor */}
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-orange-500" />
                      <h3 className="text-2xl font-bold text-church-green">Monthly Collections Decline Monitor</h3>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      Flags entities with continuously decreasing collections over the past 4 months(sample data).
                    </p>
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
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('w1')}
                            >
                              <div className="flex items-center gap-1">
                                Month 1
                                {sortConfig?.key === 'w1' ? (
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
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('w2')}
                            >
                              <div className="flex items-center gap-1">
                                Month 2
                                {sortConfig?.key === 'w2' ? (
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
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('w3')}
                            >
                              <div className="flex items-center gap-1">
                                Month 3
                                {sortConfig?.key === 'w3' ? (
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
                            <th
                              className="px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors sticky top-0 bg-white"
                              onClick={() => handleSort('w4')}
                            >
                              <div className="flex items-center gap-1">
                                Month 4
                                {sortConfig?.key === 'w4' ? (
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
                          {filteredDeclineData.map((row, i) => (
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
                                  className={`px-3 py-1 rounded-full font-bold text-[10px] flex items-center justify-end gap-1 w-fit ml-auto ${
                                    row.type === 'down'
                                      ? 'bg-orange-50 text-orange-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  <div
                                    className={`w-1.5 h-1.5 rounded-full ${row.type === 'down' ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                  ></div>
                                  {row.trend}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-6 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                      <p className="text-sm font-bold text-church-black/80">Interpretation:</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Entities with a sustained decline may require pastoral outreach, targeted fundraising or expense
                        controls to prevent deficit months.
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
                      <div className="h-[320px] flex items-center">
                        <div className="w-10 flex-shrink-0 flex items-center justify-center h-full">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                            Value
                          </span>
                        </div>
                        <div className="flex-1 h-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={dynamicSeasonalityData}
                              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id="colorSeasonality" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis
                                dataKey="month"
                                axisLine={{ stroke: '#333' }}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                                dy={10}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                                width={45}
                                tickFormatter={(value) =>
                                  value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value
                                }
                              />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: '12px',
                                  border: 'none',
                                  backgroundColor: '#2D2D2D',
                                  color: '#fff',
                                }}
                                itemStyle={{ color: '#D4AF37' }}
                              />
                              <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#D4AF37"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorSeasonality)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
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
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Christmas Uplift (+42%)
                            </p>
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Lent/Holy Week (+12%)
                            </p>
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <p className="text-[10px] font-bold text-gold-500 tracking-wider uppercase mb-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                              Highlight
                            </p>
                            <p className="font-bold text-white text-lg group-hover:text-gold-400 transition-colors">
                              Patronal Fiestas (+24%)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
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
                    const classCounts: Record<string, number> = {};
                    filteredTopTierData.forEach((e) => {
                      const c = e.class || 'Other';
                      classCounts[c] = (classCounts[c] || 0) + 1;
                    });
                    const pieData = Object.entries(classCounts)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([name, value]) => ({ name, value, color: CLASS_COLORS[name] || '#6B7280' }));
                    const total = filteredTopTierData.length;

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
                              <h3 className="text-xl font-bold text-white">Parish Clustering</h3>
                              <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-sm">
                                Parishes are grouped by collection volume and pastoral capacity. Class A parishes are
                                high-performing anchors; lower classes represent developing communities requiring
                                targeted diocesan support.
                              </p>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-dark max-h-[380px]">
                              {filteredTopTierData.map((entity, i) => {
                                const cls = entity.class || 'Other';
                                const dot = CLASS_COLORS[cls] || '#6B7280';
                                return (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/5"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center font-bold text-xs shrink-0">
                                        {i + 1}
                                      </div>
                                      <div>
                                        <p className="font-bold text-white text-sm leading-tight">{entity.name}</p>
                                        <p className="text-[10px] font-bold text-gray-500 tracking-wider uppercase mt-0.5">
                                          {entity.location}
                                          {entity.vicariate && ` • ${stripVicariatePrefix(entity.vicariate)}`}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
                                      <span className="font-bold text-sm" style={{ color: dot }}>
                                        {cls}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
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
                            <div className="relative">
                              <ResponsiveContainer width={220} height={220}>
                                <PieChart>
                                  <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={62}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                    strokeWidth={0}
                                  >
                                    {pieData.map((entry, idx) => (
                                      <Cell key={idx} fill={entry.color} opacity={0.9} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    contentStyle={{
                                      background: '#111',
                                      border: '1px solid rgba(255,255,255,0.1)',
                                      borderRadius: 12,
                                      fontSize: 12,
                                    }}
                                    itemStyle={{ color: '#fff', fontWeight: 700 }}
                                    formatter={(v) => [
                                      `${Number(v ?? 0)} parishes (${Math.round((Number(v ?? 0) / total) * 100)}%)`,
                                      '',
                                    ]}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
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
                        <GeospatialHeatMap data={records.length > 0 ? records : ALL_PARISHES} />
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
                          {CMP_YEARS.map((y) => (
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
                          {CMP_YEARS.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {cmpResult && (
                      <>
                        {/* Bar chart */}
                        <div className="h-[280px] mb-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={cmpResult.barData}
                              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                              barCategoryGap="40%"
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                              <XAxis
                                dataKey="period"
                                tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                                axisLine={false}
                                tickLine={false}
                                width={55}
                              />
                              <Tooltip
                                formatter={(v) => [
                                  formatCurrency(Number(v ?? 0)),
                                  cmpMetric === 'collections' ? 'Collections' : 'Disbursements',
                                ]}
                                contentStyle={{
                                  borderRadius: 16,
                                  border: 'none',
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                  fontSize: 12,
                                }}
                              />
                              <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={90}>
                                {cmpResult.barData.map((_, i) => (
                                  <Cell key={i} fill={i === 0 ? '#1a472a' : '#D4AF37'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
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
                              {cmpResult.pct.toFixed(1)}% vs Period 1
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
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={ordinationForecastData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <defs>
                                  <linearGradient id="colorOrd" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="predicted"
                                  name="Predicted Ordinations"
                                  stroke="#D4AF37"
                                  strokeWidth={3}
                                  fillOpacity={1}
                                  fill="url(#colorOrd)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={attritionRiskData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="risk"
                                  name="Risk Level (%)"
                                  stroke="#EF4444"
                                  strokeWidth={3}
                                  dot={{ r: 4, fill: '#EF4444' }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart
                                data={enrollmentForecastData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                {(enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'enrollment') && (
                                  <Bar
                                    dataKey="enrollment"
                                    name="Projected Enrollment"
                                    fill="#D4AF37"
                                    radius={[6, 6, 0, 0]}
                                    barSize={enrollmentForecastFilter === 'all' ? 30 : 60}
                                  />
                                )}
                                {(enrollmentForecastFilter === 'all' || enrollmentForecastFilter === 'capacity') && (
                                  <Line
                                    type="monotone"
                                    dataKey="capacity"
                                    name="Maximum Capacity"
                                    stroke="#EF4444"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                  />
                                )}
                              </ComposedChart>
                            </ResponsiveContainer>
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
                            <ChartErrorBoundary>
                              <ResponsiveContainer width="100%" height="100%">
                                <FunnelChart margin={{ top: 20, right: 80, left: 80, bottom: 20 }}>
                                  <Tooltip
                                    cursor={{ fill: '#F3F4F6' }}
                                    contentStyle={{
                                      borderRadius: '12px',
                                      border: 'none',
                                      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                    }}
                                  />
                                  <Funnel dataKey="count" data={vocationPipelineData} isAnimationActive>
                                    <LabelList position="right" fill="#6B7280" stroke="none" dataKey="stage" />
                                    <LabelList position="center" fill="#fff" stroke="none" dataKey="count" />
                                    <LabelList position="left" fill="#D4AF37" stroke="none" dataKey="dropOff" />
                                  </Funnel>
                                </FunnelChart>
                              </ResponsiveContainer>
                            </ChartErrorBoundary>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={endowmentGrowthData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <defs>
                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  tickFormatter={(value) => `${value / 1000000}M`}
                                  width={50}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="value"
                                  name="Endowment Value"
                                  stroke="#D4AF37"
                                  fillOpacity={1}
                                  fill="url(#colorValue)"
                                  strokeWidth={3}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={vocationInterestData}
                                margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="month"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="inquiries"
                                  name="Monthly Inquiries"
                                  stroke="#1a472a"
                                  strokeWidth={3}
                                  dot={{ r: 4, fill: '#1a472a' }}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
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
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={priestGapData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                  dataKey="year"
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                />
                                <YAxis
                                  axisLine={true}
                                  tickLine={true}
                                  tick={{ fill: '#6B7280', fontSize: 12 }}
                                  width={40}
                                />
                                <Tooltip
                                  cursor={{ fill: '#F3F4F6' }}
                                  contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                  }}
                                />
                                <Bar
                                  dataKey="retirements"
                                  name="Projected Retirements"
                                  fill="#1a472a"
                                  radius={[6, 6, 0, 0]}
                                />
                                <Bar
                                  dataKey="ordinations"
                                  name="Projected Ordinations"
                                  fill="#D4AF37"
                                  radius={[6, 6, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
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
