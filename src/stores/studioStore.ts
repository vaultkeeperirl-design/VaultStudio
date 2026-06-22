import { create } from 'zustand';
import type {
  Scene,
  AudioSource,
  UnifiedChatMessage,
  UnifiedActivityEvent,
  CombinedStats,
  OutputStats,
  ChatTarget,
  ObsConnectionState,
  GuardStatus,
  PlatformStatus,
  Platform,
} from '../types';

type StudioState = {
  scenes: Scene[];
  audioSources: AudioSource[];
  chatMessages: UnifiedChatMessage[];
  activityEvents: UnifiedActivityEvent[];
  stats: CombinedStats;
  outputStats: OutputStats | null;
  activeSceneId: string | null;
  chatTarget: ChatTarget;
  obsState: ObsConnectionState;
  obsInstalled: boolean;
  guardStatus: GuardStatus | null;
  platformStatuses: PlatformStatus[];
  platformVisibility: Record<Platform, boolean>;
  toast: string | null;
};

type StudioActions = {
  setScenes: (scenes: Scene[]) => void;
  switchScene: (sceneId: string) => void;
  setAudioSources: (sources: AudioSource[]) => void;
  patchAudioSource: (id: string, patch: Partial<AudioSource>) => void;
  updateAudioMeters: (meters: { id: string; level: number }[]) => void;
  addChatMessage: (message: UnifiedChatMessage) => void;
  setChatMessages: (messages: UnifiedChatMessage[]) => void;
  clearChat: () => void;
  addActivityEvent: (event: UnifiedActivityEvent) => void;
  setActivityEvents: (events: UnifiedActivityEvent[]) => void;
  setStats: (stats: CombinedStats) => void;
  setOutputStats: (stats: OutputStats) => void;
  setChatTarget: (target: ChatTarget) => void;
  setObsState: (state: ObsConnectionState, installed?: boolean) => void;
  setGuardStatus: (status: GuardStatus) => void;
  setPlatformStatuses: (statuses: PlatformStatus[]) => void;
  setPlatformVisibility: (platform: Platform, enabled: boolean) => void;
  initPlatformVisibility: (connections: { platform: Platform; dashboardEnabled: boolean }[]) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
};

export const useStudioStore = create<StudioState & StudioActions>((set) => ({
  scenes: [],
  audioSources: [],
  chatMessages: [],
  activityEvents: [],
  stats: { totalViewers: 0, platforms: [] },
  outputStats: null,
  activeSceneId: null,
  chatTarget: 'all',
  obsState: 'disconnected',
  obsInstalled: true,
  guardStatus: null,
  platformStatuses: [],
  platformVisibility: { twitch: false, kick: false, youtube: false, tiktok: false },
  toast: null,

  setScenes: (scenes) => {
    const active = scenes.find((s) => s.isActive);
    set({ scenes, activeSceneId: active?.id ?? null });
  },

  switchScene: (sceneId) =>
    set((state) => ({
      activeSceneId: sceneId,
      scenes: state.scenes.map((s) => ({
        ...s,
        isActive: s.id === sceneId,
      })),
    })),

  setAudioSources: (audioSources) => set({ audioSources }),

  patchAudioSource: (id, patch) =>
    set((state) => ({
      audioSources: state.audioSources.map((src) => (src.id === id ? { ...src, ...patch } : src)),
    })),

  updateAudioMeters: (meters) =>
    set((state) => {
      const levelMap = new Map(meters.map((m) => [m.id, m.level]));
      return {
        audioSources: state.audioSources.map((src) =>
          levelMap.has(src.id) && !src.muted ? { ...src, meterLevel: levelMap.get(src.id)! } : src
        ),
      };
    }),

  addChatMessage: (message) =>
    set((state) => {
      // Defense in depth against duplicates (reconnects, history overlap).
      if (state.chatMessages.some((m) => m.id === message.id)) return state;
      return { chatMessages: [...state.chatMessages.slice(-199), message] };
    }),

  setChatMessages: (chatMessages) => set({ chatMessages: chatMessages.slice(-200) }),

  clearChat: () => set({ chatMessages: [] }),

  addActivityEvent: (event) =>
    set((state) => {
      if (state.activityEvents.some((e) => e.id === event.id)) return state;
      return { activityEvents: [...state.activityEvents.slice(-99), event] };
    }),

  setActivityEvents: (activityEvents) => set({ activityEvents: activityEvents.slice(-100) }),

  setStats: (stats) => set({ stats }),

  setOutputStats: (outputStats) => set({ outputStats }),

  setChatTarget: (chatTarget) => set({ chatTarget }),

  setObsState: (obsState, installed) =>
    set((state) => ({ obsState, obsInstalled: installed ?? state.obsInstalled })),

  setGuardStatus: (guardStatus) => set({ guardStatus }),

  setPlatformStatuses: (platformStatuses) => set({ platformStatuses }),

  setPlatformVisibility: (platform, enabled) =>
    set((state) => ({
      platformVisibility: { ...state.platformVisibility, [platform]: enabled },
    })),

  initPlatformVisibility: (connections) =>
    set(() => {
      const vis: Record<Platform, boolean> = { twitch: false, kick: false, youtube: false, tiktok: false };
      for (const c of connections) {
        vis[c.platform] = c.dashboardEnabled;
      }
      return { platformVisibility: vis };
    }),

  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
}));
