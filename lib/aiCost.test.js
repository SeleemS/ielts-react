import { describe, expect, it } from 'vitest';
import {
  audioUsageRow,
  chatUsageRow,
  realtimeReservationRow,
} from './aiCost';

describe('AI cost normalization', () => {
  it('prices paid chat tokens with cached input separated', () => {
    const row = chatUsageRow({
      userId: 'user-1',
      skill: 'writing',
      feature: 'writing_score',
      operation: 'rubric_score',
      model: 'gpt-5.1',
      payload: {
        id: 'chatcmpl-1',
        usage: {
          prompt_tokens: 2500,
          completion_tokens: 1200,
          prompt_tokens_details: { cached_tokens: 500 },
        },
      },
    });
    expect(row).toMatchObject({
      input_tokens: 2500,
      cached_input_tokens: 500,
      output_tokens: 1200,
      pricing_known: true,
      estimated: false,
    });
    expect(row.cost_usd).toBeCloseTo(0.0145625, 8);
  });

  it('keeps unknown models visible as unpriced instead of recording zero cost', () => {
    const row = chatUsageRow({
      userId: 'user-1',
      skill: 'writing',
      feature: 'writing_score',
      operation: 'rubric_score',
      model: 'future-model',
      payload: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
    });
    expect(row.pricing_known).toBe(false);
    expect(row.cost_usd).toBeNull();
  });

  it('keeps a known model unpriced when the provider omits usage', () => {
    const row = chatUsageRow({
      userId: 'user-1',
      skill: 'speaking',
      feature: 'speaking_realtime_score',
      operation: 'rubric_score',
      model: 'gpt-5.1',
      payload: { id: 'chatcmpl-without-usage' },
    });
    expect(row.pricing_known).toBe(false);
    expect(row.cost_usd).toBeNull();
  });

  it('prices Whisper from provider-reported duration', () => {
    const row = audioUsageRow({
      userId: 'user-1',
      skill: 'speaking',
      feature: 'speaking_transcription',
      operation: 'transcribe_recording',
      durationSeconds: 120,
    });
    expect(row.cost_usd).toBeCloseTo(0.012, 8);
    expect(row.audio_seconds).toBe(120);
  });

  it('records Realtime reservations as an explicit planning estimate', () => {
    const row = realtimeReservationRow({
      userId: 'user-1',
      durationSeconds: 300,
      mode: 'part1',
    });
    expect(row.estimated).toBe(true);
    expect(row.cost_usd).toBeCloseTo(0.3, 8);
    expect(row.metadata.methodology).toBe('reserved_duration_estimate');
  });
});
