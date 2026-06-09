'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle, Clock, Download, Eye, X, Mail, Phone, UploadCloud } from 'lucide-react';
import { motion } from 'motion/react';

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

export function SubmissionTracker({
  submissions,
  onViewDetails,
  onExportReport,
  showBudgetInfo = true,
  showExportButton = true,
}: SubmissionTrackerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'on-time' | 'warning' | 'action-required' | 'not-submitted'>(
    'all',
  );
  const [filterType, setFilterType] = useState<'all' | 'parish' | 'school' | 'seminary'>('all');
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
    let filtered = submissions.filter((sub) => {
      const matchesSearch =
        sub.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.district?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.vicariate?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'all' || sub.status === filterStatus;
      const matchesType = filterType === 'all' || sub.entityType === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });

    // Sort
    if (sortBy === 'entity') {
      filtered.sort((a, b) => a.entityName.localeCompare(b.entityName));
    } else if (sortBy === 'status') {
      const statusOrder = { 'action-required': 0, warning: 1, 'not-submitted': 2, 'on-time': 3 };
      filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => {
        const dateA = a.lastSubmissionDate ? new Date(a.lastSubmissionDate).getTime() : 0;
        const dateB = b.lastSubmissionDate ? new Date(b.lastSubmissionDate).getTime() : 0;
        return dateB - dateA;
      });
    }

    return filtered;
  }, [submissions, searchQuery, filterStatus, filterType, sortBy]);

  const getStatusBadge = (status: string, monthsLate: number) => {
    switch (status) {
      case 'on-time':
        return { badge: '🟢 On Time', color: 'bg-green-50 border-green-200 text-green-700', icon: CheckCircle };
      case 'warning':
        return {
          badge: `🟠 Warning (${monthsLate} months late)`,
          color: 'bg-amber-50 border-amber-200 text-amber-700',
          icon: AlertTriangle,
        };
      case 'action-required':
        return {
          badge: `🔴 Action Required (${monthsLate} months late)`,
          color: 'bg-red-50 border-red-200 text-red-700',
          icon: AlertTriangle,
        };
      case 'not-submitted':
        return { badge: '🔴 Not Submitted', color: 'bg-red-50 border-red-200 text-red-700', icon: Clock };
      default:
        return { badge: 'Unknown', color: 'bg-gray-50 border-gray-200 text-gray-700', icon: Clock };
    }
  };

  const stats = useMemo(() => {
    return {
      total: submissions.length,
      onTime: submissions.filter((s) => s.status === 'on-time').length,
      warning: submissions.filter((s) => s.status === 'warning').length,
      actionRequired: submissions.filter((s) => s.status === 'action-required').length,
      notSubmitted: submissions.filter((s) => s.status === 'not-submitted').length,
      budgetsSet: submissions.filter((s) => s.budgetSet).length,
    };
  }, [submissions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stats Cards */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 lg:gap-4 ${
          showBudgetInfo && showExportButton ? 'lg:grid-cols-6' : 'lg:grid-cols-4'
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-gray-600 font-bold uppercase mb-2 leading-tight">Total Entities</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-green-50 border border-green-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-green-700 font-bold uppercase mb-2 leading-tight">On Time</p>
          <p className="text-xl md:text-2xl font-bold text-green-700">{stats.onTime}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-amber-700 font-bold uppercase mb-2 leading-tight">Warning</p>
          <p className="text-xl md:text-2xl font-bold text-amber-700">{stats.warning}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-red-50 border border-red-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-red-700 font-bold uppercase mb-2 leading-tight">Action Req.</p>
          <p className="text-xl md:text-2xl font-bold text-red-700">{stats.actionRequired + stats.notSubmitted}</p>
        </motion.div>

        {showBudgetInfo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4"
          >
            <p className="text-[9px] md:text-xs text-blue-700 font-bold uppercase mb-2 leading-tight">Budgets Set</p>
            <p className="text-xl md:text-2xl font-bold text-blue-700">{stats.budgetsSet}</p>
          </motion.div>
        )}

        {showExportButton && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: showBudgetInfo ? 0.5 : 0.4 }}
            className="col-span-2 sm:col-span-1"
          >
            <button
              onClick={onExportReport}
              className="w-full h-full flex items-center justify-center bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-lg transition-colors p-3 md:p-4 hover:scale-105"
              title="Export Report"
            >
              <Download className="w-4 md:w-5 h-4 md:h-5" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 md:px-4 py-2 md:py-2.5">
          <Search className="w-4 md:w-5 h-4 md:h-5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search entity, district..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 outline-none text-sm md:text-base placeholder:text-gray-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="on-time">🟢 On Time</option>
              <option value="warning">🟠 Warning</option>
              <option value="action-required">🔴 Action Required</option>
              <option value="not-submitted">🔴 Not Submitted</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
            >
              <option value="all">All Types</option>
              <option value="parish">Parish</option>
              <option value="school">School</option>
              <option value="seminary">Seminary</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
            >
              <option value="status">Status (Priority)</option>
              <option value="entity">Entity Name</option>
              <option value="date">Last Submitted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-base hover:shadow-md transition-shadow"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] md:text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-2 md:px-4 py-3 text-left font-bold text-gray-700">Entity</th>
                <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">Type</th>
                <th className="hidden md:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">Location</th>
                <th className="px-2 md:px-4 py-3 text-left font-bold text-gray-700">Status</th>
                <th className="hidden lg:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">
                  Last Submitted
                </th>
                {showBudgetInfo && (
                  <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">Budget</th>
                )}
                <th className="px-2 md:px-4 py-3 text-center font-bold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((submission, index) => {
                const statusInfo = getStatusBadge(submission.status, submission.monthsLate);
                const Icon = statusInfo.icon;
                return (
                  <motion.tr
                    key={submission.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-2 md:px-4 py-3 font-bold text-gray-900 text-[11px] md:text-sm">
                      {submission.entityName}
                    </td>
                    <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-gray-600">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] md:text-xs font-bold">
                        {submission.entityType.charAt(0).toUpperCase()}
                        {submission.entityType.slice(1)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      <div>
                        {submission.district && <p className="font-medium">{submission.district}</p>}
                        {submission.vicariate && <p className="text-gray-500 text-[10px]">{submission.vicariate}</p>}
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-3">
                      <div
                        className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1 rounded text-[10px] md:text-xs font-bold border ${statusInfo.color}`}
                      >
                        <Icon className="w-3 md:w-4 h-3 md:h-4 shrink-0" />
                        <span className="truncate">{statusInfo.badge}</span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      {submission.lastSubmissionDate
                        ? new Date(submission.lastSubmissionDate).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    {showBudgetInfo && (
                    <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      {submission.budgetSet ? (
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] md:text-xs font-bold truncate">
                          ₱{(submission.budgetAmount || 0 / 1000).toFixed(0)}K
                        </span>
                      ) : (
                        <span className="text-[10px] md:text-xs text-gray-500">Not set</span>
                      )}
                    </td>
                    )}
                    <td className="px-2 md:px-4 py-3 text-center">
                      <button
                        onClick={() => openDetails(submission)}
                        className="inline-flex items-center gap-1 bg-gold-500 hover:bg-gold-600 text-black font-bold py-1 md:py-1.5 px-2 md:px-3 rounded text-[10px] md:text-xs transition-colors hover:scale-105"
                        title="View Details"
                      >
                        <Eye className="w-3 md:w-4 h-3 md:h-4" />
                        <span className="hidden md:inline">View</span>
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSubmissions.length === 0 && (
          <div className="flex items-center justify-center py-8 md:py-12 text-gray-500 px-4">
            <p className="text-sm md:text-base text-center">No submissions found matching your criteria.</p>
          </div>
        )}
      </motion.div>

      {selectedSubmission && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSubmission(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-600">
                  Submission Details
                </p>
                <h3 className="mt-1 text-2xl font-black text-gray-900">{selectedSubmission.entityName}</h3>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {selectedSubmission.entityType.charAt(0).toUpperCase()}
                  {selectedSubmission.entityType.slice(1)}
                  {selectedSubmission.district ? ` · ${selectedSubmission.district}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <Phone className="h-4 w-4" />
                    Contact Number
                  </div>
                  <p className="mt-2 text-sm font-bold text-gray-900">
                    {selectedSubmission.contactNumber || 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </div>
                  <p className="mt-2 break-all text-sm font-bold text-gray-900">
                    {selectedSubmission.email || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-gold-200 bg-gold-50/40 p-5">
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-900">
                  Submit Documents on Their Behalf
                </h4>
                <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-gray-600">Submission Date</label>
                    <input
                      type="date"
                      value={behalfDate}
                      onChange={(event) => setBehalfDate(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-gray-600">Document File</label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gold-400 hover:bg-gold-50">
                      <span className="truncate text-gray-600">{behalfFile ? behalfFile.name : 'Choose file to submit'}</span>
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
                    className="rounded-lg bg-gold-500 px-5 py-2 text-sm font-black text-black transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
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
