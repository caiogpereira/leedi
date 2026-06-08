import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepIndicator } from '../step-indicator.js';

describe('StepIndicator', () => {
  it('highlights the current step', () => {
    const { container } = render(
      <StepIndicator totalSteps={5} currentStep={2} completedSteps={[1]} />
    );
    // Current step label should have text-primary class
    const labels = container.querySelectorAll('span.text-primary');
    // Step 1 (completed) and Step 2 (current) both get text-primary
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders correct step labels', () => {
    render(<StepIndicator totalSteps={5} currentStep={1} completedSteps={[]} />);
    expect(screen.getByText('Empresa')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Gateway')).toBeTruthy();
    expect(screen.getByText('Agente')).toBeTruthy();
    expect(screen.getByText('Teste')).toBeTruthy();
  });

  it('renders CheckCircle icons for completed steps', () => {
    const { container } = render(
      <StepIndicator totalSteps={5} currentStep={3} completedSteps={[1, 2]} />
    );
    // CheckCircle SVGs appear in the completed step bubbles
    const circles = container.querySelectorAll('svg');
    expect(circles.length).toBeGreaterThanOrEqual(5); // 5 steps = 5 icons
  });
});
