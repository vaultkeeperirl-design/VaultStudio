import { useEffect } from 'react';

type ShortcutMap = Record<string, () => void | Promise<void>>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!event.ctrlKey && !event.metaKey) return;

      const key = `mod+${event.key.toLowerCase()}`;
      const action = shortcuts[key];
      if (!action) return;

      event.preventDefault();
      void action();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
