'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  FileText,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent } from '../components/ui/Card';
import { FinancialRecord } from '../types';
import { TemplateDownloadCard } from '../components/submission/TemplateDownloadCard';
import { ReportUploadCard } from '../components/submission/ReportUploadCard';
import { UploadConfirmationModal } from '../components/submission/UploadConfirmationModal';
import { SubmissionProgress } from '../components/submission/SubmissionProgress';
import { SubmissionResultModal } from '../components/submission/SubmissionResultModal';
import {
  acceptedSubmissionExtensions,
  acceptedSubmissionFormats,
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

interface ParishDataSubmissionProps {
  parishName?: string;
  vicariate?: string;
  parishClass?: string;
  year?: number;
  onBack?: () => void;
  onImport?: (records: FinancialRecord[]) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const institutionType = useMemo(() => resolveInstitutionType(parishClass), [parishClass]);
  const heading = institutionHeadingMap[institutionType];
  const template = submissionTemplates[institutionType];
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [flowState, setFlowState] = useState<SubmissionFlowState>('idle');
  const [currentStepId, setCurrentStepId] = useState<SubmissionStepId | null>(null);
  const [anomalyMode, setAnomalyMode] = useState<AnomalySimulationMode>('auto');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'No submission has started yet. Download a template or choose a report file to begin.'
  );

  const fileSizeLabel = selectedFile ? formatFileSize(selectedFile.size) : '';

  const validateFile = (file: File | null) => {
    if (!file) return 'Please select a financial report file first.';

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!acceptedSubmissionExtensions.includes(extension)) {
      return 'Invalid file type. Please upload an XLSX, XLS, CSV, or PDF file.';
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
        ? 'Valid file selected. Review the file details, then confirm the upload to start the simulated submission process.'
        : 'No submission has started yet. Download a template or choose a report file to begin.'
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
    setStatusMessage(
      keepFile && selectedFile
        ? 'You can review the same file again or replace it before another simulated submission.'
        : 'No submission has started yet. Download a template or choose a report file to begin.'
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

    await runStep('upload', 'Uploading report in frontend-only mode...');
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
    await runStep('loading', 'Simulating load to database...');
    await runStep('success', 'Report Submitted Successfully.', 500);

    setFlowState('success');
    setStatusMessage(
      'The simulated submission completed successfully. No real database, analytics, or official records were changed.'
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
            <h1 className="truncate text-lg font-serif font-black text-church-green sm:text-xl">
              {heading}
            </h1>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 sm:text-xs">
              {parishName} • {vicariate}
            </p>
          </div>

          <div className="hidden rounded-2xl border border-gray-200 bg-church-light/50 px-4 py-3 text-right sm:block">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Next Deadline</p>
            <p className="mt-1 text-sm font-bold text-red-600">{deadlineLabel}</p>
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
                  <p className="mt-1 text-[11px] text-gray-500">Choose a completed XLSX, XLS, CSV, or PDF file.</p>
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
                    <p className="text-sm font-bold text-church-black">Simulation only</p>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                      Nothing here is sent to a real database or backend yet.
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
                      <p className="mt-1 text-sm leading-relaxed text-blue-700">
                        XLSX, XLS, CSV, PDF
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Submission year</p>
                      <p className="mt-1 text-sm leading-relaxed text-emerald-700">
                        Reporting cycle {year}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <ReportUploadCard
              file={selectedFile}
              fileSizeLabel={fileSizeLabel}
              validationMessage={validationMessage}
              acceptedFormats={acceptedSubmissionFormats}
              isSubmitting={flowState === 'running'}
              anomalyMode={anomalyMode}
              onModeChange={setAnomalyMode}
              onFileSelect={handleFileSelection}
              onRequestUpload={handleRequestUpload}
              onRemoveFile={() => handleFileSelection(null)}
            />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <SubmissionProgress
            steps={submissionSteps}
            currentStepId={currentStepId}
            flowState={flowState}
          />
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
        message="The frontend-only submission flow completed successfully. This report has not been stored in a real database or added to production analytics."
        primaryLabel="Done"
        onPrimary={() => resetFlow(true)}
      />

      <SubmissionResultModal
        isOpen={showWarningModal}
        variant="warning"
        title="Anomaly Detected"
        message="The uploaded report contains unusual values and needs review. The simulated flow stopped before loading to the database."
        primaryLabel="Replace File"
        onPrimary={() => resetFlow(false)}
        secondaryLabel="Cancel Submission"
        onSecondary={() => resetFlow(true)}
      />
    </div>
  );
}
