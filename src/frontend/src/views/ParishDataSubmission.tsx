'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  ChevronDown,
  FileUp,
  Keyboard,
  ScanLine,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Card, CardContent } from '../components/ui/Card';
import { FinancialRecord } from '../types';
import { TemplateDownloadCard } from '../components/submission/TemplateDownloadCard';
import { ReportUploadCard } from '../components/submission/ReportUploadCard';
import { UploadConfirmationModal } from '../components/submission/UploadConfirmationModal';
import { SubmissionProgress } from '../components/submission/SubmissionProgress';
import { SubmissionResultModal } from '../components/submission/SubmissionResultModal';
import {
  ManualIAFRForm,
  ManualIAFROcrReviewMetadata,
  ManualIAFRValueMap,
  ManualSubmissionEntry,
} from '../components/submission/ManualIAFRForm';
import { mapOcrToIafrManualFields } from '../components/submission/ocrIafrMapper';
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
import { apiClient, getApiRequestHeaders } from '../lib/api-client';
import { combineOcrPages, recognizePdfFile } from '../lib/browserOcr';

interface ParishDataSubmissionProps {
  parishName?: string;
  vicariate?: string;
  parishClass?: string;
  year?: number | null;
  onBack?: () => void;
  onImport?: (records: FinancialRecord[]) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const testStageStepMap: Record<string, SubmissionStepId> = {
  uploading: 'upload',
  saving: 'upload',
  reading: 'validation',
  validation: 'validation',
  cleaning: 'cleaning',
  calculation: 'calculation',
  mapping: 'mapping',
  loading: 'loading',
  reconciliation: 'reconciliation',
  completed: 'success',
  failed: 'mapping',
};

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
  year: rawYear,
  onBack,
  onImport,
}: ParishDataSubmissionProps) {
  const { permissions } = usePermissions();
  // A submission is always for one concrete reporting year — "All Years" (the
  // dashboard filter's default) isn't a valid submission target — so fall
  // back to the real current calendar year whenever the global filter is
  // unscoped, rather than passing null/undefined into deadline math or the
  // records this form saves.
  const year = rawYear ?? new Date().getFullYear();
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
  const [submissionMode, setSubmissionMode] = useState<'upload' | 'manual' | 'ocr'>('upload');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [ocrValidationMessage, setOcrValidationMessage] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [flowState, setFlowState] = useState<SubmissionFlowState>('idle');
  const [currentStepId, setCurrentStepId] = useState<SubmissionStepId | null>(null);
  const [anomalyMode, setAnomalyMode] = useState<AnomalySimulationMode>('auto');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [submissionIssues, setSubmissionIssues] = useState<
    Array<{ fieldName: string; severity: string; message: string; sourceRow?: number | null }>
  >([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedOcrFile, setSelectedOcrFile] = useState<File | null>(null);
  const [ocrProgressLabel, setOcrProgressLabel] = useState('');
  const [ocrDraft, setOcrDraft] = useState<{
    values: ManualIAFRValueMap;
    metadata: ManualIAFROcrReviewMetadata;
  } | null>(null);
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
  const ocrFileSizeLabel = selectedOcrFile ? formatFileSize(selectedOcrFile.size) : '';

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
      options.push({
        format: 'xlsx',
        onDownload: () => window.open(realTemplateUrls.xlsx, '_blank', 'noopener,noreferrer'),
      });
    }
    if (realTemplateUrls.csv) {
      options.push({
        format: 'csv',
        onDownload: () => window.open(realTemplateUrls.csv, '_blank', 'noopener,noreferrer'),
      });
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
      status: isOverdue ? 'Overdue' : isCurrentMonth ? 'Current Month' : isUpcoming ? 'Next Month' : 'Future Period',
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

  const validateOcrFile = (file: File | null) => {
    if (!file) return 'Please select a scanned PDF file first.';
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = file.type === 'application/pdf' || extension === 'pdf';
    if (!isPdf) return 'Invalid file type. Please upload a scanned PDF file.';
    if (file.size > 20 * 1024 * 1024) return 'The selected PDF is too large. Please keep OCR uploads below 20 MB.';
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

  const handleOcrFileSelection = (file: File | null) => {
    setSelectedOcrFile(file);
    setOcrValidationMessage(validateOcrFile(file));
    setOcrDraft(null);
    setFlowState('idle');
    setCurrentStepId(null);
    setOcrProgressLabel('');
    setStatusMessage(
      file
        ? 'Scanned PDF selected. Run OCR to prefill the manual review form.'
        : 'No OCR file selected yet. Choose a scanned PDF to begin OCR review.',
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
    setSubmissionIssues([]);
    setSubmissionResult(null);
    setProcessResult(null);
    setOcrProgressLabel('');
    setStatusMessage(
      keepFile && selectedFile
        ? 'You can review the same file again or replace it before submitting a new report.'
        : 'No submission has started yet. Download a template or choose a report file to begin.',
    );

    if (!keepFile) {
      setSelectedFile(null);
      setSelectedOcrFile(null);
      setOcrDraft(null);
      setValidationMessage('');
      setOcrValidationMessage('');
    }
  };

  const handleRequestOcrUpload = async () => {
    const message = validateOcrFile(selectedOcrFile);
    setOcrValidationMessage(message);
    if (message || !selectedOcrFile) return;

    setFlowState('running');
    setCurrentStepId('validation');
    setSubmissionIssues([]);
    setOcrDraft(null);
    setStatusMessage('Running OCR locally in your browser...');

    try {
      const ocr = await recognizePdfFile(selectedOcrFile, (progress) => {
        setOcrProgressLabel(progress.label);
        setStatusMessage(progress.label);
      });
      setCurrentStepId('mapping');
      setStatusMessage('Mapping OCR values into the manual IAFR fields...');
      const combined = combineOcrPages(ocr.pages);
      const mapped = mapOcrToIafrManualFields(combined.text, combined.words, combined.meanConfidence);

      const fieldMetadata = Object.fromEntries(
        Object.entries(mapped.reviews).map(([key, review]) => [
          key,
          {
            confidence: review.confidence,
            status: review.status,
            pageNumber: review.sourcePage,
            sourceLabel: review.label,
            snippet: review.sourceLine,
            message:
              review.status === 'mapped'
                ? 'OCR mapped this value.'
                : review.status === 'low_confidence'
                  ? 'OCR found a possible value. Please verify it.'
                  : 'OCR could not confidently find this field.',
          },
        ]),
      );

      let preview: { runId?: string; storagePath?: string; status?: string; error?: string } | null = null;
      let previewWarning = '';
      try {
        const fd = new FormData();
        fd.append('file', selectedOcrFile);
        fd.append('institutionName', parishName);
        fd.append('reportingMonth', String(selectedMonth + 1));
        fd.append('reportingYear', String(year));
        fd.append('meanConfidence', String(mapped.summary.meanConfidence));
        fd.append('mappedFieldCount', String(mapped.summary.mappedCount));
        fd.append('lowConfidenceCount', String(mapped.summary.lowConfidenceCount));
        fd.append('missingFieldCount', String(mapped.summary.missingCount));

        const response = await fetch('/api/submissions/test-runs/ocr-preview', { method: 'POST', body: fd });
        preview = await response.json();
        if (!response.ok) throw new Error(preview?.error ?? 'The OCR preview could not be saved.');
      } catch (previewError) {
        previewWarning =
          previewError instanceof Error
            ? previewError.message
            : 'The OCR preview PDF could not be saved, but the mapped draft is still available for review.';
      }

      const localRunId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? `local-ocr-${crypto.randomUUID()}`
          : `local-ocr-${Date.now()}`;
      const ocrRunId = preview?.runId ?? localRunId;

      setSubmissionResult({
        submissionId: ocrRunId,
        filePath: preview?.storagePath ?? '',
        validationStatus: preview?.status ?? (previewWarning ? 'local_review' : 'warning'),
      });
      setOcrDraft({
        values: mapped.values,
        metadata: {
          runId: ocrRunId,
          fileName: selectedOcrFile.name,
          confidence: mapped.summary.meanConfidence,
          confidenceSummary: {
            average: mapped.summary.meanConfidence,
            mappedFieldCount: mapped.summary.mappedCount,
            lowConfidenceCount: mapped.summary.lowConfidenceCount,
            unmatchedFieldCount: mapped.summary.missingCount,
          },
          fields: fieldMetadata,
          issues: [
            previewWarning ? `OCR preview save issue: ${previewWarning}` : '',
            mapped.summary.lowConfidenceCount + mapped.summary.missingCount > 0
              ? 'Some OCR fields need review before final submission.'
              : '',
          ].filter(Boolean),
        },
      });
      setCurrentStepId('mapping');
      setFlowState('idle');
      setStatusMessage(
        previewWarning
          ? 'OCR draft is ready for review. The PDF preview copy was not saved, so final submit will continue from the reviewed manual values.'
          : 'OCR draft is ready. Review the mapped manual fields, edit if needed, then submit.',
      );
    } catch (error) {
      console.error('[parish-ocr] Browser OCR failed.', error);
      setCurrentStepId('mapping');
      setFlowState('error');
      const errorMessage = error instanceof Error ? error.message : 'OCR processing failed.';
      setStatusMessage(errorMessage);
      setSubmissionIssues([{ fieldName: 'OCR PDF', severity: 'error', message: errorMessage }]);
      setShowWarningModal(true);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    setIsConfirmationOpen(false);
    setFlowState('running');
    setSubmissionIssues([]);

    if (institutionType === 'parish') {
      setCurrentStepId('upload');
      setStatusMessage('Uploading report to the isolated parish submission sandbox...');
      try {
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('institutionName', parishName);
        fd.append('reportingMonth', String(selectedMonth + 1));
        fd.append('reportingYear', String(year));

        const response = await fetch('/api/submissions/test-runs', { method: 'POST', body: fd });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'The sandbox upload failed.');

        setSubmissionResult({
          submissionId: result.runId,
          filePath: result.storagePath,
          validationStatus: result.status,
        });
        setCurrentStepId('validation');
        setStatusMessage('Reading and validating the uploaded IAFR report...');

        const poller = window.setInterval(async () => {
          try {
            const statusResponse = await fetch(`/api/submissions/test-runs/${result.runId}`);
            if (!statusResponse.ok) return;
            const status = await statusResponse.json();
            const step = testStageStepMap[status.currentStage];
            if (step) setCurrentStepId(step);
            const activeStage = status.stages?.find(
              (stage: { stage_code: string }) => stage.stage_code === status.currentStage,
            );
            if (activeStage?.message) setStatusMessage(activeStage.message);
          } catch {
            // Processing response remains authoritative if one poll is missed.
          }
        }, 500);

        try {
          const processResponse = await fetch(`/api/submissions/test-runs/${result.runId}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath: result.storagePath }),
          });
          const process = await processResponse.json();
          if (!processResponse.ok || process.status === 'failed') {
            setSubmissionIssues(process.issues ?? []);
            const processMessage =
              typeof process.error === 'string'
                ? process.error
                : typeof process.detail === 'string'
                  ? process.detail
                  : 'The sandbox file did not pass validation.';
            throw new Error(processMessage);
          }

          setCurrentStepId('success');
          setFlowState('success');
          setStatusMessage(
            `${process.summary.canonicalEntryCount} canonical entries were saved and reconciled in the test schema.`,
          );
          setShowSuccessModal(true);
        } finally {
          window.clearInterval(poller);
        }
        return;
      } catch (error) {
        setCurrentStepId('mapping');
        setFlowState('error');
        const message = error instanceof Error ? error.message : 'The sandbox upload failed.';
        setStatusMessage(message);
        setSubmissionIssues((current) =>
          current.length > 0 ? current : [{ fieldName: 'Submission', severity: 'error', message }],
        );
        setShowWarningModal(true);
        return;
      }
    }

    const runStep = async (stepId: SubmissionStepId, message: string, ms = 850) => {
      setCurrentStepId(stepId);
      setStatusMessage(message);
      await wait(ms);
    };

    // Step 1 — upload: build FormData and call the real API
    setCurrentStepId('upload');
    setStatusMessage('Uploading report to diocesan secure storage...');

    const reportType = institutionType === 'school' ? 'School FS' : 'Seminary FS';

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

  const handleManualSubmit = async (entries: ManualSubmissionEntry[]) => {
    setFlowState('running');
    setSubmissionIssues([]);
    setCurrentStepId('upload');
    setStatusMessage('Saving the manual IAFR report to the submission sandbox...');
    try {
      const headers = await getApiRequestHeaders(true);
      const response = await fetch('/api/submissions/test-runs', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          institutionName: parishName,
          reportingMonth: selectedMonth + 1,
          reportingYear: year,
          formVersion: 'iafr_2026_v1',
          entries,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'The manual sandbox submission failed.');

      setCurrentStepId('success');
      setFlowState('success');
      setStatusMessage('Manual IAFR values passed canonical mapping and were saved only in the test schema.');
      setSubmissionResult({ submissionId: result.runId, filePath: '', validationStatus: result.status });
      setShowSuccessModal(true);
    } catch (error) {
      setCurrentStepId('mapping');
      setFlowState('error');
      const message = error instanceof Error ? error.message : 'The manual sandbox submission failed.';
      setStatusMessage(message);
      setSubmissionIssues([{ fieldName: 'Manual entry', severity: 'error', message }]);
      setShowWarningModal(true);
    }
  };

  return (
    <div className="min-h-full bg-[#f6f6f4]">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-black"
            >
              <ArrowLeft size={17} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600">
                Submission Module
              </span>
              <span className="rounded border border-gold-200 bg-gold-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-gold-700">
                {roleBadgeMap[institutionType]}
              </span>
            </div>
            <h1 className="truncate font-serif text-xl font-bold leading-tight text-black sm:text-2xl">{heading}</h1>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-500">
              {parishName} <span className="px-1 text-gold-500">/</span> {vicariate}
            </p>
          </div>

          <div className="hidden min-w-52 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 sm:flex">
            <Calendar className="h-4 w-4 shrink-0 text-gold-600" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Submission deadline</p>
              <p
                className={`mt-0.5 text-sm font-semibold ${submissionWhatIf.isOverdue ? 'text-red-700' : 'text-gray-900'}`}
              >
                {submissionWhatIf.deadline}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
            {institutionType === 'parish' && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                  Submission method
                </p>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionMode('upload');
                      setStatusMessage(
                        'No submission has started yet. Download a template or choose a report file to begin.',
                      );
                    }}
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${submissionMode === 'upload' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                  >
                    <FileUp className={`h-4 w-4 ${submissionMode === 'upload' ? 'text-gold-400' : ''}`} /> Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionMode('manual');
                      setStatusMessage('Enter IAFR values manually, then review and submit the test report.');
                    }}
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${submissionMode === 'manual' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                  >
                    <Keyboard className={`h-4 w-4 ${submissionMode === 'manual' ? 'text-gold-400' : ''}`} /> Manual
                    entry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionMode('ocr');
                      setStatusMessage('Upload a scanned PDF, run OCR, then validate the mapped manual fields.');
                    }}
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${submissionMode === 'ocr' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                  >
                    <ScanLine className={`h-4 w-4 ${submissionMode === 'ocr' ? 'text-gold-400' : ''}`} /> OCR PDF
                  </button>
                </div>
              </div>
            )}

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
              {institutionType === 'parish' && (
                <label className="w-full sm:w-56">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    Reporting period
                  </span>
                  <select
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(Number(event.target.value))}
                    className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-black outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
                  >
                    {MONTHS.map((month, index) => (
                      <option key={month} value={index}>
                        {month} {year}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => setIsGuideOpen((open) => !open)}
                aria-expanded={isGuideOpen}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-black"
              >
                <FileText className="h-4 w-4" /> How it works
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${isGuideOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600 sm:px-5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold-700" />
            <span className="truncate">{statusMessage}</span>
          </div>

          <AnimatePresence initial={false}>
            {isGuideOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.18 } }}
                className="overflow-hidden"
              >
                <div className="grid border-t border-gray-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-gray-200">
                  {[
                    { step: '01', title: 'Download template', detail: 'Use the approved report format.' },
                    {
                      step: '02',
                      title: 'Submit report',
                      detail: `Upload ${acceptedFormatsLabel}, run OCR PDF, or use manual entry.`,
                    },
                    {
                      step: '03',
                      title: 'Review result',
                      detail: 'Confirm validation and submission status before saving.',
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="flex gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0 sm:border-t-0 sm:px-5"
                    >
                      <span className="text-xs font-bold text-gold-700">{item.step}</span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-950">{item.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-gray-500">{item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="hidden"
        >
          <Card className="overflow-hidden rounded-lg border-gray-200 bg-white p-0 shadow-sm hover:shadow-sm md:rounded-lg">
            <CardContent>
              <div className="flex items-start gap-4 px-5 py-5 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold-200 bg-gold-50 text-gold-700">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-black sm:text-2xl">What-if submission period</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    Preview the deadline and status for a reporting month.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 border-t border-gray-200 px-5 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    Reporting period
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-black outline-none transition-colors hover:border-gray-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
                  >
                    {MONTHS.map((month, idx) => (
                      <option key={month} value={idx}>
                        {month} {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 sm:grid-cols-4 sm:divide-x sm:divide-gray-200">
                  <div className="px-4 py-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">Deadline</p>
                    <p
                      className={`mt-1.5 text-sm font-semibold ${submissionWhatIf.isOverdue ? 'text-red-700' : 'text-black'}`}
                    >
                      {submissionWhatIf.deadline.split(' ')[0]} {submissionWhatIf.deadline.split(' ')[1]}
                    </p>
                  </div>
                  <div className="border-l border-gray-200 px-4 py-3.5 sm:border-l">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">
                      {submissionWhatIf.isOverdue ? 'Days overdue' : 'Days remaining'}
                    </p>
                    <p
                      className={`mt-1.5 text-sm font-semibold ${submissionWhatIf.isOverdue ? 'text-red-700' : 'text-black'}`}
                    >
                      {submissionWhatIf.daysRemaining}
                    </p>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-3.5 sm:border-t-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">Status</p>
                    <p
                      className={`mt-1.5 text-sm font-semibold ${submissionWhatIf.isOverdue ? 'text-red-700' : 'text-black'}`}
                    >
                      {submissionWhatIf.status}
                    </p>
                  </div>
                  <div className="border-l border-t border-gray-200 px-4 py-3.5 sm:border-t-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">Cycle year</p>
                    <p className="mt-1.5 text-sm font-semibold text-black">{year}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-4 sm:px-6">
                {submissionWhatIf.isOverdue && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-red-200 bg-red-50 p-4"
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

                {submissionWhatIf.isCurrentMonth && !submissionWhatIf.isOverdue && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-gold-200 bg-gold-50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
                      <div>
                        <p className="font-semibold text-black">Active period</p>
                        <p className="mt-1 text-sm text-gray-700">
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
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
                      <div>
                        <p className="font-semibold text-black">Upcoming period</p>
                        <p className="mt-1 text-sm text-gray-700">
                          {submissionWhatIf.month} is your next submission period. Begin preparing your financial
                          reports now to ensure timely submission by {submissionWhatIf.deadline.split(' ')[0]}{' '}
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
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
                      <div>
                        <p className="font-semibold text-black">Future period</p>
                        <p className="mt-1 text-sm text-gray-700">
                          You're exploring a future submission period ({submissionWhatIf.month}). Use this to test
                          workflows and understand deadline requirements in advance.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {(institutionType !== 'parish' || submissionMode === 'upload') && (
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
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
                showAnomalyControls={institutionType !== 'parish'}
              />
            </motion.div>
          </div>
        )}

        {institutionType === 'parish' && submissionMode === 'manual' && (
          <ManualIAFRForm
            parishName={parishName}
            reportingMonth={selectedMonth + 1}
            reportingYear={year}
            disabled={permissions?.upload_csv_entity !== true}
            isSubmitting={flowState === 'running'}
            onSubmit={handleManualSubmit}
          />
        )}

        {institutionType === 'parish' && submissionMode === 'ocr' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
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
                  file={selectedOcrFile}
                  fileSizeLabel={ocrFileSizeLabel}
                  validationMessage={ocrValidationMessage}
                  acceptedFormats=".pdf"
                  isSubmitting={flowState === 'running'}
                  anomalyMode={anomalyMode}
                  onModeChange={setAnomalyMode}
                  onFileSelect={handleOcrFileSelection}
                  onRequestUpload={handleRequestOcrUpload}
                  onRemoveFile={() => handleOcrFileSelection(null)}
                  disabled={permissions?.upload_csv_entity !== true}
                  showAnomalyControls={false}
                  requestLabel="Run OCR and Prefill"
                  submittingLabel="Reading Scanned PDF..."
                />
              </motion.div>
            </div>

            {ocrDraft && (
              <ManualIAFRForm
                parishName={parishName}
                reportingMonth={selectedMonth + 1}
                reportingYear={year}
                disabled={permissions?.upload_csv_entity !== true}
                isSubmitting={flowState === 'running'}
                initialValues={ocrDraft.values}
                ocrReviewMetadata={ocrDraft.metadata}
                onSubmit={handleManualSubmit}
              />
            )}
          </div>
        )}

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
        title={institutionType === 'parish' ? 'Submission Needs Review' : 'Anomaly Detected'}
        message={
          institutionType === 'parish'
            ? `${submissionIssues.length || 1} issue(s) prevented the report from being saved to the test schema. Review the details below, correct the file, and submit it again.`
            : 'The uploaded report contains unusual values and needs review. The simulated flow stopped before loading to the database.'
        }
        details={institutionType === 'parish' ? submissionIssues : undefined}
        primaryLabel="Replace File"
        onPrimary={() => resetFlow(false)}
        secondaryLabel="Cancel Submission"
        onSecondary={() => resetFlow(true)}
      />
    </div>
  );
}
