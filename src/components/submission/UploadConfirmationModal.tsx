'use client';

import React from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatFileSize } from './submissionMock';

interface UploadConfirmationModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function UploadConfirmationModal({
  isOpen,
  file,
  onClose,
  onConfirm,
}: UploadConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-lg rounded-[2rem] bg-white p-6 md:p-7 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-church-black">Confirm Upload</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Are you sure you want to upload this financial report?
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {file && (
              <div className="mt-6 rounded-[1.5rem] border border-gray-200 bg-church-light/40 p-4">
                <p className="text-sm font-bold text-church-black break-all">{file.name}</p>
                <p className="mt-1 text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex items-center justify-center gap-2 rounded-2xl bg-church-green px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-church-green/90"
              >
                <Upload className="h-4 w-4" />
                Confirm Upload
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
