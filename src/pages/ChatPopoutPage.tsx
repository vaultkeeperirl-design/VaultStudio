import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import logoUrl from '../assets/logo.png';
import { UnifiedChat } from '../components/studio/UnifiedChat';
import { tokens } from '../theme/tokens';
import type {
  ChatTarget,
  CombinedStats,
  OutputStats,
  PlatformStatus,
  UnifiedChatMessage,
  ChatPopoutConfig,
  Scene,
} from '../types';

const PopoutRoot = styled.div<{ $solid: boolean }>`
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: ${({ $solid }) => ($solid ? tokens.colors.bg : 'rgba(11, 11, 13, 0.94)')};
  border: 1px solid ${({ $solid }) => ($solid ? tokens.colors.border : 'rgba(214, 162, 58, 0.42)')};
  color: ${tokens.colors.text};
`;

const DragHeader = styled.header<{ $solid: boolean }>`
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.spacing.sm};
  flex-wrap: wrap;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: ${({ $solid }) => ($solid ? tokens.colors.panel : 'rgba(17, 17, 20, 0.92)')};
  border-bottom: 1px solid ${tokens.colors.border};
  flex-shrink: 0;
`;

const HeaderIdentity = styled.div`
  min-width: 0;
  flex: 1 1 168px;
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

const LogoMark = styled.img`
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(214, 162, 58, 0.36));
`;

const Title = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: ${tokens.colors.gold};
    font-size: ${tokens.fontSize.sm};
  }

  span {
    color: ${tokens.colors.muted};
    font-size: ${tokens.fontSize.xs};
  }
`;

const HeaderControls = styled.div`
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${tokens.spacing.sm};
  row-gap: ${tokens.spacing.xs};
  flex: 0 1 auto;
  flex-wrap: wrap;
  min-width: 0;

  @media (max-width: 560px) {
    flex: 1 0 100%;
  }
`;

const HeaderStats = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  flex-wrap: wrap;
`;

const StatPill = styled.span`
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  background: ${tokens.colors.panel2};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.xs};
`;

const LivePill = styled(StatPill)`
  border-color: rgba(255, 0, 51, 0.75);
  background: rgba(255, 0, 51, 0.18);
  color: #ff4f6d;
  font-weight: ${tokens.fontWeight.bold};
`;

const LiveTimerPill = styled(StatPill)`
  min-width: 72px;
  justify-content: center;
  border-color: rgba(255, 0, 51, 0.75);
  background: rgba(255, 0, 51, 0.18);
  color: #ff6d85;
  font-variant-numeric: tabular-nums;
  font-weight: ${tokens.fontWeight.bold};
`;

const OpacityControl = styled.label`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  min-width: 0;

  input {
    width: 92px;
    accent-color: ${tokens.colors.gold};
  }

  @media (max-width: 560px) {
    flex: 1 1 168px;
    justify-content: flex-end;

    input {
      width: min(92px, 28vw);
    }
  }
`;

const ToggleControl = styled.label`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
`;

const IconButton = styled.button`
  border: 1px solid ${tokens.colors.border};
  background: ${tokens.colors.panel2};
  color: ${tokens.colors.text};
  border-radius: ${tokens.borderRadius.sm};
  padding: 3px 9px;
  font-size: ${tokens.fontSize.xs};
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    border-color: ${tokens.colors.border};
  }
`;

const SceneNav = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
`;

const SceneArrow = styled(IconButton)`
  padding: 1px 7px;
  font-size: 11px;
`;

const SceneName = styled.span`
  /* Fixed width so a long scene name vs "BRB" doesn't reflow the row and shift
     the BRB/Back button. */
  width: 104px;
  flex: 0 0 104px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.gold};
  font-weight: ${tokens.fontWeight.medium};
`;

const BrbButton = styled(IconButton)<{ $active?: boolean }>`
  /* Fixed width so the BRB ↔ Back label swap doesn't change the button's size
     or position — click BRB, then click Back in exactly the same spot. */
  box-sizing: border-box;
  width: 52px;
  flex: 0 0 52px;
  text-align: center;
  border-color: rgba(255, 79, 109, 0.6);
  color: ${({ $active }) => ($active ? '#fff' : '#ff6d85')};
  background: ${({ $active }) => ($active ? 'rgba(255, 0, 51, 0.32)' : 'transparent')};
  font-weight: ${tokens.fontWeight.bold};

  &:hover:not(:disabled) {
    border-color: #ff4f6d;
    background: rgba(255, 0, 51, 0.16);
  }
`;

const PreviewStrip = styled.section<{ $solid: boolean }>`
  flex: 0 0 auto;
  padding: ${tokens.spacing.sm};
  background: ${({ $solid }) => ($solid ? '#050505' : 'rgba(0, 0, 0, 0.72)')};
  border-bottom: 1px solid ${tokens.colors.border};
`;

const PreviewFrame = styled.div`
  position: relative;
  height: 132px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(214, 162, 58, 0.28);
  border-radius: ${tokens.borderRadius.sm};
  background: #000;
`;

const PreviewCanvas = styled.canvas<{ $live: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  opacity: ${({ $live }) => ($live ? 1 : 0.18)};
  transition: opacity 120ms ease;
`;

const PreviewStatus = styled.span`
  position: absolute;
  right: ${tokens.spacing.xs};
  top: ${tokens.spacing.xs};
  padding: 2px 7px;
  border-radius: ${tokens.borderRadius.sm};
  background: rgba(0, 0, 0, 0.74);
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.medium};
`;

const ChatShell = styled.main`
  min-height: 0;
  flex: 1;
  padding: ${tokens.spacing.sm};

  > div {
    gap: ${tokens.spacing.xs};
  }
`;

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;
const DEFAULT_POPOUT: ChatPopoutConfig = { enabled: true, opacity: 0.88, solidBackground: false };
const MINI_PREVIEW_WIDTH = 320;
const MINI_PREVIEW_HEIGHT = 180;
const MINI_PREVIEW_FPS = 12;
const MINI_PREVIEW_STALE_MS = 1500;
const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  kick: 'Kick',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

function copyFrameData(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

function formatViewerBreakdown(stats: CombinedStats): string {
  if (stats.platforms.length === 0) return `${stats.totalViewers.toLocaleString()} viewers`;
  return stats.platforms
    .map((platform) => {
      const label = PLATFORM_LABELS[platform.platform] ?? platform.platform;
      const who = platform.channel ? ` (${platform.channel})` : '';
      const n = platform.viewers.toLocaleString();
      return `${label}${who}: ${n} viewer${platform.viewers === 1 ? '' : 's'}`;
    })
    .join('\n');
}

function formatLiveDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function MiniStreamPreview({ solid }: { solid: boolean }) {
  const [previewLive, setPreviewLive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasFrameRef = useRef(false);
  const lastFrameAtRef = useRef(0);
  const decodeInFlightRef = useRef(false);
  const pendingFrameRef = useRef<{ mime?: string; width?: number; height?: number; data: ArrayBuffer } | null>(null);

  useEffect(() => {
    if (!vaultApi?.preview?.start) return;

    let disposed = false;
    const paintFrame = (frame: { mime?: string; width?: number; height?: number; data: ArrayBuffer }) => {
      decodeInFlightRef.current = true;
      const blob = new Blob([frame.data], { type: frame.mime || 'image/jpeg' });

      createImageBitmap(blob).then((bitmap) => {
        if (disposed) {
          bitmap.close?.();
          return;
        }
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        lastFrameAtRef.current = Date.now();
        if (!hasFrameRef.current) {
          hasFrameRef.current = true;
          setPreviewLive(true);
        }
      }).catch(() => {}).finally(() => {
        if (disposed) {
          pendingFrameRef.current = null;
          decodeInFlightRef.current = false;
          return;
        }
        const next = pendingFrameRef.current;
        pendingFrameRef.current = null;
        if (next) {
          paintFrame(next);
        } else {
          decodeInFlightRef.current = false;
        }
      });
    };

    const onFrame = (frame: { mime?: string; width?: number; height?: number; data?: Uint8Array }) => {
      if (disposed || !frame?.data) return;
      const next = {
        mime: frame.mime,
        width: frame.width,
        height: frame.height,
        data: copyFrameData(frame.data),
      };
      if (decodeInFlightRef.current) {
        pendingFrameRef.current = next;
        return;
      }
      paintFrame(next);
    };

    const frameHandler = onFrame as (...args: unknown[]) => void;
    vaultApi.on('obs:previewFrame', frameHandler);
    vaultApi.preview.start({ width: MINI_PREVIEW_WIDTH, height: MINI_PREVIEW_HEIGHT, fps: MINI_PREVIEW_FPS }).catch(() => {});

    const staleTimer = window.setInterval(() => {
      if (hasFrameRef.current && Date.now() - lastFrameAtRef.current > MINI_PREVIEW_STALE_MS) {
        hasFrameRef.current = false;
        setPreviewLive(false);
      }
    }, MINI_PREVIEW_STALE_MS);

    return () => {
      disposed = true;
      window.clearInterval(staleTimer);
      vaultApi.off('obs:previewFrame', frameHandler);
      vaultApi.preview.stop().catch(() => {});
      setPreviewLive(false);
      hasFrameRef.current = false;
      pendingFrameRef.current = null;
      decodeInFlightRef.current = false;
    };
  }, []);

  return (
    <PreviewStrip $solid={solid}>
      <PreviewFrame>
        <PreviewCanvas
          ref={canvasRef}
          aria-label="Stream preview"
          width={MINI_PREVIEW_WIDTH}
          height={MINI_PREVIEW_HEIGHT}
          $live={previewLive}
        />
        <PreviewStatus>{previewLive ? 'Realtime' : 'Standby'}</PreviewStatus>
      </PreviewFrame>
    </PreviewStrip>
  );
}

export function ChatPopoutPage() {
  const [messages, setMessages] = useState<UnifiedChatMessage[]>([]);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus[]>([]);
  const [combinedStats, setCombinedStats] = useState<CombinedStats>({ totalViewers: 0, platforms: [] });
  const [outputStats, setOutputStats] = useState<OutputStats | null>(null);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [chatTarget, setChatTarget] = useState<ChatTarget>('all');
  const [config, setConfig] = useState<ChatPopoutConfig>(DEFAULT_POPOUT);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [brbSceneName, setBrbSceneName] = useState('');
  // The scene we left when jumping to BRB, so a second BRB click returns to it.
  const [brbReturn, setBrbReturn] = useState<string | null>(null);

  useEffect(() => {
    document.body.dataset.view = 'chat-popout';
    return () => {
      document.body.removeAttribute('data-view');
    };
  }, []);

  useEffect(() => {
    if (!vaultApi) return;

    vaultApi.chat.getHistory().then(({ messages }) => setMessages(messages));
    vaultApi.platforms.getConnections().then(({ statuses }) => setPlatformStatuses(statuses));
    vaultApi.platforms.getStats().then(setCombinedStats);
    vaultApi.obs.getOutputStats().then(setOutputStats).catch(() => {});
    vaultApi.obs.getScenes().then(setScenes).catch(() => {});
    vaultApi.chatPopout?.get().then((next) => setConfig(next));
    // The BRB button targets the scene Stream Guard / IRL is configured to use,
    // regardless of whether Stream Guard's auto-protection is enabled.
    void (async () => {
      try {
        const guard = await vaultApi.guard?.get();
        if (guard?.config?.brbSceneName) {
          setBrbSceneName(guard.config.brbSceneName);
          return;
        }
        const irl = await vaultApi.irl?.get();
        if (irl?.config?.brbSceneName) setBrbSceneName(irl.config.brbSceneName);
      } catch {
        /* fall back to a name match */
      }
    })();

    const onChat = (...args: unknown[]) => setMessages((prev) => [...prev, args[0] as UnifiedChatMessage]);
    const onChatHistory = (...args: unknown[]) => setMessages(args[0] as UnifiedChatMessage[]);
    const onPlatformStatus = (...args: unknown[]) => setPlatformStatuses(args[0] as PlatformStatus[]);
    const onStats = (...args: unknown[]) => setCombinedStats(args[0] as CombinedStats);
    const onObsEvent = (...args: unknown[]) => {
      const event = args[0] as { eventType?: string };
      if (event.eventType === 'StreamStateChanged') {
        vaultApi.obs.getOutputStats().then(setOutputStats).catch(() => {});
      }
      if (
        event.eventType === 'CurrentProgramSceneChanged' ||
        event.eventType === 'SceneListChanged'
      ) {
        vaultApi.obs.getScenes().then(setScenes).catch(() => {});
      }
    };

    vaultApi.on('chat:message', onChat);
    vaultApi.on('chat:history', onChatHistory);
    vaultApi.on('platforms:status', onPlatformStatus);
    vaultApi.on('stats:update', onStats);
    vaultApi.on('obs:event', onObsEvent);

    return () => {
      vaultApi.off('chat:message', onChat);
      vaultApi.off('chat:history', onChatHistory);
      vaultApi.off('platforms:status', onPlatformStatus);
      vaultApi.off('stats:update', onStats);
      vaultApi.off('obs:event', onObsEvent);
    };
  }, []);

  useEffect(() => {
    setLiveDurationSec(outputStats?.isStreaming ? outputStats.streamDuration : 0);
  }, [outputStats?.isStreaming, outputStats?.streamDuration]);

  useEffect(() => {
    if (!outputStats?.isStreaming) return;
    const timer = window.setInterval(() => {
      setLiveDurationSec((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [outputStats?.isStreaming]);

  const connectedCount = useMemo(
    () => platformStatuses.filter((status) => status.chatConnected).length,
    [platformStatuses]
  );
  const viewerText = `${combinedStats.totalViewers.toLocaleString()} viewers`;
  const viewerBreakdownText = useMemo(() => formatViewerBreakdown(combinedStats), [combinedStats]);
  const displayedLiveDuration =
    outputStats?.isStreaming ? (liveDurationSec > 0 ? liveDurationSec : outputStats.streamDuration) : 0;

  const updatePopout = async (patch: Partial<ChatPopoutConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    const saved = await vaultApi?.chatPopout?.update(next);
    if (saved) setConfig(saved);
  };

  const handleSendChat = async (message: string) => {
    await vaultApi?.chat.sendMessage(message, chatTarget);
  };

  const handleClearChat = async () => {
    setMessages([]);
    await vaultApi?.chat.clearHistory();
  };

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
    await vaultApi?.chat.moderate(mapped.action, {
      platform: msg.platform,
      username: msg.username,
      messageId: msg.id,
      authorId: msg.authorId,
      durationSec: mapped.durationSec,
    });
  };

  const handleHideLocal = async (msg: UnifiedChatMessage) => {
    await vaultApi?.chat.hideLocal(msg.id);
  };

  const activeSceneIdx = scenes.findIndex((s) => s.isActive);
  const activeScene = activeSceneIdx >= 0 ? scenes[activeSceneIdx] : null;

  // The configured BRB scene (Stream Guard / IRL), or any scene that looks like
  // a "Be Right Back" scene as a fallback.
  const brbTarget = useMemo(() => {
    if (scenes.length === 0) return null;
    const want = brbSceneName.trim().toLowerCase();
    if (want) {
      const exact = scenes.find((s) => s.name.toLowerCase() === want);
      if (exact) return exact;
    }
    return scenes.find((s) => /be\s*right\s*back|^brb$/i.test(s.name.trim())) || null;
  }, [scenes, brbSceneName]);

  const onBrbScene = Boolean(brbTarget && activeScene && brbTarget.id === activeScene.id);
  const brbReturnScene = brbReturn ? scenes.find((s) => s.id === brbReturn) ?? null : null;

  // Toggle: jump to the BRB scene (remembering where we were), or — if already
  // on it — go back to the scene we came from.
  const goBrb = async () => {
    if (!brbTarget) return;
    if (onBrbScene) {
      if (!brbReturnScene) return;
      const back = brbReturnScene.id;
      setBrbReturn(null);
      void switchToScene(back);
    } else {
      setBrbReturn(activeScene?.id ?? null);
      void switchToScene(brbTarget.id);
    }
  };

  const switchToScene = async (id: string) => {
    setScenes((prev) => prev.map((s) => ({ ...s, isActive: s.id === id })));
    try {
      await vaultApi?.obs.switchScene(id);
    } catch {
      vaultApi?.obs.getScenes().then(setScenes).catch(() => {});
    }
  };

  // Move to the scene directly above (-1) or below (+1) the active one in the
  // list. Clamped at the ends; optimistic so the label flips instantly.
  const stepScene = async (dir: -1 | 1) => {
    if (scenes.length === 0) return;
    const base = activeSceneIdx >= 0 ? activeSceneIdx : 0;
    const nextIdx = base + dir;
    if (nextIdx < 0 || nextIdx >= scenes.length) return;
    void switchToScene(scenes[nextIdx].id);
  };

  return (
    <PopoutRoot $solid={config.solidBackground}>
      <DragHeader $solid={config.solidBackground}>
        <HeaderIdentity>
          <LogoMark src={logoUrl} alt="VaultStudio" />
          <Title>
            <strong>Chat Overlay</strong>
            <HeaderStats>
              {outputStats?.isStreaming && <LivePill>LIVE</LivePill>}
              <StatPill title={viewerBreakdownText}>{viewerText}</StatPill>
              <span>{connectedCount > 0 ? `${connectedCount} chat source${connectedCount === 1 ? '' : 's'} live` : 'Waiting for chat'}</span>
            </HeaderStats>
          </Title>
        </HeaderIdentity>
        <HeaderControls>
          {scenes.length > 0 && (
            <SceneNav>
              <SceneArrow
                type="button"
                aria-label="Previous scene"
                title="Switch to the scene above"
                disabled={activeSceneIdx <= 0}
                onClick={() => stepScene(-1)}
              >
                ▲
              </SceneArrow>
              <SceneName title={activeScene ? `Scene: ${activeScene.name}` : undefined}>
                {activeScene?.name ?? '—'}
              </SceneName>
              <SceneArrow
                type="button"
                aria-label="Next scene"
                title="Switch to the scene below"
                disabled={activeSceneIdx < 0 || activeSceneIdx >= scenes.length - 1}
                onClick={() => stepScene(1)}
              >
                ▼
              </SceneArrow>
              <BrbButton
                type="button"
                $active={onBrbScene}
                aria-label={onBrbScene ? 'Return from BRB scene' : 'Switch to BRB scene'}
                title={
                  !brbTarget
                    ? 'Set a BRB scene in Stream Guard settings'
                    : onBrbScene
                      ? brbReturnScene
                        ? `Back to “${brbReturnScene.name}”`
                        : 'No previous scene to return to'
                      : `Switch to “${brbTarget.name}”`
                }
                disabled={!brbTarget || (onBrbScene && !brbReturnScene)}
                onClick={goBrb}
              >
                {onBrbScene && brbReturnScene ? 'Back' : 'BRB'}
              </BrbButton>
            </SceneNav>
          )}
          <IconButton
            type="button"
            aria-label={previewOpen ? 'Hide stream preview' : 'Show stream preview'}
            aria-pressed={previewOpen}
            title={previewOpen ? 'Hide stream preview' : 'Show stream preview'}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            Preview
          </IconButton>
          <OpacityControl>
            Overlay opacity
            <input
              aria-label="Overlay opacity"
              type="range"
              min="0.35"
              max="1"
              step="0.01"
              value={config.opacity}
              onChange={(e) => updatePopout({ opacity: Number(e.target.value) })}
            />
          </OpacityControl>
          <ToggleControl>
            <input
              aria-label="Solid background"
              type="checkbox"
              checked={config.solidBackground}
              onChange={(e) => updatePopout({ solidBackground: e.target.checked })}
            />
            Solid
          </ToggleControl>
          <IconButton type="button" onClick={() => vaultApi?.chatPopout?.hide()}>
            Hide
          </IconButton>
          {outputStats?.isStreaming && (
            <LiveTimerPill aria-label="Time live" title="Time live">
              {formatLiveDuration(displayedLiveDuration)}
            </LiveTimerPill>
          )}
        </HeaderControls>
      </DragHeader>
      {previewOpen && <MiniStreamPreview solid={config.solidBackground} />}
      <ChatShell>
        <UnifiedChat
          messages={messages}
          onSend={handleSendChat}
          onClear={handleClearChat}
          chatTarget={chatTarget}
          onTargetChange={setChatTarget}
          platformStatuses={platformStatuses}
          onModerate={handleModerate}
          onHideLocal={handleHideLocal}
        />
      </ChatShell>
    </PopoutRoot>
  );
}
