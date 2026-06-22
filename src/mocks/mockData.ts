import type {
  Scene,
  AudioSource,
  UnifiedChatMessage,
  UnifiedActivityEvent,
  CombinedStats,
  OutputStats,
} from '../types';

export const mockScenes: Scene[] = [
  {
    id: 'scene-1',
    name: 'Main Scene',
    isActive: true,
    sources: [
      { id: 'src-1', name: 'Webcam', type: 'camera', visible: true, settings: {} },
      { id: 'src-2', name: 'Game Capture', type: 'display_capture', visible: true, settings: {} },
      { id: 'src-3', name: 'Alerts', type: 'browser', visible: true, settings: { url: 'https://example.com' } },
    ],
  },
  {
    id: 'scene-2',
    name: 'BRB Screen',
    isActive: false,
    sources: [
      { id: 'src-4', name: 'BRB Image', type: 'image', visible: true, settings: {} },
    ],
  },
  {
    id: 'scene-3',
    name: 'Starting Soon',
    isActive: false,
    sources: [
      { id: 'src-5', name: 'Starting Image', type: 'image', visible: true, settings: {} },
      { id: 'src-6', name: 'Music', type: 'media', visible: true, settings: {} },
    ],
  },
];

export const mockAudioSources: AudioSource[] = [
  { id: 'audio-1', name: 'Microphone', volume: 0.8, muted: false, meterLevel: 0.45 },
  { id: 'audio-2', name: 'Desktop Audio', volume: 0.6, muted: false, meterLevel: 0.3 },
  { id: 'audio-3', name: 'Music', volume: 0.3, muted: true, meterLevel: 0.0 },
];

export const mockChatMessages: UnifiedChatMessage[] = [
  {
    id: 'msg-1',
    platform: 'twitch',
    channelId: '123456',
    username: 'mysticlloyd',
    displayName: 'Mysticlloyd',
    userColor: '#FF4500',
    message: 'Cheer to take #3!',
    timestamp: Date.now() - 60000,
    isSub: true,
  },
  {
    id: 'msg-2',
    platform: 'kick',
    channelId: '789012',
    username: 'kiwidanja',
    displayName: 'KiwiDanja',
    message: "that's pretty cool",
    timestamp: Date.now() - 45000,
  },
  {
    id: 'msg-3',
    platform: 'kick',
    channelId: '789012',
    username: 'biglogied',
    displayName: 'BigLogieD',
    message: 'up to',
    timestamp: Date.now() - 30000,
  },
  {
    id: 'msg-4',
    platform: 'twitch',
    channelId: '123456',
    username: 'half_asleep',
    displayName: 'Half_Asleep',
    userColor: '#00FF7F',
    message: 'lets gooo',
    timestamp: Date.now() - 20000,
    isMod: true,
  },
  {
    id: 'msg-5',
    platform: 'twitch',
    channelId: '123456',
    username: 'streamfan99',
    displayName: 'StreamFan99',
    userColor: '#1E90FF',
    message: 'great stream today!',
    timestamp: Date.now() - 10000,
    isVip: true,
  },
  {
    id: 'msg-6',
    platform: 'kick',
    channelId: '789012',
    username: 'nightowl',
    displayName: 'NightOwl',
    message: 'just joined, whats the game?',
    timestamp: Date.now() - 5000,
  },
];

export const mockActivityEvents: UnifiedActivityEvent[] = [
  {
    id: 'evt-1',
    platform: 'kick',
    type: 'stream_streak',
    username: 'mysticlloyd',
    message: 'reached 3-stream streak',
    timestamp: Date.now() - 120000,
  },
  {
    id: 'evt-2',
    platform: 'twitch',
    type: 'cheer',
    username: 'half_asleep',
    message: 'cheered 80 bits',
    amount: 80,
    timestamp: Date.now() - 90000,
  },
  {
    id: 'evt-3',
    platform: 'kick',
    type: 'resub',
    username: 'mysticlloyd',
    message: 'resubscribed for 1 month',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'evt-4',
    platform: 'twitch',
    type: 'follow',
    username: 'newviewer42',
    timestamp: Date.now() - 45000,
  },
  {
    id: 'evt-5',
    platform: 'twitch',
    type: 'gift_sub',
    username: 'generous_guy',
    message: 'gifted 5 subs',
    amount: 5,
    timestamp: Date.now() - 30000,
  },
  {
    id: 'evt-6',
    platform: 'kick',
    type: 'follow',
    username: 'kickfan123',
    timestamp: Date.now() - 15000,
  },
];

export const mockStats: CombinedStats = {
  totalViewers: 37,
  platforms: [
    { platform: 'twitch', viewers: 12, followers: 2070, subscribers: 7, updatedAt: Date.now() },
    { platform: 'kick', viewers: 25, followers: 890, subscribers: 3, updatedAt: Date.now() },
  ],
};

export const mockOutputStats: OutputStats = {
  isStreaming: true,
  isRecording: false,
  bitrateKbps: 6000,
  droppedFrames: 2,
  totalFrames: 12480,
  cpuUsage: 12.4,
  fps: 60,
  streamDuration: 828,
  targets: [
    { platform: 'twitch', connected: true, bitrateKbps: 6000, droppedFrames: 1 },
    { platform: 'kick', connected: true, bitrateKbps: 6000, droppedFrames: 1 },
  ],
};
