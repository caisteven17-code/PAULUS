'use client';

import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Coins,
  PiggyBank,
  TrendingDown,
} from 'lucide-react';
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
import { apiClient } from '../../lib/api-client';

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
  const numerator = values.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0);
  const denominator = values.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0) || 1;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  return (x: number) => intercept + slope * x;
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
    <div
      className="min-w-0 rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-base md:p-6"
      style={{ boxShadow: seminaryTheme.cardShadow }}
    >
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
    <div
      className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-base"
      style={{ boxShadow: seminaryTheme.cardShadow }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">{metric.title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-church-black">
            {formatMetricValue(metric.value, metric.format)}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold ${deltaColor}`}
        >
          <DeltaIcon className="h-3.5 w-3.5" />
          {Math.abs(metric.delta).toFixed(1)}%
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">Prior period</span>
        <span className="font-bold text-gray-700">{formatMetricValue(metric.prior, metric.format)}</span>
      </div>
      <div className="h-16">
        <ReactECharts
          option={{
            grid: { top: 4, right: 0, left: 0, bottom: 0 },
            xAxis: { type: 'category', show: false, data: metric.sparkline.map((d) => d.period) },
            yAxis: { type: 'value', show: false },
            tooltip: {
              trigger: 'axis',
              formatter: (params: any) =>
                `${params[0].axisValue}: ${compactCurrency(params[0].value)}`,
            },
            series: [
              {
                type: 'line',
                data: metric.sparkline.map((d) => d.value),
                smooth: true,
                showSymbol: false,
                lineStyle: { color: metric.accent, width: 2 },
                areaStyle: {
                  color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0.05, color: metric.accent + '52' },
                      { offset: 0.95, color: metric.accent + '00' },
                    ],
                  },
                },
              },
            ],
          }}
          style={{ height: '100%', width: '100%' }}
        />
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
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-gray-500 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-church-light/60'}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 font-medium text-gray-700 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                >
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

export function SeminaryFinancialDashboard({
  entityName,
  year,
  institutionId,
}: {
  entityName: string;
  year: number;
  institutionId?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [apiLoading, setApiLoading] = useState(false);
  const [overrideMonthlyData, setOverrideMonthlyData] = useState<MonthlyRecord[] | null>(null);
  const palette = chartPalette as string[];

  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    setApiLoading(true);

    Promise.all([
      apiClient.getProjectsDescriptive(institutionId),
      apiClient.getFinancialTrend('seminary', institutionId),
    ])
      .then(([, trendRes]) => {
        if (cancelled) return;
        const trend = trendRes as any;
        if (trend?.data_sufficient !== false && Array.isArray(trend?.monthly_data) && trend.monthly_data.length > 0) {
          const fallbackData = seminaryMonthlyData as MonthlyRecord[];
          const mapped: MonthlyRecord[] = trend.monthly_data.map((item: any, idx: number) => {
            const fallback = fallbackData[idx] ?? fallbackData[fallbackData.length - 1];
            return {
              ...fallback,
              month: item.month ?? fallback.month,
              totalIncome: item.total_receipts ?? fallback.totalIncome,
              totalExpenses: item.total_expenses ?? fallback.totalExpenses,
              net: item.net_balance ?? fallback.net,
            };
          });
          setOverrideMonthlyData(mapped);
        }
      })
      .catch((err) => {
        console.error('[SeminaryFinancialDashboard] API fetch failed, using mock data:', err);
      })
      .finally(() => {
        if (!cancelled) setApiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  const monthlyData = (overrideMonthlyData ?? seminaryMonthlyData) as MonthlyRecord[];
  const latest = monthlyData[monthlyData.length - 1];
  const previous = monthlyData[monthlyData.length - 2];

  const annualExpenseTotals = useMemo(
    () =>
      seminaryExpenseColumns.reduce<Record<string, number>>((acc, key) => {
        acc[key] = monthlyData.reduce((sum, record) => sum + record.expenses[key], 0);
        return acc;
      }, {}),
    [monthlyData],
  );

  const annualIncomeTotals = useMemo(
    () =>
      Object.keys(latest.income).reduce<Record<string, number>>((acc, key) => {
        acc[key] = monthlyData.reduce((sum, record) => sum + record.income[key], 0);
        return acc;
      }, {}),
    [latest.income, monthlyData],
  );

  const largestExpenseEntry = useMemo(
    () => Object.entries(annualExpenseTotals).sort((a, b) => b[1] - a[1])[0],
    [annualExpenseTotals],
  );

  const fastestGrowingCostEntry = useMemo(
    () =>
      seminaryExpenseColumns
        .map((key) => {
          const current = latest.expenses[key];
          const prior = previous.expenses[key];
          return { key, delta: prior === 0 ? 0 : ((current - prior) / prior) * 100 };
        })
        .sort((a, b) => b.delta - a.delta)[0],
    [latest.expenses, previous.expenses],
  );

  const dependencySeries = useMemo(
    () =>
      monthlyData.map((record) => ({
        period: record.month,
        value:
          ((record.income['Receipts from Donations'] + record.income['Subsidy from RCBSP']) / record.totalIncome) * 100,
      })),
    [monthlyData],
  );

  const kpiMetrics = useMemo<KpiMetric[]>(() => {
    const largestKey = largestExpenseEntry[0];
    const fastestKey = fastestGrowingCostEntry.key;
    const latestDependency = dependencySeries[dependencySeries.length - 1].value;
    const previousDependency = dependencySeries[dependencySeries.length - 2].value;
    const delta = (current: number, prior: number) => (prior === 0 ? 0 : ((current - prior) / prior) * 100);

    return [
      {
        title: 'Total Income',
        value: latest.totalIncome,
        prior: previous.totalIncome,
        delta: delta(latest.totalIncome, previous.totalIncome),
        sparkline: monthlyData.map((record) => ({ period: record.month, value: record.totalIncome })),
        accent: palette[0],
        format: 'currency',
      },
      {
        title: 'Total Expenses',
        value: latest.totalExpenses,
        prior: previous.totalExpenses,
        delta: delta(latest.totalExpenses, previous.totalExpenses),
        positiveIsGood: false,
        sparkline: monthlyData.map((record) => ({ period: record.month, value: record.totalExpenses })),
        accent: palette[1],
        format: 'currency',
      },
      {
        title: 'Net Surplus/Deficit',
        value: latest.net,
        prior: previous.net,
        delta: delta(latest.net, previous.net || 1),
        sparkline: monthlyData.map((record) => ({ period: record.month, value: record.net })),
        accent: latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger,
        format: 'currency',
      },
      {
        title: 'Subsidy Dependency %',
        value: latestDependency,
        prior: previousDependency,
        delta: delta(latestDependency, previousDependency),
        positiveIsGood: false,
        sparkline: dependencySeries,
        accent: palette[2],
        format: 'percent',
      },
      {
        title: 'Largest Expense Category',
        value: largestExpenseEntry[1],
        prior: previous.expenses[largestKey],
        delta: delta(latest.expenses[largestKey], previous.expenses[largestKey]),
        positiveIsGood: false,
        sparkline: monthlyData.map((record) => ({ period: record.month, value: record.expenses[largestKey] })),
        accent: palette[3],
        format: 'currency',
      },
      {
        title: 'Fastest Growing Cost',
        value: latest.expenses[fastestKey],
        prior: previous.expenses[fastestKey],
        delta: fastestGrowingCostEntry.delta,
        positiveIsGood: false,
        sparkline: monthlyData.map((record) => ({ period: record.month, value: record.expenses[fastestKey] })),
        accent: palette[4],
        format: 'currency',
      },
    ];
  }, [dependencySeries, fastestGrowingCostEntry, largestExpenseEntry, latest, monthlyData, palette, previous]);

  const revenueMixData = useMemo(
    () =>
      Object.entries(annualIncomeTotals).map(([name, value], index) => ({
        name,
        value,
        fill: palette[index % palette.length],
      })),
    [annualIncomeTotals, palette],
  );
  const feeStructureData = useMemo(
    () =>
      seminaryFeeSubColumns.map((name, index) => ({
        name,
        value: monthlyData.reduce((sum, record) => sum + record.feeBreakdown[name], 0),
        fill: palette[index % palette.length],
      })),
    [monthlyData, palette],
  );
  const costCompositionData = useMemo(
    () =>
      Object.entries(annualExpenseTotals).map(([name, value], index) => ({
        name,
        value,
        fill: palette[index % palette.length],
      })),
    [annualExpenseTotals, palette],
  );
  const operatingTrendData = useMemo(
    () =>
      monthlyData.map((record) => ({
        month: record.month,
        Income: record.totalIncome,
        Expenses: record.totalExpenses,
      })),
    [monthlyData],
  );
  const dependencyRatioData = useMemo(
    () =>
      monthlyData.map((record) => ({
        month: record.month,
        'Subsidies + Donations': record.income['Receipts from Donations'] + record.income['Subsidy from RCBSP'],
        'Self-Generated':
          record.totalIncome - record.income['Receipts from Donations'] - record.income['Subsidy from RCBSP'],
      })),
    [monthlyData],
  );

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
      maintenance:
        record.expenses['Repairs and Maintainance'] +
        record.expenses['Construction Supplies/Materials'] +
        record.expenses['Purchases (Other Equipment and Furnitures)'],
    }));
    const total = monthly.reduce((sum, record) => sum + record.maintenance, 0);
    const ratio = (total / monthlyData.reduce((sum, record) => sum + record.totalExpenses, 0)) * 100;
    return { monthly, total, ratio };
  }, [monthlyData]);

  const monthlyTrendData = useMemo(
    () =>
      monthlyData.map((record) => ({
        month: record.month,
        Donations: record.income['Receipts from Donations'],
        'Seminary Fees': record.income['Seminary Fees'],
        Subsidy: record.income['Subsidy from RCBSP'],
        Utilities: record.expenses['Utilities Expense'],
        Salaries: record.expenses['Salaries & Wages and Remuneration'],
      })),
    [monthlyData],
  );

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

  const expenseEscalationData = useMemo(
    () =>
      monthlyData.map((record) => ({
        month: record.month,
        Facilities:
          record.expenses['Construction Supplies/Materials'] +
          record.expenses['Repairs and Maintainance'] +
          record.expenses['Utilities Expense'],
        Payroll: record.expenses['Salaries & Wages and Remuneration'] + record.expenses['Contribution Benefits'],
        Logistics: record.expenses['Transportation/Parking Fee/Bank Charges'] + record.expenses['Others Expenses'],
        Threshold: 420000,
      })),
    [monthlyData],
  );

  const cashFlowProjectionData = useMemo(() => {
    const predict = linearRegression(monthlyData.map((record) => record.net));
    const actual = monthlyData.map((record) => ({
      label: record.label,
      'Actual Net': record.net,
      'Projected Net': null,
    }));
    const projected = ['Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027'].map((label, index) => ({
      label,
      'Actual Net': null,
      'Projected Net': Math.round(predict(monthlyData.length + index)),
    }));
    return [...actual, ...projected];
  }, [monthlyData]);

  const donationVolatilityData = useMemo(
    () =>
      ['Receipts from Donations', 'Mass Collections', 'Other Sources', 'Subsidy from RCBSP'].map((key, index) => {
        const values = monthlyData.map((record) => record.income[key]);
        return {
          source: key,
          mean: Math.round(average(values)),
          stdDev: Math.round(standardDeviation(values)),
          fill: palette[index % palette.length],
        };
      }),
    [monthlyData, palette],
  );

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
    const spend = monthlyData.map(
      (record) =>
        record.expenses['Construction Supplies/Materials'] +
        record.expenses['Repairs and Maintainance'] +
        record.expenses['Purchases (Other Equipment and Furnitures)'],
    );
    const avg = rollingAverage(spend, 3);
    return monthlyData.map((record, index) => ({
      month: record.month,
      Spend: spend[index],
      'Rolling Avg': Math.round(avg[index]),
    }));
  }, [monthlyData]);

  const subsidyRiskDigitalTwinData = useMemo(() => {
    const baselineSubsidy = annualIncomeTotals['Subsidy from RCBSP'];
    const baselineIncome = Object.values(annualIncomeTotals).reduce((sum, value) => sum + value, 0);
    const baselineExpense = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0);
    return [0, -20, -35, -50].map((cut) => {
      const adjustedSubsidy = baselineSubsidy * (1 + cut / 100);
      const adjustedIncome = baselineIncome - baselineSubsidy + adjustedSubsidy;
      return {
        scenario: cut === 0 ? 'Baseline' : `${cut}%`,
        Income: Math.round(adjustedIncome),
        Surplus: Math.round(adjustedIncome - baselineExpense),
      };
    });
  }, [annualExpenseTotals, annualIncomeTotals]);

  const costOptimizationRows = useMemo(
    () =>
      Object.entries(annualExpenseTotals)
        .filter(([name]) => !['Contribution Benefits', 'Salaries & Wages and Remuneration'].includes(name))
        .map(([name, value]) => {
          const cutRate = name.includes('Construction')
            ? 10
            : name.includes('Purchases')
              ? 12
              : name.includes('Others')
                ? 8
                : 6;
          return {
            category: name,
            current: value,
            recommendedCut: cutRate,
            savings: Math.round(value * (cutRate / 100)),
          };
        })
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 6),
    [annualExpenseTotals],
  );

  const feeCalibrationRows = useMemo(() => {
    const perStudentOperationalCost = average(monthlyData.map((record) => record.totalExpenses / record.enrollment));
    return [
      { scenario: 'Base Cost', multiplier: 1 },
      { scenario: 'Inflation +5%', multiplier: 1.05 },
      { scenario: 'Stress +10%', multiplier: 1.1 },
    ].map((row) => ({
      scenario: row.scenario,
      tuition: Math.round(perStudentOperationalCost * row.multiplier * 0.58),
      board: Math.round(perStudentOperationalCost * row.multiplier * 0.32),
      total: Math.round(perStudentOperationalCost * row.multiplier),
    }));
  }, [monthlyData]);

  const programRoiRows = useMemo(
    () =>
      ['DRM', 'SRA', 'Retreat'].map((program) => {
        const revenue = monthlyData.reduce((sum, record) => sum + record.feeBreakdown[program], 0);
        const cost = Math.round(revenue * (program === 'Retreat' ? 0.72 : 0.54));
        return { program, revenue, cost, roi: cost === 0 ? 0 : ((revenue - cost) / cost) * 100 };
      }),
    [monthlyData],
  );

  const salaryThresholdData = useMemo(() => {
    const baseSalaryCost =
      annualExpenseTotals['Salaries & Wages and Remuneration'] +
      annualExpenseTotals['Contribution Benefits'] +
      annualExpenseTotals['Cash Incentives'];
    const otherCost = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0) - baseSalaryCost;
    return [0, 3, 6, 9, 12, 15].map((increase) => ({
      increase: `${increase}%`,
      'Minimum Income Needed': Math.round(otherCost + baseSalaryCost * (1 + increase / 100)),
    }));
  }, [annualExpenseTotals]);

  const selfSufficiencyRoadmapData = useMemo(
    () =>
      seminaryRoadmap.map((row) => ({
        year: row.year,
        Subsidy: row.subsidy * 1000000,
        'Own-Source Income': row.ownSource * 1000000,
        'Target Surplus': row.targetSurplus * 1000000,
      })),
    [],
  );

  const annualIncome = Object.values(annualIncomeTotals).reduce((sum, value) => sum + value, 0);
  const annualExpenses = Object.values(annualExpenseTotals).reduce((sum, value) => sum + value, 0);

  return (
    <section className={`space-y-5 transition-opacity duration-300 ${apiLoading ? 'opacity-60' : 'opacity-100'}`}>
      <div
        className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-base md:p-6"
        style={{ boxShadow: seminaryTheme.cardShadow }}
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-gold-600">
              <Building2 className="h-3.5 w-3.5" />
              Diocese Seminary Analytics
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-church-black md:text-3xl">
                {entityName} Seminary Financial Dashboard
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Twelve-month diocesan seminary view for {year}. All values are realistic mock figures in Philippine
                pesos and follow the requested income, fee, and expense column structure.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              {
                label: 'Annual Income',
                value: compactCurrency(annualIncome),
                icon: CircleDollarSign,
                tone: 'text-gold-600 bg-gold-50',
              },
              {
                label: 'Annual Expense',
                value: compactCurrency(annualExpenses),
                icon: Coins,
                tone: 'text-gray-900 bg-gray-100',
              },
              {
                label: 'RCBSP Share',
                value: percentFormatter((annualIncomeTotals['Subsidy from RCBSP'] / annualIncome) * 100),
                icon: TrendingDown,
                tone: 'text-amber-700 bg-amber-50',
              },
              {
                label: 'Own Source',
                value: compactCurrency(annualIncome - annualIncomeTotals['Subsidy from RCBSP']),
                icon: PiggyBank,
                tone: 'text-emerald-700 bg-emerald-50',
              },
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
                  activeTab === tab.key
                    ? 'border-gold-500 text-gold-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
            {kpiMetrics.map((metric) => (
              <KpiCard key={metric.title} metric={metric} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0">
            <ChartCard
              title="Income vs Expense Runway"
              subtitle="Monthly operating position with axis labels, tooltip, and legend."
            >
              <div className="h-80">
                <ReactECharts
                  option={{
                    color: [palette[0], palette[1]],
                    tooltip: {
                      trigger: 'axis',
                      formatter: (params: any) =>
                        `${params[0].axisValue}<br/>` +
                        params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                    },
                    legend: { bottom: 0 },
                    grid: { top: 16, right: 24, left: 56, bottom: 48 },
                    xAxis: {
                      type: 'category',
                      data: operatingTrendData.map((d) => d.month),
                      name: 'Month',
                      nameLocation: 'middle',
                      nameGap: 28,
                      axisLine: { show: false },
                      axisTick: { show: false },
                    },
                    yAxis: {
                      type: 'value',
                      name: 'PHP',
                      nameLocation: 'middle',
                      nameGap: 44,
                      axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                      splitLine: { lineStyle: { color: '#E5E7EB' } },
                    },
                    series: [
                      {
                        name: 'Income',
                        type: 'bar',
                        data: operatingTrendData.map((d) => ({ value: d.Income, itemStyle: { color: palette[0], borderRadius: [10, 10, 0, 0] } })),
                      },
                      {
                        name: 'Expenses',
                        type: 'bar',
                        data: operatingTrendData.map((d) => ({ value: d.Expenses, itemStyle: { color: palette[1], borderRadius: [10, 10, 0, 0] } })),
                      },
                    ],
                  }}
                  style={{ height: '100%', width: '100%' }}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Surplus and Dependency Pulse"
              subtitle="Net position and dependency ratio to guide the default diocesan view."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-gold-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700">
                    Largest Expense Category
                  </p>
                  <p className="mt-2 text-lg font-black text-church-black">{largestExpenseEntry[0]}</p>
                  <p className="mt-1 text-sm text-gray-600">{compactCurrency(largestExpenseEntry[1])} for the year</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">
                    Fastest MoM Cost Growth
                  </p>
                  <p className="mt-2 text-lg font-black text-church-black">{fastestGrowingCostEntry.key}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {fastestGrowingCostEntry.delta.toFixed(1)}% vs prior month
                  </p>
                </div>
              </div>
              <div className="mt-4 h-72">
                <ReactECharts
                  option={{
                    color: [latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger, palette[2]],
                    tooltip: {
                      trigger: 'axis',
                      formatter: (params: any) =>
                        `${params[0].axisValue}<br/>` +
                        params.map((p: any) =>
                          `${p.marker}${p.seriesName}: ${p.seriesName === 'Dependency' ? percentFormatter(p.value) : currencyFormatter(p.value)}`
                        ).join('<br/>'),
                    },
                    legend: { bottom: 0 },
                    grid: { top: 16, right: 60, left: 56, bottom: 40 },
                    xAxis: {
                      type: 'category',
                      data: monthlyData.map((d) => d.month),
                      name: 'Month',
                      nameLocation: 'middle',
                      nameGap: 28,
                      axisLine: { show: false },
                      axisTick: { show: false },
                    },
                    yAxis: [
                      {
                        type: 'value',
                        name: 'Net (PHP)',
                        nameLocation: 'middle',
                        nameGap: 44,
                        axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                        splitLine: { lineStyle: { color: '#E5E7EB' } },
                      },
                      {
                        type: 'value',
                        name: 'Dependency %',
                        nameLocation: 'middle',
                        nameGap: 44,
                        position: 'right',
                        axisLabel: { formatter: (v: number) => `${v}%` },
                        splitLine: { show: false },
                      },
                    ],
                    series: [
                      {
                        name: 'Net',
                        type: 'line',
                        yAxisIndex: 0,
                        data: monthlyData.map((d) => d.net),
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 6,
                        lineStyle: { color: latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger, width: 3 },
                        itemStyle: { color: latest.net >= 0 ? seminaryTheme.success : seminaryTheme.danger },
                      },
                      {
                        name: 'Dependency',
                        type: 'line',
                        yAxisIndex: 1,
                        data: monthlyData.map((_, index) => Number(dependencySeries[index].value.toFixed(2))),
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 6,
                        lineStyle: { color: palette[2], width: 3 },
                        itemStyle: { color: palette[2] },
                      },
                    ],
                  }}
                  style={{ height: '100%', width: '100%' }}
                />
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {activeTab === 'descriptive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0">
          <ChartCard title="Revenue Mix" subtitle="Donut chart of income source contribution across the full year.">
            <div className="h-80">
              <ReactECharts
                option={{
                  color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                  tooltip: {
                    trigger: 'item',
                    formatter: (params: any) => `${params.name}: ${currencyFormatter(params.value)}`,
                  },
                  legend: { bottom: 0, type: 'scroll' },
                  series: [
                    {
                      type: 'pie',
                      radius: ['40%', '65%'],
                      padAngle: 3,
                      data: revenueMixData.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.fill } })),
                      label: { show: false },
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Fee Structure Breakdown"
            subtitle="Horizontal bar chart of seminary fee sub-items with labeled axes."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => `${params[0].axisValue}: ${currencyFormatter(params[0].value)}`,
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 148, bottom: 40 },
                  xAxis: {
                    type: 'value',
                    name: 'Annual PHP',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  yAxis: {
                    type: 'category',
                    name: 'Fee Components',
                    nameLocation: 'middle',
                    nameGap: 140,
                    data: feeStructureData.map((d) => d.name),
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  series: [
                    {
                      name: 'Fee Income',
                      type: 'bar',
                      data: feeStructureData.map((d) => ({
                        value: d.value,
                        itemStyle: { color: d.fill, borderRadius: [0, 10, 10, 0] },
                      })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Cost Composition"
            subtitle="Treemap of annual expense categories with shared palette and tooltip."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'item',
                    formatter: (params: any) => `${params.name}: ${currencyFormatter(params.value)}`,
                  },
                  series: [
                    {
                      type: 'treemap',
                      data: costCompositionData.map((d) => ({
                        name: d.name,
                        value: d.value,
                        itemStyle: { color: d.fill, borderColor: '#FFFFFF', borderWidth: 2 },
                      })),
                      label: { show: true, formatter: (params: any) => params.name, fontSize: 11, color: '#fff' },
                      breadcrumb: { show: false },
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {costCompositionData.slice(0, 6).map((entry) => (
                <div
                  key={entry.name}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span className="font-medium text-gray-700">{entry.name}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard
            title="Operating Surplus/Deficit"
            subtitle="Grouped column chart comparing monthly income and expenses."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[0], palette[1]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 56, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: operatingTrendData.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'PHP',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Income',
                      type: 'bar',
                      data: operatingTrendData.map((d) => ({ value: d.Income, itemStyle: { color: palette[0], borderRadius: [10, 10, 0, 0] } })),
                    },
                    {
                      name: 'Expenses',
                      type: 'bar',
                      data: operatingTrendData.map((d) => ({ value: d.Expenses, itemStyle: { color: palette[1], borderRadius: [10, 10, 0, 0] } })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Dependency Ratio"
            subtitle="Stacked bar of subsidies and donations against self-generated income."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[2], palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: dependencyRatioData.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Income (PHP)',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Subsidies + Donations',
                      type: 'bar',
                      stack: 'dependency',
                      data: dependencyRatioData.map((d) => ({ value: d['Subsidies + Donations'], itemStyle: { color: palette[2], borderRadius: [10, 10, 0, 0] } })),
                    },
                    {
                      name: 'Self-Generated',
                      type: 'bar',
                      stack: 'dependency',
                      data: dependencyRatioData.map((d) => ({ value: d['Self-Generated'], itemStyle: { color: palette[0], borderRadius: [10, 10, 0, 0] } })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="People vs Operational Cost"
            subtitle="Donut chart split between personnel and non-personnel expenses."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'item',
                    formatter: (params: any) => `${params.name}: ${currencyFormatter(params.value)}`,
                  },
                  legend: { bottom: 0 },
                  series: [
                    {
                      type: 'pie',
                      radius: ['40%', '65%'],
                      data: peopleOperationalData.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.fill } })),
                      label: { show: false },
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard title="Maintenance Burden" subtitle="Annual maintenance share plus monthly burden trend.">
            <div className="mb-4 rounded-2xl bg-gold-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700">Maintenance Burden KPI</p>
              <p className="mt-2 text-2xl font-black text-church-black">{maintenanceBurden.ratio.toFixed(1)}%</p>
              <p className="text-sm text-gray-600">
                {compactCurrency(maintenanceBurden.total)} spent on repairs, construction, and equipment refresh.
              </p>
            </div>
            <div className="h-72">
              <ReactECharts
                option={{
                  color: [palette[3]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => `${params[0].axisValue}: ${currencyFormatter(params[0].value)}`,
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 56, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: maintenanceBurden.monthly.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'PHP',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Maintenance Spend',
                      type: 'bar',
                      data: maintenanceBurden.monthly.map((d) => ({
                        value: d.maintenance,
                        itemStyle: { color: palette[3], borderRadius: [10, 10, 0, 0] },
                      })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard title="Monthly Trend" subtitle="Multi-line comparison of key income and expense lines.">
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[0], palette[1], palette[2], palette[3], palette[4]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0, type: 'scroll' },
                  grid: { top: 16, right: 24, left: 56, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: monthlyTrendData.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'PHP',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    { name: 'Donations', type: 'line', data: monthlyTrendData.map((d) => d.Donations), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Seminary Fees', type: 'line', data: monthlyTrendData.map((d) => d['Seminary Fees']), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Subsidy', type: 'line', data: monthlyTrendData.map((d) => d.Subsidy), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Utilities', type: 'line', data: monthlyTrendData.map((d) => d.Utilities), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Salaries', type: 'line', data: monthlyTrendData.map((d) => d.Salaries), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>
        </div>
      )}

      {activeTab === 'predictive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0">
          <ChartCard
            title="Revenue Forecast"
            subtitle="Actual versus projected income using simple linear regression in JavaScript."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[1], palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.filter((p: any) => p.value != null).map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 56 },
                  xAxis: {
                    type: 'category',
                    data: revenueForecastData.map((d) => d.label),
                    name: 'Period',
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisLabel: { rotate: -25 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Income (PHP)',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Actual',
                      type: 'line',
                      data: revenueForecastData.map((d) => d.Actual),
                      smooth: true,
                      lineStyle: { width: 3 },
                      showSymbol: false,
                      connectNulls: false,
                    },
                    {
                      name: 'Projected',
                      type: 'line',
                      data: revenueForecastData.map((d) => d.Projected),
                      smooth: true,
                      lineStyle: { width: 3, type: 'dashed' },
                      showSymbol: false,
                      connectNulls: false,
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Expense Escalation"
            subtitle="Warning view for facilities and payroll lines once they move above threshold."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[0], palette[1], palette[3], seminaryTheme.danger],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: expenseEscalationData.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Expense (PHP)',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    { name: 'Facilities', type: 'line', data: expenseEscalationData.map((d) => d.Facilities), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Payroll', type: 'line', data: expenseEscalationData.map((d) => d.Payroll), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Logistics', type: 'line', data: expenseEscalationData.map((d) => d.Logistics), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    {
                      name: 'Threshold',
                      type: 'line',
                      data: expenseEscalationData.map((d) => d.Threshold),
                      lineStyle: { width: 2, type: 'dashed', color: seminaryTheme.danger },
                      itemStyle: { color: seminaryTheme.danger },
                      showSymbol: false,
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Cash Flow Projection"
            subtitle="Projected surplus or deficit area view built from historical net results."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [seminaryTheme.success, palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.filter((p: any) => p.value != null).map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 56, bottom: 56 },
                  xAxis: {
                    type: 'category',
                    data: cashFlowProjectionData.map((d) => d.label),
                    name: 'Period',
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisLabel: { rotate: -25 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Net (PHP)',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Actual Net',
                      type: 'line',
                      data: cashFlowProjectionData.map((d) => d['Actual Net']),
                      smooth: true,
                      lineStyle: { width: 3, color: seminaryTheme.success },
                      itemStyle: { color: seminaryTheme.success },
                      showSymbol: false,
                      connectNulls: false,
                      areaStyle: {
                        color: {
                          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0.05, color: seminaryTheme.success + '59' },
                            { offset: 0.95, color: seminaryTheme.success + '05' },
                          ],
                        },
                      },
                    },
                    {
                      name: 'Projected Net',
                      type: 'line',
                      data: cashFlowProjectionData.map((d) => d['Projected Net']),
                      smooth: true,
                      lineStyle: { width: 3, color: palette[0] },
                      itemStyle: { color: palette[0] },
                      showSymbol: false,
                      connectNulls: false,
                      areaStyle: {
                        color: {
                          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0.05, color: palette[0] + '4D' },
                            { offset: 0.95, color: palette[0] + '08' },
                          ],
                        },
                      },
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Donation Volatility"
            subtitle="Mean monthly donor-related income with error bars for standard deviation."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => {
                      const d = donationVolatilityData[params[0].dataIndex];
                      return `${params[0].axisValue}<br/>${params[0].marker}Mean: ${currencyFormatter(params[0].value)}<br/>Std Dev: ${currencyFormatter(d.stdDev)}`;
                    },
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 60 },
                  xAxis: {
                    type: 'category',
                    data: donationVolatilityData.map((d) => d.source),
                    name: 'Income Source',
                    nameLocation: 'middle',
                    nameGap: 42,
                    axisLabel: { rotate: -18, interval: 0 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Mean Monthly PHP',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Mean',
                      type: 'bar',
                      data: donationVolatilityData.map((d) => ({
                        value: d.mean,
                        itemStyle: { color: d.fill, borderRadius: [10, 10, 0, 0] },
                      })),
                      markLine: {
                        silent: true,
                        symbol: ['none', 'none'],
                        lineStyle: { color: '#000000', width: 2 },
                        data: donationVolatilityData.map((d, i) => [
                          { xAxis: i, yAxis: d.mean + d.stdDev, label: { show: false } },
                          { xAxis: i, yAxis: Math.max(0, d.mean - d.stdDev), label: { show: false } },
                        ]).flat(),
                      },
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Enrollment Simulator"
            subtitle="Fee income impact under baseline and enrollment growth scenarios."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => {
                      const d = enrollmentDigitalTwinData[params[0].dataIndex];
                      return `${params[0].axisValue}<br/>${params[0].marker}Projected Income: ${currencyFormatter(params[0].value)}<br/>Enrollment: ${numberFormatter(d.enrollment)}`;
                    },
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 72, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: enrollmentDigitalTwinData.map((d) => d.scenario),
                    name: 'Enrollment Scenario',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Projected Fee Income (PHP)',
                    nameLocation: 'middle',
                    nameGap: 60,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Projected Income',
                      type: 'bar',
                      data: enrollmentDigitalTwinData.map((d) => ({
                        value: d.income,
                        itemStyle: { color: d.fill, borderRadius: [10, 10, 0, 0] },
                      })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Infrastructure Spend Trend"
            subtitle="Monthly facilities spend with a rolling three-month average overlay."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[1], palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: infrastructureTrendData.map((d) => d.month),
                    name: 'Month',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Infrastructure PHP',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    { name: 'Spend', type: 'line', data: infrastructureTrendData.map((d) => d.Spend), smooth: true, lineStyle: { width: 3 }, showSymbol: false },
                    { name: 'Rolling Avg', type: 'line', data: infrastructureTrendData.map((d) => d['Rolling Avg']), smooth: true, lineStyle: { width: 3, type: 'dashed' }, showSymbol: false },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Subsidy Risk Simulator"
            subtitle="Impact on annual income and surplus if RCBSP subsidy is reduced."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[0], palette[1]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 56, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: subsidyRiskDigitalTwinData.map((d) => d.scenario),
                    name: 'RCBSP Cut Scenario',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Annual PHP',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000000)}M` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Income',
                      type: 'bar',
                      data: subsidyRiskDigitalTwinData.map((d) => ({ value: d.Income, itemStyle: { color: palette[0], borderRadius: [10, 10, 0, 0] } })),
                    },
                    {
                      name: 'Surplus',
                      type: 'bar',
                      data: subsidyRiskDigitalTwinData.map((d) => ({ value: d.Surplus, itemStyle: { color: palette[1], borderRadius: [10, 10, 0, 0] } })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>
        </div>
      )}

      {activeTab === 'prescriptive' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0">
          <ChartCard
            title="Cost Optimization Table"
            subtitle="Highest reducible expense lines with recommended cut rates and savings."
          >
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

          <ChartCard
            title="Fee Calibration Table"
            subtitle="Break-even fee estimates under three seminary cost scenarios."
          >
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

          <ChartCard
            title="Resilience Gap Analysis"
            subtitle="Current versus target diversification share by income source."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[1], palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${p.value}%`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 60 },
                  xAxis: {
                    type: 'category',
                    data: (seminaryDiversificationTargets as { source: string; current: number; target: number }[]).map((d) => d.source),
                    name: 'Income Source',
                    nameLocation: 'middle',
                    nameGap: 42,
                    axisLabel: { rotate: -20, interval: 0 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Share of Total Income (%)',
                    nameLocation: 'middle',
                    nameGap: 52,
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Current Share',
                      type: 'bar',
                      data: (seminaryDiversificationTargets as { source: string; current: number; target: number }[]).map((d) => ({ value: d.current, itemStyle: { color: palette[1], borderRadius: [10, 10, 0, 0] } })),
                    },
                    {
                      name: 'Target Share',
                      type: 'bar',
                      data: (seminaryDiversificationTargets as { source: string; current: number; target: number }[]).map((d) => ({ value: d.target, itemStyle: { color: palette[0], borderRadius: [10, 10, 0, 0] } })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Program ROI Table"
            subtitle="Annual revenue, cost, and ROI for DRM, SRA, and Retreat programs."
          >
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
                roi: (
                  <span className={`font-black ${row.roi >= 25 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {row.roi.toFixed(1)}%
                  </span>
                ),
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Budget Reallocation Matrix"
            subtitle="Priority actions with urgency color and suggested funding destination."
          >
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
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
                      row.urgency === 'High'
                        ? 'bg-red-50 text-red-700'
                        : row.urgency === 'Medium'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {row.urgency}
                  </span>
                ),
                action: `${row.action} -> ${row.shiftTo}`,
                suggestedMove: currencyFormatter(row.suggestedMove),
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Salary Sustainability Threshold"
            subtitle="Minimum income needed as salary and benefits rise over time."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[0]],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => `${params[0].axisValue}: ${currencyFormatter(params[0].value)}`,
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 64, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: salaryThresholdData.map((d) => d.increase),
                    name: 'Salary Increase Level',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'Minimum Annual Income (PHP)',
                    nameLocation: 'middle',
                    nameGap: 52,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000000)}M` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Minimum Income Needed',
                      type: 'line',
                      data: salaryThresholdData.map((d) => d['Minimum Income Needed']),
                      smooth: true,
                      lineStyle: { width: 3 },
                      symbolSize: 8,
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="CapEx Planning Timeline"
            subtitle="Horizontal Gantt-style timeline for next-year capital projects."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) => {
                      const durationParam = params.find((p: any) => p.seriesName === 'Planned Duration');
                      const d = (seminaryCapexTimeline as { initiative: string; start: number; duration: number; budget: number }[])[params[0].dataIndex];
                      return `${params[0].axisValue}<br/>Duration: ${durationParam?.value ?? 0} months<br/>Budget: ${currencyFormatter(d?.budget ?? 0)}`;
                    },
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 168, bottom: 48 },
                  xAxis: {
                    type: 'value',
                    min: 0,
                    max: 12,
                    name: 'Project Timeline (Months)',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLabel: { formatter: (v: number) => `M${v + 1}` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  yAxis: {
                    type: 'category',
                    data: (seminaryCapexTimeline as { initiative: string; start: number; duration: number; budget: number }[]).map((d) => d.initiative),
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  series: [
                    {
                      name: 'Start Offset',
                      type: 'bar',
                      stack: 'timeline',
                      itemStyle: { color: 'transparent' },
                      data: (seminaryCapexTimeline as { initiative: string; start: number; duration: number; budget: number }[]).map((d) => d.start),
                      legendType: 'none',
                      silent: true,
                    },
                    {
                      name: 'Planned Duration',
                      type: 'bar',
                      stack: 'timeline',
                      data: (seminaryCapexTimeline as { initiative: string; start: number; duration: number; budget: number }[]).map((d) => ({
                        value: d.duration,
                        itemStyle: { color: palette[0], borderRadius: [0, 10, 10, 0] },
                      })),
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>

          <ChartCard
            title="Self-Sufficiency Roadmap"
            subtitle="Three-year plan showing subsidy decline and own-source growth."
          >
            <div className="h-80">
              <ReactECharts
                option={{
                  color: [palette[1], palette[0], seminaryTheme.success],
                  tooltip: {
                    trigger: 'axis',
                    formatter: (params: any) =>
                      `${params[0].axisValue}<br/>` +
                      params.map((p: any) => `${p.marker}${p.seriesName}: ${currencyFormatter(p.value)}`).join('<br/>'),
                  },
                  legend: { bottom: 0 },
                  grid: { top: 16, right: 24, left: 56, bottom: 48 },
                  xAxis: {
                    type: 'category',
                    data: selfSufficiencyRoadmapData.map((d) => d.year),
                    name: 'Year',
                    nameLocation: 'middle',
                    nameGap: 28,
                    axisLine: { show: false },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value',
                    name: 'PHP',
                    nameLocation: 'middle',
                    nameGap: 44,
                    axisLabel: { formatter: (v: number) => `${Math.round(v / 1000000)}M` },
                    splitLine: { lineStyle: { color: '#E5E7EB' } },
                  },
                  series: [
                    {
                      name: 'Subsidy',
                      type: 'line',
                      stack: 'roadmap',
                      data: selfSufficiencyRoadmapData.map((d) => d.Subsidy),
                      smooth: true,
                      lineStyle: { color: palette[1], width: 2 },
                      itemStyle: { color: palette[1] },
                      showSymbol: false,
                      areaStyle: {
                        color: {
                          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0.05, color: palette[1] + '4D' },
                            { offset: 0.95, color: palette[1] + '0A' },
                          ],
                        },
                      },
                    },
                    {
                      name: 'Own-Source Income',
                      type: 'line',
                      stack: 'roadmap',
                      data: selfSufficiencyRoadmapData.map((d) => d['Own-Source Income']),
                      smooth: true,
                      lineStyle: { color: palette[0], width: 2 },
                      itemStyle: { color: palette[0] },
                      showSymbol: false,
                      areaStyle: {
                        color: {
                          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0.05, color: palette[0] + '52' },
                            { offset: 0.95, color: palette[0] + '0D' },
                          ],
                        },
                      },
                    },
                    {
                      name: 'Target Surplus',
                      type: 'line',
                      data: selfSufficiencyRoadmapData.map((d) => d['Target Surplus']),
                      smooth: true,
                      lineStyle: { color: seminaryTheme.success, width: 3 },
                      itemStyle: { color: seminaryTheme.success },
                      showSymbol: false,
                    },
                  ],
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}
