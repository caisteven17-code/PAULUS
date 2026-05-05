'use client';

import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Building2, CircleDollarSign, Coins, PiggyBank, TrendingDown } from 'lucide-react';
import { formatCurrency, formatMillions } from '../../lib/format';
import {
  seminaryBudgetReallocation,
  seminaryCapexTimeline,
  seminaryDiversificationTargets,
  seminaryExpenseColumns,
  seminaryFeeSubColumns,
  seminaryMonthlyData,
  seminaryRoadmap,
} from '../../utils/mockData.js';
import { chartPalette, seminaryTheme } from '../../constants/theme.js';

type TabKey = 'dashboard' | 'descriptive' | 'predictive' | 'prescriptive';

type MonthlyRecord = {
  month: string;
  label: string;
  monthIndex: number;
  enrollment: number;
  income: Record<string, number>;
  feeBreakdown: Record<string, number>;
  expenses: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
};

type KpiMetric = {
  title: string;
  value: number | string;
  prior: number | string;
  delta: number;
  positiveIsGood?: boolean;
  sparkline: { period: string; value: number }[];
  accent: string;
  format?: 'currency' | 'percent' | 'text';
};

const tabs: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'descriptive', label: 'Descriptive' },
  { key: 'predictive', label: 'Predictive' },
  { key: 'prescriptive', label: 'Prescriptive' },
];

const peopleCostKeys = [
  'Salaries & Wages and Remuneration',
  'Contribution Benefits',
  'Cash Incentives',
  "Professional Fee & Driver's Fee",
  'Labor Expense',
];

const chartMargin = { top: 16, right: 24, left: 8, bottom: 16 };
const compactCurrency = (value: number) => `PHP ${formatMillions(value)}`;
const currencyFormatter = (value: number) => formatCurrency(value);
const numberFormatter = (value: number) => new Intl.NumberFormat('en-PH').format(Math.round(value));
const percentFormatter = (value: number) => `${value.toFixed(1)}%`;

function linearRegression(values: number[]) {
  const xMean = values.reduce((sum, _, index) => sum + index, 0) / values.length;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const numerator = values.reduce((sum, value, index) => sum + ((index - xMean) * (value - yMean)), 0);
  const denominator = values.reduce((sum, _, index) => sum + ((index - xMean) ** 2), 0) || 1;
  const slope = numerator / denominator;
  const intercept = yMean - (slope * xMean);
  return (x: number) => intercept + (slope * x);
}

function rollingAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function formatMetricValue(value: number | string, format: KpiMetric['format']) {
  if (typeof value === 'string') return value;
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'text') return value.toString();
  return compactCurrency(value);
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-base md:p-6" style={{ boxShadow: seminaryTheme.cardShadow }}>
      <div className="mb-4">
        <h3 className="text-base font-black tracking-tight text-church-black md:text-lg">{title}</h3>
        <p className="text-xs font-medium text-gray-500 md:text-sm">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function KpiCard({ metric }: { metric: KpiMetric }) {
  const goodChange = metric.positiveIsGood === false ? metric.delta < 0 : metric.delta >= 0;
  const DeltaIcon = goodChange ? ArrowUpRight : ArrowDownRight;
  const deltaColor = goodChange ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-base" style={{ boxShadow: seminaryTheme.cardShadow }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">{metric.title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-church-black">{formatMetricValue(metric.value, metric.format)}</p>
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold ${deltaColor}`}>
          <DeltaIcon className="h-3.5 w-3.5" />
          {Math.abs(metric.delta).toFixed(1)}%
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">Prior period</span>
        <span className="font-bold text-gray-700">{formatMetricValue(metric.prior, metric.format)}</span>
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metric.sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-${metric.title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metric.accent} stopOpacity={0.32} />
                <stop offset="95%" stopColor={metric.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip formatter={(value: number) => compactCurrency(value)} labelFormatter={(label) => label} />
            <Area type="monotone" dataKey="value" stroke={metric.accent} fill={`url(#spark-${metric.title})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, React.ReactNode>[];
}) {
  return (
    <div className="overflow-x-auto rounded-[1.25rem] border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-gray-500 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-church-light/60'}>
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 font-medium text-gray-700 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SeminaryFinancialDashboard({ entityName, year }: { entityName: string; year: number }) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const monthlyData = seminaryMonthlyData as MonthlyRecord[];
  const palette = chartPalette as string[];
  const latest = monthlyData[monthlyData.length - 1];
  const previous = monthlyData[monthlyData.length - 2];

  const annualExpenseTotals = useMemo(() => seminaryExpenseColumns.reduce<Record<string, number>>((acc, key) => {
    acc[key] = monthlyData.reduce((sum, record) => sum + record.expenses[key], 0);
    return acc;
  }, {}), [monthlyData]);

  const annualIncomeTotals = useMemo(() => Object.keys(latest.income).reduce<Record<string, number>>((acc, key) => {
    acc[key] = monthlyData.reduce((sum, record) => sum + record.income[key], 0);
    return acc;
  }, {}), [latest.income, monthlyData]);

  const largestExpenseEntry = useMemo(() => Object.entries(annualExpenseTotals).sort((a, b) => b[1] - a[1])[0], [annualExpenseTotals]);

  const fastestGrowingCostEntry = useMemo(() => seminaryExpenseColumns
    .map((key) => {
      const current = latest.expenses[key];
      const prior = previous.expenses[key];
      return { key, delta: prior === 0 ? 0 : ((current - prior) / prior) * 100 };
    })
    .sort((a, b) => b.delta - a.delta)[0], [latest.expenses, previous.expenses]);

  const dependencySeries = useMemo(() => monthlyData.map((record) => ({
    period: record.month,
    value: ((record.income['Receipts from Donations'] + record.income['Subsidy from RCBSP']) / record.totalIncome) * 100,
  })), [monthlyData]);

  const kpiMetrics = useMemo<KpiMetric[]>(() => {
    const largestKey = largestExpenseEntry[0];
    const fastestKey = fastestGrowingCostEntry.key;
    const latestDependency = dependencySeries[dependencySeries.length - 1].value;
    const previousDependency = dependencySeries[dependencySeries.length - 2].value;
    const delta = (current: number, prior: number) => (prior === 0 ? 0 : ((current - prior) / prior) * 100);

    return [
      { title: 'Total Income', value: latest.totalIncome, prior: previous.totalIncome, delta: delta(latest.totalIncome, previous.totalIncome), sparkline: monthlyData.map((record) => ({ period: record.month, value: record.totalIncome })), accent: palette[0], format: 'currency' },
      { title: 'Total Expenses', value: latest.totalExpenses, prior: previous.totalExpenses, delta: delta(latest.totalExpenses, previous.totalExpenses), positiveIsGood: false, sparkline: monthlyData.map((record) => ({ period: record.month, value: record.totalExpenses })), accent: palette[1], format: 'currency' },
      { title: 'Net Surplus/Deficit', value: latest.net, prior: previous.net, delta: delta(latest.net, previous.net || 1), sparkline: monthlyData.map((record) => ({ period: record.month, value: record.net })), accent: latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger, format: 'currency' },
      { title: 'Subsidy Dependency %', value: latestDependency, prior: previousDependency, delta: delta(latestDependency, previousDependency), positiveIsGood: false, sparkline: dependencySeries, accent: palette[2], format: 'percent' },
      { title: 'Largest Expense Category', value: largestExpenseEntry[1], prior: previous.expenses[largestKey], delta: delta(latest.expenses[largestKey], previous.expenses[largestKey]), positiveIsGood: false, sparkline: monthlyData.map((record) => ({ period: record.month, value: record.expenses[largestKey] })), accent: palette[3], format: 'currency' },
      { title: 'Fastest Growing Cost', value: latest.expenses[fastestKey], prior: previous.expenses[fastestKey], delta: fastestGrowingCostEntry.delta, positiveIsGood: false, sparkline: monthlyData.map((record) => ({ period: record.month, value: record.expenses[fastestKey] })), accent: palette[4], format: 'currency' },
    ];
  }, [dependencySeries, fastestGrowingCostEntry, largestExpenseEntry, latest, monthlyData, palette, previous]);

  const revenueMixData = useMemo(() => Object.entries(annualIncomeTotals).map(([name, value], index) => ({ name, value, fill: palette[index % palette.length] })), [annualIncomeTotals, palette]);
  const feeStructureData = useMemo(() => seminaryFeeSubColumns.map((name, index) => ({ name, value: monthlyData.reduce((sum, record) => sum + record.feeBreakdown[name], 0), fill: palette[index % palette.length] })), [monthlyData, palette]);
  const costCompositionData = useMemo(() => Object.entries(annualExpenseTotals).map(([name, value], index) => ({ name, value, fill: palette[index % palette.length] })), [annualExpenseTotals, palette]);
  const operatingTrendData = useMemo(() => monthlyData.map((record) => ({ month: record.month, Income: record.totalIncome, Expenses: record.totalExpenses })), [monthlyData]);
  const dependencyRatioData = useMemo(() => monthlyData.map((record) => ({ month: record.month, 'Subsidies + Donations': record.income['Receipts from Donations'] + record.income['Subsidy from RCBSP'], 'Self-Generated': record.totalIncome - record.income['Receipts from Donations'] - record.income['Subsidy from RCBSP'] })), [monthlyData]);

  const peopleOperationalData = useMemo(() => {
    const peopleCost = peopleCostKeys.reduce((sum, key) => sum + annualExpenseTotals[key], 0);
    const operationalCost = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0) - peopleCost;
    return [
      { name: 'People Cost', value: peopleCost, fill: palette[0] },
      { name: 'Operational Cost', value: operationalCost, fill: palette[1] },
    ];
  }, [annualExpenseTotals, palette]);

  const maintenanceBurden = useMemo(() => {
    const monthly = monthlyData.map((record) => ({
      month: record.month,
      maintenance: record.expenses['Repairs and Maintainance'] + record.expenses['Construction Supplies/Materials'] + record.expenses['Purchases (Other Equipment and Furnitures)'],
    }));
    const total = monthly.reduce((sum, record) => sum + record.maintenance, 0);
    const ratio = (total / monthlyData.reduce((sum, record) => sum + record.totalExpenses, 0)) * 100;
    return { monthly, total, ratio };
  }, [monthlyData]);

  const monthlyTrendData = useMemo(() => monthlyData.map((record) => ({
    month: record.month,
    Donations: record.income['Receipts from Donations'],
    'Seminary Fees': record.income['Seminary Fees'],
    Subsidy: record.income['Subsidy from RCBSP'],
    Utilities: record.expenses['Utilities Expense'],
    Salaries: record.expenses['Salaries & Wages and Remuneration'],
  })), [monthlyData]);

  const revenueForecastData = useMemo(() => {
    const predict = linearRegression(monthlyData.map((record) => record.totalIncome));
    const actual = monthlyData.map((record) => ({ label: record.label, Actual: record.totalIncome, Projected: null }));
    const projected = ['Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027'].map((label, index) => ({
      label,
      Actual: null,
      Projected: Math.round(predict(monthlyData.length + index)),
    }));
    return [...actual, ...projected];
  }, [monthlyData]);

  const expenseEscalationData = useMemo(() => monthlyData.map((record) => ({
    month: record.month,
    Facilities: record.expenses['Construction Supplies/Materials'] + record.expenses['Repairs and Maintainance'] + record.expenses['Utilities Expense'],
    Payroll: record.expenses['Salaries & Wages and Remuneration'] + record.expenses['Contribution Benefits'],
    Logistics: record.expenses['Transportation/Parking Fee/Bank Charges'] + record.expenses['Others Expenses'],
    Threshold: 420000,
  })), [monthlyData]);

  const cashFlowProjectionData = useMemo(() => {
    const predict = linearRegression(monthlyData.map((record) => record.net));
    const actual = monthlyData.map((record) => ({ label: record.label, 'Actual Net': record.net, 'Projected Net': null }));
    const projected = ['Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027'].map((label, index) => ({
      label,
      'Actual Net': null,
      'Projected Net': Math.round(predict(monthlyData.length + index)),
    }));
    return [...actual, ...projected];
  }, [monthlyData]);

  const donationVolatilityData = useMemo(() => ['Receipts from Donations', 'Mass Collections', 'Other Sources', 'Subsidy from RCBSP'].map((key, index) => {
    const values = monthlyData.map((record) => record.income[key]);
    return { source: key, mean: Math.round(average(values)), stdDev: Math.round(standardDeviation(values)), fill: palette[index % palette.length] };
  }), [monthlyData, palette]);

  const enrollmentDigitalTwinData = useMemo(() => {
    const perStudentRevenue = average(monthlyData.map((record) => record.income['Seminary Fees'] / record.enrollment));
    const baselineEnrollment = latest.enrollment;
    return [0, 10, 20, 30].map((uplift, index) => ({
      scenario: uplift === 0 ? 'Baseline' : `+${uplift}%`,
      enrollment: Math.round(baselineEnrollment * (1 + uplift / 100)),
      income: Math.round(perStudentRevenue * baselineEnrollment * (1 + uplift / 100)),
      fill: palette[index % palette.length],
    }));
  }, [latest.enrollment, monthlyData, palette]);

  const infrastructureTrendData = useMemo(() => {
    const spend = monthlyData.map((record) => record.expenses['Construction Supplies/Materials'] + record.expenses['Repairs and Maintainance'] + record.expenses['Purchases (Other Equipment and Furnitures)']);
    const avg = rollingAverage(spend, 3);
    return monthlyData.map((record, index) => ({ month: record.month, Spend: spend[index], 'Rolling Avg': Math.round(avg[index]) }));
  }, [monthlyData]);

  const subsidyRiskDigitalTwinData = useMemo(() => {
    const baselineSubsidy = annualIncomeTotals['Subsidy from RCBSP'];
    const baselineIncome = Object.values(annualIncomeTotals).reduce((sum, value) => sum + value, 0);
    const baselineExpense = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0);
    return [0, -20, -35, -50].map((cut) => {
      const adjustedSubsidy = baselineSubsidy * (1 + cut / 100);
      const adjustedIncome = baselineIncome - baselineSubsidy + adjustedSubsidy;
      return { scenario: cut === 0 ? 'Baseline' : `${cut}%`, Income: Math.round(adjustedIncome), Surplus: Math.round(adjustedIncome - baselineExpense) };
    });
  }, [annualExpenseTotals, annualIncomeTotals]);

  const costOptimizationRows = useMemo(() => Object.entries(annualExpenseTotals)
    .filter(([name]) => !['Contribution Benefits', 'Salaries & Wages and Remuneration'].includes(name))
    .map(([name, value]) => {
      const cutRate = name.includes('Construction') ? 10 : name.includes('Purchases') ? 12 : name.includes('Others') ? 8 : 6;
      return { category: name, current: value, recommendedCut: cutRate, savings: Math.round(value * (cutRate / 100)) };
    })
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 6), [annualExpenseTotals]);

  const feeCalibrationRows = useMemo(() => {
    const perStudentOperationalCost = average(monthlyData.map((record) => record.totalExpenses / record.enrollment));
    return [
      { scenario: 'Base Cost', multiplier: 1 },
      { scenario: 'Inflation +5%', multiplier: 1.05 },
      { scenario: 'Stress +10%', multiplier: 1.1 },
    ].map((row) => ({
      scenario: row.scenario,
      tuition: Math.round((perStudentOperationalCost * row.multiplier) * 0.58),
      board: Math.round((perStudentOperationalCost * row.multiplier) * 0.32),
      total: Math.round(perStudentOperationalCost * row.multiplier),
    }));
  }, [monthlyData]);

  const programRoiRows = useMemo(() => ['DRM', 'SRA', 'Retreat'].map((program) => {
    const revenue = monthlyData.reduce((sum, record) => sum + record.feeBreakdown[program], 0);
    const cost = Math.round(revenue * (program === 'Retreat' ? 0.72 : 0.54));
    return { program, revenue, cost, roi: cost === 0 ? 0 : ((revenue - cost) / cost) * 100 };
  }), [monthlyData]);

  const salaryThresholdData = useMemo(() => {
    const baseSalaryCost = annualExpenseTotals['Salaries & Wages and Remuneration'] + annualExpenseTotals['Contribution Benefits'] + annualExpenseTotals['Cash Incentives'];
    const otherCost = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0) - baseSalaryCost;
    return [0, 3, 6, 9, 12, 15].map((increase) => ({ increase: `${increase}%`, 'Minimum Income Needed': Math.round(otherCost + (baseSalaryCost * (1 + increase / 100))) }));
  }, [annualExpenseTotals]);

  const selfSufficiencyRoadmapData = useMemo(() => seminaryRoadmap.map((row) => ({
    year: row.year,
    Subsidy: row.subsidy * 1000000,
    'Own-Source Income': row.ownSource * 1000000,
    'Target Surplus': row.targetSurplus * 1000000,
  })), []);

  const annualIncome = Object.values(annualIncomeTotals).reduce((sum, value) => sum + value, 0);
  const annualExpenses = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0);

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-base md:p-6" style={{ boxShadow: seminaryTheme.cardShadow }}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-gold-600">
              <Building2 className="h-3.5 w-3.5" />
              Diocese Seminary Analytics
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-church-black md:text-3xl">{entityName} Seminary Financial Dashboard</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Twelve-month diocesan seminary view for {year}. All values are realistic mock figures in Philippine pesos and follow the requested income, fee, and expense column structure.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Annual Income', value: compactCurrency(annualIncome), icon: CircleDollarSign, tone: 'text-gold-600 bg-gold-50' },
              { label: 'Annual Expense', value: compactCurrency(annualExpenses), icon: Coins, tone: 'text-gray-900 bg-gray-100' },
              { label: 'RCBSP Share', value: percentFormatter((annualIncomeTotals['Subsidy from RCBSP'] / annualIncome) * 100), icon: TrendingDown, tone: 'text-amber-700 bg-amber-50' },
              { label: 'Own Source', value: compactCurrency(annualIncome - annualIncomeTotals['Subsidy from RCBSP']), icon: PiggyBank, tone: 'text-emerald-700 bg-emerald-50' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 p-3">
                <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">{item.label}</p>
                <p className="mt-1 text-sm font-black text-church-black">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 border-b border-gray-200">
          <nav className="flex flex-wrap gap-5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`border-b-2 pb-3 text-sm font-black tracking-[0.12em] transition-colors ${
                  activeTab === tab.key ? 'border-gold-500 text-gold-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            {kpiMetrics.map((metric) => <KpiCard key={metric.title} metric={metric} />)}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard title="Income vs Expense Runway" subtitle="Monthly operating position with axis labels, tooltip, and legend.">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={operatingTrendData} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'PHP', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                    <Legend />
                    <Bar dataKey="Income" fill={palette[0]} radius={[10, 10, 0, 0]} />
                    <Bar dataKey="Expenses" fill={palette[1]} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Surplus and Dependency Pulse" subtitle="Net position and dependency ratio to guide the default diocesan view.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-gold-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700">Largest Expense Category</p>
                  <p className="mt-2 text-lg font-black text-church-black">{largestExpenseEntry[0]}</p>
                  <p className="mt-1 text-sm text-gray-600">{compactCurrency(largestExpenseEntry[1])} for the year</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">Fastest MoM Cost Growth</p>
                  <p className="mt-2 text-lg font-black text-church-black">{fastestGrowingCostEntry.key}</p>
                  <p className="mt-1 text-sm text-gray-600">{fastestGrowingCostEntry.delta.toFixed(1)}% vs prior month</p>
                </div>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData.map((record, index) => ({ month: record.month, Net: record.net, Dependency: Number(dependencySeries[index].value.toFixed(2)) }))} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                    <YAxis yAxisId="left" tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Net (PHP)', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} label={{ value: 'Dependency %', angle: 90, position: 'insideRight' }} />
                    <Tooltip formatter={(value: number, name: string) => name === 'Dependency' ? percentFormatter(value) : currencyFormatter(value)} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="Net" stroke={latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger} strokeWidth={3} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="Dependency" stroke={palette[2]} strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {activeTab === 'descriptive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard title="Revenue Mix" subtitle="Donut chart of income source contribution across the full year.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Pie data={revenueMixData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={110} paddingAngle={3}>
                    {revenueMixData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Fee Structure Breakdown" subtitle="Horizontal bar chart of seminary fee sub-items with labeled axes.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={feeStructureData} layout="vertical" margin={{ top: 16, right: 24, left: 48, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Annual PHP', position: 'insideBottom', offset: -8 }} />
                  <YAxis type="category" dataKey="name" width={140} label={{ value: 'Fee Components', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="value" name="Fee Income" radius={[0, 10, 10, 0]}>
                    {feeStructureData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Cost Composition" subtitle="Treemap of annual expense categories with shared palette and tooltip.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={costCompositionData} dataKey="value" nameKey="name" stroke="#FFFFFF" fill={palette[0]}>
                  {costCompositionData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Treemap>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {costCompositionData.slice(0, 6).map((entry) => (
                <div key={entry.name} className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span className="font-medium text-gray-700">{entry.name}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Operating Surplus/Deficit" subtitle="Grouped column chart comparing monthly income and expenses.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatingTrendData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="Income" fill={palette[0]} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="Expenses" fill={palette[1]} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Dependency Ratio" subtitle="Stacked bar of subsidies and donations against self-generated income.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dependencyRatioData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Income (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="Subsidies + Donations" stackId="dependency" fill={palette[2]} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="Self-Generated" stackId="dependency" fill={palette[0]} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="People vs Operational Cost" subtitle="Donut chart split between personnel and non-personnel expenses.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Pie data={peopleOperationalData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={110}>
                    {peopleOperationalData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Maintenance Burden" subtitle="Annual maintenance share plus monthly burden trend.">
            <div className="mb-4 rounded-2xl bg-gold-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700">Maintenance Burden KPI</p>
              <p className="mt-2 text-2xl font-black text-church-black">{maintenanceBurden.ratio.toFixed(1)}%</p>
              <p className="text-sm text-gray-600">{compactCurrency(maintenanceBurden.total)} spent on repairs, construction, and equipment refresh.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={maintenanceBurden.monthly} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="maintenance" name="Maintenance Spend" fill={palette[3]} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Monthly Trend" subtitle="Multi-line comparison of key income and expense lines.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrendData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Donations" stroke={palette[0]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Seminary Fees" stroke={palette[1]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Subsidy" stroke={palette[2]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Utilities" stroke={palette[3]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Salaries" stroke={palette[4]} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {activeTab === 'predictive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard title="Revenue Forecast" subtitle="Actual versus projected income using simple linear regression in JavaScript.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueForecastData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" angle={-25} textAnchor="end" height={60} label={{ value: 'Period', position: 'insideBottom', offset: -6 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Income (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Actual" stroke={palette[1]} strokeWidth={3} connectNulls={false} />
                  <Line type="monotone" dataKey="Projected" stroke={palette[0]} strokeWidth={3} strokeDasharray="6 4" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Expense Escalation" subtitle="Warning view for facilities and payroll lines once they move above threshold.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={expenseEscalationData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Expense (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Facilities" stroke={palette[0]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Payroll" stroke={palette[1]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Logistics" stroke={palette[3]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Threshold" stroke={seminaryTheme.danger} strokeDasharray="5 5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Cash Flow Projection" subtitle="Projected surplus or deficit area view built from historical net results.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowProjectionData} margin={chartMargin}>
                  <defs>
                    <linearGradient id="actualNetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={seminaryTheme.success} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={seminaryTheme.success} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="projectedNetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={palette[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={palette[0]} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" angle={-25} textAnchor="end" height={60} label={{ value: 'Period', position: 'insideBottom', offset: -6 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Net (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="Actual Net" stroke={seminaryTheme.success} fill="url(#actualNetFill)" strokeWidth={3} />
                  <Area type="monotone" dataKey="Projected Net" stroke={palette[0]} fill="url(#projectedNetFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Donation Volatility" subtitle="Mean monthly donor-related income with error bars for standard deviation.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={donationVolatilityData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="source" angle={-18} textAnchor="end" height={70} label={{ value: 'Income Source', position: 'insideBottom', offset: -4 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Mean Monthly PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number, name: string) => name === 'stdDev' ? `${currencyFormatter(value)} std dev` : currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="mean" name="Mean">
                    {donationVolatilityData.map((entry) => <Cell key={entry.source} fill={entry.fill} />)}
                    <ErrorBar dataKey="stdDev" width={4} stroke={seminaryTheme.ink} direction="y" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Enrollment Simulator" subtitle="Fee income impact under baseline and enrollment growth scenarios.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrollmentDigitalTwinData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scenario" label={{ value: 'Enrollment Scenario', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Projected Fee Income (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number, name: string) => name === 'enrollment' ? numberFormatter(value) : currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Projected Income" radius={[10, 10, 0, 0]}>
                    {enrollmentDigitalTwinData.map((entry) => <Cell key={entry.scenario} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Infrastructure Spend Trend" subtitle="Monthly facilities spend with a rolling three-month average overlay.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={infrastructureTrendData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} label={{ value: 'Infrastructure PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Spend" stroke={palette[1]} strokeWidth={3} />
                  <Line type="monotone" dataKey="Rolling Avg" stroke={palette[0]} strokeWidth={3} strokeDasharray="6 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Subsidy Risk Simulator" subtitle="Impact on annual income and surplus if RCBSP subsidy is reduced.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subsidyRiskDigitalTwinData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scenario" label={{ value: 'RCBSP Cut Scenario', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} label={{ value: 'Annual PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Bar dataKey="Income" fill={palette[0]} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="Surplus" fill={palette[1]} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {activeTab === 'prescriptive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard title="Cost Optimization Table" subtitle="Highest reducible expense lines with recommended cut rates and savings.">
            <DataTable
              columns={[
                { key: 'category', label: 'Category' },
                { key: 'current', label: 'Current', align: 'right' },
                { key: 'recommendedCut', label: 'Cut %', align: 'right' },
                { key: 'savings', label: 'Projected Savings', align: 'right' },
              ]}
              rows={costOptimizationRows.map((row) => ({
                category: row.category,
                current: currencyFormatter(row.current),
                recommendedCut: `${row.recommendedCut}%`,
                savings: <span className="font-black text-emerald-700">{currencyFormatter(row.savings)}</span>,
              }))}
            />
          </ChartCard>

          <ChartCard title="Fee Calibration Table" subtitle="Break-even fee estimates under three seminary cost scenarios.">
            <DataTable
              columns={[
                { key: 'scenario', label: 'Scenario' },
                { key: 'tuition', label: 'Tuition', align: 'right' },
                { key: 'board', label: 'Board & Lodging', align: 'right' },
                { key: 'total', label: 'Total / Seminarian', align: 'right' },
              ]}
              rows={feeCalibrationRows.map((row) => ({
                scenario: row.scenario,
                tuition: currencyFormatter(row.tuition),
                board: currencyFormatter(row.board),
                total: <span className="font-black text-gold-700">{currencyFormatter(row.total)}</span>,
              }))}
            />
          </ChartCard>

          <ChartCard title="Resilience Gap Analysis" subtitle="Current versus target diversification share by income source.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seminaryDiversificationTargets} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="source" angle={-20} textAnchor="end" height={70} label={{ value: 'Income Source', position: 'insideBottom', offset: -4 }} />
                  <YAxis label={{ value: 'Share of Total Income (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <Legend />
                  <Bar dataKey="current" name="Current Share" fill={palette[1]} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="target" name="Target Share" fill={palette[0]} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Program ROI Table" subtitle="Annual revenue, cost, and ROI for DRM, SRA, and Retreat programs.">
            <DataTable
              columns={[
                { key: 'program', label: 'Program' },
                { key: 'revenue', label: 'Revenue', align: 'right' },
                { key: 'cost', label: 'Cost', align: 'right' },
                { key: 'roi', label: 'ROI %', align: 'right' },
              ]}
              rows={programRoiRows.map((row) => ({
                program: row.program,
                revenue: currencyFormatter(row.revenue),
                cost: currencyFormatter(row.cost),
                roi: <span className={`font-black ${row.roi >= 25 ? 'text-emerald-700' : 'text-amber-700'}`}>{row.roi.toFixed(1)}%</span>,
              }))}
            />
          </ChartCard>

          <ChartCard title="Budget Reallocation Matrix" subtitle="Priority actions with urgency color and suggested funding destination.">
            <DataTable
              columns={[
                { key: 'category', label: 'Category' },
                { key: 'urgency', label: 'Urgency' },
                { key: 'action', label: 'Recommended Action' },
                { key: 'suggestedMove', label: 'Move', align: 'right' },
              ]}
              rows={(seminaryBudgetReallocation as typeof seminaryBudgetReallocation).map((row) => ({
                category: row.category,
                urgency: (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
                    row.urgency === 'High'
                      ? 'bg-red-50 text-red-700'
                      : row.urgency === 'Medium'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {row.urgency}
                  </span>
                ),
                action: `${row.action} -> ${row.shiftTo}`,
                suggestedMove: currencyFormatter(row.suggestedMove),
              }))}
            />
          </ChartCard>

          <ChartCard title="Salary Sustainability Threshold" subtitle="Minimum income needed as salary and benefits rise over time.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salaryThresholdData} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="increase" label={{ value: 'Salary Increase Level', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} label={{ value: 'Minimum Annual Income (PHP)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Minimum Income Needed" stroke={palette[0]} strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="CapEx Planning Timeline" subtitle="Horizontal Gantt-style timeline for next-year capital projects.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seminaryCapexTimeline} layout="vertical" margin={{ top: 16, right: 24, left: 48, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" domain={[0, 12]} tickFormatter={(value) => `M${Number(value) + 1}`} label={{ value: 'Project Timeline (Months)', position: 'insideBottom', offset: -8 }} />
                  <YAxis type="category" dataKey="initiative" width={160} label={{ value: 'Capital Projects', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number, name: string, item: any) => name === 'duration' ? `${value} months` : currencyFormatter(item.payload.budget)} />
                  <Legend />
                  <Bar dataKey="start" stackId="timeline" fill="transparent" legendType="none" />
                  <Bar dataKey="duration" stackId="timeline" name="Planned Duration" fill={palette[0]} radius={[10, 10, 10, 10]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Self-Sufficiency Roadmap" subtitle="Three-year plan showing subsidy decline and own-source growth.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selfSufficiencyRoadmapData} margin={chartMargin}>
                  <defs>
                    <linearGradient id="roadmapSubsidy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={palette[1]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={palette[1]} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="roadmapOwn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={palette[0]} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={palette[0]} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottom', offset: -8 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} label={{ value: 'PHP', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => currencyFormatter(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="Subsidy" stackId="1" stroke={palette[1]} fill="url(#roadmapSubsidy)" />
                  <Area type="monotone" dataKey="Own-Source Income" stackId="1" stroke={palette[0]} fill="url(#roadmapOwn)" />
                  <Line type="monotone" dataKey="Target Surplus" stroke={seminaryTheme.success} strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}
