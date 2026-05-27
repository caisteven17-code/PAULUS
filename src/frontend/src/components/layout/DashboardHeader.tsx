'use client';

import React, { useState } from 'react';
import { CalendarDays, ChevronDown, Settings, LogOut, User } from 'lucide-react';

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  priestName: string;
  userInitial?: string;
  timeframe?: '3m' | '6m' | '12m';
  onTimeframeChange?: (timeframe: '3m' | '6m' | '12m') => void;
  year?: number;
  onYearChange?: (year: number) => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  subtitle,
  priestName,
  userInitial = 'P',
  timeframe = '6m',
  onTimeframeChange,
  year = 2026,
  onYearChange,
  onSettingsClick,
  onLogout
}) => {
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const timeframeLabels = {
    '3m': 'Past 3 Months',
    '6m': 'Past 6 Months',
    '12m': 'Past 12 Months'
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-black via-black to-black/95 border-b border-gold-500/30 px-6 lg:px-12 py-4 shadow-2xl">
      <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-8">
        
        {/* Logo & Title Section */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="w-12 h-12 bg-transparent border-2 border-gold-500 text-gold-500 rounded-lg flex items-center justify-center font-bold text-xl flex-shrink-0">
            ⛪
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-lg font-serif italic font-bold text-gold-400 leading-none tracking-wide">
              {title}
            </p>
            <h1 className="text-sm font-black text-white uppercase tracking-widest leading-none">
              {subtitle}
            </h1>
            <p className="text-xs text-gray-500 font-semibold mt-1">
              {priestName}
            </p>
          </div>
        </div>



        {/* Controls Section */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <button 
              onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
              className="px-4 py-2 bg-white/10 backdrop-blur-sm hover:bg-gold-500/20 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/15 hover:border-gold-400/50 transition-all duration-300 hidden sm:flex items-center gap-2 group"
            >
              <CalendarDays 
                size={14} 
                className="group-hover:text-gold-400 transition-colors" 
              />
              <span>{timeframeLabels[timeframe]}</span>
              <ChevronDown 
                size={14} 
                className={`transition-transform ${isTimeframeOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown Menu */}
            {isTimeframeOpen && (
              <div className="absolute top-full right-0 mt-2 bg-black/95 border border-gold-500/30 rounded-lg shadow-xl z-50">
                {Object.entries(timeframeLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      onTimeframeChange?.(key as '3m' | '6m' | '12m');
                      setIsTimeframeOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition-all ${
                      timeframe === key
                        ? 'bg-gold-500/20 text-gold-400 border-l-2 border-gold-400'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Year Selector */}
          <div className="relative">
            <button 
              onClick={() => setIsYearOpen(!isYearOpen)}
              className="px-4 py-2 bg-white/10 backdrop-blur-sm hover:bg-gold-500/20 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/15 hover:border-gold-400/50 transition-all duration-300 hidden sm:flex items-center gap-2 group"
            >
              <span>{year}</span>
              <ChevronDown 
                size={14} 
                className={`transition-transform ${isYearOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Year Dropdown Menu */}
            {isYearOpen && (
              <div className="absolute top-full right-0 mt-2 bg-black/95 border border-gold-500/30 rounded-lg shadow-xl z-50">
                {[2026, 2025, 2024, 2023, 2022].map((y) => (
                  <button
                    key={y}
                    onClick={() => {
                      onYearChange?.(y);
                      setIsYearOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition-all ${
                      year === y
                        ? 'bg-gold-500/20 text-gold-400 border-l-2 border-gold-400'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-600 text-black text-center rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-lg shadow-gold-500/40 border border-gold-300 cursor-pointer hover:shadow-gold-500/60 transition-all hover:scale-110"
            >
              {userInitial}
            </button>

            {/* Account Dropdown Menu */}
            {isAccountOpen && (
              <div className="absolute top-full right-0 mt-2 bg-black/95 border border-gold-500/30 rounded-lg shadow-xl z-50 w-48">
                <div className="px-4 py-3 border-b border-gold-500/20">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Account</p>
                </div>
                <button
                  onClick={() => {
                    setIsAccountOpen(false);
                    onSettingsClick?.();
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gold-500/10 hover:text-gold-400 transition-all flex items-center gap-3 border-b border-gold-500/10"
                >
                  <Settings size={16} />
                  Change Password
                </button>
                <button
                  onClick={() => {
                    setIsAccountOpen(false);
                    onLogout?.();
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center gap-3"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

