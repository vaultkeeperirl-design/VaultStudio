const ZERO_SAMPLE_HOLD_COUNT = 1;

function nextSmoothedBitrate(state, rawKbps) {
  if (rawKbps > 0) {
    state.zeroSamples = 0;
    state.ema = state.ema > 0 ? Math.round(state.ema * 0.65 + rawKbps * 0.35) : rawKbps;
    return state.ema;
  }

  if (state.ema > 0 && state.zeroSamples < ZERO_SAMPLE_HOLD_COUNT) {
    state.zeroSamples += 1;
    return state.ema;
  }

  state.zeroSamples = 0;
  state.ema = 0;
  return 0;
}

function createStatsDecorator({ now = Date.now, cpuPercent = () => 0 } = {}) {
  const totalState = { bytes: 0, at: 0, ema: 0, zeroSamples: 0 };
  const targetStates = new Map();

  return function decorateStats(stats) {
    const currentAt = now();
    const streaming = !!stats.isStreaming;

    if (!streaming) {
      totalState.bytes = stats.totalBytes || 0;
      totalState.at = currentAt;
      totalState.ema = 0;
      totalState.zeroSamples = 0;
      targetStates.clear();
      stats.bitrateKbps = 0;
      for (const t of stats.targets || []) t.bitrateKbps = 0;
      stats.cpuUsage = cpuPercent();
      return stats;
    }

    let rawTotalKbps = 0;
    const totalBytes = stats.totalBytes || 0;
    if (totalState.at > 0 && currentAt > totalState.at && totalBytes >= totalState.bytes) {
      rawTotalKbps = Math.max(0, Math.round(((totalBytes - totalState.bytes) * 8) / (currentAt - totalState.at)));
    }
    stats.bitrateKbps = nextSmoothedBitrate(totalState, rawTotalKbps);
    totalState.bytes = totalBytes;
    totalState.at = currentAt;

    const seenTargets = new Set();
    for (const t of stats.targets || []) {
      seenTargets.add(t.id);
      const targetState = targetStates.get(t.id) || { bytes: t.totalBytes || 0, at: 0, ema: 0, zeroSamples: 0 };
      const targetBytes = t.totalBytes || 0;
      let rawTargetKbps = 0;
      if (targetState.at > 0 && currentAt > targetState.at && targetBytes >= targetState.bytes) {
        rawTargetKbps = Math.max(0, Math.round(((targetBytes - targetState.bytes) * 8) / (currentAt - targetState.at)));
      }
      t.bitrateKbps = nextSmoothedBitrate(targetState, rawTargetKbps);
      targetState.bytes = targetBytes;
      targetState.at = currentAt;
      targetStates.set(t.id, targetState);
    }

    for (const id of targetStates.keys()) {
      if (!seenTargets.has(id)) targetStates.delete(id);
    }

    stats.cpuUsage = cpuPercent();
    return stats;
  };
}

module.exports = { createStatsDecorator };
