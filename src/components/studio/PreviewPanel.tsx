import { memo, useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { ContextMenu } from '../common/ContextMenu';
import { ClearIcon, EraserIcon, PenIcon } from '../common/icons';
import type { DrawingOverlaySnapshot, ObsConnectionState, Source, SourceTransform } from '../../types';

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type DrawingTool = 'none' | 'pen' | 'eraser';
type DrawingPoint = { x: number; y: number };
type DrawingStroke = { tool: Exclude<DrawingTool, 'none'>; points: DrawingPoint[] };

const ASPECT_LOCKED_SOURCE_TYPES: Array<Source['type']> = [
  'camera',
  'image',
  'media',
  'display_capture',
  'window_capture',
  'game_capture',
];

// Preview rendering. The live program image is streamed from libobs as GPU
// frames (JPEG-encoded in the engine child process) and painted into an in-DOM
// <canvas> here. There is deliberately NO native child/overlay window: a
// separate top-level OS window owned by the Electron window can block on the
// libobs graphics mutex and, while blocked, stop answering WM_NCHITTEST — which
// freezes mouse hit-testing over the app and stalls taskbar activation for the
// whole process. Keeping the preview inside the renderer's own DOM makes that
// entire freeze class structurally impossible.
const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
// Keep the operator preview intentionally cheap. The actual stream output still
// uses the configured encoder settings; this canvas is only a control-surface
// confidence monitor, and long sessions should not spend sustained CPU/IPC on a
// 60fps preview copy.
const PREVIEW_FPS = 30;
// Drop the "Realtime" indicator if no frame arrives within this window so a
// stalled last frame can't masquerade as a live feed.
const PREVIEW_STALE_MS = 1500;

const PreviewContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: #000;
  border-radius: ${tokens.borderRadius.sm};
  overflow: hidden;
`;

const PreviewChrome = styled.div`
  flex: 0 0 auto;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
  background: ${tokens.colors.panel2};
  border-bottom: 1px solid ${tokens.colors.border};
`;

const PreviewChromeSpacer = styled.div`
  flex: 1 1 auto;
`;

const ViewportSurface = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
  position: relative;
  overflow: hidden;
`;

const EditorLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
`;

// The live program image. Positioned to match getViewport()'s letterbox so the
// source-editor boxes and drawing canvas line up with the pixels underneath.
const PreviewCanvas = styled.canvas`
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background-color: #000;
  transition: opacity 120ms ease;
`;

const DrawingCanvas = styled.canvas<{ $active: boolean; $eraser: boolean }>`
  position: absolute;
  z-index: 3;
  pointer-events: ${({ $active }) => ($active ? 'auto' : 'none')};
  cursor: ${({ $active, $eraser }) => ($active ? ($eraser ? 'cell' : 'crosshair') : 'default')};
  touch-action: none;
`;

const DrawingToolbar = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(5, 5, 5, 0.72);
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
`;

const DrawingToolButton = styled.button<{ $active?: boolean }>`
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  background: ${({ $active }) => ($active ? 'rgba(214, 162, 58, 0.22)' : tokens.colors.panel2)};
  color: ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.text)};
  padding: 0;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${tokens.colors.gold};
    color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
`;

const SourceBox = styled.div<{ $locked: boolean; $selected: boolean }>`
  position: absolute;
  border: ${({ $selected }) => ($selected ? '2px' : '1px')} solid ${({ $locked }) => ($locked ? tokens.colors.gold : tokens.colors.neonBlue)};
  background: ${({ $selected }) => ($selected ? 'rgba(39, 168, 255, 0.16)' : 'rgba(39, 168, 255, 0.05)')};
  box-shadow: ${({ $selected }) => ($selected ? '0 0 0 1px rgba(255, 255, 255, 0.3)' : 'none')};
  z-index: ${({ $selected }) => ($selected ? 3 : 1)};
  cursor: ${({ $locked }) => ($locked ? 'default' : 'move')};
  pointer-events: auto;
  touch-action: none;

  &:hover {
    border-color: ${tokens.colors.gold};
  }
`;

const SourceLabel = styled.div<{ $locked: boolean }>`
  position: absolute;
  left: 0;
  top: -24px;
  max-width: 260px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
  background: ${({ $locked }) => ($locked ? 'rgba(214, 162, 58, 0.92)' : 'rgba(39, 168, 255, 0.9)')};
  color: #050505;
  padding: 1px 4px 1px 2px;
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
`;

const LockToggle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.18);
  color: #050505;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.35);
  }
`;

const LabelName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResizeHandle = styled.div<{ $corner: ResizeCorner }>`
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid #050505;
  border-radius: 3px;
  background: ${tokens.colors.neonBlue};
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6), 0 2px 6px rgba(0, 0, 0, 0.5);
  z-index: 4;
  touch-action: none;
  cursor: ${({ $corner }) => ($corner === 'top-left' || $corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize')};
  ${({ $corner }) => ($corner.includes('top') ? 'top: -9px;' : 'bottom: -9px;')}
  ${({ $corner }) => ($corner.includes('left') ? 'left: -9px;' : 'right: -9px;')}

  &:hover {
    background: ${tokens.colors.gold};
  }
`;

const Placeholder = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.md};
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
  align-items: center;
`;

const LaunchButton = styled.button`
  background-color: ${tokens.colors.gold};
  color: #000;
  border: none;
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;

  &:hover {
    background-color: ${tokens.colors.darkGold};
  }
`;

const LiveIndicator = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  background-color: ${tokens.colors.live};
  color: #fff;
  padding: 2px 8px;
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
`;

const ModeChip = styled.div`
  flex: 0 0 auto;
  background-color: rgba(0, 0, 0, 0.55);
  color: ${tokens.colors.muted};
  padding: 2px 8px;
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
`;

const Dot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #fff;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;
const PEN_WIDTH = 12;
const ERASER_WIDTH = 64;
const DRAWING_SNAPSHOT_THROTTLE_MS = 160;

function copyFrameData(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

type Props = {
  isStreaming?: boolean;
  obsState?: ObsConnectionState;
  virtualCamActive?: boolean;
  onLaunchObs?: () => void;
  sceneId?: string | null;
  sources?: Source[];
  selectedSourceId?: string | null;
  onSelectSource?: (sourceId: string | null) => void;
  onSourceTransformChange?: (sourceId: string, transform: SourceTransform) => void;
  onToggleLock?: (sourceId: string, locked: boolean) => void;
  onDrawingSnapshotChange?: (snapshot: DrawingOverlaySnapshot) => void;
};

export function PreviewPanel({
  isStreaming = false,
  obsState = 'disconnected',
  onLaunchObs,
  sceneId = null,
  sources = [],
  selectedSourceId = null,
  onSelectSource,
  onSourceTransformChange,
  onToggleLock,
  onDrawingSnapshotChange,
}: Props) {
  const [draftTransforms, setDraftTransforms] = useState<Record<string, SourceTransform>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sourceId: string } | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none');
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  // True once GPU preview frames are actively painting the canvas.
  const [previewLive, setPreviewLive] = useState(false);
  // Explicit "move/resize sources in the preview" mode. OFF by default. The
  // live preview canvas keeps painting underneath the HTML editor layer, so
  // there is no native window to tear down when toggling this.
  const [editLayout, setEditLayout] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewHasFrameRef = useRef(false);
  const previewLastFrameAtRef = useRef(0);
  const previewDecodeInFlightRef = useRef(false);
  const previewPendingFrameRef = useRef<{ mime?: string; width?: number; height?: number; data: ArrayBuffer } | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingStrokesRef = useRef<DrawingStroke[]>([]);
  const activeDrawingStrokeRef = useRef<DrawingStroke | null>(null);
  const lastDrawingSnapshotAtRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousSceneIdRef = useRef<string | null>(sceneId);
  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initial: SourceTransform;
    scale: number;
    corner?: ResizeCorner;
  } | null>(null);

  // Paint the live program image from libobs into the in-DOM <canvas>. The
  // engine taps the rendered GPU output, JPEG-encodes each frame in the child
  // process, and ships it over IPC; we decode with createImageBitmap and blit.
  // No native window is involved, so this path can never stall mouse
  // hit-testing or taskbar activation the way a top-level overlay could. It
  // runs continuously while connected — including during Edit Layout, where the
  // editor boxes simply overlay the live canvas.
  useEffect(() => {
    if (!vaultApi?.preview?.start || obsState !== 'connected') {
      setPreviewLive(false);
      previewHasFrameRef.current = false;
      return;
    }

    let disposed = false;
    const paintFrame = (frame: { mime?: string; width?: number; height?: number; data: ArrayBuffer }) => {
      previewDecodeInFlightRef.current = true;
      const blob = new Blob([frame.data], { type: frame.mime || 'image/jpeg' });
      // createImageBitmap decodes off the UI thread. Keep only one decode in
      // flight and one pending frame so a backgrounded renderer cannot build a
      // multi-hour backlog of stale bitmaps.
      createImageBitmap(blob).then((bitmap) => {
        if (disposed) {
          bitmap.close?.();
          return;
        }
        const canvas = previewCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        previewLastFrameAtRef.current = Date.now();
        if (!previewHasFrameRef.current) {
          previewHasFrameRef.current = true;
          setPreviewLive(true);
        }
      }).catch(() => {}).finally(() => {
        if (disposed) {
          previewPendingFrameRef.current = null;
          previewDecodeInFlightRef.current = false;
          return;
        }
        const next = previewPendingFrameRef.current;
        previewPendingFrameRef.current = null;
        if (next) {
          paintFrame(next);
        } else {
          previewDecodeInFlightRef.current = false;
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
      if (previewDecodeInFlightRef.current) {
        previewPendingFrameRef.current = next;
        return;
      }
      paintFrame(next);
    };

    const frameHandler = onFrame as (...args: unknown[]) => void;
    vaultApi.on('obs:previewFrame', frameHandler);
    vaultApi.preview.start({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, fps: PREVIEW_FPS }).catch(() => {});

    const staleTimer = window.setInterval(() => {
      if (previewHasFrameRef.current && Date.now() - previewLastFrameAtRef.current > PREVIEW_STALE_MS) {
        previewHasFrameRef.current = false;
        setPreviewLive(false);
      }
    }, PREVIEW_STALE_MS);

    return () => {
      disposed = true;
      window.clearInterval(staleTimer);
      vaultApi.off('obs:previewFrame', frameHandler);
      vaultApi.preview.stop().catch(() => {});
      setPreviewLive(false);
      previewHasFrameRef.current = false;
      previewPendingFrameRef.current = null;
      previewDecodeInFlightRef.current = false;
    };
  }, [obsState]);

  const baseWidth = 1920;
  const baseHeight = 1080;

  const getViewport = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { scale: 1, offsetX: 0, offsetY: 0, width: baseWidth, height: baseHeight };
    const scale = Math.min(rect.width / baseWidth, rect.height / baseHeight);
    const width = baseWidth * scale;
    const height = baseHeight * scale;
    return {
      scale,
      width,
      height,
      offsetX: (rect.width - width) / 2,
      offsetY: (rect.height - height) / 2,
    };
  };

  const paintStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    if (stroke.points.length === 0) return;
    const width = stroke.tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = tokens.colors.gold;
    ctx.fillStyle = tokens.colors.gold;

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const clearDrawingCanvas = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, baseWidth, baseHeight);
  }, []);

  const redrawDrawingCanvas = useCallback((strokes: DrawingStroke[]) => {
    clearDrawingCanvas();
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    for (const stroke of strokes) paintStroke(ctx, stroke);
  }, [clearDrawingCanvas, paintStroke]);

  const emitDrawingSnapshot = useCallback((hasDrawing: boolean) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !onDrawingSnapshotChange) return;
    onDrawingSnapshotChange({ imageDataUrl: canvas.toDataURL('image/png'), hasDrawing });
  }, [onDrawingSnapshotChange]);

  const maybeEmitDrawingSnapshot = useCallback((hasDrawing: boolean) => {
    const now = Date.now();
    // Encoding a full 1080p canvas to a PNG data URL is the costly part, so
    // cap mid-stroke updates to ~6/sec. finishDrawing always emits the final
    // state, so nothing is lost when the pointer lifts.
    if (now - lastDrawingSnapshotAtRef.current < DRAWING_SNAPSHOT_THROTTLE_MS) return;
    lastDrawingSnapshotAtRef.current = now;
    emitDrawingSnapshot(hasDrawing);
  }, [emitDrawingSnapshot]);

  const drawingPointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): DrawingPoint | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const viewport = getViewport();
    const scale = viewport.scale || 1;
    const x = (e.clientX - rect.left - viewport.offsetX) / scale;
    const y = (e.clientY - rect.top - viewport.offsetY) / scale;
    if (x < 0 || y < 0 || x > baseWidth || y > baseHeight) return null;
    return { x: clamp(x, 0, baseWidth), y: clamp(y, 0, baseHeight) };
  };

  useEffect(() => {
    drawingStrokesRef.current = drawingStrokes;
    if (drawingStrokes.length === 0) return;
    redrawDrawingCanvas(drawingStrokes);
  }, [drawingStrokes, redrawDrawingCanvas]);

  const beginDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingTool === 'none') return;
    const point = drawingPointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const stroke: DrawingStroke = { tool: drawingTool, points: [point] };
    activeDrawingStrokeRef.current = stroke;
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (ctx) paintStroke(ctx, stroke);
    maybeEmitDrawingSnapshot(true);
  };

  const continueDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeDrawingStrokeRef.current;
    if (!stroke) return;
    const point = drawingPointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    e.stopPropagation();
    const previous = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (ctx) paintStroke(ctx, { tool: stroke.tool, points: [previous, point] });
    maybeEmitDrawingSnapshot(true);
  };

  // Commit the active stroke into the persisted stroke list. Shared by the
  // normal pointer-up path and the window-blur safety net (the user can switch
  // apps mid-stroke without ever lifting the pointer over our canvas).
  const commitActiveStroke = useCallback(() => {
    const stroke = activeDrawingStrokeRef.current;
    if (!stroke) return;
    activeDrawingStrokeRef.current = null;
    const next = [...drawingStrokesRef.current, { ...stroke, points: [...stroke.points] }];
    drawingStrokesRef.current = next;
    setDrawingStrokes(next);
    lastDrawingSnapshotAtRef.current = Date.now();
    emitDrawingSnapshot(true);
  }, [emitDrawingSnapshot]);

  const finishDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDrawingStrokeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    commitActiveStroke();
  };

  const clearDrawing = () => {
    activeDrawingStrokeRef.current = null;
    drawingStrokesRef.current = [];
    setDrawingStrokes([]);
    clearDrawingCanvas();
    emitDrawingSnapshot(false);
  };

  const transformFor = (source: Source): SourceTransform => {
    return draftTransforms[source.id] || source.transform || { x: 160, y: 120, width: 640, height: 360, rotation: 0 };
  };

  useEffect(() => {
    if (previousSceneIdRef.current !== sceneId) {
      onSelectSource?.(null);
      previousSceneIdRef.current = sceneId;
    }
    dragRef.current = null;
    setDraftTransforms({});
  }, [sceneId, onSelectSource]);

  const beginEdit = (e: React.PointerEvent, source: Source, mode: 'move' | 'resize', corner?: ResizeCorner) => {
    e.preventDefault();
    e.stopPropagation();
    if (source.locked) return;
    onSelectSource?.(source.id);
    const viewport = getViewport();
    dragRef.current = {
      id: source.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initial: transformFor(source),
      scale: viewport.scale || 1,
      corner,
    };
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const resizeFromCorner = (
    initial: SourceTransform,
    corner: ResizeCorner,
    dx: number,
    dy: number,
    lockAspectRatio: boolean
  ): SourceTransform => {
    const minSize = 40;
    const next = { ...initial };

    if (corner.includes('left')) {
      const rightEdge = initial.x + initial.width;
      next.x = clamp(initial.x + dx, 0, rightEdge - minSize);
      next.width = rightEdge - next.x;
    } else {
      next.width = clamp(initial.width + dx, minSize, baseWidth - initial.x);
    }

    if (corner.includes('top')) {
      const bottomEdge = initial.y + initial.height;
      next.y = clamp(initial.y + dy, 0, bottomEdge - minSize);
      next.height = bottomEdge - next.y;
    } else {
      next.height = clamp(initial.height + dy, minSize, baseHeight - initial.y);
    }

    if (lockAspectRatio && initial.width > 0 && initial.height > 0) {
      const ratio = initial.width / initial.height;
      const widthDelta = Math.abs(next.width - initial.width) / initial.width;
      const heightDelta = Math.abs(next.height - initial.height) / initial.height;

      if (widthDelta >= heightDelta) {
        next.height = clamp(Math.round(next.width / ratio), minSize, baseHeight);
      } else {
        next.width = clamp(Math.round(next.height * ratio), minSize, baseWidth);
      }

      if (corner.includes('left')) {
        next.x = clamp(initial.x + initial.width - next.width, 0, baseWidth - minSize);
      }
      if (corner.includes('top')) {
        next.y = clamp(initial.y + initial.height - next.height, 0, baseHeight - minSize);
      }
      next.width = clamp(next.width, minSize, baseWidth - next.x);
      next.height = clamp(next.height, minSize, baseHeight - next.y);
    }

    return next;
  };

  // Commit the in-progress drag's draft transform. Shared by pointer-up and the
  // window-blur safety net so a move/resize abandoned by an app switch still
  // persists instead of silently snapping back.
  const commitActiveDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDraftTransforms((prev) => {
      const finalTransform = prev[drag.id];
      if (finalTransform) onSourceTransformChange?.(drag.id, finalTransform);
      return prev;
    });
  }, [onSourceTransformChange]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.scale;
      const dy = (e.clientY - drag.startY) / drag.scale;
      const source = sources.find((s) => s.id === drag.id);
      const lockAspectRatio = !!source && ASPECT_LOCKED_SOURCE_TYPES.includes(source.type);
      const next =
        drag.mode === 'move'
          ? {
              ...drag.initial,
              x: Math.max(0, Math.min(baseWidth - 20, drag.initial.x + dx)),
              y: Math.max(0, Math.min(baseHeight - 20, drag.initial.y + dy)),
            }
          : resizeFromCorner(drag.initial, drag.corner ?? 'bottom-right', dx, dy, lockAspectRatio);
      setDraftTransforms((prev) => ({ ...prev, [drag.id]: next }));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', commitActiveDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', commitActiveDrag);
    };
  }, [commitActiveDrag, sources]);

  // When the OS window loses focus (alt-tab, click into another app), no
  // pointerup/pointercancel is delivered to us. Finalize whatever interaction
  // was in flight so strokes and transforms aren't lost.
  useEffect(() => {
    const onWindowBlur = () => {
      commitActiveStroke();
      commitActiveDrag();
    };
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [commitActiveStroke, commitActiveDrag]);

  const viewport = getViewport();
  const drawingActive = drawingTool !== 'none';

  return (
    <PreviewContainer>
      <PreviewChrome>
        {isStreaming && (
          <LiveIndicator>
            <Dot />
            LIVE
          </LiveIndicator>
        )}
        <PreviewChromeSpacer />
        {obsState === 'connected' && (
          <ModeChip>{previewLive ? 'Realtime' : 'Standby'}</ModeChip>
        )}
        {obsState === 'connected' && (
          <DrawingToolbar aria-label="Preview layout tools">
            <DrawingToolButton
              type="button"
              aria-label="Edit layout"
              aria-pressed={editLayout}
              title={editLayout ? 'Done — back to live preview' : 'Edit layout (move / resize sources)'}
              $active={editLayout}
              onClick={() => setEditLayout((on) => !on)}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m12 3 2.5 2.5M12 3 9.5 5.5M12 21l2.5-2.5M12 21l-2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </DrawingToolButton>
          </DrawingToolbar>
        )}
        <DrawingToolbar aria-label="Preview drawing tools">
          <DrawingToolButton
            type="button"
            aria-label="Draw on preview"
            aria-pressed={drawingTool === 'pen'}
            title="Pen"
            $active={drawingTool === 'pen'}
            onClick={() => setDrawingTool((tool) => (tool === 'pen' ? 'none' : 'pen'))}
          >
            <PenIcon />
          </DrawingToolButton>
          <DrawingToolButton
            type="button"
            aria-label="Erase preview drawing"
            aria-pressed={drawingTool === 'eraser'}
            title="Eraser"
            $active={drawingTool === 'eraser'}
            onClick={() => setDrawingTool((tool) => (tool === 'eraser' ? 'none' : 'eraser'))}
          >
            <EraserIcon />
          </DrawingToolButton>
          <DrawingToolButton
            type="button"
            aria-label="Clear preview drawing"
            title="Clear drawing"
            disabled={drawingStrokes.length === 0}
            onClick={clearDrawing}
          >
            <ClearIcon />
          </DrawingToolButton>
        </DrawingToolbar>
      </PreviewChrome>
      <ViewportSurface ref={containerRef}>
        <PreviewCanvas
          ref={previewCanvasRef}
          aria-label="Preview"
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          style={{
            left: viewport.offsetX,
            top: viewport.offsetY,
            width: viewport.width,
            height: viewport.height,
            opacity: previewLive ? 1 : 0,
          }}
        />
        {obsState === 'connected' && !previewLive && (
          <Placeholder>
            <span>Starting preview…</span>
          </Placeholder>
        )}
        {obsState !== 'connected' && (
          <Placeholder>
            <span>Streaming engine is not running</span>
            {onLaunchObs && <LaunchButton onClick={onLaunchObs}>Start Engine</LaunchButton>}
          </Placeholder>
        )}
        {obsState === 'connected' && editLayout && sources.length > 0 && (
          <EditorLayer
            aria-label="Preview source editor"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onSelectSource?.(null);
            }}
          >
            {sources.filter((source) => source.visible).map((source) => {
              const t = transformFor(source);
              return (
                <SourceBox
                  key={source.id}
                  $locked={!!source.locked}
                  $selected={source.id === selectedSourceId}
                  style={{
                    left: viewport.offsetX + t.x * viewport.scale,
                    top: viewport.offsetY + t.y * viewport.scale,
                    width: Math.max(8, t.width * viewport.scale),
                    height: Math.max(8, t.height * viewport.scale),
                  }}
                  onPointerDown={(e) => beginEdit(e, source, 'move')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, sourceId: source.id });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSource?.(source.id);
                  }}
                  title={source.locked ? `${source.name} is locked — click the lock to edit` : `Drag to move ${source.name}`}
                >
                  <SourceLabel $locked={!!source.locked}>
                    {onToggleLock && (
                      <LockToggle
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLock(source.id, !source.locked);
                        }}
                        title={source.locked ? 'Unlock — allow move/resize' : 'Lock'}
                        aria-label={source.locked ? `Unlock ${source.name}` : `Lock ${source.name}`}
                      >
                        {source.locked ? '🔒' : '🔓'}
                      </LockToggle>
                    )}
                    <LabelName>{source.name}</LabelName>
                  </SourceLabel>
                  {source.id === selectedSourceId && !source.locked && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as ResizeCorner[]).map((corner) => (
                    <ResizeHandle
                      key={corner}
                      $corner={corner}
                      onPointerDown={(e) => beginEdit(e, source, 'resize', corner)}
                      aria-label={`Resize ${corner} ${source.name}`}
                    />
                  ))}
                </SourceBox>
              );
            })}
          </EditorLayer>
        )}
        <DrawingCanvas
          ref={drawingCanvasRef}
          aria-label="Preview drawing canvas"
          width={baseWidth}
          height={baseHeight}
          $active={drawingActive}
          $eraser={drawingTool === 'eraser'}
          style={{
            left: viewport.offsetX,
            top: viewport.offsetY,
            width: viewport.width,
            height: viewport.height,
          }}
          onPointerDown={beginDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
        />
      </ViewportSurface>
      {contextMenu && (() => {
        const source = sources.find((s) => s.id === contextMenu.sourceId);
        if (!source) return null;
        const t = transformFor(source);
        const aspect = t.width > 0 && t.height > 0 ? t.width / t.height : 16 / 9;
        const apply = (next: SourceTransform) => onSourceTransformChange?.(source.id, next);
        const fitW = aspect >= baseWidth / baseHeight ? baseWidth : Math.round(baseHeight * aspect);
        const fitH = aspect >= baseWidth / baseHeight ? Math.round(baseWidth / aspect) : baseHeight;
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={[
              {
                label: 'Fit to Screen',
                action: () => apply({ x: Math.round((baseWidth - fitW) / 2), y: Math.round((baseHeight - fitH) / 2), width: fitW, height: fitH, rotation: 0 }),
                disabled: !!source.locked,
              },
              {
                label: 'Stretch to Screen',
                action: () => apply({ x: 0, y: 0, width: baseWidth, height: baseHeight, rotation: 0 }),
                disabled: !!source.locked,
              },
              {
                label: 'Center on Screen',
                action: () => apply({ ...t, x: Math.round((baseWidth - t.width) / 2), y: Math.round((baseHeight - t.height) / 2) }),
                disabled: !!source.locked,
              },
            ]}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}
    </PreviewContainer>
  );
}

export const MemoizedPreviewPanel = memo(PreviewPanel);
