'use client';

export type SubmissionInstitutionType = 'parish' | 'seminary' | 'school';

export type SubmissionStepId =
  | 'upload'
  | 'cleaning'
  | 'anomaly'
  | 'validation'
  | 'calculation'
  | 'mapping'
  | 'loading'
  | 'reconciliation'
  | 'success';

export type SubmissionFlowState = 'idle' | 'running' | 'success' | 'warning' | 'anomaly' | 'error';

export type AnomalySimulationMode = 'auto' | 'force-clean' | 'force-anomaly';

export interface SubmissionTemplate {
  id: string;
  type: SubmissionInstitutionType;
  title: string;
  description: string;
  fileName: string;
  version: string;
  updatedAt: string;
  content: string;
}

export interface SubmissionStep {
  id: SubmissionStepId;
  label: string;
  description: string;
}
