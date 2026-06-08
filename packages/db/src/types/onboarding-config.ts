export interface OnboardingConfig {
  onboarding_completed: boolean;
  current_step: number; // 1-5
  steps: {
    [step: number]: Record<string, unknown>; // saved form data per step
  };
  gateway_webhook_received?: boolean;
}
