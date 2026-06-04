'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { SubmissionFlowState, SubmissionStep, SubmissionStepId } from './types';

interface SubmissionProgressProps {
  steps: SubmissionStep[];
  currentStepId: SubmissionStepId | null;
  flowState: SubmissionFlowState;
}

function getStepState(
  step: SubmissionStep,
  steps: SubmissionStep[],
  currentStepId: SubmissionStepId | null,
  flowState: SubmissionFlowState,
) {
  if (!currentStepId || flowState === 'idle') return 'pending';

  const currentIndex = steps.findIndex((item) => item.id === currentStepId);
  const stepIndex = steps.findIndex((item) => item.id === step.id);

  if (flowState === 'anomaly') {
    if (step.id === 'anomaly') return 'warning';
    if (stepIndex < currentIndex) return 'complete';
    return 'pending';
  }

  if (flowState === 'success') return 'complete';
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

export function SubmissionProgress({ steps, currentStepId, flowState }: SubmissionProgressProps) {
  return (
    <Card className="space-y-4">
      <CardHeader className="mb-0">
        <CardTitle className="text-sm md:text-base text-church-black tracking-[0.18em]">Submission Progress</CardTitle>
        <p className="text-sm text-gray-500">Track the current simulated submission step.</p>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => {
          const state = getStepState(step, steps, currentStepId, flowState);

          return (
            <div
              key={step.id}
              className={`rounded-[1.5rem] border p-4 transition-all ${
                state === 'complete'
                  ? 'border-emerald-200 bg-emerald-50'
                  : state === 'active'
                    ? 'border-gold-300 bg-gold-50'
                    : state === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {state === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : state === 'active' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gold-700" />
                  ) : state === 'warning' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                  ) : (
                    <MoreHorizontal className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-church-black">{step.label}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{step.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
