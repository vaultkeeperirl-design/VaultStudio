import { useEffect, useState } from 'react';
import { Panel } from '../../../components/layout/Panel';
import { Button } from '../../../components/common/Button';
import { useFlashSaved } from '../SettingsContext';
import { SectionStack, SectionIntro, SettingRow, SettingLabel, Input, Select, Hint } from '../primitives';
import type { GuardConfig, IrlConfig, IrlStatus, Scene } from '../../../types';

function getVaultApi() {
  return typeof window !== 'undefined' ? window.vaultstudio : undefined;
}

export function ReliabilitySection() {
  const vaultApi = getVaultApi();
  const flashSaved = useFlashSaved();
  const [guard, setGuard] = useState<GuardConfig | null>(null);
  const [irl, setIrl] = useState<IrlConfig | null>(null);
  const [irlStatus, setIrlStatus] = useState<IrlStatus | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);

  useEffect(() => {
    if (!vaultApi) return;
    vaultApi.guard.get().then(({ config }) => setGuard(config));
    vaultApi.irl.get().then(({ config, status }) => {
      setIrl(config);
      setIrlStatus(status);
    });
    vaultApi.obs.getScenes().then(setScenes);

    const onIrlStatus = (...args: unknown[]) => setIrlStatus(args[0] as IrlStatus);
    vaultApi.on('irl:status', onIrlStatus);
    return () => vaultApi.off('irl:status', onIrlStatus);
  }, []);

  const saveGuard = async (patch: Partial<GuardConfig>) => {
    if (!vaultApi || !guard) return;
    setGuard({ ...guard, ...patch });
    await vaultApi.guard.update(patch);
    flashSaved();
  };

  const saveIrl = async (patch: Partial<IrlConfig>) => {
    if (!vaultApi || !irl) return;
    setIrl({ ...irl, ...patch });
    const { config, status } = await vaultApi.irl.update(patch);
    setIrl(config);
    setIrlStatus(status);
    flashSaved();
  };

  const setupIrlScenes = async () => {
    if (!vaultApi) return;
    try {
      const { config, status, scenes: nextScenes } = await vaultApi.irl.setupScenes();
      setIrl(config);
      setIrlStatus(status);
      setScenes(nextScenes);
      flashSaved();
    } catch {
      // Engine not ready yet — scenes are created once the studio connects.
    }
  };

  return (
    <SectionStack>
      <SectionIntro>
        Keep your stream alive through dropped connections and weak signal, and stream straight from
        your phone over RTMP.
      </SectionIntro>

      <Panel title="Stream Guard — Disconnection Protection">
        <SettingRow>
          <SettingLabel>Enable Stream Guard</SettingLabel>
          <input
            type="checkbox"
            checked={guard?.enabled ?? false}
            onChange={(e) => saveGuard({ enabled: e.target.checked })}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Auto-reconnect dropped streams</SettingLabel>
          <input
            type="checkbox"
            checked={guard?.autoReconnect ?? false}
            onChange={(e) => saveGuard({ autoReconnect: e.target.checked })}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Reconnect delay (seconds)</SettingLabel>
          <Input
            type="number"
            defaultValue={guard?.reconnectDelaySec ?? 5}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) saveGuard({ reconnectDelaySec: v });
            }}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Max reconnect attempts</SettingLabel>
          <Input
            type="number"
            defaultValue={guard?.maxRetries ?? 20}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) saveGuard({ maxRetries: v });
            }}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>BRB scene (on weak connection)</SettingLabel>
          <Select value={guard?.brbSceneName ?? ''} onChange={(e) => saveGuard({ brbSceneName: e.target.value })}>
            <option value="">— disabled —</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow>
          <SettingLabel>Low bitrate threshold (kbps)</SettingLabel>
          <Input
            type="number"
            defaultValue={guard?.lowBitrateKbps ?? 500}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) saveGuard({ lowBitrateKbps: v });
            }}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Auto switch back when recovered</SettingLabel>
          <input
            type="checkbox"
            checked={guard?.autoSwitchBack ?? false}
            onChange={(e) => saveGuard({ autoSwitchBack: e.target.checked })}
          />
        </SettingRow>
        <Hint>
          If your connection dies mid-stream, VaultStudio automatically reconnects. If your bitrate
          collapses below the threshold, it switches to your BRB scene so viewers never see a frozen
          frame — and switches back when the connection recovers.
        </Hint>
      </Panel>

      <Panel title="IRL Mode — Phone Ingest Server">
        <SettingRow>
          <SettingLabel>Enable IRL ingest server</SettingLabel>
          <input
            type="checkbox"
            checked={irl?.enabled ?? false}
            onChange={(e) => saveIrl({ enabled: e.target.checked })}
          />
        </SettingRow>
        {irl?.enabled && (
          <>
            <SettingRow>
              <SettingLabel>Server status</SettingLabel>
              <SettingLabel>
                {irlStatus?.publishing
                  ? `LIVE — ${irlStatus.bitrateKbps} kbps incoming`
                  : irlStatus?.running
                    ? 'Waiting for phone feed'
                    : 'Stopped'}
                {irlStatus?.state === 'brb' ? ' (BRB)' : ''}
              </SettingLabel>
            </SettingRow>
            <SettingRow>
              <SettingLabel>Phone ingest URL</SettingLabel>
              <Input
                readOnly
                value={irlStatus?.ingestUrl ?? ''}
                onFocus={(e) => e.target.select()}
                style={{ width: 300, fontFamily: 'monospace' }}
              />
            </SettingRow>
            <SettingRow>
              <SettingLabel>RTMP port</SettingLabel>
              <Input
                type="number"
                defaultValue={irl.port}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0 && v < 65536 && v !== irl.port) saveIrl({ port: v });
                }}
              />
            </SettingRow>
            <SettingRow>
              <SettingLabel>Default scenes</SettingLabel>
              <Button variant="secondary" onClick={setupIrlScenes}>
                Set up IRL scenes
              </Button>
            </SettingRow>
            <SettingRow>
              <SettingLabel>Be Right Back scene (feed lost)</SettingLabel>
              <Select value={irl.brbSceneName} onChange={(e) => saveIrl({ brbSceneName: e.target.value })}>
                <option value="">— disabled —</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </SettingRow>
            <SettingRow>
              <SettingLabel>Low Bitrate scene (feed weak)</SettingLabel>
              <Select
                value={irl.lowBitrateSceneName}
                onChange={(e) => saveIrl({ lowBitrateSceneName: e.target.value })}
              >
                <option value="">— same as Be Right Back —</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </SettingRow>
            <SettingRow>
              <SettingLabel>Low bitrate threshold (kbps)</SettingLabel>
              <Input
                type="number"
                defaultValue={irl.lowBitrateKbps}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0) saveIrl({ lowBitrateKbps: v });
                }}
              />
            </SettingRow>
            <SettingRow>
              <SettingLabel>Auto switch back when feed recovers</SettingLabel>
              <input
                type="checkbox"
                checked={irl.autoSwitchBack}
                onChange={(e) => saveIrl({ autoSwitchBack: e.target.checked })}
              />
            </SettingRow>
          </>
        )}
        <Hint>
          Stream from your phone (Moblin, IRL Pro, Larix — any RTMP app) straight into VaultStudio.
          Point the phone at the ingest URL above, then add a Media source in your live scene with
          that same URL so the feed appears on stream. Use “Set up IRL scenes” to create ready-made
          Starting Soon, Be Right Back and Low Bitrate screens (this runs automatically the first
          time you enable IRL). If the feed weakens VaultStudio switches to the Low Bitrate scene; if
          it drops entirely it switches to Be Right Back, then back automatically when the feed
          recovers. Leave this off if you only stream from your PC.
        </Hint>
      </Panel>
    </SectionStack>
  );
}
