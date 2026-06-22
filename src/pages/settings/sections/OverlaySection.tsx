import { useEffect, useState } from 'react';
import { tokens } from '../../../theme/tokens';
import { Panel } from '../../../components/layout/Panel';
import { Button } from '../../../components/common/Button';
import { useFlashSaved } from '../SettingsContext';
import { SectionStack, SectionIntro, SettingRow, SettingLabel, Hint } from '../primitives';
import type { AppSettings, ChatPopoutConfig } from '../../../types';

const DEFAULT_CHAT_POPOUT: ChatPopoutConfig = { enabled: true, opacity: 0.88, solidBackground: false };

function getVaultApi() {
  return typeof window !== 'undefined' ? window.vaultstudio : undefined;
}

export function OverlaySection() {
  const vaultApi = getVaultApi();
  const flashSaved = useFlashSaved();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!vaultApi) return;
    vaultApi.settings.get().then((s) => setSettings(s as AppSettings));
  }, []);

  const saveChatPopout = async (patch: Partial<ChatPopoutConfig>) => {
    if (!vaultApi || !settings) return;
    const current = settings.chatPopout ?? DEFAULT_CHAT_POPOUT;
    const optimistic = { ...current, ...patch };
    setSettings({ ...settings, chatPopout: optimistic });
    const savedConfig = await vaultApi.chatPopout.update(optimistic);
    setSettings((prev) => (prev ? { ...prev, chatPopout: savedConfig } : prev));
    flashSaved();
  };

  if (!settings) return null;

  const chatPopout = settings.chatPopout ?? DEFAULT_CHAT_POPOUT;

  return (
    <SectionStack>
      <SectionIntro>
        A movable, always-on-top chat overlay you can keep above your game while you play.
      </SectionIntro>

      <Panel title="Chat Overlay">
        <SettingRow>
          <SettingLabel>Show pop-out chat when VaultStudio is minimized</SettingLabel>
          <input
            type="checkbox"
            checked={chatPopout.enabled}
            onChange={(e) => saveChatPopout({ enabled: e.target.checked })}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Overlay transparency</SettingLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm }}>
            <input
              aria-label="Chat overlay opacity"
              type="range"
              min="0.35"
              max="1"
              step="0.01"
              value={chatPopout.opacity}
              onChange={(e) => saveChatPopout({ opacity: Number(e.target.value) })}
              style={{ accentColor: tokens.colors.gold, width: 180 }}
            />
            <SettingLabel>{Math.round(chatPopout.opacity * 100)}%</SettingLabel>
          </div>
        </SettingRow>
        <SettingRow>
          <SettingLabel>Use solid chat overlay background</SettingLabel>
          <input
            type="checkbox"
            checked={chatPopout.solidBackground}
            onChange={(e) => saveChatPopout({ solidBackground: e.target.checked })}
          />
        </SettingRow>
        <SettingRow>
          <SettingLabel>Open the movable always-on-top chat overlay now</SettingLabel>
          <Button variant="secondary" onClick={() => vaultApi?.chatPopout.show()}>
            Show Chat Overlay
          </Button>
        </SettingRow>
        <Hint>
          The overlay stays above games and other windows, uses the same connected chat sources, and
          can be dragged by its header. Lower the opacity when you want chat visible without covering
          gameplay.
        </Hint>
      </Panel>
    </SectionStack>
  );
}
