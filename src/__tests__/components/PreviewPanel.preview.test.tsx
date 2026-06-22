import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VaultStudioAPI } from '../../types';

type PreviewApiMock = Pick<VaultStudioAPI, 'on' | 'off' | 'preview'>;

function installPreviewApi(): PreviewApiMock {
  const api: PreviewApiMock = {
    on: vi.fn(),
    off: vi.fn(),
    preview: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
  };

  Object.defineProperty(window, 'vaultstudio', {
    configurable: true,
    value: api,
  });

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });

  return api;
}

describe('PreviewPanel in-DOM GPU frame stream', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'vaultstudio');
  });

  it('starts the frame stream when connected and never opens a native viewport window', async () => {
    const api = installPreviewApi();
    const { PreviewPanel } = await import('../../components/studio/PreviewPanel');

    render(<PreviewPanel obsState="connected" />);

    await waitFor(() => {
      expect(api.preview.start).toHaveBeenCalledWith({ width: 640, height: 360, fps: 30 });
    });
    expect(api.preview).not.toHaveProperty('startViewport');
    expect(api.preview).not.toHaveProperty('updateViewport');
    // It subscribes to the engine's GPU frames.
    expect(api.on).toHaveBeenCalledWith('obs:previewFrame', expect.any(Function));
  });

  it('does not start anything until the engine is connected', async () => {
    const api = installPreviewApi();
    const { PreviewPanel } = await import('../../components/studio/PreviewPanel');

    render(<PreviewPanel obsState="disconnected" />);

    await Promise.resolve();
    expect(api.preview.start).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveProperty('startViewport');
  });

  it('stops the frame stream on unmount', async () => {
    const api = installPreviewApi();
    const { PreviewPanel } = await import('../../components/studio/PreviewPanel');

    const { unmount } = render(<PreviewPanel obsState="connected" />);

    await waitFor(() => {
      expect(api.preview.start).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(api.preview.stop).toHaveBeenCalled();
    });
    expect(api.preview).not.toHaveProperty('stopViewport');
  });

  it('keeps the single frame stream running across Edit Layout toggles (no window churn)', async () => {
    const api = installPreviewApi();
    const { PreviewPanel } = await import('../../components/studio/PreviewPanel');

    render(<PreviewPanel obsState="connected" />);

    await waitFor(() => {
      expect(api.preview.start).toHaveBeenCalled();
    });
    const startCountBefore = vi.mocked(api.preview.start).mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
      await Promise.resolve();
    });

    // Toggling Edit Layout must not restart the stream.
    expect(vi.mocked(api.preview.start).mock.calls.length).toBe(startCountBefore);
    expect(api.preview).not.toHaveProperty('startViewport');
    expect(api.preview).not.toHaveProperty('stopViewport');
  });

  it('keeps backgrounded preview decoding bounded to one frame plus the newest pending frame', async () => {
    const api = installPreviewApi();
    const decodeResolvers: Array<(bitmap: ImageBitmap) => void> = [];
    const bitmaps = [
      { close: vi.fn() },
      { close: vi.fn() },
    ] as unknown as ImageBitmap[];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: vi.fn(() => new Promise<ImageBitmap>((resolve) => decodeResolvers.push(resolve))),
    });

    const { PreviewPanel } = await import('../../components/studio/PreviewPanel');
    render(<PreviewPanel obsState="connected" />);

    await waitFor(() => {
      expect(api.on).toHaveBeenCalledWith('obs:previewFrame', expect.any(Function));
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(api.preview.stop).not.toHaveBeenCalled();

    const frameHandler = vi.mocked(api.on).mock.calls.find(([event]) => event === 'obs:previewFrame')?.[1] as
      | ((frame: { mime: string; width: number; height: number; data: Uint8Array }) => void)
      | undefined;
    expect(frameHandler).toBeDefined();

    await act(async () => {
      frameHandler?.({ mime: 'image/jpeg', width: 1280, height: 720, data: new Uint8Array([1]) });
      frameHandler?.({ mime: 'image/jpeg', width: 1280, height: 720, data: new Uint8Array([2]) });
      frameHandler?.({ mime: 'image/jpeg', width: 1280, height: 720, data: new Uint8Array([3]) });
      await Promise.resolve();
    });

    expect(createImageBitmap).toHaveBeenCalledTimes(1);

    await act(async () => {
      decodeResolvers[0](bitmaps[0]);
      await Promise.resolve();
    });

    expect(createImageBitmap).toHaveBeenCalledTimes(2);

    await act(async () => {
      decodeResolvers[1](bitmaps[1]);
      await Promise.resolve();
    });

    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });
});
