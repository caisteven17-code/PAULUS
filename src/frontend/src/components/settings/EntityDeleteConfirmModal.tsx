'use client';

import { Loader2, ShieldAlert, CheckCircle, Trash2 } from 'lucide-react';

interface EntityDeleteConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  entityToDelete: any | null;
  deleteState: {
    isChecking: boolean;
    hasAny: boolean;
    hasPastor: boolean;
    hasCollections: boolean;
    hasAccounts: boolean;
    hasProjects: boolean;
    isPredefined: boolean;
  };
}

export function EntityDeleteConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  entityToDelete,
  deleteState,
}: EntityDeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
        {deleteState.isChecking ? (
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100">
              <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">Analyzing Dependencies</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Checking financial reports, historical collections, projects, and active personnel assignments for{' '}
                <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>...
              </p>
            </div>
          </div>
        ) : deleteState.hasAny ? (
          /* Soft Delete (Archive) Warning Flow */
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
              <ShieldAlert className="w-8 h-8 text-amber-500 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">Safe Archive Required</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Historical dependency records were detected for{' '}
                <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>. To protect multi-year
                aggregates, audit history, and reporting integrity, this entry will be safely archived and hidden
                from active views.
              </p>
            </div>

            <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100 text-left space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block mb-1">
                Detected Dependencies:
              </span>
              {deleteState.hasPastor && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-amber-500 text-xs">⛪</span>
                  <span>
                    Assigned Pastor:{' '}
                    <span className="text-gray-900 font-bold">
                      {entityToDelete.pastor || entityToDelete.rector || entityToDelete.principal}
                    </span>
                  </span>
                </div>
              )}
              {deleteState.hasCollections && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-amber-500 text-xs">📊</span>
                  <span>Historical Financial Records & Collections</span>
                </div>
              )}
              {deleteState.hasAccounts && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-amber-500 text-xs">👤</span>
                  <span>Assigned User Account / Profile</span>
                </div>
              )}
              {deleteState.hasProjects && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-amber-500 text-xs">🏗️</span>
                  <span>Active or Completed Special Projects</span>
                </div>
              )}
              {deleteState.isPredefined && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-amber-500 text-xs">🛡️</span>
                  <span>Predefined Diocesan Seed Institution</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-6 py-3 bg-[#D4AF37] hover:bg-[#B5952F] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#D4AF37]/20 text-sm"
              >
                Archive Entity
              </button>
            </div>
          </div>
        ) : (
          /* Hard Delete clean Flow */
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 className="w-8 h-8 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">Delete Permanently</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                No active dependencies, projects, or historical financial records were detected for{' '}
                <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>.
              </p>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                Since this entry appears to be a clean record (e.g. created by accident due to a typo), it will be
                **permanently erased** from the system. This cannot be undone.
              </p>
            </div>

            <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Eligible for clean hard deletion</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 text-sm"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
