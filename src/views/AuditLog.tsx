'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from 'recharts';
import {
  Download, Search, Eye,
  AlertTriangle, CheckCircle,
  Database, Users, Cpu,
  ScrollText, BarChart2,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type LogCategory = 'all' | 'auth' | 'finance' | 'analytics' | 'reports' | 'system' | 'access';
type LogSeverity = 'info' | 'warning' | 'error' | 'success';

interface AuditEntry {
  id: string;
  user: string;
  role: string;
  isSystem?: boolean;
  category: Exclude<LogCategory, 'all'>;
  severity: LogSeverity;
  action: string;
  detail: string;
  timestamp: string;
  date: string;
  ip: string;
  entity?: string;
}

// ─────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────
const RAW_LOGS: AuditEntry[] = [
  { id: 'LOG-5041', user: 'Bp. Jose Reyes', role: 'Bishop', category: 'auth', severity: 'success', action: 'Logged In', detail: 'Bishop signed in to the diocesan financial portal', timestamp: '8:02 AM', date: 'Apr 27, 2026', ip: '192.168.1.2' },
  { id: 'LOG-5040', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'info', action: 'Backup Completed', detail: 'Daily database backup executed and stored successfully', timestamp: '3:00 AM', date: 'Apr 27, 2026', ip: 'system' },
  { id: 'LOG-5039', user: 'Fr. Manny Cruz', role: 'Priest', category: 'finance', severity: 'success', action: 'Report Submitted', detail: 'Monthly collection report for March 2026 submitted via portal', timestamp: '5:45 PM', date: 'Apr 26, 2026', ip: '192.168.1.11', entity: 'San Isidro Labrador Parish' },
  { id: 'LOG-5038', user: 'Admin Dela Cruz', role: 'Admin', category: 'reports', severity: 'info', action: 'Report Exported', detail: 'Consolidated Financial Statement Q1 2026 exported as PDF', timestamp: '4:30 PM', date: 'Apr 26, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5037', user: 'Bp. Jose Reyes', role: 'Bishop', category: 'analytics', severity: 'info', action: 'Dashboard Viewed', detail: 'Accessed Parish Predictive tab — Monthly Collections Forecast', timestamp: '2:15 PM', date: 'Apr 26, 2026', ip: '192.168.1.2' },
  { id: 'LOG-5036', user: 'Admin Dela Cruz', role: 'Admin', category: 'access', severity: 'warning', action: 'Role Updated', detail: 'User role changed: Fr. Santos promoted from Priest to Seminary Admin', timestamp: '11:30 AM', date: 'Apr 26, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5035', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'info', action: 'Forecast Generated', detail: 'ML forecast model ran successfully across all 12 parishes', timestamp: '6:00 AM', date: 'Apr 26, 2026', ip: 'system' },
  { id: 'LOG-5034', user: 'Bp. Jose Reyes', role: 'Bishop', category: 'analytics', severity: 'info', action: 'Dashboard Viewed', detail: 'Accessed Seminary Analytics — Prescriptive tab', timestamp: '3:55 PM', date: 'Apr 25, 2026', ip: '192.168.1.2', entity: 'Seminaries' },
  { id: 'LOG-5033', user: 'Fr. Ben Salazar', role: 'Priest', category: 'finance', severity: 'info', action: 'Data Accessed', detail: 'Viewed April 2026 disbursement breakdown', timestamp: '2:40 PM', date: 'Apr 25, 2026', ip: '192.168.1.14', entity: 'San Roque Parish' },
  { id: 'LOG-5032', user: 'Admin Dela Cruz', role: 'Admin', category: 'reports', severity: 'info', action: 'Report Exported', detail: 'Entity Health Rankings — All Parishes April 2026 exported as CSV', timestamp: '1:10 PM', date: 'Apr 25, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5031', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'warning', action: 'Anomaly Detected', detail: 'Disbursement spike flagged — 150% above 3-month average', timestamp: '9:30 AM', date: 'Apr 25, 2026', ip: 'system', entity: 'Santo Cristo Parish' },
  { id: 'LOG-5030', user: 'Fr. Manny Cruz', role: 'Priest', category: 'auth', severity: 'info', action: 'Logged Out', detail: 'Fr. Manny Cruz signed out of the diocesan portal', timestamp: '6:02 PM', date: 'Apr 24, 2026', ip: '192.168.1.11' },
  { id: 'LOG-5029', user: 'Admin Dela Cruz', role: 'Admin', category: 'access', severity: 'info', action: 'User Created', detail: 'New account provisioned — Sr. Clara Mendoza (School Admin)', timestamp: '3:45 PM', date: 'Apr 24, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5028', user: 'Bp. Jose Reyes', role: 'Bishop', category: 'finance', severity: 'info', action: 'Data Accessed', detail: 'Viewed diocese-wide collections vs disbursements summary — YTD 2026', timestamp: '11:20 AM', date: 'Apr 24, 2026', ip: '192.168.1.2' },
  { id: 'LOG-5027', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'info', action: 'Simulator Synced', detail: 'Simulator model weights refreshed using latest collection data', timestamp: '5:00 AM', date: 'Apr 24, 2026', ip: 'system' },
  { id: 'LOG-5026', user: 'Admin Dela Cruz', role: 'Admin', category: 'analytics', severity: 'info', action: 'Dashboard Viewed', detail: 'Accessed Diocesan Schools Analytics — Diagnostic tab', timestamp: '4:10 PM', date: 'Apr 23, 2026', ip: '192.168.1.5', entity: 'Diocesan Schools' },
  { id: 'LOG-5025', user: 'Admin Dela Cruz', role: 'Admin', category: 'system', severity: 'info', action: 'Settings Updated', detail: 'Anomaly detection threshold changed from 130% to 140%', timestamp: '2:00 PM', date: 'Apr 23, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5024', user: 'Fr. Alex Tan', role: 'Priest', category: 'finance', severity: 'success', action: 'Report Submitted', detail: 'Monthly collection report for March 2026 submitted via portal', timestamp: '10:30 AM', date: 'Apr 23, 2026', ip: '192.168.1.19', entity: 'Sto. Niño Parish' },
  { id: 'LOG-5023', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'error', action: 'Sync Failed', detail: 'Firebase sync timeout for parish report data — retry queued', timestamp: '11:45 PM', date: 'Apr 22, 2026', ip: 'system' },
  { id: 'LOG-5022', user: 'Bp. Jose Reyes', role: 'Bishop', category: 'auth', severity: 'success', action: 'Logged In', detail: 'Bishop signed in to the diocesan financial portal', timestamp: '9:00 AM', date: 'Apr 22, 2026', ip: '192.168.1.2' },
  { id: 'LOG-5021', user: 'Admin Dela Cruz', role: 'Admin', category: 'reports', severity: 'info', action: 'Audit Log Exported', detail: 'Full audit trail for April 1–21, 2026 exported as CSV', timestamp: '8:50 AM', date: 'Apr 22, 2026', ip: '192.168.1.5' },
  { id: 'LOG-5020', user: 'System', role: 'Automated', isSystem: true, category: 'system', severity: 'info', action: 'Backup Completed', detail: 'Daily database backup executed and stored successfully', timestamp: '3:00 AM', date: 'Apr 22, 2026', ip: 'system' },
  { id: 'LOG-5019', user: 'Fr. Manny Cruz', role: 'Priest', category: 'auth', severity: 'success', action: 'Logged In', detail: 'Fr. Manny Cruz signed in to the diocesan portal', timestamp: '8:15 AM', date: 'Apr 21, 2026', ip: '192.168.1.11' },
  { id: 'LOG-5018', user: 'Admin Dela Cruz', role: 'Admin', category: 'access', severity: 'warning', action: 'Password Reset', detail: 'Admin-initiated password reset for Fr. Ben Salazar', timestamp: '3:30 PM', date: 'Apr 20, 2026', ip: '192.168.1.5' },
];

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const CATEGORY_CONFIG: Record<Exclude<LogCategory, 'all'>, { label: string; dot: string; pill: string; chart: string }> = {
  auth:      { label: 'Auth',      dot: 'bg-gold-500',     pill: 'bg-gold-500/10 text-gold-700 border border-gold-200',      chart: '#D4AF37' },
  finance:   { label: 'Finance',   dot: 'bg-church-green', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', chart: '#1a472a' },
  analytics: { label: 'Analytics', dot: 'bg-purple-500',   pill: 'bg-purple-50 text-purple-700 border border-purple-200',    chart: '#7C3AED' },
  reports:   { label: 'Reports',   dot: 'bg-amber-400',    pill: 'bg-amber-50 text-amber-700 border border-amber-200',       chart: '#F59E0B' },
  system:    { label: 'System',    dot: 'bg-gray-400',     pill: 'bg-gray-100 text-gray-600 border border-gray-200',         chart: '#6B7280' },
  access:    { label: 'Access',    dot: 'bg-rose-500',     pill: 'bg-rose-50 text-rose-700 border border-rose-200',          chart: '#F43F5E' },
};

const SEVERITY_CONFIG: Record<LogSeverity, { icon: React.ReactNode; ring: string; chart: string }> = {
  success: { icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,  ring: 'ring-emerald-200 bg-emerald-50', chart: '#10B981' },
  info:    { icon: <Eye className="w-3.5 h-3.5 text-blue-400" />,              ring: 'ring-blue-100 bg-blue-50',       chart: '#60A5FA' },
  warning: { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,  ring: 'ring-amber-200 bg-amber-50',     chart: '#F59E0B' },
  error:   { icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />,   ring: 'ring-rose-200 bg-rose-50',       chart: '#F43F5E' },
};

const FILTER_TABS: { id: LogCategory; label: string }[] = [
  { id: 'all',       label: 'All Events' },
  { id: 'auth',      label: 'Auth' },
  { id: 'finance',   label: 'Finance' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports',   label: 'Reports' },
  { id: 'system',    label: 'System' },
  { id: 'access',    label: 'Access' },
];

function groupByDate(logs: AuditEntry[]) {
  const groups: Record<string, AuditEntry[]> = {};
  for (const log of logs) {
    if (!groups[log.date]) groups[log.date] = [];
    groups[log.date].push(log);
  }
  return groups;
}

// ─────────────────────────────────────────────
// Analytics sub-components
// ─────────────────────────────────────────────
const TooltipBox = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export function AuditLog() {
  const [search, setSearch]             = useState('');
  const [activeFilter, setActiveFilter] = useState<LogCategory>('all');
  const [showAnalytics, setShowAnalytics] = useState(false);

  const filtered = useMemo(() => {
    return RAW_LOGS.filter(log => {
      const matchCat  = activeFilter === 'all' || log.category === activeFilter;
      const q         = search.toLowerCase();
      const matchText = !q || [log.user, log.action, log.detail, log.id, log.entity ?? '']
                              .some(s => s.toLowerCase().includes(q));
      return matchCat && matchText;
    });
  }, [search, activeFilter]);

  const grouped  = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = Object.keys(grouped);

  const stats = useMemo(() => ({
    total:   RAW_LOGS.length,
    users:   RAW_LOGS.filter(l => !l.isSystem).length,
    system:  RAW_LOGS.filter(l => l.isSystem).length,
    alerts:  RAW_LOGS.filter(l => l.severity === 'warning' || l.severity === 'error').length,
  }), []);

  // ── Analytics data derived from logs ──────────
  const activityTrendData = useMemo(() => {
    const counts: Record<string, number> = {};
    RAW_LOGS.forEach(l => { counts[l.date] = (counts[l.date] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, events]) => ({ date: date.replace(', 2026', ''), events }));
  }, []);

  const categoryData = useMemo(() => {
    const counts: Partial<Record<Exclude<LogCategory,'all'>, number>> = {};
    RAW_LOGS.forEach(l => { counts[l.category] = (counts[l.category] || 0) + 1; });
    return Object.entries(counts).map(([cat, count]) => ({
      name: CATEGORY_CONFIG[cat as Exclude<LogCategory,'all'>].label,
      value: count as number,
      color: CATEGORY_CONFIG[cat as Exclude<LogCategory,'all'>].chart,
    }));
  }, []);

  const severityData = useMemo(() => {
    const counts: Partial<Record<LogSeverity, number>> = {};
    RAW_LOGS.forEach(l => { counts[l.severity] = (counts[l.severity] || 0) + 1; });
    return (['success', 'info', 'warning', 'error'] as LogSeverity[]).map(sev => ({
      name: sev.charAt(0).toUpperCase() + sev.slice(1),
      count: counts[sev] || 0,
      color: SEVERITY_CONFIG[sev].chart,
    }));
  }, []);

  const topUsersData = useMemo(() => {
    const counts: Record<string, number> = {};
    RAW_LOGS.filter(l => !l.isSystem).forEach(l => {
      counts[l.user] = (counts[l.user] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, actions]) => ({ name: name.replace('Admin ', 'Adm. '), actions }));
  }, []);

  const insightText = useMemo(() => {
    const topCat = categoryData.reduce((a, b) => a.value > b.value ? a : b);
    const warnings = RAW_LOGS.filter(l => l.severity === 'warning' || l.severity === 'error').length;
    const topUser = topUsersData[0];
    return [
      `Most frequent event category is ${topCat.name} with ${topCat.value} events in the last 30 days.`,
      `${warnings} alert${warnings !== 1 ? 's' : ''} (warnings/errors) detected — review system and access logs for anomalies.`,
      topUser ? `${topUser.name} is the most active user with ${topUser.actions} recorded actions.` : '',
      `System automated events account for ${stats.system} of ${stats.total} total events (${Math.round((stats.system/stats.total)*100)}%).`,
    ].filter(Boolean);
  }, [categoryData, topUsersData, stats]);

  const handleExport = () => {
    const rows = [
      ['Log ID', 'Date', 'Time', 'User', 'Role', 'Category', 'Action', 'Detail', 'Entity', 'IP'],
      ...filtered.map(l => [
        l.id, l.date, l.timestamp, l.user, l.role,
        CATEGORY_CONFIG[l.category].label,
        l.action, l.detail, l.entity ?? '', l.ip,
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `diocese-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] flex flex-col">

      {/* ── Dark Hero Header ───────────────────────────── */}
      <div className="bg-church-black px-6 pt-10 pb-12">
        <div className="max-w-[1400px] mx-auto">
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-6">
            Administration &nbsp;/&nbsp; <span className="text-gold-400">Audit Trail</span>
          </p>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-3 px-5 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-gold-400 mb-5">
                <ScrollText className="w-3.5 h-3.5" />
                Activity Trail
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-white leading-tight">
                Audit Log &amp; <br />
                <span className="text-gold-400 italic">System History</span>
              </h1>
              <p className="mt-3 text-sm text-white/40 font-light max-w-lg leading-relaxed">
                A complete record of every user action and automated system event across the diocesan financial management platform.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:min-w-[540px]">
              {[
                { label: 'Total Events (30d)', value: stats.total,  icon: Database,      color: 'text-gold-400' },
                { label: 'User Actions',        value: stats.users,  icon: Users,         color: 'text-emerald-400' },
                { label: 'System Events',       value: stats.system, icon: Cpu,           color: 'text-blue-400' },
                { label: 'Alerts',              value: stats.alerts, icon: AlertTriangle, color: 'text-rose-400' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                    <p className="text-3xl font-black text-white">{s.value}</p>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] leading-tight">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-church-green/20 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeFilter === tab.id
                    ? 'bg-church-black text-gold-400 shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAnalytics(v => !v)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors border ${
              showAnalytics
                ? 'bg-church-green text-white border-church-green'
                : 'bg-white text-church-green border-church-green/30 hover:border-church-green'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Analytics
          </button>

          <button
            onClick={handleExport}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-church-black text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-church-green transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Analytics Panel ───────────────────────────── */}
      <AnimatePresence>
        {showAnalytics && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-gray-100 bg-gray-50"
          >
            <div className="max-w-[1400px] mx-auto px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <BarChart2 className="w-5 h-5 text-church-green" />
                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Audit Log Analytics</h2>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Last 30 Days</span>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

                {/* Activity Trend */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Event Volume by Day</p>
                  <p className="text-xs text-gray-400 mb-4">Total system & user events recorded per day</p>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="auditGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1a472a" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#1a472a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9CA3AF', fontWeight: 700 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<TooltipBox />} />
                        <Area type="monotone" dataKey="events" name="Events" stroke="#1a472a" strokeWidth={2.5} fill="url(#auditGrad)" dot={{ r: 4, fill: '#1a472a', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Events by Category</p>
                  <p className="text-xs text-gray-400 mb-2">Distribution across log types</p>
                  <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                          {categoryData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [v, n]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                    {categoryData.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-[10px] font-bold text-gray-500 truncate">{c.name}</span>
                        <span className="text-[10px] font-black text-gray-800 ml-auto">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

                {/* Severity Breakdown */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Severity Distribution</p>
                  <p className="text-xs text-gray-400 mb-4">Count of events by severity level</p>
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 700 }} tickLine={false} axisLine={false} width={55} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Events" radius={[0, 6, 6, 0]} maxBarSize={18}>
                          {severityData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Active Users */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Top Active Users</p>
                  <p className="text-xs text-gray-400 mb-4">Most frequent actors (excluding system)</p>
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topUsersData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6B7280', fontWeight: 700 }} tickLine={false} axisLine={false} width={75} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="actions" name="Actions" fill="#D4AF37" radius={[0, 6, 6, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Descriptive Insights */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Key Insights</p>
                  <p className="text-xs text-gray-400 mb-4">Descriptive summary from audit data</p>
                  <div className="flex flex-col gap-3 flex-1">
                    {insightText.map((text, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-church-green shrink-0" />
                        <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Timeline Feed ─────────────────────────────── */}
      <div className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
            <ScrollText className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold">No log entries match your search or filter.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {dateKeys.map((date, di) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: di * 0.05 }}
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-2 h-2 rounded-full bg-gold-500 shrink-0" />
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">{date}</p>
                  <div className="flex-1 h-px bg-gray-100" />
                  <p className="text-[10px] font-bold text-gray-300">{grouped[date].length} event{grouped[date].length !== 1 ? 's' : ''}</p>
                </div>

                <div className="relative pl-6 border-l-2 border-gray-100 space-y-1">
                  {grouped[date].map((log, li) => {
                    const sev = SEVERITY_CONFIG[log.severity];
                    const cat = CATEGORY_CONFIG[log.category];
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: di * 0.04 + li * 0.03 }}
                        className="relative group"
                      >
                        <div className={`absolute -left-[1.85rem] top-4 w-3.5 h-3.5 rounded-full ring-2 ring-offset-2 ring-offset-[#FDFCFB] ${sev.ring} flex items-center justify-center`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                        </div>

                        <div className="ml-4 mb-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gold-200/60 transition-all duration-300 px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className={`mt-0.5 p-2 rounded-xl shrink-0 ring-1 ${sev.ring}`}>
                            {sev.icon}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`text-sm font-bold ${log.isSystem ? 'text-gray-500 italic' : 'text-church-black'}`}>
                                {log.user}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                {log.role}
                              </span>
                              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${cat.pill}`}>
                                {cat.label}
                              </span>
                              <span className="text-[11px] font-black text-church-black/70 uppercase tracking-wider">
                                — {log.action}
                              </span>
                            </div>

                            <p className="text-sm text-gray-500 leading-relaxed">{log.detail}</p>

                            {log.entity && (
                              <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black text-church-green uppercase tracking-wider bg-church-green/5 border border-church-green/20 px-2.5 py-1 rounded-full">
                                <div className="w-1 h-1 rounded-full bg-church-green" />
                                {log.entity}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 text-right sm:min-w-[130px]">
                            <p className="text-xs font-bold text-gray-500">{log.timestamp}</p>
                            <p className="text-[10px] text-gray-300 mt-0.5 font-mono">{log.ip}</p>
                            <p className="text-[10px] text-gray-300 font-mono">{log.id}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-12 flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-100" />
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] whitespace-nowrap">
            {filtered.length} of {RAW_LOGS.length} events &nbsp;·&nbsp; 90-day retention
          </p>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
