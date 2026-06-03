'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Droplets, Leaf, Zap, Shield, TrendingUp } from 'lucide-react';

interface HealthDimensionBarProps {
  label: string;
  score: number;
  weight: number;
}

export const HealthDimensionBar: React.FC<HealthDimensionBarProps> = ({ label, score, weight }) => {
  const getColor = (val: number) => {
    if (val >= 80) return 'bg-emerald-500';
    if (val >= 60) return 'bg-amber-500';
    if (val >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'liquidity': return <Droplets size={14} />;
      case 'sustainability': return <Leaf size={14} />;
      case 'efficiency': return <Zap size={14} />;
      case 'stability': return <Shield size={14} />;
      case 'growth': return <TrendingUp size={14} />;
      default: return null;
    }
  };

  const getIconColor = (val: number) => {
    if (val >= 80) return 'text-emerald-500 bg-emerald-50';
    if (val >= 60) return 'text-amber-500 bg-amber-50';
    if (val >= 40) return 'text-orange-500 bg-orange-50';
    return 'text-red-500 bg-red-50';
  };

  return (
    <div className="mb-5 group">
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${getIconColor(score)}`}>
            {getIcon(label)}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-wider leading-none">{label}</span>
            <span className="text-[10px] text-gray-400 font-medium mt-0.5">Weight: {weight}%</span>
          </div>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-lg font-black text-gray-900 tabular-nums leading-none">{score}</span>
          <span className="text-[10px] font-bold text-gray-400">/100</span>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={`h-full rounded-full ${getColor(score)} shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
        />
      </div>
    </div>
  );
};
