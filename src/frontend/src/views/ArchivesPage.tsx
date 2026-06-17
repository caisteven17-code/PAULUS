'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Archive,
  Search,
  RotateCcw,
  Trash2,
  User,
  Building2,
  GraduationCap,
  School,
  CalendarDays,
  Heart,
  Bell,
  Briefcase,
  CheckCircle,
  Loader2,
  ArrowUpDown,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';
import { getArchiveAccess, ArchiveAccess } from '../lib/archiveAccess';
import { InlineLoader } from '../components/ui/LoadingScreen';

type ArchiveType = 'user' | 'entity' | 'event' | 'announcement' | 'project' | 'health';

interface ArchivedRecord {
  key: string;
  id: string;
  type: ArchiveType;
  subtype?: 'parish' | 'seminary' | 'school';
  title: string;
  subtitle: string; // role / vicariate / institution / category
  detail: string; // email / address
  archivedAt: string;
  raw: any;
}

const TYPE_META: Record<ArchiveType, { label: string; icon: React.ElementType; tint: string; chip: string }> = {
  user: { label: 'User', icon: User, tint: 'bg-indigo-50 border-indigo-100 text-indigo-500', chip: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  entity: { label: 'Entity', icon: Building2, tint: 'bg-amber-50 border-amber-100 text-amber-600', chip: 'bg-amber-50 text-amber-700 border-amber-100' },
  event: { label: 'Event', icon: CalendarDays, tint: 'bg-sky-50 border-sky-100 text-sky-500', chip: 'bg-sky-50 text-sky-600 border-sky-100' },
  announcement: { label: 'Announcement', icon: Bell, tint: 'bg-rose-50 border-rose-100 text-rose-500', chip: 'bg-rose-50 text-rose-600 border-rose-100' },
  project: { label: 'Project', icon: Briefcase, tint: 'bg-emerald-50 border-emerald-100 text-emerald-600', chip: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  health: { label: 'Health Record', icon: Heart, tint: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-600', chip: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' },
};

const SUBTYPE_ICON: Record<string, React.ElementType> = {
  parish: Building2,
  seminary: GraduationCap,
  school: School,
};

const PAGE_SIZE = 10;

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ArchivesPage() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const access: ArchiveAccess = useMemo(() => getArchiveAccess(permissions), [permissions]);

  const [records, setRecords] = useState<ArchivedRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ArchiveType>('all');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  // Action confirmation
  const [action, setAction] = useState<{ item: ArchivedRecord; kind: 'restore' | 'purge' } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Which type options the user is permitted to see
  const allowedTypes = useMemo(() => {
    const t: ArchiveType[] = [];
    if (access.users) t.push('user');
    if (access.entities) t.push('entity');
    if (access.events) t.push('event');
    if (access.announcements) t.push('announcement');
    if (access.projects) t.push('project');
    if (access.entities || access.users) t.push('health');
    return t;
  }, [access]);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadArchives = useCallback(async () => {
    setLoading(true);
    const out: ArchivedRecord[] = [];

    const tasks: Promise<void>[] = [];

    if (access.users) {
      tasks.push(
        fetch('/api/admin/users', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((users: any[]) => {
            (Array.isArray(users) ? users : []).forEach((u) => {
              if (u.status === 'archived' || u.status === 'inactive') {
                out.push({
                  key: `user-${u.id}`,
                  id: String(u.id),
                  type: 'user',
                  title: u.leader || u.displayName || u.name || u.email || 'User',
                  subtitle: u.role || 'User',
                  detail: u.email || '',
                  archivedAt: u.updatedAt || u.createdAt || new Date().toISOString(),
                  raw: u,
                });
              }
            });
          })
          .catch(() => {}),
      );
    }

    if (access.entities) {
      (['parish', 'seminary', 'school'] as const).forEach((sub) => {
        tasks.push(
          apiClient
            .getAdminEntities(sub, true)
            .then((rows: any) => {
              const list = Array.isArray(rows) ? rows : [];
              list.forEach((e: any) => {
                if (e.status === 'inactive') {
                  out.push({
                    key: `entity-${sub}-${e.id}`,
                    id: String(e.id),
                    type: 'entity',
                    subtype: sub,
                    title: e.name,
                    subtitle: e.vicariate || (sub.charAt(0).toUpperCase() + sub.slice(1)),
                    detail: e.address || '',
                    archivedAt: e.updatedAt || e.updated_at || new Date().toISOString(),
                    raw: { ...e, __subtype: sub },
                  });
                }
              });
            })
            .catch(() => {}),
        );
      });
    }

    if (access.events) {
      tasks.push(
        apiClient
          .getArchivedEvents()
          .then((events: any[]) => {
            (Array.isArray(events) ? events : []).forEach((ev) => {
              out.push({
                key: `event-${ev.id}`,
                id: String(ev.id),
                type: 'event',
                title: ev.event_name,
                subtitle: ev.institution_name || 'Diocese',
                detail: ev.event_level || '',
                archivedAt: ev.deleted_at || new Date().toISOString(),
                raw: ev,
              });
            });
          })
          .catch(() => {}),
      );
    }

    if (access.announcements) {
      tasks.push(
        fetch('/api/announcements/archived', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((items: any[]) => {
            (Array.isArray(items) ? items : []).forEach((a) => {
              out.push({
                key: `announcement-${a.id}`,
                id: String(a.id),
                type: 'announcement',
                title: a.title || a.subject || 'Announcement',
                subtitle: a.category || a.audience || 'General',
                detail: a.body ? String(a.body).slice(0, 80) : '',
                archivedAt: a.deleted_at || a.archived_at || a.updated_at || new Date().toISOString(),
                raw: a,
              });
            });
          })
          .catch(() => {}),
      );
    }

    if (access.projects) {
      tasks.push(
        apiClient
          .getProjects()
          .then((projects: any[]) => {
            const archivedIds = JSON.parse(localStorage.getItem('projects_archived') || '[]') as string[];
            (Array.isArray(projects) ? projects : [])
              .filter((project) => archivedIds.includes(String(project.id)))
              .forEach((project) => {
                out.push({
                  key: `project-${project.id}`,
                  id: String(project.id),
                  type: 'project',
                  title: project.name || 'Project',
                  subtitle: project.entityName || project.entityType || 'Project',
                  detail: project.category || project.description || '',
                  archivedAt: project.updatedAt || project.endDate || new Date().toISOString(),
                  raw: project,
                });
              });
          })
          .catch(() => {}),
      );
    }

    if (access.entities || access.users) {
      try {
        const archivedIds = JSON.parse(localStorage.getItem('priest_health_archived') || '[]') as string[];
        const records = JSON.parse(localStorage.getItem('priest_health_records') || '[]') as any[];
        records
          .filter((record) => archivedIds.includes(String(record.id)))
          .forEach((record) => {
            out.push({
              key: `health-${record.id}`,
              id: String(record.id),
              type: 'health',
              title: record.name || 'Health record',
              subtitle: record.parish || record.position || 'Health Tracker',
              detail: record.lastCheckup ? `Last check-up: ${fmtDate(record.lastCheckup)}` : record.email || '',
              archivedAt: record.updatedAt || record.lastCheckup || new Date().toISOString(),
              raw: record,
            });
          });
      } catch {
        // Ignore malformed local archive data.
      }
    }

    await Promise.all(tasks);
    setRecords(out);
    setLoading(false);
  }, [access]);

  useEffect(() => {
    if (permissionsLoading) return;
    loadArchives();
  }, [permissionsLoading, loadArchives]);

  // Keep the type filter valid if permissions narrow the options
  useEffect(() => {
    if (typeFilter !== 'all' && !allowedTypes.includes(typeFilter)) setTypeFilter('all');
  }, [allowedTypes, typeFilter]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = records.slice();

    if (typeFilter !== 'all') list = list.filter((r) => r.type === typeFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q),
      );
    }

    if (dateRange !== 'all') {
      const cutoff = new Date();
      if (dateRange === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (dateRange === 'week') cutoff.setDate(cutoff.getDate() - 7);
      else if (dateRange === 'month') cutoff.setDate(cutoff.getDate() - 30);
      list = list.filter((r) => new Date(r.archivedAt) >= cutoff);
    }

    list.sort((a, b) => {
      const ta = new Date(a.archivedAt).getTime();
      const tb = new Date(b.archivedAt).getTime();
      return sortBy === 'newest' ? tb - ta : ta - tb;
    });

    return list;
  }, [records, typeFilter, search, dateRange, sortBy]);

  // Reset to first page whenever the filters change the result set
  useEffect(() => {
    setPage(1);
  }, [typeFilter, search, dateRange, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: records.length };
    for (const r of records) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [records]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const performRestore = async (item: ArchivedRecord) => {
    if (item.type === 'user') {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id, action: 'restore' }),
      });
      if (!res.ok) throw new Error('restore failed');
    } else if (item.type === 'entity') {
      const res = await fetch('/api/admin/entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: item.subtype, id: item.id, status: 'active' }),
      });
      if (!res.ok) throw new Error('restore failed');
    } else if (item.type === 'event') {
      await apiClient.restoreEvent(item.id);
    } else if (item.type === 'announcement') {
      const res = await fetch(`/api/announcements/${item.id}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('restore failed');
    } else if (item.type === 'project') {
      const archivedIds = JSON.parse(localStorage.getItem('projects_archived') || '[]') as string[];
      localStorage.setItem('projects_archived', JSON.stringify(archivedIds.filter((id) => id !== item.id)));
    } else if (item.type === 'health') {
      const archivedIds = JSON.parse(localStorage.getItem('priest_health_archived') || '[]') as string[];
      localStorage.setItem('priest_health_archived', JSON.stringify(archivedIds.filter((id) => id !== item.id)));
    }
  };

  const performPurge = async (item: ArchivedRecord) => {
    // Hard delete is only wired for entities; other types support restore only.
    if (item.type === 'entity') {
      const res = await fetch('/api/admin/entities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: item.subtype, id: item.id, hard: true }),
      });
      if (!res.ok) throw new Error('purge failed');
    }
  };

  const confirmAction = async () => {
    if (!action) return;
    setProcessing(true);
    try {
      if (action.kind === 'restore') await performRestore(action.item);
      else await performPurge(action.item);
      setRecords((prev) => prev.filter((r) => r.key !== action.item.key));
      showToast(
        action.kind === 'restore'
          ? `"${action.item.title}" restored.`
          : `"${action.item.title}" permanently deleted.`,
      );
    } catch {
      showToast('Action failed. Please try again.');
    } finally {
      setProcessing(false);
      setAction(null);
    }
  };

  // Permanent delete is only meaningful for entities.
  const canPurge = (item: ArchivedRecord) => item.type === 'entity';

  return (
    <div className="min-h-screen bg-[#f5f5f5] pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* ── Header ── */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-black/10 bg-black text-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/25 bg-white/5">
                <Archive className="h-5 w-5 text-gold-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">Diocesan Records</p>
                <h1 className="mt-1 font-serif text-3xl font-bold leading-none text-white md:text-4xl">Archives</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-white/55">
                  Restore or permanently remove archived records you are permitted to manage.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Total Archived</p>
              <p className="mt-1 text-3xl font-black leading-none text-white">{records.length}</p>
            </div>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search archived records…"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
              />
            </div>

            {/* Type filter — only permitted types are listed */}
            <div className="relative w-full sm:w-52">
              <Archive className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="h-11 w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm font-bold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
              >
                <option value="all">All types ({counts.all ?? 0})</option>
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}s ({counts[t] ?? 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Date range */}
            <div className="relative w-full sm:w-44">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="h-11 w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-10 text-sm font-bold text-slate-700 transition-all focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">Past 7 days</option>
                <option value="month">Past 30 days</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Sort */}
            <button
              onClick={() => setSortBy((p) => (p === 'newest' ? 'oldest' : 'newest'))}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-600 transition-all hover:bg-white"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              {sortBy === 'newest' ? 'Newest' : 'Oldest'}
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white">
            <InlineLoader label="Loading archives" />
          </div>
        ) : allowedTypes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center">
            <Archive className="h-10 w-10 text-slate-300" />
            <p className="text-lg font-serif font-bold text-slate-900">No archive access</p>
            <p className="max-w-md text-sm text-slate-400">
              Your role can’t manage any archives yet. Ask an administrator to grant archive access.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center">
            <Archive className="h-10 w-10 text-slate-300" />
            <p className="text-lg font-serif font-bold text-slate-900">No archived records found</p>
            <p className="max-w-md text-sm text-slate-400">Nothing matches the current filters.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Record</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                  <th className="hidden px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 md:table-cell">
                    Reference
                  </th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Archived</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageItems.map((item) => {
                  const meta = TYPE_META[item.type];
                  const Icon = item.subtype ? SUBTYPE_ICON[item.subtype] || meta.icon : meta.icon;
                  return (
                    <tr key={item.key} className="group transition-colors hover:bg-slate-50/60">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${meta.tint}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                            <p className="truncate text-[11px] text-slate-400">{item.detail || item.subtitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.chip}`}
                        >
                          {item.subtype ?? meta.label}
                        </span>
                      </td>
                      <td className="hidden px-4 py-4 text-xs font-semibold text-slate-500 md:table-cell">
                        {item.subtitle}
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-slate-400">{fmtDate(item.archivedAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setAction({ item, kind: 'restore' })}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>
                          {canPurge(item) && (
                            <button
                              onClick={() => setAction({ item, kind: 'purge' })}
                              className="inline-flex items-center justify-center rounded-xl border border-rose-100 bg-rose-50 p-2 text-rose-500 transition-colors hover:bg-rose-100"
                              title="Delete permanently"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
              <p className="text-xs font-semibold text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-bold text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {action && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !processing && setAction(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="space-y-6 p-8 text-center">
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${
                    action.kind === 'restore'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-500'
                      : 'border-rose-100 bg-rose-50 text-rose-500'
                  }`}
                >
                  {action.kind === 'restore' ? <RotateCcw className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold capitalize text-slate-900">
                    {action.kind === 'restore' ? 'Restore record' : 'Delete permanently'}
                  </h3>
                  <p className="text-xs font-semibold leading-relaxed text-slate-500">
                    {action.kind === 'restore'
                      ? `Restore "${action.item.title}" back to its active list?`
                      : `Permanently erase "${action.item.title}"? This cannot be undone.`}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    disabled={processing}
                    onClick={() => setAction(null)}
                    className="flex-1 rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={processing}
                    onClick={confirmAction}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors ${
                      action.kind === 'restore'
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-rose-500 hover:bg-rose-600'
                    }`}
                  >
                    {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {action.kind === 'restore' ? 'Restore' : 'Delete'}
                  </button>
                </div>
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
            className="fixed bottom-8 right-6 z-[130] flex items-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-medium text-white shadow-2xl"
          >
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
