'use client';

import React from 'react';
import { Home, Church, Settings, Zap, Bell, Heart } from 'lucide-react';
import type { Role } from '../../App';

interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  role?: Role;
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'parish', label: 'Parish', icon: Church },
  { id: 'aitwin', label: 'Simulator', icon: Zap },
  { id: 'announcements', label: 'News', icon: Bell },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({ activeTab, onNavigate, role = 'bishop' }: BottomNavProps) {
  const handleNavigate = (tab: string) => {
    if (tab === 'aitwin') {
      const isDioceseRole = ['bishop', 'admin', 'chancellor', 'diocesan_oeconomus', 'finance_staff'].includes(role);
      if (isDioceseRole) { onNavigate('digital-twin'); return; }
      if (role === 'seminary') { onNavigate('seminary-aitwin'); return; }
      if (role === 'school') { onNavigate('school-aitwin'); return; }
      onNavigate('parish-aitwin');
      return;
    }

    if (tab === 'parish') {
      if (role === 'school') { onNavigate('school'); return; }
      if (role === 'seminary') { onNavigate('seminaries'); return; }
      onNavigate('parish-dashboard');
      return;
    }

    if (tab === 'health') {
      onNavigate('priest-health');
      return;
    }

    onNavigate(tab);
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50 flex justify-between items-center safe-area-bottom">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isSimulatorActive = item.id === 'aitwin' && (
          activeTab === 'digital-twin' ||
          activeTab === 'parish-aitwin' ||
          activeTab === 'seminary-aitwin' ||
          activeTab === 'school-aitwin' ||
          activeTab === 'priest-aitwin'
        );
        const isParishActive = item.id === 'parish' && (
          activeTab === 'parish-dashboard' ||
          activeTab === 'parish-health' ||
          activeTab === 'parish-aitwin' ||
          activeTab === 'school' ||
          activeTab.startsWith('school-') ||
          activeTab === 'seminaries' ||
          activeTab.startsWith('seminary-')
        );
        const isHealthActive = item.id === 'health' && activeTab === 'priest-health';
        const isActive = activeTab === item.id || isSimulatorActive || isParishActive || isHealthActive;

        return (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${
              isActive ? 'text-church-green' : 'text-gray-400'
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span className={`text-[10px] font-medium ${isActive ? 'text-church-green' : 'text-gray-400'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
