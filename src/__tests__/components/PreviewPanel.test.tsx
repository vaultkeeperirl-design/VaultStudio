import { render, screen, fireEvent, act } from '@testing-library/react';
import { PreviewPanel } from '../../components/studio/PreviewPanel';
import type { Source } from '../../types';

const source: Source = {
  id: 'src-1',
  name: 'Webcam',
  type: 'camera',
  visible: true,
  locked: false,
  settings: {},
  transform: { x: 100, y: 120, width: 640, height: 360 },
};

function installCanvasMock(dataUrl = 'data:image/png;base64,drawing') {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    closePath: vi.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);

  return context;
}

describe('PreviewPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Source move/resize handles only exist in "Edit layout" mode (off by default
  // so the live GPU mirror stays seamless).
  const enterEditLayout = () => fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

  it('draws with pen, supports eraser mode, persists across scene changes, and clears on request', () => {
    const context = installCanvasMock();
    const onDrawingSnapshotChange = vi.fn();
    const { rerender } = render(
      <PreviewPanel
        obsState="connected"
        sceneId="scene-1"
        onDrawingSnapshotChange={onDrawingSnapshotChange}
      />
    );

    const penButton = screen.getByRole('button', { name: 'Draw on preview' });
    const eraserButton = screen.getByRole('button', { name: 'Erase preview drawing' });
    const clearButton = screen.getByRole('button', { name: 'Clear preview drawing' });

    expect(clearButton).toBeDisabled();

    fireEvent.click(eraserButton);
    expect(eraserButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(penButton);
    expect(penButton).toHaveAttribute('aria-pressed', 'true');
    expect(eraserButton).toHaveAttribute('aria-pressed', 'false');

    const canvas = screen.getByLabelText('Preview drawing canvas') as HTMLCanvasElement;
    vi.spyOn(canvas.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 130, pointerId: 1 });

    expect(context.stroke).toHaveBeenCalled();
    expect(onDrawingSnapshotChange).toHaveBeenLastCalledWith({
      imageDataUrl: 'data:image/png;base64,drawing',
      hasDrawing: true,
    });
    expect(clearButton).not.toBeDisabled();

    rerender(
      <PreviewPanel
        obsState="connected"
        sceneId="scene-2"
        onDrawingSnapshotChange={onDrawingSnapshotChange}
      />
    );

    expect(screen.getByRole('button', { name: 'Clear preview drawing' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear preview drawing' }));

    expect(context.clearRect).toHaveBeenCalled();
    expect(onDrawingSnapshotChange).toHaveBeenLastCalledWith({
      imageDataUrl: 'data:image/png;base64,drawing',
      hasDrawing: false,
    });
    expect(screen.getByRole('button', { name: 'Clear preview drawing' })).toBeDisabled();
  });

  it('moves unlocked sources from the preview editor', () => {
    const onTransform = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source]}
        selectedSourceId="src-1"
        onSourceTransformChange={onTransform}
      />
    );

    enterEditLayout();
    const box = screen.getByTitle('Drag to move Webcam');
    vi.spyOn(box.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 148, clientY: 124 });
    fireEvent.pointerUp(window);

    expect(onTransform).toHaveBeenCalledWith('src-1', expect.objectContaining({ x: 196, y: 168 }));
  });

  it('does not show resize handles for locked sources', () => {
    render(
      <PreviewPanel
        obsState="connected"
        sources={[{ ...source, locked: true }]}
        selectedSourceId="src-1"
      />
    );

    enterEditLayout();
    expect(screen.getByTitle(/Webcam is locked/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Resize Webcam')).not.toBeInTheDocument();
  });

  it('unlocks a locked source from the preview lock toggle in edit layout', () => {
    const onToggleLock = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[{ ...source, locked: true }]}
        selectedSourceId="src-1"
        onToggleLock={onToggleLock}
      />
    );

    enterEditLayout();
    fireEvent.click(screen.getByLabelText('Unlock Webcam'));
    expect(onToggleLock).toHaveBeenCalledWith('src-1', false);
  });

  it('shows all source boxes in edit layout but resize handles only on the selected one', () => {
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source, { ...source, id: 'src-2', name: 'Alerts', type: 'browser' }]}
        selectedSourceId="src-2"
      />
    );

    enterEditLayout();
    // Every visible source is grabbable in edit mode...
    expect(screen.getByTitle('Drag to move Webcam')).toBeInTheDocument();
    expect(screen.getByTitle('Drag to move Alerts')).toBeInTheDocument();
    // ...but only the selected source exposes resize handles.
    expect(screen.queryByLabelText('Resize bottom-right Webcam')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Resize bottom-right Alerts')).toBeInTheDocument();
  });

  it('clears the selected source when empty preview space is clicked', () => {
    const onSelectSource = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source]}
        selectedSourceId="src-1"
        onSelectSource={onSelectSource}
      />
    );

    enterEditLayout();
    fireEvent.pointerDown(screen.getByLabelText('Preview source editor'));

    expect(onSelectSource).toHaveBeenCalledWith(null);
  });

  it('resizes unlocked sources from the top-left corner while preserving visual aspect ratio', () => {
    const onTransform = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source]}
        selectedSourceId="src-1"
        onSourceTransformChange={onTransform}
      />
    );

    enterEditLayout();
    const handle = screen.getByLabelText('Resize top-left Webcam');
    vi.spyOn(handle.parentElement!.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 52, clientY: 76 });
    fireEvent.pointerUp(window);

    expect(onTransform).toHaveBeenCalledWith(
      'src-1',
      expect.objectContaining({ x: 4, y: 66, width: 736, height: 414 })
    );
  });

  it('keeps visual sources locked to their aspect ratio while resizing', () => {
    const onTransform = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source]}
        selectedSourceId="src-1"
        onSourceTransformChange={onTransform}
      />
    );

    enterEditLayout();
    const handle = screen.getByLabelText('Resize bottom-right Webcam');
    vi.spyOn(handle.parentElement!.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 196, clientY: 106 });
    fireEvent.pointerUp(window);

    expect(onTransform).toHaveBeenCalledWith(
      'src-1',
      expect.objectContaining({ x: 100, y: 120, width: 832, height: 468 })
    );
  });

  it('clears selection when the active scene changes', () => {
    const onSelectSource = vi.fn();
    const { rerender } = render(
      <PreviewPanel
        obsState="connected"
        sceneId="scene-1"
        sources={[source]}
        selectedSourceId="src-1"
        onSelectSource={onSelectSource}
      />
    );

    rerender(
      <PreviewPanel
        obsState="connected"
        sceneId="scene-2"
        sources={[{ ...source, name: 'Different Scene Source' }]}
        selectedSourceId="src-1"
        onSelectSource={onSelectSource}
      />
    );

    expect(onSelectSource).toHaveBeenCalledWith(null);
  });

  it('finalizes the active drawing stroke when the window loses focus', () => {
    installCanvasMock();
    const onDrawingSnapshotChange = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sceneId="scene-1"
        onDrawingSnapshotChange={onDrawingSnapshotChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draw on preview' }));
    const canvas = screen.getByLabelText('Preview drawing canvas') as HTMLCanvasElement;
    vi.spyOn(canvas.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 });

    // Simulate the user switching to another app before lifting the pointer.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(onDrawingSnapshotChange).toHaveBeenLastCalledWith({
      imageDataUrl: 'data:image/png;base64,drawing',
      hasDrawing: true,
    });
    expect(screen.getByRole('button', { name: 'Clear preview drawing' })).not.toBeDisabled();
  });

  it('applies the current draft transform when the window loses focus during a source move', () => {
    const onTransform = vi.fn();
    render(
      <PreviewPanel
        obsState="connected"
        sources={[source]}
        selectedSourceId="src-1"
        onSourceTransformChange={onTransform}
      />
    );

    enterEditLayout();
    const box = screen.getByTitle('Drag to move Webcam');
    vi.spyOn(box.parentElement!.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 148, clientY: 124 });

    // Simulate the user switching to another app before lifting the pointer.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(onTransform).toHaveBeenCalledWith('src-1', expect.objectContaining({ x: 196, y: 168 }));
  });
});
