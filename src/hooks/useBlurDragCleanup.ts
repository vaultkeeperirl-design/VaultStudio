import { useEffect } from 'react';

/**
 * Defensive cleanup: when the window loses focus while a pointer is pressed,
 * some drag libraries (react-grid-layout / react-draggable) never receive the
 * matching pointerup/mouseup and stay stuck in drag mode. Dispatching those
 * events on the document breaks the drag so the UI remains responsive when the
 * user returns from another app/monitor.
 */
export function useBlurDragCleanup(): void {
  useEffect(() => {
    const cancelStuckDrag = () => {
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };

    window.addEventListener('blur', cancelStuckDrag);
    window.addEventListener('focus', cancelStuckDrag);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelStuckDrag();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', cancelStuckDrag);
      window.removeEventListener('focus', cancelStuckDrag);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
