'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Heart, Zap, BarChart3 } from 'lucide-react';
import { PriestDashboard } from './PriestDashboard';
import { HealthTracker } from './HealthTracker';
import { AITwin } from './AITwin';

interface ParishContainerProps {
  role: 'priest' | 'bishop' | 'admin';
  timeframe: '6m' | '1y' | 'all';
  year: number;
  onYearChange: (year: number) => void;
  onNavigate: (tab: string) => void;
  onLogout: () => void;
}

export function ParishContainer({
  role,
  timeframe,
  year,
  onYearChange,
  onNavigate,
  onLogout,
}: ParishContainerProps) {
  const [activeSubtab, setActiveSubtab] = useState<'dashboard' | 'health' | 'aitwin'>('dashboard');

  const subtabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'health', label: 'Health Tracker', icon: Heart },
    { id: 'aitwin', label: 'Simulator', icon: Zap },
  ] as const;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Subtab Navigation */}
      <div className="border-b border-church-grey/20 bg-white sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto">
            {subtabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubtab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveSubtab(tab.id)}
                  className={`px-4 py-3 flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
                    isActive
                      ? 'text-church-green'
                      : 'text-church-grey hover:text-church-green/70'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-1 bg-church-green rounded-t"
                      layoutId="activeSubtab"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subtab Content */}
      <motion.div
        key={activeSubtab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-1 overflow-auto"
      >
        {activeSubtab === 'dashboard' && (
          role === 'priest' ? (
            <PriestDashboard
              role={role}
              dashboardContext="parish"
              timeframe={timeframe === '1y' ? '12m' : timeframe === 'all' ? undefined : timeframe}
              year={year}
              onYearChange={onYearChange}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          ) : (
            // For bishop/admin viewing parishes
            <PriestDashboard
              role="priest"
              dashboardContext="parish"
              timeframe={timeframe === '1y' ? '12m' : timeframe === 'all' ? undefined : timeframe}
              year={year}
              onYearChange={onYearChange}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          )
        )}
        {activeSubtab === 'health' && <HealthTracker />}
        {activeSubtab === 'aitwin' && <AITwin />}
      </motion.div>
    </div>
  );
}
