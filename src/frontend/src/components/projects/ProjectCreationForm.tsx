'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Calendar,
  Target,
  FileText,
  User,
  Tag,
  Info,
  Check,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EntityType, Project, ProjectCategory } from '../../types';

export interface ProjectInstitutionOption {
  id: string;
  name: string;
  type: EntityType;
}

interface ProjectCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  currentInstitution: ProjectInstitutionOption | null;
  onSubmit: (
    project: Omit<Project, 'id' | 'currentAmount' | 'healthScore' | 'successProbability' | 'recommendation'>,
  ) => Promise<void> | void;
}

export function ProjectCreationForm({
  isOpen,
  onClose,
  currentInstitution,
  onSubmit,
}: ProjectCreationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fundUsage: '',
    targetAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    category: 'Building/Construction' as ProjectCategory,
    beneficiaries: '',
    contactPerson: '',
    status: 'active' as const,
    entityId: '',
    entityName: '',
    entityType: 'parish' as EntityType,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentInstitution) return;
    setFormData((prev) => ({
      ...prev,
      entityId: currentInstitution.id,
      entityName: currentInstitution.name,
      entityType: currentInstitution.type,
    }));
  }, [currentInstitution, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!currentInstitution) return;
    if (!formData.name.trim() || !formData.targetAmount || !formData.startDate) return;
    setIsSubmitting(true);

    try {
      await onSubmit({
        ...formData,
        entityId: currentInstitution.id,
        entityName: currentInstitution.name,
        entityType: currentInstitution.type,
        targetAmount: Number(formData.targetAmount),
      });
      setIsSubmitting(false);
      onClose();
    } catch (error) {
      console.error('Failed to create project:', error);
      setIsSubmitting(false);
    }
  };

  const categories: ProjectCategory[] = [
    'Building/Construction',
    'Equipment',
    'Programs/Outreach',
    'Education',
    'Emergency/Relief',
    'Liturgical',
    'Operational',
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden my-8"
          >
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h2 className="text-2xl font-serif font-bold text-church-black tracking-tight">Create New Project</h2>
                <p className="text-sm text-gray-500 font-medium mt-1">
                  Define your fundraising goal and project details.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-12 h-12 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all hover:rotate-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Church Roof Repair"
                    className={`w-full px-5 py-4 bg-gray-50/50 border rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:bg-white transition-all placeholder:text-gray-300 ${
                      submitted && !formData.name.trim()
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                        : 'border-gray-200 focus:border-gold-500 focus:ring-gold-500/10'
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Info className="w-3.5 h-3.5" />
                    Category
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as ProjectCategory })}
                      className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Project Description
                </label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed explanation of what the project is for..."
                  rows={4}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all resize-none placeholder:text-gray-300"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" />
                  Fund Usage
                </label>
                <textarea
                  required
                  value={formData.fundUsage}
                  onChange={(e) => setFormData({ ...formData, fundUsage: e.target.value })}
                  placeholder="Where will the funds be used specifically?"
                  rows={2}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all resize-none placeholder:text-gray-300"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Target className="w-3.5 h-3.5" />
                    Target (₱) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    placeholder="0.00"
                    className={`w-full px-5 py-4 bg-gray-50/50 border rounded-2xl text-base font-serif font-bold focus:outline-none focus:ring-4 focus:bg-white transition-all placeholder:text-gray-300 ${
                      submitted && !formData.targetAmount
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                        : 'border-gray-200 focus:border-gold-500 focus:ring-gold-500/10'
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className={`w-full px-5 py-4 bg-gray-50/50 border rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:bg-white transition-all ${
                      submitted && !formData.startDate
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                        : 'border-gray-200 focus:border-gold-500 focus:ring-gold-500/10'
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    min={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    Beneficiaries
                  </label>
                  <input
                    type="text"
                    value={formData.beneficiaries}
                    onChange={(e) => setFormData({ ...formData, beneficiaries: e.target.value })}
                    placeholder="Who will benefit?"
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="Parish staff contact"
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                  />
                </div>
              </div>

              <div className="pt-8 border-t border-gray-100 flex gap-4 sticky bottom-0 bg-white pb-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 px-6 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !currentInstitution}
                  className="flex-[2] py-4 px-6 bg-gold-500 text-church-green-dark rounded-2xl text-sm font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-church-green-dark/30 border-t-church-green-dark rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      CREATE PROJECT
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
