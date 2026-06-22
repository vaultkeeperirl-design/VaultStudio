import { useEffect, useState } from 'react';
import { Panel } from '../../../components/layout/Panel';
import { useFlashSaved } from '../SettingsContext';
import { SectionStack, SectionIntro, SettingRow, SettingLabel, Input, Select, Hint } from '../primitives';
import type { AppSettings } from '../../../types';

function getVaultApi() {
  return typeof window !== 'undefined' ? window.vaultstudio : undefined;
}

export function StreamSection() {
  const vaultApi = getVaultApi();
  const flashSaved = useFlashSaved();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [availableEncoders, setAvailableEncoders] = useState<string[]>([]);
  const [activeEncoder, setActiveEncoder] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultApi) return;
    vaultApi.settings.get().then((s) => setSettings(s as AppSettings));
    vaultApi.obs.getAvailableEncoders().then(setAvailableEncoders);
    vaultApi.obs.getActiveEncoder().then(setActiveEncoder);
  }, []);

  const saveSettings = async (patch: Partial<AppSettings>) => {
    if (!vaultApi || !settings) return;
    setSettings({ ...settings, ...patch });
    await vaultApi.settings.update(patch);
    flashSaved();
  };

  if (!settings) return null;

  return (
    <SectionStack>
      <SectionIntro>
        Configure how VaultStudio encodes and records your broadcast. These apply to every stream
        target at once.
      </SectionIntro>

      <Panel title="Output">
        <SettingRow>
          <SettingLabel>Resolution</SettingLabel>
          <Input
            defaultValue={settings.outputResolution}
            onBlur={(e) => {
              if (/^\d+x\d+$/.test(e.target.value)) saveSettings({ outputResolution: e.target.value });
            }}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Video Bitrate (kbps)</SettingLabel>
          <Input
            type="number"
            defaultValue={settings.videoBitrate}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) saveSettings({ videoBitrate: v });
            }}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>FPS</SettingLabel>
          <Select value={settings.fps} onChange={(e) => saveSettings({ fps: parseInt(e.target.value, 10) })}>
            {[24, 30, 48, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow>
          <SettingLabel>Encoder</SettingLabel>
          <Select value={settings.encoder} onChange={(e) => saveSettings({ encoder: e.target.value })}>
            <option value="auto">Auto (GPU preferred)</option>
            <option value="nvenc">NVENC (NVIDIA)</option>
            <option value="x264">x264 (CPU)</option>
          </Select>
        </SettingRow>
        {activeEncoder && (
          <SettingRow>
            <SettingLabel>Active Encoder</SettingLabel>
            <SettingLabel>{activeEncoder}</SettingLabel>
          </SettingRow>
        )}
        {availableEncoders.length > 0 && (
          <Hint>
            Available GPU encoders:{' '}
            {availableEncoders.filter((e) => e !== 'obs_x264').join(', ') || 'None detected — using CPU (x264)'}
          </Hint>
        )}
        <SettingRow>
          <SettingLabel>Audio Bitrate (kbps)</SettingLabel>
          <Input
            type="number"
            defaultValue={settings.audioBitrate}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) saveSettings({ audioBitrate: v });
            }}
          />
        </SettingRow>
        <Hint>
          Resolution and FPS apply live when nothing is streaming or recording; otherwise they take
          effect on the next session.
        </Hint>
      </Panel>

      <Panel title="Recording">
        <SettingRow>
          <SettingLabel>Recording Path</SettingLabel>
          <Input
            defaultValue={settings.recordingPath}
            onBlur={(e) => saveSettings({ recordingPath: e.target.value })}
          />
        </SettingRow>
      </Panel>

      <Panel title="Stream Info">
        <SettingRow>
          <SettingLabel>Stream Title</SettingLabel>
          <Input defaultValue={settings.streamTitle} onBlur={(e) => saveSettings({ streamTitle: e.target.value })} />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Category</SettingLabel>
          <Input
            defaultValue={settings.streamCategory}
            onBlur={(e) => saveSettings({ streamCategory: e.target.value })}
          />
        </SettingRow>
      </Panel>
    </SectionStack>
  );
}
