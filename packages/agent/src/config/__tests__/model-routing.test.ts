import { describe, it, expect } from 'vitest';
import {
  SALES_MODELS,
  MODEL_PRICING,
  TASK_MODELS,
  modelIdForTask,
} from '../model-routing.js';

describe('model-routing', () => {
  it('pins the canonical Anthropic model ids', () => {
    expect(SALES_MODELS.sonnet).toBe('claude-sonnet-4-6');
    expect(SALES_MODELS.haiku).toBe('claude-haiku-4-5-20251001');
    expect(SALES_MODELS.opus).toBe('claude-opus-4-8');
  });

  it('routes cheap auxiliary tasks to haiku', () => {
    expect(TASK_MODELS.tag_classification).toBe('haiku');
    expect(TASK_MODELS.handoff_summary).toBe('haiku');
    expect(TASK_MODELS.text_improvement).toBe('haiku');
  });

  it('routes the sales conversation to sonnet', () => {
    expect(TASK_MODELS.sales_conversation).toBe('sonnet');
  });

  it('modelIdForTask returns the Haiku id for classification + handoff', () => {
    expect(modelIdForTask('tag_classification')).toBe('claude-haiku-4-5-20251001');
    expect(modelIdForTask('handoff_summary')).toBe('claude-haiku-4-5-20251001');
    expect(modelIdForTask('text_improvement')).toBe('claude-haiku-4-5-20251001');
  });

  it('modelIdForTask returns the Sonnet id for the sales conversation', () => {
    expect(modelIdForTask('sales_conversation')).toBe('claude-sonnet-4-6');
  });

  it('prices are per-token (already divided by 1e6)', () => {
    expect(MODEL_PRICING.sonnet.input).toBeCloseTo(0.000003, 12);
    expect(MODEL_PRICING.sonnet.output).toBeCloseTo(0.000015, 12);
    expect(MODEL_PRICING.haiku.input).toBeCloseTo(0.00000025, 12);
    expect(MODEL_PRICING.haiku.output).toBeCloseTo(0.00000125, 12);
    expect(MODEL_PRICING.opus.input).toBeCloseTo(0.000015, 12);
    expect(MODEL_PRICING.opus.output).toBeCloseTo(0.000075, 12);
  });
});
