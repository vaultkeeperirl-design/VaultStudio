import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Card = styled.div`
  width: 320px;
  max-width: calc(100vw - 32px);
  background: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.lg};
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  padding: ${tokens.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
`;

const Title = styled.div`
  font-size: ${tokens.fontSize.md};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.text};
`;

const Field = styled.input`
  width: 100%;
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  padding: ${tokens.spacing.sm};
  outline: none;

  &:focus {
    border-color: ${tokens.colors.gold};
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${tokens.spacing.sm};
`;

const Btn = styled.button<{ $primary?: boolean }>`
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  background: ${({ $primary }) => ($primary ? tokens.colors.gold : tokens.colors.panel)};
  color: ${({ $primary }) => ($primary ? '#000' : tokens.colors.text)};
  border: 1px solid ${({ $primary }) => ($primary ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

type Props = {
  title: string;
  initialValue: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
};

/**
 * Modal rename prompt. Used instead of inline list editing because the
 * context-menu → inline-input flow lost focus in the Electron renderer, so
 * users couldn't actually type a new name. The modal focuses + selects its
 * field on mount (via a timer, after the triggering mouse event settles).
 */
export function RenameDialog({ title, initialValue, onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    onClose();
  };

  return (
    <Overlay
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card onMouseDown={(e) => e.stopPropagation()}>
        <Title>{title}</Title>
        <Field
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onClose();
          }}
          aria-label={title}
        />
        <Actions>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn $primary onClick={submit} disabled={!value.trim()}>
            Rename
          </Btn>
        </Actions>
      </Card>
    </Overlay>
  );
}
