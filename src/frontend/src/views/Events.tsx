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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-950 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-gold-500" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-slate-950">Events</h1>
              <p className="text-sm text-slate-500">
                {isDiocese
                  ? 'Oversee events from every institution across the diocese.'
                  : `Schedule and view activities for ${user?.entityName || 'your institution'}.`}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gold-500 hover:bg-gold-600 text-church-green-dark px-6 py-4 font-bold text-[11px] uppercase tracking-[0.22em] transition-all shadow-xl shadow-gold-500/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Event
            </button>
          )}
        </div>

        {/* ── Tabs + institution dropdown ── */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm">
              {visibleTabs.map((id) => {
                const meta = TAB_META[id];
                const Icon = meta.icon;
                const isActive = filter === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
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
                      {tabCounts[id]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Institution filter — diocese overview only */}
            {isDiocese && institutionOptions.length > 0 && (
              <div className="relative w-full lg:w-72">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                <select
                  value={institutionFilter}
                  onChange={(e) => setInstitutionFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium shadow-sm focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">All institutions</option>
                  {institutionOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {filter === 'archived' && (
            <p className="px-1 text-xs text-slate-400">
              Archived events are hidden from the calendar — restore one to bring it back.
            </p>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm mb-8">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search events…"
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-slate-300"
            />
          </div>

          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="px-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="all">All types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            className="px-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="all">All levels</option>
            <option value="Major event">Major event</option>
            <option value="Minor event">Minor event</option>
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 pl-1">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="px-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
            />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">To</span>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="px-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
            />
          </div>

          {hasActiveFilters && (
            <>
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap px-1">
                {displayed.length} found
              </span>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            </>
          )}
        </div>

        {/* ── Events list ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-950 rounded-full animate-spin" />
            <p className="text-slate-400 font-medium">Loading events…</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 rounded-[32px] border border-dashed border-slate-200 bg-white/80">
            <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center border border-dashed border-slate-200">
              {filter === 'archived' ? (
                <Archive className="w-9 h-9 text-slate-200" />
              ) : (
                <CalendarDays className="w-9 h-9 text-slate-200" />
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
                className="px-6 py-3 bg-slate-950 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
              >
                Schedule First Event
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
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
                    className={`relative bg-white rounded-2xl border border-slate-200/70 hover:border-slate-300 hover:shadow-md transition-all overflow-hidden ${
                      isArchivedTab || !current ? 'opacity-70' : ''
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${rail}`} />

                    <div className="flex gap-5 p-5 md:p-6 pl-6 md:pl-7">
                      {/* Date column */}
                      <div className="w-14 shrink-0 text-center pt-0.5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tile.month}</div>
                        <div className="text-3xl font-serif font-bold text-slate-900 leading-none mt-1">{tile.day}</div>
                        <div className="text-[10px] font-bold text-slate-300 mt-1">{tile.year}</div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-lg md:text-xl font-serif font-bold text-slate-950 leading-snug">
                            {event.event_name}
                          </h2>

                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-1">
                              {isArchivedTab ? (
                                <button
                                  onClick={() => handleRestore(event)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Restore
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openEditModal(event)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleArchive(event)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                    Archive
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {ongoing && !isArchivedTab && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-emerald-600">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Happening now
                          </div>
                        )}

                        <p className="text-sm font-medium text-slate-600 mt-1.5">
                          {formatLongDate(event.start_date)}
                          {event.end_date && event.end_date !== event.start_date && (
                            <> &mdash; {formatLongDate(event.end_date)}</>
                          )}
                        </p>

                        <p className="text-xs text-slate-400 mt-1">{metaParts.join('  ·  ')}</p>

                        {event.notes && (
                          <p className="text-sm text-slate-500 leading-relaxed mt-2.5 max-w-xl">{event.notes}</p>
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
                        <p className="text-sm font-bold text-slate-950 truncate">
                          {ownerName || 'Your institution'}
                        </p>
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
                            <option key={t} value={t}>{t}</option>
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
