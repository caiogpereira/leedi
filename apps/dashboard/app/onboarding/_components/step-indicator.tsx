'use client';

import { CheckCircle, Circle } from 'lucide-react';

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number;
  completedSteps: number[];
}

const STEP_LABELS = ['Empresa', 'WhatsApp', 'Gateway', 'Agente', 'Teste'];

export function StepIndicator({ totalSteps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div className="w-full max-w-2xl mb-8">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors ${
                    isCompleted
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isCurrent
                        ? 'border-primary text-primary bg-background'
                        : 'border-muted text-muted-foreground bg-background'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`mt-1 text-xs font-medium ${
                    isCurrent
                      ? 'text-primary'
                      : isCompleted
                        ? 'text-primary'
                        : 'text-muted-foreground'
                  }`}
                >
                  {STEP_LABELS[i]}
                </span>
              </div>
              {step < totalSteps && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    isCompleted ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
