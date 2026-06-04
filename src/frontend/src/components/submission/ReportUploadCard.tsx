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
}: ReportUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="space-y-5">
      <CardHeader className="mb-0">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-church-green/10 text-church-green">
            <Upload className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-sm md:text-base text-church-black tracking-[0.18em]">Upload Report</CardTitle>
            <p className="text-sm text-gray-500 leading-relaxed">
              Choose a completed report file, then confirm upload.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-[1.5rem] border border-dashed border-gold-300 bg-gold-50/30 p-5">
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
                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-church-black disabled:opacity-50"
                    title="Replace file"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => !disabled && onRemoveFile()}
                    disabled={disabled}
                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-red-600 disabled:opacity-50"
                    title="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Upload Status</p>
                <p className="mt-2 text-sm font-medium text-emerald-800">File ready for upload confirmation.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-7 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gold-700 border border-gold-200">
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
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-bold transition-all disabled:cursor-not-allowed ${
            disabled
              ? 'bg-gray-100 text-gray-400 border-gray-200 shadow-none'
              : 'bg-white text-church-black border-gray-200 hover:border-gold-300 hover:bg-gold-50'
          }`}
        >
          <FileUp className="h-4 w-4" />
          {disabled ? 'Upload Disabled' : file ? 'Replace Selected File' : 'Choose Report File'}
        </button>

        <div className="rounded-[1.5rem] border border-gray-200 bg-church-light/30 p-4 space-y-3">
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
                className={`rounded-2xl border p-3.5 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
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
        </div>

        {validationMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{validationMessage}</p>
          </div>
        )}

        {disabled && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">You do not have permission to upload entity reports.</p>
          </div>
        )}

        <button
          onClick={onRequestUpload}
          disabled={!file || !!validationMessage || isSubmitting || disabled}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-church-green px-4 py-4 text-sm font-bold text-white shadow-lg shadow-church-green/20 transition-all hover:bg-church-green/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {isSubmitting ? 'Submission In Progress...' : 'Submit Report'}
        </button>
      </CardContent>
    </Card>
  );
}
