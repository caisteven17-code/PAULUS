'use client';

import React from 'react';
import { FinancialRecord } from '../../types';
import { LegacyDataImportExport } from './LegacyDataImportExport';
import { SeminaryFinancialDashboard } from './SeminaryFinancialDashboard';

interface DataImportExportProps {
  entityName: string;
  entityType: 'parish' | 'school' | 'seminary';
  year: number;
  onImport: (records: FinancialRecord[]) => void;
  lastSubmissionDate?: Date;
  budgetData?: { monthly: number; annual: number };
  onBudgetSave?: (monthly: number, annual: number) => void;
}

export function DataImportExport(props: DataImportExportProps) {
  if (props.entityType === 'seminary') {
    return <SeminaryFinancialDashboard entityName={props.entityName} year={props.year} />;
  }

  return <LegacyDataImportExport {...props} />;
}
