'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Database, UploadCloud, CheckCircle2, Loader2, Church, BookOpen, GraduationCap } from 'lucide-react';
import { SubmissionTracker } from '../projects/SubmissionTracker';
import { motion } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';

interface CSVUploadSectionProps {
  title: string;
  description: string;
  type: 'parish' | 'seminary' | 'school' | 'diocese';
}

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
      // Simulate upload
      setTimeout(() => {
        setIsUploading(false);
        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 3000);
      }, 1500);
    }
  };

  const meta = {
    parish: {
      icon: Church,
      bg: 'bg-emerald-50 border-emerald-100',
      iconColor: 'text-emerald-600',
      labelColor: 'text-emerald-600',
      label: 'Parish CSV Template',
    },
    seminary: {
      icon: BookOpen,
      bg: 'bg-blue-50 border-blue-100',
      iconColor: 'text-blue-600',
      labelColor: 'text-blue-600',
      label: 'Seminary CSV Template',
    },
    school: {
      icon: GraduationCap,
      bg: 'bg-purple-50 border-purple-100',
      iconColor: 'text-purple-600',
      labelColor: 'text-purple-600',
      label: 'School CSV Template',
    },
    diocese: {
      icon: Database,
      bg: 'bg-amber-50 border-amber-100',
      iconColor: 'text-amber-600',
      labelColor: 'text-amber-600',
      label: 'Diocese CSV Template',
    },
  }[type];

  const IconComponent = meta.icon;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col h-full shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center gap-4 mb-4">
        <div
          className={`w-12 h-12 ${meta.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}
        >
          <IconComponent className={`w-6 h-6 ${meta.iconColor}`} />
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-lg">{title}</h4>
          <p className={`text-[10px] ${meta.labelColor} uppercase tracking-widest font-bold`}>{meta.label}</p>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-6 flex-grow leading-relaxed">{description}</p>

      <div className="space-y-3">
        <div className="relative">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !canUpload}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${
              !canUpload
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 shadow-none'
                : isSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#D4AF37] text-white hover:bg-[#B5952F] shadow-lg shadow-[#D4AF37]/20'
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Uploaded Successfully
              </>
            ) : !canUpload ? (
              <>Upload Disabled</>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                Upload CSV
              </>
            )}
          </button>
        </div>
        {fileName && !isSuccess && !isUploading && (
          <p className="text-[10px] text-gray-400 text-center truncate px-2 font-medium">{fileName}</p>
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

  // Mock submission data - in production, this would come from your backend
  const mockSubmissions = useMemo(
    () => [
      {
        id: '1',
        entityName: "St. Matthew's Parish",
        entityType: 'parish' as const,
        district: 'District 1',
        vicariate: 'Holy Family',
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
        lastSubmissionDate: undefined,
        status: 'not-submitted' as const,
        monthsLate: 0,
        budgetSet: false,
      },
    ],
    [],
  );

  const templatesToRender = useMemo(() => {
    const list = [];
    if (isDiocese || isParish) {
      list.push({
        title: 'Parish',
        description:
          'Upload financial reporting data for all parishes within the diocese. Includes collections, receipts, and disbursements.',
        type: 'parish' as const,
      });
    }
    if (isDiocese || isSeminary) {
      list.push({
        title: 'Seminary',
        description: 'Upload seminary financial data, including enrollment data and operational costs.',
        type: 'seminary' as const,
      });
    }
    if (isDiocese || isSchool) {
      list.push({
        title: 'School',
        description:
          'Upload school financial data, including tuition collections, operating budgets, and personnel expenses.',
        type: 'school' as const,
      });
    }
    if (isDiocese) {
      list.push({
        title: 'Diocese',
        description:
          'Upload centralized reporting for the overall diocese, general funds, and mission-specific allocations.',
        type: 'diocese' as const,
      });
    }
    return list;
  }, [isDiocese, isParish, isSeminary, isSchool]);

  const filteredSubmissions = useMemo(() => {
    if (isDiocese) return mockSubmissions;
    if (isParish) return mockSubmissions.filter((s) => s.entityType === 'parish');
    if (isSeminary) return mockSubmissions.filter((s) => s.entityType === 'seminary');
    if (isSchool) return mockSubmissions.filter((s) => s.entityType === 'school');
    return [];
  }, [isDiocese, isParish, isSeminary, isSchool, mockSubmissions]);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-gray-900">Data Management</h3>
          <p className="text-sm text-gray-500">
            Manage financial data templates and track submission status across the diocese.
          </p>
        </div>
        <div className="w-12 h-12 bg-[#FDF6E3] rounded-2xl flex items-center justify-center border border-[#F9EBC8]">
          <Database className="w-6 h-6 text-[#D4AF37]" />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${
            activeTab === 'templates'
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          CSV Templates
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${
            activeTab === 'submissions'
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Submission Tracking
        </button>
      </div>

      {/* Tab Content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'templates' && (
          <div
            className={`grid grid-cols-1 gap-6 ${
              templatesToRender.length === 4
                ? 'md:grid-cols-2 lg:grid-cols-4'
                : templatesToRender.length === 3
                  ? 'md:grid-cols-3'
                  : templatesToRender.length === 2
                    ? 'md:grid-cols-2'
                    : 'max-w-md mx-auto'
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
            onViewDetails={(submission) => {}}
            onExportReport={() => {}}
          />
        )}

      </motion.div>
    </div>
  );
}
