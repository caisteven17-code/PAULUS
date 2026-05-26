'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, CalendarClock, ChevronDown } from 'lucide-react';
import { TopNav } from './components/layout/TopNav';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { BishopDashboard } from './views/BishopDashboard';
import { PriestDashboard } from './views/PriestDashboard';
import { Settings } from './views/Settings';
import { Login } from './views/Login';
import { Home } from './views/Home';
import { Projects } from './views/Projects';
import { AITwin } from './views/AITwin';
import { DigitalTwin } from './views/DigitalTwin';
import { Announcements } from './views/Announcements';
import { HealthTracker } from './views/HealthTracker';
import { ConsolidatedFinancial } from './views/ConsolidatedFinancial';
import { AuditLog } from './views/AuditLog';
import { ParishDataSubmission } from './views/ParishDataSubmission';
import { BottomNav } from './components/ui/BottomNav';
import { StewardChatbot } from './components/ui/StewardChatbot';
import { auth, AuthUser } from './firebase';
import { AppRole } from './lib/access';

export type Role = 'bishop' | 'admin' | 'priest' | 'school' | 'seminary';
export type Timeframe = '6m' | '1y' | 'all';
type DigitalTwinSession = {
  entityClass: string;
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  viewRole: 'priest' | 'school' | 'seminary';
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

const appRoleToRole = (appRole: string): Role => {
  const map: Record<string, Role> = {
    bishop:           'bishop',
    admin:            'admin',
    parish_priest:    'priest',
    parish_secretary: 'priest',
    school:           'school',
    school_registrar: 'school',
    seminary:         'seminary',
    seminary_rector:  'seminary',
    diocese_admin:    'admin',
  };
  return map[appRole] ?? 'priest';
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [role, setRole] = useState<Role>('bishop');
  const [activeTab, setActiveTab] = useState('home');
  const [timeframe, setTimeframe] = useState<Timeframe>('6m');
  const [year, setYear] = useState<number>(2026);
  const [digitalTwinSession, setDigitalTwinSession] = useState<DigitalTwinSession | null>(null);
  const [digitalTwinActiveTab, setDigitalTwinActiveTab] = useState('parish-dashboard');
  // Pending = what the user has picked in the dropdowns; applied = what is actually shown
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
  const currentMonthName = MONTHS[new Date().getMonth()];
  const [dtMonth, setDtMonth] = useState<string>(currentMonthName);
  const [dtPendingMonth, setDtPendingMonth] = useState<string>(currentMonthName);
  const [dtPendingYear, setDtPendingYear] = useState<number>(year);

  useEffect(() => {
    const roleDefaultTab: Record<Role, string> = {
      bishop:   'home',
      admin:    'home',
      priest:   'parish-dashboard',
      school:   'school',
      seminary: 'seminaries',
    };

    const unsubscribe = auth.onAuthStateChanged((user: AuthUser | null) => {
      if (user?.role) {
        const internalRole = appRoleToRole(user.role);
        setRole(internalRole);
        setIsAuthenticated(true);
        // Use functional update so the effect doesn't need activeTab in its deps
        setActiveTab((prev) => (prev === 'home' ? roleDefaultTab[internalRole] : prev));
      } else {
        setIsAuthenticated(false);
        setRole('bishop');
        setActiveTab('home');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = (loggedInRole: AppRole) => {
    const internalRole = appRoleToRole(loggedInRole);
    setRole(internalRole);
    setIsAuthenticated(true);

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

  /**
   * Handles user logout and state reset
   */
  const handleLogout = async () => {
    try {
      await auth.signOut();
      setIsAuthenticated(false);
      setRole('bishop');
      setActiveTab('home');
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: reset state even if signOut fails
      setIsAuthenticated(false);
      setRole('bishop');
      setActiveTab('home');
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-church-light">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-church-green"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const renderDigitalTwinSessionContent = () => {
    if (!digitalTwinSession) return null;

    const commonPriestProps = {
      timeframe: toPriestTimeframe(timeframe),
      year,
      onYearChange: setYear,
      onNavigate: setDigitalTwinActiveTab,
      onLogout: handleLogout,
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
          return <AITwin mode="parish" />;
        case 'priest-aitwin':
          return <AITwin mode="priest" />;
        case 'announcements':
          return <Announcements />;
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">This institution view is not available in the current Digital Twin session.</p>
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
          return <AITwin mode="seminary" />;
        case 'announcements':
          return <Announcements />;
        default:
          return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
              <p className="text-church-grey">This seminary view is not available in the current Digital Twin session.</p>
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
        return <AITwin mode="school" />;
      case 'announcements':
        return <Announcements />;
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
            onLogout={handleLogout}
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
              onYearChange={(y) => { setYear(y); setDtPendingYear(y); }}
              onLogout={handleLogout}
            />

            {/* ── Digital Twin Period Bar ──────────────────────────────── */}
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
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m) => (
                    <option key={m} value={m}>{m}</option>
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
                    <option key={y} value={y}>{y}</option>
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

          <div className="fixed left-4 bottom-4 z-[70]">
            <button
              onClick={() => {
                setDigitalTwinSession(null);
                setActiveTab('digital-twin');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-yellow-300 px-4 py-2 text-sm font-bold text-gray-800 shadow-lg backdrop-blur transition hover:bg-yellow-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Digital Twin Page
            </button>
          </div>
          <BottomNav activeTab={digitalTwinActiveTab} onNavigate={setDigitalTwinActiveTab} role={digitalTwinSession.viewRole} />
          <StewardChatbot />
        </div>
      </ErrorBoundary>
    );
  }

  /**
   * Renders the appropriate page component based on activeTab and user role.
   * Routes between Home, Dashboard, Projects, AITwin, and Settings pages.
   */
  const renderContent = () => {
    // Administration sub-routes — each deep-links to a specific Settings tab
    const adminTabMap: Record<string, string> = {
      'admin-user-management': 'user-management',
      'admin-user-role':       'role-control',
      'admin-entity':          'entity-management',
      'admin-data':            'data-management',
      'admin-security':        'security',
      'settings':              'user-management',
      'profile':               'profile',
    };
    if (adminTabMap[activeTab] !== undefined) {
      return <Settings onBack={() => setActiveTab('home')} onLogout={handleLogout} role={role} onNavigate={(page) => setActiveTab(page)} initialTab={adminTabMap[activeTab]} />;
    }

    if (activeTab === 'home') {
      if (role === 'bishop' || role === 'admin') {
        return <Home onNavigate={(page) => setActiveTab(page)} role={role} />;
      } else {
        // Redirect non-bishop roles to their respective dashboards if they somehow land on 'home'
        if (role === 'priest') return <BishopDashboard initialEntityType="Parishes" initialEntityFilter="San Isidro Labrador Parish" lockEntityFilter timeframe={timeframe} year={year} onYearChange={setYear} />;
        if (role === 'school') return <PriestDashboard role="school" timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        if (role === 'seminary') return <PriestDashboard role="seminary" timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
      }
    }

    if (role === 'bishop' || role === 'admin') {
      switch (activeTab) {
        case 'dashboard':
          return <BishopDashboard initialEntityType="Parishes" timeframe={timeframe} year={year} onYearChange={setYear} />;
        case 'parish-dashboard':
          return <BishopDashboard initialEntityType="Parishes" timeframe={timeframe} year={year} onYearChange={setYear} />;
        case 'parish-health':
          return <BishopDashboard initialEntityType="Parishes" timeframe={timeframe} year={year} onYearChange={setYear} />;
        case 'parish-aitwin':
          return <AITwin mode="parish" />;
        case 'priest-dashboard':
          return <PriestDashboard role="priest" dashboardContext="priest" timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'priest-health':
          return <HealthTracker />;
        case 'priest-aitwin':
          return <AITwin mode="priest" />;
        case 'seminaries':
          return <BishopDashboard initialEntityType="Seminaries" timeframe={timeframe} year={year} onYearChange={setYear} />;
        case 'seminary-aitwin':
          return <AITwin mode="seminary" />;
        case 'school':
          return <BishopDashboard initialEntityType="Diocesan Schools" timeframe={timeframe} year={year} onYearChange={setYear} />;
        case 'school-aitwin':
          return <AITwin mode="school" />;
        case 'projects':
          return <Projects role={role} />;
        case 'digital-twin':
          return role === 'admin' ? (
            <DigitalTwin
              onLaunch={(session) => {
                setDigitalTwinActiveTab(getDigitalTwinDefaultTab(session.viewRole));
                setDigitalTwinSession(session);
              }}
            />
          ) : null;
        case 'announcements':
          return <Announcements />;
        case 'audit-log':
          return role === 'admin' ? <AuditLog /> : null;
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
          if (role === 'priest') {
            return <BishopDashboard initialEntityType="Parishes" initialEntityFilter="San Isidro Labrador Parish" lockEntityFilter timeframe={timeframe} year={year} onYearChange={setYear} onNavigate={setActiveTab} />;
          }
          return <PriestDashboard role={role} timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'parish-data-submission':
          return <ParishDataSubmission parishName="San Isidro Labrador Parish" vicariate="Holy Family Vicariate" parishClass="Class B" year={year} onBack={() => setActiveTab('parish-dashboard')} />;
        case 'parish-health':
          if (role === 'priest') {
            return <BishopDashboard initialEntityType="Parishes" initialEntityFilter="San Isidro Labrador Parish" lockEntityFilter timeframe={timeframe} year={year} onYearChange={setYear} onNavigate={setActiveTab} />;
          }
          return <PriestDashboard role={role} timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'parish-aitwin':
          return <AITwin mode="parish" />;
        case 'priest-dashboard':
          return <PriestDashboard role={role} dashboardContext={role === 'priest' ? 'priest' : undefined} timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'priest-health':
          return <HealthTracker />;
        case 'priest-aitwin':
          return <AITwin mode="priest" />;
        case 'seminaries':
          return <PriestDashboard role="seminary" timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'seminary-data-submission':
          return <ParishDataSubmission parishName="St. Peter's College Seminary" vicariate="St. John the Baptist Vicariate" parishClass="Seminary" year={year} onBack={() => setActiveTab('seminaries')} />;
        case 'seminary-aitwin':
          return <AITwin mode="seminary" />;
        case 'school':
          return <PriestDashboard role="school" timeframe={toPriestTimeframe(timeframe)} year={year} onYearChange={setYear} onNavigate={setActiveTab} onLogout={handleLogout} />;
        case 'school-data-submission':
          return <ParishDataSubmission parishName="San Pablo Diocesan Catholic School" vicariate="St. John the Baptist Vicariate" parishClass="School" year={year} onBack={() => setActiveTab('school')} />;
        case 'school-aitwin':
          return <AITwin mode="school" />;
        case 'projects':
          return <Projects role={role} />;
        case 'announcements':
          return <Announcements />;
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
    <ErrorBoundary>
      <div className="flex flex-row min-h-screen bg-church-light font-sans">
        <Sidebar
          activeTab={activeTab}
          onNavigate={setActiveTab}
          onLogout={handleLogout}
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
            onLogout={handleLogout}
          />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {renderContent()}
            <Footer />
          </main>
        </div>
        
        <BottomNav activeTab={activeTab} onNavigate={setActiveTab} role={role} />
        <StewardChatbot />
      </div>
    </ErrorBoundary>
  );
}

