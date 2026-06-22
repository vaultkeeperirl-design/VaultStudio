import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAWING_OVERLAY_SOURCE_NAME,
  syncDrawingOverlay,
  __resetDrawingOverlayStateForTests,
} from './drawing-overlay';

const PNG = Buffer.from([1, 2, 3, 4]);
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

function makeApi() {
  return {
    addSource: vi.fn().mockResolvedValue({ id: '42', sceneItemId: 42, name: DRAWING_OVERLAY_SOURCE_NAME }),
    moveSource: vi.fn().mockResolvedValue(undefined),
    setSourceLocked: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    updateSourceSettings: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncDrawingOverlay', () => {
  const tempDirs: string[] = [];

  const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultstudio-drawing-'));
    tempDirs.push(dir);
    return dir;
  };

  beforeEach(() => {
    __resetDrawingOverlayStateForTests();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the drawing image and a top-layer browser source only where missing', async () => {
    const userDataDir = tempDir();
    const obsApi = makeApi();

    const result = await syncDrawingOverlay({
      imageDataUrl: DATA_URL,
      hasDrawing: true,
      userDataDir,
      scenes: [
        { id: 'Starting Soon', sources: [] },
        {
          id: 'Gameplay',
          sources: [
            // Already front-most and locked — steady state, no obs calls needed.
            { id: '7', sceneItemId: 7, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
          ],
        },
      ],
      obsApi,
    });

    expect(fs.readFileSync(result.imagePath)).toEqual(PNG);
    expect(fs.readFileSync(result.pagePath, 'utf-8')).toContain('overlay.png');
    expect(obsApi.addSource).toHaveBeenCalledTimes(1);
    expect(obsApi.addSource).toHaveBeenCalledWith(
      'Starting Soon',
      'browser',
      expect.objectContaining({ name: DRAWING_OVERLAY_SOURCE_NAME, url: expect.stringMatching(/^file:/), shutdown: true })
    );
    expect(obsApi.moveSource).toHaveBeenCalledWith('Starting Soon', 42, 'top');
    expect(obsApi.setSourceLocked).toHaveBeenCalledWith('Starting Soon', 42, true);
    // The already-correct Gameplay overlay is left untouched.
    expect(obsApi.moveSource).not.toHaveBeenCalledWith('Gameplay', 7, 'top');
    expect(obsApi.setSourceLocked).not.toHaveBeenCalledWith('Gameplay', 7, true);
    expect(obsApi.removeSource).not.toHaveBeenCalled();
    expect(result.scenesSynced).toBe(2);
  });

  it('removes duplicate overlays, keeping a single one', async () => {
    const obsApi = makeApi();

    await syncDrawingOverlay({
      imageDataUrl: DATA_URL,
      hasDrawing: true,
      userDataDir: tempDir(),
      scenes: [
        {
          id: 'Gameplay',
          sources: [
            { id: '7', sceneItemId: 7, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
            { id: '8', sceneItemId: 8, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
            { id: '9', sceneItemId: 9, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
          ],
        },
      ],
      obsApi,
    });

    expect(obsApi.addSource).not.toHaveBeenCalled();
    expect(obsApi.removeSource).toHaveBeenCalledTimes(2);
    expect(obsApi.removeSource).toHaveBeenCalledWith('Gameplay', 8);
    expect(obsApi.removeSource).toHaveBeenCalledWith('Gameplay', 9);
  });

  it('re-asserts the overlay to the top when another source sits above it', async () => {
    const obsApi = makeApi();

    await syncDrawingOverlay({
      imageDataUrl: DATA_URL,
      hasDrawing: true,
      userDataDir: tempDir(),
      scenes: [
        {
          id: 'Gameplay',
          sources: [
            { id: '3', sceneItemId: 3, name: 'Webcam', type: 'camera' },
            { id: '7', sceneItemId: 7, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
          ],
        },
      ],
      obsApi,
    });

    expect(obsApi.moveSource).toHaveBeenCalledWith('Gameplay', 7, 'top');
    expect(obsApi.addSource).not.toHaveBeenCalled();
  });

  it('removes every overlay from every scene when the drawing is cleared', async () => {
    const obsApi = makeApi();

    const result = await syncDrawingOverlay({
      imageDataUrl: DATA_URL,
      hasDrawing: false,
      userDataDir: tempDir(),
      scenes: [
        {
          id: 'Starting Soon',
          sources: [{ id: '5', sceneItemId: 5, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true }],
        },
        {
          id: 'Gameplay',
          sources: [
            { id: '7', sceneItemId: 7, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
            { id: '8', sceneItemId: 8, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true },
          ],
        },
      ],
      obsApi,
    });

    expect(obsApi.addSource).not.toHaveBeenCalled();
    expect(obsApi.removeSource).toHaveBeenCalledTimes(3);
    expect(obsApi.removeSource).toHaveBeenCalledWith('Starting Soon', 5);
    expect(obsApi.removeSource).toHaveBeenCalledWith('Gameplay', 7);
    expect(obsApi.removeSource).toHaveBeenCalledWith('Gameplay', 8);
    expect(result.scenesSynced).toBe(0);
  });

  it('re-asserts the overlay settings once per session', async () => {
    const obsApi = makeApi();
    const userDataDir = tempDir();
    const scenes = [
      {
        id: 'Gameplay',
        sources: [{ id: '7', sceneItemId: 7, name: DRAWING_OVERLAY_SOURCE_NAME, type: 'browser', locked: true }],
      },
    ];

    await syncDrawingOverlay({ imageDataUrl: DATA_URL, hasDrawing: true, userDataDir, scenes, obsApi });
    await syncDrawingOverlay({ imageDataUrl: DATA_URL, hasDrawing: true, userDataDir, scenes, obsApi });

    expect(obsApi.updateSourceSettings).toHaveBeenCalledTimes(1);
    expect(obsApi.updateSourceSettings).toHaveBeenCalledWith(
      DRAWING_OVERLAY_SOURCE_NAME,
      expect.objectContaining({ url: expect.stringMatching(/^file:/), fps: expect.any(Number), shutdown: true })
    );
  });
});
