import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const filesThatDefineThePreviewSurface = [
  'electron/main.ts',
  'electron/preload.ts',
  'electron/ipc/index.ts',
  'electron/ipc/obs-ipc.ts',
  'electron/services/obs-engine.ts',
  'native/addon/addon.cc',
  'native/addon/obs-video.cc',
  'src/types/index.ts',
  'src/stores/studioStore.ts',
  'src/components/common/RenameDialog.tsx',
];

const deadPreviewSurfaceTerms = [
  'repositionPreviewViewport',
  'preview:windowChange',
  'preview:startViewport',
  'preview:updateViewport',
  'preview:stopViewport',
  'preview:setViewportVisible',
  'preview:captureViewport',
  'startViewport',
  'updateViewport',
  'stopViewport',
  'setViewportVisible',
  'captureViewport',
  'StartPreviewViewport',
  'UpdatePreviewViewport',
  'StopPreviewViewport',
  'SetPreviewViewportVisible',
  'CapturePreviewViewport',
  'startPreviewViewport',
  'updatePreviewViewport',
  'stopPreviewViewport',
  'setPreviewViewportVisible',
  'capturePreviewViewport',
];

describe('preview path surface', () => {
  it('exposes only the DOM frame-stream preview path', () => {
    const offenders: string[] = [];

    for (const file of filesThatDefineThePreviewSurface) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf-8');
      for (const term of deadPreviewSurfaceTerms) {
        if (source.includes(term)) offenders.push(`${file}: ${term}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('uses binary IPC serialization for preview frames from the engine child process', () => {
    const source = readFileSync(path.join(process.cwd(), 'electron/services/obs-engine.ts'), 'utf-8');

    expect(source).toContain("serialization: 'advanced'");
  });
});
