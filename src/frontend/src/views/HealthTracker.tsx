'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Plus, Trash2, Edit2, X, Calendar, Users, Cake, Stethoscope, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';

interface PriestRecord {
  id: string;
  name: string;
  position: string;
  parish: string;
  birthDate: string;
  age: number;
  lastCheckup: string;
  healthStatus: 'good' | 'fair' | 'needs-attention';
  notes: string;
  email: string;
  phone: string;
}

const HEALTH_STATUS_COLORS = {
  good: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  fair: 'bg-amber-500/10 text-amber-700 border-amber-200',
  'needs-attention': 'bg-rose-500/10 text-rose-700 border-rose-200',
};

const HEALTH_STATUS_ICONS = {
  good: '✓',
  fair: '⚠',
  'needs-attention': '!',
};

export function HealthTracker() {
  const { user } = useAuth();
  const [priests, setPriests] = useState<PriestRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPriest, setSelectedPriest] = useState<PriestRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'birthdays' | 'checkups'>('all');
  const [search, setSearch] = useState('');
  const [apiHealthScore, setApiHealthScore] = useState<number | null>(null);
  const [healthScoreLoading, setHealthScoreLoading] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    position: string;
    parish: string;
    birthDate: string;
    lastCheckup: string;
    healthStatus: 'good' | 'fair' | 'needs-attention';
    notes: string;
    email: string;
    phone: string;
  }>({
    name: '',
    position: '',
    parish: '',
    birthDate: '',
    lastCheckup: '',
    healthStatus: 'good',
    notes: '',
    email: '',
    phone: '',
  });

  // Fetch records from DB on mount; fall back to localStorage cache
  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    apiClient.getHealthRecords().then((data) => {
      if (!cancelled) {
        setPriests(data ?? []);
        localStorage.setItem('priest_health_records', JSON.stringify(data ?? []));
      }
    }).catch(() => {
      if (!cancelled) {
        const cached = localStorage.getItem('priest_health_records');
        if (cached) setPriests(JSON.parse(cached));
      }
    }).finally(() => {
      if (!cancelled) setRecordsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch health score from the backend on mount
  useEffect(() => {
    let cancelled = false;
    const entityId = (user as any)?.entityId ?? (user as any)?.parish ?? '';
    const entityType = (user as any)?.entityType ?? 'parish';

    setHealthScoreLoading(true);
    apiClient
      .calculateHealthScore(entityId, entityType)
      .then((score) => {
        if (cancelled) return;
        if (score && typeof (score as any).composite_score === 'number') {
          setApiHealthScore((score as any).composite_score);
        } else if (score && typeof (score as any).score === 'number') {
          setApiHealthScore((score as any).score);
        }
      })
      .catch((err) => {
        console.error('[HealthTracker] Health score fetch failed, using default behavior:', err);
      })
      .finally(() => {
        if (!cancelled) setHealthScoreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const { permissions } = usePermissions();

  const canManageRecords = permissions.manage_assignments === true || permissions.view_diocese === true;

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const getUpcomingBirthdays = () => {
    const today = new Date();
    return priests
      .map((p) => ({
        ...p,
        age: calculateAge(p.birthDate),
        daysUntilBirthday: getDaysUntilBirthday(p.birthDate),
      }))
      .filter((p) => p.daysUntilBirthday <= 30 && p.daysUntilBirthday >= 0)
      .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
  };

  const getDaysUntilBirthday = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

    if (thisYearBirthday < today) {
      thisYearBirthday.setFullYear(today.getFullYear() + 1);
    }

    const diff = thisYearBirthday.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const needsCheckup = (lastCheckup: string) => {
    const last = new Date(lastCheckup);
    const today = new Date();
    const monthsDiff = (today.getFullYear() - last.getFullYear()) * 12 + today.getMonth() - last.getMonth();
    return monthsDiff > 12;
  };

  const handleAddRecord = useCallback(async () => {
    if (!formData.name.trim() || !formData.birthDate) {
      alert('Please fill in required fields');
      return;
    }

    const payload = editingId ? { id: editingId, ...formData } : formData;
    try {
      const saved = await apiClient.saveHealthRecord(payload);
      if (editingId) {
        setPriests((prev) => prev.map((p) => (p.id === editingId ? { ...saved, age: calculateAge(saved.birthDate) } : p)));
      } else {
        setPriests((prev) => [...prev, { ...saved, age: calculateAge(saved.birthDate) }]);
      }
    } catch {
      // fallback: update local state only
      if (editingId) {
        setPriests((prev) => prev.map((p) => p.id === editingId ? { ...p, ...formData, age: calculateAge(formData.birthDate) } : p));
      } else {
        setPriests((prev) => [...prev, { id: Math.random().toString(36).substr(2, 9), ...formData, age: calculateAge(formData.birthDate) }]);
      }
    }

    setEditingId(null);
    setFormData({
      name: '',
      position: '',
      parish: '',
      birthDate: '',
      lastCheckup: new Date().toISOString().split('T')[0],
      healthStatus: 'good',
      notes: '',
      email: '',
      phone: '',
    });
    setShowForm(false);
  }, [formData, editingId]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this record?')) {
      try {
        await apiClient.deleteHealthRecord(id);
      } catch { /* fallback: delete locally */ }
      setPriests((prev) => prev.filter((p) => p.id !== id));
    }
  }, []);

  const handleEdit = useCallback((priest: PriestRecord) => {
    setFormData({
      name: priest.name,
      position: priest.position,
      parish: priest.parish,
      birthDate: priest.birthDate,
      lastCheckup: priest.lastCheckup,
      healthStatus: priest.healthStatus,
      notes: priest.notes,
      email: priest.email,
      phone: priest.phone,
    });
    setEditingId(priest.id);
    setShowForm(true);
  }, []);

  const upcomingBirthdays = getUpcomingBirthdays();
  const priestsNeedingCheckup = priests.filter((p) => needsCheckup(p.lastCheckup));

  let filteredPriests = priests;
  if (filter === 'birthdays') {
    filteredPriests = upcomingBirthdays;
  } else if (filter === 'checkups') {
    filteredPriests = priestsNeedingCheckup;
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filteredPriests = filteredPriests.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q) || p.parish.toLowerCase().includes(q),
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500 rounded-lg">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Executive Health Tracker</h1>
              <p className="text-slate-600">Manage priest health check-ups and birthdays</p>
            </div>
          </div>
          {canManageRecords && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  name: '',
                  position: '',
                  parish: '',
                  birthDate: '',
                  lastCheckup: new Date().toISOString().split('T')[0],
                  healthStatus: 'good',
                  notes: '',
                  email: '',
                  phone: '',
                });
                setShowForm(true);
              }}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Record
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className={`grid grid-cols-1 gap-4 mb-8 ${apiHealthScore !== null ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-slate-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Total Priests</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{priests.length}</p>
              </div>
              <Users className="w-12 h-12 text-slate-400" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg border border-slate-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Upcoming Birthdays (30d)</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">{upcomingBirthdays.length}</p>
              </div>
              <Cake className="w-12 h-12 text-slate-400" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg border border-slate-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Need Check-up</p>
                <p className="text-3xl font-bold text-amber-600 mt-2">{priestsNeedingCheckup.length}</p>
              </div>
              <Stethoscope className="w-12 h-12 text-slate-400" />
            </div>
          </motion.div>

          {apiHealthScore !== null && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Financial Health Score</p>
                  <p
                    className={`text-3xl font-bold mt-2 ${apiHealthScore >= 70 ? 'text-emerald-600' : apiHealthScore >= 40 ? 'text-amber-600' : 'text-rose-600'}`}
                  >
                    {apiHealthScore.toFixed(1)}
                  </p>
                </div>
                <Heart
                  className={`w-12 h-12 ${apiHealthScore >= 70 ? 'text-emerald-300' : apiHealthScore >= 40 ? 'text-amber-300' : 'text-rose-300'}`}
                />
              </div>
            </motion.div>
          )}

          {healthScoreLoading && apiHealthScore === null && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Financial Health Score</p>
                  <div className="h-9 w-20 bg-slate-200 rounded mt-2" />
                </div>
                <div className="w-12 h-12 bg-slate-200 rounded-full" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="flex gap-2">
            {(['all', 'birthdays', 'checkups'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === cat
                    ? 'bg-rose-500 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat === 'all' ? '👥 All' : cat === 'birthdays' ? '🎂 Birthdays' : '⚕️ Check-ups'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, position, parish..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
            />
          </div>
        </div>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-96 overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {editingId ? 'Edit Record' : 'Add Priest Record'}
                  </h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Full name"
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="text"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Position (e.g., Pastor, Vicar)"
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={formData.parish}
                      onChange={(e) => setFormData({ ...formData, parish: e.target.value })}
                      placeholder="Parish"
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Email"
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="Phone"
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Last Check-up</label>
                      <input
                        type="date"
                        value={formData.lastCheckup}
                        onChange={(e) => setFormData({ ...formData, lastCheckup: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Health Status</label>
                      <select
                        value={formData.healthStatus}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            healthStatus: e.target.value as 'good' | 'fair' | 'needs-attention',
                          })
                        }
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                      >
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="needs-attention">Needs Attention</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes"
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleAddRecord}
                      className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                    >
                      {editingId ? 'Update' : 'Save'}
                    </button>
                    <button
                      onClick={() => setShowForm(false)}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 px-4 py-2 rounded-lg transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Records Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    Parish
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    Age
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    Last Check-up
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  {canManageRecords && (
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPriests.length === 0 ? (
                  <tr>
                    <td colSpan={canManageRecords ? 7 : 6} className="text-center py-12">
                      <Heart className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">
                        {search ? 'No results found for your search.' : 'No records to display.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPriests.map((priest) => (
                    <tr
                      key={priest.id}
                      onClick={() => setSelectedPriest(priest)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{priest.name}</p>
                        <p className="text-xs text-slate-500 md:hidden">{priest.parish}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{priest.position || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{priest.parish || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{priest.age} yrs</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-slate-600">{formatDate(new Date(priest.lastCheckup))}</span>
                        {needsCheckup(priest.lastCheckup) && (
                          <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                            Overdue
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border ${HEALTH_STATUS_COLORS[priest.healthStatus]}`}
                        >
                          {HEALTH_STATUS_ICONS[priest.healthStatus]} {priest.healthStatus.replace('-', ' ')}
                        </span>
                      </td>
                      {canManageRecords && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(priest);
                              }}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-blue-500" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(priest.id);
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredPriests.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400 font-medium">
                Showing {filteredPriests.length} of {priests.length} record{priests.length !== 1 ? 's' : ''}
                {search && ` matching "${search}"`}
              </p>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedPriest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedPriest(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedPriest.name}</h2>
                    <p className="text-slate-600">
                      {selectedPriest.position} • {selectedPriest.parish}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPriest(null)}
                    className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Birth Date</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {formatDate(new Date(selectedPriest.birthDate))}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">Age: {selectedPriest.age} years</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Health Status</p>
                    <p
                      className={`text-lg font-semibold mt-1 ${HEALTH_STATUS_COLORS[selectedPriest.healthStatus].split(' ')[1]}`}
                    >
                      {selectedPriest.healthStatus.replace('-', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Email</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">{selectedPriest.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Phone</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">{selectedPriest.phone || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-slate-600 font-medium">Last Check-up</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {formatDate(new Date(selectedPriest.lastCheckup))}
                    </p>
                    {needsCheckup(selectedPriest.lastCheckup) && (
                      <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded mt-2">
                        ⚠️ Health check-up is overdue. Please schedule immediately.
                      </p>
                    )}
                  </div>
                  {selectedPriest.notes && (
                    <div className="col-span-2">
                      <p className="text-sm text-slate-600 font-medium">Notes</p>
                      <p className="text-slate-700 mt-2 bg-slate-50 p-3 rounded">{selectedPriest.notes}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
