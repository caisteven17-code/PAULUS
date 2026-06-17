'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Database,
  UploadCloud,
  CheckCircle2,
  Loader2,
  Church,
  BookOpen,
  GraduationCap,
  Download,
  FileSpreadsheet,
  ClipboardList,
} from 'lucide-react';
import { SubmissionTracker } from '../projects/SubmissionTracker';
import { motion } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';

interface CSVUploadSectionProps {
  title: string;
  description: string;
  type: 'parish' | 'seminary' | 'school' | 'diocese';
}

const TYPE_META: Record<CSVUploadSectionProps['type'], { icon: React.ElementType; label: string }> = {
  parish: { icon: Church, label: 'Parish CSV Template' },
  seminary: { icon: BookOpen, label: 'Seminary CSV Template' },
  school: { icon: GraduationCap, label: 'School CSV Template' },
  diocese: { icon: Database, label: 'Diocese CSV Template' },
};

function CSVUploadSection({ title, description, type }: CSVUploadSectionProps) {
  const { permissions } = usePermissions();
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = type === 'diocese' ? permissions.upload_csv_admin === true : permissions.upload_csv_entity === true;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setIsUploading(true);
      setTimeout(() => {
        setIsUploading(false);
        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 3000);
      }, 1500);
    }
  };

  const meta = TYPE_META[type];
  const IconComponent = meta.icon;

  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_18px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
          <IconComponent className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h4 className="font-serif text-lg font-bold text-slate-900">{title}</h4>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{meta.label}</p>
        </div>
      </div>

      <p className="mb-6 flex-grow text-sm leading-relaxed text-slate-500">{description}</p>

      <div className="space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Download className="h-4 w-4 text-slate-400" />
          Download blank template
        </button>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || !canUpload}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all ${
            !canUpload
              ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
              : isSuccess
                ? 'bg-emerald-500 text-white'
                : 'bg-gold-500 text-black shadow-lg shadow-gold-500/20 hover:bg-gold-400'
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : isSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Uploaded
            </>
          ) : !canUpload ? (
            <>Upload disabled</>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" /> Upload CSV
            </>
          )}
        </button>
        {fileName && !isSuccess && !isUploading && (
          <p className="truncate px-2 text-center text-[10px] font-medium text-slate-400">{fileName}</p>
        )}
      </div>
    </div>
  );
}

export function DataManagementControl() {
  const { permissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<'templates' | 'submissions'>('templates');

  const isDiocese = permissions.view_diocese === true;
  const isParish = permissions.view_parish === true;
  const isSeminary = permissions.view_seminary === true;
  const isSchool =
    permissions.view_school === true ||
    permissions.view_school_cluster === true ||
    permissions.view_school_all === true;

  const mockSubmissions = useMemo(
    () => [
      {
        id: '1',
        entityName: "St. Matthew's Parish",
        entityType: 'parish' as const,
        district: 'District 1',
        vicariate: 'Holy Family',
        contactNumber: '0917 000 1001',
        email: 'stmatthews@diocese-sanpablo.ph',
        lastSubmissionDate: new Date('2024-04-15'),
        status: 'on-time' as const,
        monthsLate: 0,
        budgetSet: true,
        budgetAmount: 600000,
      },
      {
        id: '2',
        entityName: 'San Roque Parish',
        entityType: 'parish' as const,
        district: 'District 2',
        vicariate: 'San Pedro Apostol',
        contactNumber: '0917 000 1002',
        email: 'sanroque@diocese-sanpablo.ph',
        lastSubmissionDate: new Date('2024-03-20'),
        status: 'warning' as const,
        monthsLate: 1,
        budgetSet: false,
      },
      {
        id: '3',
        entityName: 'Our Lady of Peace',
        entityType: 'parish' as const,
        district: 'District 1',
        vicariate: 'Sta. Rosa De Lima',
        contactNumber: '0917 000 1003',
        email: 'ourladyofpeace@diocese-sanpablo.ph',
        lastSubmissionDate: new Date('2024-01-10'),
        status: 'action-required' as const,
        monthsLate: 4,
        budgetSet: true,
        budgetAmount: 800000,
      },
      {
        id: '4',
        entityName: 'St. John Seminary',
        entityType: 'seminary' as const,
        district: 'District 3',
        vicariate: 'Holy Family',
        contactNumber: '0917 000 2001',
        email: 'stjohnseminary@diocese-sanpablo.ph',
        lastSubmissionDate: new Date('2024-04-10'),
        status: 'on-time' as const,
        monthsLate: 0,
        budgetSet: true,
        budgetAmount: 2000000,
      },
      {
        id: '5',
        entityName: 'Sacred Heart School',
        entityType: 'school' as const,
        district: 'District 2',
        vicariate: 'San Isidro Labrador',
        contactNumber: '0917 000 3001',
        email: 'sacredheartschool@diocese-sanpablo.ph',
        lastSubmissionDate: undefined,
        status: 'not-submitted' as const,
        monthsLate: 0,
        budgetSet: false,
      },
    ],
    [],
  );

  const templatesToRender = useMemo(() => {
    const list: CSVUploadSectionProps[] = [];
    if (isDiocese || isParish)
      list.push({
        title: 'Parish',
        description:
          'Financial reporting data for parishes — collections, receipts, and disbursements.',
        type: 'parish',
      });
    if (isDiocese || isSeminary)
      list.push({
        title: 'Seminary',
        description: 'Seminary financial data, including enrollment figures and operational costs.',
        type: 'seminary',
      });
    if (isDiocese || isSchool)
      list.push({
        title: 'School',
        description: 'School financial data — tuition collections, operating budgets, and personnel expenses.',
        type: 'school',
      });
    if (isDiocese)
      list.push({
        title: 'Diocese',
        description: 'Centralized reporting for the diocese, general funds, and mission allocations.',
        type: 'diocese',
      });
    return list;
  }, [isDiocese, isParish, isSeminary, isSchool]);

  const filteredSubmissions = useMemo(() => {
    if (isDiocese) return mockSubmissions;
    if (isParish) return mockSubmissions.filter((s) => s.entityType === 'parish');
    if (isSeminary) return mockSubmissions.filter((s) => s.entityType === 'seminary');
    if (isSchool) return mockSubmissions.filter((s) => s.entityType === 'school');
    return [];
  }, [isDiocese, isParish, isSeminary, isSchool, mockSubmissions]);

  const tabs = [
    { id: 'templates' as const, label: 'CSV Templates', icon: FileSpreadsheet },
    { id: 'submissions' as const, label: 'Submission Tracking', icon: ClipboardList },
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-600">Diocesan Operations</p>
          <h3 className="mt-1 font-serif text-2xl font-bold text-slate-900">Data Management</h3>
          <p className="mt-1 text-sm text-slate-500">
            Manage financial data templates and track submission status across the diocese.
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900">
          <Database className="h-6 w-6 text-gold-400" />
        </div>
      </div>

      {/* Pill tabs */}
      <div className="mb-7 inline-flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition-all ${
                active ? 'bg-black text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-slate-400'}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'templates' && (
          <div
            className={`grid grid-cols-1 gap-5 ${
              templatesToRender.length >= 4
                ? 'md:grid-cols-2 xl:grid-cols-4'
                : templatesToRender.length === 3
                  ? 'md:grid-cols-3'
                  : templatesToRender.length === 2
                    ? 'md:grid-cols-2'
                    : 'max-w-md'
            }`}
          >
            {templatesToRender.map((tpl) => (
              <CSVUploadSection key={tpl.title} title={tpl.title} description={tpl.description} type={tpl.type} />
            ))}
          </div>
        )}

        {activeTab === 'submissions' && (
          <SubmissionTracker
            submissions={filteredSubmissions}
            onViewDetails={() => {}}
            onExportReport={() => {}}
            showBudgetInfo={false}
            showExportButton={false}
          />
        )}
      </motion.div>
    </div>
  );
}
