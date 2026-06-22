import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from '../../components/common/ContextMenu';

describe('ContextMenu', () => {
  const baseItems = [
    { label: 'Rename', action: vi.fn() },
    { label: 'Duplicate', action: vi.fn() },
    'separator' as const,
    { label: 'Delete', action: vi.fn(), danger: true },
  ];

  it('renders all items', () => {
    render(<ContextMenu x={100} y={100} items={baseItems} onClose={vi.fn()} />);
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls action and closes on item click', () => {
    const action = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        items={[{ label: 'Rename', action }]}
        onClose={onClose}
      />
    );
    fireEvent.mouseDown(screen.getByText('Rename'));
    expect(action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={100} items={baseItems} onClose={onClose} />);
    act(() => { vi.runAllTimers(); });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('closes on click outside', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={100} items={baseItems} onClose={onClose} />);
    act(() => { vi.runAllTimers(); });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not block clicks on elements behind the menu while it is open', () => {
    // The full-window MenuOverlay used to have pointer-events: auto, which
    // swallowed every click outside the menu. If the menu ever failed to
    // unmount (stuck state, async cleanup race, etc.) the whole window became
    // unclickable — the "exit Edit Layout → can't click anything" symptom.
    // The document mousedown listener already handles "click outside to close",
    // so the overlay should be pointer-events: none.
    const onClose = vi.fn();
    const { container } = render(
      <>
        <button>Behind</button>
        <ContextMenu x={100} y={100} items={baseItems} onClose={onClose} />
      </>
    );
    const divs = Array.from(container.querySelectorAll('div'));
    const overlay = divs.find((d) => d.children.length === 0 && d.textContent === '');
    expect(overlay, 'MenuOverlay should be a bare div with no children').toBeTruthy();
    expect(window.getComputedStyle(overlay as HTMLElement).pointerEvents).toBe('none');
  });
});
