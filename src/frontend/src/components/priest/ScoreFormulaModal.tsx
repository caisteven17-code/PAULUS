'use client';

import { X } from 'lucide-react';

interface ScoreFormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScoreFormulaModal({ isOpen, onClose }: ScoreFormulaModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111111] rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-white">Pastoral Association Score Formula</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 text-white">
          <div className="bg-white/5 rounded-xl p-5 border border-white/10">
            <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">Main Score</p>
            <p className="text-base font-bold">Pastoral Assignment Financial Association Score</p>
            <p className="text-[#D4AF37] font-black text-lg mt-1">
              = 100 × (Actual Donations ÷ Model-Predicted Donations)
            </p>
          </div>
          <div className="bg-white/5 rounded-xl p-5 border border-white/10">
            <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">Companion Metric</p>
            <p className="text-base font-bold">Association Lift %</p>
            <p className="text-[#D4AF37] font-black text-lg mt-1">= 100 × (Actual − Predicted) ÷ Predicted</p>
            <p className="text-white/40 text-xs mt-1">Equivalent to: Score − 100</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="font-black text-emerald-400 text-base">&gt; 100%</p>
              <p className="text-white/60 mt-1">Overperforming</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="font-black text-blue-400 text-base">= 100%</p>
              <p className="text-white/60 mt-1">On Target</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="font-black text-red-400 text-base">&lt; 100%</p>
              <p className="text-white/60 mt-1">Underperforming</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
