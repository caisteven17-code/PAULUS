'use client';

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from './Card';

// Small "?" disclosure for explaining a non-obvious chart/metric inline next
// to its title. Collapsed by default; each instance holds its own open
// state, so multiple toggles on the same page never affect each other.
export function ChartHelpToggle({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="What does this mean?"
        className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-church-green flex items-center justify-center transition-colors shrink-0"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-30 w-72 bg-white p-3.5 text-left"
          style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
        >
          <p className="text-[11px] text-gray-500 leading-relaxed">{children}</p>
        </div>
      )}
    </span>
  );
}
