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
  Archive,
  RotateCcw,
  FileText,
  Clock,
  Eye,
  AlertTriangle,
  Info,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';

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
  startDate: number;
  endDate: number | null;
  publishedAt: number | null;
  archivedAt: number | null;
  archivedBy: string | null;
  createdAt: number;
}

type Tab = 'active' | 'drafts' | 'past' | 'archived';

// ── Static maps ──────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  low:    { badge: 'bg-sky-50 text-sky-700 border-sky-100',    rail: 'border-sky-400',   label: 'Routine'   },
  medium: { badge: 'bg-amber-50 text-amber-700 border-amber-100', rail: 'border-amber-400', label: 'Important' },
  high:   { badge: 'bg-rose-50 text-rose-700 border-rose-100',  rail: 'border-rose-400',  label: 'Urgent'    },
} as const;

const CATEGORY_META = {
  general:        { icon: Megaphone,    label: 'General'        },
  financial:      { icon: Wallet,       label: 'Financial'      },
  administrative: { icon: ClipboardList, label: 'Administrative' },
  event:          { icon: CalendarDays, label: 'Event'          },
} as const;

const GRACE_PERIOD_MS = 5 * 60 * 1000;

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

// ── Small labeled action button ──────────────────────────────────────────────

const BUTTON_TONES = {
  neutral: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
  blue:    'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  primary: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  danger:  'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
} as const;

function ActionButton({
  icon: Icon, label, tone, onClick,
}: {
  icon: React.ElementType;
  label: string;
  tone: keyof typeof BUTTON_TONES;
  onClick(): void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${BUTTON_TONES[tone]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function Announcements() {
  const { permissions } = usePermissions();
  const { user } = useAuth();

  const canManage = permissions.manage_announcements;

  // ── Lists ──────────────────────────────────────────────────────────────────
  const [activeList,   setActiveList]   = useState<Announcement[]>([]);
  const [draftList,    setDraftList]    = useState<Announcement[]>([]);
  const [pastList,     setPastList]     = useState<Announcement[]>([]);
  const [archivedList, setArchivedList] = useState<Announcement[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [tab,                  setTab]                  = useState<Tab>('active');
  const [filter,               setFilter]               = useState<'all' | Announcement['category']>('all');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showForm,             setShowForm]             = useState(false);
  const [editingId,            setEditingId]            = useState<string | null>(null);

  // Grace-period countdown ticker (1s so the Delete button countdown is smooth)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
  useEffect(() => { fetchActive(); }, [fetchActive]);
  useEffect(() => {
    if (!canManage) return;
    fetchDrafts();
    fetchPast();
    fetchArchived();
  }, [canManage, fetchDrafts, fetchPast, fetchArchived]);

  // Refresh the list behind a tab when it is opened
  useEffect(() => {
    if (!canManage) return;
    if (tab === 'drafts') fetchDrafts();
    else if (tab === 'past') fetchPast();
    else if (tab === 'archived') fetchArchived();
  }, [tab, canManage, fetchDrafts, fetchPast, fetchArchived]);

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
  }, []);

  // ── Submit form ────────────────────────────────────────────────────────────
  const handleSubmitForm = useCallback(async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Please fill in the title and content.');
      return;
    }

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
          startDate: formData.startDate || undefined,
          endDate:   formData.endDate   || null,
        }),
      });
      if (res.ok) {
        const updated: Announcement = await res.json();
        setActiveList((prev) => prev.map((a) => a.id === editingId ? updated : a));
        setDraftList((prev)  => prev.map((a) => a.id === editingId ? updated : a));
        showToast('Changes saved.');
      }
    } else {
      // Create new
      const body = {
        title:      formData.title,
        content:    formData.content,
        author:     user?.name  || "Chancellor's Office",
        authorRole: user?.role  || 'chancellor',
        priority:   formData.priority,
        category:   formData.category,
        status:     formData.saveAs,
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
          status: formData.saveAs,
          startDate: formData.startDate ? new Date(formData.startDate).getTime() : now,
          endDate:   formData.endDate   ? new Date(formData.endDate).getTime()   : null,
          publishedAt: formData.saveAs === 'active' ? now : null,
          archivedAt: null, archivedBy: null,
          createdAt: now,
        };
        if (optimistic.status === 'draft') setDraftList((prev) => [optimistic, ...prev]);
        else setActiveList((prev) => [optimistic, ...prev]);
      }
    }

    resetForm();
    setShowForm(false);
  }, [editingId, formData, resetForm, user, authHeaders, showToast]);

  // ── Hard delete (grace period / drafts) ────────────────────────────────────
  const handleHardDelete = useCallback(async (a: Announcement) => {
    const isDraft = a.status === 'draft';
    const msg = isDraft
      ? 'Permanently delete this draft? This cannot be undone.'
      : 'Permanently delete this announcement? This cannot be undone.';
    if (!confirm(msg)) return;

    const res = await fetch(`/api/announcements/${a.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      setActiveList((prev) => prev.filter((x) => x.id !== a.id));
      setDraftList((prev)  => prev.filter((x) => x.id !== a.id));
      showToast(`"${a.title}" permanently deleted.`);
    } else {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(err.error || 'Could not delete. The 5-minute delete window may have closed — use Archive instead.');
    }
  }, [authHeaders, showToast]);

  // ── Archive ────────────────────────────────────────────────────────────────
  const handleArchive = useCallback(async (a: Announcement) => {
    // Optimistic
    setActiveList((prev) => prev.filter((x) => x.id !== a.id));
    setPastList((prev)   => prev.filter((x) => x.id !== a.id));

    const res = await fetch(`/api/announcements/${a.id}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      showToast(`"${a.title}" moved to the Archive tab.`);
      fetchArchived();
    } else {
      // Restore on failure
      if (a.status === 'active') setActiveList((prev) => [a, ...prev]);
      else setPastList((prev) => [a, ...prev]);
    }
  }, [authHeaders, showToast, fetchArchived]);

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
    } else {
      alert('Could not restore. Please try again.');
    }
  }, [authHeaders, showToast, fetchActive]);

  // ── Publish draft ──────────────────────────────────────────────────────────
  const handlePublishDraft = useCallback(async (a: Announcement) => {
    const res = await fetch(`/api/announcements/${a.id}/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
    });

    if (res.ok) {
      const published: Announcement = await res.json();
      setDraftList((prev)  => prev.filter((x) => x.id !== a.id));
      setActiveList((prev) => [published, ...prev]);
      showToast(`"${a.title}" published to the Active Board.`);
    } else {
      alert('Could not publish. Please try again.');
    }
  }, [authHeaders, showToast]);

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = useCallback((a: Announcement) => {
    setFormData({
      title:     a.title,
      content:   a.content,
      priority:  a.priority,
      category:  a.category,
      startDate: a.startDate ? new Date(a.startDate).toISOString().slice(0, 16) : '',
      endDate:   a.endDate   ? new Date(a.endDate).toISOString().slice(0, 16)   : '',
      saveAs:    a.status === 'draft' ? 'draft' : 'active',
    });
    setEditingId(a.id);
    setShowForm(true);
  }, []);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filteredActive = useMemo(
    () => filter === 'all' ? activeList : activeList.filter((a) => a.category === filter),
    [activeList, filter],
  );

  const announcementCounts = useMemo(() => ({
    total:  activeList.length,
    urgent: activeList.filter((a) => a.priority === 'high').length,
    events: activeList.filter((a) => a.category === 'event').length,
  }), [activeList]);

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!permissions.view_announcements && !canManage) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-xl max-w-md text-center space-y-6">
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

  const TAB_ORDER: Tab[] = ['active', 'drafts', 'past', 'archived'];

  const TAB_META: Record<Tab, { label: string; icon: React.ElementType; count: number; description: string }> = {
    active: {
      label: 'Active Board',
      icon: Bell,
      count: activeList.length,
      description: 'Live announcements that everyone can see right now.',
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
    archived: {
      label: 'Archive',
      icon: Archive,
      count: archivedList.length,
      description: 'Long-term records. Restoring a post sends it back to the Active Board.',
    },
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="rounded-[36px] border border-white/70 bg-white/85 backdrop-blur-xl shadow-[0_24px_80px_rgba(15,23,42,0.08)] p-6 md:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 rounded-full bg-slate-950 px-4 py-2 text-white mb-5">
                <Bell className="w-4 h-4 text-gold-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Announcement Board</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight text-slate-950">
                Chancellor&apos;s Board
              </h1>
              <p className="mt-3 text-sm md:text-base text-slate-600 max-w-2xl leading-relaxed">
                Central posting space for diocesan updates, directives, financial notices, and event reminders.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gold-500 hover:bg-gold-600 text-church-green-dark px-6 py-4 font-bold text-[11px] uppercase tracking-[0.22em] transition-all shadow-xl shadow-gold-500/20"
              >
                <Plus className="w-4 h-4" />
                New Announcement
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {[
              { label: 'Total Posts',     value: announcementCounts.total,  tone: 'bg-slate-50 text-slate-700 border-slate-200'   },
              { label: 'Urgent Notices',  value: announcementCounts.urgent, tone: 'bg-rose-50 text-rose-700 border-rose-200'       },
              { label: 'Event Updates',   value: announcementCounts.events, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl border px-5 py-4 ${item.tone}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">{item.label}</p>
                <p className="mt-2 text-3xl font-serif font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Toolbar ── */}
        {canManage ? (
          <div className="mb-6 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Segmented tabs */}
              <div className="inline-flex flex-wrap items-center gap-1 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm">
                {TAB_ORDER.map((id) => {
                  const meta = TAB_META[id];
                  const Icon = meta.icon;
                  const isActive = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`inline-flex items-center gap-2 rounded-[18px] px-4 md:px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-lg'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{meta.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {meta.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Category dropdown — same row, only relevant on the Active Board */}
              {tab === 'active' && (
                <label className="inline-flex items-center gap-2 self-start lg:self-auto">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Category</span>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-500/10"
                  >
                    <option value="all">All Posts</option>
                    <option value="general">General</option>
                    <option value="financial">Financial</option>
                    <option value="administrative">Administrative</option>
                    <option value="event">Event</option>
                  </select>
                </label>
              )}
            </div>

            {/* What-am-I-looking-at helper */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3">
              <Info className="w-4 h-4 text-gold-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">{TAB_META[tab].description}</p>
            </div>
          </div>
        ) : (
          /* View-only users: just a simple category filter */
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mr-1">Filter</span>
            {(['all', 'general', 'financial', 'administrative', 'event'] as const).map((cat) => {
              const isActive = filter === cat;
              const meta = cat === 'all' ? null : CATEGORY_META[cat];
              const Icon = meta?.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                    isActive
                      ? 'bg-gold-500 text-church-green-dark border-gold-500 shadow-md shadow-gold-500/20'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                  {cat === 'all' ? 'All Posts' : meta?.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Lists ── */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">

            {/* Active */}
            {tab === 'active' && (filteredActive.length === 0 ? (
              <EmptyState icon={Bell} message="No active announcements" sub="Posts will appear here once published." />
            ) : filteredActive.map((a, i) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                index={i}
                canManage={canManage}
                tick={tick}
                onView={() => setSelectedAnnouncement(a)}
                onEdit={() => handleEdit(a)}
                onDelete={() => handleHardDelete(a)}
                onArchive={() => handleArchive(a)}
              />
            )))}

            {/* Drafts */}
            {tab === 'drafts' && (draftList.length === 0 ? (
              <EmptyState icon={FileText} message="No drafts" sub="Announcements you save as drafts will appear here." />
            ) : draftList.map((a, i) => (
              <DraftCard
                key={a.id}
                announcement={a}
                index={i}
                onView={() => setSelectedAnnouncement(a)}
                onEdit={() => handleEdit(a)}
                onPublish={() => handlePublishDraft(a)}
                onDelete={() => handleHardDelete(a)}
              />
            )))}

            {/* Past */}
            {tab === 'past' && (pastList.length === 0 ? (
              <EmptyState icon={Clock} message="No past announcements" sub="Announcements whose end date has passed will appear here." />
            ) : pastList.map((a, i) => (
              <PastCard
                key={a.id}
                announcement={a}
                index={i}
                onView={() => setSelectedAnnouncement(a)}
                onArchive={() => handleArchive(a)}
              />
            )))}

            {/* Archived */}
            {tab === 'archived' && (archivedList.length === 0 ? (
              <EmptyState icon={Archive} message="Archive is empty" sub="Archived announcements are stored here." />
            ) : archivedList.map((a, i) => (
              <ArchivedCard
                key={a.id}
                announcement={a}
                index={i}
                onView={() => setSelectedAnnouncement(a)}
                onRestore={() => handleRestore(a)}
              />
            )))}

          </AnimatePresence>
        </div>
      </div>

      {/* ── Create / Edit modal ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[32px] shadow-2xl max-w-3xl w-full p-6 md:p-8 border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-600 mb-2">
                    Announcement Editor
                  </p>
                  <h2 className="text-3xl font-serif font-bold text-slate-950">
                    {editingId ? 'Edit Announcement' : 'New Announcement'}
                  </h2>
                </div>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-2xl transition-colors">
                  <X className="w-6 h-6 text-slate-500" />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Announcement title"
                    className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">Content</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Announcement content"
                    rows={6}
                    className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none resize-none text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as Announcement['category'] })}
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                    >
                      <option value="general">General</option>
                      <option value="financial">Financial</option>
                      <option value="administrative">Administrative</option>
                      <option value="event">Event</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as Announcement['priority'] })}
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                    >
                      <option value="low">Low – Routine</option>
                      <option value="medium">Medium – Important</option>
                      <option value="high">High – Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                      Start Viewing Date
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Leave blank to show immediately.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                      End Viewing Date
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 outline-none text-sm font-medium"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Leave blank to keep active indefinitely.</p>
                  </div>
                </div>

                {!editingId && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">Save As</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['draft', 'active'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormData({ ...formData, saveAs: opt })}
                          className={`px-5 py-4 rounded-2xl border-2 font-bold text-sm transition-all ${
                            formData.saveAs === opt
                              ? opt === 'draft'
                                ? 'border-slate-400 bg-slate-100 text-slate-900'
                                : 'border-gold-500 bg-gold-50 text-gold-800'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {opt === 'draft' ? 'Save as Draft' : 'Publish Now'}
                        </button>
                      ))}
                    </div>
                    {formData.saveAs === 'active' && (
                      <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Once published, you have 5 minutes to delete. After that, only edit or archive is available.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 px-5 py-4 rounded-2xl transition-colors font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitForm}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-800 text-white px-5 py-4 rounded-2xl transition-colors font-bold text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {editingId ? 'Save Changes' : formData.saveAs === 'draft' ? 'Save Draft' : 'Publish Announcement'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── View modal ── */}
      <AnimatePresence>
        {selectedAnnouncement && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedAnnouncement(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[32px] shadow-2xl max-w-3xl w-full p-6 md:p-8 max-h-[85vh] overflow-y-auto border border-slate-100"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${PRIORITY_STYLES[selectedAnnouncement.priority].badge}`}>
                      {PRIORITY_STYLES[selectedAnnouncement.priority].label}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {CATEGORY_META[selectedAnnouncement.category].label}
                    </span>
                    {selectedAnnouncement.status !== 'active' && (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        {selectedAnnouncement.status}
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-serif font-bold text-slate-950 leading-tight">
                    {selectedAnnouncement.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{selectedAnnouncement.author}</div>
                    <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(new Date(selectedAnnouncement.createdAt))}</div>
                    {selectedAnnouncement.endDate && (
                      <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Visible until {formatDate(new Date(selectedAnnouncement.endDate))}</div>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedAnnouncement(null)} className="p-2 hover:bg-slate-100 rounded-2xl transition-colors shrink-0">
                  <X className="w-6 h-6 text-slate-500" />
                </button>
              </div>
              <div className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-6">
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedAnnouncement.content}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 text-sm font-medium"
          >
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message, sub }: { icon: React.ElementType; message: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded-[32px] border border-dashed border-slate-200 bg-white/80 p-16 text-center"
    >
      <Icon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <p className="text-lg font-serif font-bold text-slate-900">{message}</p>
      <p className="text-slate-500 mt-1">{sub}</p>
    </motion.div>
  );
}

function AnnouncementCard({
  announcement: a, index, canManage, tick,
  onView, onEdit, onDelete, onArchive,
}: {
  announcement: Announcement; index: number; canManage: boolean; tick: number;
  onView(): void; onEdit(): void; onDelete(): void; onArchive(): void;
}) {
  const priority = PRIORITY_STYLES[a.priority];
  const Icon = CATEGORY_META[a.category].icon;
  const inGrace = canManage && withinGracePeriod(a.publishedAt);
  const secsLeft = inGrace ? gracePeriodSecondsLeft(a.publishedAt) : 0;
  void tick; // consumed so the countdown re-renders every second

  return (
    <motion.div
      key={a.id}
      role="button" tabIndex={0}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.04 }}
      onClick={onView}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
      className={`w-full cursor-pointer text-left bg-white rounded-[30px] border-l-4 ${priority.rail} p-6 border-t border-r border-b border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-900/5 transition-all`}
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${priority.badge}`}>
              {priority.label}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              {CATEGORY_META[a.category].label}
            </span>
          </div>
          <h3 className="font-bold text-xl text-slate-950 leading-tight">{a.title}</h3>
          <p className="text-slate-600 mt-3 line-clamp-2 leading-relaxed">{a.content}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-500">
            <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{a.author}</div>
            <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(new Date(a.createdAt))}</div>
            {a.endDate && (
              <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Visible until {formatDate(new Date(a.endDate))}</div>
            )}
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <ActionButton icon={Eye}     label="View"    tone="neutral" onClick={onView} />
          <ActionButton icon={Edit2}   label="Edit"    tone="blue"    onClick={onEdit} />
          <ActionButton icon={Archive} label="Archive" tone="warning" onClick={onArchive} />
          {inGrace && (
            <>
              <ActionButton icon={Trash2} label={`Delete · ${formatCountdown(secsLeft)}`} tone="danger" onClick={onDelete} />
              <span className="hidden md:inline text-[10px] font-medium text-slate-400 ml-1">
                Permanent delete closes 5 minutes after publishing
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-1 text-xs font-bold text-slate-400">
          Read full announcement <ChevronRight className="w-3.5 h-3.5" />
        </div>
      )}
    </motion.div>
  );
}

function DraftCard({
  announcement: a, index, onView, onEdit, onPublish, onDelete,
}: {
  announcement: Announcement; index: number;
  onView(): void; onEdit(): void; onPublish(): void; onDelete(): void;
}) {
  const Icon = CATEGORY_META[a.category].icon;
  const priority = PRIORITY_STYLES[a.priority];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.04 }}
      className="w-full bg-white rounded-[30px] border-l-4 border-slate-300 p-6 border-t border-r border-b border-slate-100 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Draft — not published
            </span>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${priority.badge}`}>
              {priority.label}
            </span>
          </div>
          <h3 className="font-bold text-xl text-slate-700 leading-tight">{a.title}</h3>
          <p className="text-slate-500 mt-3 line-clamp-2 leading-relaxed">{a.content}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-400">
            <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{a.author}</div>
            <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />Created {formatDate(new Date(a.createdAt))}</div>
            {a.endDate && <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Will show until {formatDate(new Date(a.endDate))}</div>}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <ActionButton icon={Eye}    label="View"   tone="neutral" onClick={onView} />
        <ActionButton icon={Edit2}  label="Edit"   tone="blue"    onClick={onEdit} />
        <ActionButton icon={Send}   label="Publish" tone="primary" onClick={onPublish} />
        <ActionButton icon={Trash2} label="Delete" tone="danger"  onClick={onDelete} />
      </div>
    </motion.div>
  );
}

function PastCard({
  announcement: a, index, onView, onArchive,
}: {
  announcement: Announcement; index: number; onView(): void; onArchive(): void;
}) {
  const Icon = CATEGORY_META[a.category].icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.04 }}
      className="w-full bg-white/70 rounded-[30px] border-l-4 border-slate-200 p-6 border-t border-r border-b border-slate-100 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Ended — no longer on the board
            </span>
          </div>
          <h3 className="font-bold text-xl text-slate-500 leading-tight">{a.title}</h3>
          <p className="text-slate-400 mt-3 line-clamp-2 leading-relaxed">{a.content}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-400">
            <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{a.author}</div>
            {a.endDate && <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Ended {formatDate(new Date(a.endDate))}</div>}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <ActionButton icon={Eye}     label="View"    tone="neutral" onClick={onView} />
        <ActionButton icon={Archive} label="Archive" tone="warning" onClick={onArchive} />
        <span className="hidden md:inline text-[10px] font-medium text-slate-400 ml-1">
          Moves to the Archive automatically after 1 year
        </span>
      </div>
    </motion.div>
  );
}

function ArchivedCard({
  announcement: a, index, onView, onRestore,
}: {
  announcement: Announcement; index: number; onView(): void; onRestore(): void;
}) {
  const Icon = CATEGORY_META[a.category].icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.04 }}
      className="w-full bg-white/60 rounded-[30px] border-l-4 border-slate-100 p-6 border-t border-r border-b border-slate-100 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Archived record
            </span>
          </div>
          <h3 className="font-bold text-xl text-slate-500 leading-tight">{a.title}</h3>
          <p className="text-slate-400 mt-3 line-clamp-2 leading-relaxed">{a.content}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-400">
            <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{a.author}</div>
            {a.archivedAt && (
              <div className="flex items-center gap-1.5">
                <Archive className="w-4 h-4" />
                Archived {formatDate(new Date(a.archivedAt))}{a.archivedBy ? ` by ${a.archivedBy}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <ActionButton icon={Eye}       label="View"    tone="neutral" onClick={onView} />
        <ActionButton icon={RotateCcw} label="Restore" tone="primary" onClick={onRestore} />
        <span className="hidden md:inline text-[10px] font-medium text-slate-400 ml-1">
          Restoring sends the post back to the Active Board
        </span>
      </div>
    </motion.div>
  );
}
