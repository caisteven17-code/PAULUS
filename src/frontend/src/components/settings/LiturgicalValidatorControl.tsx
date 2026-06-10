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
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { auth } from '../../firebase';

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
  review_status: 'pending' | 'approved' | 'approved_with_revisions' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

const PAGE_SIZE = 20;

const SEASONS = ['Advent', 'Christmas', 'Ordinary Time', 'Lent', 'Paschal Triduum', 'Easter'];

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

const formatDisplayDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

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
  const [reasonQuery, setReasonQuery] = useState('');
  const [debouncedReason, setDebouncedReason] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<LiturgicalRecord | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editName, setEditName] = useState('');
  const [rejectTarget, setRejectTarget] = useState<LiturgicalRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showApproveAll, setShowApproveAll] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const reviewedBy = auth.currentUser?.email || auth.currentUser?.displayName || 'liturgical_validator';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedReason(reasonQuery.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [reasonQuery]);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await apiClient.getLiturgicalCalendar({
        status: statusFilter,
        season: seasonFilter,
        month: monthFilter || undefined,
        year: yearFilter || undefined,
        reason: debouncedReason || undefined,
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
  }, [statusFilter, seasonFilter, monthFilter, yearFilter, debouncedReason, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, seasonFilter, monthFilter, yearFilter, debouncedReason]);

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
    setActionError('');
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
      await apiClient.reviewLiturgicalRecord(editTarget.id, {
        action: 'approve_with_revisions',
        reviewedBy,
        date: editDate,
        celebration_name: editName.trim(),
      });
      flashSuccess(`Approved "${editName.trim()}" with revisions.`);
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

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    setActionError('');
    try {
      const result = await apiClient.approveAllLiturgicalRecords(
        {
          season: seasonFilter !== 'all' ? seasonFilter : undefined,
          month: monthFilter || undefined,
          year: yearFilter || undefined,
          reason: debouncedReason || undefined,
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
  const canApproveAll = statusFilter === 'pending' && total > 0 && !isLoading;

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
          onClick={() => setShowApproveAll(true)}
          disabled={!canApproveAll}
          title={
            statusFilter === 'pending'
              ? 'Approve every pending event matching the current filters'
              : 'Switch the status filter to "Pending Review" to bulk-approve'
          }
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
        >
          <CheckCheck className="w-4 h-4" />
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

      {/* Filter bar — Approve All is scoped to whatever matches these filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Season</label>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
          >
            <option value="all">All Seasons</option>
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Month</label>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(Number(e.target.value))}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
          >
            <option value={0}>All Months</option>
            {MONTHS.map((month, idx) => (
              <option key={month} value={idx + 1}>
                {month}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Year</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
          >
            <option value={0}>All Years</option>
            {[2023, 2024, 2025, 2026].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Reason</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="Search review reasons..."
              value={reasonQuery}
              onChange={(e) => setReasonQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all placeholder:text-gray-300"
            />
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Date</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">
                Celebration
              </th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Season</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest">Rank</th>
              <th className="pb-3.5 pr-4 font-bold text-gray-400 text-[10px] uppercase tracking-widest w-1/4">
                Reason
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
                  <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin mx-auto" />
                </td>
              </tr>
            ) : records.length > 0 ? (
              records.map((record) => {
                const badge = STATUS_BADGES[record.review_status];
                const isBusy = busyId === record.id;
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
                    <td className="py-4 pr-4">
                      <p className="text-xs text-gray-500 font-medium line-clamp-2" title={record.review_notes || ''}>
                        {record.review_notes || '—'}
                      </p>
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
                            {record.review_status !== 'approved' && record.review_status !== 'approved_with_revisions' && (
                              <button
                                onClick={() => handleApprove(record)}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title={record.review_status === 'rejected' ? 'Approve (restore rejected event)' : 'Approve'}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(record)}
                              className="p-2 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"
                              title="Edit date or name, then approve"
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
          {total} record{total === 1 ? '' : 's'} • Page {page} of {totalPages}
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

      {/* Edit & Approve modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 p-10 w-full max-w-lg">
            <h4 className="text-xl font-bold text-gray-900 mb-2">Edit &amp; Approve</h4>
            <p className="text-sm text-gray-500 font-medium mb-8">
              Correct the date or celebration name. The record will be approved with your revisions and the original
              values kept for audit.
            </p>
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
                  Celebration Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all"
                />
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
                Approve with Revisions
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
              Rejecting &quot;{rejectTarget.celebration_name}&quot; ({formatDisplayDate(rejectTarget.date)}). The
              record is kept for audit but hidden from the pending queue. A reason is required.
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

      {/* Approve All confirmation */}
      {showApproveAll && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 p-10 w-full max-w-lg">
            <h4 className="text-xl font-bold text-gray-900 mb-2">Approve All Pending Events</h4>
            <p className="text-sm text-gray-500 font-medium mb-8">
              This will approve all <span className="font-bold text-gray-900">{total}</span> pending event
              {total === 1 ? '' : 's'} matching the current filters — use it for events already verified by the
              cross-validation pipeline that only need a final human double-check. This cannot be undone in bulk.
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
