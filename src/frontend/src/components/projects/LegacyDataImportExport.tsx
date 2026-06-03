'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Download, Upload, AlertCircle, CheckCircle, X, DollarSign, Clock } from 'lucide-react';
import { FinancialRecord } from '../../types';
import { SUBMISSION_CONFIG } from '../../constants';
import { motion } from 'motion/react';

interface LegacyDataImportExportProps {
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  year: number;
  onImport: (records: FinancialRecord[]) => void;
  lastSubmissionDate?: Date;
  budgetData?: { monthly: number; annual: number };
  onBudgetSave?: (monthly: number, annual: number) => void;
}

export function LegacyDataImportExport({ entityName, entityType, year, onImport, lastSubmissionDate, budgetData, onBudgetSave }: LegacyDataImportExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [budgetMonthly, setBudgetMonthly] = useState(budgetData?.monthly || 0);
  const [budgetAnnual, setBudgetAnnual] = useState(budgetData?.annual || 0);
  const [budgetInputType, setBudgetInputType] = useState<'annual' | 'monthly'>('annual');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calculateDeadline = useCallback((): Date => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let deadline = new Date(currentYear, currentMonth, SUBMISSION_CONFIG.DEADLINE_DAY);
    if (today.getDate() >= SUBMISSION_CONFIG.DEADLINE_DAY) {
      deadline = new Date(currentYear, currentMonth + 1, SUBMISSION_CONFIG.DEADLINE_DAY);
    }

    return deadline;
  }, []);

  const getSubmissionStatus = useCallback(() => {
    if (!lastSubmissionDate) {
      return { status: 'not-submitted', color: 'bg-red-50 border-red-200', badge: 'Not Submitted', textColor: 'text-red-700', monthsLate: 0 };
    }

    const today = new Date();
    const lastSubmission = new Date(lastSubmissionDate);
    const deadline = calculateDeadline();

    const timeDiff = today.getTime() - lastSubmission.getTime();
    const daysDiff = Math.floor(timeDiff / SUBMISSION_CONFIG.MILLISECONDS_PER_DAY);
    const monthsLate = Math.floor(daysDiff / SUBMISSION_CONFIG.MONTHS_TO_DAYS);

    if (lastSubmission >= deadline) {
      return { status: 'on-time', color: 'bg-green-50 border-green-200', badge: 'On Time', textColor: 'text-green-700', monthsLate: 0 };
    }
    if (monthsLate >= SUBMISSION_CONFIG.MONTHS_LATE_WARNING && monthsLate <= SUBMISSION_CONFIG.MONTHS_LATE_WARNING_MAX) {
      return { status: 'warning', color: 'bg-amber-50 border-amber-200', badge: `Warning (${monthsLate}-${SUBMISSION_CONFIG.MONTHS_LATE_WARNING_MAX} months late)`, textColor: 'text-amber-700', monthsLate };
    }
    if (monthsLate >= SUBMISSION_CONFIG.MONTHS_LATE_ACTION_REQUIRED) {
      return { status: 'action-required', color: 'bg-red-50 border-red-200', badge: `Action Required (${monthsLate}+ months late)`, textColor: 'text-red-700', monthsLate };
    }

    return { status: 'on-time', color: 'bg-green-50 border-green-200', badge: 'On Time', textColor: 'text-green-700', monthsLate: 0 };
  }, [lastSubmissionDate, calculateDeadline]);

  const submissionStatus = useMemo(() => getSubmissionStatus(), [getSubmissionStatus]);

  const getNextDeadline = useCallback((): string => {
    const deadline = calculateDeadline();
    return deadline.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  }, [calculateDeadline]);

  const handleBudgetSave = useCallback(() => {
    if (onBudgetSave) {
      onBudgetSave(budgetMonthly, budgetAnnual);
      setImportStatus('success');
      setImportMessage('Budget saved successfully.');
      setIsBudgetOpen(false);
      setTimeout(() => setImportStatus('idle'), 3000);
    }
  }, [onBudgetSave, budgetMonthly, budgetAnnual]);

  const downloadTemplate = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const csvHeader = 'Month,Collections (PHP),Consumable Collections (PHP),Disbursements (PHP),Sacraments Rate (%),Sacraments Arancel (PHP),Sacraments Parish Share (PHP),Sacraments Over & Above (PHP),Collections Mass (PHP),Collections Other (PHP),Collections Other Receipts (PHP),Expenses Pastoral (PHP),Expenses Parish (PHP),Net Receipts (PHP),Mass Intentions Not Claimed (PHP),Mass Intentions Claimed (PHP),Special Collections (PHP),Pastoral Fund Total Net Receipts (PHP)\n';
    const csvRows = months.map((month) => `${month},0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0`).join('\n');

    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${entityName}_Financial_Template_${year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setImportStatus('success');
    setImportMessage('Template downloaded successfully.');
    setTimeout(() => setImportStatus('idle'), 3000);
  }, [entityName, year]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error('Invalid CSV format');
      }

      const records: FinancialRecord[] = [];

      for (let i = 1; i < lines.length; i += 1) {
        const values = lines[i].split(',').map((value) => value.trim());
        if (values.length < 4) continue;

        const month = values[0];
        const collections = parseFloat(values[1]) || 0;
        const consumableCollections = parseFloat(values[2]) || 0;
        const disbursements = parseFloat(values[3]) || 0;

        const record: FinancialRecord = {
          month,
          collections,
          consumableCollections,
          disbursements,
          entityType,
          sacraments_rate: parseFloat(values[4]) || undefined,
          sacraments_arancel: parseFloat(values[5]) || undefined,
          sacraments_parishShare: parseFloat(values[6]) || undefined,
          sacraments_overAbove: parseFloat(values[7]) || undefined,
          collections_mass: parseFloat(values[8]) || undefined,
          collections_other: parseFloat(values[9]) || undefined,
          collections_otherReceipts: parseFloat(values[10]) || undefined,
          expenses_pastoral: parseFloat(values[11]) || undefined,
          expenses_parish: parseFloat(values[12]) || undefined,
          netReceipts: parseFloat(values[13]) || undefined,
          others_massIntentionsNotClaimed: parseFloat(values[14]) || undefined,
          others_massIntentionsClaimed: parseFloat(values[15]) || undefined,
          others_specialCollections: parseFloat(values[16]) || undefined,
          pastoralParishFundTotalNetReceipts: parseFloat(values[17]) || undefined,
        };

        if (month && (collections > 0 || consumableCollections > 0 || disbursements > 0)) {
          records.push(record);
        }
      }

      if (records.length === 0) {
        throw new Error('No valid records found in the CSV');
      }

      onImport(records);
      setImportStatus('success');
      setImportMessage(`Successfully imported ${records.length} month(s) of data.`);
      setIsOpen(false);
      setTimeout(() => setImportStatus('idle'), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import file';
      setImportStatus('error');
      setImportMessage(message);
      setTimeout(() => setImportStatus('idle'), 3000);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [entityType, onImport]);

  return (
    <div className="space-y-3 md:space-y-5">
      {importStatus === 'success' && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700 md:p-4">
          <CheckCircle className="h-4 w-4 flex-shrink-0 md:h-5 md:w-5" />
          <span className="text-xs font-medium md:text-sm">{importMessage}</span>
        </motion.div>
      )}

      {importStatus === 'error' && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 md:p-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0 md:h-5 md:w-5" />
          <span className="text-xs font-medium md:text-sm">{importMessage}</span>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-lg border p-4 md:p-5 ${submissionStatus.color}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Clock className={`h-4 w-4 flex-shrink-0 md:h-5 md:w-5 ${submissionStatus.textColor}`} />
              <span className={`text-xs font-bold md:text-sm ${submissionStatus.textColor}`}>{submissionStatus.badge}</span>
            </div>
            <div className="space-y-1 text-[11px] md:text-sm">
              <p className={submissionStatus.textColor}><strong>Next Deadline:</strong> {getNextDeadline()}</p>
              {lastSubmissionDate ? (
                <p className={submissionStatus.textColor}><strong>Last Submitted:</strong> {new Date(lastSubmissionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              ) : (
                <p className={submissionStatus.textColor}><strong>Status:</strong> No submission yet</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-base">
        <div className="border-b border-gold-200 bg-gradient-to-r from-gold-50 to-gold-100/50 px-4 py-3 md:px-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gold-600 md:h-5 md:w-5" />
            <h3 className="text-sm font-bold text-gray-900 md:text-base">Annual Budget</h3>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 md:px-5">
          {budgetAnnual > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-gray-600 md:text-sm">Annual Budget:</span>
                <span className="text-xl font-bold text-gold-600 md:text-2xl">PHP {(budgetAnnual / 1000).toLocaleString('en', { maximumFractionDigits: 0 })}K</span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-gray-600 md:text-sm">Monthly Budget:</span>
                <span className="text-base font-bold text-gray-900 md:text-lg">PHP {((budgetAnnual / 12) / 1000).toLocaleString('en', { maximumFractionDigits: 0 })}K</span>
              </div>
            </>
          ) : (
            <p className="text-xs italic text-gray-500 md:text-sm">No budget set yet. Use the button below to add one.</p>
          )}
          <button onClick={() => setIsBudgetOpen(true)} className="w-full rounded-lg bg-gold-500 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-gold-600 md:py-2.5 md:text-sm">
            {budgetAnnual > 0 ? 'Update Budget' : 'Set Budget'}
          </button>
        </div>
      </motion.div>

      <div className="flex flex-col gap-2 sm:flex-row md:gap-3">
        <button onClick={downloadTemplate} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-3 text-xs font-bold text-black shadow-md transition-all hover:scale-[1.01] hover:bg-gold-600 md:text-sm">
          <Download className="h-4 w-4 md:h-5 md:w-5" />
          Download Template
        </button>
        <button onClick={() => setIsOpen(!isOpen)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-xs font-bold text-white shadow-md transition-all hover:scale-[1.01] hover:bg-emerald-800 md:text-sm">
          <Upload className="h-4 w-4 md:h-5 md:w-5" />
          Upload Data
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 md:text-lg">Upload Financial Data</h3>
              <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-6 text-xs text-gray-600 md:text-sm">Select a CSV file with financial data for {entityName}. Download the template first to confirm the required format.</p>
            <div className="space-y-4">
              <button onClick={() => fileInputRef.current?.click()} className="w-full cursor-pointer rounded-lg border-2 border-dashed border-gold-400 p-8 text-center transition-colors hover:bg-gold-50">
                <Upload className="mx-auto mb-2 h-8 w-8 text-gold-500" />
                <p className="text-sm font-medium text-gray-900">Click to select CSV file</p>
              </button>
              <button onClick={() => setIsOpen(false)} className="w-full rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Set Budget</h3>
              <button onClick={() => setIsBudgetOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2 rounded-lg bg-gray-100 p-2">
                <button onClick={() => setBudgetInputType('annual')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${budgetInputType === 'annual' ? 'bg-gold-500 text-black' : 'text-gray-700 hover:bg-gray-200'}`}>
                  Annual Budget
                </button>
                <button onClick={() => setBudgetInputType('monthly')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${budgetInputType === 'monthly' ? 'bg-gold-500 text-black' : 'text-gray-700 hover:bg-gray-200'}`}>
                  Monthly Budget
                </button>
              </div>

              {budgetInputType === 'annual' ? (
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">Annual Budget (PHP)</label>
                  <input type="number" value={budgetAnnual} onChange={(e) => {
                    const annual = parseFloat(e.target.value) || 0;
                    setBudgetAnnual(annual);
                    setBudgetMonthly(annual / 12);
                  }} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500" placeholder="Enter annual budget" />
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">Monthly Budget (PHP)</label>
                  <input type="number" value={budgetMonthly} onChange={(e) => {
                    const monthly = parseFloat(e.target.value) || 0;
                    setBudgetMonthly(monthly);
                    setBudgetAnnual(monthly * 12);
                  }} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500" placeholder="Enter monthly budget" />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsBudgetOpen(false)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-bold text-gray-900 transition-colors hover:bg-gray-300">
                  Cancel
                </button>
                <button onClick={handleBudgetSave} className="flex-1 rounded-lg bg-gold-500 px-4 py-2 font-bold text-black transition-colors hover:bg-gold-600">
                  Save Budget
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
