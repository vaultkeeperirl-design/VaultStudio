import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

export const StudioGrid = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  grid-template-rows: 3fr 2fr;
  grid-template-areas:
    "session preview activity"
    "chat    bottom  bottom";
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.sm};
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: ${tokens.colors.bg};

  @media (max-width: 1440px) {
    grid-template-columns: 240px 1fr 240px;
  }

  @media (max-width: 1200px) {
    grid-template-columns: 220px 1fr 220px;
  }

  @media (max-width: 1080px) {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: minmax(220px, 2fr) minmax(180px, 1.5fr) minmax(200px, 1.5fr);
    grid-template-areas:
      "preview preview"
      "session activity"
      "chat    bottom";
    overflow-y: auto;
  }
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: ${tokens.spacing.xs} ${tokens.spacing.lg};
  background-color: ${tokens.colors.panel};
  border-bottom: 1px solid ${tokens.colors.border};
  flex-shrink: 0;
  gap: ${tokens.spacing.md};

  @media (max-width: 1120px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

export const Logo = styled.span`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.lg};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.gold};
`;

export const LogoIcon = styled.img`
  height: 28px;
  width: 28px;
  object-fit: contain;
`;

export const TopBarActions = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: 0;

  @media (max-width: 1120px) {
    justify-content: flex-start;
    width: 100%;
  }
`;

export const GridSession = styled.div`
  grid-area: session;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;
export const GridPreview = styled.div`
  grid-area: preview;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;
export const GridActivity = styled.div`
  grid-area: activity;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;
export const GridChat = styled.div`
  grid-area: chat;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;
export const GridBottom = styled.div`
  grid-area: bottom;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: ${tokens.spacing.sm};
  min-height: 0;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
`;
