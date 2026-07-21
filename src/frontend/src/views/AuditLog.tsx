'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactECharts from 'echarts-for-react';
import { InlineLoader } from '../components/ui/LoadingScreen';
import { getInitials } from '../lib/initials';
import {
  Download,
  Search,
  Eye,
  AlertTriangle,
  CheckCircle,
  Database,
  Users,
  Cpu,
  ScrollText,
  BarChart2,
  X,
  ChevronRight,
  Briefcase,
  FileDown,
  CalendarDays,
  Megaphone,
  CalendarCheck2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type LogCategory =
  | 'all'
  | 'auth'
  | 'users'
  | 'projects'
  | 'finance'
  | 'data'
  | 'events'
  | 'announcements'
  | 'calendar'
  | 'analytics'
  | 'system';
type LogSeverity = 'info' | 'warning' | 'error' | 'success';
type InstitutionTypeFilter = 'all' | 'diocese' | 'parish' | 'school' | 'seminary';

interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

interface AuditEntry {
  id: string;
  user: string;
  role: string;
  email?: string;
  avatarUrl?: string;
  isSystem?: boolean;
  category: Exclude<LogCategory, 'all'>;
  severity: LogSeverity;
  action: string;
  detail: string;
  timestamp: string;
  date: string;
  occurredAt?: string;
  ip: string;
  institutionId?: string;
  institutionType?: Exclude<InstitutionTypeFilter, 'all'>;
  entity?: string;
  changes?: FieldChange[];
  metadata?: Record<string, any>;
}

interface InstitutionOption {
  id: string;
  name: string;
  type: Exclude<InstitutionTypeFilter, 'all'>;
  key: string;
}

// ─────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────
const RAW_LOGS: AuditEntry[] = [
  {
    id: 'LOG-5041',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'auth',
    severity: 'success',
    action: 'Logged In',
    detail: 'Bishop signed in to the diocesan financial portal',
    timestamp: '8:02 AM',
    date: 'Apr 27, 2026',
    ip: '192.168.1.2',
  },
  {
    id: 'LOG-5040',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'info',
    action: 'Backup Completed',
    detail: 'Daily database backup executed and stored successfully',
    timestamp: '3:00 AM',
    date: 'Apr 27, 2026',
    ip: 'system',
  },
  {
    id: 'LOG-5039',
    user: 'Fr. Manny Cruz',
    role: 'Priest',
    category: 'finance',
    severity: 'success',
    action: 'Financial Record Saved',
    detail: 'Monthly collection report for March 2026 submitted via portal',
    timestamp: '5:45 PM',
    date: 'Apr 26, 2026',
    ip: '192.168.1.11',
    entity: 'San Isidro Labrador Parish',
  },
  {
    id: 'LOG-5038',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'data',
    severity: 'info',
    action: 'Report Exported',
    detail: 'Consolidated Financial Statement Q1 2026 exported as PDF',
    timestamp: '4:30 PM',
    date: 'Apr 26, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5037',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'analytics',
    severity: 'info',
    action: 'Scenario Saved',
    detail: 'Institution simulator scenario created for Santo Cristo Parish — Low Risk, 6-month horizon',
    timestamp: '2:15 PM',
    date: 'Apr 26, 2026',
    ip: '192.168.1.2',
    entity: 'Santo Cristo Parish',
  },
  {
    id: 'LOG-5036',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'users',
    severity: 'warning',
    action: 'Roles Updated',
    detail: 'User role changed: Fr. Santos promoted from Priest to Seminary Admin',
    timestamp: '11:30 AM',
    date: 'Apr 26, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5035',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'info',
    action: 'Forecast Generated',
    detail: 'ML forecast model ran successfully across all 12 parishes',
    timestamp: '6:00 AM',
    date: 'Apr 26, 2026',
    ip: 'system',
  },
  {
    id: 'LOG-5034',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'announcements',
    severity: 'success',
    action: 'Announcement Published',
    detail: '"Q1 Budget Submission Reminder" published to all parishes',
    timestamp: '3:55 PM',
    date: 'Apr 25, 2026',
    ip: '192.168.1.5',
    entity: 'Diocese-wide',
  },
  {
    id: 'LOG-5033',
    user: 'Fr. Ben Salazar',
    role: 'Priest',
    category: 'finance',
    severity: 'info',
    action: 'Financial Record Saved',
    detail: 'April 2026 disbursement breakdown submitted for review',
    timestamp: '2:40 PM',
    date: 'Apr 25, 2026',
    ip: '192.168.1.14',
    entity: 'San Roque Parish',
  },
  {
    id: 'LOG-5032',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'data',
    severity: 'info',
    action: 'CSV Export',
    detail: 'Entity Health Rankings — All Parishes April 2026 exported as CSV',
    timestamp: '1:10 PM',
    date: 'Apr 25, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5031',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'warning',
    action: 'Anomaly Detected',
    detail: 'Disbursement spike flagged — 150% above 3-month average',
    timestamp: '9:30 AM',
    date: 'Apr 25, 2026',
    ip: 'system',
    entity: 'Santo Cristo Parish',
  },
  {
    id: 'LOG-5030',
    user: 'Fr. Manny Cruz',
    role: 'Priest',
    category: 'auth',
    severity: 'info',
    action: 'Logged Out',
    detail: 'Fr. Manny Cruz signed out of the diocesan portal',
    timestamp: '6:02 PM',
    date: 'Apr 24, 2026',
    ip: '192.168.1.11',
  },
  {
    id: 'LOG-5029',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'users',
    severity: 'success',
    action: 'User Created',
    detail: 'New account provisioned — Sr. Clara Mendoza (School Admin)',
    timestamp: '3:45 PM',
    date: 'Apr 24, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5028',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'events',
    severity: 'success',
    action: 'Event Created',
    detail: '"Diocesan Finance Assembly 2026" created and published to all institutions',
    timestamp: '11:20 AM',
    date: 'Apr 24, 2026',
    ip: '192.168.1.2',
    entity: 'Diocese of San Pablo',
  },
  {
    id: 'LOG-5027',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'info',
    action: 'Simulator Synced',
    detail: 'Simulator model weights refreshed using latest collection data',
    timestamp: '5:00 AM',
    date: 'Apr 24, 2026',
    ip: 'system',
  },
  {
    id: 'LOG-5026',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'calendar',
    severity: 'success',
    action: 'Calendar Bulk Approved',
    detail: '47 liturgical calendar entries for May 2026 approved in bulk',
    timestamp: '4:10 PM',
    date: 'Apr 23, 2026',
    ip: '192.168.1.2',
    entity: 'Diocese of San Pablo',
  },
  {
    id: 'LOG-5025',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'system',
    severity: 'info',
    action: 'Settings Updated',
    detail: 'Anomaly detection threshold changed from 130% to 140%',
    timestamp: '2:00 PM',
    date: 'Apr 23, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5024',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'projects',
    severity: 'success',
    action: 'Project Created',
    detail: 'New project "Parish Hall Renovation 2026" created for San Isidro Parish',
    timestamp: '10:30 AM',
    date: 'Apr 23, 2026',
    ip: '192.168.1.5',
    entity: 'San Isidro Labrador Parish',
  },
  {
    id: 'LOG-5023',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'error',
    action: 'Sync Failed',
    detail: 'Database sync timeout for parish report data — retry queued',
    timestamp: '11:45 PM',
    date: 'Apr 22, 2026',
    ip: 'system',
  },
  {
    id: 'LOG-5022',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'auth',
    severity: 'success',
    action: 'Logged In',
    detail: 'Bishop signed in to the diocesan financial portal',
    timestamp: '9:00 AM',
    date: 'Apr 22, 2026',
    ip: '192.168.1.2',
  },
  {
    id: 'LOG-5021',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'data',
    severity: 'info',
    action: 'Audit Log Exported',
    detail: 'Full audit trail for April 1–21, 2026 exported as CSV',
    timestamp: '8:50 AM',
    date: 'Apr 22, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5020',
    user: 'System',
    role: 'Automated',
    isSystem: true,
    category: 'system',
    severity: 'info',
    action: 'Backup Completed',
    detail: 'Daily database backup executed and stored successfully',
    timestamp: '3:00 AM',
    date: 'Apr 22, 2026',
    ip: 'system',
  },
  {
    id: 'LOG-5019',
    user: 'Fr. Manny Cruz',
    role: 'Priest',
    category: 'auth',
    severity: 'success',
    action: 'Logged In',
    detail: 'Fr. Manny Cruz signed in to the diocesan portal',
    timestamp: '8:15 AM',
    date: 'Apr 21, 2026',
    ip: '192.168.1.11',
  },
  {
    id: 'LOG-5018',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'users',
    severity: 'warning',
    action: 'User Archived',
    detail: 'Admin-initiated account suspension for Fr. Ben Salazar — pending transfer',
    timestamp: '3:30 PM',
    date: 'Apr 20, 2026',
    ip: '192.168.1.5',
  },
  {
    id: 'LOG-5017',
    user: 'Admin Dela Cruz',
    role: 'Admin',
    category: 'projects',
    severity: 'info',
    action: 'Donation Added',
    detail: 'Donation of ₱50,000 recorded for "Parish Hall Renovation 2026" from CBCP Foundation',
    timestamp: '10:05 AM',
    date: 'Apr 20, 2026',
    ip: '192.168.1.5',
    entity: 'San Isidro Labrador Parish',
  },
  {
    id: 'LOG-5016',
    user: 'Bp. Jose Reyes',
    role: 'Bishop',
    category: 'calendar',
    severity: 'warning',
    action: 'Calendar Entry Rejected',
    detail: '"Feast of San Roque (local)" on Aug 16 rejected — not in Roman Martyrology',
    timestamp: '2:50 PM',
    date: 'Apr 19, 2026',
    ip: '192.168.1.2',
    entity: 'San Roque Parish',
  },
];

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const CATEGORY_CONFIG: Record<
  Exclude<LogCategory, 'all'>,
  { label: string; dot: string; pill: string; chart: string; icon: React.ReactNode }
> = {
  auth: {
    label: 'Auth',
    dot: 'bg-gold-500',
    pill: 'bg-gold-500/10 text-gold-700 border border-gold-200',
    chart: '#D4AF37',
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  users: {
    label: 'Users',
    dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 border border-rose-200',
    chart: '#F43F5E',
    icon: <Users className="w-3 h-3" />,
  },
  projects: {
    label: 'Projects',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border border-blue-200',
    chart: '#3B82F6',
    icon: <Briefcase className="w-3 h-3" />,
  },
  finance: {
    label: 'Finance',
    dot: 'bg-church-green',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    chart: '#1a472a',
    icon: <Database className="w-3 h-3" />,
  },
  data: {
    label: 'Data',
    dot: 'bg-amber-400',
    pill: 'bg-amber-50 text-amber-700 border border-amber-200',
    chart: '#F59E0B',
    icon: <FileDown className="w-3 h-3" />,
  },
  events: {
    label: 'Events',
    dot: 'bg-sky-500',
    pill: 'bg-sky-50 text-sky-700 border border-sky-200',
    chart: '#0EA5E9',
    icon: <CalendarDays className="w-3 h-3" />,
  },
  announcements: {
    label: 'Announcements',
    dot: 'bg-orange-400',
    pill: 'bg-orange-50 text-orange-700 border border-orange-200',
    chart: '#FB923C',
    icon: <Megaphone className="w-3 h-3" />,
  },
  calendar: {
    label: 'Calendar',
    dot: 'bg-teal-500',
    pill: 'bg-teal-50 text-teal-700 border border-teal-200',
    chart: '#14B8A6',
    icon: <CalendarCheck2 className="w-3 h-3" />,
  },
  analytics: {
    label: 'Analytics',
    dot: 'bg-purple-500',
    pill: 'bg-purple-50 text-purple-700 border border-purple-200',
    chart: '#7C3AED',
    icon: <BarChart2 className="w-3 h-3" />,
  },
  system: {
    label: 'System',
    dot: 'bg-gray-400',
    pill: 'bg-gray-100 text-gray-600 border border-gray-200',
    chart: '#6B7280',
    icon: <Cpu className="w-3 h-3" />,
  },
};

const SEVERITY_CONFIG: Record<LogSeverity, { icon: React.ReactNode; ring: string; chart: string }> = {
  success: {
    icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
    ring: 'ring-emerald-200 bg-emerald-50',
    chart: '#10B981',
  },
  info: { icon: <Eye className="w-3.5 h-3.5 text-blue-400" />, ring: 'ring-blue-100 bg-blue-50', chart: '#60A5FA' },
  warning: {
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    ring: 'ring-amber-200 bg-amber-50',
    chart: '#F59E0B',
  },
  error: {
    icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />,
    ring: 'ring-rose-200 bg-rose-50',
    chart: '#F43F5E',
  },
};

const FILTER_TABS: { id: LogCategory; label: string }[] = [
  { id: 'all', label: 'All Events' },
  { id: 'auth', label: 'Auth' },
  { id: 'users', label: 'Users' },
  { id: 'projects', label: 'Projects' },
  { id: 'finance', label: 'Finance' },
  { id: 'data', label: 'Data' },
  { id: 'events', label: 'Events' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'system', label: 'System' },
];

function groupByDate(logs: AuditEntry[]) {
  const groups: Record<string, AuditEntry[]> = {};
  for (const log of logs) {
    if (!groups[log.date]) groups[log.date] = [];
    groups[log.date].push(log);
  }
  return groups;
}

function normalizeInstitutionType(value: any): Exclude<InstitutionTypeFilter, 'all'> | null {
  const raw = String(value ?? '').toLowerCase().trim().replace(/[_\s-]+/g, '');
  if (raw === 'parish' || raw === 'parishes') return 'parish';
  if (raw === 'school' || raw === 'schools' || raw === 'diocesanschool' || raw === 'diocesanschools') return 'school';
  if (raw === 'seminary' || raw === 'seminaries') return 'seminary';
  if (raw === 'diocese') return 'diocese';
  return null;
}

function inferInstitutionType(row: any, fallback: Exclude<InstitutionTypeFilter, 'all'>): Exclude<InstitutionTypeFilter, 'all'> {
  const explicit = normalizeInstitutionType(row?.institution_type ?? row?.entityType ?? row?.entity_type ?? row?.type);
  if (explicit) return explicit;
  if (row?.principal || row?.level || row?.cluster !== undefined) return 'school';
  if (row?.rector) return 'seminary';
  if (row?.pastor) return 'parish';

  const name = String(row?.name ?? row?.institution_name ?? row?.entityName ?? '').toLowerCase();
  if (/(^|\s)(parish|quasi-parish|shrine|chaplaincy|manggagawa)(\s|$)/i.test(name)) return 'parish';
  if (/(school|college|academy|institute|liceo|canossa)/i.test(name)) return 'school';
  if (/(seminary|formation center)/i.test(name)) return 'seminary';

  return fallback;
}

function normalizeInstitutionRows(rows: any[], groupType: Exclude<InstitutionTypeFilter, 'all'>): InstitutionOption[] {
  const seen = new Set<string>();
  const options: InstitutionOption[] = [];

  rows.forEach((row) => {
    const type = inferInstitutionType(row, groupType);
    if (type !== groupType) return;

    const name = String(row?.name ?? row?.institution_name ?? row?.entityName ?? '').trim();
    if (!name) return;

    const id = String(row?.id ?? row?.institution_id ?? row?.entityId ?? name).trim();
    const dedupeKey = `${type}:${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    options.push({
      id,
      name,
      type,
      key: `${type}:${id}:${name}`.toLowerCase(),
    });
  });

  return options;
}

function normalizeInstitutions(payload: any): InstitutionOption[] {
  const groups: [Exclude<InstitutionTypeFilter, 'all'>, any[]][] = [
    ['parish', Array.isArray(payload?.parishes) ? payload.parishes : []],
    ['school', Array.isArray(payload?.schools) ? payload.schools : []],
    ['seminary', Array.isArray(payload?.seminaries) ? payload.seminaries : []],
  ];

  const options = groups.flatMap(([groupType, rows]) => normalizeInstitutionRows(rows, groupType));

  return options.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

// ── Details panel helpers ─────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Hidden from the Details panel: bookkeeping + account-identity fields that say
// WHO/WHERE (already shown as User / Role / Entity) rather than WHAT happened.
// Matched after lowercasing and removing underscores (entity_name === entityName).
const HIDDEN_META_KEYS = new Set([
  'changes',
  'id',
  'email',
  'role',
  'roleid',
  'rolelabel',
  'accessrole',
  'displayname',
  'uid',
  'userid',
  'username',
  'userrole',
  'entityid',
  'entityname',
  'entitytype',
]);

function isHiddenMetaKey(key: string): boolean {
  return HIDDEN_META_KEYS.has(key.toLowerCase().replace(/_/g, ''));
}

function prettyKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, 'ID');
}

function formatMetaValue(key: string, value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && /(amount|total|budget|donation|expense)/i.test(key)) {
    return `₱${value.toLocaleString()}`;
  }
  return String(value);
}

// Turn an audit row's metadata into a clean label/value list, hiding internal
// ids, raw UUIDs, redundant actor fields, and the changes array.
function metaEntries(metadata?: Record<string, any>): { label: string; value: string }[] {
  if (!metadata) return [];
  const out: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(metadata)) {
    if (isHiddenMetaKey(key)) continue;
    if (/(_id|Id)$/.test(key)) continue; // hide foreign-key ids
    if (/_by$/.test(key)) continue; // actor already shown in the header
    if (typeof raw === 'string' && UUID_RE.test(raw)) continue;
    const value = formatMetaValue(key, raw);
    if (value === null) continue;
    out.push({ label: prettyKey(key), value });
  }
  return out;
}

// ── Actor avatar (initials now, profile photo later) ──────────
const AVATAR_COLORS = ['#1a472a', '#D4AF37', '#3B82F6', '#7C3AED', '#0EA5E9', '#F43F5E', '#14B8A6', '#FB923C', '#6366F1'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, photoUrl, system }: { name: string; photoUrl?: string; system?: boolean }) {
  if (system) {
    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
        <Cpu className="w-4 h-4 text-gray-500" />
      </div>
    );
  }
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />;
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
      style={{ backgroundColor: colorFor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Friendly, Canva-style action phrasing ─────────────────────
const ACTION_PHRASES: Record<string, string> = {
  'Logged In': 'Logged in',
  'Logged Out': 'Logged out',
  'Login Failed': 'Failed to log in',
  'OTP Sent': 'Requested a verification code',
  'Onboarding Completed': 'Completed onboarding',
  'Password Reset': 'Reset their password',
  'Event Created': 'Created an event',
  'Event Edited': 'Edited an event',
  'Event Archived': 'Archived an event',
  'Event Restored': 'Restored an event',
  'Announcement Published': 'Published an announcement',
  'Announcement Saved as Draft': 'Saved an announcement draft',
  'Draft Published': 'Published a draft',
  'Announcement Edited': 'Edited an announcement',
  'Announcement Archived': 'Archived an announcement',
  'Announcement Restored': 'Restored an announcement',
  'Announcement Pinned': 'Pinned an announcement',
  'Announcement Unpinned': 'Unpinned an announcement',
  'Project Created': 'Created a project',
  'Project Updated': 'Updated a project',
  'Project Deleted': 'Deleted a project',
  'Donation Added': 'Added a donation',
  'Donation Updated': 'Updated a donation',
  'Expense Added': 'Added an expense',
  'Expense Updated': 'Updated an expense',
  'User Created': 'Created a user account',
  'User Updated': 'Updated a user account',
  'User Archived': 'Archived a user account',
  'User Restored': 'Restored a user account',
  'Roles Updated': 'Updated role permissions',
  'Budget Saved': 'Saved a budget',
  'Financial Record Saved': 'Saved a financial record',
  'Financial Record Deleted': 'Deleted a financial record',
  'Institution Created': 'Created an institution',
  'Institution Updated': 'Updated an institution',
  'Institution Archived': 'Archived an institution',
  'Calendar Entry Approved': 'Approved a calendar entry',
  'Calendar Entry Rejected': 'Rejected a calendar entry',
  'Calendar Bulk Approved': 'Bulk-approved calendar entries',
  'Scenario Saved': 'Saved a simulator scenario',
  'Scenario Deleted': 'Deleted a simulator scenario',
};

function friendlyAction(action: string): string {
  return ACTION_PHRASES[action] ?? action;
}

// TooltipBox replaced by ECharts built-in tooltip

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<LogCategory>('all');
  const [institutionType, setInstitutionType] = useState<InstitutionTypeFilter>('all');
  const [institutionId, setInstitutionId] = useState('all');
  const [institutionName, setInstitutionName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [draftInstitutionType, setDraftInstitutionType] = useState<InstitutionTypeFilter>('all');
  const [draftInstitutionId, setDraftInstitutionId] = useState('all');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftTimeFrom, setDraftTimeFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftTimeTo, setDraftTimeTo] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditEntry | null>(null);

  const fetchLogs = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (activeFilter !== 'all') params.set('category', activeFilter);
    if (institutionType !== 'all') params.set('institutionType', institutionType);
    if (institutionId !== 'all') params.set('institutionId', institutionId);
    if (institutionName) params.set('institutionName', institutionName);
    if (dateFrom) params.set('dateFrom', `${dateFrom}T${timeFrom || '00:00'}`);
    if (dateTo) params.set('dateTo', `${dateTo}T${timeTo || '23:59:59'}`);
    params.set('limit', '1000');

    const query = params.toString();
    fetch(`/api/audit-log${query ? `?${query}` : ''}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AuditEntry[]) => {
        setLogs(Array.isArray(data) ? data : []);
      })
      .catch(() => setLogs([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);
  useEffect(() => {
    fetch('/api/entities', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setInstitutions(normalizeInstitutions(data)))
      .catch(() => setInstitutions([]));
  }, []);
  useEffect(() => { fetchLogs(); }, [activeFilter, institutionType, institutionId, institutionName, dateFrom, timeFrom, dateTo, timeTo]);

  const loadInstitutionsForType = (type: Exclude<InstitutionTypeFilter, 'all' | 'diocese'>) => {
    fetch(`/api/entities?type=${type}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const scopedOptions = normalizeInstitutionRows(Array.isArray(data) ? data : [], type);
        setInstitutions((current) =>
          [...current.filter((institution) => institution.type !== type), ...scopedOptions].sort(
            (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
          ),
        );
      })
      .catch(() => undefined);
  };

  const draftInstitutionOptions = useMemo(
    () => institutions.filter((institution) => draftInstitutionType !== 'all' && institution.type === draftInstitutionType),
    [institutions, draftInstitutionType],
  );

  useEffect(() => {
    if (!showFilters || draftInstitutionId === 'all') return;
    if (!draftInstitutionOptions.some((institution) => institution.id === draftInstitutionId)) {
      setDraftInstitutionId('all');
    }
  }, [draftInstitutionId, draftInstitutionOptions, showFilters]);

  const openFilters = () => {
    setDraftInstitutionType(institutionType);
    setDraftInstitutionId(institutionId);
    setDraftDateFrom(dateFrom);
    setDraftTimeFrom(timeFrom);
    setDraftDateTo(dateTo);
    setDraftTimeTo(timeTo);
    setShowFilters(true);
  };

  const handleDraftInstitutionTypeChange = (type: InstitutionTypeFilter) => {
    setDraftInstitutionType(type);
    setDraftInstitutionId('all');
    if (type === 'parish' || type === 'school' || type === 'seminary') {
      loadInstitutionsForType(type);
    }
  };

  const applyAdvancedFilters = () => {
    const selectedInstitution = draftInstitutionOptions.find((institution) => institution.id === draftInstitutionId);
    setInstitutionType(draftInstitutionType);
    setInstitutionId(draftInstitutionType === 'all' || draftInstitutionType === 'diocese' ? 'all' : draftInstitutionId);
    setInstitutionName(draftInstitutionType === 'all' || draftInstitutionType === 'diocese' ? '' : (selectedInstitution?.name ?? ''));
    setDateFrom(draftDateFrom);
    setTimeFrom(draftTimeFrom);
    setDateTo(draftDateTo);
    setTimeTo(draftTimeTo);
    setShowFilters(false);
  };

  const clearAdvancedFilters = () => {
    setDraftInstitutionType('all');
    setDraftInstitutionId('all');
    setDraftDateFrom('');
    setDraftTimeFrom('');
    setDraftDateTo('');
    setDraftTimeTo('');
  };

  const hasAdvancedFilters =
    institutionType !== 'all' || institutionId !== 'all' || !!institutionName || !!dateFrom || !!timeFrom || !!dateTo || !!timeTo;

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchCat = activeFilter === 'all' || log.category === activeFilter;
      const matchInstitution =
        institutionId === 'all' ||
        log.institutionId === institutionId ||
        (!!institutionName && log.entity?.toLowerCase() === institutionName.toLowerCase());
      const matchInstitutionType =
        institutionType === 'all' || log.institutionType === institutionType || (institutionId !== 'all' && matchInstitution);
      const occurredAt = log.occurredAt ? new Date(log.occurredAt).getTime() : null;
      const fromTs = dateFrom ? new Date(`${dateFrom}T${timeFrom || '00:00'}`).getTime() : null;
      const toTs = dateTo ? new Date(`${dateTo}T${timeTo || '23:59:59'}`).getTime() : null;
      const matchDateFrom = fromTs === null || !Number.isFinite(fromTs) || (occurredAt !== null && occurredAt >= fromTs);
      const matchDateTo = toTs === null || !Number.isFinite(toTs) || (occurredAt !== null && occurredAt <= toTs);
      const q = search.toLowerCase();
      const matchText =
        !q || [log.user, log.action, log.detail, log.id, log.entity ?? ''].some((s) => s.toLowerCase().includes(q));
      return matchCat && matchInstitutionType && matchInstitution && matchDateFrom && matchDateTo && matchText;
    });
  }, [logs, search, activeFilter, institutionType, institutionId, institutionName, dateFrom, timeFrom, dateTo, timeTo]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = Object.keys(grouped);

  const stats = useMemo(
    () => ({
      total: logs.length,
      users: logs.filter((l) => !l.isSystem).length,
      system: logs.filter((l) => l.isSystem).length,
      alerts: logs.filter((l) => l.severity === 'warning' || l.severity === 'error').length,
    }),
    [logs],
  );

  // ── Analytics data derived from logs ──────────
  const activityTrendData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      counts[l.date] = (counts[l.date] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, events]) => ({ date: date.replace(', 2026', ''), events }));
  }, [logs]);

  const categoryData = useMemo(() => {
    const counts: Partial<Record<Exclude<LogCategory, 'all'>, number>> = {};
    logs.forEach((l) => {
      counts[l.category] = (counts[l.category] || 0) + 1;
    });
    return Object.entries(counts).map(([cat, count]) => ({
      name: (CATEGORY_CONFIG[cat as Exclude<LogCategory, 'all'>] ?? CATEGORY_CONFIG['system']).label,
      value: count as number,
      color: (CATEGORY_CONFIG[cat as Exclude<LogCategory, 'all'>] ?? CATEGORY_CONFIG['system']).chart,
    }));
  }, [logs]);

  const severityData = useMemo(() => {
    const counts: Partial<Record<LogSeverity, number>> = {};
    logs.forEach((l) => {
      counts[l.severity] = (counts[l.severity] || 0) + 1;
    });
    return (['success', 'info', 'warning', 'error'] as LogSeverity[]).map((sev) => ({
      name: sev.charAt(0).toUpperCase() + sev.slice(1),
      count: counts[sev] || 0,
      color: SEVERITY_CONFIG[sev].chart,
    }));
  }, [logs]);

  const topUsersData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs
      .filter((l) => !l.isSystem)
      .forEach((l) => {
        counts[l.user] = (counts[l.user] || 0) + 1;
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, actions]) => ({ name: name.replace('Admin ', 'Adm. '), actions }));
  }, [logs]);

  const insightText = useMemo(() => {
    if (categoryData.length === 0) return ['No audit events recorded yet. Perform actions to generate insights.'];
    const topCat = categoryData.reduce((a, b) => (a.value > b.value ? a : b));
    const warnings = logs.filter((l) => l.severity === 'warning' || l.severity === 'error').length;
    const topUser = topUsersData[0];
    const systemPct = stats.total > 0 ? Math.round((stats.system / stats.total) * 100) : 0;
    return [
      `Most frequent event category is ${topCat.name} with ${topCat.value} events in the last 30 days.`,
      `${warnings} alert${warnings !== 1 ? 's' : ''} (warnings/errors) detected — review system and access logs for anomalies.`,
      topUser ? `${topUser.name} is the most active user with ${topUser.actions} recorded actions.` : '',
      `System automated events account for ${stats.system} of ${stats.total} total events (${systemPct}%).`,
    ].filter(Boolean);
  }, [categoryData, topUsersData, stats, logs]);

  const handleExport = () => {
    const rows = [
      ['Log ID', 'Date', 'Time', 'User', 'Role', 'Institution Type', 'Institution', 'Category', 'Action', 'Detail'],
      ...filtered.map((l) => [
        l.id,
        l.date,
        l.timestamp,
        l.user,
        l.role,
        l.institutionType ?? '',
        l.entity ?? '',
        CATEGORY_CONFIG[l.category].label,
        l.action,
        l.detail,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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
                A complete record of every user action and automated system event across the diocesan financial
                management platform.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:min-w-[540px]">
              {[
                { label: 'Total Events (30d)', value: stats.total, icon: Database, color: 'text-gold-400' },
                { label: 'User Actions', value: stats.users, icon: Users, color: 'text-emerald-400' },
                { label: 'System Events', value: stats.system, icon: Cpu, color: 'text-blue-400' },
                { label: 'Alerts', value: stats.alerts, icon: AlertTriangle, color: 'text-rose-400' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                    <p className="text-3xl font-black text-white">{s.value}</p>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] leading-tight">
                      {s.label}
                    </p>
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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-church-green/20 transition"
            />
          </div>

          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as LogCategory)}
            aria-label="Audit category"
            className="w-full sm:w-52 h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black uppercase tracking-wider text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
          >
            {FILTER_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>

          <button
            onClick={openFilters}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors border ${
              hasAdvancedFilters
                ? 'bg-gold-500/10 text-church-black border-gold-400'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
          </button>

          <button
            onClick={() => setShowAnalytics((v) => !v)}
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
            onClick={fetchLogs}
            disabled={isLoading}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl border border-gray-200 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 009 9 9.75 9.75 0 006.74-2.74L21 16"/><path d="M21 12a9 9 0 00-9-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M8 8H3V3M16 16h5v5"/></svg>
            Refresh
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
        {showFilters && (
          <motion.div
            key="filters-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowFilters(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-600">Audit Filters</p>
                  <h2 className="mt-1 text-xl font-black text-gray-900">Refine history</h2>
                </div>
                <button
                  onClick={() => setShowFilters(false)}
                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Institution Type</span>
                  <select
                    value={draftInstitutionType}
                    onChange={(e) => handleDraftInstitutionTypeChange(e.target.value as InstitutionTypeFilter)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
                  >
                    <option value="all">All types</option>
                    <option value="diocese">Diocese</option>
                    <option value="parish">Parish</option>
                    <option value="school">School</option>
                    <option value="seminary">Seminary</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Institution</span>
                  <select
                    value={draftInstitutionId}
                    onChange={(e) => setDraftInstitutionId(e.target.value)}
                    disabled={draftInstitutionType === 'all' || draftInstitutionType === 'diocese'}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    <option value="all">
                      {draftInstitutionType === 'all'
                        ? 'Choose a type first'
                        : draftInstitutionType === 'diocese'
                          ? 'All diocesan records'
                          : `All ${draftInstitutionType} records`}
                    </option>
                    {draftInstitutionOptions.map((institution) => (
                      <option key={institution.key} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">From Date</span>
                  <input
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">From Time</span>
                  <input
                    type="time"
                    value={draftTimeFrom}
                    onChange={(e) => setDraftTimeFrom(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">To Date</span>
                  <input
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">To Time</span>
                  <input
                    type="time"
                    value={draftTimeTo}
                    onChange={(e) => setDraftTimeTo(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-church-green/20"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  onClick={clearAdvancedFilters}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:border-gray-400"
                >
                  Clear
                </button>
                <button
                  onClick={applyAdvancedFilters}
                  className="rounded-xl bg-church-black px-5 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:bg-church-green"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAnalytics && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="border-b border-gray-100 bg-gray-50"
          >
            <div className="max-w-[1400px] mx-auto px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <BarChart2 className="w-5 h-5 text-church-green" />
                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Audit Log Analytics</h2>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Last 30 Days
                </span>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                {/* Activity Trend */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">
                    Event Volume by Day
                  </p>
                  <p className="text-xs text-gray-400 mb-4">Total system & user events recorded per day</p>
                  <ReactECharts
                    style={{ height: '180px', width: '100%' }}
                    option={{
                      animation: false,
                      color: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
                      tooltip: { trigger: 'axis' },
                      grid: { top: 5, right: 10, left: 20, bottom: 20 },
                      xAxis: {
                        type: 'category',
                        data: activityTrendData.map((d) => d.date),
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: 'bold' },
                      },
                      yAxis: {
                        type: 'value',
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 9, color: '#9CA3AF' },
                        splitLine: { lineStyle: { color: '#F3F4F6' } },
                        minInterval: 1,
                      },
                      series: [
                        {
                          name: 'Events',
                          type: 'line',
                          data: activityTrendData.map((d) => d.events),
                          smooth: true,
                          symbol: 'circle',
                          symbolSize: 8,
                          lineStyle: { color: '#1a472a', width: 2.5 },
                          itemStyle: { color: '#1a472a' },
                          areaStyle: {
                            color: {
                              type: 'linear',
                              x: 0,
                              y: 0,
                              x2: 0,
                              y2: 1,
                              colorStops: [
                                { offset: 0, color: 'rgba(26,71,42,0.15)' },
                                { offset: 1, color: 'rgba(26,71,42,0)' },
                              ],
                            },
                          },
                        },
                      ],
                    }}
                  />
                </div>

                {/* Category Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">
                    Events by Category
                  </p>
                  <p className="text-xs text-gray-400 mb-2">Distribution across log types</p>
                  <ReactECharts
                    style={{ height: '140px', width: '100%' }}
                    option={{
                      animation: false,
                      color: categoryData.map((c) => c.color),
                      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
                      series: [
                        {
                          type: 'pie',
                          radius: ['40%', '70%'],
                          center: ['50%', '50%'],
                          padAngle: 3,
                          data: categoryData.map((c) => ({ name: c.name, value: c.value })),
                          label: { show: false },
                        },
                      ],
                    }}
                  />
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
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">
                    Severity Distribution
                  </p>
                  <p className="text-xs text-gray-400 mb-4">Count of events by severity level</p>
                  <ReactECharts
                    style={{ height: '160px', width: '100%' }}
                    option={{
                      animation: false,
                      color: severityData.map((d) => d.color),
                      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                      grid: { top: 5, right: 20, left: 60, bottom: 5 },
                      xAxis: {
                        type: 'value',
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 9, color: '#9CA3AF' },
                        minInterval: 1,
                      },
                      yAxis: {
                        type: 'category',
                        data: severityData.map((d) => d.name),
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 10, color: '#6B7280', fontWeight: 'bold' },
                      },
                      series: [
                        {
                          name: 'Events',
                          type: 'bar',
                          data: severityData.map((d, i) => ({
                            value: d.count,
                            itemStyle: { color: d.color, borderRadius: [0, 6, 6, 0] },
                          })),
                          barMaxWidth: 18,
                        },
                      ],
                    }}
                  />
                </div>

                {/* Top Active Users */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">
                    Top Active Users
                  </p>
                  <p className="text-xs text-gray-400 mb-4">Most frequent actors (excluding system)</p>
                  <ReactECharts
                    style={{ height: '160px', width: '100%' }}
                    option={{
                      animation: false,
                      color: ['#D4AF37'],
                      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                      grid: { top: 5, right: 20, left: 80, bottom: 5 },
                      xAxis: {
                        type: 'value',
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 9, color: '#9CA3AF' },
                        minInterval: 1,
                      },
                      yAxis: {
                        type: 'category',
                        data: topUsersData.map((d) => d.name),
                        axisLine: { show: false },
                        axisTick: { show: false },
                        axisLabel: { fontSize: 9, color: '#6B7280', fontWeight: 'bold' },
                      },
                      series: [
                        {
                          name: 'Actions',
                          type: 'bar',
                          data: topUsersData.map((d) => ({
                            value: d.actions,
                            itemStyle: { color: '#D4AF37', borderRadius: [0, 6, 6, 0] },
                          })),
                          barMaxWidth: 18,
                        },
                      ],
                    }}
                  />
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
        {isLoading ? (
          <InlineLoader label="Loading audit logs" className="py-32" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
            <ScrollText className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold">
              {logs.length === 0
                ? 'No audit events recorded yet. Events will appear here after actions are performed.'
                : 'No log entries match your search or filter.'}
            </p>
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
                  <p className="text-[10px] font-bold text-gray-300">
                    {grouped[date].length} event{grouped[date].length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="relative pl-6 border-l-2 border-gray-100 space-y-1">
                  {grouped[date].map((log, li) => {
                    const sev = SEVERITY_CONFIG[log.severity];
                    const cat = CATEGORY_CONFIG[log.category] ?? CATEGORY_CONFIG['system'];
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: di * 0.04 + li * 0.03 }}
                        className="relative group"
                      >
                        <div
                          className={`absolute -left-[1.85rem] top-4 w-3.5 h-3.5 rounded-full ring-2 ring-offset-2 ring-offset-[#FDFCFB] ${sev.ring} flex items-center justify-center`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                        </div>

                        <div
                          className="ml-4 mb-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gold-200/60 transition-all duration-300 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 cursor-pointer"
                          onClick={() => setSelectedLog(log)}
                        >
                          {/* Actor: avatar + name + email */}
                          <div className="flex items-center gap-3 min-w-0 sm:w-72 sm:shrink-0">
                            <Avatar name={log.user} photoUrl={log.avatarUrl} system={log.isSystem} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-sm font-bold truncate ${log.isSystem ? 'text-gray-500 italic' : 'text-church-black'}`}
                                >
                                  {log.user}
                                </span>
                                {!log.isSystem && (
                                  <span className="text-[10px] text-gray-400 font-semibold shrink-0">· {log.role}</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 truncate">{log.email ?? (log.isSystem ? 'Automated' : '—')}</p>
                            </div>
                          </div>

                          {/* Action: category pill + friendly phrase + entity */}
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${cat.pill}`}
                            >
                              {cat.label}
                            </span>
                            <span className="text-sm font-semibold text-gray-700">{friendlyAction(log.action)}</span>
                            {log.entity && (
                              <span className="text-[11px] text-church-green font-bold truncate">· {log.entity}</span>
                            )}
                          </div>

                          {/* Time + chevron */}
                          <div className="shrink-0 flex items-center gap-3 self-end sm:self-center">
                            <div className="text-right">
                              <p className="text-xs font-bold text-gray-500">{log.timestamp}</p>
                              {log.changes && log.changes.length > 0 && (
                                <p className="text-[10px] font-black text-gold-700">
                                  {log.changes.length} change{log.changes.length !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gold-500 transition-colors" />
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
            {filtered.length} of {logs.length} events &nbsp;·&nbsp; 90-day retention
          </p>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      </div>

      {/* ── Detail Modal ──────────────────────────────── */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            key="detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-church-black px-6 py-5 rounded-t-2xl flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="rounded-full border border-[#D4AF37]/70 bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-church-black shadow-sm shadow-[#D4AF37]/20">
                      {(CATEGORY_CONFIG[selectedLog.category] ?? CATEGORY_CONFIG['system']).label}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ring-1 ${SEVERITY_CONFIG[selectedLog.severity].ring}`}
                    >
                      {selectedLog.severity}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white">{selectedLog.action}</h2>
                  <p className="text-sm text-white/50 mt-1 leading-relaxed">{selectedLog.detail}</p>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="shrink-0 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meta grid */}
              <div className="px-6 py-5 border-b border-gray-100 grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  { label: 'User', value: selectedLog.user },
                  { label: 'Role', value: selectedLog.role },
                  { label: 'Date & Time', value: `${selectedLog.date} — ${selectedLog.timestamp}` },
                  ...(selectedLog.entity ? [{ label: 'Entity', value: selectedLog.entity, green: true }] : []),
                  { label: 'Log ID', value: selectedLog.id, mono: true },
                ].map((item, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                    <p
                      className={`text-sm font-semibold ${(item as any).mono ? 'font-mono text-gray-500' : (item as any).green ? 'text-church-green' : 'text-gray-800'}`}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Details */}
              {selectedLog.changes && selectedLog.changes.length > 0 ? (
                <div className="px-6 py-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">
                    Details &nbsp;
                    <span className="text-gold-600 bg-gold-500/10 border border-gold-200 px-2 py-0.5 rounded-full text-[10px]">
                      {selectedLog.changes.length} field{selectedLog.changes.length !== 1 ? 's' : ''} changed
                    </span>
                  </p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-wider w-1/3">
                            Field
                          </th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-black text-rose-400 uppercase tracking-wider w-1/3">
                            Before
                          </th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-black text-emerald-500 uppercase tracking-wider w-1/3">
                            After
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLog.changes.map((change, i) => (
                          <tr
                            key={i}
                            className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                          >
                            <td className="px-4 py-2.5 text-xs font-bold text-gray-600 capitalize">{change.field}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-rose-500 break-all">
                              {change.from !== null ? (
                                change.from
                              ) : (
                                <span className="text-gray-300 italic not-italic font-sans">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono text-emerald-600 break-all">
                              {change.to !== null ? (
                                change.to
                              ) : (
                                <span className="text-gray-300 italic not-italic font-sans">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : metaEntries(selectedLog.metadata).length > 0 ? (
                <div className="px-6 py-5">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Details</p>
                  <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                    {metaEntries(selectedLog.metadata).map((item, i) => (
                      <div key={i} className={`flex items-start gap-4 px-4 py-2.5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider w-40 shrink-0 pt-0.5">
                          {item.label}
                        </span>
                        <span className="text-sm font-semibold text-gray-800 break-all">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-5">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Details</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{selectedLog.detail}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
