'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays,
  Plus,
  X,
  Check,
  Clock,
  Activity,
  ChevronDown,
  AlertCircle,
  Landmark,
  Building2,
  Search,
  Edit2,
  Archive,
  RotateCcw,
  List,
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';

interface DiocesanEvent {
  id: string;
  event_name: string;
  event_level: 'Major event' | 'Minor event';
  event_type?: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  institution_id?: string;
  institution_name?: string;
  institution_type?: string;
  deleted_at?: string;
}

const EVENT_TYPES = [
  'Parish Feast Day',
  'Fundraising Activity',
  'Community Outreach',
  'Spiritual Retreat',
  'Youth Activity',
  'Parish Meeting',
  'Mass / Liturgy',
  'Other',
];

const DIOCESE_NAME = 'Diocese of San Pablo';

function formatLongDate(dateStr: string) {
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function todayMidnight(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function dateTileParts(dateStr: string) {
  const d = toDate(dateStr);
  return {
    month: d.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    year: d.getFullYear(),
  };
}

/** Last day the event is still relevant: end date if set, otherwise start date. */
function lastDay(e: DiocesanEvent): Date {
  return toDate(e.end_date || e.start_date);
}

/** Still upcoming OR currently ongoing (hasn't fully ended yet). */
function isCurrent(e: DiocesanEvent): boolean {
  return lastDay(e) >= todayMidnight();
}

/** Starts after today. */
function isUpcoming(e: DiocesanEvent): boolean {
  return toDate(e.start_date) > todayMidnight();
}

/** Happening right now: started already but not yet finished. */
function isOngoing(e: DiocesanEvent): boolean {
  const today = todayMidnight();
  return toDate(e.start_date) <= today && lastDay(e) >= today;
}

const EMPTY_FORM = {
  event_name: '',
  event_level: 'Minor event' as DiocesanEvent['event_level'],
  event_type: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  notes: '',
};

const EMPTY_FILTERS = {
  search: '',
  dateFrom: '',
  dateTo: '',
  type: 'all',
  level: 'all',
};

type EventTab = 'ongoing' | 'upcoming' | 'past' | 'all' | 'archived';

const TAB_META: Record<EventTab, { label: string; icon: React.ElementType }> = {
  ongoing: { label: 'Ongoing', icon: Activity },
  upcoming: { label: 'Upcoming', icon: CalendarDays },
  past: { label: 'Past', icon: Clock },
  all: { label: 'All', icon: List },
  archived: { label: 'Archived', icon: Archive },
};

export function Events() {
  const { permissions, user, loading: permissionsLoading } = usePermissions();
  const canManage = permissions.manage_events === true;
  const isDiocese = permissions.view_diocese === true;

  const [events, setEvents] = useState<DiocesanEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<DiocesanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EventTab>('ongoing');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // The institution that owns events created from this screen. Diocese-level
  // users always create events as the diocese — never on another
  // institution's behalf.
  const ownerName = isDiocese ? DIOCESE_NAME : user?.entityName || '';
  const ownerType = isDiocese ? 'diocese' : user?.entityType || '';

  const scopeParams = useMemo(
    () =>
      isDiocese
        ? undefined
        : {
            institutionId: user?.entityId,
            institutionName: user?.entityName,
            institutionType: user?.entityType,
          },
    [isDiocese, user?.entityId, user?.entityName, user?.entityType],
  );

  useEffect(() => {
    if (permissionsLoading) return;
    let active = true;
    setLoading(true);
    apiClient
      .getEvents(scopeParams)
      .then((data) => active && setEvents(data ?? []))
      .catch(() => active && setEvents([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [permissionsLoading, scopeParams]);

  // Archived list — managers only, fetched up front so the tab count is accurate
  useEffect(() => {
    if (permissionsLoading || !canManage) return;
    let active = true;
    apiClient
      .getArchivedEvents(scopeParams)
      .then((data) => active && setArchivedEvents(data ?? []))
      .catch(() => active && setArchivedEvents([]));
    return () => {
      active = false;
    };
  }, [permissionsLoading, canManage, scopeParams]);

  // Institution dropdown options for the diocese overview
  const institutionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const e of [...events, ...archivedEvents]) if (e.institution_name) names.add(e.institution_name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [events, archivedEvents]);

  // ── Filtering pipeline ─────────────────────────────────────────────────────
  const applyFilters = useCallback(
    (list: DiocesanEvent[]) => {
      let out = list;
      if (institutionFilter !== 'all') out = out.filter((e) => e.institution_name === institutionFilter);
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        out = out.filter(
          (e) =>
            e.event_name.toLowerCase().includes(q) ||
            (e.institution_name ?? '').toLowerCase().includes(q) ||
            (e.notes ?? '').toLowerCase().includes(q),
        );
      }
      if (filters.dateFrom) {
        const from = toDate(filters.dateFrom);
        out = out.filter((e) => lastDay(e) >= from);
      }
      if (filters.dateTo) {
        const to = toDate(filters.dateTo);
        out = out.filter((e) => toDate(e.start_date) <= to);
      }
      if (filters.type !== 'all') out = out.filter((e) => e.event_type === filters.type);
      if (filters.level !== 'all') out = out.filter((e) => e.event_level === filters.level);
      return out;
    },
    [institutionFilter, filters],
  );

  const scoped = useMemo(() => applyFilters(events), [events, applyFilters]);
  const scopedArchived = useMemo(() => applyFilters(archivedEvents), [archivedEvents, applyFilters]);

  const ongoing = useMemo(
    () =>
      scoped
        .filter((e) => isOngoing(e))
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [scoped],
  );
  const upcoming = useMemo(
    () =>
      scoped
        .filter((e) => isUpcoming(e))
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [scoped],
  );
  const past = useMemo(
    () =>
      scoped
        .filter((e) => !isCurrent(e))
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [scoped],
  );
  const all = useMemo(
    () => [...scoped].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [scoped],
  );

  const displayed =
    filter === 'ongoing'
      ? ongoing
      : filter === 'upcoming'
        ? upcoming
        : filter === 'past'
          ? past
          : filter === 'archived'
            ? scopedArchived
            : all;

  const tabCounts: Record<EventTab, number> = {
    ongoing: ongoing.length,
    upcoming: upcoming.length,
    past: past.length,
    all: all.length,
    archived: scopedArchived.length,
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.type !== 'all' ||
    filters.level !== 'all';

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (event: DiocesanEvent) => {
    setEditingId(event.id);
    setFormData({
      event_name: event.event_name,
      event_level: event.event_level,
      event_type: event.event_type ?? '',
      start_date: event.start_date,
      end_date: event.end_date ?? '',
      notes: event.notes ?? '',
    });
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (editingId) {
        const updated = await apiClient.updateEvent(editingId, {
          event_name: formData.event_name,
          event_level: formData.event_level,
          event_type: formData.event_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          notes: formData.notes,
        });
        setEvents((prev) => prev.map((ev) => (ev.id === editingId ? updated : ev)));
        showToast(`"${updated.event_name}" updated.`);
      } else {
        const saved = await apiClient.saveEvent({
          ...formData,
          end_date: formData.end_date || undefined,
          notes: formData.notes || undefined,
          event_type: formData.event_type || undefined,
          institution_id: isDiocese ? undefined : user?.entityId,
          institutionName: ownerName || undefined,
          institutionType: ownerType || undefined,
        });
        setEvents((prev) => [saved, ...prev]);
        showToast(`"${saved.event_name}" scheduled.`);
      }
      setIsModalOpen(false);
      setFormData(EMPTY_FORM);
      setEditingId(null);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (event: DiocesanEvent) => {
    // Optimistic remove
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    try {
      await apiClient.archiveEvent(event.id);
      setArchivedEvents((prev) => [{ ...event, deleted_at: new Date().toISOString() }, ...prev]);
      showToast(`"${event.event_name}" moved to the Archived tab.`);
    } catch {
      setEvents((prev) => [event, ...prev]);
      alert('Could not archive the event. Please try again.');
    }
  };

  const handleRestore = async (event: DiocesanEvent) => {
    try {
      await apiClient.restoreEvent(event.id);
      setArchivedEvents((prev) => prev.filter((e) => e.id !== event.id));
      setEvents((prev) => [{ ...event, deleted_at: undefined }, ...prev]);
      showToast(`"${event.event_name}" restored.`);
    } catch {
      alert('Could not restore the event. Please try again.');
    }
  };

  const visibleTabs: EventTab[] = canManage
    ? ['ongoing', 'upcoming', 'past', 'all', 'archived']
    : ['ongoing', 'upcoming', 'past', 'all'];

  const summaryCards = [
    { label: 'Ongoing', value: ongoing.length, icon: Activity },
    { label: 'Upcoming', value: upcoming.length, icon: CalendarDays },
    { label: 'Past', value: past.length, icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* ── Header ── */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-black/10 bg-black text-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/25 bg-white/5">
                <CalendarDays className="h-5 w-5 text-gold-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">Diocesan Calendar</p>
                <h1 className="mt-1 font-serif text-3xl font-bold leading-none tracking-normal text-white md:text-4xl">
                  Events
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-white/55">
                  {isDiocese
                    ? 'Oversee events from every institution across the diocese.'
                    : `Schedule and view activities for ${user?.entityName || 'your institution'}.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                        {card.label}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-gold-400" />
                    </div>
                    <p className="mt-2 text-2xl font-black leading-none text-white">{card.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Tabs + institution dropdown ── */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {visibleTabs.map((id) => {
                const meta = TAB_META[id];
                const Icon = meta.icon;
                const isActive = filter === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[11px] font-black uppercase tracking-[0.14em] transition-all ${
                      isActive
                        ? 'bg-black text-white shadow-lg shadow-black/10'
                        : 'border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-gold-400' : 'text-slate-400'}`} />
                    <span>{meta.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tabCounts[id]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Institution filter — diocese overview only */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isDiocese && institutionOptions.length > 0 && (
                <div className="relative w-full sm:w-72">
                  <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={institutionFilter}
                    onChange={(e) => setInstitutionFilter(e.target.value)}
                    className="h-11 w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm font-bold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
                  >
                    <option value="all">All institutions</option>
                    {institutionOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              )}
              {canManage && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-gold-500 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
                >
                  <Plus className="h-4 w-4" />
                  New Event
                </button>
              )}
            </div>
          </div>

          {filter === 'archived' && (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              Archived events are hidden from the calendar — restore one to bring it back.
            </p>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="mb-6 grid grid-cols-1 gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(220px,1fr)_180px_160px_minmax(310px,auto)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search events…"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
            />
          </div>

          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="h-11 cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
          >
            <option value="all">All types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            className="h-11 cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
          >
            <option value="all">All levels</option>
            <option value="Major event">Major event</option>
            <option value="Minor event">Minor event</option>
          </select>

          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
            />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">To</span>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
            />
          </div>

          {hasActiveFilters && (
            <>
              <span className="hidden items-center justify-center rounded-2xl bg-slate-50 px-3 text-xs font-bold text-slate-400 lg:flex">
                {displayed.length} found
              </span>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </>
          )}
        </div>

        {/* ── Events list ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-black" />
            <p className="text-slate-400 font-medium">Loading events…</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-slate-300 bg-white py-24">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
              {filter === 'archived' ? (
                <Archive className="h-9 w-9 text-slate-300" />
              ) : (
                <CalendarDays className="h-9 w-9 text-slate-300" />
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-serif font-bold text-slate-950">
                {hasActiveFilters ? 'No events match your filters' : 'No events found'}
              </p>
              <p className="text-sm text-slate-400">
                {hasActiveFilters
                  ? 'Try adjusting or clearing the filters above.'
                  : filter === 'ongoing'
                    ? 'No events happening right now.'
                    : filter === 'upcoming'
                      ? 'No upcoming events scheduled yet.'
                      : filter === 'past'
                        ? 'No past events recorded.'
                        : filter === 'archived'
                          ? 'Archived events will appear here.'
                          : 'No events recorded yet.'}
              </p>
            </div>
            {canManage && (filter === 'ongoing' || filter === 'upcoming') && !hasActiveFilters && (
              <button
                onClick={openCreateModal}
                className="rounded-2xl bg-black px-6 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800"
              >
                Schedule First Event
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {displayed.map((event, idx) => {
                const isArchivedTab = filter === 'archived';
                const current = isCurrent(event);
                const ongoing = isOngoing(event);
                const tile = dateTileParts(event.start_date);

                let rail = 'bg-slate-900';
                if (isArchivedTab || !current) rail = 'bg-slate-200';
                else if (ongoing) rail = 'bg-emerald-500';
                else if (event.event_level === 'Major event') rail = 'bg-gold-500';

                const metaParts: string[] = [];
                if (isArchivedTab && event.deleted_at) metaParts.push(`Archived ${formatLongDate(event.deleted_at)}`);
                else if (!isArchivedTab && !current) metaParts.push('Completed');
                if (isDiocese && event.institution_name) metaParts.push(event.institution_name);
                metaParts.push(event.event_level);
                if (event.event_type) metaParts.push(event.event_type);

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] ${
                      isArchivedTab || !current ? 'opacity-70' : ''
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${rail}`} />

                    <div className="grid gap-5 p-5 pl-6 md:grid-cols-[82px_minmax(0,1fr)_auto] md:items-center md:p-6 md:pl-8">
                      {/* Date column */}
                      <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-center">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {tile.month}
                        </div>
                        <div className="mt-1 font-serif text-3xl font-bold leading-none text-slate-950">{tile.day}</div>
                        <div className="mt-1 text-[10px] font-black text-slate-300">{tile.year}</div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="font-serif text-xl font-bold leading-tight text-slate-950 md:text-2xl">
                            {event.event_name}
                          </h2>

                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-1">
                              {isArchivedTab ? (
                                <button
                                  onClick={() => handleRestore(event)}
                                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Restore
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openEditModal(event)}
                                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleArchive(event)}
                                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
                                  >
                                    <Archive className="h-3.5 w-3.5" />
                                    Archive
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {ongoing && !isArchivedTab && (
                          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Happening now
                          </div>
                        )}

                        <p className="mt-3 text-sm font-bold text-slate-600">
                          {formatLongDate(event.start_date)}
                          {event.end_date && event.end_date !== event.start_date && (
                            <> - {formatLongDate(event.end_date)}</>
                          )}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-slate-400">{metaParts.join(' / ')}</p>

                        {event.notes && (
                          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500">{event.notes}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add / Edit Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-600 mb-1">
                    {editingId ? 'Event Editor' : 'New Schedule'}
                  </p>
                  <h2 className="text-xl md:text-2xl font-serif font-bold text-slate-950 tracking-tight">
                    {editingId ? 'Edit Event' : 'Add New Event'}
                  </h2>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:rotate-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
                  {/* Owning institution — locked to the signed-in user's institution */}
                  {!editingId && (
                    <div className="flex items-center gap-3 bg-slate-50/80 border border-slate-100 rounded-2xl px-5 py-4">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 flex items-center justify-center shrink-0">
                        {isDiocese ? (
                          <Landmark className="w-4 h-4 text-gold-400" />
                        ) : (
                          <Building2 className="w-4 h-4 text-gold-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event For</p>
                        <p className="text-sm font-bold text-slate-950 truncate">{ownerName || 'Your institution'}</p>
                      </div>
                    </div>
                  )}

                  {/* Event Name */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Event Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.event_name}
                      onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
                      placeholder="e.g. Parish Fiesta, Youth Retreat…"
                      className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-base font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-slate-300"
                    />
                  </div>

                  {/* Event Level | Event Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Event Level
                      </label>
                      <div className="relative">
                        <select
                          value={formData.event_level}
                          onChange={(e) =>
                            setFormData({ ...formData, event_level: e.target.value as DiocesanEvent['event_level'] })
                          }
                          className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                        >
                          <option value="Minor event">Minor Event</option>
                          <option value="Major event">Major Event</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Event Type
                      </label>
                      <div className="relative">
                        <select
                          value={formData.event_type}
                          onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                        >
                          <option value="">— Select type —</option>
                          {EVENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Start Date | End Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        Start Date
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                        End Date <span className="text-slate-300 normal-case font-medium">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={formData.end_date}
                        min={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em]">
                      Notes <span className="text-slate-300 normal-case font-medium">(optional)</span>
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional details about this event…"
                      rows={3}
                      className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all resize-none placeholder:text-slate-300"
                    />
                  </div>

                  {submitError && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {submitError}
                    </p>
                  )}

                  {/* Buttons */}
                  <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="w-full sm:flex-1 py-4 px-6 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:flex-[2] py-4 px-6 bg-gold-500 text-church-green-dark rounded-2xl text-sm font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-church-green-dark/30 border-t-church-green-dark rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          {editingId ? 'SAVE CHANGES' : 'SAVE EVENT'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-slate-950 text-white px-6 py-4 rounded-2xl shadow-2xl text-sm font-medium"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
