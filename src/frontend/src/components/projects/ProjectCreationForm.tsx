'use client';

import React, { useState } from 'react';
import { X, Upload, Calendar, Target, FileText, User, Tag, Info, Check, ChevronDown, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, ProjectCategory } from '../../types';

interface ProjectCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (project: Omit<Project, 'id' | 'currentAmount' | 'healthScore' | 'successProbability' | 'recommendation' | 'entityId' | 'entityType'>) => void;
}

export function ProjectCreationForm({ isOpen, onClose, onSubmit }: ProjectCreationFormProps) {
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
    status: 'active' as const
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Mock API call
    setTimeout(() => {
      onSubmit({
        ...formData,
        targetAmount: Number(formData.targetAmount),
        coverImage: imagePreview || undefined
      });
      setIsSubmitting(false);
      onClose();
    }, 1500);
  };

  const categories: ProjectCategory[] = [
    'Building/Construction', 'Equipment', 'Programs/Outreach', 
    'Education', 'Emergency/Relief', 'Liturgical', 'Operational'
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
                <p className="text-sm text-gray-500 font-medium mt-1">Define your fundraising goal and project details.</p>
              </div>
              <button 
                onClick={onClose}
                className="w-12 h-12 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all hover:rotate-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto scrollbar-thin">
              {/* Image Upload */}
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  Visual Identity
                </label>
                <div className="relative group">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className={`w-full h-52 rounded-3xl border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center gap-3 overflow-hidden ${imagePreview ? 'border-gold-500 bg-gold-50/5' : 'border-gray-200 bg-gray-50 group-hover:border-gold-400 group-hover:bg-gold-50/10'}`}>
                    {imagePreview ? (
                      <div className="relative w-full h-full group/preview">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover/preview:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-white text-xs font-bold tracking-widest uppercase">Change Image</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-gold-600 group-hover:scale-110 transition-all duration-500">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-500 group-hover:text-gold-700 transition-colors">Upload Cover Image</p>
                          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">JPG, PNG up to 5MB</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    Project Name
                  </label>
                  <input 
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Church Roof Repair"
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
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
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
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
                    Target (₱)
                  </label>
                  <input 
                    type="number"
                    required
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-base font-serif font-bold focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Start Date
                  </label>
                  <input 
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
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
                  disabled={isSubmitting}
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
