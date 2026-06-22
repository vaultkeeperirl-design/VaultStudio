import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createStatsDecorator } = require('./stream-stats');

describe('createStatsDecorator', () => {
  it('holds the last positive bitrate across a brief zero-byte stats sample while streaming', () => {
    let now = 1000;
    const decorate = createStatsDecorator({ now: () => now, cpuPercent: () => 12.5 });

    decorate({ isStreaming: true, totalBytes: 0, targets: [{ id: 'kick', totalBytes: 0 }] });

    now = 2000;
    const flowing = decorate({ isStreaming: true, totalBytes: 750000, targets: [{ id: 'kick', totalBytes: 750000 }] });
    expect(flowing.bitrateKbps).toBe(6000);
    expect(flowing.targets[0].bitrateKbps).toBe(6000);

    now = 3000;
    const idleSample = decorate({ isStreaming: true, totalBytes: 750000, targets: [{ id: 'kick', totalBytes: 750000 }] });
    expect(idleSample.bitrateKbps).toBe(6000);
    expect(idleSample.targets[0].bitrateKbps).toBe(6000);
    expect(idleSample.cpuUsage).toBe(12.5);

    now = 4000;
    const deadSample = decorate({ isStreaming: true, totalBytes: 750000, targets: [{ id: 'kick', totalBytes: 750000 }] });
    expect(deadSample.bitrateKbps).toBe(0);
    expect(deadSample.targets[0].bitrateKbps).toBe(0);
  });

  it('resets bitrate state once streaming stops', () => {
    let now = 1000;
    const decorate = createStatsDecorator({ now: () => now, cpuPercent: vi.fn(() => 0) });

    decorate({ isStreaming: true, totalBytes: 0, targets: [] });
    now = 2000;
    decorate({ isStreaming: true, totalBytes: 500000, targets: [] });
    now = 3000;
    const stopped = decorate({ isStreaming: false, totalBytes: 500000, targets: [] });

    expect(stopped.bitrateKbps).toBe(0);
  });
});
