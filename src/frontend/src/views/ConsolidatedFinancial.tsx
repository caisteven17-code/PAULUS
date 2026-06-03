'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { FileText, Download, Filter, TrendingUp, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../lib/format';

interface ConsolidatedRecord {
  period: string;
  totalCollections: number;
  totalDisbursements: number;
  netPosition: number;
  parishCount: number;
  schoolCount: number;
  seminaryCount: number;
}

interface EntitySummary {
  name: string;
  type: 'parish' | 'school' | 'seminary';
  collections: number;
  disbursements: number;
  netPosition: number;
  healthScore: number;
  trend: number; // percentage change
}

const COLORS = ['#1a472a', '#D4AF37', '#4F46E5', '#06B6D4', '#EC4899'];

export function ConsolidatedFinancial() {
  const [entityFilter, setEntityFilter] = useState<'all' | 'parish' | 'school' | 'seminary'>('all');
  const [viewType, setViewType] = useState<'summary' | 'detailed' | 'comparison'>('summary');

  // Mock consolidated data
  const mockConsolidatedData: ConsolidatedRecord[] = [
    {
      period: 'Jan',
      totalCollections: 24800000,
      totalDisbursements: 19200000,
      netPosition: 5600000,
      parishCount: 22,
      schoolCount: 5,
      seminaryCount: 5,
    },
    {
      period: 'Feb',
      totalCollections: 22950000,
      totalDisbursements: 18450000,
      netPosition: 4500000,
      parishCount: 22,
      schoolCount: 5,
      seminaryCount: 5,
    },
    {
      period: 'Mar',
      totalCollections: 23540000,
      totalDisbursements: 18720000,
      netPosition: 4820000,
      parishCount: 22,
      schoolCount: 5,
      seminaryCount: 5,
    },
    {
      period: 'Apr',
      totalCollections: 28600000,
      totalDisbursements: 20400000,
      netPosition: 8200000,
      parishCount: 22,
      schoolCount: 5,
      seminaryCount: 5,
    },
    {
      period: 'May',
      totalCollections: 24720000,
      totalDisbursements: 19560000,
      netPosition: 5160000,
      parishCount: 22,
      schoolCount: 5,
      seminaryCount: 5,
    },
  ];

  const mockEntityData: EntitySummary[] = [
    {
      name: 'San Pablo Cathedral',
      type: 'parish',
      collections: 1250000,
      disbursements: 950000,
      netPosition: 300000,
      healthScore: 91.4,
      trend: 8.5,
    },
    {
      name: 'St. James the Apostle (Paete)',
      type: 'parish',
      collections: 650000,
      disbursements: 580000,
      netPosition: 70000,
      healthScore: 75.6,
      trend: -2.1,
    },
    {
      name: 'Liceo de San Pablo',
      type: 'school',
      collections: 850000,
      disbursements: 720000,
      netPosition: 130000,
      healthScore: 69.4,
      trend: 3.2,
    },
    {
      name: 'St. Peter\'s College Seminary',
      type: 'seminary',
      collections: 420000,
      disbursements: 350000,
      netPosition: 70000,
      healthScore: 59.3,
      trend: 1.8,
    },
    {
      name: 'San Isidro Labrador (Biñan)',
      type: 'parish',
      collections: 1100000,
      disbursements: 890000,
      netPosition: 210000,
      healthScore: 88.7,
      trend: 5.3,
    },
    {
      name: 'Liceo de Calamba',
      type: 'school',
      collections: 720000,
      disbursements: 610000,
      netPosition: 110000,
      healthScore: 66.7,
      trend: -1.5,
    },
  ];

  const filteredEntityData = useMemo(() => {
    return entityFilter === 'all'
      ? mockEntityData
      : mockEntityData.filter(e => e.type === entityFilter);
  }, [entityFilter]);

  const summaryStats = useMemo(() => {
    const latest = mockConsolidatedData[mockConsolidatedData.length - 1];
    const previous = mockConsolidatedData[mockConsolidatedData.length - 2];

    return {
      totalCollections: latest.totalCollections,
      totalDisbursements: latest.totalDisbursements,
      netPosition: latest.netPosition,
      collectionsTrend: ((latest.totalCollections - previous.totalCollections) / previous.totalCollections) * 100,
      netTrend: ((latest.netPosition - previous.netPosition) / previous.netPosition) * 100,
      totalEntities: latest.parishCount + latest.schoolCount + latest.seminaryCount,
    };
  }, []);

  const entityDistribution = useMemo(() => {
    const data = [
      { name: 'Parishes', value: mockEntityData.filter(e => e.type === 'parish').length },
      { name: 'Schools', value: mockEntityData.filter(e => e.type === 'school').length },
      { name: 'Seminaries', value: mockEntityData.filter(e => e.type === 'seminary').length },
    ];
    return data;
  }, []);

  const handleExport = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `consolidated-financial-statement-${timestamp}.csv`;
    
    let csv = 'Period,Total Collections,Total Disbursements,Net Position,Parishes,Schools,Seminaries\n';
    mockConsolidatedData.forEach(record => {
      csv += `${record.period},"${record.totalCollections}","${record.totalDisbursements}","${record.netPosition}",${record.parishCount},${record.schoolCount},${record.seminaryCount}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Financial Statement</h1>
              <p className="text-slate-600">Diocese consolidated view - May 2026</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Total Collections',
              value: formatCurrency(summaryStats.totalCollections),
              trend: summaryStats.collectionsTrend,
              icon: DollarSign,
              color: 'emerald',
            },
            {
              label: 'Total Disbursements',
              value: formatCurrency(summaryStats.totalDisbursements),
              trend: -2.3,
              icon: DollarSign,
              color: 'amber',
            },
            {
              label: 'Net Position',
              value: formatCurrency(summaryStats.netPosition),
              trend: summaryStats.netTrend,
              icon: TrendingUp,
              color: 'blue',
            },
            {
              label: 'Total Entities',
              value: summaryStats.totalEntities.toString(),
              trend: 0,
              icon: Filter,
              color: 'purple',
            },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-slate-600 text-sm font-medium">{stat.label}</p>
                <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              {stat.trend !== 0 && (
                <p className={`text-xs mt-2 ${stat.trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stat.trend > 0 ? '↑' : '↓'} {Math.abs(stat.trend).toFixed(1)}% from last period
                </p>
              )}
            </motion.div>
          ))}
        </div>

        {/* View Controls */}
        <div className="flex gap-2 mb-6">
          {(['summary', 'detailed', 'comparison'] as const).map(type => (
            <button
              key={type}
              onClick={() => setViewType(type)}
              className={`px-4 py-2 rounded-lg transition-all ${
                viewType === type
                  ? 'bg-purple-500 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {/* Main Content */}
        {viewType === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Collections Trend */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-4">Collections Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mockConsolidatedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="totalCollections" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Net Position Trend */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-4">Net Position Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockConsolidatedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Bar dataKey="netPosition" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Entity Distribution */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-4">Entity Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={entityDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {entityDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Collections vs Disbursements */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-4">Collections vs Disbursements</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockConsolidatedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="totalCollections" fill="#10b981" />
                  <Bar dataKey="totalDisbursements" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        )}

        {/* Detailed View */}
        {viewType === 'detailed' && (
          <div className="space-y-6">
            {/* Entity Filter */}
            <div className="flex gap-2">
              {(['all', 'parish', 'school', 'seminary'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setEntityFilter(type)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    entityFilter === type
                      ? 'bg-purple-500 text-white'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* Entity Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Entity</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Collections</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Disbursements</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Net</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Health</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntityData.map((entity, idx) => (
                      <tr key={idx} className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-900 font-medium">
                          <div>
                            <p>{entity.name}</p>
                            <p className="text-xs text-slate-500 mt-1 capitalize">{entity.type}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-900">{formatCurrency(entity.collections)}</td>
                        <td className="px-6 py-4 text-right text-slate-900">{formatCurrency(entity.disbursements)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-emerald-600">{formatCurrency(entity.netPosition)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-900 text-xs font-semibold">
                            {entity.healthScore.toFixed(1)}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-semibold ${entity.trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {entity.trend > 0 ? '↑' : '↓'} {Math.abs(entity.trend).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Comparison View */}
        {viewType === 'comparison' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-slate-200 p-6"
          >
            <h3 className="text-lg font-bold text-slate-900 mb-6">Entity Comparison</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={filteredEntityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="collections" fill="#10b981" />
                <Bar dataKey="disbursements" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </div>
    </div>
  );
}
