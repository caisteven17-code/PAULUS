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

  if (flowState === 'anomaly' || flowState === 'warning') {
    if (step.id === currentStepId) return 'warning';
    if (stepIndex < currentIndex) return 'complete';
    return 'pending';
  }

  if (flowState === 'success') return 'complete';
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

export function SubmissionProgress({ steps, currentStepId, flowState }: SubmissionProgressProps) {
  if (flowState === 'idle') return null;

  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentStepId));
  const percent = flowState === 'success' ? 100 : Math.round(((currentIndex + 0.5) / steps.length) * 100);

  return (
    <Card className="space-y-4 rounded-lg p-5 shadow-sm hover:shadow-sm md:rounded-lg md:p-6">
      <CardHeader className="mb-0 flex-row items-end justify-between space-y-0">
        <div>
          <CardTitle className="text-sm text-black md:text-base">Submission progress</CardTitle>
          <p className="mt-1 text-sm text-gray-500">The tracker appears only after a submission starts.</p>
        </div>
        <span className="text-sm font-bold text-black">{percent}%</span>
      </CardHeader>

      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-gold-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>

      <CardContent className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
        {steps.map((step) => {
          const state = getStepState(step, steps, currentStepId, flowState);

          return (
            <div
              key={step.id}
              className="min-w-0"
            >
              <div className="flex items-start gap-2">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${state === 'complete' ? 'border-emerald-200 bg-emerald-50' : state === 'active' ? 'border-gold-300 bg-gold-50' : state === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                  {state === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : state === 'active' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gold-700" />
                  ) : state === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-4 text-black">{step.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
