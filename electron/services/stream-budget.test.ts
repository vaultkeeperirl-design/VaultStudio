import { describe, expect, it } from 'vitest';
import { planStreamBitrates } from './stream-budget';

describe('planStreamBitrates', () => {
  it('keeps a single target at the configured video bitrate', () => {
    expect(planStreamBitrates({ targetCount: 1, videoBitrateKbps: 6000, audioBitrateKbps: 160 })).toEqual({
      targetCount: 1,
      videoBitrateKbps: 6000,
      audioBitrateKbps: 160,
      estimatedAggregateKbps: 6160,
      capped: false,
    });
  });

  it('caps two stream targets near the default 10000 kbps aggregate upload budget', () => {
    expect(planStreamBitrates({ targetCount: 2, videoBitrateKbps: 6000, audioBitrateKbps: 160 })).toEqual({
      targetCount: 2,
      videoBitrateKbps: 4840,
      audioBitrateKbps: 160,
      estimatedAggregateKbps: 10000,
      capped: true,
    });
  });

  it('divides the available aggregate budget across every active target', () => {
    expect(planStreamBitrates({ targetCount: 3, videoBitrateKbps: 10000, audioBitrateKbps: 160 })).toEqual({
      targetCount: 3,
      videoBitrateKbps: 3173,
      audioBitrateKbps: 160,
      estimatedAggregateKbps: 9999,
      capped: true,
    });
  });
});
