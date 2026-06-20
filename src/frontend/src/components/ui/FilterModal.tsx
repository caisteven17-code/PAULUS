'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface FilterModalProps {
  /** Number of active (non-default) filters, shown as a badge on the trigger. */
  activeCount?: number;
  /** Clears all filters back to their defaults. */
  onClear?: () => void;
  title?: string;
  /** The filter controls (selects, etc.) rendered inside the modal body. */
  children: React.ReactNode;
  /** Optional extra classes for the trigger button. */
  triggerClassName?: string;
}

// Shared "Filters" pop-up used to keep busy toolbars (Budget, Projects, User
// Management, …) clean — the controls live in a modal instead of crowding the
// page, mirroring the Audit Logs filter experience.
export function FilterModal({ activeCount = 0, onClear, title = 'Filters', children, triggerClassName = '' }: FilterModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 ${triggerClassName}`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {title}
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D4AF37] px-1.5 text-[10px] font-black text-black">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-gold-400">
                    <SlidersHorizontal className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-950">{title}</h2>
                    <p className="text-xs font-semibold text-slate-400">
                      {activeCount > 0 ? `${activeCount} active` : 'No filters applied'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 px-6 py-6">{children}</div>

              <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4">
                <button
                  onClick={() => onClear?.()}
                  disabled={activeCount === 0}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Labeled wrapper for a single control inside the FilterModal body. */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      {children}
    </div>
  );
}
