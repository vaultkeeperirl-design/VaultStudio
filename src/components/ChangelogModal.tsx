import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import { Button } from './common/Button';
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '../data/changelog';
import logoUrl from '../assets/logo.png';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${tokens.spacing.xl};
  background: rgb(0 0 0 / 0.72);
`;

const Dialog = styled.div`
  width: min(620px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.lg};
  box-shadow: 0 18px 70px rgb(0 0 0 / 0.55);
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${tokens.spacing.lg};
  padding: ${tokens.spacing.lg} ${tokens.spacing.lg} ${tokens.spacing.md};
  border-bottom: 1px solid ${tokens.colors.border};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
  min-width: 0;
`;

const Logo = styled.img`
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  object-fit: contain;
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const Eyebrow = styled.span`
  color: ${tokens.colors.gold};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
`;

const Title = styled.h2`
  margin: 0;
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.xl};
`;

const Body = styled.div`
  overflow-y: auto;
  padding: ${tokens.spacing.lg};
`;

const EntryBlock = styled.section<{ $latest?: boolean }>`
  padding: ${({ $latest }) => ($latest ? `0 0 ${tokens.spacing.lg}` : `${tokens.spacing.lg} 0 0`)};
  border-top: ${({ $latest }) => ($latest ? 'none' : `1px solid ${tokens.colors.border}`)};
`;

const EntryHeading = styled.h3`
  margin: 0 0 ${tokens.spacing.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.md};
`;

const SectionTitle = styled.h4`
  margin: ${tokens.spacing.md} 0 ${tokens.spacing.xs};
  color: ${tokens.colors.gold};
  font-size: ${tokens.fontSize.xs};
  text-transform: uppercase;
`;

const Notes = styled.ul`
  margin: 0;
  padding-left: ${tokens.spacing.lg};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  line-height: 1.55;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.spacing.md};
  padding: ${tokens.spacing.md} ${tokens.spacing.lg} ${tokens.spacing.lg};
  border-top: 1px solid ${tokens.colors.border};
`;

const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
`;

type Props = {
  open: boolean;
  onClose: () => void;
  showDontShowAgain?: boolean;
  dontShowAgain?: boolean;
  onDontShowAgainChange?: (checked: boolean) => void;
};

function renderSection(title: string, items?: string[]) {
  if (!items?.length) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Notes>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Notes>
    </>
  );
}

function ChangelogEntryBlock({ entry, latest }: { entry: ChangelogEntry; latest?: boolean }) {
  return (
    <EntryBlock $latest={latest}>
      <EntryHeading>
        VaultStudio {entry.version} - {entry.date}
      </EntryHeading>
      {renderSection('Added', entry.added)}
      {renderSection('Fixed', entry.fixed)}
      {renderSection('Changed', entry.changed)}
    </EntryBlock>
  );
}

export function ChangelogModal({
  open,
  onClose,
  showDontShowAgain = false,
  dontShowAgain = false,
  onDontShowAgainChange,
}: Props) {
  if (!open) return null;

  const latest = CHANGELOG_ENTRIES[0];

  return (
    <Overlay>
      <Dialog role="dialog" aria-modal="true" aria-label="VaultStudio changelog">
        <Header>
          <HeaderLeft>
            <Logo src={logoUrl} alt="VaultStudio" />
            <TitleGroup>
              <Eyebrow>Release Notes</Eyebrow>
              <Title>What changed in VaultStudio {latest.version}</Title>
            </TitleGroup>
          </HeaderLeft>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </Header>
        <Body>
          {CHANGELOG_ENTRIES.map((entry, index) => (
            <ChangelogEntryBlock key={entry.version} entry={entry} latest={index === 0} />
          ))}
        </Body>
        <Footer>
          {showDontShowAgain ? (
            <CheckboxLabel>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => onDontShowAgainChange?.(e.target.checked)}
              />
              Don't show again for this version
            </CheckboxLabel>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Close Changelog</Button>
        </Footer>
      </Dialog>
    </Overlay>
  );
}
