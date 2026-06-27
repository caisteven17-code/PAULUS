'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  Check,
  CheckCheck,
  Pencil,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { auth } from '../../firebase';
import { InlineLoader } from '../ui/LoadingScreen';
import { FilterModal, FilterField } from '../ui/FilterModal';
import { selectField } from '../../lib/formStyles';

interface LiturgicalRecord {
  id: string;
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  celebration_name: string;
  rank?: string;
  liturgical_season?: string;
  source_name: string;
  validation_status?: string;
  validation_reason?: string;
  gcatholic_match_status?: string;
  romcal_match_status?: string;
  litcal_match_status?: string;
  gcatholic_celebration_name?: string;
  romcal_celebration_name?: string;
  litcal_celebration_name?: string;
  review_status: 'pending' | 'approved' | 'approved_with_revisions' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

const PAGE_SIZE = 20;

const SEASONS = ['Advent', 'Christmas', 'Ordinary Time', 'Lent', 'Paschal Triduum', 'Easter'];

const VALIDATION_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'mismatched', label: 'Mismatched' },
];

const MONTHS = [
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

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'approved_with_revisions', label: 'Approved with Revisions' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All Statuses' },
];

const STATUS_BADGES: Record<LiturgicalRecord['review_status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
  approved_with_revisions: { label: 'Revised', className: 'bg-blue-100 text-blue-700' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-700' },
};

const MATCH_BADGES: Record<string, { label: string; className: string; dotClassName: string }> = {
  matched: {
    label: 'Matched',
    className: 'text-emerald-700',
    dotClassName: 'bg-emerald-500 ring-emerald-100',
  },
  mismatched: {
    label: 'Mismatch',
    className: 'text-rose-700',
    dotClassName: 'bg-rose-500 ring-rose-100',
  },
  missing: {
    label: 'Missing',
    className: 'text-gray-500',
    dotClassName: 'bg-gray-300 ring-gray-100',
  },
  not_applied: {
    label: 'Not used',
    className: 'text-slate-500',
    dotClassName: 'bg-slate-300 ring-slate-100',
  },
};

const formatDisplayDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const matchBadge = (status?: string) => MATCH_BADGES[status || 'missing'] || MATCH_BADGES.missing;

const sourceLabel = (record: LiturgicalRecord) =>
  record.source_name === 'liturgical_calendar_sources' ? 'Source of truth' : record.source_name;

const getValidationState = (record: LiturgicalRecord): 'matched' | 'mismatched' => {
  if (record.validation_status === 'mismatched_all' || record.validation_status === 'validator_missing') {
    return 'mismatched';
  }

  if (
    record.validation_status === 'matched_both' ||
    record.validation_status === 'matched_gcatholic_only' ||
    record.validation_status === 'matched_romcal_only' ||
    record.validation_status === 'matched_litcal_only' ||
    record.validation_status === 'source_of_truth_only'
  ) {
    return 'matched';
  }

  const validatorStatuses = [record.romcal_match_status, record.gcatholic_match_status, record.litcal_match_status];
  return validatorStatuses.some((status) => status === 'matched') ? 'matched' : 'mismatched';
};

const getNameOptions = (record: LiturgicalRecord) =>
  [
    { key: 'source', label: sourceLabel(record), value: record.celebration_name, status: 'source' },
    {
      key: 'romcal',
      label: 'Romcal',
      value: record.romcal_celebration_name,
      status: record.romcal_match_status,
    },
    {
      key: 'gcatholic',
      label: 'GCatholic',
      value: record.gcatholic_celebration_name,
      status: record.gcatholic_match_status,
    },
    {
      key: 'litcal',
      label: 'LitCal',
      value: record.litcal_celebration_name,
      status: record.litcal_match_status,
    },
  ].filter((option) => Boolean(option.value));

export function LiturgicalValidatorControl() {
  const [records, setRecords] = useState<LiturgicalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filters — Approve All applies to everything matching these
  const [statusFilter, setStatusFilter] = useState('pending');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(0);
  const [yearFilter, setYearFilter] = useState(0);
  const [celebrationQuery, setCelebrationQuery] = useState('');
  const [debouncedCelebration, setDebouncedCelebration] = useState('');
  const [validationFilter, setValidationFilter] = useState<'all' | 'matched' | 'mismatched'>('all');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<LiturgicalRecord | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editName, setEditName] = useState('');
  const [editNameSource, setEditNameSource] = useState('source');
  const [rejectTarget, setRejectTarget] = useState<LiturgicalRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showApproveAll, setShowApproveAll] = useState(false);
  const [showMismatchBlock, setShowMismatchBlock] = useState(false);
  const [mismatchBlockCount, setMismatchBlockCount] = useState(0);
  const [isCheckingApproveAll, setIsCheckingApproveAll] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const reviewedBy = auth.currentUser?.email || auth.currentUser?.displayName || 'liturgical_validator';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCelebration(celebrationQuery.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [celebrationQuery]);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await apiClient.getLiturgicalCalendar({
        status: statusFilter,
        season: seasonFilter,
        month: monthFilter || undefined,
        year: yearFilter || undefined,
        celebration: debouncedCelebration || undefined,
        validation: validationFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      setRecords(result.records);
      setTotal(result.total);
      if (result.records.length === 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      }
    } catch {
      setLoadError('Failed to load liturgical calendar records. Please check the backend services.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, seasonFilter, monthFilter, yearFilter, debouncedCelebration, validationFilter, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, seasonFilter, monthFilter, yearFilter, debouncedCelebration, validationFilter]);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleApprove = async (record: LiturgicalRecord) => {
    setBusyId(record.id);
    setActionError('');
    try {
      await apiClient.reviewLiturgicalRecord(record.id, { action: 'approve', reviewedBy });
      flashSuccess(`Approved "${record.celebration_name}" (${formatDisplayDate(record.date)}).`);
      await fetchRecords();
    } catch {
      setActionError('Failed to approve the record. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (record: LiturgicalRecord) => {
    setEditTarget(record);
    setEditDate(record.date);
    setEditName(record.celebration_name);
    setEditNameSource('source');
    setActionError('');
  };

  const chooseEditName = (source: string, value: string) => {
    setEditNameSource(source);
    setEditName(value);
  };

  const handleEditApprove = async () => {
    if (!editTarget) return;
    if (!editDate || !editName.trim()) {
      setActionError('Both the date and the celebration name are required.');
      return;
    }
    setBusyId(editTarget.id);
    setActionError('');
    try {
      const revisedName = editName.trim();
      const isUnchanged = editDate === editTarget.date && revisedName === editTarget.celebration_name;

      if (isUnchanged) {
        await apiClient.reviewLiturgicalRecord(editTarget.id, { action: 'approve', reviewedBy });
        flashSuccess(`Approved "${revisedName}".`);
      } else {
        await apiClient.reviewLiturgicalRecord(editTarget.id, {
          action: 'approve_with_revisions',
          reviewedBy,
          date: editDate,
          celebration_name: revisedName,
          name_source: editNameSource,
        });
        flashSuccess(`Approved "${revisedName}" with revisions.`);
      }
      setEditTarget(null);
      await fetchRecords();
    } catch (error) {
      // api-client errors look like "PATCH /path → 409: <server detail>" — surface the detail
      const detail = error instanceof Error ? error.message.match(/→ \d+: (.+)$/)?.[1] : undefined;
      setActionError(detail || 'Failed to save the revision. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (record: LiturgicalRecord) => {
    setRejectTarget(record);
    setRejectReason('');
    setActionError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }
    setBusyId(rejectTarget.id);
    setActionError('');
    try {
      await apiClient.reviewLiturgicalRecord(rejectTarget.id, {
        action: 'reject',
        reviewedBy,
        reason: rejectReason.trim(),
      });
      flashSuccess(`Rejected "${rejectTarget.celebration_name}" (${formatDisplayDate(rejectTarget.date)}).`);
      setRejectTarget(null);
      await fetchRecords();
    } catch {
      setActionError('Failed to reject the record. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const currentApprovalFilters = () => ({
    season: seasonFilter !== 'all' ? seasonFilter : undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    celebration: debouncedCelebration || undefined,
  });

  const handleApproveAllClick = async () => {
    if (statusFilter !== 'pending' || total <= 0 || isLoading) return;

    setIsCheckingApproveAll(true);
    setActionError('');
    try {
      const mismatchResult =
        validationFilter === 'mismatched'
          ? { total }
          : await apiClient.getLiturgicalCalendar({
              status: 'pending',
              ...currentApprovalFilters(),
              validation: 'mismatched',
              page: 1,
              pageSize: 1,
            });

      if (mismatchResult.total > 0) {
        setMismatchBlockCount(mismatchResult.total);
        setShowMismatchBlock(true);
        return;
      }

      setShowApproveAll(true);
    } catch {
      setActionError('Failed to check mismatched records before bulk approval. Please try again.');
    } finally {
      setIsCheckingApproveAll(false);
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    setActionError('');
    try {
      const result = await apiClient.approveAllLiturgicalRecords(
        {
          ...currentApprovalFilters(),
          validation: validationFilter !== 'all' ? validationFilter : undefined,
        },
        reviewedBy,
      );
      flashSuccess(`Approved ${result.approved} pending event${result.approved === 1 ? '' : 's'}.`);
      setShowApproveAll(false);
      await fetchRecords();
    } catch {
      setActionError('Bulk approval failed. Please try again.');
    } finally {
      setIsApprovingAll(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canApproveAll = statusFilter === 'pending' && total > 0 && !isLoading && !isCheckingApproveAll;
  const totalLabel =
    validationFilter === 'all'
      ? `record${total === 1 ? '' : 's'}`
      : `${validationFilter} record${total === 1 ? '' : 's'}`;
  const visibleRecords =
    validationFilter === 'all' ? records : records.filter((record) => getValidationState(record) === validationFilter);

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-10">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-10">
        <div className="space-y-1">
          <h3 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <CalendarCheck className="w-8 h-8 text-[#D4AF37]" />
            Liturgical Calendar Validator
          </h3>
          <p className="text-sm text-gray-500 font-medium max-w-2xl">
            Review imported liturgical events before they are used by the system. Every date and celebration name must
            be double-checked by a human validator — approve, revise, or reject each record.
          </p>
        </div>
        <button
          onClick={handleApproveAllClick}
          disabled={!canApproveAll}
          title={
            statusFilter === 'pending'
              ? 'Approve every pending event matching the current filters'
              : 'Switch the status filter to "Pending Review" to bulk-approve'
          }
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
        >
          {isCheckingApproveAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
          Approve All ({statusFilter === 'pending' ? total : 0})
        </button>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold flex items-center gap-3">
          <Check className="w-5 h-5 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {(actionError || loadError) && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-sm font-bold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {actionError || loadError}
        </div>
      )}

      {/* Filter bar — Celebration search inline, the rest in a pop-up modal.
          Approve All stays scoped to whatever matches these filters. */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            type="text"
            placeholder="Search celebrations..."
            value={celebrationQuery}
            onChange={(e) => setCelebrationQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all placeholder:text-gray-300"
          />
        </div>
        <FilterModal
          activeCount={
            (statusFilter !== 'pending' ? 1 : 0) +
            (validationFilter !== 'all' ? 1 : 0) +
            (seasonFilter !== 'all' ? 1 : 0) +
            (monthFilter !== 0 ? 1 : 0) +
            (yearFilter !== 0 ? 1 : 0)
          }
          onClear={() => {
            setStatusFilter('pending');
            setValidationFilter('all');
            setSeasonFilter('all');
            setMonthFilter(0);
            setYearFilter(0);
          }}
        >
          <FilterField label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectField(statusFilter !== 'pending', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Validation">
            <select
              value={validationFilter}
              onChange={(e) => setValidationFilter(e.target.value as typeof validationFilter)}
              className={selectField(validationFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
            >
              {VALIDATION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Season">
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              className={selectField(seasonFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
            >
              <option value="all">All Seasons</option>
              {SEASONS.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </FilterField>

          <div className="grid grid-cols-2 gap-3">
            <FilterField label="Month">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(Number(e.target.value))}
                className={selectField(monthFilter !== 0, 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value={0}>All Months</option>
                {MONTHS.map((month, idx) => (
                  <option key={month} value={idx + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Year">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(Number(e.target.value))}
                className={selectField(yearFilter !== 0, 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value={0}>All Years</option>
                {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </FilterModal>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Date</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Celebration</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Season</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Rank</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-[150px]">
                Validation
              </th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Status</th>
              <th className="pb-3.5 font-bold text-gray-400 text-[10px] uppercase tracking-widest text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-24 text-center">
                  <InlineLoader label="Loading records" className="py-0" />
                </td>
              </tr>
            ) : visibleRecords.length > 0 ? (
              visibleRecords.map((record) => {
                const badge = STATUS_BADGES[record.review_status];
                const isBusy = busyId === record.id;
                const validationState = getValidationState(record);
                const validationLabel = validationState === 'matched' ? 'Matched' : 'Mismatched';
                const validationClassName =
                  validationState === 'matched'
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-rose-100 bg-rose-50 text-rose-700';
                const validationDot = validationState === 'matched' ? 'bg-emerald-500' : 'bg-rose-500';
                return (
                  <tr key={record.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 pr-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900 text-sm">{formatDisplayDate(record.date)}</div>
                      <div className="text-xs text-gray-400 font-medium">{record.weekday}</div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-gray-800 text-sm">{record.celebration_name}</div>
                    </td>
                    <td className="py-4 pr-4 text-gray-600 text-sm font-medium whitespace-nowrap">
                      {record.liturgical_season || '—'}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        {record.rank || '—'}
                      </span>
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(record)}
                        className="inline-flex rounded-full transition-all hover:shadow-sm active:scale-95"
                        title="Open review details"
                      >
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${validationClassName}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${validationDot}`} />
                          {validationLabel}
                        </span>
                      </button>
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${badge.className}`}
                        title={record.reviewed_by ? `Reviewed by ${record.reviewed_by}` : undefined}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                        ) : (
                          <>
                            {record.review_status !== 'approved' &&
                              record.review_status !== 'approved_with_revisions' && (
                                <button
                                  onClick={() => handleApprove(record)}
                                  className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                  title={
                                    record.review_status === 'rejected' ? 'Approve (restore rejected event)' : 'Approve'
                                  }
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            <button
                              onClick={() => openEdit(record)}
                              className="p-2 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"
                              title="Review details and choose final name"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {record.review_status !== 'rejected' && (
                              <button
                                onClick={() => openReject(record)}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                title={record.review_status === 'pending' ? 'Reject' : 'Reject (revoke approval)'}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                      <CalendarCheck className="w-10 h-10 text-gray-200" />
                    </div>
                    <p className="text-gray-400 font-medium">No liturgical events match the current filters.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400 font-medium">
          {total} {totalLabel} • Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="p-2.5 rounded-xl border border-gray-100 text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="p-2.5 rounded-xl border border-gray-100 text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Review details modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[24px] shadow-2xl border border-gray-100 p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">Review Liturgical Event</h4>
                <p className="text-sm text-gray-500 font-medium">
                  Compare validator names, choose the final celebration name, then approve the record.
                </p>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</div>
                <div className="text-sm font-bold text-gray-900">{formatDisplayDate(editTarget.date)}</div>
                <div className="text-xs font-medium text-gray-400">{editTarget.weekday}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Season</div>
                <div className="text-sm font-bold text-gray-900">{editTarget.liturgical_season || 'Not set'}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rank</div>
                <div className="text-sm font-bold text-gray-900">{editTarget.rank || 'Not set'}</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-[#D4AF37]" />
                <h5 className="text-sm font-bold text-gray-900">Validator Summary</h5>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {getNameOptions(editTarget).map((option) => {
                  const badge =
                    option.status === 'source'
                      ? { label: 'Source', className: 'bg-[#D4AF37]/10 text-[#8B6F16] border-[#D4AF37]/20' }
                      : matchBadge(option.status);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => chooseEditName(option.key, option.value || '')}
                      className={`text-left rounded-2xl border p-4 transition-all ${
                        editNameSource === option.key
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                          {option.label}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">{option.value}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {(editTarget.validation_reason || editTarget.review_notes) && (
              <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Full Validation Reason
                </div>
                <p className="text-sm text-gray-600 font-medium leading-relaxed">
                  {editTarget.validation_reason || editTarget.review_notes}
                </p>
              </div>
            )}

            <div className="space-y-5 mb-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                  Final Celebration Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditNameSource('custom');
                    setEditName(e.target.value);
                  }}
                  className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
                />
                <p className="text-xs font-medium text-gray-400">
                  Editing this field marks the selected name as custom.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setEditTarget(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleEditApprove}
                disabled={busyId === editTarget.id}
                className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {busyId === editTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Approve Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 p-10 w-full max-w-lg">
            <h4 className="text-xl font-bold text-gray-900 mb-2">Reject Event</h4>
            <p className="text-sm text-gray-500 font-medium mb-8">
              Rejecting &quot;{rejectTarget.celebration_name}&quot; ({formatDisplayDate(rejectTarget.date)}). The record
              is kept for audit but hidden from the pending queue. A reason is required.
            </p>
            <div className="space-y-2 mb-8">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                Rejection Reason
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Duplicate of another entry, incorrect date from source..."
                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all placeholder:text-gray-300 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busyId === rejectTarget.id || !rejectReason.trim()}
                className="px-6 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {busyId === rejectTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mismatch blocker modal */}
      {showMismatchBlock && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 p-10 w-full max-w-lg">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">Resolve Mismatched Records First</h4>
            <p className="text-sm text-gray-500 font-medium mb-8 leading-relaxed">
              There {mismatchBlockCount === 1 ? 'is' : 'are'}{' '}
              <span className="font-bold text-gray-900">{mismatchBlockCount}</span> pending mismatched record
              {mismatchBlockCount === 1 ? '' : 's'} in the current filter scope. Review and approve or reject those
              records before using bulk approval.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowMismatchBlock(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setValidationFilter('mismatched');
                  setPage(1);
                  setShowMismatchBlock(false);
                }}
                className="px-6 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95"
              >
                View Mismatched
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve All confirmation */}
      {showApproveAll && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 p-10 w-full max-w-lg">
            <h4 className="text-xl font-bold text-gray-900 mb-2">Approve All Pending Events</h4>
            <p className="text-sm text-gray-500 font-medium mb-8">
              This will approve all <span className="font-bold text-gray-900">{total}</span> pending event
              {total === 1 ? '' : 's'} matching the current filters. Mismatched validation results are excluded from
              bulk approval and should be reviewed one by one. This cannot be undone in bulk.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowApproveAll(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveAll}
                disabled={isApprovingAll}
                className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isApprovingAll && <Loader2 className="w-4 h-4 animate-spin" />}
                Approve All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
