import styled, { css } from 'styled-components';
import { tokens } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'live';

const variantStyles: Record<Variant, ReturnType<typeof css>> = {
  primary: css`
    background-color: ${tokens.colors.gold};
    color: #000;
    &:hover { background-color: ${tokens.colors.darkGold}; }
  `,
  secondary: css`
    background-color: ${tokens.colors.panel2};
    color: ${tokens.colors.text};
    border: 1px solid ${tokens.colors.border};
    &:hover { background-color: ${tokens.colors.border}; }
  `,
  danger: css`
    background-color: ${tokens.colors.danger};
    color: #fff;
    &:hover { opacity: 0.85; }
  `,
  live: css`
    background-color: ${tokens.colors.live};
    color: #fff;
    &:hover { opacity: 0.85; }
  `,
};

const StyledButton = styled.button<{ $variant: Variant }>`
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  border: none;
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;
  transition: all 0.15s ease;
  ${({ $variant }) => variantStyles[$variant]}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

type Props = {
  variant?: Variant;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export function Button({ variant = 'primary', children, onClick, disabled }: Props) {
  return (
    <StyledButton $variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </StyledButton>
  );
}
