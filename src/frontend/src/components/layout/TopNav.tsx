'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  CloudOff,
  Database,
  FileWarning,
  Info,
  KeyRound,
  LogOut,
  Megaphone,
  ShieldAlert,
  User,
} from 'lucide-react';

import { Role, Timeframe } from '../../App';
import { auth } from '../../firebase';
import { ALL_PARISHES } from '../../constants';
import { supabaseBrowser } from '../../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { getAccessRoleLabel, normalizeAccessRole } from '../../lib/access';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '6m': 'Past 6 Months',
  '1y': 'Past 1 Year',
  all: 'All Time',
};

// null = "All Years" — always listed first, and the default selection.
const YEAR_OPTIONS: (number | null)[] = [null, 2026, 2025, 2024, 2023, 2022, 2021];

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  summary?: string;
  time: string;
  type: 'announcement' | 'summary';
  tone: 'gold' | 'blue' | 'rose' | 'orange' | 'amber';
  icon: 'megaphone' | 'info' | 'shield' | 'cloud-off' | 'file-warning';
};

const NOTIFICATION_ICONS = {
  megaphone: Megaphone,
  info: Info,
  shield: ShieldAlert,
  'cloud-off': CloudOff,
  'file-warning': FileWarning,
} as const;

const NOTIFICATION_TONES = {
  gold: 'text-gold-600 bg-gold-50',
  blue: 'text-blue-600 bg-blue-50',
  rose: 'text-rose-600 bg-rose-50',
  orange: 'text-orange-600 bg-orange-50',
  amber: 'text-amber-600 bg-amber-50',
} as const;

const READ_NOTIFICATIONS_STORAGE_KEY = 'paulus.readNotificationIds';

function getReadNotificationIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const ids = JSON.parse(window.localStorage.getItem(READ_NOTIFICATIONS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function markNotificationRead(id: string) {
  const ids = getReadNotificationIds();
  ids.add(id);
  window.localStorage.setItem(READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify([...ids]));
}

interface TopNavProps {
  onNavigate?: (page: string) => void;
  role?: Role;
  currentPage?: string;
  timeframe?: Timeframe;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  year?: number | null;
  onYearChange?: (year: number | null) => void;
  onLogout?: () => void;
}

export function TopNav({
  onNavigate,
  role = 'bishop',
  currentPage = 'home',
  timeframe = '6m',
  onTimeframeChange,
  year = null,
  onYearChange,
  onLogout,
}: TopNavProps) {
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
        setExpandedNotificationId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isNotificationsOpen]);

  const handleTimeframeSelect = (tf: Timeframe) => {
    onTimeframeChange?.(tf);
    setShowTimeframeDropdown(false);
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError('');

    try {
      const user = auth.currentUser as any;
      const headers = new Headers();
      const { data } = await supabaseBrowser.auth.getSession();
      if (data?.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
      if (user?.id || user?.uid) headers.set('x-user-id', String(user.id || user.uid));
      if (user?.email) headers.set('x-user-email', String(user.email));
      if (user?.displayName || user?.name) headers.set('x-user-name', String(user.displayName || user.name));
      if (user?.roleId || user?.accessRole || user?.role) headers.set('x-user-role', String(user.roleId || user.accessRole || user.role));
      if (user?.entityId) headers.set('x-entity-id', String(user.entityId));
      if (user?.entityName) headers.set('x-entity-name', String(user.entityName));
      if (user?.entityType) headers.set('x-entity-type', String(user.entityType));

      const response = await fetch('/api/notifications', { credentials: 'include', headers });
      if (!response.ok) throw new Error(`Notifications failed with ${response.status}`);
      const body = await response.json();
      const readIds = getReadNotificationIds();
      const liveNotifications = Array.isArray(body?.notifications) ? body.notifications : [];
      setNotifications(liveNotifications.filter((notification: NotificationItem) => !readIds.has(notification.id)));
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Could not load notifications.');
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const openNotifications = () => {
    setIsNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) void loadNotifications();
      return nextOpen;
    });
    setShowTimeframeDropdown(false);
    setIsYearOpen(false);
    setIsAccountOpen(false);
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (notification.type === 'announcement') {
      markNotificationRead(notification.id);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      setIsNotificationsOpen(false);
      setExpandedNotificationId(null);
      onNavigate?.('announcements');
      return;
    }

    markNotificationRead(notification.id);
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    setExpandedNotificationId((current) => (current === notification.id ? null : notification.id));
  };

  const NotificationBell = ({ compact = false }: { compact?: boolean }) => (
    <div ref={notificationsRef} className="relative">
      <button
        type="button"
        onClick={openNotifications}
        className={`relative flex items-center justify-center border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors ${
          compact ? 'h-10 w-10 rounded-full' : 'h-10 w-10 rounded-xl'
        }`}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-4 w-4 text-gold-400" />
        {notifications.length > 0 && (
          <>
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-black bg-rose-500" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white">
              {notifications.length}
            </span>
          </>
        )}
      </button>

      {isNotificationsOpen && (
        <div className="absolute right-0 z-[70] mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-100 bg-white text-slate-900 shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-black text-slate-900">Notifications</p>
            <p className="text-[11px] font-semibold text-slate-400">
              {notificationsLoading
                ? 'Checking live updates'
                : notifications.length > 0
                  ? `${notifications.length} live update${notifications.length === 1 ? '' : 's'}`
                  : 'No active alerts'}
            </p>
          </div>

          <div className="max-h-[420px] overflow-y-auto py-1">
            {notificationsLoading && (
              <div className="px-4 py-6 text-center text-xs font-bold text-slate-400">Loading notifications...</div>
            )}

            {!notificationsLoading && notificationsError && (
              <div className="px-4 py-6 text-center text-xs font-bold text-rose-500">{notificationsError}</div>
            )}

            {!notificationsLoading && !notificationsError && notifications.length === 0 && (
              <div className="px-4 py-6 text-center">
                <Check className="mx-auto h-6 w-6 text-emerald-500" />
                <p className="mt-2 text-sm font-black text-slate-700">All clear</p>
                <p className="mt-1 text-xs font-medium text-slate-400">No new announcements or alerts right now.</p>
              </div>
            )}

            {!notificationsLoading && !notificationsError && notifications.map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.icon] ?? Info;
              const isExpanded = expandedNotificationId === notification.id;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full border-b border-gray-50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50"
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${NOTIFICATION_TONES[notification.tone]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="text-sm font-black text-slate-800">{notification.title}</span>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-normal text-slate-400">
                          {notification.time}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">
                        {notification.message}
                      </span>
                      {notification.type === 'announcement' && (
                        <span className="mt-2 block text-[11px] font-black text-gold-600">Open announcement page</span>
                      )}
                      {notification.type === 'summary' && isExpanded && (
                        <span className="mt-2 block rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
                          {notification.summary}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (role === 'priest' || role === 'school' || role === 'seminary') {
    const user = auth.currentUser;
    const entityLabel = role === 'school' ? 'School' : role === 'seminary' ? 'Seminary' : 'Parish';

    // Resolve dynamic entity name
    const entityName =
      user?.entityName?.toUpperCase() ||
      (role === 'school'
        ? 'SAN PABLO DIOCESAN CATHOLIC SCHOOL'
        : role === 'seminary'
          ? "ST. PETER'S COLLEGE SEMINARY"
          : 'SAN ISIDRO LABRADOR PARISH');

    // Resolve pastor/principal display name
    const pastorName =
      user?.displayName ||
      (role === 'school' ? 'Rev. Fr. John Doe' : role === 'seminary' ? 'Rev. Fr. James Smith' : 'Not assigned');

    // Resolve canonical role label — always use the fine-grained accessRole on
    // the auth user object so Seminary Oeconomus, Parish Secretary, etc. are
    // never conflated with the coarse AppRole string (Bug 1.1, 1.2, 1.3).
    const rawRole = (user as any)?.roleId || (user as any)?.accessRole || (user as any)?.role || '';
    const canonicalRoleLabel = rawRole ? getAccessRoleLabel(normalizeAccessRole(rawRole)) : '';

    // Build the district/vicariate label (only for parish roles).
    const matchedParish = ALL_PARISHES.find((p) => p.name.toLowerCase() === (user?.entityName || '').toLowerCase());
    const vicariateLabel = matchedParish ? `${matchedParish.vicariate} Vicariate` : 'St. John the Baptist Vicariate';

    // District label — only shown for parish roles; parish_secretary also shows
    // their assigned district number (Bug 1.3 acceptance criteria).
    const isPriestOrSecretary =
      normalizeAccessRole(rawRole) === 'parish_priest' ||
      normalizeAccessRole(rawRole) === 'parish_secretary';
    const districtLabel = (user as any)?.district
      ? `District ${(user as any).district}`
      : isPriestOrSecretary
        ? 'District not assigned'
        : null;

    const metadata: string[] =
      role === 'school'
        ? [
            ...(canonicalRoleLabel ? [`Role: ${canonicalRoleLabel}`] : []),
            'Access: School',
          ]
        : role === 'seminary'
          ? [
              ...(canonicalRoleLabel ? [`Role: ${canonicalRoleLabel}`] : []),
              'Access: Seminary',
            ]
          : [
              ...(districtLabel ? [districtLabel] : []),
              vicariateLabel,
              ...(canonicalRoleLabel ? [`${canonicalRoleLabel}`] : [`Parish Priest: ${pastorName}`]),
              'Access: Parish',
            ];

    const avatarPhoto = (user as any)?.avatarUrl || (user as any)?.photoURL || '';

    return (
      <header className="bg-black text-white border-b border-white/5 sticky top-0 z-50 min-h-[78px] flex items-center w-full">
        <div className="flex items-center justify-between w-full gap-5 px-4 sm:px-6 lg:px-7 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-serif text-xl lg:text-2xl font-black leading-tight tracking-normal text-gold-400 truncate">
              {entityLabel} Financial Dashboard
            </h1>
            <p className="text-xs lg:text-sm font-black uppercase tracking-[0.22em] text-white truncate">
              {entityName}
            </p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-bold text-white/35">
              {metadata.map((item, index) => (
                <React.Fragment key={item}>
                  {index > 0 && <span className="hidden sm:inline text-gold-500/60">•</span>}
                  <span className="truncate">{item}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 lg:gap-3 shrink-0">
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                className="flex h-10 min-w-[176px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-black text-white hover:bg-white/10 transition-colors"
              >
                <Calendar className="w-4 h-4 text-gold-400" />
                <span className="hidden md:inline">{TIMEFRAME_LABELS[timeframe]}</span>
                <span className="md:hidden">{timeframe}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/35 transition-transform ${showTimeframeDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showTimeframeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {(Object.keys(TIMEFRAME_LABELS) as Timeframe[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeSelect(tf)}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={timeframe === tf ? 'text-gold-600 font-bold' : 'text-gray-600'}>
                        {TIMEFRAME_LABELS[tf]}
                      </span>
                      {timeframe === tf && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative hidden sm:block">
              <button
                onClick={() => setIsYearOpen(!isYearOpen)}
                className="flex h-10 min-w-[100px] items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-black text-white hover:bg-white/10 transition-colors"
              >
                <span>{year === null ? 'All Years' : year}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/35 transition-transform ${isYearOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isYearOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {YEAR_OPTIONS.map((y) => (
                    <button
                      key={y ?? 'all'}
                      onClick={() => {
                        onYearChange?.(y);
                        setIsYearOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={year === y ? 'text-gold-600 font-bold' : 'text-gray-600'}>
                        {y === null ? 'All Years' : y}
                      </span>
                      {year === y && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationBell compact />

            <div className="relative">
              <button
                onClick={() => {
                  setIsAccountOpen(!isAccountOpen);
                  setIsNotificationsOpen(false);
                }}
                className="rounded-full shrink-0 cursor-pointer shadow-[0_0_24px_rgba(212,175,55,0.3)] hover:scale-105 transition-transform"
                aria-label="Account menu"
              >
                <Avatar name={pastorName} photoUrl={avatarPhoto} size={48} />
              </button>

              {isAccountOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onNavigate?.('profile');
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <User className="w-4 h-4 text-gold-600" />
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onNavigate?.('change-password');
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-gold-600" />
                    Change Password
                  </button>
                  {(role === 'priest' || role === 'school' || role === 'seminary') && (
                    <button
                      onClick={() => {
                        setIsAccountOpen(false);
                        const route =
                          role === 'school'
                            ? 'school-data-submission'
                            : role === 'seminary'
                              ? 'seminary-data-submission'
                              : 'parish-data-submission';
                        onNavigate?.(route);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <Database className="w-4 h-4 text-church-green" />
                      Data Management
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onLogout?.();
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    );
  }

  const isDioceseHeader = ['bishop', 'admin', 'chancellor', 'diocesan_oeconomus', 'finance_staff'].includes(role);
  if (isDioceseHeader) {
    const user = auth.currentUser;
    const pastorName = user?.displayName || user?.email || 'Account';
    const avatarPhoto = (user as any)?.avatarUrl || (user as any)?.photoURL || '';
    return (
      <header className="bg-black text-white border-b border-white/5 sticky top-0 z-30 h-16 flex items-center w-full">
        <div className="flex items-center justify-between w-full px-8">
          {/* Left Side: Empty (Logo moved to sidebar) */}
          <div></div>

          {/* Right Side: Actions */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                className="flex items-center gap-2 bg-white/5 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 transition-colors border border-white/10"
              >
                <Calendar className="w-4 h-4 text-white/40" />
                <span className="hidden sm:inline">{TIMEFRAME_LABELS[timeframe]}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/40 transition-transform ${showTimeframeDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showTimeframeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {(Object.keys(TIMEFRAME_LABELS) as Timeframe[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeSelect(tf)}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={timeframe === tf ? 'text-gold-600 font-bold' : 'text-gray-700'}>
                        {TIMEFRAME_LABELS[tf]}
                      </span>
                      {timeframe === tf && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsYearOpen(!isYearOpen)}
                className="flex items-center gap-2 bg-white/5 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 transition-colors border border-white/10"
              >
                <span>{year === null ? 'All Years' : year}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/40 transition-transform ${isYearOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isYearOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {YEAR_OPTIONS.map((y) => (
                    <button
                      key={y ?? 'all'}
                      onClick={() => {
                        onYearChange?.(y);
                        setIsYearOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={year === y ? 'text-gold-600 font-bold' : 'text-gray-700'}>
                        {y === null ? 'All Years' : y}
                      </span>
                      {year === y && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationBell />

            <div className="relative">
              <button
                onClick={() => {
                  setIsAccountOpen(!isAccountOpen);
                  setIsNotificationsOpen(false);
                }}
                className="rounded-full flex items-center justify-center cursor-pointer shadow-lg shadow-gold-500/20 shrink-0 hover:scale-105 transition-transform"
                aria-label="Account menu"
              >
                <Avatar name={pastorName} photoUrl={avatarPhoto} size={40} />
              </button>

              {isAccountOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-black/95 rounded-2xl shadow-xl border border-gold-500/30 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onNavigate?.('profile');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <User className="w-4 h-4 text-gold-500" />
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onNavigate?.('change-password');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-gold-500" />
                    Change Password
                  </button>
                  <button
                    onClick={() => {
                      setIsAccountOpen(false);
                      onLogout?.();
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 flex items-center gap-3 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    );
  }
}
