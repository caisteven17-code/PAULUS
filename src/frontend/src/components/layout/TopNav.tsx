'use client';

import React, { useState } from 'react';
import { Calendar, ChevronDown, Check, User, Database, LogOut } from 'lucide-react';

import { Role, Timeframe } from '../../App';
import { auth } from '../../firebase';
import { ALL_PARISHES } from '../../constants';
import { Avatar } from '../ui/Avatar';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '6m': 'Past 6 Months',
  '1y': 'Past 1 Year',
  all: 'All Time',
};

const YEAR_OPTIONS = [2026, 2025, 2024, 2023, 2022] as const;

interface TopNavProps {
  onNavigate?: (page: string) => void;
  role?: Role;
  currentPage?: string;
  timeframe?: Timeframe;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  year?: number;
  onYearChange?: (year: number) => void;
  onLogout?: () => void;
}

export function TopNav({
  onNavigate,
  role = 'bishop',
  currentPage = 'home',
  timeframe = '6m',
  onTimeframeChange,
  year = 2026,
  onYearChange,
  onLogout,
}: TopNavProps) {
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const handleTimeframeSelect = (tf: Timeframe) => {
    onTimeframeChange?.(tf);
    setShowTimeframeDropdown(false);
  };

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

    // Resolve vicariate dynamically from predefined ALL_PARISHES list
    const matchedParish = ALL_PARISHES.find((p) => p.name.toLowerCase() === (user?.entityName || '').toLowerCase());
    const vicariateLabel = matchedParish ? `${matchedParish.vicariate} Vicariate` : 'St. John the Baptist Vicariate';

    const metadata =
      role === 'school'
        ? ['Cluster 1', `School Director: ${pastorName}`, 'Access: School']
        : role === 'seminary'
          ? [`Rector: ${pastorName}`, 'Access: Seminary']
          : ['District not assigned', vicariateLabel, `Parish Priest: ${pastorName}`, 'Access: Parish Priest'];

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
                <span>{year}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/35 transition-transform ${isYearOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isYearOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {YEAR_OPTIONS.map((y) => (
                    <button
                      key={y}
                      onClick={() => {
                        onYearChange?.(y);
                        setIsYearOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={year === y ? 'text-gold-600 font-bold' : 'text-gray-600'}>{y}</span>
                      {year === y && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsAccountOpen(!isAccountOpen)}
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
                <span>{year}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/40 transition-transform ${isYearOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isYearOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                  {YEAR_OPTIONS.map((y) => (
                    <button
                      key={y}
                      onClick={() => {
                        onYearChange?.(y);
                        setIsYearOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <span className={year === y ? 'text-gold-600 font-bold' : 'text-gray-700'}>{y}</span>
                      {year === y && <Check className="w-4 h-4 text-gold-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsAccountOpen(!isAccountOpen)}
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
