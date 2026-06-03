'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle, Clock, Download, Eye } from 'lucide-react';
import { motion } from 'motion/react';

interface SubmissionRecord {
  id: string;
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  district?: string;
  vicariate?: string;
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
}

export function SubmissionTracker({ submissions, onViewDetails, onExportReport }: SubmissionTrackerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'on-time' | 'warning' | 'action-required' | 'not-submitted'>('all');
  const [filterType, setFilterType] = useState<'all' | 'parish' | 'school' | 'seminary'>('all');
  const [sortBy, setSortBy] = useState<'entity' | 'status' | 'date'>('status');

  const filteredSubmissions = useMemo(() => {
    let filtered = submissions.filter(sub => {
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
      const statusOrder = { 'action-required': 0, 'warning': 1, 'not-submitted': 2, 'on-time': 3 };
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
        return { badge: `🟠 Warning (${monthsLate} months late)`, color: 'bg-amber-50 border-amber-200 text-amber-700', icon: AlertTriangle };
      case 'action-required':
        return { badge: `🔴 Action Required (${monthsLate} months late)`, color: 'bg-red-50 border-red-200 text-red-700', icon: AlertTriangle };
      case 'not-submitted':
        return { badge: '🔴 Not Submitted', color: 'bg-red-50 border-red-200 text-red-700', icon: Clock };
      default:
        return { badge: 'Unknown', color: 'bg-gray-50 border-gray-200 text-gray-700', icon: Clock };
    }
  };

  const stats = useMemo(() => {
    return {
      total: submissions.length,
      onTime: submissions.filter(s => s.status === 'on-time').length,
      warning: submissions.filter(s => s.status === 'warning').length,
      actionRequired: submissions.filter(s => s.status === 'action-required').length,
      notSubmitted: submissions.filter(s => s.status === 'not-submitted').length,
      budgetsSet: submissions.filter(s => s.budgetSet).length,
    };
  }, [submissions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 lg:gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-gray-200 rounded-lg p-3 md:p-4">
          <p className="text-[9px] md:text-xs text-gray-600 font-bold uppercase mb-2 leading-tight">Total Entities</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-green-50 border border-green-200 rounded-lg p-3 md:p-4">
          <p className="text-[9px] md:text-xs text-green-700 font-bold uppercase mb-2 leading-tight">On Time</p>
          <p className="text-xl md:text-2xl font-bold text-green-700">{stats.onTime}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4">
          <p className="text-[9px] md:text-xs text-amber-700 font-bold uppercase mb-2 leading-tight">Warning</p>
          <p className="text-xl md:text-2xl font-bold text-amber-700">{stats.warning}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-red-50 border border-red-200 rounded-lg p-3 md:p-4">
          <p className="text-[9px] md:text-xs text-red-700 font-bold uppercase mb-2 leading-tight">Action Req.</p>
          <p className="text-xl md:text-2xl font-bold text-red-700">{stats.actionRequired + stats.notSubmitted}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4">
          <p className="text-[9px] md:text-xs text-blue-700 font-bold uppercase mb-2 leading-tight">Budgets Set</p>
          <p className="text-xl md:text-2xl font-bold text-blue-700">{stats.budgetsSet}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="col-span-2 sm:col-span-1">
          <button
            onClick={onExportReport}
            className="w-full h-full flex items-center justify-center bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-lg transition-colors p-3 md:p-4 hover:scale-105"
            title="Export Report"
          >
            <Download className="w-4 md:w-5 h-4 md:h-5" />
          </button>
        </motion.div>
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
                <th className="hidden lg:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">Last Submitted</th>
                <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-left font-bold text-gray-700">Budget</th>
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
                    <td className="px-2 md:px-4 py-3 font-bold text-gray-900 text-[11px] md:text-sm">{submission.entityName}</td>
                    <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-gray-600">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] md:text-xs font-bold">
                        {submission.entityType.charAt(0).toUpperCase()}{submission.entityType.slice(1)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      <div>
                        {submission.district && <p className="font-medium">{submission.district}</p>}
                        {submission.vicariate && <p className="text-gray-500 text-[10px]">{submission.vicariate}</p>}
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-3">
                      <div className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1 rounded text-[10px] md:text-xs font-bold border ${statusInfo.color}`}>
                        <Icon className="w-3 md:w-4 h-3 md:h-4 shrink-0" />
                        <span className="truncate">{statusInfo.badge}</span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      {submission.lastSubmissionDate
                        ? new Date(submission.lastSubmissionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-gray-600 text-[11px] md:text-sm">
                      {submission.budgetSet ? (
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] md:text-xs font-bold truncate">
                          ₱{(submission.budgetAmount || 0 / 1000).toFixed(0)}K
                        </span>
                      ) : (
                        <span className="text-[10px] md:text-xs text-gray-500">Not set</span>
                      )}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-center">
                      <button
                        onClick={() => onViewDetails?.(submission)}
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
    </div>
  );
}
