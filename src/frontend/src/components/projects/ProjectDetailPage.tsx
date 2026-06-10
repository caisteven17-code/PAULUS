'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Calendar,
  Target,
  TrendingUp,
  Users,
  Phone,
  MapPin,
  FileText,
  History,
  CheckCircle2,
  User,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../../lib/format';
import { FinancialRecord, Project, Donation, ProjectExpense } from '../../types';
import { dataService } from '../../services/dataService';
import { DonationEntryModal } from './DonationEntryModal';
import { ExpenseEntryModal } from './ExpenseEntryModal';

interface ProjectDetailPageProps {
  project: Project;
  donations: Donation[];
  expenses: ProjectExpense[];
  onBack: () => void;
  onAddDonation: (donation: Omit<Donation, 'id'>) => void;
  onAddExpense: (expense: Omit<ProjectExpense, 'id'>) => void;
  onCloneProject: (project: Project) => void;
  role?: string;
  canManageProjects?: boolean;
}

export function ProjectDetailPage({
  project,
  donations,
  expenses,
  onBack,
  onAddDonation,
  onAddExpense,
  onCloneProject,
  role,
  canManageProjects,
}: ProjectDetailPageProps) {
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [historicalRecords, setHistoricalRecords] = useState<FinancialRecord[]>([]);
  const progress = (project.currentAmount / project.targetAmount) * 100;
  const canRecordProjectEntries =
    canManageProjects !== undefined
      ? canManageProjects
      : role === 'priest' || role === 'school' || role === 'seminary' || role === 'bishop' || role === 'admin';
  const totalDisbursements = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const availableBalance = project.currentAmount - totalDisbursements;

  useEffect(() => {
    let active = true;

    const loadRecords = async () => {
      if (project.entityType === 'diocese') {
        if (active) setHistoricalRecords([]);
        return;
      }

      const records = await dataService.getRecords(project.entityId, project.entityType);
      if (active) {
        setHistoricalRecords(records);
      }
    };

    loadRecords();

    return () => {
      active = false;
    };
  }, [project.entityId, project.entityType]);

  const forecastSuccess = useMemo(() => {
    if (project.targetAmount <= 0) return 0;

    const now = new Date();
    const deadline = new Date(project.endDate);
    const monthsRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));

    const recentRecords = historicalRecords.slice(-6);
    const averageCollections =
      recentRecords.length > 0
        ? recentRecords.reduce((sum, record) => sum + record.collections, 0) / recentRecords.length
        : 0;

    const donationMonths = new Set(donations.map((donation) => donation.date.slice(0, 7)));
    const averageDonationRunRate = donationMonths.size > 0 ? project.currentAmount / donationMonths.size : 0;

    const baselineMonthlyCapacity = Math.max(averageDonationRunRate, averageCollections * 0.06);
    const seasonalMonths = ['04', '05', '12'];
    const deadlineMonth = String(deadline.getMonth() + 1).padStart(2, '0');
    const seasonalAdjustment = seasonalMonths.includes(deadlineMonth) ? 1.08 : 1;
    const projectedAdditional = baselineMonthlyCapacity * monthsRemaining * seasonalAdjustment;
    const projectedTotal = project.currentAmount + projectedAdditional;

    return Math.min(100, Math.round((projectedTotal / project.targetAmount) * 100));
  }, [donations, historicalRecords, project.currentAmount, project.endDate, project.targetAmount]);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-50 border-green-100';
      case 'completed':
        return 'text-blue-600 bg-blue-50 border-blue-100';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-20">
      {/* Editorial Hero Section */}
      <div className="relative min-h-[500px] w-full overflow-hidden bg-church-green-dark py-16 flex items-center">
        <div className="absolute inset-0 opacity-40 mix-blend-overlay">
          <img
            src={`https://picsum.photos/seed/${project.id}/1920/1080`}
            alt={project.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-church-green-dark via-church-green-dark/40 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 md:px-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all group"
              >
                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
              </button>
              <div
                className={`px-4 py-1.5 rounded-full border text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-md ${getStatusColor(project.status)}`}
              >
                {project.status}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-gold-500 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] block">
                {project.category}
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-serif font-bold text-white leading-[0.9] tracking-tight">
                {project.name}
              </h1>
            </div>

            <p className="text-sm md:text-base text-white/70 font-medium leading-relaxed max-w-2xl">
              {project.description}
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 items-center gap-6 sm:gap-12 pt-8 border-t border-white/10">
              {[
                { label: 'Target Goal', value: formatCurrency(project.targetAmount), color: 'text-white' },
                { label: 'Raised to Date', value: formatCurrency(project.currentAmount), color: 'text-gold-500' },
                { label: 'Donors', value: donations.length.toString(), color: 'text-white' },
                { label: 'Success Forecast', value: `${forecastSuccess}%`, color: 'text-white' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="space-y-1"
                >
                  <span className="text-[9px] md:text-[10px] text-white/40 font-bold uppercase tracking-[0.3em] block">
                    {stat.label}
                  </span>
                  <p className={`text-xl sm:text-2xl md:text-3xl font-serif font-bold ${stat.color} tracking-tight`}>
                    {stat.value}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-16 py-8 md:py-12 relative z-20">
        <div className="space-y-8 md:space-y-12">
          {/* Main Content Column */}
          <div className="space-y-8 md:space-y-12">
            {/* Progress Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 shadow-2xl shadow-church-black/5 border border-gray-100 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 hidden sm:block">
                <TrendingUp className="w-32 h-32" />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 relative z-10 gap-4 sm:gap-0">
                <div className="space-y-1.5">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-church-black">Project Funding Record</h3>
                  <p className="text-xs md:text-sm text-gray-400 font-medium">
                    Recorded receipts against the approved project target.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-4xl md:text-5xl font-serif font-bold text-gold-600 leading-none">
                    {Math.round(progress)}%
                  </span>
                  <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    of target reached
                  </p>
                </div>
              </div>

              <div className="h-4 md:h-5 bg-gray-50 rounded-full overflow-hidden shadow-inner mb-10 relative z-10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 2, ease: 'circOut' }}
                  className="h-full bg-gradient-to-r from-gold-400 via-gold-500 to-gold-600 rounded-full shadow-lg relative"
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </motion.div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
                <div className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100/50 group hover:bg-white hover:shadow-xl hover:shadow-gold-500/5 transition-all duration-500 h-full flex flex-col">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white flex items-center justify-center text-gold-600 mb-5 shadow-sm group-hover:scale-110 transition-transform shrink-0">
                    <Calendar className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <span className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] block mb-2">
                    Timeline
                  </span>
                  <p className="text-sm font-bold text-church-black leading-tight flex-1">
                    {new Date(project.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} —{' '}
                    {new Date(project.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100/50 group hover:bg-white hover:shadow-xl hover:shadow-gold-500/5 transition-all duration-500 h-full flex flex-col">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white flex items-center justify-center text-gold-600 mb-5 shadow-sm group-hover:scale-110 transition-transform shrink-0">
                    <Target className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <span className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] block mb-2">
                    Fund Allocation
                  </span>
                  <p className="text-sm font-bold text-church-black leading-tight flex-1">{project.fundUsage}</p>
                </div>
                <div className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100/50 group hover:bg-white hover:shadow-xl hover:shadow-gold-500/5 transition-all duration-500 h-full flex flex-col sm:col-span-2 lg:col-span-1">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white flex items-center justify-center text-gold-600 mb-5 shadow-sm group-hover:scale-110 transition-transform shrink-0">
                    <Users className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <span className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] block mb-2">
                    Beneficiaries
                  </span>
                  <p className="text-sm font-bold text-church-black leading-tight flex-1">
                    {project.beneficiaries || 'Parish Community'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 relative z-10">
                <div className="rounded-3xl border border-gray-100 bg-gray-50/50 p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Recorded Donations</p>
                  <p className="mt-3 text-2xl font-serif font-bold text-church-black">
                    {formatCurrency(project.currentAmount)}
                  </p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-gray-50/50 p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                    Recorded Disbursements
                  </p>
                  <p className="mt-3 text-2xl font-serif font-bold text-church-black">
                    {formatCurrency(totalDisbursements)}
                  </p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-gray-50/50 p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Available Balance</p>
                  <p
                    className={`mt-3 text-2xl font-serif font-bold ${availableBalance < 0 ? 'text-rose-600' : 'text-church-green-dark'}`}
                  >
                    {formatCurrency(availableBalance)}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Project Details Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-4 h-full flex flex-col">
                <div className="flex items-center gap-3 text-gold-600 shrink-0">
                  <MapPin className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">Location & Contact</h4>
                </div>
                <div className="space-y-4 flex-1">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Contact Person</p>
                      <p className="text-sm font-bold text-church-black">{project.contactPerson || 'Parish Office'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Contact Number</p>
                      <p className="text-sm font-bold text-church-black">+63 (02) 8123 4567</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-4 h-full flex flex-col">
                <div className="flex items-center gap-3 text-gold-600 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">Key Milestones</h4>
                </div>
                <div className="space-y-4 flex-1">
                  {[
                    { label: 'Project Initiation', status: 'Completed', date: 'Jan 2025' },
                    { label: 'Fundraising Launch', status: 'Active', date: 'Feb 2025' },
                    { label: 'Procurement Phase', status: 'Pending', date: 'Apr 2025' },
                  ].map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${m.status === 'Completed' ? 'bg-church-green' : m.status === 'Active' ? 'bg-gold-500 animate-pulse' : 'bg-gray-300'}`}
                        />
                        <span className="text-sm font-bold text-church-black">{m.label}</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">{m.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Donation History */}
            <div className="space-y-6 md:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-church-black tracking-tight">
                    Recent Contributions
                  </h3>
                  <p className="text-xs md:text-sm text-gray-400 font-medium">
                    Real-time audit log of all project support and donations
                  </p>
                </div>
                {canRecordProjectEntries && (
                  <motion.button
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsDonationModalOpen(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-church-green-dark text-white rounded-2xl text-[10px] font-bold tracking-[0.2em] hover:bg-church-green transition-all shadow-xl shadow-church-green-dark/20"
                  >
                    <Plus className="w-4 h-4" />
                    RECORD DONATION
                  </motion.button>
                )}
              </div>

              <div className="bg-white rounded-[24px] md:rounded-[40px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-church-black/5 transition-all duration-500">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Donor Identity
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Contribution
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Timestamp
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Channel
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {donations.length > 0 ? (
                          [...donations]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((donation, idx) => (
                              <motion.tr
                                key={donation.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="hover:bg-gold-50/30 transition-all group cursor-default"
                              >
                                <td className="px-6 md:px-10 py-7">
                                  <div className="flex items-center gap-4 md:gap-5">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-church-black text-white flex items-center justify-center font-serif font-bold text-base md:text-lg group-hover:bg-gold-500 group-hover:text-church-green-dark transition-all duration-500 shadow-lg shadow-church-black/10 shrink-0">
                                      {donation.donorName?.charAt(0) ?? '?'}
                                    </div>
                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-church-black block tracking-tight">
                                        {donation.donorName}
                                      </span>
                                      {donation.notes && (
                                        <span className="text-[9px] text-gray-400 font-medium block max-w-[160px] truncate" title={donation.notes}>
                                          {donation.notes}
                                        </span>
                                      )}
                                      {donation.receiptProofName && (
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
                                          <a
                                            href={donation.receiptProofName}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[9px] font-bold text-gold-600 uppercase tracking-widest hover:text-gold-800 underline underline-offset-2"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            View Receipt
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <div className="flex flex-col">
                                    <span className="text-base md:text-lg font-serif font-bold text-church-green-dark tracking-tight">
                                      {formatCurrency(donation.amount)}
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                      PHP Currency
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-church-black font-bold tracking-tight">
                                      {new Date(donation.date).toLocaleDateString(undefined, {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                      Transaction Date
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <div className="flex items-center justify-between">
                                    <span className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-widest group-hover:bg-church-black group-hover:text-white transition-all duration-300 shadow-sm">
                                      {donation.paymentMethod}
                                    </span>
                                    <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gold-100 rounded-lg text-gold-600">
                                      <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 md:px-10 py-20 md:py-32 text-center">
                              <div className="flex flex-col items-center gap-6">
                                <div className="w-20 h-20 md:w-24 md:h-24 bg-gray-50 rounded-[24px] md:rounded-[32px] flex items-center justify-center text-gray-200 border border-dashed border-gray-200">
                                  <History className="w-8 h-8 md:w-10 md:h-10" />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-lg md:text-xl font-serif font-bold text-church-black">
                                    No contributions recorded
                                  </p>
                                  <p className="text-xs md:text-sm text-gray-400 max-w-xs mx-auto">
                                    Be the first to record a receipt for this project.
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6 md:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-church-black tracking-tight">
                    Recorded Disbursements
                  </h3>
                  <p className="text-xs md:text-sm text-gray-400 font-medium">
                    Expense and payout log for this project.
                  </p>
                </div>
                {canRecordProjectEntries && (
                  <motion.button
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-church-black text-white rounded-2xl text-[10px] font-bold tracking-[0.2em] hover:bg-church-green-dark transition-all shadow-xl shadow-church-black/20"
                  >
                    <Wallet className="w-4 h-4" />
                    RECORD DISBURSEMENT
                  </motion.button>
                )}
              </div>

              <div className="bg-white rounded-[24px] md:rounded-[40px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-church-black/5 transition-all duration-500">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Description
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Amount
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Date Paid
                        </th>
                        <th className="px-6 md:px-10 py-6 text-[10px] font-serif italic font-bold text-gray-400 uppercase tracking-[0.2em]">
                          Method
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {expenses.length > 0 ? (
                          [...expenses]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((expense, idx) => (
                              <motion.tr
                                key={expense.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="hover:bg-gray-50/70 transition-all group cursor-default"
                              >
                                <td className="px-6 md:px-10 py-7">
                                  <div className="space-y-1">
                                    <span className="text-sm font-bold text-church-black block tracking-tight">
                                      {expense.description}
                                    </span>
                                    {expense.receiptReference && (
                                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                        Ref: {expense.receiptReference}
                                      </span>
                                    )}
                                    {expense.proofFileName && (
                                      <a
                                        href={expense.proofFileName}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] font-bold text-gold-600 uppercase tracking-widest block hover:text-gold-800 underline underline-offset-2"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View Proof
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <span className="text-base md:text-lg font-serif font-bold text-rose-600 tracking-tight">
                                    {formatCurrency(expense.amount)}
                                  </span>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <span className="text-sm text-church-black font-bold tracking-tight">
                                    {new Date(expense.date).toLocaleDateString(undefined, {
                                      month: 'long',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </span>
                                </td>
                                <td className="px-6 md:px-10 py-7">
                                  <span className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                    {expense.paymentMethod}
                                  </span>
                                </td>
                              </motion.tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 md:px-10 py-20 md:py-24 text-center">
                              <div className="flex flex-col items-center gap-6">
                                <div className="w-20 h-20 md:w-24 md:h-24 bg-gray-50 rounded-[24px] md:rounded-[32px] flex items-center justify-center text-gray-200 border border-dashed border-gray-200">
                                  <Wallet className="w-8 h-8 md:w-10 md:h-10" />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-lg md:text-xl font-serif font-bold text-church-black">
                                    No disbursements recorded
                                  </p>
                                  <p className="text-xs md:text-sm text-gray-400 max-w-xs mx-auto">
                                    Record the first project expense or payout here.
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DonationEntryModal
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
        onSubmit={onAddDonation}
        projectId={project.id}
        projectName={project.name}
      />
      <ExpenseEntryModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={onAddExpense}
        projectId={project.id}
        projectName={project.name}
      />
    </div>
  );
}
