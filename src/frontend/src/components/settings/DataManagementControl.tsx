'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Database, UploadCloud, CheckCircle2, Loader2 } from 'lucide-react';
import { SubmissionTracker } from '../projects/SubmissionTracker';
import { ClassificationManagement, ClassificationRecord } from '../ui/ClassificationManagement';
import { motion } from 'motion/react';

interface CSVUploadSectionProps {
  title: string;
  description: string;
  type: 'parish' | 'seminary' | 'diocese';
}

function CSVUploadSection({ title, description, type }: CSVUploadSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col h-full shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-[#FDF6E3] rounded-xl flex items-center justify-center border border-[#F9EBC8] group-hover:scale-110 transition-transform">
          <Database className="w-6 h-6 text-[#D4AF37]" />
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-lg">{title}</h4>
          <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest font-bold">CSV Template</p>
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mb-6 flex-grow leading-relaxed">
        {description}
      </p>

      <div className="space-y-3">
        <div className="relative">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${
              isSuccess 
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
  const [activeTab, setActiveTab] = useState<'templates' | 'submissions' | 'classifications'>('templates');

  // Mock submission data - in production, this would come from your backend
  const mockSubmissions = useMemo(() => [
    { id: '1', entityName: "St. Matthew's Parish", entityType: 'parish' as const, district: 'District 1', vicariate: 'Holy Family', lastSubmissionDate: new Date('2024-04-15'), status: 'on-time' as const, monthsLate: 0, budgetSet: true, budgetAmount: 600000 },
    { id: '2', entityName: "San Roque Parish", entityType: 'parish' as const, district: 'District 2', vicariate: 'San Pedro Apostol', lastSubmissionDate: new Date('2024-03-20'), status: 'warning' as const, monthsLate: 1, budgetSet: false },
    { id: '3', entityName: "Our Lady of Peace", entityType: 'parish' as const, district: 'District 1', vicariate: 'Sta. Rosa De Lima', lastSubmissionDate: new Date('2024-01-10'), status: 'action-required' as const, monthsLate: 4, budgetSet: true, budgetAmount: 800000 },
    { id: '4', entityName: "St. John Seminary", entityType: 'seminary' as const, district: 'District 3', vicariate: 'Holy Family', lastSubmissionDate: new Date('2024-04-10'), status: 'on-time' as const, monthsLate: 0, budgetSet: true, budgetAmount: 2000000 },
    { id: '5', entityName: "Sacred Heart School", entityType: 'school' as const, district: 'District 2', vicariate: 'San Isidro Labrador', lastSubmissionDate: undefined, status: 'not-submitted' as const, monthsLate: 0, budgetSet: false },
  ], []);

  // Mock classification data
  const mockClassifications = useMemo<ClassificationRecord[]>(() => [
    { id: '1', entityName: "St. Matthew's Parish", currentClass: 'Class B', annualIncome: 1800000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-03-15', recommendedAction: 'none' },
    { id: '2', entityName: "San Roque Parish", currentClass: 'Class D', annualIncome: 450000, isSubsidized: true, subsidyLocked: true, lastReviewed: '2024-02-20', recommendedAction: 'none' },
    { id: '3', entityName: "Our Lady of Peace", currentClass: 'Class D', annualIncome: 680000, isSubsidized: true, subsidyLocked: false, lastReviewed: '2024-01-10', recommendedAction: 'reclassify' },
    { id: '4', entityName: "St. John Seminary", currentClass: 'Class A', annualIncome: 2800000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-03-20', recommendedAction: 'none' },
    { id: '5', entityName: "Sacred Heart School", currentClass: 'Class C', annualIncome: 920000, isSubsidized: false, subsidyLocked: false, lastReviewed: '2024-02-15', recommendedAction: 'none' },
  ], []);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-gray-900">Data Management</h3>
          <p className="text-sm text-gray-500">Manage financial data templates and track submission status across the diocese.</p>
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
        <button
          onClick={() => setActiveTab('classifications')}
          className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${
            activeTab === 'classifications'
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Classification Management
        </button>
      </div>

      {/* Tab Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CSVUploadSection 
              title="Parish" 
              description="Upload financial reporting data for all parishes within the diocese. Includes collections, receipts, and disbursements."
              type="parish"
            />
            <CSVUploadSection 
              title="Seminary" 
              description="Upload seminary financial data, including enrollment data and operational costs."
              type="seminary"
            />
            <CSVUploadSection 
              title="Diocese" 
              description="Upload centralized reporting for the overall diocese, general funds, and mission-specific allocations."
              type="diocese"
            />
          </div>
        )}

        {activeTab === 'submissions' && (
          <SubmissionTracker
            submissions={mockSubmissions}
            onViewDetails={(submission) => {}}
            onExportReport={() => {}}
          />
        )}

        {activeTab === 'classifications' && (
          <ClassificationManagement
            classifications={mockClassifications}
            onUpdateClassification={(id, updates) => {}}
            onToggleLock={(id, locked) => {}}
          />
        )}
      </motion.div>
    </div>
  );
}
