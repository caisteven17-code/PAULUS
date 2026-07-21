'use client';

import React from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { SubmissionTemplate } from './types';

interface TemplateFormatOption {
  format: 'xlsx' | 'csv';
  onDownload: () => void;
}

interface TemplateDownloadCardProps {
  template: SubmissionTemplate;
  institutionLabel: string;
  isLoading: boolean;
  onDownload: () => void;
  disabled?: boolean;
  /** Real admin-uploaded templates, when available — one button per format instead of the generic mock download. */
  formatOptions?: TemplateFormatOption[];
}

export function TemplateDownloadCard({
  template,
  institutionLabel,
  isLoading,
  onDownload,
  disabled,
  formatOptions,
}: TemplateDownloadCardProps) {
  return (
    <Card className="overflow-hidden rounded-lg border-gray-200 bg-white p-0 shadow-sm">
      <CardHeader className="mb-0 border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black text-gold-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm text-church-black">Report template</CardTitle>
            <p className="mt-0.5 text-xs text-gray-500">Approved submission format</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold leading-5 text-church-black">{template.title}</p>
            <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-600">
              {template.version}
            </span>
          </div>
          <p className="mt-1 break-all text-xs text-gray-500">{template.fileName}</p>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            Use this {institutionLabel.toLowerCase()} format for file upload.
          </p>
        </div>

        {formatOptions && formatOptions.length > 0 ? (
          <div className={`grid gap-2 ${formatOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {formatOptions.map((option) => (
              <button
                key={option.format}
                onClick={option.onDownload}
                disabled={disabled}
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition disabled:cursor-not-allowed ${
                  disabled
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 shadow-none'
                    : 'bg-black text-white hover:bg-gray-800'
                }`}
              >
                <Download className="h-4 w-4" />
                Download .{option.format}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={onDownload}
            disabled={isLoading || disabled}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition disabled:cursor-not-allowed ${
              disabled
                ? 'bg-gray-100 text-gray-400 border border-gray-200 shadow-none'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {disabled ? 'Download Disabled' : isLoading ? 'Retrieving Template...' : 'Download Template'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
