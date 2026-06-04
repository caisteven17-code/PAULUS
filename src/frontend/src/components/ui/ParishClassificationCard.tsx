'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lock, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';
import { EntityClass } from '../../types';

export interface ClassificationData {
  currentClass: EntityClass;
  annualIncome: number;
  monthlyAverage: number;
  isSubsidized: boolean;
  subsidyLocked?: boolean;
  taxableIncome?: number;
  consistentlyHighCollections?: boolean;
}

interface ParishClassificationCardProps {
  data: ClassificationData;
  entityName?: string;
  onReclassifyClick?: () => void;
}

/**
 * Classification thresholds for determining entity class
 * Based on annual collections
 */
const CLASS_THRESHOLDS: Record<EntityClass, { min: number; tax: number }> = {
  'Class A': { min: 2500000, tax: 0.12 },
  'Class B': { min: 1500000, tax: 0.1 },
  'Class C': { min: 750000, tax: 0.08 },
  'Class D': { min: 250000, tax: 0.03 },
  'Class E': { min: 0, tax: 0.0 },
};

/**
 * Determines if a parish is performing beyond its class level
 * (potential for reclassification if subsidized)
 */
export function calculateSustainabilityStatus(
  currentClass: EntityClass,
  annualIncome: number,
  isSubsidized: boolean,
): {
  isSustainable: boolean;
  recommendedClass?: EntityClass;
  yearsConsistent?: number;
} {
  if (!isSubsidized) return { isSustainable: false };

  // Check if current income exceeds next class threshold
  const classOrder: EntityClass[] = ['Class E', 'Class D', 'Class C', 'Class B', 'Class A'];
  const currentIndex = classOrder.indexOf(currentClass);

  if (currentIndex === 3) {
    // Already Class A, no higher class
    return { isSustainable: false };
  }

  const nextClassIndex = currentIndex + 1;
  const nextClass = classOrder[nextClassIndex];
  const nextThreshold = CLASS_THRESHOLDS[nextClass].min;

  if (annualIncome >= nextThreshold) {
    return {
      isSustainable: true,
      recommendedClass: nextClass,
      yearsConsistent: 2, // Would need 2 years consistent performance
    };
  }

  return { isSustainable: false };
}

/**
 * Calculates diocesan tax based on class and income
 */
export function calculateDiocesesTax(classType: EntityClass, annualIncome: number): number {
  const rate = CLASS_THRESHOLDS[classType].tax;
  return annualIncome * rate;
}

export function ParishClassificationCard({
  data,
  entityName = 'Entity',
  onReclassifyClick,
}: ParishClassificationCardProps) {
  const sustainability = useMemo(
    () => calculateSustainabilityStatus(data.currentClass, data.annualIncome, data.isSubsidized),
    [data.currentClass, data.annualIncome, data.isSubsidized],
  );

  const diocesesTax = useMemo(
    () => calculateDiocesesTax(data.currentClass, data.annualIncome),
    [data.currentClass, data.annualIncome],
  );

  const nextThreshold = useMemo(() => {
    const classOrder: EntityClass[] = ['Class E', 'Class D', 'Class C', 'Class B', 'Class A'];
    const currentIndex = classOrder.indexOf(data.currentClass);
    if (currentIndex === 3) return null; // Already Class A
    const nextClass = classOrder[currentIndex + 1];
    return CLASS_THRESHOLDS[nextClass].min;
  }, [data.currentClass]);

  const incomeToNextClass = nextThreshold ? nextThreshold - data.annualIncome : null;
  const percentToNextClass = nextThreshold ? (data.annualIncome / nextThreshold) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Main Classification Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-gold-50 to-gold-100/50 border-b border-gold-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-gray-900">Classification & Subsidy Status</h3>
              <p className="text-sm text-gray-600">{entityName}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gold-600">{data.currentClass}</div>
              <p className="text-xs text-gray-600 uppercase font-bold">Current Class</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Subsidy Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              {data.subsidyLocked ? (
                <Lock className="w-5 h-5 text-red-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              )}
              <div>
                <p className="font-bold text-gray-900">{data.isSubsidized ? 'Subsidized Parish' : 'Non-Subsidized'}</p>
                <p className="text-sm text-gray-600">
                  {data.subsidyLocked
                    ? 'Locked to Class D (Diocese Policy)'
                    : data.isSubsidized
                      ? 'Receives diocesan financial support'
                      : 'Self-sustaining entity'}
                </p>
              </div>
            </div>
            {data.subsidyLocked && (
              <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">Locked</div>
            )}
          </div>

          {/* Financial Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 uppercase font-bold mb-1">Annual Collections</p>
              <p className="text-2xl font-bold text-blue-900">₱{(data.annualIncome / 1000000).toFixed(2)}M</p>
            </div>

            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-xs text-emerald-700 uppercase font-bold mb-1">Diocese Tax</p>
              <p className="text-2xl font-bold text-emerald-900">
                ₱{diocesesTax.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                {(CLASS_THRESHOLDS[data.currentClass].tax * 100).toFixed(0)}% of annual income
              </p>
            </div>
          </div>

          {/* Progress to Next Class */}
          {nextThreshold && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">Progress to Next Class Level</p>
                <p className="text-sm font-bold text-gray-900">{percentToNextClass.toFixed(0)}%</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(percentToNextClass, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="bg-gradient-to-r from-gold-400 to-gold-600 h-full"
                />
              </div>
              {incomeToNextClass && incomeToNextClass > 0 && (
                <p className="text-xs text-gray-600">
                  ₱{incomeToNextClass.toLocaleString('en-PH', { maximumFractionDigits: 0 })} needed to reach next class
                </p>
              )}
            </div>
          )}

          {/* Sustainability Alert for Subsidized Parishes */}
          {data.isSubsidized && sustainability.isSustainable && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg"
            >
              <div className="flex gap-3">
                <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-green-900">Sustainability Opportunity</p>
                  <p className="text-sm text-green-800 mt-1">
                    This {data.currentClass} entity has consistently demonstrated collections above the{' '}
                    {sustainability.recommendedClass} threshold. Consider reviewing subsidy status for potential
                    reclassification after {sustainability.yearsConsistent} years of sustained performance.
                  </p>
                  {onReclassifyClick && (
                    <button
                      onClick={onReclassifyClick}
                      className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                      Review Reclassification
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Classification Rules Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-bold text-blue-900">Classification Thresholds</p>
                <ul className="text-blue-800 space-y-1">
                  <li>
                    • <strong>Class A:</strong> ≥ ₱2.5M annual
                  </li>
                  <li>
                    • <strong>Class B:</strong> ≥ ₱1.5M annual
                  </li>
                  <li>
                    • <strong>Class C:</strong> ≥ ₱750K annual
                  </li>
                  <li>
                    • <strong>Class D:</strong> Below ₱750K (Typically subsidized)
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Subsidy Lock Explanation */}
          {data.subsidyLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-bold text-amber-900">Subsidy Lock Policy</p>
                  <p className="text-amber-800">
                    Class D (subsidized) parishes are automatically locked to their classification. To modify this
                    status, contact the Diocese Finance Office with supporting financial documentation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tax Implications Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-5 h-5 text-gold-600" />
          <h4 className="font-bold text-gray-900">Annual Diocese Tax Breakdown</h4>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Base Annual Collections</span>
            <span className="font-bold text-gray-900">
              ₱{data.annualIncome.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border-l-4 border-red-500">
            <span className="text-red-900 font-bold">
              Diocese Tax ({(CLASS_THRESHOLDS[data.currentClass].tax * 100).toFixed(0)}%)
            </span>
            <span className="font-bold text-red-900">
              -₱{diocesesTax.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border-l-4 border-emerald-500">
            <span className="text-emerald-900 font-bold">Net After Tax</span>
            <span className="font-bold text-emerald-900">
              ₱{(data.annualIncome - diocesesTax).toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
