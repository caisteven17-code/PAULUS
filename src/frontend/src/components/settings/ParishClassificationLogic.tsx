'use client';

import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Info, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { EntityClass, FinancialRecord } from '../../types';

interface ClassificationThresholds {
  classA: { min: number; max: number };
  classB: { min: number; max: number };
  classC: { min: number; max: number };
  classD: { min: number; max: number };
}

interface ParishData {
  id: string;
  name: string;
  annualCollections: number;
  annualDisbursements: number;
  currentClass: EntityClass;
  parishRecommendedClass?: EntityClass;
  isSubsidized?: boolean;
  subsidyAmount?: number;
}

interface ParishClassificationLogicProps {
  parishes: ParishData[];
  records?: FinancialRecord[];
  onClassificationChange?: (parishId: string, newClass: EntityClass, subsidyNeeded: boolean) => void;
}

const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  classA: { min: 5000000, max: Number.MAX_VALUE },
  classB: { min: 2000000, max: 4999999 },
  classC: { min: 500000, max: 1999999 },
  classD: { min: 0, max: 499999 },
};

const SUBSIDY_THRESHOLD = 2000000; // Annual collections below this gets subsidy

export function ParishClassificationLogic({
  parishes,
  records = [],
  onClassificationChange,
}: ParishClassificationLogicProps) {
  const [thresholds, setThresholds] = useState<ClassificationThresholds>(DEFAULT_THRESHOLDS);
  const [showThresholdEditor, setShowThresholdEditor] = useState(false);

  /**
   * Determine the recommended class based on annual collections
   */
  const getRecommendedClass = (annualCollections: number): EntityClass => {
    if (annualCollections >= thresholds.classA.min) return 'Class A';
    if (annualCollections >= thresholds.classB.min) return 'Class B';
    if (annualCollections >= thresholds.classC.min) return 'Class C';
    return 'Class D';
  };

  /**
   * Detect if parish needs subsidy based on collections
   */
  const needsSubsidy = (annualCollections: number): boolean => {
    return annualCollections < SUBSIDY_THRESHOLD;
  };

  /**
   * Calculate suggested subsidy amount (gap to minimum threshold)
   */
  const calculateSubsidyAmount = (annualCollections: number): number => {
    if (annualCollections >= SUBSIDY_THRESHOLD) return 0;
    return SUBSIDY_THRESHOLD - annualCollections;
  };

  /**
   * Analyze and classify all parishes
   */
  const classificationAnalysis = useMemo(() => {
    return parishes.map(parish => {
      const recommendedClass = getRecommendedClass(parish.annualCollections);
      const subsidyNeeded = needsSubsidy(parish.annualCollections);
      const subsidyAmount = calculateSubsidyAmount(parish.annualCollections);
      const needsReclassification = recommendedClass !== parish.currentClass;

      return {
        ...parish,
        recommendedClass,
        subsidyNeeded,
        subsidyAmount,
        needsReclassification,
        classificationStatus: needsReclassification ? 'needs-update' : 'current',
        subsidyStatus: subsidyNeeded ? 'requires-subsidy' : 'self-sufficient',
      };
    });
  }, [parishes, thresholds]);

  /**
   * Generate summary statistics
   */
  const stats = useMemo(() => ({
    total: classificationAnalysis.length,
    needingSubsidy: classificationAnalysis.filter(p => p.subsidyNeeded).length,
    selfSufficient: classificationAnalysis.filter(p => !p.subsidyNeeded).length,
    needingReclassification: classificationAnalysis.filter(p => p.needsReclassification).length,
    totalSubsidyNeeded: classificationAnalysis.reduce((sum, p) => sum + (p.subsidyAmount || 0), 0),
  }), [classificationAnalysis]);

  const handleApplyClassification = (parishId: string, newClass: EntityClass) => {
    const parish = classificationAnalysis.find(p => p.id === parishId);
    if (parish && onClassificationChange) {
      onClassificationChange(parishId, newClass, parish.subsidyNeeded);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-lg p-4"
        >
          <p className="text-xs text-gray-600 uppercase font-bold mb-2">Total Parishes</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4"
        >
          <p className="text-xs text-red-700 uppercase font-bold mb-2">Need Subsidy</p>
          <p className="text-2xl font-bold text-red-900">{stats.needingSubsidy}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4"
        >
          <p className="text-xs text-green-700 uppercase font-bold mb-2">Self-Sufficient</p>
          <p className="text-2xl font-bold text-green-900">{stats.selfSufficient}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <p className="text-xs text-blue-700 uppercase font-bold mb-2">Needs Reclassification</p>
          <p className="text-2xl font-bold text-blue-900">{stats.needingReclassification}</p>
        </motion.div>
      </div>

      {/* Total Subsidy Needed Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-amber-700 uppercase font-bold mb-1">Total Annual Subsidy Budget Required</p>
            <p className="text-3xl font-black text-amber-900">
              ₱{(stats.totalSubsidyNeeded / 1000000).toFixed(2)}M
            </p>
          </div>
          <AlertCircle className="w-12 h-12 text-amber-600 flex-shrink-0" />
        </div>
      </motion.div>

      {/* Classification Details Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Classification Analysis by Parish</h3>
          <button
            onClick={() => setShowThresholdEditor(!showThresholdEditor)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider flex items-center gap-1"
          >
            <Info className="w-3 h-3" /> Edit Thresholds
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-bold text-gray-700 text-xs">Parish Name</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Annual Collections</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Current Class</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Recommended Class</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Status</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Subsidy Required</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700 text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {classificationAnalysis.map((parish, idx) => (
                <motion.tr
                  key={parish.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{parish.name}</td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    ₱{(parish.annualCollections / 1000000).toFixed(2)}M
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block bg-gray-200 text-gray-900 px-2 py-1 rounded text-xs font-bold">
                      {parish.currentClass}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                        parish.recommendedClass === 'Class A'
                          ? 'bg-emerald-100 text-emerald-900'
                          : parish.recommendedClass === 'Class B'
                          ? 'bg-blue-100 text-blue-900'
                          : parish.recommendedClass === 'Class C'
                          ? 'bg-yellow-100 text-yellow-900'
                          : 'bg-red-100 text-red-900'
                      }`}
                    >
                      {parish.recommendedClass}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parish.needsReclassification ? (
                      <span className="flex items-center justify-center gap-1 text-amber-700">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold">Needs Update</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1 text-green-700">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-bold">Current</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parish.subsidyNeeded ? (
                      <span className="text-red-700 font-bold">
                        ₱{(parish.subsidyAmount! / 1000000).toFixed(2)}M
                      </span>
                    ) : (
                      <span className="text-green-700 text-xs font-bold">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {parish.needsReclassification && (
                      <button
                        onClick={() => handleApplyClassification(parish.id, parish.recommendedClass)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Apply
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Threshold Editor */}
      {showThresholdEditor && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <h4 className="font-bold text-blue-900 mb-4">Classification Thresholds</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['classA', 'classB', 'classC', 'classD'] as const).map(cls => (
              <div key={cls}>
                <label className="text-xs font-bold text-blue-700 mb-1 block">
                  {cls.replace('class', 'Class ')} Minimum (₱)
                </label>
                <input
                  type="number"
                  value={thresholds[cls].min}
                  onChange={(e) =>
                    setThresholds({
                      ...thresholds,
                      [cls]: { ...thresholds[cls], min: Number(e.target.value) },
                    })
                  }
                  className="w-full px-2 py-1 border border-blue-200 rounded text-sm"
                />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
