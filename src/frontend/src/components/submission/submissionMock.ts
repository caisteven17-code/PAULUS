'use client';

import { AnomalySimulationMode, SubmissionInstitutionType, SubmissionStep, SubmissionTemplate } from './types';

export const submissionSteps: SubmissionStep[] = [
  { id: 'upload', label: 'Uploading Report', description: 'Preparing your file inside the submission sandbox.' },
  { id: 'cleaning', label: 'Data Cleaning', description: 'Formatting and normalizing uploaded values.' },
  { id: 'anomaly', label: 'Anomaly Check', description: 'Checking for unusual or suspicious financial values.' },
  { id: 'validation', label: 'Data Validation', description: 'Validating required structure and business rules.' },
  { id: 'loading', label: 'Loading to Database', description: 'Simulating save to the temporary submission pipeline.' },
  {
    id: 'success',
    label: 'Report Submitted Successfully',
    description: 'Submission flow completed in frontend-only mode.',
  },
];

const parishTemplateContent = [
  'Month,Collections,Consumable Collections,Disbursements,Expenses,Remittances,Budget Allocation',
  'January,0,0,0,0,0,0',
  'February,0,0,0,0,0,0',
  'March,0,0,0,0,0,0',
].join('\n');

const seminaryTemplateContent = [
  'Month,Formation Income,Subsidy,Disbursements,Operating Expenses,Remittances,Budget Allocation',
  'January,0,0,0,0,0,0',
  'February,0,0,0,0,0,0',
  'March,0,0,0,0,0,0',
].join('\n');

const schoolTemplateContent = [
  'Month,Tuition Income,Mission Support,Disbursements,Operating Expenses,Remittances,Budget Allocation',
  'January,0,0,0,0,0,0',
  'February,0,0,0,0,0,0',
  'March,0,0,0,0,0,0',
].join('\n');

export const submissionTemplates: Record<SubmissionInstitutionType, SubmissionTemplate> = {
  parish: {
    id: 'template-parish-financial-report',
    type: 'parish',
    title: 'Parish Financial Report Template',
    description:
      'Monthly parish financial submission template for collections, disbursements, and related report fields.',
    fileName: 'parish-financial-report-template.csv',
    version: 'v1.0',
    updatedAt: 'May 2026',
    content: parishTemplateContent,
  },
  seminary: {
    id: 'template-seminary-financial-report',
    type: 'seminary',
    title: 'Seminary Financial Report Template',
    description: 'Seminary monthly reporting template for formation income, subsidy, remittances, and operating costs.',
    fileName: 'seminary-financial-report-template.csv',
    version: 'v1.0',
    updatedAt: 'May 2026',
    content: seminaryTemplateContent,
  },
  school: {
    id: 'template-school-financial-report',
    type: 'school',
    title: 'School Financial Report Template',
    description:
      'School monthly submission template for tuition income, support funds, expenses, and budget allocations.',
    fileName: 'school-financial-report-template.csv',
    version: 'v1.0',
    updatedAt: 'May 2026',
    content: schoolTemplateContent,
  },
};

export const institutionHeadingMap: Record<SubmissionInstitutionType, string> = {
  parish: 'Parish Financial Report Submission',
  seminary: 'Seminary Financial Report Submission',
  school: 'School Financial Report Submission',
};

export const institutionDescriptionMap: Record<SubmissionInstitutionType, string> = {
  parish:
    'Download the parish template and simulate a monthly financial report submission without touching production analytics.',
  seminary:
    'Download the seminary template and test the full frontend submission flow using temporary mock processing states.',
  school:
    'Download the school template and simulate a frontend-only report submission for finance review and validation.',
};

// Parish IAFR uploads go through the real cleaning pipeline (iafr_cleaner.py),
// which only has extraction front-ends for .xlsx and .csv — no .xls/.pdf parser
// exists. School/seminary stay on the original frontend-only mock flow.
export const acceptedSubmissionExtensionsByType: Record<SubmissionInstitutionType, string[]> = {
  parish: ['xlsx', 'csv'],
  seminary: ['xlsx', 'xls', 'csv', 'pdf'],
  school: ['xlsx', 'xls', 'csv', 'pdf'],
};

export const acceptedSubmissionFormatsByType: Record<SubmissionInstitutionType, string> = {
  parish: '.xlsx,.csv',
  seminary: '.xlsx,.xls,.csv,.pdf',
  school: '.xlsx,.xls,.csv,.pdf',
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shouldSimulateAnomaly(mode: AnomalySimulationMode, file: File) {
  if (mode === 'force-anomaly') return true;
  if (mode === 'force-clean') return false;

  const lowerName = file.name.toLowerCase();
  if (lowerName.includes('anomaly') || lowerName.includes('warning')) return true;
  if (lowerName.includes('clean') || lowerName.includes('ok')) return false;

  return Math.random() < 0.35;
}

export function triggerMockTemplateDownload(template: SubmissionTemplate) {
  const blob = new Blob([template.content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = template.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
