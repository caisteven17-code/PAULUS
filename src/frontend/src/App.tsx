'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CalendarClock, ChevronDown, LogOut, ShieldAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TopNav } from './components/layout/TopNav';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { BishopDashboard } from './views/BishopDashboard';
import { PriestDashboard } from './views/PriestDashboard';
import { Settings } from './views/Settings';
import { ChangePassword } from './views/ChangePassword';
import { Login } from './views/Login';
import { Home } from './views/Home';
import { Projects } from './views/Projects';
import { WhatIfSimulator } from './views/WhatIfSimulator';
import { DigitalTwin } from './views/DigitalTwin';
import { DigitalTwinControlsPanel, SandboxState } from './components/layout/DigitalTwinControlsPanel';
import { Announcements } from './views/Announcements';
import { Events } from './views/Events';
import { ArchivesPage } from './views/ArchivesPage';
import { Budget } from './views/Budget';
import { HealthTracker } from './views/HealthTracker';
import { ConsolidatedFinancial } from './views/ConsolidatedFinancial';
import { AuditLog } from './views/AuditLog';
import { ParishDataSubmission } from './views/ParishDataSubmission';
import { Pusher } from './views/Pusher';
import { BottomNav } from './components/ui/BottomNav';
import { StewardChatbot } from './components/ui/StewardChatbot';
import { OnboardingModal } from './components/auth/OnboardingModal';
import { APP_CONFIG } from './constants';
import { auth, AuthUser } from './firebase';
import { supabaseBrowser } from './lib/supabase';
import { AppRole, getAppRole } from './lib/access';
import { hasAnyArchiveAccess } from './lib/archiveAccess';
import { clearLoginTransitionPending, isLoginTransitionPending } from './lib/loginTransition';
import { LoadingScreen, BlackReveal } from './components/ui/LoadingScreen';
import { usePermissions } from './hooks/usePermissions';
import { auditIdentity, logAuditEvent } from './lib/audit';

export type Role = 'bishop' | 'admin' | 'priest' | 'school' | 'seminary';
export type Timeframe = '6m' | '1y' | 'all';
type DigitalTwinSession = {
  entityClass: string;
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  viewRole: 'priest' | 'school' | 'seminary';
  entityId?: string;
  baselineHealthScore?: number;
  monthlyCollections?: number;
  monthlyExpenses?: number;
};

// Seed the sandbox from the institution's real monthly figures so the panel
// opens on the actual baseline instead of zeros. These are heuristic estimates
// only — "Load from Period" overwrites them with the real per-category figures.
// Splits mirror the heuristics used by the panel's period loader.
const buildInitialSandboxState = (session: DigitalTwinSession): SandboxState => {
  const collections = session.monthlyCollections ?? 0;
  const expenses = session.monthlyExpenses ?? 0;
  if (session.entityType === 'parish') {
    return {
      totalSacraments: Math.round(collections * 0.08),
      totalCollections: Math.round(collections * 0.7),
      totalSpecialCollections: Math.round(collections * 0.1),
      totalMassIntentionsClaimed: Math.round(collections * 0.07),
      totalMassIntentionsUnclaimed: Math.round(collections * 0.05),
      totalPastoralExpenses: Math.round(expenses * 0.35),
      totalParishExpenses: Math.round(expenses * 0.65),
    };
  }
  return {
    totalCollections: collections,
    totalPayroll: Math.round(expenses * 0.35),
    totalOperatingExpenses: Math.round(expenses * 0.65),
  };
};

const getDigitalTwinDefaultTab = (role: DigitalTwinSession['viewRole']) => {
  if (role === 'school') return 'school';
  if (role === 'seminary') return 'seminaries';
  return 'parish-dashboard';
};

const toPriestTimeframe = (tf: Timeframe): '3m' | '6m' | '12m' | undefined => {
  if (tf === '6m') return '6m';
  if (tf === '1y') return '12m';
  return undefined;
};

const hasAdminPermissions = (permissions: Record<string, boolean>) =>
  permissions.create_users === true ||
  permissions.manage_roles === true ||
  permissions.manage_entities === true ||
  permissions.upload_csv_admin === true ||
  permissions.view_audit_logs === true ||
  permissions.validate_liturgical_calendar === true;

const hasProjectAccess = (permissions: Record<string, boolean>) =>
  permissions.view_projects === true || permissions.manage_projects === true;

const hasAnnouncementAccess = (permissions: Record<string, boolean>) =>
  permissions.view_announcements === true || permissions.manage_announcements === true;

const hasEventsAccess = (permissions: Record<string, boolean>) =>
  permissions.view_events === true || permissions.manage_events === true;

const hasBudgetAccess = (permissions: Record<string, boolean>) =>
  permissions.view_budget === true || permissions.manage_budget === true;

const getFirstAllowedTab = (role: Role, permissions: Record<string, boolean>) => {
  if (permissions.view_diocese === true) return 'home';
  if (role === 'priest' && permissions.view_parish_dashboard === true) return 'parish-dashboard';
  if (role === 'school' && permissions.view_school_dashboard === true) return 'school';
  if (role === 'seminary' && permissions.view_seminary_dashboard === true) return 'seminaries';
  if (hasAnnouncementAccess(permissions)) return 'announcements';
  if (hasProjectAccess(permissions)) return 'projects';
  if (permissions.view_priests === true) return 'priest-dashboard';
  if (permissions.view_parish_dashboard === true) return 'parish-dashboard';
  if (permissions.view_seminary_dashboard === true) return 'seminaries';
  if (permissions.view_school_dashboard === true) return 'school';
  if (permissions.digital_twin === true) return 'digital-twin';
  if (hasAdminPermissions(permissions)) {
    if (permissions.create_users === true) return 'admin-user-management';
    if (permissions.manage_roles === true) return 'admin-user-role';
    if (permissions.manage_entities === true) return 'admin-entity';
    if (permissions.upload_csv_admin === true) return 'admin-data';
    if (permissions.validate_liturgical_calendar === true) return 'admin-liturgical';
    if (permissions.view_audit_logs === true) return 'audit-log';
  }
  return 'profile';
};

const canAccessTab = (tab: string, role: Role, permissions: Record<string, boolean>) => {
  if (tab === 'profile' || tab === 'change-password') return true;
  // Archives is a standalone top-level page gated by archive permissions.
  if (tab === 'archives' || tab === 'admin-archives') return hasAnyArchiveAccess(permissions);
  if (tab.startsWith('admin-') || tab === 'settings' || tab === 'audit-log') {
    return tab === 'audit-log' ? permissions.view_audit_logs === true : hasAdminPermissions(permissions);
  }
  if (tab === 'home') return permissions.view_diocese === true;
  if (tab === 'dashboard' || tab === 'parish-dashboard' || tab === 'parish-health') {
    return role === 'priest' ? permissions.view_parish_dashboard === true : permissions.view_parish_dashboard === true;
  }
  if (tab === 'parish-data-submission' || tab === 'seminary-data-submission' || tab === 'school-data-submission') {
    return permissions.download_csv === true || permissions.upload_csv_entity === true;
  }
  if (tab === 'parish-aitwin') {
    return permissions.view_parish_dashboard === true || permissions.digital_twin === true;
  }
  if (tab === 'priest-aitwin') {
    return permissions.manage_assignments === true;
  }
  if (tab === 'priest-dashboard' || tab === 'priest-health') return permissions.view_priests === true;
  if (tab === 'seminaries') return permissions.view_seminary_dashboard === true;
  if (tab === 'seminary-aitwin')
    return permissions.view_seminary_dashboard === true || permissions.digital_twin === true;
  if (tab === 'school') return permissions.view_school_dashboard === true;
  if (tab === 'school-aitwin') return permissions.view_school_dashboard === true || permissions.digital_twin === true;
  if (tab === 'projects') return hasProjectAccess(permissions);
  if (tab === 'digital-twin') return permissions.digital_twin === true;
  if (tab === 'announcements') return hasAnnouncementAccess(permissions);
  if (tab === 'events') return hasEventsAccess(permissions);
  if (tab === 'budget') return hasBudgetAccess(permissions);
  if (tab === 'consolidated') return permissions.view_diocese === true;
  return false;
};

const appRoleToRole = (appRole: string): Role => {
  const mapped = getAppRole(appRole);
  if (mapped === 'parish_priest' || mapped === 'parish_secretary') return 'priest';
  return mapped as Role;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const LOGOUT_TRANSITION_DURATION = 3;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

const TAB_TO_PATH: Record<string, string> = {
  home: '/',
  announcements: '/announcements',
  events: '/events',
  budget: '/budget',
  projects: '/projects',
  'digital-twin': '/digital-twin',
  archives: '/archives',
  'admin-archives': '/admin/archives',
  consolidated: '/consolidated-financial',
  profile: '/profile',
  'change-password': '/change-password',
  'audit-log': '/admin/audit-log',
  settings: '/admin/settings',
  'admin-user-management': '/admin/user-management',
  'admin-user-role': '/admin/user-role-control',
  'admin-entity': '/admin/entity-management',
  'admin-data': '/admin/data-management',
  'admin-liturgical': '/admin/liturgical-validator',
  'parish-dashboard': '/parish/dashboard',
  'parish-health': '/parish/health',
  'parish-aitwin': '/parish/simulator',
  'parish-data-submission': '/parish/data-submission',
  'priest-dashboard': '/priests',
  'priest-health': '/priests/health',
  'priest-aitwin': '/priests/simulator',
  seminaries: '/seminaries',
  'seminary-aitwin': '/seminaries/simulator',
  'seminary-data-submission': '/seminaries/data-submission',
  school: '/schools',
  'school-aitwin': '/schools/simulator',
  'school-data-submission': '/schools/data-submission',
};

const PATH_TO_TAB = Object.entries(TAB_TO_PATH).reduce<Record<string, string>>((acc, [tab, path]) => {
  acc[path] = tab;
  return acc;
}, {});

const normalizePath = (path: string) => {
  const cleaned = path.replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
};

const tabFromPath = (path: string) => PATH_TO_TAB[normalizePath(path)] ?? 'home';

export default function App() {
  const [showPusher, setShowPusher] = useState(() =>
    typeof window === 'undefined' ? false : normalizePath(window.location.pathname) === '/pusher',
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  // After a successful login, a black overlay (with the crest) fades out to
  // reveal the dashboard — continuing the fade-in the Login screen started.
  const [loginReveal, setLoginReveal] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutTransition, setLogoutTransition] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [inactivityNoticeOpen, setInactivityNoticeOpen] = useState(false);
  const logoutInProgressRef = React.useRef(false);
  const inactivityTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [roleChangedModal, setRoleChangedModal] = useState(false);
  const trackedRoleRef = React.useRef<string>('');

  const [role, setRole] = useState<Role>('bishop');
  const [activeTab, setActiveTab] = useState(() =>
    typeof window === 'undefined' ? 'home' : tabFromPath(window.location.pathname),
  );
  const mainScrollRef = useRef<HTMLElement>(null);
  const { permissions, user, loading: permissionsLoading } = usePermissions();
  const [timeframe, setTimeframe] = useState<Timeframe>('6m');
  const [year, setYear] = useState<number>(2026);
  const [digitalTwinSession, setDigitalTwinSession] = useState<DigitalTwinSession | null>(null);
  const [digitalTwinActiveTab, setDigitalTwinActiveTab] = useState('parish-dashboard');
  const [dtSandboxState, setDtSandboxState] = useState<SandboxState | null>(null);
  // First-login onboarding gate (real Supabase accounts that haven't completed it).
  // Until the check finishes the app shows a spinner so the dashboard never flashes.
  const [onboardingUser, setOnboardingUser] = useState<AuthUser | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  // Pending = what the user has picked in the dropdowns; applied = what is actually shown
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
  const currentMonthName = MONTHS[new Date().getMonth()];
  const [dtMonth, setDtMonth] = useState<string>(currentMonthName);
  const [dtPendingMonth, setDtPendingMonth] = useState<string>(currentMonthName);
  const [dtPendingYear, setDtPendingYear] = useState<number>(year);

  useEffect(() => {
    const roleDefaultTab: Record<Role, string> = {
      bishop: 'home',
      admin: 'home',
      priest: 'parish-dashboard',
      school: 'school',
      seminary: 'seminaries',
    };

    const unsubscribe = auth.onAuthStateChanged((user: AuthUser | null) => {
      if (user?.role) {
        if (isLoginTransitionPending()) {
          setIsAuthReady(true);
          return;
        }

        const internalRole = appRoleToRole(user.role);
        setRole(internalRole);
        setIsAuthenticated(true);
        // Use functional update so the effect doesn't need activeTab in its deps
        setActiveTab((prev) => (prev === 'home' ? roleDefaultTab[internalRole] : prev));
      } else {
        if (logoutInProgressRef.current) {
          setIsAuthReady(true);
          return;
        }

        setIsAuthenticated(false);
        setRole('bishop');
        setActiveTab('home');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = (loggedInRole: AppRole) => {
    clearLoginTransitionPending();
    const internalRole = appRoleToRole(loggedInRole);
    setRole(internalRole);
    setIsAuthenticated(true);
    // Login screen already faded to black — now fade it back out over the app.
    setLoginReveal(true);

    // Set default tab based on role
    if (internalRole === 'priest') {
      setActiveTab('parish-dashboard');
    } else if (internalRole === 'school') {
      setActiveTab('school');
    } else if (internalRole === 'seminary') {
      setActiveTab('seminaries');
    } else {
      setActiveTab('home');
    }
  };

  const openPusher = () => {
    setShowPusher(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ pusher: true }, '', '/pusher');
    }
  };

  const closePusher = () => {
    setShowPusher(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({ tab: 'home' }, '', '/');
    }
  };

  useEffect(() => {
    if (!isAuthReady || !isAuthenticated || permissionsLoading) return;
    if (!canAccessTab(activeTab, role, permissions)) {
      setActiveTab(getFirstAllowedTab(role, permissions));
    }
  }, [activeTab, isAuthReady, isAuthenticated, permissions, permissionsLoading, role]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined' || digitalTwinSession || showPusher) return;
    const nextPath = TAB_TO_PATH[activeTab] ?? '/';
    if (normalizePath(window.location.pathname) !== normalizePath(nextPath)) {
      window.history.pushState({ tab: activeTab }, '', nextPath);
    }
  }, [activeTab, digitalTwinSession, showPusher]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = normalizePath(window.location.pathname);
      setShowPusher(path === '/pusher');
      if (path !== '/pusher') {
        setActiveTab(tabFromPath(path));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Gate the whole system behind the onboarding form for real Supabase users.
  // Demo / localStorage sessions have no Supabase session and are skipped.
  useEffect(() => {
    if (!isAuthReady || !isAuthenticated) {
      setOnboardingUser(null);
      setOnboardingChecked(false);
      return;
    }
    // Completed earlier in this browser session — the Supabase token may still
    // carry stale metadata until it refreshes, so trust the local flag.
    if (typeof window !== 'undefined' && sessionStorage.getItem('onboarding_completed') === 'true') {
      setOnboardingChecked(true);
      return;
    }

    supabaseBrowser.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user;
        if (sessionUser && sessionUser.user_metadata?.onboardingCompleted !== true) {
          setOnboardingUser({
            id: sessionUser.id,
            uid: sessionUser.id,
            email: sessionUser.email ?? '',
            contactNumber: sessionUser.user_metadata?.contactNumber ?? '',
          });
        }
      })
      .catch(() => {
        // Supabase unreachable — demo mode, no onboarding
      })
      .finally(() => {
        setOnboardingChecked(true);
      });
  }, [isAuthReady, isAuthenticated]);

  // Record the role when the user first logs in, then poll for changes.
  useEffect(() => {
    if (isAuthenticated && user?.role) {
      trackedRoleRef.current = user.role;
    } else {
      trackedRoleRef.current = '';
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;
    const check = async () => {
      if (logoutInProgressRef.current) return;
      try {
        const res = await fetch('/api/admin/users');
        if (!res.ok) return;
        const users: any[] = await res.json();
        const found = users.find((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase());
        if (found && trackedRoleRef.current && found.role !== trackedRoleRef.current) {
          setRoleChangedModal(true);
        }
      } catch {
        // Backend unavailable — skip silently
      }
    };
    // Check immediately (so a role change is caught the moment the app loads or
    // regains focus) and then poll, instead of waiting a full minute first.
    check();
    const interval = setInterval(check, 20000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, user?.email]);

  const requestLogout = () => {
    if (logoutInProgress) return;
    setLogoutConfirmOpen(true);
  };

  /**
   * Handles confirmed user logout and state reset.
   */
  const handleLogout = async () => {
    if (logoutInProgress) return;
    setLogoutConfirmOpen(false);
    setLogoutInProgress(true);
    logoutInProgressRef.current = true;
    setLogoutTransition(true);

    await wait(1350);

    try {
      await auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }

    setIsAuthenticated(false);
    setRole('bishop');
    setActiveTab('home');
    setOnboardingUser(null);
    setOnboardingChecked(false);
    setDigitalTwinSession(null);
    setDigitalTwinActiveTab('parish-dashboard');
    setDtSandboxState(null);

    await wait(1650);
    setLogoutTransition(false);
    setLogoutInProgress(false);
    logoutInProgressRef.current = false;
  };

  const resetSessionStateAfterLogout = () => {
    setIsAuthenticated(false);
    setRole('bishop');
    setActiveTab('home');
    setOnboardingUser(null);
    setOnboardingChecked(false);
    setDigitalTwinSession(null);
    setDigitalTwinActiveTab('parish-dashboard');
    setDtSandboxState(null);
    setLoginReveal(false);
    setLogoutConfirmOpen(false);
    setLogoutTransition(false);
  };

  const handleInactivityLogout = async () => {
    if (logoutInProgressRef.current) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    logoutInProgressRef.current = true;
    setLogoutInProgress(true);

    await logAuditEvent({
      ...auditIdentity(currentUser),
      category: 'auth',
      severity: 'info',
      action: 'Logout due to inactivity',
      detail: `${currentUser.displayName || currentUser.email || 'User'} was signed out after 5 minutes of inactivity`,
      entity: currentUser.entityName,
      metadata: {
        reason: 'inactivity_timeout',
        timeoutMinutes: 5,
      },
    });

    await auth.signOut({ skipAudit: true });
    resetSessionStateAfterLogout();
    setInactivityNoticeOpen(true);
    setLogoutInProgress(false);
    logoutInProgressRef.current = false;
  };

  useEffect(() => {
    if (!isAuthenticated || !isAuthReady || showPusher) {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
      return;
    }

    const resetTimer = () => {
      if (logoutInProgressRef.current) return;
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = setTimeout(() => {
        void handleInactivityLogout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [isAuthenticated, isAuthReady, showPusher, user?.email]);

  if (!isAuthReady) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  // Black-with-crest reveal shown right after a successful login.
  const loginRevealOverlay = loginReveal ? <BlackReveal onDone={() => setLoginReveal(false)} /> : null;
  const logoutTransitionOverlay = logoutTransition ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: LOGOUT_TRANSITION_DURATION, times: [0, 0.42, 0.72, 1], ease: 'easeInOut' }}
      className="pointer-events-none fixed inset-0 z-[320] flex flex-col items-center justify-center bg-black px-6 text-center"
    >
      <motion.img
        src={APP_CONFIG.logoPath}
        alt=""
        className="h-24 w-24 object-contain drop-shadow-[0_10px_30px_rgba(212,175,55,0.3)]"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.94, 1, 1.06] }}
        transition={{ duration: LOGOUT_TRANSITION_DURATION, times: [0, 0.42, 0.72, 1], ease: 'easeInOut' }}
      />
      <motion.p
        className="mt-6 max-w-md border-t border-[#D4AF37]/25 pt-5 font-serif text-lg font-semibold leading-relaxed text-[#F8E7B0] drop-shadow-[0_8px_24px_rgba(212,175,55,0.18)] sm:text-xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -4] }}
        transition={{ duration: LOGOUT_TRANSITION_DURATION, times: [0, 0.42, 0.72, 1], ease: 'easeInOut' }}
      >
        Until next time, may the Lord bless and keep you.
      </motion.p>
    </motion.div>
  ) : null;
  const logoutConfirmModal = (
    <AnimatePresence>
      {logoutConfirmOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[310] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Sign out?</h2>
                  <p className="text-xs font-semibold text-slate-400">Your current session will close.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm font-medium leading-relaxed text-slate-500">
                Are you sure you want to sign out of the Diocese Financial Analytics System?
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutInProgress}
                  className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-rose-600/20 transition-colors hover:bg-rose-700 disabled:opacity-60"
                >
                  Yes, sign out
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const roleChangedModalEl = (
    <AnimatePresence>
      {roleChangedModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Role Updated</h2>
                <p className="text-xs font-semibold text-slate-400">Your account permissions have changed.</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-relaxed text-slate-600">
                An administrator has updated your role. You need to sign in again for the changes to take effect.
              </p>
            </div>
            <div className="border-t border-slate-100 px-6 pb-6 pt-4">
              <button
                type="button"
                onClick={() => {
                  setRoleChangedModal(false);
                  void handleLogout();
                }}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white transition-colors hover:bg-slate-800"
              >
                Sign Out Now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const inactivityNoticeModal = (
    <AnimatePresence>
      {inactivityNoticeOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[330] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Session Expired</h2>
                <p className="text-xs font-semibold text-slate-400">You were signed out for security.</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-relaxed text-slate-600">
                You were automatically logged out after 5 minutes without activity. Please sign in again to continue.
              </p>
            </div>
            <div className="border-t border-slate-100 px-6 pb-6 pt-4">
              <button
                type="button"
                onClick={() => setInactivityNoticeOpen(false)}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white transition-colors hover:bg-slate-800"
              >
                Back to Login
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderDigitalTwinSessionContent = () => {
    if (!digitalTwinSession) return null;

    const commonPriestProps = {
      timeframe: toPriestTimeframe(timeframe),
      year,
      onYearChange: setYear,
      onNavigate: setDigitalTwinActiveTab,
      onLogout: requestLogout,
    } as const;

    if (digitalTwinSession.viewRole === 'priest') {
      switch (digitalTwinActiveTab) {
        case 'dashboard':
        case 'parish-dashboard':
        case 'parish-health':
          return (
            <BishopDashboard
              initialEntityType="Parishes"
              initialEntityFilter={digitalTwinSession.entityName}
              lockEntityFilter
              timeframe={timeframe}
              year={year}
              onYearChange={setYear}
              onNavigate={setDigitalTwinActiveTab}
            />
          );
        case 'parish-data-submission':
          return (
            <ParishDataSubmission
              parishName={digitalTwinSession.entityName}
              vicariate="Digital Twin Session"
              parishClass={digitalTwinSession.entityClass}
              year={year}
              onBack={() => setDigitalTwinActiveTab('parish-dashboard')}
            />
          );
        case 'priest-dashboard':
          return (
            <PriestDashboard
              role="priest"
              dashboardContext="priest"
              entityName={digitalTwinSession.entityName}
              entityType="parish"
              entityClass={digitalTwinSession.entityClass}
              isEmbedded
              {...commonPriestProps}
            />
          );
        case 'priest-health':
          return <HealthTracker />;
        case 'parish-aitwin':
          return <WhatIfSimulator mode="parish" />;
        case 'priest-aitwin':
          return <WhatIfSimulator mode="priest" />;
        case 'announcements':
          return <Announcements />;
        case 'events':
          return <Events />;
        case 'budget':
          return <Budget />;
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">
                This institution view is not available in the current Digital Twin session.
              </p>
            </div>
          );
      }
    }

    if (digitalTwinSession.viewRole === 'seminary') {
      switch (digitalTwinActiveTab) {
        case 'dashboard':
        case 'seminaries':
          return (
            <PriestDashboard
              role="seminary"
              entityName={digitalTwinSession.entityName}
              entityType="seminary"
              entityClass={digitalTwinSession.entityClass}
              isEmbedded
              {...commonPriestProps}
            />
          );
        case 'seminary-data-submission':
          return (
            <ParishDataSubmission
              parishName={digitalTwinSession.entityName}
              vicariate="Digital Twin Session"
              parishClass="Seminary"
              year={year}
              onBack={() => setDigitalTwinActiveTab('seminaries')}
            />
          );
        case 'seminary-aitwin':
          return <WhatIfSimulator mode="seminary" />;
        case 'announcements':
          return <Announcements />;
        case 'events':
          return <Events />;
        case 'budget':
          return <Budget />;
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">
                This seminary view is not available in the current Digital Twin session.
              </p>
            </div>
          );
      }
    }

    switch (digitalTwinActiveTab) {
      case 'dashboard':
      case 'school':
        return (
          <PriestDashboard
            role="school"
            entityName={digitalTwinSession.entityName}
            entityType="school"
            entityClass={digitalTwinSession.entityClass}
            isEmbedded
            {...commonPriestProps}
          />
        );
      case 'school-data-submission':
        return (
          <ParishDataSubmission
            parishName={digitalTwinSession.entityName}
            vicariate="Digital Twin Session"
            parishClass="School"
            year={year}
            onBack={() => setDigitalTwinActiveTab('school')}
          />
        );
      case 'school-aitwin':
        return <WhatIfSimulator mode="school" />;
      case 'announcements':
        return <Announcements />;
      case 'events':
        return <Events />;
      case 'budget':
        return <Budget />;
      default:
        return (
          <div className="flex items-center justify-center h-[calc(100vh-80px)]">
            <p className="text-church-grey">This school view is not available in the current Digital Twin session.</p>
          </div>
        );
    }
  };

  if (digitalTwinSession) {
    return (
      <ErrorBoundary>
        <div className="flex flex-row min-h-screen bg-church-light font-sans">
          <Sidebar
            activeTab={digitalTwinActiveTab}
            onNavigate={setDigitalTwinActiveTab}
            onLogout={requestLogout}
            role={digitalTwinSession.viewRole}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />

          <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
            <TopNav
              onNavigate={setDigitalTwinActiveTab}
              role={digitalTwinSession.viewRole}
              currentPage={digitalTwinActiveTab}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              year={year}
              onYearChange={(y) => {
                setYear(y);
                setDtPendingYear(y);
              }}
              onLogout={requestLogout}
            />

            {/* ------ Digital Twin Period Bar ------------------------------------------------------------------------------------------------ */}
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-2">
              <CalendarClock className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-800 shrink-0">
                Digital Twin
              </span>
              <span className="text-amber-300 shrink-0">|</span>
              <span className="text-xs text-amber-700 shrink-0">Viewing period:</span>

              {/* Month picker */}
              <div className="relative">
                <select
                  value={dtPendingMonth}
                  onChange={(e) => setDtPendingMonth(e.target.value)}
                  className="appearance-none cursor-pointer rounded-lg border border-amber-200 bg-white pl-2.5 pr-6 py-1 text-xs font-bold text-gray-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
                >
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
              </div>

              {/* Year picker */}
              <div className="relative">
                <select
                  value={dtPendingYear}
                  onChange={(e) => setDtPendingYear(Number(e.target.value))}
                  className="appearance-none cursor-pointer rounded-lg border border-amber-200 bg-white pl-2.5 pr-6 py-1 text-xs font-bold text-gray-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
                >
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
              </div>

              <button
                onClick={() => {
                  setDtMonth(dtPendingMonth);
                  setYear(dtPendingYear);
                }}
                className="rounded-lg bg-amber-700 px-3 py-1 text-xs font-black text-white transition hover:bg-amber-800 active:bg-amber-900"
              >
                Apply Period
              </button>

              {/* Active period badge */}
              <span className="ml-auto shrink-0 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                {dtMonth} {year} • Read-only view
              </span>
            </div>

            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
              {renderDigitalTwinSessionContent()}
              <Footer />
            </main>
          </div>

          {dtSandboxState && (
            <div className="hidden lg:flex h-screen">
              <DigitalTwinControlsPanel
                institutionName={digitalTwinSession.entityName}
                institutionType={digitalTwinSession.entityType}
                institutionId={digitalTwinSession.entityId ?? ''}
                baselineHealthScore={digitalTwinSession.baselineHealthScore ?? 70}
                baselineNet={(digitalTwinSession.monthlyCollections ?? 0) - (digitalTwinSession.monthlyExpenses ?? 0)}
                currentSandboxState={dtSandboxState}
                onSandboxStateChange={setDtSandboxState}
                onReset={() => setDtSandboxState(buildInitialSandboxState(digitalTwinSession))}
              />
            </div>
          )}

          <div className="fixed left-4 bottom-4 z-[70]">
            <button
              onClick={() => {
                setDigitalTwinSession(null);
                setDtSandboxState(null);
                setActiveTab('digital-twin');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-yellow-300 px-4 py-2 text-sm font-bold text-gray-800 shadow-lg backdrop-blur transition hover:bg-yellow-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Digital Twin Page
            </button>
          </div>
          <BottomNav
            activeTab={digitalTwinActiveTab}
            onNavigate={setDigitalTwinActiveTab}
            role={digitalTwinSession.viewRole}
          />
          <StewardChatbot />
        </div>
      </ErrorBoundary>
    );
  }

  /**
   * Renders the appropriate page component based on activeTab and user role.
   * Routes between Home, Dashboard, Projects, WhatIfSimulator, and Settings pages.
   */
  const renderContent = () => {
    // Dynamically retrieve the logged-in user's assigned parish/institution name
    const currentEntityName = auth.currentUser?.entityName || 'San Isidro Labrador Parish';

    const renderAccessDenied = () => (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] bg-church-light p-6 text-center">
        <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center text-red-600 mb-4 animate-pulse">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h3>
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
          Your user account role does not have permission to access this page. Please contact your system administrator
          to adjust your permissions.
        </p>
      </div>
    );

    // Archives — a standalone top-level page (no longer nested under Administration).
    // Old 'admin-archives' deep links still resolve here.
    if (activeTab === 'archives' || activeTab === 'admin-archives') {
      if (!hasAnyArchiveAccess(permissions)) return renderAccessDenied();
      return <ArchivesPage />;
    }

    if (activeTab === 'change-password') {
      return <ChangePassword onBack={() => setActiveTab('profile')} />;
    }

    // Administration sub-routes - each deep-links to a specific Settings tab
    const adminTabMap: Record<string, string> = {
      'admin-user-management': 'user-management',
      'admin-user-role': 'role-control',
      'admin-entity': 'entity-management',
      'admin-data': 'data-management',
      'admin-liturgical': 'liturgical-validator',
      'admin-security': 'security',
      settings: 'user-management',
      profile: 'profile',
    };
    if (adminTabMap[activeTab] !== undefined) {
      const hasAdminAccess =
        permissions.create_users === true ||
        permissions.manage_roles === true ||
        permissions.manage_entities === true ||
        permissions.upload_csv_admin === true ||
        permissions.view_audit_logs === true ||
        permissions.validate_liturgical_calendar === true;
      if (activeTab !== 'profile' && !hasAdminAccess) return renderAccessDenied();
      return (
        <Settings
          onBack={() => setActiveTab('home')}
          onLogout={requestLogout}
          role={role}
          onNavigate={(page) => setActiveTab(page)}
          initialTab={adminTabMap[activeTab]}
        />
      );
    }

    const hasDioceseView = permissions.view_diocese === true;

    if (activeTab === 'home') {
      if (hasDioceseView) {
        return <Home onNavigate={(page) => setActiveTab(page)} role={role} permissions={permissions} />;
      } else {
        // Redirect non-bishop roles to their respective dashboards if they somehow land on 'home'
        if (role === 'priest')
          return (
            <BishopDashboard
              initialEntityType="Parishes"
              initialEntityFilter={currentEntityName}
              lockEntityFilter
              timeframe={timeframe}
              year={year}
              onYearChange={setYear}
            />
          );
        if (role === 'school')
          return (
            <PriestDashboard
              role="school"
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        if (role === 'seminary')
          return (
            <PriestDashboard
              role="seminary"
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
      }
    }

    if (hasDioceseView) {
      switch (activeTab) {
        case 'dashboard':
        case 'parish-dashboard':
        case 'parish-health':
          if (permissions.view_parish_dashboard !== true) return renderAccessDenied();
          return (
            <BishopDashboard initialEntityType="Parishes" timeframe={timeframe} year={year} onYearChange={setYear} />
          );
        case 'parish-aitwin':
          if (permissions.view_parish_dashboard !== true && permissions.digital_twin !== true)
            return renderAccessDenied();
          return <WhatIfSimulator mode="parish" />;
        case 'priest-dashboard':
          if (permissions.view_priests !== true) return renderAccessDenied();
          return (
            <PriestDashboard
              role="priest"
              dashboardContext="priest"
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'priest-health':
          if (permissions.view_priests !== true) return renderAccessDenied();
          return <HealthTracker />;
        case 'priest-aitwin':
          // Priest reassignment simulator is gated by the Priest Assignment
          // Simulator permission only, matching canAccessTab and the sidebar.
          if (permissions.manage_assignments !== true) return renderAccessDenied();
          return <WhatIfSimulator mode="priest" />;
        case 'seminaries':
          if (permissions.view_seminary_dashboard !== true) return renderAccessDenied();
          return (
            <BishopDashboard initialEntityType="Seminaries" timeframe={timeframe} year={year} onYearChange={setYear} />
          );
        case 'seminary-aitwin':
          if (permissions.view_seminary_dashboard !== true && permissions.digital_twin !== true)
            return renderAccessDenied();
          return <WhatIfSimulator mode="seminary" />;
        case 'school':
          if (permissions.view_school_dashboard !== true) return renderAccessDenied();
          return (
            <BishopDashboard
              initialEntityType="Diocesan Schools"
              timeframe={timeframe}
              year={year}
              onYearChange={setYear}
            />
          );
        case 'school-aitwin':
          if (permissions.view_school_dashboard !== true && permissions.digital_twin !== true)
            return renderAccessDenied();
          return <WhatIfSimulator mode="school" />;
        case 'projects':
          return permissions.view_projects || permissions.manage_projects ? (
            <Projects role={role} />
          ) : (
            renderAccessDenied()
          );
        case 'digital-twin':
          return permissions.digital_twin ? (
            <DigitalTwin
              onLaunch={(session) => {
                setDigitalTwinActiveTab(getDigitalTwinDefaultTab(session.viewRole));
                setDigitalTwinSession(session);
                setDtSandboxState(buildInitialSandboxState(session));
              }}
            />
          ) : (
            renderAccessDenied()
          );
        case 'announcements':
          return permissions.view_announcements || permissions.manage_announcements ? (
            <Announcements />
          ) : (
            renderAccessDenied()
          );
        case 'events':
          return permissions.view_events || permissions.manage_events ? <Events /> : renderAccessDenied();
        case 'budget':
          return permissions.view_budget || permissions.manage_budget ? <Budget /> : renderAccessDenied();
        case 'audit-log':
          return permissions.view_audit_logs ? <AuditLog /> : renderAccessDenied();
        case 'consolidated':
          return permissions.view_diocese ? <ConsolidatedFinancial /> : renderAccessDenied();
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">Content for {activeTab} is under construction.</p>
            </div>
          );
      }
    } else {
      switch (activeTab) {
        case 'dashboard':
        case 'parish-dashboard':
          if (role === 'priest' && permissions.view_parish_dashboard !== true) {
            return renderAccessDenied();
          }
          if (role === 'school' && permissions.view_school_dashboard !== true) {
            return renderAccessDenied();
          }
          if (role === 'seminary' && permissions.view_seminary_dashboard !== true) {
            return renderAccessDenied();
          }
          if (role === 'priest') {
            return (
              <BishopDashboard
                initialEntityType="Parishes"
                initialEntityFilter={currentEntityName}
                lockEntityFilter
                timeframe={timeframe}
                year={year}
                onYearChange={setYear}
                onNavigate={setActiveTab}
              />
            );
          }
          return (
            <PriestDashboard
              role={role as 'priest' | 'school' | 'seminary' | 'bishop'}
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'parish-data-submission':
          if (permissions.download_csv !== true && permissions.upload_csv_entity !== true) {
            return renderAccessDenied();
          }
          return (
            <ParishDataSubmission
              parishName={currentEntityName}
              vicariate="Holy Family Vicariate"
              parishClass="Class B"
              year={year}
              onBack={() => setActiveTab('parish-dashboard')}
            />
          );
        case 'parish-health':
          if (role === 'priest' && permissions.view_parish_dashboard !== true) {
            return renderAccessDenied();
          }
          if (role === 'priest') {
            return (
              <BishopDashboard
                initialEntityType="Parishes"
                initialEntityFilter={currentEntityName}
                lockEntityFilter
                timeframe={timeframe}
                year={year}
                onYearChange={setYear}
                onNavigate={setActiveTab}
              />
            );
          }
          return (
            <PriestDashboard
              role={role as 'priest' | 'school' | 'seminary' | 'bishop'}
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'parish-aitwin':
          return permissions.view_parish_dashboard === true || permissions.digital_twin === true ? (
            <WhatIfSimulator mode="parish" />
          ) : (
            renderAccessDenied()
          );
        case 'priest-dashboard':
          if (permissions.view_priests !== true) {
            return renderAccessDenied();
          }
          return (
            <PriestDashboard
              role={role as 'priest' | 'school' | 'seminary' | 'bishop'}
              dashboardContext={role === 'priest' ? 'priest' : undefined}
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'priest-health':
          return permissions.view_priests ? <HealthTracker /> : renderAccessDenied();
        case 'priest-aitwin':
          // Priest reassignment simulator is gated by the Priest Assignment
          // Simulator permission only, matching canAccessTab and the sidebar.
          return permissions.manage_assignments === true ? <WhatIfSimulator mode="priest" /> : renderAccessDenied();
        case 'seminaries':
          if (permissions.view_seminary_dashboard !== true) {
            return renderAccessDenied();
          }
          return (
            <PriestDashboard
              role="seminary"
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'seminary-data-submission':
          if (permissions.download_csv !== true && permissions.upload_csv_entity !== true) {
            return renderAccessDenied();
          }
          return (
            <ParishDataSubmission
              parishName="St. Peter's College Seminary"
              vicariate="St. John the Baptist Vicariate"
              parishClass="Seminary"
              year={year}
              onBack={() => setActiveTab('seminaries')}
            />
          );
        case 'seminary-aitwin':
          return permissions.view_seminary_dashboard === true || permissions.digital_twin === true ? (
            <WhatIfSimulator mode="seminary" />
          ) : (
            renderAccessDenied()
          );
        case 'school':
          if (permissions.view_school_dashboard !== true) {
            return renderAccessDenied();
          }
          return (
            <PriestDashboard
              role="school"
              timeframe={toPriestTimeframe(timeframe)}
              year={year}
              onYearChange={setYear}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
            />
          );
        case 'school-data-submission':
          if (permissions.download_csv !== true && permissions.upload_csv_entity !== true) {
            return renderAccessDenied();
          }
          return (
            <ParishDataSubmission
              parishName="San Pablo Diocesan Catholic School"
              vicariate="St. John the Baptist Vicariate"
              parishClass="School"
              year={year}
              onBack={() => setActiveTab('school')}
            />
          );
        case 'school-aitwin':
          return permissions.view_school_dashboard === true || permissions.digital_twin === true ? (
            <WhatIfSimulator mode="school" />
          ) : (
            renderAccessDenied()
          );
        case 'projects':
          return permissions.view_projects || permissions.manage_projects ? (
            <Projects role={role} />
          ) : (
            renderAccessDenied()
          );
        case 'announcements':
          return permissions.view_announcements || permissions.manage_announcements ? (
            <Announcements />
          ) : (
            renderAccessDenied()
          );
        case 'events':
          return permissions.view_events || permissions.manage_events ? <Events /> : renderAccessDenied();
        case 'budget':
          return permissions.view_budget || permissions.manage_budget ? <Budget /> : renderAccessDenied();
        case 'consolidated':
          return <ConsolidatedFinancial />;
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">Content for {activeTab} is under construction.</p>
            </div>
          );
      }
    }
  };

  return (
    <>
      {showPusher ? (
        <Pusher onBack={closePusher} />
      ) : !isAuthenticated ? (
        <Login onLogin={handleLogin} onPusher={openPusher} />
      ) : onboardingUser ? (
        <OnboardingModal user={onboardingUser} onComplete={() => setOnboardingUser(null)} onLogout={requestLogout} />
      ) : !onboardingChecked ? (
        <LoadingScreen label={logoutInProgress ? 'Signing out' : 'Signing in'} />
      ) : (
        <ErrorBoundary>
          <div className="flex flex-row min-h-screen bg-church-light font-sans">
            <Sidebar
              activeTab={activeTab}
              onNavigate={setActiveTab}
              onLogout={requestLogout}
              role={role}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />

            <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
              <TopNav
                onNavigate={(page) => setActiveTab(page)}
                role={role}
                currentPage={activeTab}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                year={year}
                onYearChange={setYear}
                onLogout={requestLogout}
              />
              <main ref={mainScrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-0">
                {renderContent()}
                <Footer />
              </main>
            </div>

            <BottomNav activeTab={activeTab} onNavigate={setActiveTab} role={role} />
            <StewardChatbot />
          </div>
        </ErrorBoundary>
      )}
      {loginRevealOverlay}
      {logoutConfirmModal}
      {roleChangedModalEl}
      {inactivityNoticeModal}
      {logoutTransitionOverlay}
    </>
  );
}
