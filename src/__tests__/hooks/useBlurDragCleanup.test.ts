import { renderHook } from '@testing-library/react';
import { useBlurDragCleanup } from '../../hooks/useBlurDragCleanup';

describe('useBlurDragCleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches pointerup and mouseup on document when window blurs', () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    renderHook(() => useBlurDragCleanup());

    window.dispatchEvent(new Event('blur'));

    const eventTypes = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type);
    expect(eventTypes).toContain('pointerup');
    expect(eventTypes).toContain('mouseup');
  });

  it('dispatches pointerup and mouseup on document when window regains focus', () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    renderHook(() => useBlurDragCleanup());

    window.dispatchEvent(new Event('focus'));

    const eventTypes = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type);
    expect(eventTypes).toContain('pointerup');
    expect(eventTypes).toContain('mouseup');
  });

  it('dispatches pointerup and mouseup when the document becomes hidden', () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    renderHook(() => useBlurDragCleanup());

    const visibilityHandler = addEventListenerSpy.mock.calls.find(
      ([type]) => type === 'visibilitychange'
    )?.[1] as EventListener;

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    visibilityHandler(new Event('visibilitychange'));

    const eventTypes = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type);
    expect(eventTypes).toContain('pointerup');
    expect(eventTypes).toContain('mouseup');
  });

  it('does not dispatch pointerup/mouseup when visibility changes to visible', () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    renderHook(() => useBlurDragCleanup());

    const visibilityHandler = addEventListenerSpy.mock.calls.find(
      ([type]) => type === 'visibilitychange'
    )?.[1] as EventListener;

    dispatchSpy.mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    visibilityHandler(new Event('visibilitychange'));

    const eventTypes = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type);
    expect(eventTypes).not.toContain('pointerup');
    expect(eventTypes).not.toContain('mouseup');
  });
});
