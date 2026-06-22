import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { Button } from '../../components/common/Button';
import { SavedContext } from './SettingsContext';
import { StreamSection } from './sections/StreamSection';
import { DestinationsSection } from './sections/DestinationsSection';
import { ConnectionsSection } from './sections/ConnectionsSection';
import { ReliabilitySection } from './sections/ReliabilitySection';
import { OverlaySection } from './sections/OverlaySection';
import { LicenseSection } from './sections/LicenseSection';

type IconProps = { size?: number };
const baseIcon = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function StreamIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-3v10l-6-3" />
    </svg>
  );
}

function DestinationsIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ChatIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-4-.9L3 20l1-3.8A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  );
}

function ShieldIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function OverlayIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <rect x="13" y="11" width="8" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
      <path d="M3 21h18" />
    </svg>
  );
}

function KeyIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...baseIcon} aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.5 12.5L20 3M16 7l2 2M13 10l2 2" />
    </svg>
  );
}

const SECTIONS = [
  { id: 'stream', label: 'Stream', desc: 'Output, recording & info', Icon: StreamIcon, Component: StreamSection },
  { id: 'destinations', label: 'Destinations', desc: 'Where you broadcast', Icon: DestinationsIcon, Component: DestinationsSection },
  { id: 'connections', label: 'Chat & Platforms', desc: 'Chat feed & dashboard', Icon: ChatIcon, Component: ConnectionsSection },
  { id: 'reliability', label: 'Reliability', desc: 'Stream Guard & IRL', Icon: ShieldIcon, Component: ReliabilitySection },
  { id: 'overlay', label: 'Overlay', desc: 'Movable chat overlay', Icon: OverlayIcon, Component: OverlaySection },
  { id: 'license', label: 'License', desc: 'Pro & changelog', Icon: KeyIcon, Component: LicenseSection },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const PageContainer = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.lg} ${tokens.spacing.xl};
  border-bottom: 1px solid ${tokens.colors.border};
  flex-shrink: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${tokens.spacing.md};
`;

const Title = styled.h1`
  font-size: ${tokens.fontSize.xl};
  color: ${tokens.colors.gold};
  font-weight: ${tokens.fontWeight.bold};
`;

const SavedNote = styled.span`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.kick};
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
`;

const Sidebar = styled.nav`
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid ${tokens.colors.border};
  padding: ${tokens.spacing.md} ${tokens.spacing.sm};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NavItem = styled.button<{ $active: boolean; $highlight?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
  width: 100%;
  text-align: left;
  background-color: ${({ $active, $highlight }) =>
    $active
      ? tokens.colors.panel2
      : $highlight
        ? 'rgba(214, 162, 58, 0.09)'
        : 'transparent'};
  border: 1px solid ${({ $active, $highlight }) =>
    $active || $highlight ? 'rgba(214, 162, 58, 0.28)' : 'transparent'};
  border-left: 3px solid ${({ $active, $highlight }) =>
    $active || $highlight ? tokens.colors.gold : 'transparent'};
  border-radius: ${tokens.borderRadius.sm};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  color: ${({ $active, $highlight }) => ($active || $highlight ? tokens.colors.text : tokens.colors.muted)};
  cursor: pointer;
  box-shadow: ${({ $highlight }) => ($highlight ? '0 0 18px rgb(214 162 58 / 0.08)' : 'none')};
  transition: background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;

  &:hover {
    background-color: ${({ $highlight }) => ($highlight ? 'rgba(214, 162, 58, 0.16)' : tokens.colors.panel)};
    border-color: ${({ $highlight }) => ($highlight ? 'rgba(214, 162, 58, 0.45)' : 'transparent')};
    color: ${tokens.colors.text};
  }

  svg {
    flex-shrink: 0;
    color: ${({ $active, $highlight }) => ($active || $highlight ? tokens.colors.gold : tokens.colors.muted)};
  }
`;

const NavText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const NavLabel = styled.span`
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
`;

const NavDesc = styled.span`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: ${tokens.spacing.xl};
`;

export function SettingsLayout() {
  const navigate = useNavigate();
  const params = useParams();
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, []);

  const requested = params.section as SectionId | undefined;
  const active = SECTIONS.find((s) => s.id === requested) ?? SECTIONS[0];
  const ActiveComponent = active.Component;

  return (
    <PageContainer>
      <Header>
        <TitleRow>
          <Title>Settings</Title>
          {saved && <SavedNote>saved ✓</SavedNote>}
        </TitleRow>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Studio
        </Button>
      </Header>
      <Body>
        <Sidebar aria-label="Settings categories">
          {SECTIONS.map(({ id, label, desc, Icon }) => (
            <NavItem
              key={id}
              $active={id === active.id}
              $highlight={id === 'license'}
              aria-current={id === active.id ? 'page' : undefined}
              onClick={() => navigate(`/settings/${id}`)}
            >
              <Icon />
              <NavText>
                <NavLabel>{label}</NavLabel>
                <NavDesc>{desc}</NavDesc>
              </NavText>
            </NavItem>
          ))}
        </Sidebar>
        <Content>
          <SavedContext.Provider value={flashSaved}>
            <ActiveComponent />
          </SavedContext.Provider>
        </Content>
      </Body>
    </PageContainer>
  );
}
