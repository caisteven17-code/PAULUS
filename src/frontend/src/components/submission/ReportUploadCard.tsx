'use client';

import React, { useRef } from 'react';
import { AlertCircle, FileUp, RefreshCcw, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { AnomalySimulationMode } from './types';

interface ReportUploadCardProps {
  file: File | null;
  fileSizeLabel: string;
  validationMessage: string;
  acceptedFormats: string;
  isSubmitting: boolean;
  anomalyMode: AnomalySimulationMode;
  onModeChange: (mode: AnomalySimulationMode) => void;
  onFileSelect: (file: File | null) => void;
  onRequestUpload: () => void;
  onRemoveFile: () => void;
  disabled?: boolean;
  showAnomalyControls?: boolean;
  requestLabel?: string;
  submittingLabel?: string;
}

const anomalyOptions: Array<{ value: AnomalySimulationMode; label: string; description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Randomized mock anomaly result' },
  { value: 'force-clean', label: 'Force Clean', description: 'Always continue the happy path' },
  { value: 'force-anomaly', label: 'Force Anomaly', description: 'Always stop on anomaly detection' },
];

export function ReportUploadCard({
  file,
  fileSizeLabel,
  validationMessage,
  acceptedFormats,
  isSubmitting,
  anomalyMode,
  onModeChange,
  onFileSelect,
  onRequestUpload,
  onRemoveFile,
  disabled,
  showAnomalyControls = true,
  requestLabel = 'Submit Report',
  submittingLabel = 'Submission In Progress...',
}: ReportUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="overflow-hidden rounded-lg border-gray-200 bg-white p-0 shadow-sm">
      <CardHeader className="mb-0 border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gold-200 bg-gold-50 text-gold-800">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm text-church-black">Upload report</CardTitle>
            <p className="mt-0.5 text-xs text-gray-500">Choose a completed report, then confirm submission.</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5">
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-5">
          {file ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-church-black break-all">{file.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{fileSizeLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => !disabled && inputRef.current?.click()}
                    disabled={disabled}
                    className="rounded-md border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-church-black disabled:opacity-50"
                    title="Replace file"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => !disabled && onRemoveFile()}
                    disabled={disabled}
                    className="rounded-md border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-red-600 disabled:opacity-50"
                    title="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-gold-200 bg-gold-50 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gold-800">Ready to submit</p>
                <p className="mt-1 text-sm font-medium text-gray-800">File passed the initial format check.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-7 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-800">
                <FileUp className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-church-black">
                  {disabled ? 'Upload Access Restricted' : 'No file selected'}
                </p>
                <p className="text-xs text-gray-500">
                  {disabled
                    ? 'Please contact your administrator.'
                    : `Accepted file types: ${acceptedFormats.replaceAll('.', '').toUpperCase()}`}
                </p>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={acceptedFormats}
            className="hidden"
            disabled={disabled}
            onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
          />
        </div>

        <button
          onClick={() => !disabled && inputRef.current?.click()}
          disabled={disabled}
          className={`flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition disabled:cursor-not-allowed ${
            disabled
              ? 'bg-gray-100 text-gray-400 border-gray-200 shadow-none'
              : 'bg-white text-church-black border-gray-300 hover:border-gray-500 hover:bg-gray-50'
          }`}
        >
          <FileUp className="h-4 w-4" />
          {disabled ? 'Upload Disabled' : file ? 'Replace Selected File' : 'Choose Report File'}
        </button>

        {showAnomalyControls && <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Anomaly Test Mode</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {anomalyOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => !disabled && onModeChange(option.value)}
                disabled={disabled}
                className={`rounded-md border p-3.5 text-left transition disabled:opacity-60 disabled:cursor-not-allowed ${
                  anomalyMode === option.value
                    ? 'border-gold-300 bg-gold-50'
                    : 'border-gray-200 bg-white hover:border-gold-200'
                }`}
              >
                <p className="text-sm font-bold text-church-black">{option.label}</p>
                <p className="mt-1 text-[11px] text-gray-500">{option.description}</p>
              </button>
            ))}
          </div>
        </div>}

        {validationMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{validationMessage}</p>
          </div>
        )}

        {disabled && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">You do not have permission to upload entity reports.</p>
          </div>
        )}

        <button
          onClick={onRequestUpload}
          disabled={!file || !!validationMessage || isSubmitting || disabled}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <Upload className="h-4 w-4" />
          {isSubmitting ? submittingLabel : requestLabel}
        </button>
      </CardContent>
    </Card>
  );
}
