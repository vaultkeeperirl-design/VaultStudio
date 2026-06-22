import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

/** Shared layout + form primitives for Settings sections. */

/** Vertical stack of panels within a section's content area. */
export const SectionStack = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.lg};

  & > * {
    flex: 0 0 auto;
  }
`;

/** Intro/description blurb shown at the top of a section. */
export const SectionIntro = styled.p`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  line-height: 1.5;
  max-width: none;
  margin: 0;
`;

export const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.spacing.md};
  padding: ${tokens.spacing.sm} 0;
  border-bottom: 1px solid ${tokens.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

export const SettingLabel = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.muted};
`;

export const Input = styled.input`
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.border};
  color: ${tokens.colors.text};
  padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
  border-radius: 4px;
  font-size: ${tokens.fontSize.sm};
  width: 200px;
  outline: none;

  &:focus {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.5;
  }
`;

export const Select = styled.select`
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.border};
  color: ${tokens.colors.text};
  padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
  border-radius: 4px;
  font-size: ${tokens.fontSize.sm};
  width: 214px;
  outline: none;
`;

export const Hint = styled.p`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  line-height: 1.5;
  padding-top: ${tokens.spacing.sm};
`;
