import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const MenuOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  /* The overlay is purely a visual backdrop. "Click outside to close" is
     handled by the document mousedown listener below; if this overlay ever
     had pointer-events: auto it would swallow every click outside the menu
     and, if the menu failed to unmount, freeze the whole window. */
  pointer-events: none;
`;

const MenuWrapper = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  min-width: 170px;
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  padding: ${tokens.spacing.xs};
  display: flex;
  flex-direction: column;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  width: 100%;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: none;
  border: none;
  border-radius: ${tokens.borderRadius.sm};
  color: ${({ $danger }) => ($danger ? tokens.colors.danger : tokens.colors.text)};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;
  text-align: left;
  white-space: nowrap;

  &:hover {
    background-color: ${({ $danger }) =>
      $danger ? 'rgba(255, 48, 69, 0.12)' : tokens.colors.panel};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Separator = styled.div`
  height: 1px;
  background-color: ${tokens.colors.border};
  margin: ${tokens.spacing.xs} 0;
`;

export type ContextMenuItem = {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  x: number;
  y: number;
  items: (ContextMenuItem | 'separator')[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const menuWidth = 180;
  const menuHeight = items.length * 36;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight);

  return (
    <>
      <MenuOverlay />
      <MenuWrapper ref={ref} $x={Math.max(0, adjustedX)} $y={Math.max(0, adjustedY)}>
        {items.map((item, i) =>
          item === 'separator' ? (
            <Separator key={i} />
          ) : (
            <MenuItem
              key={i}
              $danger={item.danger}
              disabled={item.disabled}
              onMouseDown={(e) => {
                e.stopPropagation();
                item.action();
                onClose();
              }}
            >
              {item.label}
            </MenuItem>
          )
        )}
      </MenuWrapper>
    </>
  );
}
