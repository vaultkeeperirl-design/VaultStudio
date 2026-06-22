import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

export const DRAWING_OVERLAY_SOURCE_NAME = 'VaultStudio Drawing Overlay';

type DrawingOverlaySource = {
  id?: string;
  sceneItemId?: number;
  name: string;
  type?: string;
  locked?: boolean;
};

type DrawingOverlayScene = {
  id: string;
  sources?: DrawingOverlaySource[];
};

type DrawingOverlayObsApi = {
  addSource(sceneId: string, type: string, settings: Record<string, unknown>): Promise<DrawingOverlaySource>;
  moveSource(sceneId: string, sceneItemId: number, direction: 'top'): Promise<unknown>;
  setSourceLocked(sceneId: string, sceneItemId: number, locked: boolean): Promise<unknown>;
  removeSource(sceneId: string, sceneItemId: number): Promise<unknown>;
  updateSourceSettings?(sourceName: string, settings: Record<string, unknown>): Promise<unknown>;
};

type SyncDrawingOverlayOptions = {
  imageDataUrl: string;
  hasDrawing: boolean;
  userDataDir: string;
  scenes: DrawingOverlayScene[];
  obsApi: DrawingOverlayObsApi;
};

type SyncDrawingOverlayResult = {
  imagePath: string;
  pagePath: string;
  sourceName: string;
  scenesSynced: number;
};

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
// The browser source repaints from the polled PNG; 10 fps is plenty for hand
// drawing and keeps CEF render load low. The drawing snapshot itself is
// throttled in the renderer to roughly the same cadence.
const OVERLAY_FPS = 10;
const OVERLAY_REFRESH_MS = 150;

function buildOverlayPage(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
    }
    img {
      display: block;
      width: 100vw;
      height: 100vh;
      object-fit: fill;
    }
  </style>
</head>
<body>
  <img id="drawing" alt="">
  <script>
    const drawing = document.getElementById('drawing');
    const refresh = () => {
      drawing.src = 'overlay.png?ts=' + Date.now();
    };
    refresh();
    setInterval(refresh, ${OVERLAY_REFRESH_MS});
  </script>
</body>
</html>
`;
}

function decodePngDataUrl(imageDataUrl: string): Buffer {
  const match = imageDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error('Drawing overlay must be a PNG data URL');
  return Buffer.from(match[1], 'base64');
}

function sceneItemIdFor(source: DrawingOverlaySource | null | undefined): number | null {
  if (!source) return null;
  if (typeof source.sceneItemId === 'number' && Number.isFinite(source.sceneItemId)) return source.sceneItemId;
  const parsed = Number(source.id);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOverlaySource(source: DrawingOverlaySource): boolean {
  return source.name === DRAWING_OVERLAY_SOURCE_NAME && (source.type === 'browser' || source.type === undefined);
}

// Drawing snapshots fire several times a second while the user is drawing.
// getScenes()/addSource() are async, so two snapshots racing would each see
// "no overlay yet" and both add one — that's the source of the duplicates and
// much of the lag. Serialise every sync onto a single queue so each one sees
// the result of the previous.
let syncQueue: Promise<unknown> = Promise.resolve();

// The overlay browser source is shared and persists across draw/clear cycles
// (and across older builds). Re-assert its low-cost settings once so reused
// sources pick up the lighter fps / shutdown-when-idle behaviour.
let overlaySettingsApplied = false;

async function runSync(options: SyncDrawingOverlayOptions): Promise<SyncDrawingOverlayResult> {
  const { imageDataUrl, hasDrawing, userDataDir, scenes, obsApi } = options;

  const overlayDir = path.join(userDataDir, 'drawing-overlay');
  fs.mkdirSync(overlayDir, { recursive: true });

  const imagePath = path.join(overlayDir, 'overlay.png');
  const pagePath = path.join(overlayDir, 'overlay.html');
  fs.writeFileSync(imagePath, decodePngDataUrl(imageDataUrl));

  const page = buildOverlayPage();
  if (!fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf-8') !== page) {
    fs.writeFileSync(pagePath, page, 'utf-8');
  }

  const url = pathToFileURL(pagePath).toString();
  const settings = {
    url,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    fps: OVERLAY_FPS,
    // Tear the CEF browser down when no scene shows the overlay (i.e. when the
    // drawing is cleared and its scene items are removed) so it costs nothing
    // while idle.
    shutdown: true,
  };

  let scenesSynced = 0;
  for (const scene of scenes) {
    const sources = scene.sources ?? [];
    const overlays = sources.filter(isOverlaySource);

    if (!hasDrawing) {
      // No active drawing — pull the overlay out of every scene entirely so it
      // stops rendering and never lingers in the source list.
      for (const overlay of overlays) {
        const id = sceneItemIdFor(overlay);
        if (id !== null) await obsApi.removeSource(scene.id, id).catch(() => undefined);
      }
      continue;
    }

    if (overlays.length === 0) {
      // First drawing on this scene — create the single shared overlay,
      // pinned to the top and locked so the user can't move or select it.
      const created = await obsApi.addSource(scene.id, 'browser', {
        name: DRAWING_OVERLAY_SOURCE_NAME,
        ...settings,
      });
      const id = sceneItemIdFor(created);
      if (id !== null) {
        await obsApi.moveSource(scene.id, id, 'top').catch(() => undefined);
        await obsApi.setSourceLocked(scene.id, id, true).catch(() => undefined);
      }
      scenesSynced++;
      continue;
    }

    // Keep exactly one overlay; remove any duplicates left over from older
    // builds or earlier races.
    const [keep, ...extras] = overlays;
    for (const extra of extras) {
      const id = sceneItemIdFor(extra);
      if (id !== null) await obsApi.removeSource(scene.id, id).catch(() => undefined);
    }

    const keepId = sceneItemIdFor(keep);
    if (keepId !== null) {
      // sources is top-first; only re-assert position/lock when something has
      // changed (e.g. the user added a new source above it) to avoid churning
      // the scene collection on every snapshot.
      const frontMost = sceneItemIdFor(sources[0]);
      if (frontMost !== keepId) await obsApi.moveSource(scene.id, keepId, 'top').catch(() => undefined);
      if (!keep.locked) await obsApi.setSourceLocked(scene.id, keepId, true).catch(() => undefined);
    }
    scenesSynced++;
  }

  // Once per session, push the current settings onto the (possibly reused)
  // shared source so older overlays stop running CEF at the old rate.
  if (hasDrawing && scenesSynced > 0 && !overlaySettingsApplied && obsApi.updateSourceSettings) {
    await obsApi.updateSourceSettings(DRAWING_OVERLAY_SOURCE_NAME, settings).catch(() => undefined);
    overlaySettingsApplied = true;
  }

  return { imagePath, pagePath, sourceName: DRAWING_OVERLAY_SOURCE_NAME, scenesSynced };
}

export function syncDrawingOverlay(options: SyncDrawingOverlayOptions): Promise<SyncDrawingOverlayResult> {
  const next = syncQueue.then(
    () => runSync(options),
    () => runSync(options)
  );
  // Swallow rejections on the queue tail so one failure doesn't break the chain.
  syncQueue = next.catch(() => undefined);
  return next;
}

/** Test-only: reset module-level state between cases. */
export function __resetDrawingOverlayStateForTests() {
  syncQueue = Promise.resolve();
  overlaySettingsApplied = false;
}
