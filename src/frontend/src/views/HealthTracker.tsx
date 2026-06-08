'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Plus, Trash2, Edit2, X, Calendar, Users, Cake, Stethoscope, Search, Lock, Upload, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';
import { getAccessRoleLabel } from '../lib/access';

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

  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Document upload for priest self-submission
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    lastCheckup: new Date().toISOString().split('T')[0],
    healthStatus: 'good',
    notes: '',
    email: '',
    phone: '',
  });

  const { permissions } = usePermissions();

  // Priest self-view: has view_priests but is NOT a diocese-level admin
  const isPriestView =
    permissions.view_priests === true &&
    permissions.view_diocese !== true &&
    permissions.manage_entities !== true;

  const canManageRecords =
    permissions.manage_assignments === true || permissions.view_diocese === true;

  // Fetch records from DB on mount; fall back to localStorage cache
  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    apiClient
      .getHealthRecords()
      .then((data) => {
        if (!cancelled) {
          setPriests(data ?? []);
          localStorage.setItem('priest_health_records', JSON.stringify(data ?? []));
        }
      })
      .catch(() => {
        if (!cancelled) {
          const cached = localStorage.getItem('priest_health_records');
          if (cached) setPriests(JSON.parse(cached));
        }
      })
      .finally(() => {
        if (!cancelled) setRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHealthScoreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fetch all profiles for priest name auto-suggest (admin view only)
  useEffect(() => {
    if (isPriestView) return;
    fetch('/api/admin/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => setAllProfiles(data))
      .catch(() => {});
  }, [isPriestView]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({ ...prev, name: value, position: '', parish: '', email: '' }));
    if (value.trim().length >= 1) {
      const q = value.toLowerCase();
      const matches = allProfiles.filter((p) =>
        (p.displayName || p.email || '').toLowerCase().includes(q),
      );
      setNameSuggestions(matches.slice(0, 8));
      setShowSuggestions(matches.length > 0);
    } else {
      setNameSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectProfile = (profile: any) => {
    setFormData((prev) => ({
      ...prev,
      name: profile.displayName || profile.email?.split('@')[0] || '',
      position: getAccessRoleLabel(profile.roleId || profile.role) || '',
      parish: profile.entityName || '',
      email: profile.email || '',
    }));
    setNameSuggestions([]);
    setShowSuggestions(false);
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const getUpcomingBirthdays = () => {
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
    if (!birthDate) return 999;
    const today = new Date();
    const birth = new Date(birthDate);
    const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    if (thisYearBirthday < today) thisYearBirthday.setFullYear(today.getFullYear() + 1);
    return Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const needsCheckup = (lastCheckup: string) => {
    if (!lastCheckup) return false;
    const last = new Date(lastCheckup);
    const today = new Date();
    const monthsDiff =
      (today.getFullYear() - last.getFullYear()) * 12 + today.getMonth() - last.getMonth();
    return monthsDiff > 12;
  };

  // Admin/bishop full record save
  const handleAddRecord = useCallback(async () => {
    if (!formData.name.trim() || !formData.birthDate) {
      alert('Please fill in required fields');
      return;
    }
    const payload = editingId ? { id: editingId, ...formData } : formData;
    try {
      const saved = await apiClient.saveHealthRecord(payload);
      if (editingId) {
        setPriests((prev) =>
          prev.map((p) => (p.id === editingId ? { ...saved, age: calculateAge(saved.birthDate) } : p)),
        );
      } else {
        setPriests((prev) => [...prev, { ...saved, age: calculateAge(saved.birthDate) }]);
      }
    } catch {
      if (editingId) {
        setPriests((prev) =>
          prev.map((p) =>
            p.id === editingId ? { ...p, ...formData, age: calculateAge(formData.birthDate) } : p,
          ),
        );
      } else {
        setPriests((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            ...formData,
            age: calculateAge(formData.birthDate),
          },
        ]);
      }
    }
    resetForm();
  }, [formData, editingId]);

  // Priest self-submission save
  const handlePriestSubmit = useCallback(async () => {
    if (!formData.lastCheckup) {
      alert('Please select a date of checkup');
      return;
    }
    const priestName =
      (user as any)?.displayName || (user as any)?.email?.split('@')[0] || '';
    const priestEmail = (user as any)?.email || '';
    const priestPosition =
      getAccessRoleLabel((user as any)?.roleId || (user as any)?.role) || '';
    const priestParish = (user as any)?.entityName || '';

    // Upload document to Supabase Storage first if a file was selected
    let documentUrl = '';
    let documentName = '';
    if (documentFile) {
      try {
        const fd = new FormData();
        fd.append('file', documentFile);
        fd.append('priestName', priestName);
        const uploadRes = await fetch('/api/health-records/upload', { method: 'POST', body: fd });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          documentUrl = uploadData.documentUrl ?? '';
          documentName = uploadData.documentName ?? documentFile.name;
        } else {
          documentName = documentFile.name;
        }
      } catch {
        documentName = documentFile.name;
      }
    }

    const base = {
      name: priestName,
      position: priestPosition,
      parish: priestParish,
      email: priestEmail,
      phone: '',
      birthDate: '',
      healthStatus: 'good' as const,
      lastCheckup: formData.lastCheckup,
      notes: formData.notes,
      documentName,
      documentUrl,
      createdByUserId: (user as any)?.id ?? (user as any)?.uid ?? '',
    };
    const payload = editingId ? { id: editingId, ...base } : base;

    try {
      const saved = await apiClient.saveHealthRecord(base);
      if (editingId) {
        setPriests((prev) => prev.map((p) => (p.id === editingId ? { ...saved, age: 0 } : p)));
      } else {
        setPriests((prev) => [...prev, { ...saved, age: 0 }]);
      }
    } catch (err: any) {
      const msg = err?.message ?? JSON.stringify(err) ?? 'Unknown error';
      console.error('[HealthTracker] Save failed:', msg);
      alert(`Save failed: ${msg}\n\nRecord saved locally only.`);
      if (editingId) {
        setPriests((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, lastCheckup: formData.lastCheckup, notes: formData.notes } : p)),
        );
      } else {
        setPriests((prev) => [
          ...prev,
          { id: Math.random().toString(36).substr(2, 9), ...base, age: 0 },
        ]);
      }
    }
    resetForm();
  }, [formData, editingId, documentFile, user]);

  const resetForm = () => {
    setEditingId(null);
    setDocumentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    setShowSuggestions(false);
    setNameSuggestions([]);
    setShowForm(false);
  };

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this record?')) {
      try {
        await apiClient.deleteHealthRecord(id);
      } catch {
        /* fallback: delete locally */
      }
      setPriests((prev) => prev.filter((p) => p.id !== id));
    }
  }, []);

  const handleEdit = useCallback(
    (priest: PriestRecord) => {
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
      setDocumentFile(null);
      setShowForm(true);
    },
    [],
  );

  // ─── PRIEST SELF-VIEW ────────────────────────────────────────────────────────
  if (isPriestView) {
    const priestName =
      (user as any)?.displayName || (user as any)?.email?.split('@')[0] || 'Priest';
    const priestParish = (user as any)?.entityName || '';
    const priestRole =
      getAccessRoleLabel((user as any)?.roleId || (user as any)?.role) || 'Parish Priest';

    // Only show this priest's own records
    const myRecords = priests
      .filter((p) => {
        const userEmail = ((user as any)?.email || '').toLowerCase();
        const userName = priestName.toLowerCase();
        return (
          p.name.toLowerCase() === userName ||
          (userEmail && p.email.toLowerCase() === userEmail)
        );
      })
      .sort((a, b) => new Date(b.lastCheckup).getTime() - new Date(a.lastCheckup).getTime());

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-6 pb-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {/* Personal header */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
                <Heart className="w-7 h-7 text-rose-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{priestName}</h1>
                <p className="text-slate-500 text-sm">
                  {priestRole}
                  {priestParish ? ` · ${priestParish}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setDocumentFile(null);
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
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Record
            </button>
          </div>

          {/* Records list */}
          <h2 className="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-rose-400" />
            My Health Records
          </h2>

          {recordsLoading ? (
            <div className="text-center py-16 text-slate-400 text-sm">Loading records…</div>
          ) : myRecords.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Heart className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No health records yet. Add your first record.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-slate-200 p-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-50 rounded-lg shrink-0">
                        <Calendar className="w-4 h-4 text-rose-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {record.lastCheckup
                            ? formatDate(new Date(record.lastCheckup))
                            : '—'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Date of Checkup</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(record)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </button>
                    </div>
                  </div>

                  {(record.notes || (record as any).documentName) && (
                    <div className="mt-4 pl-11 space-y-2">
                      {record.notes && (
                        <>
                          <p className="text-xs font-medium text-slate-500">Notes</p>
                          <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 whitespace-pre-line">
                            {record.notes}
                          </p>
                        </>
                      )}
                      {(record as any).documentName && (
                        <div className="flex items-center gap-2 mt-1">
                          <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                          {(record as any).documentUrl ? (
                            <a
                              href={(record as any).documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-rose-600 hover:underline font-medium"
                            >
                              {(record as any).documentName}
                            </a>
                          ) : (
                            <span className="text-sm text-slate-500">{(record as any).documentName}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* Simplified Add/Edit Modal — priest self-view */}
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
                  className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900">
                      {editingId ? 'Edit Record' : 'Add Health Record'}
                    </h2>
                    <button
                      onClick={() => setShowForm(false)}
                      className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Date of Checkup */}
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                        Date of Checkup
                      </label>
                      <input
                        type="date"
                        value={formData.lastCheckup}
                        onChange={(e) =>
                          setFormData({ ...formData, lastCheckup: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                      />
                    </div>

                    {/* Additional Notes */}
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                        Additional Notes
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Enter any additional notes…"
                        rows={4}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-none"
                      />
                    </div>

                    {/* Submission of Documents */}
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                        Submission of Documents
                      </label>
                      <div
                        className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-rose-300 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {documentFile ? (
                          <div className="flex items-center justify-center gap-2 text-rose-600">
                            <FileText className="w-5 h-5" />
                            <span className="text-sm font-medium">{documentFile.name}</span>
                          </div>
                        ) : (
                          <div className="text-slate-400">
                            <Upload className="w-6 h-6 mx-auto mb-1" />
                            <p className="text-sm">Click to upload health documents</p>
                            <p className="text-xs mt-0.5 text-slate-300">PDF, JPG, PNG</p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
                      />
                      {documentFile && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-slate-400 hover:text-rose-500 transition-colors"
                          onClick={() => {
                            setDocumentFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          Remove file
                        </button>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handlePriestSubmit}
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
        </div>
      </div>
    );
  }

  // ─── ADMIN / BISHOP FULL VIEW ────────────────────────────────────────────────
  const upcomingBirthdays = getUpcomingBirthdays();
  const priestsNeedingCheckup = priests.filter((p) => needsCheckup(p.lastCheckup));

  let filteredPriests = priests;
  if (filter === 'birthdays') filteredPriests = upcomingBirthdays;
  else if (filter === 'checkups') filteredPriests = priestsNeedingCheckup;
  if (search.trim()) {
    const q = search.toLowerCase();
    filteredPriests = filteredPriests.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.parish.toLowerCase().includes(q),
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
        <div
          className={`grid grid-cols-1 gap-4 mb-8 ${apiHealthScore !== null ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}
        >
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
                <p className="text-3xl font-bold text-amber-600 mt-2">
                  {priestsNeedingCheckup.length}
                </p>
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

        {/* Full Admin Add/Edit Form Modal */}
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
                className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
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
                  {/* Priest Name with auto-suggest */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onFocus={() =>
                          formData.name.trim() && setShowSuggestions(nameSuggestions.length > 0)
                        }
                        placeholder="Priest name"
                        autoComplete="off"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                      />
                      {showSuggestions && (
                        <div
                          ref={suggestionsRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                        >
                          {nameSuggestions.map((profile) => (
                            <button
                              key={profile.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectProfile(profile);
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-rose-50 transition-colors border-b border-slate-100 last:border-0"
                            >
                              <p className="font-medium text-slate-900 text-sm">
                                {profile.displayName || profile.email?.split('@')[0]}
                              </p>
                              <p className="text-xs text-slate-500">
                                {getAccessRoleLabel(profile.roleId || profile.role)}
                                {profile.entityName ? ` · ${profile.entityName}` : ''}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Position — auto-filled, read-only */}
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.position}
                        readOnly
                        placeholder="Position (e.g., Pastor, Vicar)"
                        className="w-full px-4 py-2 pr-9 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 outline-none cursor-not-allowed"
                      />
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>

                  {/* Parish + Email — auto-filled, read-only */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.parish}
                        readOnly
                        placeholder="Parish"
                        className="w-full px-4 py-2 pr-9 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 outline-none cursor-not-allowed"
                      />
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="relative">
                      <input
                        type="email"
                        value={formData.email}
                        readOnly
                        placeholder="Email"
                        className="w-full px-4 py-2 pr-9 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 outline-none cursor-not-allowed"
                      />
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
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
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                        {priest.parish || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                        {priest.age ? `${priest.age} yrs` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {priest.lastCheckup ? (
                          <>
                            <span className="text-slate-600">
                              {formatDate(new Date(priest.lastCheckup))}
                            </span>
                            {needsCheckup(priest.lastCheckup) && (
                              <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                                Overdue
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border ${HEALTH_STATUS_COLORS[priest.healthStatus]}`}
                        >
                          {HEALTH_STATUS_ICONS[priest.healthStatus]}{' '}
                          {priest.healthStatus.replace('-', ' ')}
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
                Showing {filteredPriests.length} of {priests.length} record
                {priests.length !== 1 ? 's' : ''}
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
                      {selectedPriest.birthDate
                        ? formatDate(new Date(selectedPriest.birthDate))
                        : 'N/A'}
                    </p>
                    {selectedPriest.age > 0 && (
                      <p className="text-sm text-slate-600 mt-1">Age: {selectedPriest.age} years</p>
                    )}
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
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {selectedPriest.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Phone</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {selectedPriest.phone || 'N/A'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-slate-600 font-medium">Last Check-up</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {selectedPriest.lastCheckup
                        ? formatDate(new Date(selectedPriest.lastCheckup))
                        : 'N/A'}
                    </p>
                    {selectedPriest.lastCheckup && needsCheckup(selectedPriest.lastCheckup) && (
                      <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded mt-2">
                        ⚠️ Health check-up is overdue. Please schedule immediately.
                      </p>
                    )}
                  </div>
                  {selectedPriest.notes && (
                    <div className="col-span-2">
                      <p className="text-sm text-slate-600 font-medium">Notes</p>
                      <p className="text-slate-700 mt-2 bg-slate-50 p-3 rounded whitespace-pre-line">
                        {selectedPriest.notes}
                      </p>
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
