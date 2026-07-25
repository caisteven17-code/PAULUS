'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Plus, Edit2, X, Calendar, Users, Cake, Stethoscope, Search, Lock, Upload, FileText, Archive, RotateCcw, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';
import { getAccessRoleLabel } from '../lib/access';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { getSubmissionStatus, type SubmissionStatus } from '../lib/healthDeadlines';
import { getPriestHealthReminder } from '../lib/healthAnnouncements';
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { selectField } from '../lib/formStyles';
import { getInitials } from '../lib/initials';

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
  documentName?: string;
  documentUrl?: string;
  avatarUrl?: string;
  photoURL?: string;
}

// Neutral, restrained palette — a small status dot carries the colour, not the whole chip.
const HEALTH_STATUS_COLORS = {
  good: 'bg-slate-100 text-slate-700 border-slate-200',
  fair: 'bg-slate-100 text-slate-700 border-slate-200',
  'needs-attention': 'bg-slate-100 text-slate-700 border-slate-200',
};

const HEALTH_STATUS_DOT = {
  good: 'bg-emerald-500',
  fair: 'bg-amber-500',
  'needs-attention': 'bg-rose-500',
};

const HEALTH_STATUS_LABEL = {
  good: 'Good',
  fair: 'Fair',
  'needs-attention': 'Needs attention',
};

// One priest, with their full check-up history.
interface PriestGroup {
  key: string;
  name: string;
  position: string;
  parish: string;
  email: string;
  phone: string;
  birthDate: string;
  latest: PriestRecord;
  records: PriestRecord[]; // full history, newest first
  matchedIds: string[]; // ids matching the active filter
}

function priestAvatarUrl(record?: Partial<PriestRecord> | null) {
  return record?.avatarUrl || record?.photoURL || '';
}

function PriestAvatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
}: {
  name?: string | null;
  photoUrl?: string | null;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'lg' ? 'h-14 w-14 text-xl' : 'h-12 w-12 text-lg';
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={name ?? 'Priest avatar'} className={`${dim} shrink-0 rounded-2xl object-cover ${className}`} />
    );
  }
  return (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-2xl bg-black font-serif font-bold text-gold-400 ring-1 ring-gold-500/35 ${className}`}>
      {getInitials(name)}
    </div>
  );
}

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
  const [selectedGroup, setSelectedGroup] = useState<PriestGroup | null>(null);
  const [filter, setFilter] = useState<'all' | 'birthdays' | 'checkups' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'fair' | 'needs-attention'>('all');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'submitted' | 'pending' | 'late' | 'year-late'>('all');
  const [parishFilter, setParishFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 9;
  // Soft-archive is kept client-side (no archive column on health_records yet),
  // persisted so the archived view survives reloads.
  const [archivedIds, setArchivedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('priest_health_archived') || '[]');
    } catch {
      return [];
    }
  });
  const persistArchived = useCallback((ids: string[]) => {
    setArchivedIds(ids);
    try {
      localStorage.setItem('priest_health_archived', JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, []);
  const archiveRecord = useCallback(
    (id: string) => persistArchived(Array.from(new Set([...archivedIds, id]))),
    [archivedIds, persistArchived],
  );
  const restoreRecord = useCallback(
    (id: string) => persistArchived(archivedIds.filter((x) => x !== id)),
    [archivedIds, persistArchived],
  );
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

  // Reset to the first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter, search]);

  const handleArchive = useCallback((id: string) => {
    if (confirm('Archive this health record? You can restore it from the dedicated Archives page.')) {
      archiveRecord(id);
    }
  }, [archiveRecord]);

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

  // Auto-generated medical-records reminders (System / Important)
  const priestRolesList = ['bishop', 'chancellor', 'parish_priest', 'seminary_rector', 'diocesan_oeconomus'];
  const userRoleStr = String((user as any)?.roleId || (user as any)?.role || '').toLowerCase();
  const isUserPriest = priestRolesList.some(r => userRoleStr.includes(r));
  
  const personalRecord = isUserPriest
    ? priests
        .filter((p) => {
          const userEmail = ((user as any)?.email || '').toLowerCase();
          return userEmail && p.email ? p.email.toLowerCase() === userEmail : false;
        })
        .sort((a, b) => new Date(b.lastCheckup || 0).getTime() - new Date(a.lastCheckup || 0).getTime())[0]
    : undefined;
  const myReminder = personalRecord ? getPriestHealthReminder(personalRecord) : null;

  // --------- PRIEST SELF-VIEW ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
                  {priestParish ? ` • ${priestParish}` : ''}
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

          {myReminder && (
            <div className="mb-6 flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                    System · Important
                  </span>
                  <p className="text-sm font-black text-amber-900">{myReminder.title}</p>
                </div>
                <p className="mt-1 text-sm font-medium leading-relaxed text-amber-800">{myReminder.content}</p>
              </div>
            </div>
          )}

          {/* Records list */}
          <h2 className="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-rose-400" />
            My Health Records
          </h2>

          {recordsLoading ? (
            <div className="text-center py-16 text-slate-400 text-sm">Loading records...</div>
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
                            : '-'}
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
                        onClick={() => handleArchive(record.id)}
                        className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4 text-amber-600" />
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

          {/* Simplified Add/Edit Modal - priest self-view */}
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
                        placeholder="Enter any additional notes..."
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

  // --------- ADMIN / BISHOP FULL VIEW ------------------------------------------------------------------------------------------------------------------------------------------------
  const isArchived = (p: PriestRecord) => archivedIds.includes(p.id);

  const priestRolesListAdmin = ['bishop', 'chancellor', 'parish_priest', 'seminary_rector', 'diocesan_oeconomus'];
  const allPriestRecords = [...priests];
  for (const profile of allProfiles) {
    const roleId = String(profile.roleId || profile.role || '').toLowerCase();
    const isPriest = priestRolesListAdmin.some(r => roleId.includes(r));
    if (isPriest && profile.status !== 'archived') {
       const k = profile.email?.trim().toLowerCase() || profile.displayName?.trim().toLowerCase() || profile.id;
       const exists = priests.some(p => (p.email?.trim().toLowerCase() || p.name?.trim().toLowerCase() || p.id) === k);
       if (!exists) {
         allPriestRecords.push({
           id: profile.id?.toString() || Math.random().toString(36).substr(2, 9),
           name: profile.displayName || profile.email?.split('@')[0] || '',
           position: getAccessRoleLabel(profile.roleId || profile.role) || '',
           parish: profile.entityName || '',
           birthDate: profile.birthday || '',
           age: profile.birthday ? calculateAge(profile.birthday) : 0,
           lastCheckup: '',
           healthStatus: 'good',
           notes: '',
           email: profile.email || '',
           phone: profile.contactNumber || '',
         });
       }
    }
  }

  const upcomingBirthdays = allPriestRecords
    .map((p) => ({
      ...p,
      age: calculateAge(p.birthDate),
      daysUntilBirthday: getDaysUntilBirthday(p.birthDate),
    }))
    .filter((p) => p.daysUntilBirthday <= 30 && p.daysUntilBirthday >= 0)
    .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);

  const priestsNeedingCheckup = allPriestRecords.filter((p) => needsCheckup(p.lastCheckup));
  // Age stored in the DB may be stale/missing - always derive it from birthDate
  const displayAge = (p: PriestRecord) => calculateAge(p.birthDate) || p.age || 0;

  const activePriests = allPriestRecords.filter((p) => !isArchived(p));
  const latestActivePriests = Array.from(
    activePriests.reduce((latestByPriest, priest) => {
      const key = priest.email?.trim().toLowerCase() || priest.name?.trim().toLowerCase() || priest.id;
      const current = latestByPriest.get(key);
      if (!current || new Date(priest.lastCheckup || 0).getTime() > new Date(current.lastCheckup || 0).getTime()) {
        latestByPriest.set(key, priest);
      }
      return latestByPriest;
    }, new Map<string, PriestRecord>()).values(),
  );
  const pendingPriests = latestActivePriests.filter(
    (p) => getSubmissionStatus(p.birthDate, p.lastCheckup).needsAttention,
  );

  const parishOptions = Array.from(new Set(activePriests.map((p) => p.parish).filter(Boolean))).sort();
  const healthFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (submissionFilter !== 'all' ? 1 : 0) + (parishFilter !== 'all' ? 1 : 0);
  const clearHealthFilters = () => {
    setStatusFilter('all');
    setSubmissionFilter('all');
    setParishFilter('all');
  };

  let filteredPriests: PriestRecord[];
  if (filter === 'birthdays') filteredPriests = upcomingBirthdays.filter((p) => !isArchived(p));
  else if (filter === 'checkups') filteredPriests = priestsNeedingCheckup.filter((p) => !isArchived(p));
  else if (filter === 'pending') filteredPriests = pendingPriests;
  else filteredPriests = activePriests;

  if (statusFilter !== 'all') {
    filteredPriests = filteredPriests.filter((p) => p.healthStatus === statusFilter);
  }
  if (submissionFilter !== 'all') {
    filteredPriests = filteredPriests.filter(
      (p) => getSubmissionStatus(p.birthDate, p.lastCheckup).code === submissionFilter,
    );
  }
  if (parishFilter !== 'all') {
    filteredPriests = filteredPriests.filter((p) => (p.parish || '') === parishFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filteredPriests = filteredPriests.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.parish.toLowerCase().includes(q),
    );
  }

  // Submission status from the priest's most recent check-up.
  // Birth-month-anchored submission status (Submitted / Pending this month /
  // N months late / 1 year late) from the medical-records deadline engine.
  const submissionStatus = (latest?: PriestRecord): { label: string; dot: string; tone: string } => {
    const s = getSubmissionStatus(latest?.birthDate, latest?.lastCheckup);
    const styles: Record<SubmissionStatus['severity'], { dot: string; tone: string }> = {
      ok: { dot: 'bg-emerald-500', tone: 'text-emerald-600' },
      due: { dot: 'bg-amber-500', tone: 'text-amber-600' },
      late: { dot: 'bg-orange-500', tone: 'text-orange-600' },
      critical: { dot: 'bg-rose-500', tone: 'text-rose-600' },
      unknown: { dot: 'bg-slate-300', tone: 'text-slate-500' },
    };
    return { label: s.label, ...styles[s.severity] };
  };

  // ── Group records by priest so each card represents one person with history ──
  const groupKey = (p: PriestRecord) =>
    p.email?.trim().toLowerCase() || p.name?.trim().toLowerCase() || p.id;

  const historyByKey = new Map<string, PriestRecord[]>();
  for (const p of allPriestRecords) {
    const k = groupKey(p);
    if (!historyByKey.has(k)) historyByKey.set(k, []);
    historyByKey.get(k)!.push(p);
  }

  const avatarByPriestKey = new Map<string, string>();
  for (const profile of allProfiles) {
    const avatar = profile.avatarUrl || profile.photoURL || profile.photoUrl || '';
    if (!avatar) continue;
    const emailKey = String(profile.email || '').trim().toLowerCase();
    const nameKey = String(profile.displayName || profile.leader || '').trim().toLowerCase();
    if (emailKey) avatarByPriestKey.set(emailKey, avatar);
    if (nameKey) avatarByPriestKey.set(nameKey, avatar);
  }

  const groupMap = new Map<string, PriestGroup>();
  for (const p of filteredPriests) {
    const k = groupKey(p);
    if (!groupMap.has(k)) {
      const records = (historyByKey.get(k) || [p])
        .slice()
        .sort((a, b) => new Date(b.lastCheckup || 0).getTime() - new Date(a.lastCheckup || 0).getTime());
      const latest = records[0] || p;
      const withBirth = records.find((r) => r.birthDate) || latest;
      const profileAvatar =
        priestAvatarUrl(latest) ||
        avatarByPriestKey.get(String(latest.email || '').trim().toLowerCase()) ||
        avatarByPriestKey.get(String(latest.name || '').trim().toLowerCase()) ||
        '';
      const latestWithAvatar = profileAvatar ? { ...latest, avatarUrl: profileAvatar } : latest;
      groupMap.set(k, {
        key: k,
        name: latestWithAvatar.name,
        position: latestWithAvatar.position,
        parish: latestWithAvatar.parish,
        email: latestWithAvatar.email,
        phone: latestWithAvatar.phone,
        birthDate: withBirth.birthDate,
        latest: latestWithAvatar,
        records,
        matchedIds: [],
      });
    }
    groupMap.get(k)!.matchedIds.push(p.id);
  }
  const priestGroups = Array.from(groupMap.values());

  const totalPages = Math.max(1, Math.ceil(priestGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = priestGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#f4f3ef] pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* ------ Header ------ */}
        <div className="mb-6 overflow-hidden rounded-[2rem] border border-black/10 bg-black text-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="relative p-6 md:p-8">
              <div className="absolute bottom-0 right-0 h-full w-24 bg-gold-500 [clip-path:polygon(64%_0,100%_0,46%_100%,0_100%)]" />
              <div className="relative flex min-w-0 items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-white/5">
                  <Heart className="h-6 w-6 text-gold-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">Clergy Wellbeing</p>
                  <h1 className="mt-2 font-serif text-4xl font-bold leading-none text-white md:text-6xl">Health Tracker</h1>
                  <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-white/58">
                    Monitor priest health check-ups, upcoming birthdays, and wellbeing records with fast scanning and clear follow-up cues.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/[0.04] p-5 lg:border-l lg:border-t-0">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Priests', value: activePriests.length, Icon: Users },
                  { label: 'Birthdays', value: upcomingBirthdays.filter((p) => !isArchived(p)).length, Icon: Cake },
                  { label: 'Check-ups', value: priestsNeedingCheckup.filter((p) => !isArchived(p)).length, Icon: Stethoscope },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/38">{label}</span>
                      <Icon className="h-3.5 w-3.5 text-gold-400" />
                    </div>
                    <p className="mt-2 text-3xl font-black leading-none text-white">{value}</p>
                  </div>
                ))}
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
                  className="mt-4 inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
                >
                  <Plus className="h-4 w-4" />
                  Add Record
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ------ Auto-generated medical-records reminders (System · Important) ------ */}
        {myReminder && (
          <div className="mb-6 flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                  System · Important
                </span>
                <p className="text-sm font-black text-amber-900">{myReminder.title}</p>
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-amber-800">{myReminder.content}</p>
            </div>
          </div>
        )}
        {/* ------ Filter / search bar ------ */}
        <div className="mb-6 rounded-[2rem] border border-black/10 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {([
                { id: 'all', label: 'All', Icon: Users },
                { id: 'birthdays', label: 'Birthdays', Icon: Cake },
                { id: 'checkups', label: 'Check-ups', Icon: Stethoscope },
                { id: 'pending', label: 'Pending submissions', Icon: FileText },
              ] as const).map(({ id, label, Icon }) => {
                const count =
                  id === 'birthdays'
                      ? upcomingBirthdays.filter((p) => !isArchived(p)).length
                      : id === 'checkups'
                        ? priestsNeedingCheckup.filter((p) => !isArchived(p)).length
                        : id === 'pending'
                          ? pendingPriests.length
                        : activePriests.length;
                const active = filter === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={`inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all ${
                      active
                        ? 'bg-black text-white shadow-lg shadow-black/10'
                        : 'border border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-slate-400'}`} />
                    <span className="truncate">{label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, position, parish..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                />
              </div>
              <FilterModal activeCount={healthFilterCount} onClear={clearHealthFilters}>
                <FilterField label="Submission status">
                  <select
                    value={submissionFilter}
                    onChange={(e) => setSubmissionFilter(e.target.value as any)}
                    className={selectField(submissionFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                  >
                    <option value="all">All submissions</option>
                    <option value="submitted">Submitted</option>
                    <option value="pending">Pending this month</option>
                    <option value="late">Late</option>
                    <option value="year-late">1+ years late</option>
                  </select>
                </FilterField>

                <FilterField label="Health status">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className={selectField(statusFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                  >
                    <option value="all">All statuses</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="needs-attention">Needs attention</option>
                  </select>
                </FilterField>

                {parishOptions.length > 0 && (
                  <FilterField label="Parish / institution">
                    <select
                      value={parishFilter}
                      onChange={(e) => setParishFilter(e.target.value)}
                      className={selectField(parishFilter !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
                    >
                      <option value="all">All parishes</option>
                      {parishOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                )}
              </FilterModal>
            </div>
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
                                {profile.entityName ? ` • ${profile.entityName}` : ''}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Position - auto-filled, read-only */}
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

                  {/* Parish + Email - auto-filled, read-only */}
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

        {filter === 'pending' && (
          <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Medical compliance</p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-slate-950">Pending Submissions</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Priests whose medical records are due or overdue for the current submission cycle.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white px-5 py-3 text-center shadow-sm">
              <p className="text-2xl font-black leading-none text-amber-700">{priestGroups.length}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Awaiting records</p>
            </div>
          </div>
        )}

        {/* ------ Records card grid ------ */}
        {recordsLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white">
            <InlineLoader label="Loading records" />
          </div>
        ) : filteredPriests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
              <Heart className="h-9 w-9 text-slate-300" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-xl font-bold text-slate-900">
                No records to display
              </p>
              <p className="text-sm text-slate-400">
                {search ? 'No results found for your search.' : 'Records will appear here once added.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagedGroups.map((group) => {
                const age = group.birthDate ? calculateAge(group.birthDate) : 0;
                const daysToBirthday = group.birthDate ? getDaysUntilBirthday(group.birthDate) : 999;
                const sub = submissionStatus(group.latest);
                const archived = group.matchedIds.every((id) => archivedIds.includes(id));
                return (
                  <motion.div
                    key={group.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)] ${archived ? 'opacity-80' : ''}`}
                  >
                    <div className="h-1.5 bg-gradient-to-r from-black via-gold-500 to-transparent" />
                    <button onClick={() => setSelectedGroup(group)} className="flex w-full items-start gap-3 px-5 pb-4 pt-5 text-left">
                      <PriestAvatar name={group.name} photoUrl={priestAvatarUrl(group.latest)} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-serif text-lg font-bold text-slate-900">{group.name}</p>
                        <p className="truncate text-xs font-semibold text-slate-400">
                          {[group.position, group.parish].filter(Boolean).join(' - ') || 'No assignment'}
                        </p>
                      </div>
                    </button>

                    <div className="space-y-2.5 px-5 pb-5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <Cake className="h-3.5 w-3.5" /> Birthday
                        </span>
                        <span className="font-semibold text-slate-700">
                          {group.birthDate ? formatDate(new Date(group.birthDate)) : 'Not set'}
                          {age > 0 && <span className="ml-1 text-xs font-medium text-slate-400">({age})</span>}
                        </span>
                      </div>
                      {daysToBirthday <= 30 && (
                        <div className="flex justify-end">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {daysToBirthday === 0 ? 'Birthday today' : `Birthday in ${daysToBirthday}d`}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <Stethoscope className="h-3.5 w-3.5" /> Submission
                        </span>
                        <span className={`flex items-center gap-1.5 text-sm font-bold ${sub.tone}`}>
                          <span className={`h-2 w-2 rounded-full ${sub.dot}`} />
                          {sub.label}
                        </span>
                      </div>
                      <p className="text-right text-[11px] text-slate-400">
                        {group.latest.lastCheckup ? `Last: ${formatDate(new Date(group.latest.lastCheckup))}` : 'No check-up yet'}
                        {group.records.length > 1 && ` - ${group.records.length} records`}
                      </p>
                    </div>

                    {canManageRecords && (
                      <div className="flex items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                        {archived ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              persistArchived(archivedIds.filter((id) => !group.matchedIds.includes(id)));
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-500 hover:text-white"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(group.latest);
                              }}
                              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-900 hover:text-white"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                persistArchived(Array.from(new Set([...archivedIds, ...group.matchedIds])));
                              }}
                              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-500 hover:text-white"
                              title="Archive"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3">
              <p className="text-xs font-semibold text-slate-400">
                Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, priestGroups.length)} of {priestGroups.length} priest{priestGroups.length === 1 ? '' : 's'}
                {search && ` matching "${search}"`}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-600">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}


        {/* Detail Modal */}
        <AnimatePresence>
          {selectedGroup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
              onClick={() => setSelectedGroup(null)}
            >
              <motion.div
                initial={{ scale: 0.96, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 12 }}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4 bg-slate-900 p-6 text-white">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <PriestAvatar
                      name={selectedGroup.name}
                      photoUrl={priestAvatarUrl(selectedGroup.latest)}
                      className="ring-gold-500/45"
                    />
                    <div className="min-w-0">
                      <h2 className="truncate font-serif text-2xl font-bold">{selectedGroup.name}</h2>
                      <p className="truncate text-sm text-white/55">
                        {[selectedGroup.position, selectedGroup.parish].filter(Boolean).join(' - ') || 'No assignment'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canManageRecords && (
                      <>
                        <button
                          onClick={() => {
                            const g = selectedGroup;
                            setSelectedGroup(null);
                            handleEdit(g.latest);
                          }}
                          className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white hover:text-slate-900"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            const g = selectedGroup;
                            if (!confirm(`Archive all ${g.records.length} record(s) for ${g.name}? You can restore them from Archives.`)) return;
                            persistArchived(Array.from(new Set([...archivedIds, ...g.records.map((r) => r.id)])));
                            setSelectedGroup(null);
                          }}
                          className="rounded-xl p-2 text-white/60 transition-colors hover:bg-amber-500 hover:text-white"
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSelectedGroup(null)}
                      className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Birthday</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {selectedGroup.birthDate ? formatDate(new Date(selectedGroup.birthDate)) : 'Not set'}
                      </p>
                      {selectedGroup.birthDate && calculateAge(selectedGroup.birthDate) > 0 && (
                        <p className="text-xs font-semibold text-slate-400">{calculateAge(selectedGroup.birthDate)} yrs old</p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Submission</p>
                      {(() => {
                        const s = submissionStatus(selectedGroup.latest);
                        return (
                          <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${s.tone}`}>
                            <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Email</p>
                      <p className="mt-1 break-all text-xs font-semibold text-slate-700">{selectedGroup.email || 'N/A'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phone</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedGroup.phone || 'N/A'}</p>
                    </div>
                  </div>

                  <h3 className="mt-6 mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <Stethoscope className="h-4 w-4" /> Check-up history ({selectedGroup.records.length})
                  </h3>
                  <div className="space-y-2.5">
                    {selectedGroup.records.map((rec, i) => {
                      const overdue = needsCheckup(rec.lastCheckup);
                      return (
                        <div key={rec.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                                <Calendar className="h-4 w-4 text-slate-500" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  {rec.lastCheckup ? formatDate(new Date(rec.lastCheckup)) : 'No date'}
                                </p>
                                <p className="text-[11px] font-medium text-slate-400">
                                  {i === 0 ? 'Most recent' : 'Past record'}
                                </p>
                              </div>
                            </div>
                            <span className={`flex items-center gap-1.5 text-xs font-bold ${overdue ? 'text-amber-600' : 'text-emerald-600'}`}>
                              <span className={`h-2 w-2 rounded-full ${overdue ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              {overdue ? 'Overdue' : 'On time'}
                            </span>
                          </div>
                          {rec.notes && (
                            <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              {rec.notes}
                            </p>
                          )}
                          {rec.documentName && (
                            <div className="mt-2">
                              {rec.documentUrl ? (
                                <a
                                  href={rec.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                  <FileText className="h-3.5 w-3.5" /> {rec.documentName}
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                  <FileText className="h-3.5 w-3.5" /> {rec.documentName}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
