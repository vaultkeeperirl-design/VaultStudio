import { useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../../theme/tokens';
import { Panel } from '../../../components/layout/Panel';
import { Button } from '../../../components/common/Button';
import { ProKeyPanel } from '../../../components/ProKeyPanel';
import { ChangelogModal } from '../../../components/ChangelogModal';
import { CHANGELOG_ENTRIES } from '../../../data/changelog';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import logoUrl from '../../../assets/logo.png';
import { SectionStack, SectionIntro, SettingRow, SettingLabel, Hint } from '../primitives';

const UpdateStatus = styled.span<{ $tone?: 'ok' | 'gold' | 'muted' }>`
  font-size: ${tokens.fontSize.sm};
  color: ${({ $tone }) =>
    $tone === 'gold'
      ? tokens.colors.gold
      : $tone === 'ok'
        ? tokens.colors.kick
        : tokens.colors.muted};
`;

function UpdatePanel() {
  const { state, check, openDownload } = useAppUpdate();
  const current = state.currentVersion ?? CHANGELOG_ENTRIES[0].version;

  return (
    <Panel title="App Updates">
      <SettingRow>
        <SettingLabel>Installed: VaultStudio {current}</SettingLabel>
        <Button variant="secondary" onClick={() => void check()} disabled={state.phase === 'checking'}>
          {state.phase === 'checking' ? 'Checking…' : 'Check for Updates'}
        </Button>
      </SettingRow>

      {state.phase === 'available' && (
        <SettingRow>
          <UpdateStatus $tone="gold">VaultStudio {state.latestVersion} is available.</UpdateStatus>
          <Button onClick={() => void openDownload()}>Download Update</Button>
        </SettingRow>
      )}
      {state.phase === 'current' && (
        <SettingRow>
          <UpdateStatus $tone="ok">You're on the latest version.</UpdateStatus>
        </SettingRow>
      )}
      {state.phase === 'error' && (
        <SettingRow>
          <UpdateStatus $tone="muted">Couldn't check for updates: {state.error}</UpdateStatus>
        </SettingRow>
      )}

      <Hint>VaultStudio checks for a newer build on launch and links the installer when one is ready.</Hint>
    </Panel>
  );
}

const GoldPanelWrapper = styled.div`
  background-color: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.lg};
  overflow: hidden;
`;

const GoldPanelHeader = styled.div`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${tokens.colors.panel2};
  border-bottom: 1px solid ${tokens.colors.gold};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  color: ${tokens.colors.gold};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ReleaseLabel = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  min-width: 0;
`;

const ReleaseLogo = styled.img`
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  object-fit: contain;
`;

export function LicenseSection() {
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <SectionStack>
      <SectionIntro>
        Manage your VaultStudio license and review the release notes for each update.
      </SectionIntro>

      <GoldPanelWrapper>
        <GoldPanelHeader>Pro License</GoldPanelHeader>
        <ProKeyPanel />
      </GoldPanelWrapper>

      <UpdatePanel />

      <Panel title="Changelog">
        <SettingRow>
          <ReleaseLabel>
            <ReleaseLogo src={logoUrl} alt="" />
            <SettingLabel>Latest: VaultStudio {CHANGELOG_ENTRIES[0].version}</SettingLabel>
          </ReleaseLabel>
          <Button variant="secondary" onClick={() => setShowChangelog(true)}>
            View Changelog
          </Button>
        </SettingRow>
        <Hint>Review current release notes and reconstructed notes from older updates.</Hint>
      </Panel>

      <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />
    </SectionStack>
  );
}
