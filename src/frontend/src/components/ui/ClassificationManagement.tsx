'use client';

import React, { useState, useMemo } from 'react';
import { Lock, Unlock, AlertTriangle, CheckCircle, Eye, Edit2 } from 'lucide-react';
import { motion } from 'motion/react';
import { EntityClass } from '../../types';

export interface ClassificationRecord {
  id: string;
  entityName: string;
  currentClass: EntityClass;
  annualIncome: number;
  isSubsidized: boolean;
  subsidyLocked: boolean;
  lastReviewed?: string;
  recommendedAction?: 'reclassify' | 'none' | 'review';
}

interface ClassificationManagementProps {
  classifications: ClassificationRecord[];
  onUpdateClassification?: (id: string, updates: Partial<ClassificationRecord>) => void;
  onToggleLock?: (id: string, locked: boolean) => void;
}

export function ClassificationManagement({
  classifications,
  onUpdateClassification,
  onToggleLock,
}: ClassificationManagementProps) {
  const [filter, setFilter] = useState<'all' | 'subsidized' | 'sustainable' | 'locked'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'income' | 'class'>('income');

  const filteredAndSorted = useMemo(() => {
    let filtered = classifications;

    if (filter === 'subsidized') {
      filtered = filtered.filter((c) => c.isSubsidized);
    } else if (filter === 'sustainable') {
      filtered = filtered.filter((c) => c.recommendedAction === 'reclassify');
    } else if (filter === 'locked') {
      filtered = filtered.filter((c) => c.subsidyLocked);
    }

    if (sortBy === 'name') {
      filtered.sort((a, b) => a.entityName.localeCompare(b.entityName));
    } else if (sortBy === 'income') {
      filtered.sort((a, b) => b.annualIncome - a.annualIncome);
    } else if (sortBy === 'class') {
      const classOrder: Record<string, number> = {
        'Class A': 5,
        'Class B': 4,
        'Class C': 3,
        'Class D': 2,
        'Class E': 1,
      };
      filtered.sort((a, b) => (classOrder[b.currentClass] ?? 0) - (classOrder[a.currentClass] ?? 0));
    }

    return filtered;
  }, [classifications, filter, sortBy]);

  const stats = useMemo(
    () => ({
      total: classifications.length,
      subsidized: classifications.filter((c) => c.isSubsidized).length,
      sustainable: classifications.filter((c) => c.recommendedAction === 'reclassify').length,
      locked: classifications.filter((c) => c.subsidyLocked).length,
    }),
    [classifications],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-gray-600 uppercase font-bold mb-2 leading-tight">Total Entities</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-blue-700 uppercase font-bold mb-2 leading-tight">Subsidized</p>
          <p className="text-xl md:text-2xl font-bold text-blue-900">{stats.subsidized}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-green-50 border border-green-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-green-700 uppercase font-bold mb-2 leading-tight">Sustainable</p>
          <p className="text-xl md:text-2xl font-bold text-green-900">{stats.sustainable}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4"
        >
          <p className="text-[9px] md:text-xs text-amber-700 uppercase font-bold mb-2 leading-tight">Locked</p>
          <p className="text-xl md:text-2xl font-bold text-amber-900">{stats.locked}</p>
        </motion.div>
      </div>

      {/* Filters & Sort */}
      <div className="space-y-2 md:space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'subsidized', 'sustainable', 'locked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-bold text-xs md:text-sm transition-all hover:scale-105 ${
                filter === f ? 'bg-gold-500 text-black shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {f === 'all'
                ? 'All Entities'
                : f === 'subsidized'
                  ? 'Subsidized'
                  : f === 'sustainable'
                    ? 'Sustainable'
                    : 'Locked'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 mb-1.5 block">Sort By:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all text-sm w-full md:w-auto"
          >
            <option value="name">Entity Name</option>
            <option value="income">Annual Income</option>
            <option value="class">Classification</option>
          </select>
        </div>
      </div>

      {/* Classification Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-base hover:shadow-md transition-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] md:text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-2 md:px-4 py-3 text-left font-bold text-gray-700">Entity</th>
                <th className="px-2 md:px-4 py-3 text-left font-bold text-gray-700">Class</th>
                <th className="hidden md:table-cell px-2 md:px-4 py-3 text-right font-bold text-gray-700">Income</th>
                <th className="px-2 md:px-4 py-3 text-center font-bold text-gray-700">Status</th>
                <th className="px-2 md:px-4 py-3 text-center font-bold text-gray-700">Lock</th>
                <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-center font-bold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map((record, idx) => (
                <motion.tr
                  key={record.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-2 md:px-4 py-3">
                    <div>
                      <p className="font-bold text-gray-900 text-[11px] md:text-sm">{record.entityName}</p>
                      {record.lastReviewed && (
                        <p className="text-[9px] md:text-xs text-gray-500">
                          Reviewed: {new Date(record.lastReviewed).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-2 md:px-4 py-3">
                    <span className="inline-block px-2 md:px-3 py-1 bg-gold-100 text-gold-900 rounded-full text-[10px] md:text-xs font-bold">
                      {record.currentClass}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-2 md:px-4 py-3 text-right font-bold text-gray-900 text-[11px] md:text-sm">
                    ₱{(record.annualIncome / 1000000).toFixed(2)}M
                  </td>
                  <td className="px-2 md:px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {record.isSubsidized ? (
                        <>
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="hidden sm:inline text-[10px] md:text-xs font-bold text-blue-700">Sub.</span>
                          <span className="sm:hidden text-[10px] font-bold text-blue-700">S</span>
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="hidden sm:inline text-[10px] md:text-xs font-bold text-green-700">
                            Indep.
                          </span>
                          <span className="sm:hidden text-[10px] font-bold text-green-700">I</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 md:px-4 py-3 text-center">
                    <button
                      onClick={() => onToggleLock?.(record.id, !record.subsidyLocked)}
                      title={record.subsidyLocked ? 'Unlock' : 'Lock'}
                      className={`p-1.5 md:p-2 rounded-lg transition-all hover:scale-110 ${
                        record.subsidyLocked
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {record.subsidyLocked ? (
                        <Lock className="w-3.5 md:w-4 h-3.5 md:h-4" />
                      ) : (
                        <Unlock className="w-3.5 md:w-4 h-3.5 md:h-4" />
                      )}
                    </button>
                  </td>
                  <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {record.recommendedAction === 'reclassify' && (
                        <button
                          onClick={() => onUpdateClassification?.(record.id, { recommendedAction: 'none' })}
                          title="Review for reclassification"
                          className="p-1.5 md:p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors hover:scale-110"
                        >
                          <AlertTriangle className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </button>
                      )}
                      <button
                        title="View details"
                        className="p-1.5 md:p-2 text-gray-600 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                      >
                        <Eye className="w-3.5 md:w-4 h-3.5 md:h-4" />
                      </button>
                      <button
                        title="Edit"
                        className="p-1.5 md:p-2 text-gray-600 hover:bg-amber-50 rounded-lg transition-colors hover:scale-110"
                      >
                        <Edit2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSorted.length === 0 && (
          <div className="flex items-center justify-center py-8 md:py-12 text-gray-500 px-4">
            <p className="text-sm md:text-base text-center">No entities found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 md:p-5 space-y-2 md:space-y-3">
        <p className="font-bold text-gray-900 text-sm md:text-base">How to Use Classification Management:</p>
        <ul className="text-[11px] md:text-xs text-gray-700 space-y-1 md:space-y-1.5">
          <li>
            🔒 <strong>Locked:</strong> Class D subsidized parishes locked by policy
          </li>
          <li>
            ⚠️ <strong>Sustainable:</strong> Entities showing income above current class threshold
          </li>
          <li>
            📊 <strong>Filter:</strong> View specific groups quickly
          </li>
          <li>
            💾 <strong>Last Reviewed:</strong> Track when classification was last audited
          </li>
        </ul>
      </div>
    </div>
  );
}
