'use client';

import React, { useState } from 'react';
import { X, DollarSign, Calendar, User, CreditCard, FileText, Check, ChevronDown, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../../lib/format';
import { Donation } from '../../types';

interface DonationEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (donation: Omit<Donation, 'id'>) => void;
  projectId: string;
  projectName: string;
}

export function DonationEntryModal({ isOpen, onClose, onSubmit, projectId, projectName }: DonationEntryModalProps) {
  const [formData, setFormData] = useState({
    donorName: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash' as Donation['paymentMethod'],
    receiptProofName: '',
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Mock API call
    setTimeout(() => {
      onSubmit({
        projectId,
        donorName: formData.donorName || 'Anonymous',
        amount: Number(formData.amount),
        date: formData.date,
        paymentMethod: formData.paymentMethod,
        receiptProofName: formData.receiptProofName || undefined,
        notes: formData.notes
      });
      setIsSubmitting(false);
      setFormData({
        donorName: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        receiptProofName: '',
        notes: ''
      });
      onClose();
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-20 shrink-0">
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-serif font-bold text-church-black tracking-tight truncate">Record Donation</h2>
                <p className="text-xs md:text-sm text-gray-500 font-medium mt-1 truncate">Project: {projectName}</p>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all hover:rotate-90 shrink-0 ml-4"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    Donor Name
                  </label>
                  <input 
                    type="text"
                    value={formData.donorName}
                    onChange={(e) => setFormData({ ...formData, donorName: e.target.value })}
                    placeholder="Anonymous"
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5" />
                    Amount (₱)
                  </label>
                  <div className="space-y-3">
                    <input 
                      type="number"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-base font-serif font-bold focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all placeholder:text-gray-300"
                    />
                    <div className="flex flex-wrap gap-2">
                      {[500, 1000, 5000, 10000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setFormData({ ...formData, amount: amt.toString() })}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            formData.amount === amt.toString() 
                              ? 'bg-gold-500 border-gold-500 text-church-green-dark shadow-md shadow-gold-500/20' 
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gold-300 hover:text-gold-600'
                          }`}
                        >
                          {formatCurrency(amt)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      Date Received
                    </label>
                  <input 
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    Payment Method
                  </label>
                  <div className="relative">
                    <select 
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as Donation['paymentMethod'] })}
                      className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all appearance-none cursor-pointer"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                      <option value="Online">Online</option>
                      <option value="Bank Transfer">Bank Transfer</option>
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
                  Notes
                </label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional information..."
                  rows={3}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-500 focus:bg-white transition-all resize-none placeholder:text-gray-300"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gold-700 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  Proof Of Receipt
                </label>
                <div className="rounded-2xl border border-gold-100/50 bg-gold-50/30 p-4">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setFormData({ ...formData, receiptProofName: e.target.files?.[0]?.name || '' })}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2.5 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-gold-700 hover:file:bg-gold-100"
                  />
                  <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    {formData.receiptProofName ? `Selected: ${formData.receiptProofName}` : 'Attach a receipt image or PDF if available'}
                  </p>
                </div>
              </div>

              <div className="pt-4 md:pt-8 flex flex-col-reverse sm:flex-row gap-3 md:gap-4">
                <button 
                  type="button"
                  onClick={onClose}
                  className="w-full sm:flex-1 py-4 px-6 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:flex-[2] py-4 px-6 bg-gold-500 text-church-green-dark rounded-2xl text-sm font-bold hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-church-green-dark/30 border-t-church-green-dark rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      RECORD DONATION
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
