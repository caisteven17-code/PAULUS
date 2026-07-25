'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  X,
  Mail,
  Phone,
  UploadCloud,
  ChevronDown,
  Building2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { FilterModal, FilterField } from '../ui/FilterModal';
import { selectField, dateField } from '../../lib/formStyles';

interface SubmissionRecord {
  id: string;
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  district?: string;
  vicariate?: string;
  contactNumber?: string;
  email?: string;
  lastSubmissionDate?: Date;
  status: 'on-time' | 'warning' | 'action-required' | 'not-submitted';
  monthsLate: number;
  budgetSet: boolean;
  budgetAmount?: number;
}

interface SubmissionTrackerProps {
  submissions: SubmissionRecord[];
  onViewDetails?: (submission: SubmissionRecord) => void;
  onExportReport?: () => void;
  showBudgetInfo?: boolean;
  showExportButton?: boolean;
}

const STATUS_META: Record<
  SubmissionRecord['status'],
  { label: string; dot: string; chip: string; icon: React.ElementType }
> = {
  'on-time': {
    label: 'On time',
    dot: 'bg-emerald-500',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle,
  },
  warning: {
    label: 'Warning',
    dot: 'bg-amber-500',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: AlertTriangle,
  },
  'action-required': {
    label: 'Action required',
    dot: 'bg-rose-500',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: AlertTriangle,
  },
  'not-submitted': {
    label: 'Not submitted',
    dot: 'bg-slate-400',
    chip: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: Clock,
  },
};

export function SubmissionTracker({
  submissions,
  onViewDetails,
  onExportReport,
  showBudgetInfo = true,
  showExportButton = true,
}: SubmissionTrackerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | SubmissionRecord['status']>('all');
  const [filterType, setFilterType] = useState<'all' | 'parish' | 'school' | 'seminary'>('all');
  const [filterInstitution, setFilterInstitution] = useState('all'); // specific institution
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'entity' | 'status' | 'date'>('status');
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRecord | null>(null);
  const [behalfDate, setBehalfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [behalfFile, setBehalfFile] = useState<File | null>(null);

  const openDetails = (submission: SubmissionRecord) => {
    setSelectedSubmission(submission);
    setBehalfDate(new Date().toISOString().slice(0, 10));
    setBehalfFile(null);
    onViewDetails?.(submission);
  };

  const filteredSubmissions = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    const filtered = submissions.filter((sub) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        sub.entityName.toLowerCase().includes(q) ||
        (sub.district?.toLowerCase().includes(q) ?? false) ||
        (sub.vicariate?.toLowerCase().includes(q) ?? false);
      const matchesStatus = filterStatus === 'all' || sub.status === filterStatus;
      const matchesType = filterType === 'all' || sub.entityType === filterType;
      const matchesInstitution = filterInstitution === 'all' || sub.entityName === filterInstitution;
      let matchesDate = true;
      if (fromMs !== null || toMs !== null) {
        const t = sub.lastSubmissionDate ? new Date(sub.lastSubmissionDate).getTime() : null;
        matchesDate = t !== null && (fromMs === null || t >= fromMs) && (toMs === null || t <= toMs);
      }
      return matchesSearch && matchesStatus && matchesType && matchesInstitution && matchesDate;
    });

    if (sortBy === 'entity') {
      filtered.sort((a, b) => a.entityName.localeCompare(b.entityName));
    } else if (sortBy === 'status') {
      const order = { 'action-required': 0, warning: 1, 'not-submitted': 2, 'on-time': 3 } as const;
      filtered.sort((a, b) => order[a.status] - order[b.status]);
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => {
        const da = a.lastSubmissionDate ? new Date(a.lastSubmissionDate).getTime() : 0;
        const db = b.lastSubmissionDate ? new Date(b.lastSubmissionDate).getTime() : 0;
        return db - da;
      });
    }
    return filtered;
  }, [submissions, searchQuery, filterStatus, filterType, filterInstitution, dateFrom, dateTo, sortBy]);

  const institutionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          submissions
            .filter((s) => filterType === 'all' || s.entityType === filterType)
            .map((s) => s.entityName)
            .filter(Boolean),
        ),
      ).sort(),
    [submissions, filterType],
  );

  const submissionFilterCount =
    (filterStatus !== 'all' ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterInstitution !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (sortBy !== 'status' ? 1 : 0);

  const clearSubmissionFilters = () => {
    setFilterStatus('all');
    setFilterType('all');
    setFilterInstitution('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('status');
  };

  const stats = useMemo(
    () => ({
      total: submissions.length,
      onTime: submissions.filter((s) => s.status === 'on-time').length,
      warning: submissions.filter((s) => s.status === 'warning').length,
      actionRequired:
        submissions.filter((s) => s.status === 'action-required').length +
        submissions.filter((s) => s.status === 'not-submitted').length,
      budgetsSet: submissions.filter((s) => s.budgetSet).length,
    }),
    [submissions],
  );

  const statCards = [
    { label: 'Total', value: stats.total, dot: 'bg-slate-900' },
    { label: 'On time', value: stats.onTime, dot: 'bg-emerald-500' },
    { label: 'Warning', value: stats.warning, dot: 'bg-amber-500' },
    { label: 'Action req.', value: stats.actionRequired, dot: 'bg-rose-500' },
    ...(showBudgetInfo ? [{ label: 'Budgets set', value: stats.budgetsSet, dot: 'bg-sky-500' }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="flex flex-wrap items-stretch gap-3">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="flex min-w-[120px] flex-1 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{c.label}</p>
              <p className="mt-1 text-2xl font-black leading-none text-slate-900">{c.value}</p>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
          </div>
        ))}
        {showExportButton && (
          <button
            onClick={onExportReport}
            className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-slate-800"
          >
            <Download className="h-4 w-4 text-gold-400" />
            Export
          </button>
        )}
      </div>

      {/* Filter bar — search inline, everything else in the modal */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search entity, district, vicariate…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-500/10"
            />
          </div>
          <FilterModal activeCount={submissionFilterCount} onClear={clearSubmissionFilters}>
            <FilterField label="Status">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className={selectField(filterStatus !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All statuses</option>
                <option value="on-time">On time</option>
                <option value="warning">Warning</option>
                <option value="action-required">Action required</option>
                <option value="not-submitted">Not submitted</option>
              </select>
            </FilterField>

            <FilterField label="Institution type">
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as any);
                  setFilterInstitution('all');
                }}
                className={selectField(filterType !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold capitalize')}
              >
                <option value="all">All types</option>
                <option value="parish">Parish</option>
                <option value="school">School</option>
                <option value="seminary">Seminary</option>
              </select>
            </FilterField>

            <FilterField label="Institution">
              <select
                value={filterInstitution}
                onChange={(e) => setFilterInstitution(e.target.value)}
                className={selectField(filterInstitution !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All institutions</option>
                {institutionOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Sort by">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className={selectField(sortBy !== 'status', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="status">Priority</option>
                <option value="entity">Name</option>
                <option value="date">Last submitted</option>
              </select>
            </FilterField>

            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Submitted from">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={dateField(Boolean(dateFrom), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                />
              </FilterField>
              <FilterField label="Submitted to">
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={dateField(Boolean(dateTo), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                />
              </FilterField>
            </div>
          </FilterModal>
        </div>
      </div>

      {/* Submissions table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Entity
                </th>
                <th className="hidden px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 sm:table-cell">
                  Type
                </th>
                <th className="hidden px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 lg:table-cell">
                  Last submitted
                </th>
                {showBudgetInfo && (
                  <th className="hidden px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 sm:table-cell">
                    Budget
                  </th>
                )}
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSubmissions.map((submission) => {
                const meta = STATUS_META[submission.status];
                const lateSuffix =
                  (submission.status === 'warning' || submission.status === 'action-required') && submission.monthsLate
                    ? ` · ${submission.monthsLate}mo`
                    : '';
                return (
                  <tr key={submission.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{submission.entityName}</p>
                      <p className="text-[11px] text-slate-400 md:hidden">{submission.district || '—'}</p>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                        {submission.entityType}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="text-xs font-semibold text-slate-600">{submission.district || '—'}</p>
                      {submission.vicariate && <p className="text-[10px] text-slate-400">{submission.vicariate}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${meta.chip}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                        {lateSuffix}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs font-semibold text-slate-500 lg:table-cell">
                      {submission.lastSubmissionDate
                        ? new Date(submission.lastSubmissionDate).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    {showBudgetInfo && (
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {submission.budgetSet ? (
                          <span className="inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            ₱{Math.round((submission.budgetAmount || 0) / 1000)}K
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not set</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetails(submission)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-900 hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSubmissions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Building2 className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-400">No submissions match your filters.</p>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSubmission(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 bg-slate-900 p-6 text-white">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-400">Submission Details</p>
                <h3 className="mt-1 truncate font-serif text-2xl font-bold">{selectedSubmission.entityName}</h3>
                <p className="mt-1 text-sm font-medium text-white/55">
                  <span className="capitalize">{selectedSubmission.entityType}</span>
                  {selectedSubmission.district ? ` · ${selectedSubmission.district}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Phone className="h-4 w-4" /> Contact Number
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    {selectedSubmission.contactNumber || 'Not provided'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Mail className="h-4 w-4" /> Email Address
                  </div>
                  <p className="mt-2 break-all text-sm font-bold text-slate-900">
                    {selectedSubmission.email || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-gold-200 bg-gold-50/40 p-5">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Submit Documents on Their Behalf
                </h4>
                <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">Submission Date</label>
                    <input
                      type="date"
                      value={behalfDate}
                      onChange={(event) => setBehalfDate(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">Document File</label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gold-400 hover:bg-gold-50">
                      <span className="truncate text-slate-600">{behalfFile ? behalfFile.name : 'Choose file to submit'}</span>
                      <UploadCloud className="h-4 w-4 shrink-0 text-gold-600" />
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => setBehalfFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    disabled={!behalfDate || !behalfFile}
                    onClick={() => {
                      alert(`Prepared ${behalfFile?.name} for ${selectedSubmission.entityName} on ${behalfDate}.`);
                      setSelectedSubmission(null);
                    }}
                    className="rounded-xl bg-gold-500 px-5 py-2 text-sm font-black text-black transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Submit Document
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
