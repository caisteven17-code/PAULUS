'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  X,
  Send,
  User,
  Calendar,
  Megaphone,
  Wallet,
  ClipboardList,
  CalendarDays,
  CalendarClock,
  Archive,
  RotateCcw,
  FileText,
  Clock,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Search,
  Pin,
  PinOff,
  Copy,
  Check,
  Stethoscope,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { apiClient } from '../lib/api-client';
import { getPriestHealthReminder, getDioceseHealthSummary } from '../lib/healthAnnouncements';
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { selectField, dateField } from '../lib/formStyles';

// ── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: string;
  priority: 'low' | 'medium' | 'high';
  category: 'general' | 'financial' | 'administrative' | 'event';
  status: 'draft' | 'active' | 'past' | 'archived';
  pinned: boolean;
  startDate: number;
  endDate: number | null;
  publishedAt: number | null;
  archivedAt: number | null;
  archivedBy: string | null;
  createdAt: number;
}

type Tab = 'active' | 'scheduled' | 'drafts' | 'past';
type SortMode = 'newest' | 'oldest' | 'priority';

// ── Static maps ──────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  low:    { badge: 'bg-sky-50 text-sky-700 border-sky-100',       rail: 'bg-sky-400',   label: 'Routine'   },
  medium: { badge: 'bg-amber-50 text-amber-700 border-amber-100', rail: 'bg-amber-400', label: 'Important' },
  high:   { badge: 'bg-rose-50 text-rose-700 border-rose-100',    rail: 'bg-rose-500',  label: 'Urgent'    },
} as const;

const CATEGORY_META = {
  general:        { icon: Megaphone,     label: 'General'        },
  financial:      { icon: Wallet,        label: 'Financial'      },
  administrative: { icon: ClipboardList, label: 'Administrative' },
  event:          { icon: CalendarDays,  label: 'Event'          },
} as const;

const GRACE_PERIOD_MS = 5 * 60 * 1000;
const TITLE_MAX = 120;
const CONTENT_MAX = 2000;

const EMPTY_FILTERS = { search: '', category: 'all', priority: 'all', dateFrom: '', dateTo: '' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function withinGracePeriod(publishedAt: number | null): boolean {
  if (!publishedAt) return false;
  return Date.now() - publishedAt < GRACE_PERIOD_MS;
}

function gracePeriodSecondsLeft(publishedAt: number | null): number {
  if (!publishedAt) return 0;
  return Math.max(0, Math.ceil((publishedAt + GRACE_PERIOD_MS - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function dateTileParts(ts: number): { month: string; day: string; year: string } {
  const d = new Date(ts);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

/** Format a timestamp for a datetime-local input in the user's local time. */
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Small action buttons (Events-style outline buttons) ─────────────────────

const ROW_BUTTON_TONES = {
  neutral: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950',
  warning: 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-amber-700',
  danger:  'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100',
  primary: 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
} as const;

function RowButton({
  icon: Icon, label, tone = 'neutral', onClick,
}: {
  icon: React.ElementType;
  label: string;
  tone?: keyof typeof ROW_BUTTON_TONES;
  onClick(): void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-colors ${ROW_BUTTON_TONES[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function IconRowButton({
  icon: Icon, title, active = false, onClick,
}: {
  icon: React.ElementType;
  title: string;
  active?: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${
        active
          ? 'border-gold-500/40 bg-gold-50 text-gold-600 hover:bg-gold-100'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-950'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function Announcements() {
  const { permissions } = usePermissions();
  const { user } = useAuth();

  const canManage = permissions.manage_announcements;

  // ── Lists ──────────────────────────────────────────────────────────────────
  const [activeList,    setActiveList]    = useState<Announcement[]>([]);
  const [scheduledList, setScheduledList] = useState<Announcement[]>([]);
  const [draftList,     setDraftList]     = useState<Announcement[]>([]);
  const [pastList,      setPastList]      = useState<Announcement[]>([]);
  const [archivedList,  setArchivedList]  = useState<Announcement[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [tab,                  setTab]                  = useState<Tab>('active');
  const [filters,              setFilters]              = useState<{ search: string; category: string; priority: string; dateFrom: string; dateTo: string }>(EMPTY_FILTERS);
  const [sort,                 setSort]                 = useState<SortMode>('newest');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showForm,             setShowForm]             = useState(false);
  const [editingId,            setEditingId]            = useState<string | null>(null);
  const [loading,              setLoading]              = useState(true);
  const [isSubmitting,         setIsSubmitting]         = useState(false);
  const [formError,            setFormError]            = useState<string | null>(null);
  const [formSubmitted,        setFormSubmitted]        = useState(false);
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'danger' | 'warning';
    action(): void;
  }>(null);

  // Grace-period countdown ticker (1s so the Delete button countdown is smooth)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auto-generated medical-records reminders (computed, read-only) ───────────
  const [healthRecords, setHealthRecords] = useState<any[]>([]);
  const [showHealthNames, setShowHealthNames] = useState(false);
  useEffect(() => {
    apiClient
      .getHealthRecords()
      .then((d: any) => setHealthRecords(Array.isArray(d) ? d : []))
      .catch(() => setHealthRecords([]));
  }, []);
  const isPriestView =
    permissions.view_priests === true && permissions.view_diocese !== true && permissions.manage_entities !== true;
  const canSeeHealthSummary = permissions.view_diocese === true || permissions.manage_assignments === true;
  const myHealthRecord = isPriestView
    ? healthRecords.find(
        (p) =>
          (p.email && user?.email && p.email.toLowerCase() === user.email.toLowerCase()) ||
          (p.name && user?.displayName && p.name.toLowerCase() === user.displayName.toLowerCase()),
      )
    : undefined;
  const myHealthReminder = isPriestView && myHealthRecord ? getPriestHealthReminder(myHealthRecord) : null;
  const dioceseHealthSummary = canSeeHealthSummary ? getDioceseHealthSummary(healthRecords) : null;

  // Toast state
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Form ───────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    title:     '',
    content:   '',
    priority:  'medium' as Announcement['priority'],
    category:  'general' as Announcement['category'],
    startDate: '',
    endDate:   '',
    saveAs:    'active' as 'active' | 'draft',
  });

  // ── Auth headers ───────────────────────────────────────────────────────────
  const authHeaders = useMemo<Record<string, string>>(() => ({
    'Content-Type':  'application/json',
    'x-user-name':   user?.name  || "Chancellor's Office",
    'x-user-role':   user?.role  || 'chancellor',
  }), [user]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchActive = useCallback(async () => {
    const res = await fetch('/api/announcements', { credentials: 'include' });
    if (res.ok) setActiveList(await res.json());
  }, []);

  const fetchScheduled = useCallback(async () => {
    const res = await fetch('/api/announcements/scheduled', { credentials: 'include', headers: authHeaders });
    if (res.ok) setScheduledList(await res.json());
  }, [authHeaders]);

  const fetchDrafts = useCallback(async () => {
    const res = await fetch('/api/announcements/drafts', { credentials: 'include', headers: authHeaders });
    if (res.ok) setDraftList(await res.json());
  }, [authHeaders]);

  const fetchPast = useCallback(async () => {
    const res = await fetch('/api/announcements/past', { credentials: 'include', headers: authHeaders });
    if (res.ok) setPastList(await res.json());
  }, [authHeaders]);

  const fetchArchived = useCallback(async () => {
    const res = await fetch('/api/announcements/archived', { credentials: 'include', headers: authHeaders });
    if (res.ok) setArchivedList(await res.json());
  }, [authHeaders]);

  // Initial load — fetch all lists up front so the tab count badges are accurate
  useEffect(() => {
    fetchActive().catch(() => {}).finally(() => setLoading(false));
  }, [fetchActive]);
  useEffect(() => {
    if (!canManage) return;
    fetchScheduled();
    fetchDrafts();
    fetchPast();
    fetchArchived();
  }, [canManage, fetchScheduled, fetchDrafts, fetchPast, fetchArchived]);

  // Refresh the list behind a tab when it is opened
  useEffect(() => {
    if (!canManage) return;
    if (tab === 'scheduled') fetchScheduled();
    else if (tab === 'drafts') fetchDrafts();
    else if (tab === 'past') fetchPast();
  }, [tab, canManage, fetchScheduled, fetchDrafts, fetchPast, fetchArchived]);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message });
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setFormData({ title: '', content: '', priority: 'medium', category: 'general', startDate: '', endDate: '', saveAs: 'active' });
    setEditingId(null);
    setFormError(null);
    setFormSubmitted(false);
  }, []);

  // ── Submit form ────────────────────────────────────────────────────────────
  const handleSubmitForm = useCallback(async (submitStatus?: 'draft' | 'active') => {
    setFormSubmitted(true);
    if (!formData.title.trim() || !formData.content.trim()) {
      setFormError('Please fill in the required fields marked with *.');
      return;
    }
    if (formData.startDate && formData.endDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      setFormError('The end viewing date must be after the start viewing date.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingId) {
        // Edit existing announcement
        const res = await fetch(`/api/announcements/${editingId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders,
          body: JSON.stringify({
            title:     formData.title,
            content:   formData.content,
            priority:  formData.priority,
            category:  formData.category,
            startDate: formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
            endDate:   formData.endDate   ? new Date(formData.endDate).toISOString()   : null,
          }),
        });
        if (!res.ok) {
          setFormError('Could not save changes. Please try again.');
          return;
        }
        const updated: Announcement = await res.json();
        if (updated.status === 'draft') {
          setDraftList((prev) => prev.map((a) => a.id === editingId ? updated : a));
        } else {
          // A changed start date can move the post between Active and Scheduled
          fetchActive();
          fetchScheduled();
        }
        showToast('Changes saved.');
      } else {
        // Create new
        const body = {
          title:      formData.title,
          content:    formData.content,
          author:     user?.name  || "Chancellor's Office",
          authorRole: user?.role  || 'chancellor',
          priority:   formData.priority,
          category:   formData.category,
          status:     submitStatus ?? formData.saveAs,
          startDate:  formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
          endDate:    formData.endDate   ? new Date(formData.endDate).toISOString()   : undefined,
        };

        const res = await fetch('/api/announcements', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const created: Announcement = await res.json();
          if (created.status === 'draft') {
            setDraftList((prev) => [created, ...prev]);
            setTab('drafts');
            showToast('Draft saved. Find it in the Drafts tab.');
          } else if (created.startDate > Date.now()) {
            setScheduledList((prev) => [...prev, created].sort((a, b) => a.startDate - b.startDate));
            setTab('scheduled');
            showToast(`Scheduled — "${created.title}" goes live on ${formatDate(new Date(created.startDate))}.`);
          } else {
            setActiveList((prev) => [created, ...prev]);
            showToast('Announcement published to the board.');
          }
        } else {
          // Optimistic fallback
          const now = Date.now();
          const optimistic: Announcement = {
            id: Math.random().toString(36).substr(2, 9),
            title: formData.title, content: formData.content,
            author: user?.name || "Chancellor's Office",
            authorRole: user?.role || 'chancellor',
            priority: formData.priority, category: formData.category,
            status: submitStatus ?? formData.saveAs,
            pinned: false,
            startDate: formData.startDate ? new Date(formData.startDate).getTime() : now,
            endDate:   formData.endDate   ? new Date(formData.endDate).getTime()   : null,
            publishedAt: (submitStatus ?? formData.saveAs) === 'active' ? now : null,
            archivedAt: null, archivedBy: null,
            createdAt: now,
          };
          if (optimistic.status === 'draft') setDraftList((prev) => [optimistic, ...prev]);
          else if (optimistic.startDate > now) setScheduledList((prev) => [...prev, optimistic].sort((a, b) => a.startDate - b.startDate));
          else setActiveList((prev) => [optimistic, ...prev]);
        }
      }

      resetForm();
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingId, formData, resetForm, user, authHeaders, showToast, fetchActive, fetchScheduled]);

  // ── Hard delete (grace period / drafts) ────────────────────────────────────
  const performDelete = useCallback(async (a: Announcement) => {
    const res = await fetch(`/api/announcements/${a.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      setActiveList((prev)    => prev.filter((x) => x.id !== a.id));
      setScheduledList((prev) => prev.filter((x) => x.id !== a.id));
      setDraftList((prev)     => prev.filter((x) => x.id !== a.id));
      showToast(`"${a.title}" permanently deleted.`);
    } else {
      const err = await res.json().catch(() => ({ error: '' }));
      showToast(err.error || 'Could not delete. The 5-minute delete window may have closed — use Archive instead.');
    }
  }, [authHeaders, showToast]);

  const requestDelete = useCallback((a: Announcement) => {
    const isDraft = a.status === 'draft';
    setConfirmState({
      title: isDraft ? 'Delete this draft?' : 'Permanently delete this post?',
      message: `"${a.title}" will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
      action: () => performDelete(a),
    });
  }, [performDelete]);

  // ── Archive ────────────────────────────────────────────────────────────────
  const performArchive = useCallback(async (a: Announcement) => {
    // Optimistic
    setActiveList((prev) => prev.filter((x) => x.id !== a.id));
    setPastList((prev)   => prev.filter((x) => x.id !== a.id));

    const res = await fetch(`/api/announcements/${a.id}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      showToast(`"${a.title}" moved to Archives.`);
      fetchArchived();
    } else {
      // Restore on failure
      if (a.status === 'active') setActiveList((prev) => [a, ...prev]);
      else setPastList((prev) => [a, ...prev]);
      showToast('Could not archive. Please try again.');
    }
  }, [authHeaders, showToast, fetchArchived]);

  const requestArchive = useCallback((a: Announcement) => {
    setConfirmState({
      title: 'Move to the Archive?',
      message: `"${a.title}" will leave the board and be stored in the dedicated Archives page. You can restore it anytime.`,
      confirmLabel: 'Archive',
      tone: 'warning',
      action: () => performArchive(a),
    });
  }, [performArchive]);

  // ── Restore from archive ───────────────────────────────────────────────────
  const handleRestore = useCallback(async (a: Announcement) => {
    const res = await fetch(`/api/announcements/${a.id}/restore`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      setArchivedList((prev) => prev.filter((x) => x.id !== a.id));
      showToast(`"${a.title}" is back on the Active Board.`);
      fetchActive();
      fetchScheduled();
    } else {
      showToast('Could not restore. Please try again.');
    }
  }, [authHeaders, showToast, fetchActive, fetchScheduled]);

  // ── Publish draft ──────────────────────────────────────────────────────────
  const handlePublishDraft = useCallback(async (a: Announcement) => {
    const res = await fetch(`/api/announcements/${a.id}/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      const published: Announcement = await res.json();
      setDraftList((prev) => prev.filter((x) => x.id !== a.id));
      if (published.startDate > Date.now()) {
        setScheduledList((prev) => [...prev, published].sort((x, y) => x.startDate - y.startDate));
        showToast(`"${a.title}" scheduled — it goes live on ${formatDate(new Date(published.startDate))}.`);
      } else {
        setActiveList((prev) => [published, ...prev]);
        showToast(`"${a.title}" published to the Active Board.`);
      }
    } else {
      showToast('Could not publish. Please try again.');
    }
  }, [authHeaders, showToast]);

  // ── Publish a scheduled post immediately ───────────────────────────────────
  const handlePublishScheduledNow = useCallback(async (a: Announcement) => {
    const res = await fetch(`/api/announcements/${a.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: authHeaders,
      body: JSON.stringify({ startDate: new Date().toISOString() }),
    });

    if (res.ok) {
      setScheduledList((prev) => prev.filter((x) => x.id !== a.id));
      fetchActive();
      showToast(`"${a.title}" is now live on the Active Board.`);
    } else {
      showToast('Could not publish. Please try again.');
    }
  }, [authHeaders, showToast, fetchActive]);

  // ── Pin / unpin ────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async (a: Announcement) => {
    const next = !a.pinned;
    setActiveList((prev) => prev.map((x) => x.id === a.id ? { ...x, pinned: next } : x));

    const res = await fetch(`/api/announcements/${a.id}/pin`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
      body: JSON.stringify({ pinned: next }),
    });

    if (res.ok) {
      showToast(next ? `"${a.title}" pinned to the top of the board.` : `"${a.title}" unpinned.`);
    } else {
      setActiveList((prev) => prev.map((x) => x.id === a.id ? { ...x, pinned: a.pinned } : x));
      showToast('Could not update the pin. Please try again.');
    }
  }, [authHeaders, showToast]);

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = useCallback((a: Announcement) => {
    setFormData({
      title:     a.title,
      content:   a.content,
      priority:  a.priority,
      category:  a.category,
      startDate: a.startDate ? toLocalInputValue(a.startDate) : '',
      endDate:   a.endDate   ? toLocalInputValue(a.endDate)   : '',
      saveAs:    a.status === 'draft' ? 'draft' : 'active',
    });
    setEditingId(a.id);
    setFormError(null);
    setShowForm(true);
  }, []);

  // ── Duplicate ──────────────────────────────────────────────────────────────
  const handleDuplicate = useCallback((a: Announcement) => {
    setFormData({
      title:     `Copy of ${a.title}`.slice(0, TITLE_MAX),
      content:   a.content,
      priority:  a.priority,
      category:  a.category,
      startDate: '',
      endDate:   '',
      saveAs:    'active',
    });
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }, []);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const currentList =
    tab === 'active'    ? activeList    :
    tab === 'scheduled' ? scheduledList :
    tab === 'drafts'    ? draftList     :
    tab === 'past'      ? pastList      : activeList;

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.category !== 'all' ||
    filters.priority !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  // Active filters inside the modal (search stays inline, so it is excluded).
  const announcementFilterCount =
    (filters.category !== 'all' ? 1 : 0) +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (sort !== 'newest' ? 1 : 0);

  const displayed = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const fromMs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
    const toMs = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : null;
    const filtered = currentList.filter((a) =>
      (filters.category === 'all' || a.category === filters.category) &&
      (filters.priority === 'all' || a.priority === filters.priority) &&
      (fromMs === null || a.createdAt >= fromMs) &&
      (toMs === null || a.createdAt <= toMs) &&
      (!q || a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)),
    );

    const priorityRank = { high: 0, medium: 1, low: 2 } as const;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'oldest') return a.createdAt - b.createdAt;
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority] || b.createdAt - a.createdAt;
      // 'newest' — scheduled posts read most naturally soonest-to-go-live first
      if (tab === 'scheduled') return a.startDate - b.startDate;
      return b.createdAt - a.createdAt;
    });

    // Pinned posts always lead the Active Board (stable sort keeps order within groups)
    if (tab === 'active') sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return sorted;
  }, [currentList, filters, sort, tab]);

  const announcementCounts = useMemo(() => ({
    total:  activeList.length,
    urgent: activeList.filter((a) => a.priority === 'high').length,
    events: activeList.filter((a) => a.category === 'event').length,
  }), [activeList]);

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!permissions.view_announcements && !canManage) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-xl max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto">
            <Bell className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-950">Access Denied</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your account role does not have permission to view Diocesan Announcements.
          </p>
        </div>
      </div>
    );
  }

  const TAB_ORDER: Tab[] = ['active', 'scheduled', 'drafts', 'past'];

  const TAB_META: Record<Tab, { label: string; icon: React.ElementType; count: number; description: string }> = {
    active: {
      label: 'Active Board',
      icon: Bell,
      count: activeList.length,
      description: 'Live announcements that everyone can see right now.',
    },
    scheduled: {
      label: 'Scheduled',
      icon: CalendarClock,
      count: scheduledList.length,
      description: 'Published posts waiting for their start date — they go live on the board automatically.',
    },
    drafts: {
      label: 'Drafts',
      icon: FileText,
      count: draftList.length,
      description: 'Saved but not yet published — only your team can see these. Publish or delete them anytime.',
    },
    past: {
      label: 'Past',
      icon: Clock,
      count: pastList.length,
      description: 'Announcements that reached their end date and left the board. They move to the Archive automatically after 1 year.',
    },
  };

  const summaryCards = [
    { label: 'Total Posts',    value: announcementCounts.total,  icon: Megaphone     },
    { label: 'Urgent Notices', value: announcementCounts.urgent, icon: AlertTriangle },
    { label: 'Event Updates',  value: announcementCounts.events, icon: CalendarDays  },
  ];

  const emptyMeta: Record<Tab, { message: string; sub: string }> = {
    active:    { message: 'No active announcements', sub: 'Posts will appear here once published.' },
    scheduled: { message: 'Nothing scheduled',       sub: 'Posts with a future start date wait here until they go live.' },
    drafts:    { message: 'No drafts',               sub: 'Announcements you save as drafts will appear here.' },
    past:      { message: 'No past announcements',   sub: 'Posts whose end date has passed will appear here.' },
  };
  const EmptyIcon = TAB_META[tab].icon;

  return (
    <div className="min-h-screen bg-[#f5f5f5] pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        {/* ── Masthead ── */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-black/10 bg-slate-950 text-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gold-500" />
          <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between md:px-8 md:py-7">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-gold-400" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-400">
                  Official Bulletin · Chancellor&apos;s Office
                </p>
              </div>
              <h1 className="mt-3 font-serif text-3xl font-bold leading-none tracking-normal text-white md:text-4xl">
                Chancellor&apos;s Board
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/50">
                Central posting space for diocesan updates, directives, financial notices, and event reminders.
              </p>
            </div>
            <div className="shrink-0 space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35 md:text-right">
                As of {formatDate(new Date())}
              </p>
              <div className="flex items-stretch divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:min-w-[360px]">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="flex-1 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-gold-400" />
                        <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
                          {card.label}
                        </span>
                      </div>
                      <p className="mt-1.5 font-serif text-2xl font-bold leading-none text-white">{card.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Auto-generated medical-records reminders (System · Important) ── */}
        {myHealthReminder && (
          <div className="mb-6 flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                  System · Important
                </span>
                <p className="text-sm font-black text-amber-900">{myHealthReminder.title}</p>
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-amber-800">{myHealthReminder.content}</p>
            </div>
          </div>
        )}
        {dioceseHealthSummary && (
          <button
            onClick={() => setShowHealthNames(true)}
            className="mb-6 flex w-full items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left transition-colors hover:bg-amber-100 md:p-6"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                  System · Important
                </span>
                <p className="text-sm font-black text-amber-900">{dioceseHealthSummary.title}</p>
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-amber-800">{dioceseHealthSummary.content}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-amber-500" />
          </button>
        )}

        {/* ── Diocesan drill-down: priests with pending medical records ── */}
        <AnimatePresence>
          {showHealthNames && dioceseHealthSummary && (
            <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHealthNames(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">System · Important</p>
                    <h3 className="mt-0.5 text-lg font-black text-slate-950">Pending Medical Records</h3>
                  </div>
                  <button
                    onClick={() => setShowHealthNames(false)}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="divide-y divide-slate-50 overflow-y-auto px-2 py-2">
                  {(dioceseHealthSummary.names ?? []).map((n, i) => (
                    <div key={`${n.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{n.name}</p>
                        {n.parish && <p className="truncate text-[11px] text-slate-400">{n.parish}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                        {n.status}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Sidebar + feed ── */}
        <div className={`grid grid-cols-1 gap-6 lg:items-start ${canManage ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
          {canManage && (
          <aside className="custom-scrollbar space-y-4 lg:sticky lg:top-2 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
              >
                <Plus className="h-4 w-4" />
                New Announcement
              </button>

              <nav className="rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <p className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Board Sections
                </p>
                {TAB_ORDER.map((id) => {
                  const meta = TAB_META[id];
                  const Icon = meta.icon;
                  const isActive = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] transition-all ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-gold-400' : 'text-slate-400'}`} />
                      <span className="flex-1 truncate">{meta.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                          isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {meta.count}
                      </span>
                    </button>
                  );
                })}
                <p className="m-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[11px] font-medium leading-relaxed text-slate-500">
                  {TAB_META[tab].description}
                </p>
              </nav>
          </aside>
          )}

          <div className="min-w-0">
        {/* ── Filter bar — search inline, everything else in the modal ── */}
        <div className="mb-4 flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search announcements…"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
            />
          </div>
          {hasActiveFilters && (
            <span className="hidden items-center justify-center rounded-2xl bg-slate-50 px-3 text-xs font-bold text-slate-400 sm:flex">
              {displayed.length} found
            </span>
          )}
          <FilterModal
            activeCount={announcementFilterCount}
            onClear={() => {
              setFilters(EMPTY_FILTERS);
              setSort('newest');
            }}
          >
            <FilterField label="Category">
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className={selectField(filters.category !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All categories</option>
                <option value="general">General</option>
                <option value="financial">Financial</option>
                <option value="administrative">Administrative</option>
                <option value="event">Event</option>
              </select>
            </FilterField>

            <FilterField label="Priority">
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className={selectField(filters.priority !== 'all', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="all">All priorities</option>
                <option value="high">Urgent</option>
                <option value="medium">Important</option>
                <option value="low">Routine</option>
              </select>
            </FilterField>

            <FilterField label="Sort by">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className={selectField(sort !== 'newest', 'h-11 w-full rounded-2xl px-4 text-sm font-bold')}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priority">By priority</option>
              </select>
            </FilterField>

            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Posted from">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className={dateField(Boolean(filters.dateFrom), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                />
              </FilterField>
              <FilterField label="Posted to">
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className={dateField(Boolean(filters.dateTo), 'h-11 w-full rounded-2xl px-3 text-sm font-semibold')}
                />
              </FilterField>
            </div>
          </FilterModal>
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white">
            <InlineLoader label="Loading announcements" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-slate-300 bg-white py-24">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
              <EmptyIcon className="h-9 w-9 text-slate-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-serif font-bold text-slate-950">
                {hasActiveFilters ? 'No announcements match your filters' : emptyMeta[tab].message}
              </p>
              <p className="text-sm text-slate-400">
                {hasActiveFilters ? 'Try adjusting or clearing the filters above.' : emptyMeta[tab].sub}
              </p>
            </div>
            {canManage && tab === 'active' && !hasActiveFilters && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="rounded-2xl bg-black px-6 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800"
              >
                Post First Announcement
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {displayed.map((a, i) => (
                <AnnouncementRow
                  key={a.id}
                  announcement={a}
                  index={i}
                  tab={tab}
                  canManage={canManage}
                  tick={tick}
                  onView={() => setSelectedAnnouncement(a)}
                  onEdit={() => handleEdit(a)}
                  onDelete={() => requestDelete(a)}
                  onArchive={() => requestArchive(a)}
                  onRestore={() => handleRestore(a)}
                  onPublish={() => handlePublishDraft(a)}
                  onPublishNow={() => handlePublishScheduledNow(a)}
                  onTogglePin={() => handleTogglePin(a)}
                  onDuplicate={() => handleDuplicate(a)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* ── Create / Edit modal ── */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              {/* Modal header — dark with gold trim, distinct from Events */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold-500/50 bg-slate-950 p-6 text-white md:p-8">
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">
                    {editingId ? 'Announcement Editor' : 'New Post'}
                  </p>
                  <h2 className="font-serif text-xl font-bold tracking-tight text-white md:text-2xl">
                    {editingId ? 'Edit Announcement' : 'New Announcement'}
                  </h2>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white/50 transition-all hover:rotate-90 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="custom-scrollbar flex-1 overflow-y-auto">
                <div className="space-y-6 p-6 md:p-8">
                  {/* Title */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                      <Megaphone className="h-3.5 w-3.5" />
                      Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      maxLength={TITLE_MAX}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. Clergy Assembly, Financial Report Deadline…"
                      className={`w-full rounded-2xl border bg-slate-50/50 px-5 py-4 text-base font-medium transition-all placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-4 ${
                        formSubmitted && !formData.title.trim()
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                          : 'border-slate-200 focus:border-gold-500 focus:ring-gold-500/10'
                      }`}
                    />
                    <p className="text-right text-[10px] font-semibold text-slate-400">
                      {formData.title.length}/{TITLE_MAX}
                    </p>
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                      Content <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={formData.content}
                      maxLength={CONTENT_MAX}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Write the full announcement here…"
                      rows={6}
                      className={`w-full resize-none rounded-2xl border bg-slate-50/50 px-5 py-4 text-sm font-medium transition-all placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-4 ${
                        formSubmitted && !formData.content.trim()
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                          : 'border-slate-200 focus:border-gold-500 focus:ring-gold-500/10'
                      }`}
                    />
                    <p className="text-right text-[10px] font-semibold text-slate-400">
                      {formData.content.length}/{CONTENT_MAX}
                    </p>
                  </div>

                  {/* Category | Priority */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                        Category <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value as Announcement['category'] })}
                          className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-sm font-medium transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                        >
                          <option value="general">General</option>
                          <option value="financial">Financial</option>
                          <option value="administrative">Administrative</option>
                          <option value="event">Event</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                        Priority <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.priority}
                          onChange={(e) => setFormData({ ...formData, priority: e.target.value as Announcement['priority'] })}
                          className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-sm font-medium transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                        >
                          <option value="low">Low – Routine</option>
                          <option value="medium">Medium – Important</option>
                          <option value="high">High – Urgent</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>

                  {/* Start | End viewing dates */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                        Start Viewing Date <span className="font-medium normal-case text-slate-300">(optional)</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-sm font-medium transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                      />
                      <p className="text-[10px] font-medium text-slate-400">
                        Leave blank to show immediately. A future date schedules the post.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                        End Viewing Date <span className="font-medium normal-case text-slate-300">(optional)</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.endDate}
                        min={formData.startDate || undefined}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-4 text-sm font-medium transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                      />
                      <p className="text-[10px] font-medium text-slate-400">Leave blank to keep the post up indefinitely.</p>
                    </div>
                  </div>

                  {!editingId && (
                    <p className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Once published, you have 5 minutes to delete. After that, only edit or archive is available.
                    </p>
                  )}

                  {formError && (
                    <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-500">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {formError}
                    </p>
                  )}

                  {/* Buttons */}
                  {editingId ? (
                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="w-full rounded-2xl px-6 py-4 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50 sm:flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSubmitForm()}
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-500 px-6 py-4 text-sm font-bold text-church-green-dark shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-600 disabled:opacity-50 sm:flex-[2]"
                      >
                        {isSubmitting ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-church-green-dark/30 border-t-church-green-dark" /> : <><Check className="h-5 w-5" />Save Changes</>}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="w-full rounded-2xl px-6 py-4 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50 sm:flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSubmitForm('draft')}
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-6 py-4 text-sm font-bold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
                      >
                        {isSubmitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-700" /> : 'Save as Draft'}
                      </button>
                      <button
                        onClick={() => handleSubmitForm('active')}
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-500 px-6 py-4 text-sm font-bold text-church-green-dark shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-600 disabled:opacity-50 sm:flex-[2]"
                      >
                        {isSubmitting ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-church-green-dark/30 border-t-church-green-dark" /> : <><Send className="h-4 w-4" />Publish Now</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── View modal ── */}
      <AnimatePresence>
        {selectedAnnouncement && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gold-500/50 bg-slate-950 p-6 text-white md:p-8">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {selectedAnnouncement.pinned && selectedAnnouncement.status === 'active' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold-700">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${PRIORITY_STYLES[selectedAnnouncement.priority].badge}`}>
                      {PRIORITY_STYLES[selectedAnnouncement.priority].label}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                      {CATEGORY_META[selectedAnnouncement.category].label}
                    </span>
                    {selectedAnnouncement.status !== 'active' && (
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                        {selectedAnnouncement.status}
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-2xl font-bold leading-tight text-white md:text-3xl">
                    {selectedAnnouncement.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/60">
                    <div className="flex items-center gap-1.5"><User className="h-4 w-4" />{selectedAnnouncement.author}</div>
                    <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatDate(new Date(selectedAnnouncement.createdAt))}</div>
                    {selectedAnnouncement.endDate && (
                      <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Visible until {formatDate(new Date(selectedAnnouncement.endDate))}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAnnouncement(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/50 transition-all hover:rotate-90 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-8">
                <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-6">
                  <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{selectedAnnouncement.content}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirm dialog ── */}
      <AnimatePresence>
        {confirmState && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmState(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl md:p-8"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                confirmState.tone === 'danger' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-600'
              }`}>
                {confirmState.tone === 'danger' ? <Trash2 className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
              </div>
              <h3 className="mt-4 font-serif text-2xl font-bold text-slate-950">{confirmState.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{confirmState.message}</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  onClick={() => setConfirmState(null)}
                  className="flex-1 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-500 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { const { action } = confirmState; setConfirmState(null); action(); }}
                  className={`flex-1 rounded-2xl px-5 py-3.5 text-sm font-bold text-white transition-all ${
                    confirmState.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-500 hover:bg-amber-400'
                  }`}
                >
                  {confirmState.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-[130] -translate-x-1/2 rounded-2xl bg-slate-950 px-6 py-4 text-sm font-medium text-white shadow-2xl"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Announcement card (one Events-style skeleton for every tab) ──────────────

function AnnouncementRow({
  announcement: a, index, tab, canManage, tick,
  onView, onEdit, onDelete, onArchive, onRestore, onPublish, onPublishNow, onTogglePin, onDuplicate,
}: {
  announcement: Announcement;
  index: number;
  tab: Tab;
  canManage: boolean;
  tick: number;
  onView(): void;
  onEdit(): void;
  onDelete(): void;
  onArchive(): void;
  onRestore(): void;
  onPublish(): void;
  onPublishNow(): void;
  onTogglePin(): void;
  onDuplicate(): void;
}) {
  const priority = PRIORITY_STYLES[a.priority];
  const category = CATEGORY_META[a.category];
  const tile = dateTileParts(a.startDate);
  const muted = tab === 'past';
  const inGrace = canManage && (tab === 'active' || tab === 'scheduled') && withinGracePeriod(a.publishedAt);
  const secsLeft = inGrace ? gracePeriodSecondsLeft(a.publishedAt) : 0;
  void tick; // consumed so the countdown re-renders every second

  let rail: string = priority.rail;
  if (tab === 'drafts') rail = 'bg-slate-300';
  else if (muted) rail = 'bg-slate-200';
  else if (tab === 'active' && a.pinned) rail = 'bg-gold-500';

  const metaParts: string[] = [a.author];
  if (tab === 'active') {
    metaParts.push(`Posted ${formatDate(new Date(a.createdAt))}`);
    if (a.endDate) metaParts.push(`Visible until ${formatDate(new Date(a.endDate))}`);
  } else if (tab === 'scheduled') {
    metaParts.push(`Created ${formatDate(new Date(a.createdAt))}`);
    if (a.endDate) metaParts.push(`Visible until ${formatDate(new Date(a.endDate))}`);
  } else if (tab === 'drafts') {
    metaParts.push(`Created ${formatDate(new Date(a.createdAt))}`);
  } else if (tab === 'past') {
    if (a.endDate) metaParts.push(`Ended ${formatDate(new Date(a.endDate))}`);
    metaParts.push('Auto-archives after 1 year');
  }

  return (
    <motion.div
      key={a.id}
      role="button" tabIndex={0}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.04 }}
      onClick={onView}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] ${
        muted ? 'opacity-70' : ''
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${rail}`} />

      <div className="grid gap-5 p-5 pl-6 md:grid-cols-[82px_minmax(0,1fr)] md:p-6 md:pl-8">
        {/* Date column — dark tile with gold accent (Events uses a light one) */}
        <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl text-center ${
          muted ? 'border border-slate-200 bg-slate-100' : 'bg-slate-950'
        }`}>
          <div className={`text-[10px] font-black uppercase tracking-widest ${muted ? 'text-slate-400' : 'text-gold-400'}`}>{tile.month}</div>
          <div className={`mt-1 font-serif text-3xl font-bold leading-none ${muted ? 'text-slate-500' : 'text-white'}`}>{tile.day}</div>
          <div className={`mt-1 text-[10px] font-black ${muted ? 'text-slate-400' : 'text-white/40'}`}>{tile.year}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className={`font-serif text-xl font-bold leading-tight md:text-2xl ${muted ? 'text-slate-600' : 'text-slate-950'}`}>
              {a.title}
            </h2>

            {canManage && (
              <div className="-mr-1 -mt-0.5 flex shrink-0 flex-wrap items-center justify-end gap-1">
                {tab === 'active' && (
                  <>
                    <IconRowButton
                      icon={a.pinned ? PinOff : Pin}
                      title={a.pinned ? 'Unpin from top' : 'Pin to top'}
                      active={a.pinned}
                      onClick={onTogglePin}
                    />
                    <IconRowButton icon={Copy} title="Duplicate" onClick={onDuplicate} />
                    <RowButton icon={Edit2} label="Edit" onClick={onEdit} />
                    <RowButton icon={Archive} label="Archive" tone="warning" onClick={onArchive} />
                    {inGrace && (
                      <RowButton icon={Trash2} label={`Delete · ${formatCountdown(secsLeft)}`} tone="danger" onClick={onDelete} />
                    )}
                  </>
                )}
                {tab === 'scheduled' && (
                  <>
                    <IconRowButton icon={Copy} title="Duplicate" onClick={onDuplicate} />
                    <RowButton icon={Send} label="Publish now" tone="primary" onClick={onPublishNow} />
                    <RowButton icon={Edit2} label="Edit" onClick={onEdit} />
                    {inGrace && (
                      <RowButton icon={Trash2} label={`Delete · ${formatCountdown(secsLeft)}`} tone="danger" onClick={onDelete} />
                    )}
                  </>
                )}
                {tab === 'drafts' && (
                  <>
                    <RowButton icon={Send} label="Publish" tone="primary" onClick={onPublish} />
                    <RowButton icon={Edit2} label="Edit" onClick={onEdit} />
                    <RowButton icon={Trash2} label="Delete" tone="danger" onClick={onDelete} />
                  </>
                )}
                {tab === 'past' && (
                  <>
                    <IconRowButton icon={Copy} title="Duplicate" onClick={onDuplicate} />
                    <RowButton icon={Archive} label="Archive" tone="warning" onClick={onArchive} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tab === 'active' && a.pinned && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-gold-700">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
            {tab === 'scheduled' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-gold-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
                </span>
                Goes live {formatDate(new Date(a.startDate))}
              </span>
            )}
            {tab === 'drafts' && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Draft — not published
              </span>
            )}
            {tab === 'past' && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Ended — no longer on the board
              </span>
            )}
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${priority.badge}`}>
              {priority.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <category.icon className="h-3 w-3" />
              {category.label}
            </span>
          </div>

          {/* Content preview */}
          <p className={`mt-3 max-w-3xl text-sm leading-relaxed line-clamp-2 ${muted ? 'text-slate-400' : 'text-slate-500'}`}>
            {a.content}
          </p>

          {/* Meta — small-caps register line */}
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{metaParts.join('  ·  ')}</p>

          {!canManage && (
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition-colors group-hover:text-slate-600">
              Read full announcement <ChevronRight className="h-3.5 w-3.5" />
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
