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
  Paperclip,
  Download,
  Image as ImageIcon,
  Users,
  Globe2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../firebase';
import { formatDate } from '../lib/format';
import { usePermissions } from '../hooks/usePermissions';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { FilterModal, FilterField } from '../components/ui/FilterModal';
import { selectField, dateField } from '../lib/formStyles';
import { supabaseBrowser } from '../lib/supabase';

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
  audienceType: 'general' | 'specific';
  recipientIds: string[];
  recipientCount: number;
  attachments: AnnouncementAttachment[];
}

interface AnnouncementAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  kind: 'image' | 'document';
  displayOrder: number;
  altText: string | null;
}

interface AudienceOption { id: string; name: string; role: string; institution: string }

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
  const [feedMode, setFeedMode] = useState<'general' | 'for-me' | 'specific'>('general');
  const [filters,              setFilters]              = useState<{ search: string; category: string; priority: string; dateFrom: string; dateTo: string }>(EMPTY_FILTERS);
  const [sort,                 setSort]                 = useState<SortMode>('newest');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showForm,             setShowForm]             = useState(false);
  const [managementMode,       setManagementMode]       = useState(false);
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
  const isManagementMode = canManage && managementMode;

  // Grace-period countdown ticker (1s so the Delete button countdown is smooth)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auto-generated medical-records reminders (computed, read-only) ───────────
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
    audienceType: 'general' as 'general' | 'specific',
    recipientIds: [] as string[],
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<AudienceOption[]>([]);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [audienceState, setAudienceState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const pendingImagePreviews = useMemo(() => pendingFiles
    .map((file, index) => file.type.startsWith('image/') ? { file, index, url: URL.createObjectURL(file) } : null)
    .filter((item): item is { file: File; index: number; url: string } => item !== null), [pendingFiles]);
  useEffect(() => () => pendingImagePreviews.forEach((item) => URL.revokeObjectURL(item.url)), [pendingImagePreviews]);

  // ── Auth headers ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabaseBrowser.auth.getSession()
      .then(({ data }) => setSessionToken(data.session?.access_token ?? null))
      .catch(() => setSessionToken(null));
  }, [user?.id]);

  const authHeaders = useMemo<Record<string, string>>(() => ({
    'Content-Type':  'application/json',
    'x-user-name':   user?.name || user?.displayName || user?.email || "Chancellor's Office",
    'x-user-role':   user?.roleId || user?.accessRole || user?.role || 'chancellor',
    ...(user?.id || user?.uid ? { 'x-user-id': user.id || user.uid || '' } : {}),
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  }), [user, sessionToken]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/announcements?feed=${feedMode}`, { credentials: 'include', headers: authHeaders });
      if (!res.ok) throw new Error(`Announcement feed failed (${res.status})`);
      const rows: Announcement[] = await res.json();
      setActiveList(rows.filter((announcement) =>
        feedMode === 'general'
          ? announcement.audienceType !== 'specific'
          : announcement.audienceType === 'specific',
      ));
    } catch {
      setActiveList([]);
    } finally {
      setLoading(false);
    }
  }, [feedMode, authHeaders]);

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

  // Initial load and Real-time subscription — fetch all lists up front and on database changes
  useEffect(() => {
    fetchActive().catch(() => {});
    if (canManage) {
      fetchScheduled();
      fetchDrafts();
      fetchPast();
      fetchArchived();
    }

    const channel = supabaseBrowser
      .channel('public:announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchActive().catch(() => {});
        if (canManage) {
          fetchScheduled();
          fetchDrafts();
          fetchPast();
          fetchArchived();
        }
      })
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [fetchActive, canManage, fetchScheduled, fetchDrafts, fetchPast, fetchArchived]);

  useEffect(() => {
    if (!canManage) return;
    setAudienceState('loading');
    fetch('/api/announcements/audience-options', { credentials: 'include', headers: authHeaders })
      .then(async (r) => { if (!r.ok) throw new Error(`Recipient request failed (${r.status})`); return r.json(); })
      .then((rows) => { setAudienceOptions(Array.isArray(rows) ? rows : []); setAudienceState('ready'); })
      .catch(() => { setAudienceOptions([]); setAudienceState('error'); });
  }, [canManage, authHeaders]);

  useEffect(() => {
    if (!selectedAnnouncement) return;
    const images = (selectedAnnouncement.attachments ?? []).filter((attachment) => attachment.kind === 'image');
    setAttachmentUrls((current) => {
      const next = { ...current };
      images.forEach((attachment) => delete next[attachment.id]);
      return next;
    });
    images.forEach((attachment) => {
      fetch(`/api/announcements/${selectedAnnouncement.id}/attachments/${attachment.id}`, { credentials: 'include', headers: authHeaders })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => result?.url && setAttachmentUrls((current) => ({ ...current, [attachment.id]: result.url })))
        .catch(() => {});
    });
  }, [selectedAnnouncement, authHeaders]);

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
    setFormData({ title: '', content: '', priority: 'medium', category: 'general', startDate: '', endDate: '', saveAs: 'active', audienceType: 'general', recipientIds: [] });
    setPendingFiles([]);
    setEditingId(null);
    setFormError(null);
    setFormSubmitted(false);
  }, []);

  // ── Submit form ────────────────────────────────────────────────────────────
  const handleSubmitForm = useCallback(async (submitStatus?: 'draft' | 'active') => {
    setFormSubmitted(true);
    if (!formData.title.trim() || (!formData.content.trim() && pendingFiles.length === 0 && !editingId)) {
      setFormError('Add a title and either a message or at least one attachment.');
      return;
    }
    if (formData.audienceType === 'specific' && formData.recipientIds.length === 0) {
      setFormError('Select at least one recipient for a specific announcement.');
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
            audienceType: formData.audienceType,
            recipientIds: formData.recipientIds,
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
        const desiredStatus = submitStatus ?? formData.saveAs;
        const body = {
          title:      formData.title,
          content:    formData.content,
          author:     user?.name  || "Chancellor's Office",
          authorRole: user?.role  || 'chancellor',
          priority:   formData.priority,
          category:   formData.category,
          status:     pendingFiles.length > 0 && desiredStatus === 'active' ? 'draft' : desiredStatus,
          startDate:  formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
          endDate:    formData.endDate   ? new Date(formData.endDate).toISOString()   : undefined,
          audienceType: formData.audienceType,
          recipientIds: formData.recipientIds,
        };

        const res = await fetch('/api/announcements', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const created: Announcement = await res.json();
          if (pendingFiles.length) {
            const upload = new FormData();
            pendingFiles.forEach((file) => upload.append('files', file));
            const { ['Content-Type']: _contentType, ...uploadHeaders } = authHeaders;
            const uploadRes = await fetch(`/api/announcements/${created.id}/attachments`, { method: 'POST', credentials: 'include', headers: uploadHeaders, body: upload });
            if (!uploadRes.ok) {
              const detail = await uploadRes.json().catch(() => ({ error: '' }));
              setFormError(detail.error || 'The announcement was saved, but its attachments could not be uploaded.');
              setDraftList((prev) => [created, ...prev]);
              setTab('drafts');
              return;
            }
            created.attachments = await uploadRes.json();
            if (desiredStatus === 'active') {
              const publishRes = await fetch(`/api/announcements/${created.id}/publish`, { method: 'POST', credentials: 'include', headers: authHeaders });
              if (!publishRes.ok) {
                setDraftList((prev) => [created, ...prev]);
                setTab('drafts');
                setFormError('Files uploaded successfully, but publishing failed. The announcement remains safely in Drafts.');
                return;
              }
              Object.assign(created, await publishRes.json(), { attachments: created.attachments });
            }
          }
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
            setFeedMode(created.audienceType === 'specific' && canManage ? 'specific' : 'general');
            showToast('Announcement published to the board.');
          }
        } else {
          const detail = await res.json().catch(() => ({ error: '' }));
          setFormError(detail.error || 'Publishing failed. Apply the announcement database migration, restart the backend, and try again.');
          return;
        }
      }

      resetForm();
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingId, formData, pendingFiles, resetForm, user, authHeaders, showToast, fetchActive, fetchScheduled, canManage]);

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
      audienceType: a.audienceType ?? 'general',
      recipientIds: a.recipientIds ?? [],
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
      audienceType: a.audienceType ?? 'general',
      recipientIds: a.recipientIds ?? [],
    });
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }, []);

  const openAttachment = useCallback(async (announcementId: string, attachment: AnnouncementAttachment, download = false) => {
    const res = await fetch(`/api/announcements/${announcementId}/attachments/${attachment.id}${download ? '?download=1' : ''}`, { credentials: 'include', headers: authHeaders });
    if (!res.ok) { showToast('This attachment is unavailable or you no longer have access.'); return; }
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [authHeaders, showToast]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const currentList =
    tab === 'active'    ? activeList.filter((announcement) => feedMode === 'general' ? announcement.audienceType !== 'specific' : announcement.audienceType === 'specific') :
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
    <div className="min-h-screen bg-[#FDFCFB] pb-20">
      <div className="relative border-b border-gold-500/30 bg-[radial-gradient(circle_at_10%_0%,rgba(225,183,48,0.24),transparent_32%),linear-gradient(135deg,#090909_0%,#030711_56%,#000000_100%)] px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        {/* ── Masthead ── */}
        <div className="relative mb-6 overflow-hidden text-white">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gold-500" />
          <div className="flex flex-col gap-8 py-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-gold-400" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-400">
                  Official Bulletin
                </p>
              </div>
              <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold leading-[0.95] tracking-normal text-white md:text-7xl">
                Announcement <span className="text-gold-400 italic">Board</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-white/62">
                Central posting space for diocesan updates, directives, financial notices, and event reminders.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setManagementMode((current) => !current);
                    setTab('active');
                    setFeedMode('general');
                    setShowForm(false);
                  }}
                    className={`mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                      isManagementMode
                        ? 'border border-white/15 bg-white/10 text-white hover:bg-white/15'
                        : 'border border-gold-300 bg-gold-500 text-black shadow-[0_10px_24px_rgba(225,183,48,0.18)] hover:bg-gold-400'
                  }`}
                >
                  {isManagementMode ? <Globe2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                  {isManagementMode ? 'View board' : 'Manage announcements'}
                </button>
              )}
            </div>
            <div className="shrink-0 space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35 md:text-right">
                Live as of {formatDate(new Date())}
              </p>
              <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="rounded-3xl border border-gold-400/20 bg-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-gold-300" />
                        <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
                          {card.label}
                        </span>
                      </div>
                      <p className="mt-4 font-serif text-4xl font-bold leading-none text-white">{card.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar + feed ── */}
        </div>
      </div>

      <div className="relative mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-1 gap-6 lg:items-start ${isManagementMode ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
          {isManagementMode && (
          <aside className="custom-scrollbar space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-gold-300 bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-[0_10px_22px_rgba(225,183,48,0.16)] transition-all hover:bg-gold-400"
              >
                <Plus className="h-4 w-4" />
                New Announcement
              </button>

              <nav className="rounded-[2rem] border border-slate-200/80 bg-white/95 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur">
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
                          : 'text-slate-500 hover:bg-gold-50 hover:text-slate-800'
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
                <p className="m-2 rounded-3xl bg-gold-50 px-3.5 py-3 text-[11px] font-bold leading-relaxed text-slate-600">
                  {TAB_META[tab].description}
                </p>
              </nav>
          </aside>
          )}

          <div className="min-w-0">
        {tab === 'active' && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-[2rem] border border-slate-200/80 bg-white/95 p-2 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur">
            <button onClick={() => setFeedMode('general')} className={`flex min-h-12 items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-black transition-all ${feedMode === 'general' ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Globe2 className="h-4 w-4" /> General announcements
            </button>
            <button onClick={() => setFeedMode(isManagementMode ? 'specific' : 'for-me')} className={`flex min-h-12 items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-black transition-all ${(isManagementMode ? feedMode === 'specific' : feedMode === 'for-me') ? 'bg-gold-500 text-slate-950 shadow-lg shadow-gold-500/20' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Users className="h-4 w-4" /> {isManagementMode ? 'Targeted announcements' : 'For you'}
            </button>
          </div>
        )}
        {/* ── Filter bar — search inline, everything else in the modal ── */}
        <div className="sticky top-0 z-20 mb-6 flex flex-col gap-2 rounded-[2rem] border border-slate-200/80 bg-white/95 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search announcements…"
              className="h-12 w-full rounded-3xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
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
          <div className="flex flex-col items-center justify-center gap-5 rounded-[2rem] border border-dashed border-gold-300/70 bg-gradient-to-br from-white via-white to-gold-50/60 py-20 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
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
            {isManagementMode && tab === 'active' && !hasActiveFilters && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="rounded-2xl bg-black px-6 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800"
              >
                Post First Announcement
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {displayed.map((a, i) => (
                <AnnouncementRow
                  key={a.id}
                  announcement={a}
                  index={i}
                  tab={tab}
                  canManage={isManagementMode}
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
                  onOpenAttachment={(attachment, download) => openAttachment(a.id, attachment, download)}
                  attachmentUrls={attachmentUrls}
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
        {showForm && isManagementMode && (
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
                  <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-gold-600" />
                      <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">Photos and attachments</label>
                    </div>
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-7 text-center transition-colors hover:border-gold-500 hover:bg-gold-50/30">
                      <ImageIcon className="mb-2 h-7 w-7 text-slate-400" />
                      <span className="text-sm font-bold text-slate-700">Choose photos, PDFs, or documents</span>
                      <span className="mt-1 text-xs text-slate-400">Up to 5 files, maximum 25 MB each</span>
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(e) => {
                          const selected = Array.from(e.target.files ?? []);
                          setPendingFiles((current) => {
                            const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
                            const additions = selected.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
                            return [...current, ...additions].slice(0, 5);
                          });
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {pendingFiles.length > 0 && (
                      <div className="space-y-2">
                        {pendingImagePreviews.length > 0 && (
                          <div className={`grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${pendingImagePreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-0.5`}>
                            {pendingImagePreviews.map(({ file, index, url }, photoIndex) => (
                              <div key={`${file.name}-${index}`} className={`group/photo relative overflow-hidden bg-slate-200 ${pendingImagePreviews.length === 1 ? 'h-72' : pendingImagePreviews.length === 3 && photoIndex === 0 ? 'col-span-2 h-56' : 'h-44'} ${pendingImagePreviews.length === 5 && photoIndex === 0 ? 'col-span-2 h-56' : ''}`}>
                                <img src={url} alt={file.name} className="h-full w-full object-cover" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-3 pt-8 text-left">
                                  <p className="truncate text-xs font-bold text-white">{file.name}</p>
                                </div>
                                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((files) => files.filter((_, i) => i !== index))} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition-colors hover:bg-rose-600"><X className="h-4 w-4" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                        {pendingFiles.map((file, index) => file.type.startsWith('image/') ? null : (
                          <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <FileText className="h-4 w-4 text-sky-600" />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{file.name}</span>
                            <span className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                            <button type="button" onClick={() => setPendingFiles((files) => files.filter((_, i) => i !== index))} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-slate-200 p-5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">Audience</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setFormData({ ...formData, audienceType: 'general', recipientIds: [] })} className={`rounded-2xl border p-4 text-left ${formData.audienceType === 'general' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                        <Globe2 className="mb-2 h-5 w-5" /><span className="block text-sm font-black">Everyone</span><span className="text-xs opacity-60">General board</span>
                      </button>
                      <button type="button" onClick={() => setFormData({ ...formData, audienceType: 'specific' })} className={`rounded-2xl border p-4 text-left ${formData.audienceType === 'specific' ? 'border-gold-500 bg-gold-50 text-slate-950' : 'border-slate-200 bg-white text-slate-600'}`}>
                        <Users className="mb-2 h-5 w-5" /><span className="block text-sm font-black">Specific people</span><span className="text-xs opacity-60">Private recipients</span>
                      </button>
                    </div>
                    {formData.audienceType === 'specific' && (
                      <div className="space-y-2">
                        <input value={audienceSearch} onChange={(e) => setAudienceSearch(e.target.value)} placeholder="Search people, roles, or institutions…" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
                          {audienceState === 'loading' && <p className="px-3 py-5 text-center text-sm font-semibold text-slate-400">Loading users…</p>}
                          {audienceState === 'error' && <p className="rounded-xl bg-rose-50 px-3 py-4 text-center text-sm font-semibold text-rose-600">Could not load users. Confirm the announcement migration is applied, then refresh the page.</p>}
                          {audienceState === 'ready' && audienceOptions.length === 0 && <p className="px-3 py-5 text-center text-sm font-semibold text-slate-400">No active user profiles are available.</p>}
                          {audienceOptions.filter((option) => `${option.name} ${option.role} ${option.institution}`.toLowerCase().includes(audienceSearch.toLowerCase())).map((option) => {
                            const selected = formData.recipientIds.includes(option.id);
                            return <button key={option.id} type="button" onClick={() => setFormData({ ...formData, recipientIds: selected ? formData.recipientIds.filter((id) => id !== option.id) : [...formData.recipientIds, option.id] })} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${selected ? 'bg-gold-50 ring-1 ring-gold-300' : 'hover:bg-slate-50'}`}>
                              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-gold-500 bg-gold-500 text-white' : 'border-slate-300'}`}>{selected && <Check className="h-3 w-3" />}</span>
                              <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{option.name}</span><span className="block truncate text-xs text-slate-400">{option.role}{option.institution ? ` · ${option.institution}` : ''}</span></span>
                            </button>;
                          })}
                        </div>
                        <p className="text-xs font-semibold text-slate-500">{formData.recipientIds.length} recipient{formData.recipientIds.length === 1 ? '' : 's'} selected. Only they and announcement managers can view this post.</p>
                      </div>
                    )}
                  </div>

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
                        min={formData.startDate || new Date(Date.now() + 86400000).toISOString().slice(0, 16)}
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
                {(selectedAnnouncement.attachments ?? []).length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Attachments</p>
                    {selectedAnnouncement.attachments.map((attachment) => attachment.kind === 'image' ? (
                      <button key={attachment.id} onClick={() => openAttachment(selectedAnnouncement.id, attachment, false)} className="block w-full overflow-hidden rounded-3xl bg-slate-100">
                        {attachmentUrls[attachment.id] ? <img src={attachmentUrls[attachment.id]} alt={attachment.altText || attachment.originalName} className="max-h-[520px] w-full object-contain" /> : <span className="flex h-48 items-center justify-center"><ImageIcon className="h-8 w-8 text-slate-400" /></span>}
                      </button>
                    ) : (
                      <button key={attachment.id} onClick={() => openAttachment(selectedAnnouncement.id, attachment, true)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left hover:bg-slate-50">
                        <FileText className="h-5 w-5 text-sky-600" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{attachment.originalName}</span><Download className="h-4 w-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {canManage && !isManagementMode && (
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-white px-6 py-4 md:px-8">
                  <p className="text-xs font-medium text-slate-400">You are viewing this announcement in read-only mode.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnnouncement(null);
                      setManagementMode(true);
                      setTab('active');
                      setFeedMode('general');
                    }}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-950 transition-colors hover:bg-gold-400"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Manage announcements
                  </button>
                </div>
              )}
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
  onView, onEdit, onDelete, onArchive, onRestore, onPublish, onPublishNow, onTogglePin, onDuplicate, onOpenAttachment, attachmentUrls,
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
  onOpenAttachment(attachment: AnnouncementAttachment, download: boolean): void;
  attachmentUrls: Record<string, string>;
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
      className={`group relative min-h-[260px] cursor-pointer overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-1 hover:border-gold-300 hover:shadow-[0_24px_58px_rgba(15,23,42,0.12)] ${
        muted ? 'opacity-70' : ''
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${rail}`} />
      <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-gold-400/10 transition-transform duration-500 group-hover:scale-125" />
      <div className="absolute bottom-0 right-0 h-28 w-28 bg-gradient-to-tl from-gold-100/70 to-transparent" />

      <div className="relative grid gap-5 p-5 md:grid-cols-[82px_minmax(0,1fr)] md:p-6">
        {/* Date column — dark tile with gold accent (Events uses a light one) */}
        <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-[1.7rem] text-center shadow-xl ${
          muted ? 'border border-slate-200 bg-slate-100 shadow-slate-200/60' : 'bg-slate-950 shadow-slate-950/20'
        }`}>
          <div className={`text-[10px] font-black uppercase tracking-widest ${muted ? 'text-slate-400' : 'text-gold-400'}`}>{tile.month}</div>
          <div className={`mt-1 font-serif text-3xl font-bold leading-none ${muted ? 'text-slate-500' : 'text-white'}`}>{tile.day}</div>
          <div className={`mt-1 text-[10px] font-black ${muted ? 'text-slate-400' : 'text-white/40'}`}>{tile.year}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className={`font-serif text-2xl font-bold leading-tight md:text-3xl ${muted ? 'text-slate-600' : 'text-slate-950'}`}>
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
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${a.audienceType === 'specific' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>
              {a.audienceType === 'specific' ? <Users className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
              {a.audienceType === 'specific' ? `For you${canManage ? ` · ${a.recipientCount}` : ''}` : 'General'}
            </span>
            {(a.attachments ?? []).length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">
                <Paperclip className="h-3 w-3" />
                {a.attachments.length} attachment{a.attachments.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* Content preview */}
          {a.content && <p className={`mt-3 max-w-3xl text-sm leading-relaxed line-clamp-2 ${muted ? 'text-slate-400' : 'text-slate-500'}`}>{a.content}</p>}

          {(a.attachments ?? []).some((attachment) => attachment.kind === 'document') && (
            <div className="mt-3 space-y-2">
              {a.attachments.filter((attachment) => attachment.kind === 'document').map((attachment) => (
                <button key={attachment.id} type="button" onClick={(event) => { event.stopPropagation(); onOpenAttachment(attachment, true); }} className="flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-gold-300 hover:bg-gold-50/40">
                  <FileText className="h-5 w-5 shrink-0 text-sky-600" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{attachment.originalName}</span><span className="text-xs text-slate-400">{(attachment.fileSize / 1024 / 1024).toFixed(1)} MB</span><Download className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}

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
