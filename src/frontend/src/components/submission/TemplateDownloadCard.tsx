'use client';

import React from 'react';
import { Database, Download, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { SubmissionTemplate } from './types';

interface TemplateDownloadCardProps {
  template: SubmissionTemplate;
  institutionLabel: string;
  isLoading: boolean;
  onDownload: () => void;
  disabled?: boolean;
}

export function TemplateDownloadCard({
  template,
  institutionLabel,
  isLoading,
  onDownload,
  disabled,
}: TemplateDownloadCardProps) {
  return (
    <Card className="space-y-5">
      <CardHeader className="mb-0">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
            <FileText className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-sm md:text-base text-church-black tracking-[0.18em]">
              Template Download
            </CardTitle>
            <p className="text-sm text-gray-500 leading-relaxed">
              Download the required {institutionLabel.toLowerCase()} template.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-[1.5rem] border border-gray-200 bg-church-light/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-church-black">{template.title}</p>
              <p className="mt-1 text-xs text-gray-500">{template.fileName}</p>
            </div>
            <div className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gold-700">
              {template.version}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 border border-gray-200">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Source</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-church-black">
                <Database className="h-4 w-4 text-church-green" />
                Mock Template
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 border border-gray-200">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Updated</p>
              <p className="mt-2 text-sm font-medium text-church-black">{template.updatedAt}</p>
            </div>
          </div>
        </div>

        <button
          onClick={onDownload}
          disabled={isLoading || disabled}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-bold transition-all disabled:cursor-not-allowed ${
            disabled
              ? 'bg-gray-100 text-gray-400 border border-gray-200 shadow-none'
              : 'bg-gold-500 text-black shadow-lg shadow-gold-500/20 hover:bg-gold-600'
          }`}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {disabled ? 'Download Disabled' : isLoading ? 'Retrieving Template...' : 'Download Template'}
        </button>
      </CardContent>
    </Card>
  );
}
