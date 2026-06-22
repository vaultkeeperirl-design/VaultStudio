import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../../theme/tokens';
import { Panel } from '../../../components/layout/Panel';
import { PlatformBadge } from '../../../components/common/PlatformBadge';
import { Button } from '../../../components/common/Button';
import { SectionStack, SectionIntro } from '../primitives';
import type { Platform, PlatformConnectionInfo, PlatformStatus } from '../../../types';

const Row = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${tokens.spacing.md};
  flex-wrap: wrap;
  padding: ${tokens.spacing.sm} 0;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 160px;
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

const StatusLine = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.sm};
  color: ${({ $connected }) => ($connected ? tokens.colors.kick : tokens.colors.muted)};
  padding-bottom: ${tokens.spacing.sm};
`;

const Hint = styled.p`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  line-height: 1.5;
`;

const LoginRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
  flex-wrap: wrap;
  padding: ${tokens.spacing.sm} 0 ${tokens.spacing.md};
`;

const PlatformLoginButton = styled.button<{ $bg: string; $fg?: string }>`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  background-color: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg ?? '#fff'};
  border: none;
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.bold};
  cursor: pointer;

  &:hover {
    filter: brightness(1.12);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const LoggedInBadge = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.kick};
  font-weight: ${tokens.fontWeight.medium};
`;

const Details = styled.details`
  margin-top: ${tokens.spacing.xs};

  summary {
    cursor: pointer;
    font-size: ${tokens.fontSize.xs};
    color: ${tokens.colors.muted};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
  }

  summary:hover {
    color: ${tokens.colors.gold};
  }

  & > *:not(summary) {
    margin-top: ${tokens.spacing.sm};
  }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

const ToggleLabel = styled.span<{ $enabled: boolean }>`
  font-size: ${tokens.fontSize.xs};
  color: ${({ $enabled }) => ($enabled ? tokens.colors.kick : tokens.colors.muted)};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Toggle = styled.button<{ $on: boolean }>`
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  cursor: pointer;
  background-color: ${({ $on }) => ($on ? tokens.colors.kick : tokens.colors.border)};
  transition: background-color 0.2s;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${({ $on }) => ($on ? '21px' : '3px')};
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.2s;
  }
`;

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

export function ConnectionsSection() {
  const [connections, setConnections] = useState<PlatformConnectionInfo[]>([]);
  const [statuses, setStatuses] = useState<PlatformStatus[]>([]);
  const [twitchChannel, setTwitchChannel] = useState('');
  const [twitchUsername, setTwitchUsername] = useState('');
  const [twitchToken, setTwitchToken] = useState('');
  const [kickChannel, setKickChannel] = useState('');
  const [ytChannelId, setYtChannelId] = useState('');
  const [ytApiKey, setYtApiKey] = useState('');
  const [ttChannel, setTtChannel] = useState('');
  const [busyPlatform, setBusyPlatform] = useState<Platform | null>(null);

  const refresh = async () => {
    if (!vaultApi) return;
    const { connections, statuses } = await vaultApi.platforms.getConnections();
    setConnections(connections);
    setStatuses(statuses);
    const twitch = connections.find((c) => c.platform === 'twitch');
    if (twitch) {
      setTwitchChannel(twitch.channel);
      setTwitchUsername(twitch.username || '');
    }
    const kick = connections.find((c) => c.platform === 'kick');
    if (kick) setKickChannel(kick.channel);
    const yt = connections.find((c) => c.platform === 'youtube');
    if (yt) {
      setYtChannelId(yt.channel);
    }
    const tt = connections.find((c) => c.platform === 'tiktok');
    if (tt) setTtChannel(tt.channel);
  };

  useEffect(() => {
    refresh();
    if (!vaultApi) return;
    const onStatus = (...args: unknown[]) => setStatuses(args[0] as PlatformStatus[]);
    vaultApi.on('platforms:status', onStatus);
    return () => vaultApi.off('platforms:status', onStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusFor = (platform: Platform) => statuses.find((s) => s.platform === platform);
  const connectedTo = (platform: Platform) => connections.some((c) => c.platform === platform);

  const connectTwitch = async () => {
    if (!vaultApi || !twitchChannel.trim()) return;
    await vaultApi.platforms.connect({
      platform: 'twitch',
      channel: twitchChannel.trim().toLowerCase(),
      username: twitchUsername.trim() || undefined,
      token: twitchToken.trim() || undefined,
      enabled: true,
    });
    setTwitchToken('');
    await refresh();
  };

  const oauthLogin = async (platform: Platform) => {
    if (!vaultApi || busyPlatform) return;
    setBusyPlatform(platform);
    try {
      const res = await vaultApi.platforms.oauthLogin(platform);
      if (res.ok) {
        if (res.statuses) setStatuses(res.statuses);
        await refresh();
      } else if (res.error) {
        alert(res.error);
      }
    } finally {
      setBusyPlatform(null);
    }
  };

  const oauthLogout = async (platform: Platform) => {
    if (!vaultApi) return;
    const res = await vaultApi.platforms.oauthLogout(platform);
    if (res.statuses) setStatuses(res.statuses);
    if (platform === 'twitch') setTwitchToken('');
    await refresh();
  };

  const connectKick = async () => {
    if (!vaultApi || !kickChannel.trim()) return;
    await vaultApi.platforms.connect({
      platform: 'kick',
      channel: kickChannel.trim().toLowerCase(),
      enabled: true,
    });
    await refresh();
  };

  const connectYouTube = async () => {
    if (!vaultApi || !ytChannelId.trim() || !ytApiKey.trim()) return;
    await vaultApi.platforms.connect({
      platform: 'youtube',
      channel: ytChannelId.trim(),
      username: undefined,
      token: ytApiKey.trim(),
      enabled: true,
    });
    await refresh();
  };

  const connectTikTok = async () => {
    if (!vaultApi || !ttChannel.trim()) return;
    await vaultApi.platforms.connect({
      platform: 'tiktok',
      channel: ttChannel.trim(),
      enabled: true,
    });
    await refresh();
  };

  const disconnect = async (platform: Platform) => {
    await vaultApi?.platforms.disconnect(platform);
    await refresh();
  };

  const toggleDashboard = async (platform: Platform) => {
    if (!vaultApi) return;
    const conn = connections.find((c) => c.platform === platform);
    if (!conn) return;
    const newState = !conn.dashboardEnabled;
    const result = await vaultApi.platforms.setDashboardEnabled(platform, newState);
    if (result.ok) {
      setConnections((prev) =>
        prev.map((c) => (c.platform === platform ? { ...c, dashboardEnabled: newState } : c))
      );
    } else if (result.error) {
      alert(result.error);
    }
  };

  const twitchStatus = statusFor('twitch');
  const kickStatus = statusFor('kick');
  const ytStatus = statusFor('youtube');
  const ttStatus = statusFor('tiktok');

  const isDashboardOn = (platform: Platform) => {
    const conn = connections.find((c) => c.platform === platform);
    if (!conn) return false;
    return conn.dashboardEnabled !== false;
  };

  return (
    <SectionStack>
      <SectionIntro>
        Connect your channels to merge every chat into one feed and combine viewer counts across
        platforms. Free includes 3 dashboard platforms; Lifetime Pro unlocks unlimited dashboard
        platforms. Reading chat needs no login — just your channel name.
      </SectionIntro>

      <Panel title="Twitch">
        <StatusLine $connected={twitchStatus?.chatConnected ?? false}>
          <PlatformBadge platform="twitch" />
          {twitchStatus?.chatConnected
            ? `Chat connected to #${twitchStatus.channel}${twitchStatus.canSend ? ' (can send)' : ' (read-only)'}`
            : connectedTo('twitch')
              ? 'Connecting…'
              : 'Not connected'}
        </StatusLine>
        <ToggleRow>
          <ToggleLabel $enabled={isDashboardOn('twitch')}>
            {isDashboardOn('twitch') ? 'Dashboard: ON' : 'Dashboard: OFF'}
          </ToggleLabel>
          <Toggle
            $on={isDashboardOn('twitch')}
            onClick={() => connectedTo('twitch') && toggleDashboard('twitch')}
            style={{ opacity: connectedTo('twitch') ? 1 : 0.4, cursor: connectedTo('twitch') ? 'pointer' : 'not-allowed' }}
          />
        </ToggleRow>
        <LoginRow>
          <PlatformLoginButton
            $bg={tokens.colors.twitch}
            onClick={() => oauthLogin('twitch')}
            disabled={busyPlatform !== null}
          >
            {busyPlatform === 'twitch'
              ? 'Opening Twitch…'
              : twitchStatus?.canSend
                ? 'Re-authorize Twitch'
                : 'Log in with Twitch'}
          </PlatformLoginButton>
          {twitchStatus?.canSend && (
            <>
              <LoggedInBadge>
                ✓ Logged in{twitchUsername ? ` as ${twitchUsername}` : ''} — chat send + mod actions enabled
              </LoggedInBadge>
              <Button variant="secondary" onClick={() => oauthLogout('twitch')}>
                Log out
              </Button>
            </>
          )}
        </LoginRow>
        <Row>
          <Field>
            <Label>Channel name</Label>
            <Input value={twitchChannel} onChange={(e) => setTwitchChannel(e.target.value)} placeholder="yourchannel" />
          </Field>
        </Row>
        <Row>
          <Button variant="primary" onClick={connectTwitch}>
            {connectedTo('twitch') ? 'Reconnect' : 'Connect'}
          </Button>
          {connectedTo('twitch') && (
            <Button variant="danger" onClick={() => disconnect('twitch')}>
              Disconnect
            </Button>
          )}
        </Row>
        <Hint>
          <strong>Log in with Twitch</strong> opens Twitch's own login page once and grants chat send,
          the right-click mod actions (delete / timeout / ban) and real follower names — no tokens to
          copy. Your token is stored encrypted on this machine and never leaves it. Just want to read
          this channel's chat? Set the channel name and Connect — no login needed.
        </Hint>
        <Details>
          <summary>Advanced: paste a token manually</summary>
          <Row>
            <Field>
              <Label>Your username (optional, to send chat)</Label>
              <Input value={twitchUsername} onChange={(e) => setTwitchUsername(e.target.value)} placeholder="yourusername" />
            </Field>
            <Field>
              <Label>OAuth token (optional, to send chat)</Label>
              <Input
                type="password"
                value={twitchToken}
                onChange={(e) => setTwitchToken(e.target.value)}
                placeholder="oauth:..."
              />
            </Field>
          </Row>
          <Hint>
            Generate a token at twitchtokengenerator.com with chat:read + chat:edit (send) and
            moderator:manage:banned_users + moderator:manage:chat_messages + moderator:read:followers
            (mod actions + follower names), then Reconnect.
          </Hint>
        </Details>
      </Panel>

      <Panel title="Kick">
        <StatusLine $connected={kickStatus?.chatConnected ?? false}>
          <PlatformBadge platform="kick" />
          {kickStatus?.chatConnected
            ? `Chat connected to ${kickStatus.channel} (read-only)`
            : connectedTo('kick')
              ? 'Connecting…'
              : 'Not connected'}
        </StatusLine>
        <ToggleRow>
          <ToggleLabel $enabled={isDashboardOn('kick')}>
            {isDashboardOn('kick') ? 'Dashboard: ON' : 'Dashboard: OFF'}
          </ToggleLabel>
          <Toggle
            $on={isDashboardOn('kick')}
            onClick={() => connectedTo('kick') && toggleDashboard('kick')}
            style={{ opacity: connectedTo('kick') ? 1 : 0.4, cursor: connectedTo('kick') ? 'pointer' : 'not-allowed' }}
          />
        </ToggleRow>
        <LoginRow>
          <PlatformLoginButton
            $bg={tokens.colors.kick}
            $fg="#04140a"
            onClick={() => oauthLogin('kick')}
            disabled={busyPlatform !== null}
          >
            {busyPlatform === 'kick'
              ? 'Opening Kick…'
              : kickStatus?.canSend
                ? 'Re-authorize Kick'
                : 'Log in with Kick'}
          </PlatformLoginButton>
          {kickStatus?.canSend && (
            <>
              <LoggedInBadge>✓ Logged in — chat send + ban/timeout enabled</LoggedInBadge>
              <Button variant="secondary" onClick={() => oauthLogout('kick')}>
                Log out
              </Button>
            </>
          )}
        </LoginRow>
        <Row>
          <Field>
            <Label>Channel name</Label>
            <Input value={kickChannel} onChange={(e) => setKickChannel(e.target.value)} placeholder="yourchannel" />
          </Field>
        </Row>
        <Row>
          <Button variant="primary" onClick={connectKick}>
            {connectedTo('kick') ? 'Reconnect' : 'Connect'}
          </Button>
          {connectedTo('kick') && (
            <Button variant="danger" onClick={() => disconnect('kick')}>
              Disconnect
            </Button>
          )}
        </Row>
        <Hint>
          <strong>Log in with Kick</strong> enables sending chat and ban/timeout from the right-click
          menu. Reading chat needs no login — just the channel name. (Kick has no single-message
          delete API yet; use “Remove from feed” to hide one locally.)
        </Hint>
      </Panel>

      <Panel title="YouTube">
        <StatusLine $connected={ytStatus?.chatConnected ?? false}>
          <PlatformBadge platform="youtube" />
          {ytStatus?.chatConnected
            ? `Chat connected to ${ytStatus!.channel} (read-only)`
            : connectedTo('youtube')
              ? 'Connecting…'
              : 'Not connected'}
        </StatusLine>
        <ToggleRow>
          <ToggleLabel $enabled={isDashboardOn('youtube')}>
            {isDashboardOn('youtube') ? 'Dashboard: ON' : 'Dashboard: OFF'}
          </ToggleLabel>
          <Toggle
            $on={isDashboardOn('youtube')}
            onClick={() => connectedTo('youtube') && toggleDashboard('youtube')}
            style={{ opacity: connectedTo('youtube') ? 1 : 0.4, cursor: connectedTo('youtube') ? 'pointer' : 'not-allowed' }}
          />
        </ToggleRow>
        <LoginRow>
          <PlatformLoginButton $bg="#FF0000" onClick={() => oauthLogin('youtube')} disabled={busyPlatform !== null}>
            {busyPlatform === 'youtube'
              ? 'Opening Google…'
              : ytStatus?.canSend
                ? 'Re-authorize YouTube'
                : 'Log in with YouTube'}
          </PlatformLoginButton>
          {ytStatus?.canSend && (
            <>
              <LoggedInBadge>✓ Logged in — read + send + delete/ban your live chat</LoggedInBadge>
              <Button variant="secondary" onClick={() => oauthLogout('youtube')}>
                Log out
              </Button>
            </>
          )}
        </LoginRow>
        <Hint>
          <strong>Log in with YouTube</strong> reads your live chat and unlocks send + delete + ban /
          timeout — no API key or channel ID needed. It opens Google sign-in in your browser.
        </Hint>
        <Details>
          <summary>Advanced: read-only via API key</summary>
          <Row>
            <Field>
              <Label>Channel ID</Label>
              <Input value={ytChannelId} onChange={(e) => setYtChannelId(e.target.value)} placeholder="UC..." />
            </Field>
            <Field>
              <Label>API Key</Label>
              <Input type="password" value={ytApiKey} onChange={(e) => setYtApiKey(e.target.value)} placeholder="AIza..." />
            </Field>
          </Row>
          <Row>
            <Button variant="primary" onClick={connectYouTube}>
              {connectedTo('youtube') ? 'Reconnect' : 'Connect'}
            </Button>
            {connectedTo('youtube') && (
              <Button variant="danger" onClick={() => disconnect('youtube')}>
                Disconnect
              </Button>
            )}
          </Row>
          <Hint>Read-only chat via a Google Cloud API key (YouTube Data API v3). Requires a channel ID (starts with UC...).</Hint>
        </Details>
      </Panel>

      <Panel title="TikTok">
        <StatusLine $connected={ttStatus?.chatConnected ?? false}>
          <PlatformBadge platform="tiktok" />
          {connectedTo('tiktok')
            ? `Stats polling for ${ttStatus?.channel ?? ttChannel} (viewer count only)`
            : 'Not connected'}
        </StatusLine>
        <ToggleRow>
          <ToggleLabel $enabled={isDashboardOn('tiktok')}>
            {isDashboardOn('tiktok') ? 'Dashboard: ON' : 'Dashboard: OFF'}
          </ToggleLabel>
          <Toggle
            $on={isDashboardOn('tiktok')}
            onClick={() => connectedTo('tiktok') && toggleDashboard('tiktok')}
            style={{ opacity: connectedTo('tiktok') ? 1 : 0.4, cursor: connectedTo('tiktok') ? 'pointer' : 'not-allowed' }}
          />
        </ToggleRow>
        <Row>
          <Field>
            <Label>Channel username</Label>
            <Input value={ttChannel} onChange={(e) => setTtChannel(e.target.value)} placeholder="username" />
          </Field>
        </Row>
        <Row>
          <Button variant="primary" onClick={connectTikTok}>
            {connectedTo('tiktok') ? 'Reconnect' : 'Connect'}
          </Button>
          {connectedTo('tiktok') && (
            <Button variant="danger" onClick={() => disconnect('tiktok')}>
              Disconnect
            </Button>
          )}
        </Row>
        <Hint>
          TikTok stats are read from the public live page. Chat is not yet available — TikTok has no
          public chat API. Viewer counts update every 30 seconds.
        </Hint>
      </Panel>
    </SectionStack>
  );
}
