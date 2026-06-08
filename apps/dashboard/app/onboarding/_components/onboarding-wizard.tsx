'use client';

import { useState, useEffect } from 'react';
import { StepIndicator } from './step-indicator';
import { Step1 } from './step-1';
import { Step2 } from './step-2';
import { Step3 } from './step-3';
import { Step4 } from './step-4';
import { Step5 } from './step-5';

interface ProgressResponse {
  currentStep: number;
  completedSteps: number[];
  stepData: Record<number, Record<string, unknown>>;
}

interface Props {
  tenantId: string;
}

export function OnboardingWizard({ tenantId }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepData, setStepData] = useState<Record<number, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/onboarding/progress`)
      .then((r) => r.json() as Promise<ProgressResponse>)
      .then((data) => {
        setCurrentStep(data.currentStep);
        setCompletedSteps(data.completedSteps);
        setStepData(data.stepData);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [tenantId]);

  function advanceTo(step: number, newCompletedStep?: number) {
    if (newCompletedStep !== undefined) {
      setCompletedSteps((prev) =>
        prev.includes(newCompletedStep) ? prev : [...prev, newCompletedStep]
      );
    }
    setCurrentStep(step);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const stepProps = { tenantId, stepData, onAdvance: advanceTo };

  return (
    <div className="w-full max-w-2xl flex flex-col items-center">
      <StepIndicator
        totalSteps={5}
        currentStep={currentStep}
        completedSteps={completedSteps}
      />

      <div className="w-full bg-card border rounded-xl p-8 shadow-sm">
        {currentStep === 1 && <Step1 {...stepProps} />}
        {currentStep === 2 && <Step2 {...stepProps} />}
        {currentStep === 3 && <Step3 {...stepProps} />}
        {currentStep === 4 && <Step4 {...stepProps} />}
        {currentStep === 5 && <Step5 {...stepProps} />}
      </div>
    </div>
  );
}
