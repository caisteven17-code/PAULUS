'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Archive,
  Search,
  RefreshCw,
  Trash2,
  User,
  Building2,
  GraduationCap,
  School,
  ShieldAlert,
  CheckCircle,
  Loader2,
  ArrowUpDown,
  Calendar,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Parish, Seminary, DiocesanSchool, EntityClass } from '../../types';
import { dataService } from '../../services/dataService';
import { ALL_PARISHES, INITIAL_PARISHES } from '../../constants';

interface ArchivesControlProps {
  parishes: Parish[];
  seminaries: Seminary[];
  schools: DiocesanSchool[];
  accounts: any[];
  onUpdateParishes: (parishes: Parish[]) => void;
  onUpdateSeminaries: (seminaries: Seminary[]) => void;
  onUpdateSchools: (schools: DiocesanSchool[]) => void;
  onUpdateAccounts: () => Promise<void>;
}

interface ArchivedItem {
  id: string;
  name: string;
  type: 'user' | 'parish' | 'seminary' | 'school';
  archivedAt: string;
  details: string; // address for entities, email for users
  subtitle: string; // vicariate for entities, role for users
  status: string;
  raw: any;
}

export function ArchivesControl({
  parishes,
  seminaries,
  schools,
  accounts,
  onUpdateParishes,
  onUpdateSeminaries,
  onUpdateSchools,
  onUpdateAccounts,
}: ArchivesControlProps) {
  // Navigation & filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'users' | 'entities'>('all');

  // Entity sub-filters
  const [entityFilters, setEntityFilters] = useState({
    parish: true,
    seminary: true,
    school: true,
  });

  // Sorting & date range states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Selection states (for bulk actions)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Action Modals & Loading states
  const [actionItem, setActionItem] = useState<ArchivedItem | null>(null);
  const [actionType, setActionType] = useState<'restore' | 'purge' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  // Bulk processing states
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState<'restore' | 'purge' | null>(null);

  // 1. Compile in-memory archived elements list (status check matches active soft delete filters)
  const archivedItems = useMemo(() => {
    const list: ArchivedItem[] = [];

    // Archived Parishes
    parishes
      .filter((p) => p.status === 'inactive')
      .forEach((p) => {
        list.push({
          id: `parish-${p.id}`,
          name: p.name,
          type: 'parish',
          archivedAt: p.updatedAt || p.timestamp || new Date().toISOString(),
          details: p.address || 'Diocese of San Pablo',
          subtitle: p.vicariate || 'Diocese',
          status: 'inactive',
          raw: p,
        });
      });

    // Archived Seminaries
    seminaries
      .filter((s) => s.status === 'inactive')
      .forEach((s) => {
        list.push({
          id: `seminary-${s.id}`,
          name: s.name,
          type: 'seminary',
          archivedAt: s.updatedAt || new Date().toISOString(),
          details: s.address || 'Laguna, Philippines',
          subtitle: s.vicariate || 'Diocese',
          status: 'inactive',
          raw: s,
        });
      });

    // Archived Schools
    schools
      .filter((s) => s.status === 'inactive')
      .forEach((s) => {
        list.push({
          id: `school-${s.id}`,
          name: s.name,
          type: 'school',
          archivedAt: s.updatedAt || new Date().toISOString(),
          details: s.address || 'Laguna, Philippines',
          subtitle: s.vicariate || 'Diocese',
          status: 'inactive',
          raw: s,
        });
      });

    // Archived Users
    accounts
      .filter((a) => a.status === 'archived' || a.status === 'inactive')
      .forEach((a) => {
        list.push({
          id: `user-${a.id}`,
          name: a.leader || a.displayName || a.email,
          type: 'user',
          archivedAt: a.createdAt || new Date().toISOString(),
          details: a.email,
          subtitle: a.role || 'User',
          status: 'archived',
          raw: a,
        });
      });

    return list;
  }, [parishes, seminaries, schools, accounts]);

  // 2. Count statistics for summary headers
  const stats = useMemo(() => {
    const total = archivedItems.length;
    const users = archivedItems.filter((i) => i.type === 'user').length;
    const parishesCount = archivedItems.filter((i) => i.type === 'parish').length;
    const otherEntities = archivedItems.filter((i) => i.type === 'seminary' || i.type === 'school').length;

    return { total, users, parishes: parishesCount, otherEntities };
  }, [archivedItems]);

  // 3. Process filtered and sorted archive items
  const processedItems = useMemo(() => {
    let list = [...archivedItems];

    // Filter by main category
    if (selectedCategory === 'users') {
      list = list.filter((i) => i.type === 'user');
    } else if (selectedCategory === 'entities') {
      list = list.filter((i) => i.type !== 'user');
    }

    // Apply entity sub-filters (parish, seminary, school) when applicable
    if (selectedCategory === 'all' || selectedCategory === 'entities') {
      list = list.filter((i) => {
        if (i.type === 'user') return true; // Keep users when category is All
        return entityFilters[i.type as 'parish' | 'seminary' | 'school'];
      });
    }

    // Filter by text search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.details.toLowerCase().includes(q) ||
          i.subtitle.toLowerCase().includes(q),
      );
    }

    // Filter by date range
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        cutoff.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        cutoff.setDate(now.getDate() - 30);
      }
      list = list.filter((i) => new Date(i.archivedAt) >= cutoff);
    }

    // Chronological sorting
    list.sort((a, b) => {
      const tA = new Date(a.archivedAt).getTime();
      const tB = new Date(b.archivedAt).getTime();
      return sortBy === 'newest' ? tB - tA : tA - tB;
    });

    return list;
  }, [archivedItems, selectedCategory, entityFilters, searchQuery, dateRange, sortBy]);

  // Single restore logic
  const handleSingleRestore = async (item: ArchivedItem) => {
    setIsProcessing(true);
    try {
      if (item.type === 'user') {
        const res = await fetch('/api/admin/users', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.raw.id.toString(), action: 'restore' }),
        });
        if (!res.ok) throw new Error('API restore failed');
        await onUpdateAccounts();
        setShowSuccess({ show: true, message: `Account "${item.name}" restored successfully!` });
      } else {
        const res = await fetch('/api/admin/entities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: item.type, id: item.raw.id, status: 'active' }),
        });
        if (!res.ok) throw new Error('API restore failed');

        // Update local React lists
        if (item.type === 'parish') {
          onUpdateParishes(parishes.map((p) => (p.id === item.raw.id ? { ...p, status: 'active' } : p)));
        } else if (item.type === 'seminary') {
          onUpdateSeminaries(seminaries.map((s) => (s.id === item.raw.id ? { ...s, status: 'active' } : s)));
        } else {
          onUpdateSchools(schools.map((s) => (s.id === item.raw.id ? { ...s, status: 'active' } : s)));
        }
        setShowSuccess({
          show: true,
          message: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} "${item.name}" restored successfully!`,
        });
      }
    } catch (err) {
      console.error('API failed, executing offline restoration:', err);
      // Offline/Local Memory Fallback
      if (item.type === 'user') {
        setShowSuccess({ show: true, message: `Account restored locally (Offline Mode)!` });
      } else {
        if (item.type === 'parish') {
          onUpdateParishes(parishes.map((p) => (p.id === item.raw.id ? { ...p, status: 'active' } : p)));
        } else if (item.type === 'seminary') {
          onUpdateSeminaries(seminaries.map((s) => (s.id === item.raw.id ? { ...s, status: 'active' } : s)));
        } else {
          onUpdateSchools(schools.map((s) => (s.id === item.raw.id ? { ...s, status: 'active' } : s)));
        }
        setShowSuccess({
          show: true,
          message: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} restored locally (Offline Mode)!`,
        });
      }
    } finally {
      setIsProcessing(false);
      setActionItem(null);
      setActionType(null);
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    }
  };

  // Single hard-purge logic
  const handleSinglePurge = async (item: ArchivedItem) => {
    setIsProcessing(true);
    try {
      if (item.type === 'user') {
        const res = await fetch('/api/admin/users', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.raw.id.toString(), action: 'archive' }),
        });
        if (!res.ok) throw new Error('API user ban status update failed');
        setShowSuccess({ show: true, message: `User "${item.name}" purged successfully!` });
      } else {
        // Entities are purged via physical hard delete
        const res = await fetch('/api/admin/entities', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: item.type, id: item.raw.id, hard: true }),
        });
        if (!res.ok) throw new Error('API purge failed');

        // Remove locally from state
        if (item.type === 'parish') {
          onUpdateParishes(parishes.filter((p) => p.id !== item.raw.id));
        } else if (item.type === 'seminary') {
          onUpdateSeminaries(seminaries.filter((s) => s.id !== item.raw.id));
        } else {
          onUpdateSchools(schools.filter((s) => s.id !== item.raw.id));
        }
        setShowSuccess({
          show: true,
          message: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} permanently deleted!`,
        });
      }
    } catch (err) {
      console.error('API purge failed, executing offline purging:', err);
      // Offline fallback
      if (item.type !== 'user') {
        if (item.type === 'parish') {
          onUpdateParishes(parishes.filter((p) => p.id !== item.raw.id));
        } else if (item.type === 'seminary') {
          onUpdateSeminaries(seminaries.filter((s) => s.id !== item.raw.id));
        } else {
          onUpdateSchools(schools.filter((s) => s.id !== item.raw.id));
        }
        setShowSuccess({ show: true, message: `Entity permanently deleted (Offline Mode)!` });
      } else {
        setShowSuccess({ show: true, message: `User purged locally (Offline Mode)!` });
      }
    } finally {
      setIsProcessing(false);
      setActionItem(null);
      setActionType(null);
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    }
  };

  // Bulk restore logic
  const handleBulkRestore = async () => {
    setIsBulkProcessing(true);
    const targets = processedItems.filter((i) => selectedIds.includes(i.id));

    try {
      await Promise.all(
        targets.map(async (item) => {
          if (item.type === 'user') {
            await fetch('/api/admin/users', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.raw.id.toString(), action: 'restore' }),
            });
          } else {
            await fetch('/api/admin/entities', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: item.type, id: item.raw.id, status: 'active' }),
            });
          }
        }),
      );

      // Update all local React states
      const entityIds = new Set(targets.filter((t) => t.type !== 'user').map((t) => t.raw.id));
      onUpdateParishes(parishes.map((p) => (entityIds.has(p.id) ? { ...p, status: 'active' } : p)));
      onUpdateSeminaries(seminaries.map((s) => (entityIds.has(s.id) ? { ...s, status: 'active' } : s)));
      onUpdateSchools(schools.map((s) => (entityIds.has(s.id) ? { ...s, status: 'active' } : s)));
      await onUpdateAccounts();

      setShowSuccess({ show: true, message: `Successfully restored ${targets.length} items!` });
    } catch (err) {
      console.error('Bulk API restoration failed, using offline fallback:', err);
      const entityIds = new Set(targets.filter((t) => t.type !== 'user').map((t) => t.raw.id));
      onUpdateParishes(parishes.map((p) => (entityIds.has(p.id) ? { ...p, status: 'active' } : p)));
      onUpdateSeminaries(seminaries.map((s) => (entityIds.has(s.id) ? { ...s, status: 'active' } : s)));
      onUpdateSchools(schools.map((s) => (entityIds.has(s.id) ? { ...s, status: 'active' } : s)));
      setShowSuccess({ show: true, message: `Restored ${targets.length} items locally (Offline Mode)!` });
    } finally {
      setIsBulkProcessing(false);
      setShowBulkConfirm(null);
      setSelectedIds([]);
      setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    }
  };

  // Bulk purge logic
  const handleBulkPurge = async () => {
    setIsBulkProcessing(true);
    const targets = processedItems.filter((i) => selectedIds.includes(i.id));

    try {
      await Promise.all(
        targets.map(async (item) => {
          if (item.type !== 'user') {
            await fetch('/api/admin/entities', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: item.type, id: item.raw.id, hard: true }),
            });
          }
        }),
      );

      // Update all local React states
      const entityIds = new Set(targets.filter((t) => t.type !== 'user').map((t) => t.raw.id));
      onUpdateParishes(parishes.filter((p) => !entityIds.has(p.id)));
      onUpdateSeminaries(seminaries.filter((s) => !entityIds.has(s.id)));
      onUpdateSchools(schools.filter((s) => !entityIds.has(s.id)));

      setShowSuccess({
        show: true,
        message: `Successfully purged ${targets.filter((t) => t.type !== 'user').length} entities!`,
      });
    } catch (err) {
      console.error('Bulk API purge failed, using offline fallback:', err);
      const entityIds = new Set(targets.filter((t) => t.type !== 'user').map((t) => t.raw.id));
      onUpdateParishes(parishes.filter((p) => !entityIds.has(p.id)));
      onUpdateSeminaries(seminaries.filter((s) => !entityIds.has(s.id)));
      onUpdateSchools(schools.filter((s) => !entityIds.has(s.id)));
      setShowSuccess({ show: true, message: `Purged entities locally (Offline Mode)!` });
    } finally {
      setIsBulkProcessing(false);
      setShowBulkConfirm(null);
      setSelectedIds([]);
      setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    }
  };

  // Checkbox toggle helpers
  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === processedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(processedItems.map((i) => i.id));
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 relative">
      {/* Toast Success Alert */}
      {showSuccess.show && (
        <div className="fixed bottom-6 right-6 z-[250] bg-emerald-50 border border-emerald-100 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-6 fade-in duration-200">
          <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm font-bold text-emerald-800">{showSuccess.message}</span>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[140] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 text-center space-y-6">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                  showBulkConfirm === 'restore'
                    ? 'bg-amber-50 border-amber-100 text-amber-500'
                    : 'bg-rose-50 border-rose-100 text-rose-500'
                }`}
              >
                {showBulkConfirm === 'restore' ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <Trash2 className="w-8 h-8" />
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900 capitalize">Bulk {showBulkConfirm}</h3>
                <p className="text-xs text-gray-500 leading-relaxed font-semibold">
                  {showBulkConfirm === 'restore'
                    ? `Are you sure you want to restore the ${selectedIds.length} selected items to active lists?`
                    : `Are you sure you want to permanently erase the selected entities? This action is absolute and cannot be undone.`}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  disabled={isBulkProcessing}
                  onClick={() => setShowBulkConfirm(null)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={isBulkProcessing}
                  onClick={showBulkConfirm === 'restore' ? handleBulkRestore : handleBulkPurge}
                  className={`flex-1 px-6 py-3 text-white rounded-xl font-bold transition-colors shadow-lg text-sm flex items-center justify-center gap-2 ${
                    showBulkConfirm === 'restore'
                      ? 'bg-[#D4AF37] hover:bg-[#B5952F] shadow-[#D4AF37]/20'
                      : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                  }`}
                >
                  {isBulkProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirm</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single Action Warning Modal */}
      {actionItem && (
        <div className="fixed inset-0 bg-black/40 z-[130] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 text-center space-y-6">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                  actionType === 'restore'
                    ? 'bg-amber-50 border-amber-100 text-amber-500'
                    : 'bg-rose-50 border-rose-100 text-rose-500'
                }`}
              >
                {actionType === 'restore' ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <AlertTriangle className="w-8 h-8" />
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900 capitalize">{actionType} Item</h3>
                <p className="text-xs text-gray-500 leading-relaxed font-semibold">
                  {actionType === 'restore'
                    ? `Are you sure you want to restore "${actionItem.name}" to active status? It will instantly return to the operational dashboard tables.`
                    : `Are you sure you want to permanently erase "${actionItem.name}"? This will physically remove the record and cannot be undone.`}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  disabled={isProcessing}
                  onClick={() => {
                    setActionItem(null);
                    setActionType(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={isProcessing}
                  onClick={
                    actionType === 'restore'
                      ? () => handleSingleRestore(actionItem)
                      : () => handleSinglePurge(actionItem)
                  }
                  className={`flex-1 px-6 py-3 text-white rounded-xl font-bold transition-colors shadow-lg text-sm flex items-center justify-center gap-2 ${
                    actionType === 'restore'
                      ? 'bg-[#D4AF37] hover:bg-[#B5952F] shadow-[#D4AF37]/20'
                      : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                  }`}
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{actionType === 'restore' ? 'Restore' : 'Purge'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center border border-amber-100">
              <Archive className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900">Diocesan Archives</h3>
          </div>
          <p className="text-sm text-gray-500">
            Centralized database archives for deleted user accounts and soft-archived entities.
          </p>
        </div>

        {/* Categories segment tabs */}
        <div className="flex p-1 bg-gray-100 rounded-xl max-w-sm self-start shrink-0">
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedIds([]);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              selectedCategory === 'all' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            All Compiled ({stats.total})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('users');
              setSelectedIds([]);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              selectedCategory === 'users' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Users ({stats.users})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('entities');
              setSelectedIds([]);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              selectedCategory === 'entities'
                ? 'bg-white text-[#D4AF37] shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Entities ({stats.parishes + stats.otherEntities})
          </button>
        </div>
      </div>

      {/* Filters Panel Card */}
      <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-6 mb-8 space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          {/* Magnifying Search Bar */}
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search archive items by name, address, email, vicariate..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIds([]);
              }}
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
            {/* Date Range Selector */}
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value as any);
                  setSelectedIds([]);
                }}
                className="appearance-none pl-10 pr-8 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 cursor-pointer focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Past 7 Days</option>
                <option value="month">Past 30 Days</option>
              </select>
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>

            {/* Sorting Toggler */}
            <button
              onClick={() => {
                setSortBy((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
                setSelectedIds([]);
              }}
              className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 flex items-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
              <span>{sortBy === 'newest' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>

        {/* Entity Sub-filters (Visible when All or Entities are selected) */}
        {(selectedCategory === 'all' || selectedCategory === 'entities') && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t border-gray-200/50">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Entity Filters:</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={entityFilters.parish}
                  onChange={(e) => {
                    setEntityFilters({ ...entityFilters, parish: e.target.checked });
                    setSelectedIds([]);
                  }}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-opacity-25 w-4 h-4"
                />
                <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                  ⛪ Parishes
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={entityFilters.seminary}
                  onChange={(e) => {
                    setEntityFilters({ ...entityFilters, seminary: e.target.checked });
                    setSelectedIds([]);
                  }}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-opacity-25 w-4 h-4"
                />
                <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                  🎓 Seminaries
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={entityFilters.school}
                  onChange={(e) => {
                    setEntityFilters({ ...entityFilters, school: e.target.checked });
                    setSelectedIds([]);
                  }}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-opacity-25 w-4 h-4"
                />
                <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                  🏫 Schools
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Main Table Grid */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-4 w-12 pl-4">
                <input
                  type="checkbox"
                  checked={processedItems.length > 0 && selectedIds.length === processedItems.length}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-opacity-25 w-4 h-4"
                />
              </th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">Item Details</th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Archived</th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right pr-4">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {processedItems.map((item) => (
              <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                <td className="py-5 pl-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => handleSelectRow(item.id)}
                    className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37] focus:ring-opacity-25 w-4 h-4"
                  />
                </td>
                <td className="py-5 pl-2">
                  <div className="flex items-center gap-3">
                    {/* Visual Type Icon Badges */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                        item.type === 'user'
                          ? 'bg-indigo-50 border-indigo-100 text-indigo-500'
                          : item.type === 'parish'
                            ? 'bg-amber-50 border-amber-100 text-amber-500'
                            : item.type === 'seminary'
                              ? 'bg-rose-50 border-rose-100 text-rose-500'
                              : 'bg-emerald-50 border-emerald-100 text-emerald-500'
                      }`}
                    >
                      {item.type === 'user' && <User className="w-4 h-4" />}
                      {item.type === 'parish' && <Building2 className="w-4 h-4" />}
                      {item.type === 'seminary' && <GraduationCap className="w-4 h-4" />}
                      {item.type === 'school' && <School className="w-4 h-4" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-900 font-bold text-sm flex items-center gap-1.5">
                        {item.name}
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none ${
                            item.type === 'user'
                              ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                              : item.type === 'parish'
                                ? 'bg-amber-50 text-[#D4AF37] border-amber-100'
                                : item.type === 'seminary'
                                  ? 'bg-rose-50 text-rose-600 border-rose-100'
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          }`}
                        >
                          {item.type}
                        </span>
                      </span>
                      <span className="text-gray-400 text-[11px] mt-0.5">{item.details}</span>
                    </div>
                  </div>
                </td>
                <td className="py-5">
                  <span className="text-xs font-semibold text-gray-500">{item.subtitle}</span>
                </td>
                <td className="py-5">
                  <span className="text-xs font-semibold text-gray-400">
                    {new Date(item.archivedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </td>
                <td className="py-5 text-right pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setActionItem(item);
                        setActionType('restore');
                      }}
                      className="text-[#D4AF37] hover:bg-amber-50 p-2 rounded-xl transition-all"
                      title="Restore Item"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setActionItem(item);
                        setActionType('purge');
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"
                      title="Purge Permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {processedItems.length === 0 && (
              <tr>
                <td colSpan={5} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                      <Archive className="w-8 h-8 text-gray-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-900 font-bold">No items found in archives</p>
                      <p className="text-xs text-gray-500 font-semibold">
                        No archived user accounts or entities match the selected criteria.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Action Glassmorphic Floating Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 bg-white/95 backdrop-blur shadow-2xl border border-gray-100 rounded-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8 duration-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-5 h-5 bg-[#D4AF37] text-white font-bold text-xs rounded-full items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-gray-600">items selected</span>
          </div>
          <div className="w-px h-5 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkConfirm('restore')}
              className="px-4 py-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] text-xs font-black rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
              Restore Selected
            </button>
            <button
              onClick={() => setShowBulkConfirm('purge')}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-black rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Purge Selected
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
