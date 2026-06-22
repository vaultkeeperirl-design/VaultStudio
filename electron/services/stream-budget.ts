export type StreamBitratePlan = {
  targetCount: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  estimatedAggregateKbps: number;
  capped: boolean;
};

const DEFAULT_VIDEO_BITRATE_KBPS = 6000;
const DEFAULT_AUDIO_BITRATE_KBPS = 160;
const DEFAULT_MULTISTREAM_UPLOAD_CAP_KBPS = 10000;

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function planStreamBitrates({
  targetCount,
  videoBitrateKbps,
  audioBitrateKbps,
  aggregateUploadCapKbps = DEFAULT_MULTISTREAM_UPLOAD_CAP_KBPS,
}: {
  targetCount: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  aggregateUploadCapKbps?: number;
}): StreamBitratePlan {
  const count = Math.max(1, positiveInt(targetCount, 1));
  const requestedVideo = positiveInt(videoBitrateKbps, DEFAULT_VIDEO_BITRATE_KBPS);
  const audio = positiveInt(audioBitrateKbps, DEFAULT_AUDIO_BITRATE_KBPS);
  const aggregateCap = positiveInt(aggregateUploadCapKbps, DEFAULT_MULTISTREAM_UPLOAD_CAP_KBPS);

  let video = requestedVideo;
  if (count > 1) {
    const availableVideoBudget = Math.max(count, aggregateCap - audio * count);
    video = Math.min(requestedVideo, Math.floor(availableVideoBudget / count));
  }

  return {
    targetCount: count,
    videoBitrateKbps: video,
    audioBitrateKbps: audio,
    estimatedAggregateKbps: (video + audio) * count,
    capped: video < requestedVideo,
  };
}

export function formatStreamBitrateWarning(plan: StreamBitratePlan): string | undefined {
  if (!plan.capped) return undefined;
  return `Multistream bitrate capped to ${plan.videoBitrateKbps.toLocaleString()} kbps per target (${plan.estimatedAggregateKbps.toLocaleString()} kbps total) to protect upload stability.`;
}
