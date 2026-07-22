'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  AlertCircle,
  PartyPopper,
  Search,
  Church,
  GraduationCap,
  BookOpen,
  CalendarDays,
  Sparkles,
  Target,
  TrendingUp,
  Landmark,
  ArrowUpRight,
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { selectField } from '../lib/formStyles';

interface BudgetRow {
  id: string;
  institution_id: string;
  institution_name?: string;
  institution_type?: string;
  year: number;
  month: number;
  amount: number;
  notes?: string;
  updated_at?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

const pesoExact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TYPE_BADGE: Record<string, { label: string; className: string; icon: React.ElementType; rail: string }> = {
  parish: {
    label: 'Parish',
    className: 'bg-green-50 text-green-700 border border-green-100',
    icon: Church,
    rail: 'from-green-500 to-emerald-300',
  },
  school: {
    label: 'School',
    className: 'bg-purple-50 text-purple-700 border border-purple-100',
    icon: GraduationCap,
    rail: 'from-purple-500 to-fuchsia-300',
  },
  seminary: {
    label: 'Seminary',
    className: 'bg-rose-50 text-rose-700 border border-rose-100',
    icon: BookOpen,
    rail: 'from-rose-500 to-pink-300',
  },
  diocese: {
    label: 'Diocese',
    className: 'bg-gold-50 text-gold-700 border border-gold-200',
    icon: Church,
    rail: 'from-gold-500 to-gold-300',
  },
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function YearSelector({
  year,
  onChange,
  dark = false,
}: {
  year: number;
  onChange: (y: number) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full p-1 shadow-sm ${
        dark ? 'border border-white/10 bg-white/10 text-white' : 'border border-black/10 bg-white text-church-black'
      }`}
    >
      <button
        onClick={() => onChange(year - 1)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
          dark ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-black'
        }`}
        aria-label="Previous year"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-20 px-3 text-center font-serif text-base font-bold tabular-nums">{year}</span>
      <button
        onClick={() => onChange(year + 1)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
          dark ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-black'
        }`}
        aria-label="Next year"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const progress = clampProgress(value);

  return (
    <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-white shadow-lg shadow-black/10">
      <div
        className="absolute inset-2 rounded-full"
        style={{ background: `conic-gradient(#D4AF37 ${progress * 3.6}deg, #ECECEC 0deg)` }}
      />
      <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white">
        <span className="font-serif text-3xl font-bold leading-none text-church-black">{Math.round(progress)}%</span>
        <span className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      </div>
    </div>
  );
}

function SpotlightMetric({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'light',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      className={`rounded-[2rem] border p-5 ${
        tone === 'dark' ? 'border-white/10 bg-white/10 text-white' : 'border-black/10 bg-white text-church-black'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${tone === 'dark' ? 'text-white/50' : 'text-gray-400'}`}
          >
            {label}
          </p>
          <p className="mt-2 font-serif text-2xl font-bold leading-none">{value}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            tone === 'dark' ? 'bg-gold-500 text-black' : 'bg-black text-gold-400'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={`mt-4 text-xs font-semibold ${tone === 'dark' ? 'text-white/55' : 'text-gray-500'}`}>{sub}</p>
    </div>
  );
}

function InstitutionBudget({
  canManage,
  institutionId,
  institutionName,
  institutionType,
}: {
  canManage: boolean;
  institutionId?: string;
  institutionName?: string;
  institutionType?: string;
}) {
  const currentYear = new Date().getFullYear();
  const isJanuary = new Date().getMonth() === 0;
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [savedAmounts, setSavedAmounts] = useState<Record<number, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isPastYear = year < currentYear;
  const canEdit = canManage && !isPastYear;

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .getBudgets({ institutionId, institutionName, institutionType, year })
      .then((rows: BudgetRow[]) => {
        if (!active) return;
        const next: Record<number, string> = {};
        const saved: Record<number, number> = {};
        for (const row of rows ?? []) {
          next[row.month] = String(row.amount);
          saved[row.month] = row.amount;
        }
        setAmounts(next);
        setSavedAmounts(saved);
      })
      .catch(() => {
        if (!active) return;
        setAmounts({});
        setSavedAmounts({});
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [institutionId, institutionName, institutionType, year]);

  const totalEntered = useMemo(() => Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0), [amounts]);
  const monthsSet = useMemo(() => Object.values(amounts).filter((v) => v !== '' && v != null).length, [amounts]);
  const completion = (monthsSet / 12) * 100;
  const average = monthsSet > 0 ? totalEntered / monthsSet : 0;
  const topMonth = useMemo(() => {
    let winner = { label: 'No month yet', amount: 0 };
    for (let m = 1; m <= 12; m++) {
      const amount = Number(amounts[m]) || 0;
      if (amount > winner.amount) winner = { label: MONTH_NAMES[m - 1], amount };
    }
    return winner;
  }, [amounts]);
  const hasUnsaved = useMemo(() => {
    for (let m = 1; m <= 12; m++) {
      const entered = amounts[m] !== undefined && amounts[m] !== '' ? Number(amounts[m]) : undefined;
      const saved = savedAmounts[m];
      if ((entered ?? undefined) !== (saved ?? undefined)) return true;
    }
    return false;
  }, [amounts, savedAmounts]);

  const showReminder = canManage && !loading && year === currentYear && Object.keys(savedAmounts).length === 0;

  const handleSave = async () => {
    if (isPastYear) {
      setSaveError(`The ${year} budget is from a past year and can no longer be edited.`);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const entries = [];
      for (let m = 1; m <= 12; m++) {
        if (amounts[m] !== undefined && amounts[m] !== '') {
          entries.push({ month: m, amount: Number(amounts[m]) || 0 });
        }
      }
      if (entries.length === 0) {
        setSaveError('Enter an amount for at least one month before saving.');
        return;
      }
      const saved: BudgetRow[] = await apiClient.saveBudgets({
        institutionId,
        institutionName,
        institutionType,
        year,
        entries,
      });
      const nextSaved: Record<number, number> = { ...savedAmounts };
      for (const row of saved ?? []) nextSaved[row.month] = row.amount;
      setSavedAmounts(nextSaved);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save budget. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">
      <section className="relative overflow-hidden rounded-[2.25rem] bg-church-black p-6 text-white shadow-2xl shadow-black/15 md:p-8">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gold-500/20 [clip-path:polygon(38%_0,100%_0,100%_100%,0_100%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-300">
              <Sparkles className="h-3.5 w-3.5" />
              Budget studio
            </div>
            <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[0.98] tracking-tight md:text-6xl">
              Shape the monthly plan without losing the full year.
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-white/60 md:text-base">
              {canManage
                ? `Set the planned monthly budget for ${institutionName || 'your institution'} with fast scanning, clear progress, and a sticky save action.`
                : `Review the monthly budget submitted for ${institutionName || 'your institution'} in a focused annual view.`}
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <YearSelector year={year} onChange={setYear} dark />
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <ProgressRing value={completion} label="planned" />
                <div className="min-w-0 text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Annual total</p>
                  <p className="mt-2 break-words font-serif text-3xl font-bold leading-tight text-gold-300">
                    {peso.format(totalEntered)}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-white/45">{monthsSet} of 12 months set</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {(showReminder || (canManage && isPastYear)) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mt-6 flex items-start gap-4 rounded-[2rem] border p-5 ${
              isPastYear ? 'border-gray-200 bg-white' : 'border-gold-200 bg-gold-50'
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isPastYear ? 'bg-gray-100 text-gray-500' : 'bg-gold-500 text-black'
              }`}
            >
              {showReminder && isJanuary ? <PartyPopper className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-serif text-lg font-bold text-church-black">
                {isPastYear
                  ? `${year} budget is read-only`
                  : isJanuary
                    ? `Happy New Year! Time to set your ${year} budget.`
                    : `No budget set for ${year} yet.`}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-500">
                {isPastYear
                  ? `Past-year budget plans cannot be edited. Switch to ${currentYear} to set or adjust the current plan.`
                  : 'Enter planned amounts below, then save once. The diocese can review your submission right away.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <SpotlightMetric
          icon={Target}
          label="Months set"
          value={`${monthsSet} / 12`}
          sub={monthsSet === 12 ? 'Full year is covered' : 'Finish the remaining months'}
        />
        <SpotlightMetric
          icon={TrendingUp}
          label="Monthly average"
          value={monthsSet > 0 ? peso.format(average) : 'No amount'}
          sub="Average across months with values"
        />
        <SpotlightMetric
          icon={CalendarDays}
          label="Largest month"
          value={topMonth.amount > 0 ? peso.format(topMonth.amount) : 'None'}
          sub={topMonth.amount > 0 ? topMonth.label : 'Add a month to reveal it'}
        />
      </section>

      {loading ? (
        <div className="py-12">
          <InlineLoader label="Loading budget" />
        </div>
      ) : (
        <>
          <section className="mt-6 overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-black/5 bg-[#fbfaf7] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600">Monthly planner</p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-church-black">Twelve-month budget map</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {MONTH_SHORT.map((label, idx) => {
                  const isSet = amounts[idx + 1] !== undefined && amounts[idx + 1] !== '';
                  return (
                    <span
                      key={label}
                      className={`h-2.5 w-7 rounded-full ${isSet ? 'bg-gold-500' : 'bg-gray-200'}`}
                      aria-label={`${label} ${isSet ? 'set' : 'not set'}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 divide-y divide-black/5 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-[280px_1fr]">
              <aside className="bg-church-black p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-300">Planning pulse</p>
                <p className="mt-3 font-serif text-4xl font-bold leading-none">{monthsSet}</p>
                <p className="mt-2 text-sm font-semibold text-white/55">months already prepared for {year}</p>
                <div className="mt-6 space-y-3">
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gold-500" style={{ width: `${completion}%` }} />
                  </div>
                  <p className="text-xs font-medium text-white/50">
                    {monthsSet === 12
                      ? 'Ready for annual review.'
                      : `${12 - monthsSet} month${12 - monthsSet === 1 ? '' : 's'} still empty.`}
                  </p>
                </div>
              </aside>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {MONTH_NAMES.map((name, idx) => {
                  const month = idx + 1;
                  const value = amounts[month] ?? '';
                  const isSet = value !== '';
                  return (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.025 }}
                      className={`group border-b border-black/5 p-5 transition-colors sm:odd:border-r xl:border-r ${
                        isSet ? 'bg-white' : 'bg-gray-50/70'
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl font-serif text-lg font-bold ${
                              isSet ? 'bg-gold-500 text-black' : 'bg-white text-gray-300 ring-1 ring-gray-200'
                            }`}
                          >
                            {month}
                          </span>
                          <div>
                            <p className="font-serif text-lg font-bold leading-tight text-church-black">{name}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                              {isSet ? 'Planned' : 'Waiting'}
                            </p>
                          </div>
                        </div>
                        {isSet && (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-50 text-green-600 ring-1 ring-green-100">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </div>

                      {canEdit ? (
                        <label className="relative block">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">
                            PHP
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={value}
                            onChange={(e) => setAmounts((prev) => ({ ...prev, [month]: e.target.value }))}
                            placeholder="0.00"
                            className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-14 pr-4 text-base font-bold text-church-black shadow-sm transition-all placeholder:text-gray-300 focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-500/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </label>
                      ) : (
                        <p className="font-serif text-2xl font-bold text-church-black">
                          {isSet ? pesoExact.format(Number(value)) : <span className="text-gray-300">Not set</span>}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>

          {canEdit && (
            <div className="sticky bottom-4 z-20 mt-8">
              <div className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/95 p-4 shadow-2xl shadow-black/15 backdrop-blur md:flex-row md:items-center">
                <div className="flex flex-1 items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-gold-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-church-black">
                      Total: <span className="font-serif text-lg">{peso.format(totalEntered)}</span>
                    </p>
                    <p className="text-xs font-semibold text-gray-400">
                      {hasUnsaved ? 'You have unsaved changes ready to save.' : 'All changes saved.'}
                    </p>
                  </div>
                </div>
                {saveError && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveError}
                  </p>
                )}
                {saveSuccess && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-green-600">
                    <Check className="h-4 w-4 shrink-0" />
                    Budget saved.
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={isSaving || !hasUnsaved}
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-gold-500 px-7 text-sm font-black uppercase tracking-widest text-black shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-600 disabled:opacity-50"
                >
                  {isSaving ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  ) : (
                    <>
                      <Check className="h-5 w-5" />
                      Save budget
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type InstitutionSummary = {
  institutionId: string;
  name: string;
  type: string;
  months: Record<number, number>;
  total: number;
};

function DioceseBudgetOverview() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'parish' | 'school' | 'seminary'>('all');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .getBudgets({ year })
      .then((data: BudgetRow[]) => active && setRows(data ?? []))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [year]);

  const institutions = useMemo<InstitutionSummary[]>(() => {
    const byInstitution = new Map<string, InstitutionSummary>();
    for (const row of rows) {
      let summary = byInstitution.get(row.institution_id);
      if (!summary) {
        summary = {
          institutionId: row.institution_id,
          name: row.institution_name ?? 'Unknown institution',
          type: row.institution_type ?? 'parish',
          months: {},
          total: 0,
        };
        byInstitution.set(row.institution_id, summary);
      }
      summary.months[row.month] = row.amount;
      summary.total += row.amount;
    }
    return Array.from(byInstitution.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const institutionOptions = useMemo(
    () =>
      Array.from(
        new Set(institutions.filter((i) => typeFilter === 'all' || i.type === typeFilter).map((i) => i.name)),
      ).sort(),
    [institutions, typeFilter],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutions.filter((inst) => {
      if (typeFilter !== 'all' && inst.type !== typeFilter) return false;
      if (institutionFilter !== 'all' && inst.name !== institutionFilter) return false;
      if (q && !inst.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [institutions, typeFilter, institutionFilter, search]);

  const budgetFilterCount = (typeFilter !== 'all' ? 1 : 0) + (institutionFilter !== 'all' ? 1 : 0);
  const clearBudgetFilters = () => {
    setTypeFilter('all');
    setInstitutionFilter('all');
  };

  const grandTotal = useMemo(() => filtered.reduce((sum, inst) => sum + inst.total, 0), [filtered]);
  const fullyPlanned = useMemo(
    () => institutions.filter((i) => Object.keys(i.months).length === 12).length,
    [institutions],
  );
  const submittedProgress = institutions.length ? (fullyPlanned / institutions.length) * 100 : 0;
  const highestInstitution = useMemo(
    () =>
      filtered.reduce<InstitutionSummary | null>(
        (best, inst) => (!best || inst.total > best.total ? inst : best),
        null,
      ),
    [filtered],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-church-black p-6 text-white shadow-2xl shadow-black/15 md:p-8">
          <div className="absolute bottom-0 right-0 h-40 w-72 bg-gold-500/20 [clip-path:polygon(30%_0,100%_0,100%_100%,0_100%)]" />
          <div className="relative flex flex-col gap-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-300">
                  <Landmark className="h-3.5 w-3.5" />
                  Diocese budget board
                </div>
                <h1 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-[0.98] tracking-tight md:text-6xl">
                  Budget Overview
                </h1>
                <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-white/60 md:text-base">
                  Monitor submissions, spot planning gaps, and open each institution for month-by-month detail.
                </p>
              </div>
              <YearSelector year={year} onChange={setYear} dark />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SpotlightMetric
                icon={Wallet}
                label="Combined"
                value={peso.format(grandTotal)}
                sub={`${year} institutions shown`}
                tone="dark"
              />
              <SpotlightMetric
                icon={Church}
                label="Submitted"
                value={String(institutions.length)}
                sub="At least one month set"
                tone="dark"
              />
              <SpotlightMetric
                icon={Target}
                label="Full plans"
                value={String(fullyPlanned)}
                sub="All 12 months complete"
                tone="dark"
              />
            </div>
          </div>
        </div>

        <aside className="rounded-[2.25rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Annual readiness</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-church-black">{Math.round(submittedProgress)}%</h2>
            </div>
            <ProgressRing value={submittedProgress} label="ready" />
          </div>
          <div className="mt-7 border-t border-black/5 pt-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Highest visible budget</p>
            <p className="mt-2 line-clamp-2 font-serif text-xl font-bold leading-tight text-church-black">
              {highestInstitution?.name ?? 'No institution yet'}
            </p>
            <p className="mt-1 text-sm font-bold text-gold-600">
              {highestInstitution ? peso.format(highestInstitution.total) : 'No amount'}
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institution..."
              className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-11 pr-4 text-sm font-semibold text-church-black transition-all placeholder:text-gray-300 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
            />
          </div>
          <FilterModal
            activeCount={budgetFilterCount}
            onClear={clearBudgetFilters}
            triggerClassName="h-12 rounded-2xl border-black/10"
          >
            <FilterField label="Institution type">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as 'all' | 'parish' | 'school' | 'seminary');
                  setInstitutionFilter('all');
                }}
                className={selectField(typeFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All types</option>
                <option value="parish">Parishes</option>
                <option value="school">Schools</option>
                <option value="seminary">Seminaries</option>
              </select>
            </FilterField>

            <FilterField label="Institution">
              <select
                value={institutionFilter}
                onChange={(e) => setInstitutionFilter(e.target.value)}
                className={selectField(institutionFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All institutions</option>
                {institutionOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterModal>
        </div>
      </section>

      {loading ? (
        <div className="py-12">
          <InlineLoader label="Loading budgets" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-black/10 bg-white py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gray-50 text-gray-300">
            <Wallet className="h-9 w-9" />
          </div>
          <p className="mt-5 font-serif text-2xl font-bold text-church-black">No budgets submitted</p>
          <p className="mt-1 max-w-md text-sm font-medium text-gray-400">
            {search || typeFilter !== 'all'
              ? 'No institutions match the current filters.'
              : `No institution has submitted a budget for ${year} yet.`}
          </p>
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-black/5 bg-[#fbfaf7] px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
            <span>Institution</span>
            <span className="hidden text-right md:block">Plan map</span>
            <span className="text-right">Total</span>
          </div>
          <AnimatePresence mode="popLayout">
            {filtered.map((inst, idx) => {
              const badge = TYPE_BADGE[inst.type] ?? TYPE_BADGE.parish;
              const BadgeIcon = badge.icon;
              const monthsSet = Object.keys(inst.months).length;
              const isOpen = expanded === inst.institutionId;
              return (
                <motion.div
                  key={inst.institutionId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: idx * 0.025 }}
                  className="border-b border-black/5 last:border-b-0"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : inst.institutionId)}
                    className="group grid w-full grid-cols-1 gap-4 px-5 py-5 text-left transition-colors hover:bg-gray-50/70 md:grid-cols-[minmax(0,1fr)_260px_150px_auto] md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`h-14 w-1.5 rounded-full bg-gradient-to-b ${badge.rail}`} />
                      <div className="min-w-0">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badge.className}`}
                        >
                          <BadgeIcon className="h-3 w-3" />
                          {badge.label}
                        </span>
                        <p className="mt-2 truncate font-serif text-xl font-bold leading-tight text-church-black">
                          {inst.name}
                        </p>
                      </div>
                    </div>

                    <div className="hidden items-center gap-1.5 md:flex">
                      {MONTH_SHORT.map((label, mIdx) => {
                        const set = inst.months[mIdx + 1] !== undefined;
                        return (
                          <span
                            key={label}
                            title={`${label}: ${set ? peso.format(inst.months[mIdx + 1]) : 'Not set'}`}
                            className={`h-8 flex-1 rounded-lg ${set ? 'bg-gold-500' : 'bg-gray-200'}`}
                          />
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-4 md:block md:text-right">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Months</p>
                        <p
                          className={`text-sm font-black ${monthsSet === 12 ? 'text-green-600' : 'text-church-black'}`}
                        >
                          {monthsSet} / 12
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 md:hidden">
                          Annual
                        </p>
                        <p className="font-serif text-xl font-bold text-church-black">{peso.format(inst.total)}</p>
                      </div>
                    </div>

                    <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-300 transition-all group-hover:bg-black group-hover:text-gold-400 md:flex">
                      <ChevronDown
                        className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                      >
                        <div className="border-t border-black/5 bg-[#fbfaf7] px-5 py-5">
                          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold-600">
                            <ArrowUpRight className="h-4 w-4" />
                            Monthly breakdown
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {MONTH_SHORT.map((label, mIdx) => {
                              const amount = inst.months[mIdx + 1];
                              const set = amount !== undefined;
                              return (
                                <div
                                  key={label}
                                  className={`rounded-2xl border p-3 ${
                                    set ? 'border-black/10 bg-white' : 'border-dashed border-gray-200 bg-white/60'
                                  }`}
                                >
                                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                    {label}
                                  </p>
                                  <p
                                    className={`mt-2 text-sm font-bold ${set ? 'text-church-black' : 'text-gray-300'}`}
                                  >
                                    {set ? peso.format(amount) : 'Not set'}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

export function Budget() {
  const { permissions, user } = usePermissions();
  const canManage = permissions.manage_budget === true;
  const isDioceseOverview = permissions.view_diocese === true && !canManage;

  if (isDioceseOverview) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] pb-16">
        <DioceseBudgetOverview />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-16">
      <InstitutionBudget
        canManage={canManage}
        institutionId={user?.entityId}
        institutionName={user?.entityName}
        institutionType={user?.entityType}
      />
    </div>
  );
}
