'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Clock3, FileText, CheckCircle2, ShieldCheck, Calendar, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent } from '../components/ui/Card';
import { FinancialRecord } from '../types';
import { TemplateDownloadCard } from '../components/submission/TemplateDownloadCard';
import { ReportUploadCard } from '../components/submission/ReportUploadCard';
import { UploadConfirmationModal } from '../components/submission/UploadConfirmationModal';
import { SubmissionProgress } from '../components/submission/SubmissionProgress';
import { SubmissionResultModal } from '../components/submission/SubmissionResultModal';
import {
  acceptedSubmissionExtensionsByType,
  acceptedSubmissionFormatsByType,
  formatFileSize,
  institutionDescriptionMap,
  institutionHeadingMap,
  shouldSimulateAnomaly,
  submissionSteps,
  submissionTemplates,
  triggerMockTemplateDownload,
} from '../components/submission/submissionMock';
import {
  AnomalySimulationMode,
  SubmissionFlowState,
  SubmissionInstitutionType,
  SubmissionStepId,
} from '../components/submission/types';
import { SUBMISSION_CONFIG } from '../constants';
import { usePermissions } from '../hooks/usePermissions';
import { apiClient } from '../lib/api-client';

interface ParishDataSubmissionProps {
  parishName?: string;
  vicariate?: string;
  parishClass?: string;
  year?: number;
  onBack?: () => void;
  onImport?: (records: FinancialRecord[]) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const roleBadgeMap: Record<SubmissionInstitutionType, string> = {
  parish: 'Parish Level',
  seminary: 'Seminary Level',
  school: 'School Superintendent / Finance Supervisor / Finance Officer',
};

function resolveInstitutionType(parishClass?: string): SubmissionInstitutionType {
  const normalized = parishClass?.toLowerCase() ?? '';
  if (normalized.includes('seminary')) return 'seminary';
  if (normalized.includes('school')) return 'school';
  return 'parish';
}

export function ParishDataSubmission({
  parishName = 'San Isidro Labrador Parish',
  vicariate = 'Holy Family Vicariate',
  parishClass = 'Class B',
  year = 2026,
  onBack,
  onImport,
}: ParishDataSubmissionProps) {
  const { permissions } = usePermissions();
  const institutionType = useMemo(() => resolveInstitutionType(parishClass), [parishClass]);
  const heading = institutionHeadingMap[institutionType];
  const template = submissionTemplates[institutionType];
  const acceptedExtensions = acceptedSubmissionExtensionsByType[institutionType];
  const acceptedFormats = acceptedSubmissionFormatsByType[institutionType];
  const acceptedFormatsLabel = acceptedExtensions.map((ext) => ext.toUpperCase()).join(', ');
  const deadlineLabel = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const deadline =
      now.getDate() >= SUBMISSION_CONFIG.DEADLINE_DAY
        ? new Date(currentYear, currentMonth + 1, SUBMISSION_CONFIG.DEADLINE_DAY)
        : new Date(currentYear, currentMonth, SUBMISSION_CONFIG.DEADLINE_DAY);

    return deadline.toLocaleDateString('en-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // State declarations — kept together and ordered before memos that reference them
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [flowState, setFlowState] = useState<SubmissionFlowState>('idle');
  const [currentStepId, setCurrentStepId] = useState<SubmissionStepId | null>(null);
  const [anomalyMode, setAnomalyMode] = useState<AnomalySimulationMode>('auto');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [statusMessage, setStatusMessage] = useState(
    'No submission has started yet. Download a template or choose a report file to begin.',
  );
  const [submissionResult, setSubmissionResult] = useState<{
    submissionId: string;
    filePath: string;
    validationStatus: string;
  } | null>(null);
  const [processResult, setProcessResult] = useState<Awaited<ReturnType<typeof apiClient.processSubmission>> | null>(
    null,
  );

  const fileSizeLabel = selectedFile ? formatFileSize(selectedFile.size) : '';

  const [realTemplateUrls, setRealTemplateUrls] = useState<Partial<Record<'xlsx' | 'csv', string>>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/templates?institutionType=${institutionType}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((urls: Partial<Record<'xlsx' | 'csv', string>>) => {
        if (!cancelled) setRealTemplateUrls(urls ?? {});
      })
      .catch(() => {
        if (!cancelled) setRealTemplateUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, [institutionType]);

  const templateFormatOptions = useMemo(() => {
    const options: Array<{ format: 'xlsx' | 'csv'; onDownload: () => void }> = [];
    if (realTemplateUrls.xlsx) {
      options.push({ format: 'xlsx', onDownload: () => window.open(realTemplateUrls.xlsx, '_blank', 'noopener,noreferrer') });
    }
    if (realTemplateUrls.csv) {
      options.push({ format: 'csv', onDownload: () => window.open(realTemplateUrls.csv, '_blank', 'noopener,noreferrer') });
    }
    return options;
  }, [realTemplateUrls]);

  // What-if calculation for selected month
  const submissionWhatIf = useMemo(() => {
    const now = new Date();
    const selectedDeadline = new Date(year, selectedMonth, SUBMISSION_CONFIG.DEADLINE_DAY);
    const daysRemaining = Math.ceil((selectedDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysRemaining < 0;
    const isCurrentMonth = selectedMonth === now.getMonth() && year === now.getFullYear();
    const isUpcoming = selectedMonth === now.getMonth() + 1 && year === now.getFullYear();

    return {
      month: MONTHS[selectedMonth],
      deadline: selectedDeadline.toLocaleDateString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      daysRemaining: Math.abs(daysRemaining),
      isOverdue,
      isCurrentMonth,
      isUpcoming,
      status: isCurrentMonth ? 'Current Month' : isUpcoming ? 'Next Month' : isOverdue ? 'Overdue' : 'Future Period',
    };
  }, [selectedMonth, year]);

  const validateFile = (file: File | null) => {
    if (!file) return 'Please select a financial report file first.';

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!acceptedExtensions.includes(extension)) {
      return `Invalid file type. Please upload a ${acceptedFormatsLabel} file.`;
    }

    if (file.size > 15 * 1024 * 1024) {
      return 'The selected file is too large. Please keep uploads below 15 MB.';
    }

    return '';
  };

  const handleFileSelection = (file: File | null) => {
    setSelectedFile(file);
    setValidationMessage(validateFile(file));
    setFlowState('idle');
    setCurrentStepId(null);
    setStatusMessage(
      file
        ? 'Valid file selected. Review the file details, then confirm the upload to begin the submission process.'
        : 'No submission has started yet. Download a template or choose a report file to begin.',
    );
  };

  const handleDownloadTemplate = async () => {
    setIsTemplateLoading(true);
    await wait(700);
    triggerMockTemplateDownload(template);
    setStatusMessage(`${template.title} retrieved from mock data and downloaded successfully.`);
    setIsTemplateLoading(false);
  };

  const handleRequestUpload = () => {
    const message = validateFile(selectedFile);
    setValidationMessage(message);
    if (message) return;
    setIsConfirmationOpen(true);
  };

  const resetFlow = (keepFile = true) => {
    setFlowState('idle');
    setCurrentStepId(null);
    setIsConfirmationOpen(false);
    setShowSuccessModal(false);
    setShowWarningModal(false);
    setSubmissionResult(null);
    setProcessResult(null);
    setStatusMessage(
      keepFile && selectedFile
        ? 'You can review the same file again or replace it before submitting a new report.'
        : 'No submission has started yet. Download a template or choose a report file to begin.',
    );

    if (!keepFile) {
      setSelectedFile(null);
      setValidationMessage('');
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    setIsConfirmationOpen(false);
    setFlowState('running');

    const runStep = async (stepId: SubmissionStepId, message: string, ms = 850) => {
      setCurrentStepId(stepId);
      setStatusMessage(message);
      await wait(ms);
    };

    // Step 1 — upload: build FormData and call the real API
    setCurrentStepId('upload');
    setStatusMessage('Uploading report to diocesan secure storage...');

    const reportType =
      institutionType === 'parish' ? 'IAFR' : institutionType === 'school' ? 'School FS' : 'Seminary FS';

    let apiResult: { submissionId: string; filePath: string; validationStatus: string } | null = null;
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('institutionName', parishName);
      fd.append('institutionType', institutionType);
      fd.append('reportType', reportType);
      fd.append('reportingMonth', String(selectedMonth + 1));
      fd.append('reportingYear', String(year));
      fd.append('isLate', String(submissionWhatIf.isOverdue));

      apiResult = await apiClient.submitReport(fd);
      setSubmissionResult(apiResult);
    } catch (err) {
      console.error('[ParishDataSubmission] submitReport failed, continuing with mock flow:', err);
    }

    await wait(400);

    if (institutionType === 'parish') {
      if (!apiResult) {
        setFlowState('error');
        setStatusMessage('Could not upload the report to diocesan secure storage. Please try again.');
        setShowWarningModal(true);
        return;
      }

      await runStep('cleaning', 'Reading and normalizing the uploaded report...');
      await runStep('validation', 'Validating structure, totals, and business rules...');

      let processResult: Awaited<ReturnType<typeof apiClient.processSubmission>> | null = null;
      try {
        processResult = await apiClient.processSubmission(apiResult.submissionId, apiResult.filePath);
        setProcessResult(processResult);
      } catch (err) {
        console.error('[ParishDataSubmission] processSubmission failed:', err);
      }

      if (!processResult || processResult.validationStatus === 'failed') {
        setFlowState('anomaly');
        setStatusMessage('The report failed validation and was not loaded into the diocesan database.');
        setShowWarningModal(true);
        return;
      }

      await runStep('loading', 'Saving line items to the parish financial record...');
      await runStep('success', 'Report Submitted Successfully.', 500);

      setFlowState('success');
      setStatusMessage(
        processResult.validationStatus === 'warning'
          ? `Submission recorded with ${processResult.summary.errorCount} warning(s) to review. ${processResult.summary.lineItemCount} line item(s) were saved.`
          : `Submission recorded successfully. ${processResult.summary.lineItemCount} line item(s) were saved to the parish financial record.`,
      );
      onImport?.([]);
      setShowSuccessModal(true);
      return;
    }

    // School / seminary — no cleaner exists yet, keep the original frontend-only simulation.
    await runStep('cleaning', 'Cleaning and preparing uploaded data...');
    await runStep('anomaly', 'Performing anomaly check on the uploaded report...');

    const hasAnomaly = shouldSimulateAnomaly(anomalyMode, selectedFile);
    if (hasAnomaly) {
      setFlowState('anomaly');
      setStatusMessage('Anomaly detected. The report requires review before it can continue.');
      setShowWarningModal(true);
      return;
    }

    await runStep('validation', 'Validating the uploaded report structure and values...');
    await runStep('loading', 'Saving submission record to the database...');
    await runStep('success', 'Report Submitted Successfully.', 500);

    setFlowState('success');
    setStatusMessage(
      apiResult
        ? `Submission recorded successfully. Your file has been stored in diocesan secure storage and a submission record has been created.`
        : 'The submission flow completed. File storage or database recording may have encountered an issue — please check with your administrator.',
    );
    onImport?.([]);
    setShowSuccessModal(true);
  };

  return (
    <div className="min-h-full bg-church-light">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-church-green/10 bg-church-green/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-church-green">
                Submission Module
              </span>
              <span className="rounded-lg border border-gold-200 bg-gold-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-gold-700">
                {roleBadgeMap[institutionType]}
              </span>
            </div>
            <h1 className="truncate text-lg font-serif font-black text-church-green sm:text-xl">{heading}</h1>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 sm:text-xs">
              {parishName} • {vicariate}
            </p>
          </div>

          <div className="hidden rounded-2xl border border-gray-200 bg-church-light/50 px-4 py-3 text-right sm:block">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">What-if Deadline</p>
            <p className={`mt-1 text-sm font-bold ${submissionWhatIf.isOverdue ? 'text-red-600' : 'text-gold-700'}`}>
              {submissionWhatIf.deadline}
            </p>
            <p className="mt-1 text-xs text-gray-500">{submissionWhatIf.status}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]"
        >
          <Card className="overflow-hidden border-gold-100 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.10),transparent_30%),linear-gradient(135deg,#ffffff,#fbf8f1)]">
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-serif font-bold text-church-black md:text-[2rem]">
                    Submit your financial report
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
                    Download the template, upload your report, and follow the guided submission steps.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-gray-200 bg-white/90 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Step 1</p>
                  <p className="mt-2 text-sm font-bold text-church-black">Download Template</p>
                  <p className="mt-1 text-[11px] text-gray-500">Get the correct report format first.</p>
                </div>
                <div className="rounded-[1.4rem] border border-gray-200 bg-white/90 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Step 2</p>
                  <p className="mt-2 text-sm font-bold text-church-black">Upload Report</p>
                  <p className="mt-1 text-[11px] text-gray-500">Choose a completed {acceptedFormatsLabel} file.</p>
                </div>
                <div className="rounded-[1.4rem] border border-gray-200 bg-white/90 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Step 3</p>
                  <p className="mt-2 text-sm font-bold text-church-black">Review Result</p>
                  <p className="mt-1 text-[11px] text-gray-500">Check progress, warnings, or success confirmation.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white">
            <CardContent className="space-y-3">
              <div className="rounded-[1.4rem] border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-church-green" />
                  <div>
                    <p className="text-sm font-bold text-church-black">Secure submission</p>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      Files are uploaded to secure diocesan storage. Submission records are saved to the database.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-gray-200 bg-church-light/40 p-4">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
                  <div>
                    <p className="text-sm font-bold text-church-black">Current status</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">{statusMessage}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                      <p className="text-sm font-bold text-blue-800">Accepted files</p>
                      <p className="mt-1 text-sm leading-relaxed text-blue-700">{acceptedFormatsLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Submission year</p>
                      <p className="mt-1 text-sm leading-relaxed text-emerald-700">Reporting cycle {year}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="overflow-hidden border-gold-100 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.08),transparent_40%),linear-gradient(135deg,#ffffff,#fffbf5)]">
            <CardContent className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-100 to-gold-50 text-gold-700">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-serif font-black text-church-black">What-If Submission Period</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Explore different months to understand deadlines and submission requirements. Select any period to
                    preview what-if scenarios.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-black uppercase tracking-[0.15em] text-gray-500 mb-2.5">
                    Select Period
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full rounded-[1.2rem] border-2 border-gold-200 bg-white px-4 py-3 text-sm font-semibold text-church-black outline-none transition-all hover:border-gold-300 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
                  >
                    {MONTHS.map((month, idx) => (
                      <option key={month} value={idx}>
                        {month} {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-2 gap-3">
                  <div className="rounded-[1.2rem] border-2 border-gold-200 bg-gradient-to-br from-gold-50 to-white p-3.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Selected Period</p>
                    <p className="mt-2 text-base font-serif font-bold text-gold-800">{submissionWhatIf.month}</p>
                    <p className="text-xs font-semibold text-gold-600">{year}</p>
                  </div>

                  <div
                    className={`rounded-[1.2rem] border-2 p-3.5 ${submissionWhatIf.isOverdue ? 'border-red-300 bg-gradient-to-br from-red-50 to-white' : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Status</p>
                    <p
                      className={`mt-2 text-base font-serif font-bold ${submissionWhatIf.isOverdue ? 'text-red-700' : submissionWhatIf.isCurrentMonth ? 'text-emerald-700' : 'text-gray-700'}`}
                    >
                      {submissionWhatIf.status}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div
                  className={`rounded-[1.1rem] border-2 p-4 transition-all ${submissionWhatIf.isOverdue ? 'border-red-300 bg-gradient-to-br from-red-50 to-white shadow-sm hover:shadow-md' : 'border-gold-200 bg-gradient-to-br from-gold-50 to-white shadow-sm hover:shadow-md'}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-600">Deadline</p>
                  <p
                    className={`mt-2.5 text-base font-serif font-bold leading-tight ${submissionWhatIf.isOverdue ? 'text-red-700' : 'text-gold-800'}`}
                  >
                    {submissionWhatIf.deadline.split(' ')[0]} {submissionWhatIf.deadline.split(' ')[1]}
                  </p>
                </div>

                <div
                  className={`rounded-[1.1rem] border-2 p-4 transition-all ${submissionWhatIf.daysRemaining <= 5 && !submissionWhatIf.isOverdue ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-white shadow-sm hover:shadow-md' : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm hover:shadow-md'}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-600">Days Remaining</p>
                  <p
                    className={`mt-2.5 text-2xl font-serif font-black ${submissionWhatIf.isOverdue ? 'text-red-700' : submissionWhatIf.daysRemaining <= 5 ? 'text-orange-700' : 'text-emerald-700'}`}
                  >
                    {submissionWhatIf.isOverdue ? '−' : ''}
                    {submissionWhatIf.daysRemaining}
                  </p>
                </div>

                <div className="rounded-[1.1rem] border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm hover:shadow-md transition-all">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-600">Cycle Year</p>
                  <p className="mt-2.5 text-2xl font-serif font-black text-blue-700">{year}</p>
                </div>

                <div className="rounded-[1.1rem] border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm hover:shadow-md transition-all">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-600">Submission Mode</p>
                  <p className="mt-2.5 text-base font-serif font-bold text-gray-700">Test</p>
                </div>
              </div>

              {submissionWhatIf.isOverdue && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.2rem] border-2 border-red-300 bg-gradient-to-r from-red-50 via-red-50 to-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-900">Overdue Period</p>
                      <p className="mt-1 text-sm text-red-800">
                        This submission period is {submissionWhatIf.daysRemaining} days overdue. Late submissions may
                        require special approval from your diocese.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {submissionWhatIf.isCurrentMonth && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.2rem] border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-emerald-50 to-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-emerald-900">Active Period</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        This is the current submission period. Upload your financial data for the ongoing month of{' '}
                        {submissionWhatIf.month}.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {submissionWhatIf.isUpcoming && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.2rem] border-2 border-blue-300 bg-gradient-to-r from-blue-50 via-blue-50 to-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                      <p className="font-semibold text-blue-900">Upcoming Period</p>
                      <p className="mt-1 text-sm text-blue-800">
                        {submissionWhatIf.month} is your next submission period. Begin preparing your financial reports
                        now to ensure timely submission by {submissionWhatIf.deadline.split(' ')[0]}{' '}
                        {submissionWhatIf.deadline.split(' ')[1]}.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {!submissionWhatIf.isCurrentMonth && !submissionWhatIf.isUpcoming && !submissionWhatIf.isOverdue && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.2rem] border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-amber-50 to-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Future Period</p>
                      <p className="mt-1 text-sm text-amber-800">
                        You're exploring a future submission period ({submissionWhatIf.month}). Use this to test
                        workflows and understand deadline requirements in advance.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <TemplateDownloadCard
              template={template}
              institutionLabel={heading}
              isLoading={isTemplateLoading}
              onDownload={handleDownloadTemplate}
              disabled={permissions?.download_csv !== true}
              formatOptions={templateFormatOptions.length > 0 ? templateFormatOptions : undefined}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <ReportUploadCard
              file={selectedFile}
              fileSizeLabel={fileSizeLabel}
              validationMessage={validationMessage}
              acceptedFormats={acceptedFormats}
              isSubmitting={flowState === 'running'}
              anomalyMode={anomalyMode}
              onModeChange={setAnomalyMode}
              onFileSelect={handleFileSelection}
              onRequestUpload={handleRequestUpload}
              onRemoveFile={() => handleFileSelection(null)}
              disabled={permissions?.upload_csv_entity !== true}
            />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <SubmissionProgress steps={submissionSteps} currentStepId={currentStepId} flowState={flowState} />
        </motion.div>
      </div>

      <UploadConfirmationModal
        isOpen={isConfirmationOpen}
        file={selectedFile}
        onClose={() => setIsConfirmationOpen(false)}
        onConfirm={handleConfirmUpload}
      />

      <SubmissionResultModal
        isOpen={showSuccessModal}
        variant="success"
        title="Report Submitted Successfully"
        message={
          submissionResult?.submissionId
            ? `Your report has been uploaded to diocesan secure storage and a submission record has been created. Reference ID: ${submissionResult.submissionId.slice(0, 8)}`
            : 'Your report was processed. File storage or database recording may have encountered an issue — please check with your administrator.'
        }
        primaryLabel="Done"
        onPrimary={() => resetFlow(true)}
      />

      <SubmissionResultModal
        isOpen={showWarningModal}
        variant="warning"
        title={institutionType === 'parish' && processResult ? 'Validation Failed' : 'Anomaly Detected'}
        message={
          institutionType === 'parish' && processResult
            ? `The report failed validation (${processResult.summary.errorCount} issue(s) found) and was not loaded into the diocesan database. Please correct the file and resubmit.`
            : institutionType === 'parish'
              ? 'Your report could not be processed. Please check your connection and try again.'
              : 'The uploaded report contains unusual values and needs review. The simulated flow stopped before loading to the database.'
        }
        primaryLabel="Replace File"
        onPrimary={() => resetFlow(false)}
        secondaryLabel="Cancel Submission"
        onSecondary={() => resetFlow(true)}
      />
    </div>
  );
}
