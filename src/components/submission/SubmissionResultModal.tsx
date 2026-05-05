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
