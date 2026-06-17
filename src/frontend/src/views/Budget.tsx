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
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';
import { InlineLoader } from '../components/ui/LoadingScreen';

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

const TYPE_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  parish: { label: 'Parish', className: 'bg-green-50 text-green-700 border border-green-100', icon: Church },
  school: { label: 'School', className: 'bg-purple-50 text-purple-700 border border-purple-100', icon: GraduationCap },
  seminary: { label: 'Seminary', className: 'bg-rose-50 text-rose-700 border border-rose-100', icon: BookOpen },
  diocese: { label: 'Diocese', className: 'bg-gold-50 text-gold-700 border border-gold-200', icon: Church },
};

function YearSelector({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm">
      <button
        onClick={() => onChange(year - 1)}
        className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-church-black transition-all"
        aria-label="Previous year"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-4 text-base font-serif font-bold text-church-black tabular-nums">{year}</span>
      <button
        onClick={() => onChange(year + 1)}
        className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-church-black transition-all"
        aria-label="Next year"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className="text-2xl md:text-3xl font-serif font-bold text-church-black leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 font-medium mt-1">{sub}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Institution mode — input the monthly budget for your own institution
// ────────────────────────────────────────────────────────────────────
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

  const totalEntered = useMemo(
    () => Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [amounts],
  );
  const monthsSet = useMemo(() => Object.values(amounts).filter((v) => v !== '' && v != null).length, [amounts]);
  const hasUnsaved = useMemo(() => {
    for (let m = 1; m <= 12; m++) {
      const entered = amounts[m] !== undefined && amounts[m] !== '' ? Number(amounts[m]) : undefined;
      const saved = savedAmounts[m];
      if ((entered ?? undefined) !== (saved ?? undefined)) return true;
    }
    return false;
  }, [amounts, savedAmounts]);

  const showReminder =
    canManage && !loading && year === currentYear && Object.keys(savedAmounts).length === 0;

  const handleSave = async () => {
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-church-black flex items-center justify-center">
              <Wallet className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-church-black tracking-tight">
              Annual Budget
            </h1>
          </div>
          <p className="text-base text-gray-500 font-medium">
            {canManage
              ? `Set the planned monthly budget for ${institutionName || 'your institution'}.`
              : `Monthly budget submitted for ${institutionName || 'your institution'}.`}
          </p>
        </div>
        <YearSelector year={year} onChange={setYear} />
      </div>

      {/* New-year reminder banner */}
      <AnimatePresence>
        {showReminder && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-4 bg-gold-50 border border-gold-200 rounded-3xl p-5 md:p-6 mb-8"
          >
            <div className="w-10 h-10 rounded-2xl bg-gold-500 flex items-center justify-center shrink-0">
              {isJanuary ? (
                <PartyPopper className="w-5 h-5 text-church-green-dark" />
              ) : (
                <AlertCircle className="w-5 h-5 text-church-green-dark" />
              )}
            </div>
            <div>
              <p className="text-base font-serif font-bold text-church-black">
                {isJanuary ? `Happy New Year! Time to set your ${year} budget.` : `No budget set for ${year} yet.`}
              </p>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                Please enter the planned budget for each month below, then press Save. The diocese will be able to see
                your submission.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard label="Total Annual Budget" value={peso.format(totalEntered)} sub={`for ${year}`} />
        <SummaryCard label="Months Set" value={`${monthsSet} / 12`} sub={monthsSet === 12 ? 'All months covered' : 'Months with an amount'} />
        <SummaryCard
          label="Monthly Average"
          value={monthsSet > 0 ? peso.format(totalEntered / monthsSet) : '—'}
          sub="across months set"
        />
      </div>

      {/* Month grid */}
      {loading ? (
        <div className="py-10">
          <InlineLoader label="Loading budget" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MONTH_NAMES.map((name, idx) => {
              const month = idx + 1;
              const value = amounts[month] ?? '';
              const isSet = value !== '';
              return (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`bg-white rounded-3xl border shadow-sm p-5 transition-colors ${
                    isSet ? 'border-green-100' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-gray-300" />
                      <span className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">{name}</span>
                    </div>
                    {isSet && (
                      <span className="w-5 h-5 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                        <Check className="w-3 h-3 text-green-600" />
                      </span>
                    )}
                  </div>
                  {canManage ? (
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-300">₱</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={value}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [month]: e.target.value }))}
                        placeholder="0.00"
                        className="w-full pl-9 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-base font-semibold text-church-black focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ) : (
                    <p className="text-xl font-serif font-bold text-church-black">
                      {isSet ? pesoExact.format(Number(value)) : <span className="text-gray-300">Not set</span>}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Save bar */}
          {canManage && (
            <div className="sticky bottom-4 mt-8">
              <div className="bg-white/95 backdrop-blur border border-gray-100 rounded-3xl shadow-xl p-4 md:p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm font-bold text-church-black">
                    Total: <span className="font-serif">{peso.format(totalEntered)}</span>
                  </p>
                  <p className="text-xs text-gray-400 font-medium">
                    {hasUnsaved ? 'You have unsaved changes.' : 'All changes saved.'}
                  </p>
                </div>
                {saveError && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {saveError}
                  </p>
                )}
                {saveSuccess && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-green-600">
                    <Check className="w-4 h-4 shrink-0" />
                    Budget saved.
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={isSaving || !hasUnsaved}
                  className="px-8 py-4 bg-gold-500 text-church-green-dark rounded-2xl text-sm font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 flex items-center justify-center gap-3 shrink-0"
                >
                  {isSaving ? (
                    <div className="w-5 h-5 border-2 border-church-green-dark/30 border-t-church-green-dark rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      SAVE BUDGET
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

// ────────────────────────────────────────────────────────────────────
// Diocese mode — read-only overview of every institution's budget
// ────────────────────────────────────────────────────────────────────
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutions.filter((inst) => {
      if (typeFilter !== 'all' && inst.type !== typeFilter) return false;
      if (q && !inst.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [institutions, typeFilter, search]);

  const grandTotal = useMemo(() => filtered.reduce((sum, inst) => sum + inst.total, 0), [filtered]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-church-black flex items-center justify-center">
              <Wallet className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-church-black tracking-tight">
              Budget Overview
            </h1>
          </div>
          <p className="text-base text-gray-500 font-medium">
            Monitor the monthly budget submitted by every institution in the diocese.
          </p>
        </div>
        <YearSelector year={year} onChange={setYear} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard label="Combined Budget" value={peso.format(grandTotal)} sub={`${year} · institutions shown`} />
        <SummaryCard
          label="Institutions Submitted"
          value={String(institutions.length)}
          sub={`with at least one month set for ${year}`}
        />
        <SummaryCard
          label="Fully Planned"
          value={String(institutions.filter((i) => Object.keys(i.months).length === 12).length)}
          sub="institutions with all 12 months set"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex gap-2 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
          {(
            [
              ['all', 'All'],
              ['parish', 'Parishes'],
              ['school', 'Schools'],
              ['seminary', 'Seminaries'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                typeFilter === value ? 'bg-church-black text-white shadow-md' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search institution…"
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-medium shadow-sm focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 transition-all placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* Institution list */}
      {loading ? (
        <div className="py-10">
          <InlineLoader label="Loading budgets" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5 bg-white rounded-3xl border border-gray-100">
          <div className="w-20 h-20 bg-gray-50 rounded-[24px] flex items-center justify-center border border-dashed border-gray-200">
            <Wallet className="w-9 h-9 text-gray-200" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xl font-serif font-bold text-church-black">No budgets submitted</p>
            <p className="text-sm text-gray-400">
              {search || typeFilter !== 'all'
                ? 'No institutions match the current filters.'
                : `No institution has submitted a budget for ${year} yet.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
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
                  transition={{ delay: idx * 0.03 }}
                  className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : inst.institutionId)}
                    className="w-full flex flex-col md:flex-row md:items-center gap-3 md:gap-6 p-5 md:p-6 text-left hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${badge.className}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-lg font-serif font-bold text-church-black truncate">{inst.name}</p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-left md:text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Months Set</p>
                        <p
                          className={`text-sm font-bold ${monthsSet === 12 ? 'text-green-600' : 'text-church-black'}`}
                        >
                          {monthsSet} / 12
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Annual Total</p>
                        <p className="text-lg font-serif font-bold text-church-black">{peso.format(inst.total)}</p>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-5 md:px-6 pb-6 pt-1 border-t border-gray-50">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
                            {MONTH_SHORT.map((label, mIdx) => {
                              const amount = inst.months[mIdx + 1];
                              const set = amount !== undefined;
                              return (
                                <div
                                  key={label}
                                  className={`rounded-2xl border p-3 ${
                                    set ? 'bg-gray-50/50 border-gray-100' : 'bg-white border-dashed border-gray-200'
                                  }`}
                                >
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                    {label}
                                  </p>
                                  <p className={`text-sm font-bold ${set ? 'text-church-black' : 'text-gray-300'}`}>
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
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Entry point — picks the right mode for the signed-in user
// ────────────────────────────────────────────────────────────────────
export function Budget() {
  const { permissions, user } = usePermissions();
  const canManage = permissions.manage_budget === true;
  const isDioceseOverview = permissions.view_diocese === true && !canManage;

  if (isDioceseOverview) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <DioceseBudgetOverview />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <InstitutionBudget
        canManage={canManage}
        institutionId={user?.entityId}
        institutionName={user?.entityName}
        institutionType={user?.entityType}
      />
    </div>
  );
}
