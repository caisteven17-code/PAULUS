'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ChevronDown, ChevronUp, Info, BrainCircuit } from 'lucide-react';
import { DiagnosticResult } from '../../types';

interface DiagnosticCardProps {
  diagnostic: DiagnosticResult;
  onClose?: () => void;
}

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({ diagnostic, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border-none rounded-[2rem] overflow-hidden shadow-2xl bg-white relative group ${diagnostic.severity === 'high' ? 'ring-1 ring-red-100' : ''}`}
    >
      <div className="absolute top-0 left-0 w-1.5 h-full bg-gold-500 z-10"></div>
      <div className="p-5 flex items-start gap-4 relative z-20">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xl transition-transform group-hover:scale-110 duration-500 ${diagnostic.severity === 'high' ? 'bg-red-50 text-red-600 shadow-red-100' : 'bg-gold-500 text-black shadow-gold-500/20'}`}>
          <BrainCircuit size={24} />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-base font-bold text-gray-900">AI Diagnostic: {diagnostic.anomalyType || 'Anomaly Detected'}</h3>
              <p className="text-xs text-gray-500">Analysis for {diagnostic.targetMonth}</p>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getSeverityColor(diagnostic.severity)}`}>
              {diagnostic.severity} Severity
            </span>
          </div>
          
          <p className="mt-2 text-sm text-gray-700 leading-relaxed">
            {diagnostic.analysis}
          </p>

          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-emerald-600 font-medium">
              <Info size={14} />
              <span>{diagnostic.confidenceScore}% Confidence</span>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              {isExpanded ? 'Hide Root Causes' : 'Show Root Causes'}
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && diagnostic.rootCauses && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gray-50 border-t border-gray-200 p-4"
          >
            <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Root Cause Breakdown</h4>
            <div className="space-y-3">
              {diagnostic.rootCauses.map((cause, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{cause.factor}</span>
                    <span className="text-gray-900 font-bold">{cause.contribution}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cause.contribution}%` }}
                      className="bg-blue-600 h-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
