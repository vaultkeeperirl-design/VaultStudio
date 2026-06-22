import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import { absoluteStrategy } from 'react-grid-layout/core';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { Panel } from '../components/layout/Panel';
import { TopBar, Logo, LogoIcon, TopBarActions } from '../components/layout/PanelGrid';
import logoUrl from '../assets/logo.png';
import { MemoizedPreviewPanel } from '../components/studio/PreviewPanel';
import { UnifiedChat } from '../components/studio/UnifiedChat';
import { ActivityFeed } from '../components/studio/ActivityFeed';
import { SessionInfo } from '../components/studio/SessionInfo';
import { ScenesPanel } from '../components/studio/ScenesPanel';
import { SourcesPanel } from '../components/studio/SourcesPanel';
import { AudioMixer } from '../components/studio/AudioMixer';
import { ControlBar } from '../components/studio/ControlBar';
import { Button } from '../components/common/Button';
import { useBlurDragCleanup } from '../hooks/useBlurDragCleanup';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useStudioStore } from '../stores/studioStore';
import { tokens } from '../theme/tokens';
import styled from 'styled-components';
import {
  DEFAULT_LAYOUT,
  type StudioLayout,
  type PanelId,
  type UnifiedChatMessage,
  type UnifiedActivityEvent,
  type CombinedStats,
  type DrawingOverlaySnapshot,
  type ObsConnectionState,
  type GuardStatus,
  type IrlStatus,
  type PlatformStatus,
  type SourceDevice,
  type SourceType,
  type SourceTransform,
} from '../types';

const PageRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`;

const GridContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: ${tokens.colors.bg};

  .react-grid-item.react-grid-placeholder {
    background: ${tokens.colors.gold};
    opacity: 0.15;
    border-radius: ${tokens.borderRadius.lg};
  }

  .react-grid-item > .resize-handle,
  .react-grid-item .react-resizable-handle {
    z-index: 5;
  }

  .panel-header {
    cursor: grab;
  }
`;

const PanelSlot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const ObsBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${tokens.spacing.md};
  padding: ${tokens.spacing.xs} ${tokens.spacing.lg};
  background-color: rgba(214, 162, 58, 0.1);
  border-bottom: 1px solid rgba(214, 162, 58, 0.3);
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  flex-shrink: 0;
`;

const Toast = styled.div`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.gold};
  color: ${tokens.colors.text};
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  z-index: 100;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
`;

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

// 1x1 transparent PNG — used to ask the engine to strip any leftover drawing
// overlays from the saved scene collection when there's nothing drawn.
const BLANK_OVERLAY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const GRID_COLS = 12;
const GRID_ROWS = 10;
const GRID_MARGIN = 8;

const PANEL_TITLES: Record<PanelId, string> = {
  session: 'Session',
  preview: 'Preview',
  activity: 'Activity',
  chat: 'Chat',
  scenes: 'Scenes',
  sources: 'Sources',
  audio: 'Audio',
};

export function StudioPage() {
  const navigate = useNavigate();
  const {
    scenes,
    audioSources,
    chatMessages,
    activityEvents,
    stats,
    outputStats,
    activeSceneId,
    chatTarget,
    obsState,
    guardStatus,
    platformStatuses,
    platformVisibility,
    toast,
    setScenes,
    setAudioSources,
    updateAudioMeters,
    addChatMessage,
    setChatMessages,
    addActivityEvent,
    setActivityEvents,
    setStats,
    setOutputStats,
    switchScene,
    setChatTarget,
    setObsState,
    setGuardStatus,
    setPlatformStatuses,
    initPlatformVisibility,
    showToast,
    clearToast,
    clearChat,
  } = useStudioStore();

  const initialized = useRef(false);
  const [layout, setLayout] = useState<StudioLayout>(DEFAULT_LAYOUT);
  const layoutLoaded = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [sourceDevices, setSourceDevices] = useState<Partial<Record<SourceType, SourceDevice[]>>>({});
  const [gridSize, setGridSize] = useState({ w: 1584, h: 760 });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [irlStatus, setIrlStatus] = useState<IrlStatus | null>(null);
  const drawingOverlayErrorShown = useRef(false);
  const latestDrawingSnapshot = useRef<DrawingOverlaySnapshot | null>(null);

  // Release any stuck panel drag when the user tabs/clicks away mid-drag.
  useBlurDragCleanup();

  // Track grid container size for the fluid grid.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) setGridSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadObsData = useCallback(async () => {
    if (!vaultApi) return;
    try {
      const [obsScenes, obsAudio, cameraDevices, audioInputDevices, audioOutputDevices, displayDevices, windowDevices] = await Promise.all([
        vaultApi.obs.getScenes(),
        vaultApi.obs.getAudioSources(),
        vaultApi.obs.listSourceDevices('camera').catch(() => []),
        vaultApi.obs.listSourceDevices('audio_input').catch(() => []),
        vaultApi.obs.listSourceDevices('audio_output').catch(() => []),
        vaultApi.obs.listSourceDevices('display_capture').catch(() => []),
        vaultApi.obs.listSourceDevices('window_capture').catch(() => []),
      ]);
      setScenes(obsScenes);
      setAudioSources(obsAudio);
      setSourceDevices({
        camera: cameraDevices,
        audio_input: audioInputDevices,
        audio_output: audioOutputDevices,
        display_capture: displayDevices,
        window_capture: windowDevices,
      });
    } catch (e) {
      console.error('Failed to load VSS data:', e);
    }
  }, [setScenes, setAudioSources]);

  const loadOutputStats = useCallback(async () => {
    if (!vaultApi) return;
    try {
      setOutputStats(await vaultApi.obs.getOutputStats());
    } catch {
      /* VSS engine offline */
    }
  }, [setOutputStats]);

  // One-time init: layout, history, initial state.
  useEffect(() => {
    if (initialized.current || !vaultApi) return;
    initialized.current = true;

    vaultApi.layout.get().then((saved) => {
      const valid =
        saved &&
        Array.isArray((saved as StudioLayout).items) &&
        (saved as StudioLayout).items.length === DEFAULT_LAYOUT.items.length;
      if (valid) setLayout(saved as StudioLayout);
      layoutLoaded.current = true;
    });
    vaultApi.obs.getConnectionState().then(({ state }) => setObsState(state, true));
    vaultApi.chat.getHistory().then(({ messages, activity }) => {
      setChatMessages(messages);
      setActivityEvents(activity);
    });
    vaultApi.platforms.getStats().then(setStats);
    vaultApi.platforms.getConnections().then(({ connections, statuses }) => {
      setPlatformStatuses(statuses);
      initPlatformVisibility(connections);
    });
    vaultApi.guard.get().then(({ status }) => setGuardStatus(status));
    vaultApi.irl.get().then(({ status }) => setIrlStatus(status));
    loadObsData();
    loadOutputStats();
  }, [loadObsData, loadOutputStats, setObsState, setChatMessages, setActivityEvents, setStats, setPlatformStatuses, setGuardStatus, initPlatformVisibility]);

  // Push event subscriptions.
  useEffect(() => {
    if (!vaultApi) return;

    const onChat = (...args: unknown[]) => addChatMessage(args[0] as UnifiedChatMessage);
    const onChatHistory = (...args: unknown[]) => setChatMessages(args[0] as UnifiedChatMessage[]);
    const onActivity = (...args: unknown[]) => addActivityEvent(args[0] as UnifiedActivityEvent);
    const onStats = (...args: unknown[]) => setStats(args[0] as CombinedStats);
    const onObsStatus = (...args: unknown[]) => {
      const state = args[0] as ObsConnectionState;
      setObsState(state);
      if (state === 'connected') {
        loadObsData();
        loadOutputStats();
      }
    };
    const onObsEvent = (...args: unknown[]) => {
      const { eventType, data } = args[0] as { eventType: string; data?: Record<string, unknown> };
      if (eventType === 'capture_conflict') {
        const name = typeof data?.sourceName === 'string' ? data.sourceName : 'A camera source';
        showToast(`${name} uses the same camera as another source — it was turned off. Remove the duplicate to avoid conflicts.`);
      }
      if (
        ['CurrentProgramSceneChanged', 'SceneListChanged', 'SceneItemEnableStateChanged',
          'SceneItemCreated', 'SceneItemRemoved', 'InputCreated', 'InputRemoved',
          'InputMuteStateChanged', 'InputVolumeChanged'].includes(eventType)
      ) {
        loadObsData();
      }
      if (['StreamStateChanged', 'RecordStateChanged'].includes(eventType)) {
        loadOutputStats();
      }
    };
    const onMeters = (...args: unknown[]) =>
      updateAudioMeters(args[0] as { id: string; level: number }[]);
    const onGuard = (...args: unknown[]) => {
      const status = args[0] as GuardStatus;
      setGuardStatus(status);
      if (status.message) showToast(status.message);
    };
    const onIrlStatus = (...args: unknown[]) => {
      const status = args[0] as IrlStatus;
      setIrlStatus(status);
      if (status.state === 'brb' && status.message) showToast(status.message);
    };
    const onPlatformStatus = (...args: unknown[]) => setPlatformStatuses(args[0] as PlatformStatus[]);
    const onPlatformError = (...args: unknown[]) => showToast(String(args[0]));
    const onVisibilityChanged = (...args: unknown[]) => {
      const vis = args[0] as Record<string, boolean>;
      for (const [platform, enabled] of Object.entries(vis)) {
        useStudioStore.getState().setPlatformVisibility(platform as any, enabled);
      }
    };

    vaultApi.on('chat:message', onChat);
    vaultApi.on('chat:history', onChatHistory);
    vaultApi.on('activity:event', onActivity);
    vaultApi.on('stats:update', onStats);
    vaultApi.on('obs:status', onObsStatus);
    vaultApi.on('obs:event', onObsEvent);
    vaultApi.on('obs:audioMeters', onMeters);
    vaultApi.on('guard:status', onGuard);
    vaultApi.on('irl:status', onIrlStatus);
    vaultApi.on('platforms:status', onPlatformStatus);
    vaultApi.on('platform:error', onPlatformError);
    vaultApi.on('platforms:visibilityChanged', onVisibilityChanged);

    return () => {
      vaultApi.off('chat:message', onChat);
      vaultApi.off('chat:history', onChatHistory);
      vaultApi.off('activity:event', onActivity);
      vaultApi.off('stats:update', onStats);
      vaultApi.off('obs:status', onObsStatus);
      vaultApi.off('obs:event', onObsEvent);
      vaultApi.off('obs:audioMeters', onMeters);
      vaultApi.off('guard:status', onGuard);
      vaultApi.off('irl:status', onIrlStatus);
      vaultApi.off('platforms:status', onPlatformStatus);
      vaultApi.off('platform:error', onPlatformError);
      vaultApi.off('platforms:visibilityChanged', onVisibilityChanged);
    };
  }, [addChatMessage, setChatMessages, addActivityEvent, setActivityEvents, setStats, setObsState, loadObsData, loadOutputStats, updateAudioMeters, setGuardStatus, setPlatformStatuses, showToast]);

  // Output stats heartbeat (timers, bitrate, per-target status).
  useEffect(() => {
    const interval = setInterval(() => {
      if (obsState === 'connected') loadOutputStats();
    }, 2000);
    return () => clearInterval(interval);
  }, [obsState, loadOutputStats]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  const activeScene = scenes.find((s) => s.id === activeSceneId);
  const obsConnected = obsState === 'connected';

  const handleDrawingSnapshotChange = useCallback(async (snapshot: DrawingOverlaySnapshot) => {
    latestDrawingSnapshot.current = snapshot;
    if (!obsConnected) return;
    try {
      const result = await vaultApi?.obs.syncDrawingOverlay(snapshot.imageDataUrl, snapshot.hasDrawing);
      if (result?.ok) {
        drawingOverlayErrorShown.current = false;
        return;
      }
      if (snapshot.hasDrawing && !drawingOverlayErrorShown.current) {
        drawingOverlayErrorShown.current = true;
        showToast(result?.error || 'Could not publish drawing overlay');
      }
    } catch (e) {
      if (snapshot.hasDrawing && !drawingOverlayErrorShown.current) {
        drawingOverlayErrorShown.current = true;
        showToast(`Could not publish drawing overlay: ${e instanceof Error ? e.message : e}`);
      }
    }
  }, [obsConnected, showToast]);

  const handleSourceTransformChange = useCallback(async (id: string, transform: SourceTransform) => {
    if (!activeScene) return;
    const source = activeScene.sources.find((s) => s.id === id);
    if (!source) return;
    const sceneItemId = String(source.sceneItemId ?? source.id);
    try {
      await vaultApi?.obs.setSourceTransform(activeScene.id, sceneItemId, transform);
      loadObsData();
    } catch (e) {
      showToast(`Could not resize source: ${e instanceof Error ? e.message : e}`);
      loadObsData();
    }
  }, [activeScene, loadObsData, showToast]);

  useEffect(() => {
    if (!obsConnected) return;
    if (latestDrawingSnapshot.current?.hasDrawing) {
      void handleDrawingSnapshotChange(latestDrawingSnapshot.current);
    } else {
      // Clean up overlays persisted by older builds (the duplicate
      // "VaultStudio Drawing Overlay" sources) so they stop costing CPU.
      void vaultApi?.obs.syncDrawingOverlay(BLANK_OVERLAY_PNG, false);
    }
  }, [handleDrawingSnapshotChange, obsConnected]);

  useEffect(() => {
    setSelectedSourceId(null);
  }, [activeSceneId]);

  useEffect(() => {
    if (selectedSourceId && !activeScene?.sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(null);
    }
  }, [activeScene, selectedSourceId]);

  const enabledPlatforms = useMemo(
    () => (Object.keys(platformVisibility) as Array<keyof typeof platformVisibility>).filter((p) => platformVisibility[p]),
    [platformVisibility]
  );

  const filteredStats = useMemo(() => {
    const visiblePlatforms = stats.platforms.filter((p) => enabledPlatforms.includes(p.platform));
    return {
      totalViewers: visiblePlatforms.reduce((sum, p) => sum + p.viewers, 0),
      platforms: visiblePlatforms,
    };
  }, [stats, enabledPlatforms]);

  const filteredChatMessages = useMemo(
    () => chatMessages.filter((m) => enabledPlatforms.includes(m.platform)),
    [chatMessages, enabledPlatforms]
  );

  const filteredActivityEvents = useMemo(
    () => activityEvents.filter((event) => enabledPlatforms.includes(event.platform)),
    [activityEvents, enabledPlatforms]
  );

  // Audio mixer scoped to what's actually audible: global devices (Desktop
  // Audio / Mic, which live outside scenes) plus sources in the active scene.
  const scopedAudioSources = useMemo(() => {
    const allSceneSourceNames = new Set(scenes.flatMap((s) => s.sources.map((src) => src.name)));
    const activeSourceNames = new Set(activeScene?.sources.map((src) => src.name) ?? []);
    return audioSources.filter(
      (a) => !allSceneSourceNames.has(a.name) || activeSourceNames.has(a.name)
    );
  }, [audioSources, scenes, activeScene]);

  const filteredPlatformStatuses = useMemo(
    () => platformStatuses.filter((s) => enabledPlatforms.includes(s.platform as any)),
    [platformStatuses, enabledPlatforms]
  );

  const handleLayoutChange = (next: Layout) => {
    if (!layoutLoaded.current) return;
    const items = next.map((l) => ({
      i: l.i as PanelId,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    }));
    setLayout({ items });
    vaultApi?.layout.save({ items });
  };

  const resetLayout = () => {
    setLayout({ items: [...DEFAULT_LAYOUT.items] });
    vaultApi?.layout.save(DEFAULT_LAYOUT);
    showToast('Layout reset to default');
  };

  const handleStartStream = useCallback(async () => {
    try {
      const result = await vaultApi?.obs.startStreaming();
      if (result && !result.ok) {
        showToast(result.error || 'Failed to start stream');
      } else if (result?.warning) {
        showToast(result.warning);
      }
      loadOutputStats();
    } catch (e) {
      showToast(`Failed to start stream: ${e instanceof Error ? e.message : e}`);
    }
  }, [loadOutputStats, showToast]);

  const handleStopStream = useCallback(async () => {
    await vaultApi?.obs.stopStreaming();
    loadOutputStats();
  }, [loadOutputStats]);

  const handleStartRecording = useCallback(async () => {
    try {
      const result = await vaultApi?.obs.startRecording();
      if (result && !result.ok) {
        showToast(result.error || 'Failed to start recording');
      }
      loadOutputStats();
    } catch (e) {
      showToast(`Failed to start recording: ${e instanceof Error ? e.message : e}`);
    }
  }, [loadOutputStats, showToast]);

  const handleStopRecording = useCallback(async () => {
    await vaultApi?.obs.stopRecording();
    loadOutputStats();
  }, [loadOutputStats]);

  const handleToggleVirtualCam = useCallback(async () => {
    try {
      const result = await vaultApi?.obs.toggleVirtualCam();
      if (result?.error) {
        showToast(`Virtual camera: ${result.error}`);
      } else {
        showToast(result?.active ? 'Virtual camera started' : 'Virtual camera stopped');
      }
      loadOutputStats();
    } catch (e) {
      showToast(`Virtual cam failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [loadOutputStats, showToast]);

  const handleClipReplay = useCallback(async () => {
    try {
      const result = await vaultApi?.obs.clipReplay();
      showToast(
        result === 'started'
          ? 'Replay buffer armed - click Replay again to save the last 30s'
          : result === 'saved'
            ? 'Clip saved to your recordings folder'
            : 'Replay buffer unavailable'
      );
      loadOutputStats();
    } catch (e) {
      showToast(`Replay failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [loadOutputStats, showToast]);

  const shortcuts = useMemo<Record<string, () => void | Promise<void>>>(() => {
    const map: Record<string, () => void | Promise<void>> = {};
    if (!obsConnected) return map;
    map['mod+b'] = outputStats?.isStreaming ? handleStopStream : handleStartStream;
    map['mod+r'] = outputStats?.isRecording ? handleStopRecording : handleStartRecording;
    map['mod+d'] = handleToggleVirtualCam;
    map['mod+e'] = handleClipReplay;
    return map;
  }, [
    obsConnected,
    outputStats?.isStreaming,
    outputStats?.isRecording,
    handleStartStream,
    handleStopStream,
    handleStartRecording,
    handleStopRecording,
    handleToggleVirtualCam,
    handleClipReplay,
  ]);
  useKeyboardShortcuts(shortcuts);

  const handleModerate = async (
    action: 'delete' | 'timeout-600' | 'timeout-3600' | 'ban' | 'unban',
    msg: UnifiedChatMessage
  ) => {
    const map: Record<string, { action: 'delete' | 'timeout' | 'ban' | 'unban'; durationSec?: number }> = {
      delete: { action: 'delete' },
      'timeout-600': { action: 'timeout', durationSec: 600 },
      'timeout-3600': { action: 'timeout', durationSec: 3600 },
      ban: { action: 'ban' },
      unban: { action: 'unban' },
    };
    const mapped = map[action];
    const result = await vaultApi?.chat.moderate(mapped.action, {
      platform: msg.platform,
      username: msg.username,
      messageId: msg.id,
      authorId: msg.authorId,
      durationSec: mapped.durationSec,
    });
    if (result?.ok) {
      const verb =
        mapped.action === 'delete'
          ? 'Message deleted'
          : mapped.action === 'timeout'
            ? `${msg.displayName} timed out for ${(mapped.durationSec || 600) / 60} min`
            : mapped.action === 'ban'
              ? `${msg.displayName} banned`
              : `${msg.displayName} unbanned`;
      showToast(verb);
    } else {
      showToast(result?.error || 'Mod action failed');
    }
  };

  const handleHideLocal = async (msg: UnifiedChatMessage) => {
    await vaultApi?.chat.hideLocal(msg.id);
    showToast('Removed from your feed (still visible on the platform)');
  };

  const handleSendChat = async (message: string) => {
    const result = await vaultApi?.chat.sendMessage(message, chatTarget);
    if (result && result.failed.length > 0 && result.sent.length === 0) {
      showToast('Message not sent - check chat connection in Settings → Chat & Platforms');
    }
  };

  const handleClearChat = async () => {
    clearChat();
    await vaultApi?.chat.clearHistory();
    showToast('Chat cleared');
  };

  const rowHeight = Math.max(40, (gridSize.h - GRID_MARGIN * (GRID_ROWS + 1)) / GRID_ROWS);

  const panelBody: Record<PanelId, React.ReactNode> = useMemo(
    () => ({
      session: <SessionInfo stats={filteredStats} outputStats={outputStats} />,
      preview: (
        <MemoizedPreviewPanel
          isStreaming={outputStats?.isStreaming}
          obsState={obsState}
          virtualCamActive={outputStats?.virtualCamActive ?? false}
          sceneId={activeScene?.id ?? null}
          sources={activeScene?.sources ?? []}
          selectedSourceId={selectedSourceId}
          onSelectSource={setSelectedSourceId}
          onDrawingSnapshotChange={handleDrawingSnapshotChange}
          onSourceTransformChange={handleSourceTransformChange}
          onToggleLock={
            obsConnected
              ? async (id, locked) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.setSourceLocked(activeScene.id, sceneItemId, locked);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not update source lock: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
        />
      ),
      activity: <ActivityFeed events={filteredActivityEvents} />,
      chat: (
        <UnifiedChat
          messages={filteredChatMessages}
          onSend={handleSendChat}
          onClear={handleClearChat}
          chatTarget={chatTarget}
          onTargetChange={setChatTarget}
          platformStatuses={filteredPlatformStatuses}
          onModerate={handleModerate}
          onHideLocal={handleHideLocal}
        />
      ),
      scenes: (
        <ScenesPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSwitchScene={async (id) => {
            setSelectedSourceId(null);
            switchScene(id);
            try {
              await vaultApi?.obs.switchScene(id);
            } catch {
              loadObsData();
            }
          }}
          onCreateScene={
            obsConnected
              ? async (name) => {
                  try {
                    await vaultApi?.obs.createScene(name);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not create scene: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onDeleteScene={
            obsConnected
              ? async (id) => {
                  try {
                    await vaultApi?.obs.deleteScene(id);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not delete scene: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onRenameScene={
            obsConnected
              ? async (id, name) => {
                  try {
                    await vaultApi?.obs.renameScene(id, name);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not rename scene: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onReorderScene={
            obsConnected
              ? async (id, newIndex) => {
                  try {
                    await vaultApi?.obs.setSceneIndex(id, newIndex);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not reorder scene: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onDuplicateScene={
            obsConnected
              ? async (id) => {
                  try {
                    await vaultApi?.obs.duplicateScene(id);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not duplicate scene: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
        />
      ),
      sources: (
        <SourcesPanel
          sources={activeScene?.sources ?? []}
          selectedSourceId={selectedSourceId}
          irlIngestUrl={irlStatus?.ingestUrl || undefined}
          onSelectSource={setSelectedSourceId}
          devices={sourceDevices}
          onToggleVisibility={
            obsConnected
              ? async (id) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.setSourceVisible(activeScene.id, sceneItemId, !source.visible);
                  } catch (e) {
                    showToast(`Could not ${source.visible ? 'hide' : 'show'} source: ${e instanceof Error ? e.message : e}`);
                  }
                  loadObsData();
                }
              : undefined
          }
          onRemoveSource={
            obsConnected
              ? async (id) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.removeSource(activeScene.id, sceneItemId);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not remove source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onAddSource={
            obsConnected
              ? async (type, settings = {}) => {
                  if (!activeScene) return;
                  try {
                    await vaultApi?.obs.addSource(activeScene.id, type, settings);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not add source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onMoveSource={
            obsConnected
              ? async (id, direction) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (source?.locked) {
                    showToast('Unlock the source before moving it');
                    return;
                  }
                  if (!source) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.moveSource(activeScene.id, sceneItemId, direction);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not move source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onReorderSource={
            obsConnected
              ? async (id, newIndex) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source || source.locked) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.setSourceIndex(activeScene.id, sceneItemId, newIndex);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not reorder source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onCameraFormat={
            obsConnected
              ? async (id, format) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  // win-dshow: res_type 0 = device default; frame_interval is
                  // in 100ns units (333333 = 30 fps); video_format 0 = any.
                  const settings: Record<string, unknown> =
                    format === 'auto'
                      ? { res_type: 0, frame_interval: 0, video_format: 0, active: true }
                      : {
                          res_type: 1,
                          resolution: format === '720p30' ? '1280x720' : '1920x1080',
                          frame_interval: 333333,
                          video_format: 0,
                          active: true,
                        };
                  try {
                    await vaultApi?.obs.updateSourceSettings(source.name, settings);
                    showToast(`Camera format set to ${format === 'auto' ? 'device default' : format} — restarting capture...`);
                  } catch (e) {
                    showToast(`Could not change camera format: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onRestartCapture={
            obsConnected
              ? async (id) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  try {
                    // Deactivate then reactivate — rebuilds the capture graph
                    // (recovers stuck cameras / failed decoders).
                    await vaultApi?.obs.updateSourceSettings(source.name, { active: false });
                    setTimeout(() => {
                      vaultApi?.obs.updateSourceSettings(source.name, { active: true, hw_decode: true });
                    }, 600);
                    showToast(`Restarting ${source.name}...`);
                  } catch (e) {
                    showToast(`Could not restart capture: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onTransformAction={
            obsConnected
              ? async (id, action) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source || source.locked) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  const t = source.transform ?? { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 };
                  const aspect = t.width > 0 && t.height > 0 ? t.width / t.height : 16 / 9;
                  let next = { ...t };
                  if (action === 'stretch') {
                    next = { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 };
                  } else if (action === 'fit') {
                    const width = aspect >= 1920 / 1080 ? 1920 : Math.round(1080 * aspect);
                    const height = aspect >= 1920 / 1080 ? Math.round(1920 / aspect) : 1080;
                    next = { x: Math.round((1920 - width) / 2), y: Math.round((1080 - height) / 2), width, height, rotation: 0 };
                  } else if (action === 'center') {
                    next = { ...t, x: Math.round((1920 - t.width) / 2), y: Math.round((1080 - t.height) / 2) };
                  }
                  try {
                    await vaultApi?.obs.setSourceTransform(activeScene.id, sceneItemId, next);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not transform source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onToggleLock={
            obsConnected
              ? async (id, locked) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  const sceneItemId = String(source.sceneItemId ?? source.id);
                  try {
                    await vaultApi?.obs.setSourceLocked(activeScene.id, sceneItemId, locked);
                    showToast(locked ? 'Source locked' : 'Source unlocked');
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not update source lock: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
          onRenameSource={
            obsConnected
              ? async (id, name) => {
                  if (!activeScene) return;
                  const source = activeScene.sources.find((s) => s.id === id);
                  if (!source) return;
                  try {
                    await vaultApi?.obs.renameSource(activeScene.id, source.name, name);
                    loadObsData();
                  } catch (e) {
                    showToast(`Could not rename source: ${e instanceof Error ? e.message : e}`);
                  }
                }
              : undefined
          }
        />
      ),
      audio: (
        <AudioMixer
          sources={scopedAudioSources}
          onVolumeChange={(id: string, vol: number) => {
            // Optimistic — the engine has no volume-changed push event.
            useStudioStore.getState().patchAudioSource(id, { volume: vol });
            vaultApi?.obs.setVolume(id, vol);
          }}
          onMuteToggle={(id: string) => {
            const source = audioSources.find((s) => s.id === id);
            if (!source) return;
            const next = !source.muted;
            useStudioStore.getState().patchAudioSource(id, { muted: next });
            vaultApi?.obs.setMuted(id, next);
          }}
        />
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredStats, outputStats, obsState, filteredActivityEvents, filteredChatMessages, chatTarget, filteredPlatformStatuses, scenes, activeSceneId, activeScene, audioSources, scopedAudioSources, obsConnected, sourceDevices, selectedSourceId, irlStatus?.ingestUrl, handleDrawingSnapshotChange, handleSourceTransformChange]
  );

  return (
    <PageRoot>
      <TopBar>
        <Logo>
          <LogoIcon src={logoUrl} alt="VaultStudio" />
          VaultStudio
        </Logo>
        <TopBarActions>
          <ControlBar
            isStreaming={outputStats?.isStreaming ?? false}
            isRecording={outputStats?.isRecording ?? false}
            streamDuration={outputStats?.streamDuration ?? 0}
            recordDuration={outputStats?.recordDuration ?? 0}
            guardStatus={guardStatus}
            disabled={!obsConnected}
            onStartStream={handleStartStream}
            onStopStream={handleStopStream}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            virtualCamActive={outputStats?.virtualCamActive ?? false}
            replayActive={outputStats?.replayActive ?? false}
            onToggleVirtualCam={handleToggleVirtualCam}
            onClipReplay={handleClipReplay}
          />
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            Settings
          </Button>
          <Button variant="secondary" onClick={resetLayout}>
            Reset Layout
          </Button>
        </TopBarActions>
      </TopBar>

      {!obsConnected && (
        <ObsBanner>
          <span>Starting the streaming engine... controls unlock in a moment.</span>
        </ObsBanner>
      )}

      <GridContainer ref={gridRef}>
        <GridLayout
          layout={layout.items}
          width={gridSize.w}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight,
            margin: [GRID_MARGIN, GRID_MARGIN],
            maxRows: GRID_ROWS,
          }}
          dragConfig={{ handle: '.panel-header', bounded: true }}
          positionStrategy={absoluteStrategy}
          autoSize={false}
          onLayoutChange={handleLayoutChange}
        >
          {layout.items.map((item) => (
            <PanelSlot key={item.i}>
              <Panel title={PANEL_TITLES[item.i]}>{panelBody[item.i]}</Panel>
            </PanelSlot>
          ))}
        </GridLayout>
      </GridContainer>

      {toast && <Toast onClick={clearToast}>{toast}</Toast>}
    </PageRoot>
  );
}
