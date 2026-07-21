'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface SubmissionResultModalProps {
  isOpen: boolean;
  variant: 'success' | 'warning';
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  details?: Array<{
    fieldName: string;
    severity: string;
    message: string;
    sourceRow?: number | null;
  }>;
}

export function SubmissionResultModal({
  isOpen,
  variant,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  details = [],
}: SubmissionResultModalProps) {
  const tone =
    variant === 'success'
      ? {
          icon: <CheckCircle2 className="h-6 w-6 text-emerald-700" />,
          iconWrap: 'bg-emerald-50 text-emerald-700',
          primary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        }
      : {
          icon: <AlertTriangle className="h-6 w-6 text-amber-700" />,
          iconWrap: 'bg-amber-50 text-amber-700',
          primary: 'bg-amber-500 hover:bg-amber-600 text-black',
        };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-lg rounded-[2rem] bg-white p-6 md:p-7 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrap}`}>
                  {tone.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-church-black">{title}</h3>
                  <p className="mt-1 text-sm text-gray-500 leading-relaxed">{message}</p>
                </div>
              </div>
              {onSecondary && (
                <button
                  onClick={onSecondary}
                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {details.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-lg border border-gray-200">
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600">Detected issues</p>
                  <span className="text-xs font-semibold text-gray-500">{details.length}</span>
                </div>
                <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
                  {details.map((detail, index) => (
                    <div key={`${detail.fieldName}-${index}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{detail.fieldName.replaceAll('_', ' ')}</p>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${detail.severity === 'blocker' || detail.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {detail.severity}
                        </span>
                        {detail.sourceRow && <span className="text-[10px] font-medium text-gray-400">Row {detail.sourceRow}</span>}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-600">{detail.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {secondaryLabel && onSecondary && (
                <button
                  onClick={onSecondary}
                  className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {secondaryLabel}
                </button>
              )}
              <button
                onClick={onPrimary}
                className={`rounded-2xl px-5 py-3 text-sm font-bold transition-colors ${tone.primary}`}
              >
                {primaryLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
