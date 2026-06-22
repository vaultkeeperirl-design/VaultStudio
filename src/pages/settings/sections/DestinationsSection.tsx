import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../../theme/tokens';
import { Panel } from '../../../components/layout/Panel';
import { Button } from '../../../components/common/Button';
import { SectionStack, SectionIntro } from '../primitives';
import type { LicenseInfo, StreamTarget, StreamTargetPlatform } from '../../../types';

const IntroRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${tokens.spacing.lg};
  flex-wrap: wrap;
`;

const TargetCard = styled.div<{ $enabled: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.lg};
  background-color: ${tokens.colors.panel};
  border: 1px solid ${({ $enabled }) => ($enabled ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.lg};
  opacity: ${({ $enabled }) => ($enabled ? 1 : 0.65)};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
  flex-wrap: wrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 180px;
`;

const Label = styled.label`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Input = styled.input`
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.border};
  color: ${tokens.colors.text};
  padding: ${tokens.spacing.sm};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.sm};
  outline: none;

  &:focus {
    border-color: ${tokens.colors.gold};
  }
`;

const Select = styled.select`
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.border};
  color: ${tokens.colors.text};
  padding: ${tokens.spacing.sm};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.sm};
  outline: none;
`;

const PlatformTag = styled.span<{ $platform: StreamTargetPlatform }>`
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: ${tokens.borderRadius.sm};
  color: #000;
  background-color: ${({ $platform }) =>
    $platform === 'twitch'
      ? tokens.colors.twitch
      : $platform === 'kick'
        ? tokens.colors.kick
        : $platform === 'youtube'
          ? '#FF0000'
          : tokens.colors.muted};
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.text};
  cursor: pointer;
`;

const Notice = styled.div<{ $kind: 'ok' | 'warn' }>`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  background-color: ${({ $kind }) => ($kind === 'ok' ? 'rgba(83, 252, 24, 0.1)' : 'rgba(214, 162, 58, 0.12)')};
  border: 1px solid ${({ $kind }) => ($kind === 'ok' ? 'rgba(83, 252, 24, 0.4)' : tokens.colors.darkGold)};
  color: ${tokens.colors.text};
`;

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

const EMPTY_DRAFT = {
  name: '',
  platform: 'twitch' as StreamTargetPlatform,
  server: '',
  streamKey: '',
  enabled: true,
};

export function DestinationsSection() {
  const [targets, setTargets] = useState<StreamTarget[]>([]);
  const [servers, setServers] = useState<Record<StreamTargetPlatform, string>>({
    twitch: '',
    kick: '',
    youtube: '',
    custom: '',
  });
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [revealKeys, setRevealKeys] = useState<Set<string>>(new Set());
  const [license, setLicense] = useState<LicenseInfo | null>(null);

  useEffect(() => {
    if (!vaultApi) return;
    vaultApi.targets.list().then(setTargets);
    vaultApi.targets.platformServers().then(setServers);
    vaultApi.license.getInfo().then(setLicense);
  }, []);

  const apply = async () => {
    if (!vaultApi) return;
    const result = await vaultApi.targets.apply();
    setNotice(
      result.ok
        ? { kind: 'ok', text: 'Targets synced to the streaming engine - they go live with your next stream.' }
        : { kind: 'warn', text: result.error || 'Could not sync targets.' }
    );
  };

  const addTarget = async () => {
    if (!vaultApi || !draft.name.trim() || !draft.server.trim() || !draft.streamKey.trim()) {
      setNotice({ kind: 'warn', text: 'Name, server, and stream key are all required.' });
      return;
    }
    const result = await vaultApi.targets.add({ ...draft, name: draft.name.trim() });
    if (result && 'error' in result) {
      setNotice({ kind: 'warn', text: result.error });
      return;
    }
    setTargets(await vaultApi.targets.list());
    setDraft({ ...EMPTY_DRAFT });
    setShowAdd(false);
    await apply();
  };

  const updateTarget = async (target: StreamTarget) => {
    if (!vaultApi) return;
    await vaultApi.targets.update(target);
    setTargets(await vaultApi.targets.list());
  };

  const removeTarget = async (id: string) => {
    if (!vaultApi) return;
    await vaultApi.targets.remove(id);
    setTargets(await vaultApi.targets.list());
    await apply();
  };

  const importFromObs = async () => {
    if (!vaultApi) return;
    setTargets(await vaultApi.targets.importFromObs());
    setNotice({
      kind: 'ok',
      text: 'Imported available targets from your existing streaming config. Free includes 3 stream targets; Lifetime Pro imports and streams unlimited targets.',
    });
  };

  const onDraftPlatform = (platform: StreamTargetPlatform) => {
    setDraft((d) => ({
      ...d,
      platform,
      server: servers[platform] || d.server,
      name: d.name || (platform === 'custom' ? '' : platform.charAt(0).toUpperCase() + platform.slice(1)),
    }));
  };

  const enabledCount = targets.filter((t) => t.enabled).length;
  const isPro = license?.valid === true && license.tier === 'pro';
  const targetLimit = license?.maxTargets ?? 3;
  const freeLimitReached = !isPro && targets.length >= targetLimit;

  return (
    <SectionStack>
      <IntroRow>
        <SectionIntro>
          {isPro
            ? 'Lifetime Pro is active: unlimited stream targets.'
            : `Free includes ${targetLimit} stream targets. Lifetime Pro unlocks unlimited stream targets.`}{' '}
          Every enabled target goes live simultaneously when you hit Go Live. Currently {enabledCount} of{' '}
          {targets.length} target{targets.length === 1 ? '' : 's'} enabled.
        </SectionIntro>
        <Button variant="secondary" onClick={importFromObs}>
          Import Legacy Targets
        </Button>
      </IntroRow>

      {notice && <Notice $kind={notice.kind}>{notice.text}</Notice>}
      {freeLimitReached && (
        <Notice $kind="warn">
          Free includes {targetLimit} stream targets. Remove a target or activate Lifetime Pro to add more.
        </Notice>
      )}

      {targets.map((target) => (
        <TargetCard key={target.id} $enabled={target.enabled}>
          <Row>
            <PlatformTag $platform={target.platform}>{target.platform}</PlatformTag>
            <strong style={{ flex: 1, color: tokens.colors.text }}>{target.name}</strong>
            <ToggleLabel>
              <input
                type="checkbox"
                checked={target.enabled}
                onChange={async (e) => {
                  await updateTarget({ ...target, enabled: e.target.checked });
                  await apply();
                }}
              />
              Enabled
            </ToggleLabel>
            <Button variant="danger" onClick={() => removeTarget(target.id)}>
              Remove
            </Button>
          </Row>
          <Row>
            <Field>
              <Label>Server (RTMP ingest)</Label>
              <Input
                value={target.server}
                onChange={(e) => setTargets(targets.map((t) => (t.id === target.id ? { ...t, server: e.target.value } : t)))}
                onBlur={async () => {
                  const t = targets.find((t) => t.id === target.id);
                  if (t) {
                    await updateTarget(t);
                    await apply();
                  }
                }}
              />
            </Field>
            <Field>
              <Label>
                Stream key{' '}
                <RevealToggle
                  revealed={revealKeys.has(target.id)}
                  onToggle={() =>
                    setRevealKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(target.id)) next.delete(target.id);
                      else next.add(target.id);
                      return next;
                    })
                  }
                />
              </Label>
              <Input
                type={revealKeys.has(target.id) ? 'text' : 'password'}
                value={target.streamKey}
                onChange={(e) =>
                  setTargets(targets.map((t) => (t.id === target.id ? { ...t, streamKey: e.target.value } : t)))
                }
                onBlur={async () => {
                  const t = targets.find((t) => t.id === target.id);
                  if (t) {
                    await updateTarget(t);
                    await apply();
                  }
                }}
              />
            </Field>
          </Row>
        </TargetCard>
      ))}

      {showAdd ? (
        <Panel title="New Target">
          <Row>
            <Field>
              <Label>Platform</Label>
              <Select value={draft.platform} onChange={(e) => onDraftPlatform(e.target.value as StreamTargetPlatform)}>
                <option value="twitch">Twitch</option>
                <option value="kick">Kick</option>
                <option value="youtube">YouTube</option>
                <option value="custom">Custom RTMP</option>
              </Select>
            </Field>
            <Field>
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Twitch Main"
              />
            </Field>
          </Row>
          <Row>
            <Field>
              <Label>Server (RTMP ingest)</Label>
              <Input
                value={draft.server}
                onChange={(e) => setDraft({ ...draft, server: e.target.value })}
                placeholder="rtmp://..."
              />
            </Field>
            <Field>
              <Label>Stream key</Label>
              <Input
                type="password"
                value={draft.streamKey}
                onChange={(e) => setDraft({ ...draft, streamKey: e.target.value })}
                placeholder="Paste your stream key"
              />
            </Field>
          </Row>
          <Row>
            <Button variant="primary" onClick={addTarget}>
              Add Target
            </Button>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </Row>
        </Panel>
      ) : (
        <Button
          variant="primary"
          onClick={() => {
            if (freeLimitReached) {
              setNotice({
                kind: 'warn',
                text: `Free includes ${targetLimit} stream targets. Remove a target to swap it for a different platform, or activate Lifetime Pro to add a 4th.`,
              });
              return;
            }
            setDraft({ ...EMPTY_DRAFT, server: servers.twitch || '' });
            setShowAdd(true);
          }}
        >
          + Add Stream Target
        </Button>
      )}
    </SectionStack>
  );
}

function RevealToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: 'none',
        border: 'none',
        color: tokens.colors.neonBlue,
        cursor: 'pointer',
        fontSize: tokens.fontSize.xs,
        padding: 0,
      }}
    >
      {revealed ? 'hide' : 'show'}
    </button>
  );
}
