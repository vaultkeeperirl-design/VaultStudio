import { useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import { Button } from './common/Button';
import { useAppUpdate } from '../hooks/useAppUpdate';
import logoUrl from '../assets/logo.png';

const Card = styled.div`
  position: fixed;
  right: ${tokens.spacing.xl};
  bottom: ${tokens.spacing.xl};
  z-index: 3500;
  width: 320px;
  max-width: calc(100vw - 48px);
  display: flex;
  gap: ${tokens.spacing.md};
  padding: ${tokens.spacing.md} ${tokens.spacing.lg};
  background: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.lg};
  box-shadow: 0 14px 50px rgb(0 0 0 / 0.5);
`;

const Logo = styled.img`
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
  min-width: 0;
`;

const Title = styled.div`
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.bold};
`;

const Sub = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
`;

const Actions = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
  margin-top: ${tokens.spacing.xs};
`;

const dismissKey = (version: string) => `vaultstudio:update-dismissed:${version}`;

function wasDismissed(version: string) {
  try {
    return window.localStorage.getItem(dismissKey(version)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Launch-time "update available" toast. Auto-checks once on mount and only
 * surfaces when a newer version exists and the user hasn't dismissed that
 * specific version. Renders nothing when the bridge is absent (web/test).
 */
export function UpdateToast() {
  const { state, openDownload } = useAppUpdate({ auto: true });
  const [hidden, setHidden] = useState(false);

  if (
    hidden ||
    state.phase !== 'available' ||
    !state.latestVersion ||
    wasDismissed(state.latestVersion)
  ) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey(state.latestVersion!), 'true');
    } catch {
      /* dismissal stays session-only if storage is unavailable */
    }
    setHidden(true);
  };

  return (
    <Card role="status" aria-live="polite">
      <Logo src={logoUrl} alt="" />
      <Body>
        <Title>Update available</Title>
        <Sub>
          VaultStudio {state.latestVersion} is ready (you have {state.currentVersion}).
        </Sub>
        <Actions>
          <Button onClick={() => void openDownload()}>Download</Button>
          <Button variant="secondary" onClick={dismiss}>
            Later
          </Button>
        </Actions>
      </Body>
    </Card>
  );
}
