import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { TwitchIcon, KickIcon, YouTubeIcon, TikTokIcon } from './icons';
import type { Platform } from '../../types';

const COLORS: Record<Platform, { bg: string; fg: string; label: string }> = {
  twitch: { bg: tokens.colors.twitch, fg: '#FFFFFF', label: 'Twitch' },
  kick: { bg: tokens.colors.kick, fg: '#000000', label: 'Kick' },
  youtube: { bg: '#FF0000', fg: '#FFFFFF', label: 'YouTube' },
  tiktok: { bg: '#FE2C55', fg: '#FFFFFF', label: 'TikTok' },
};

const Badge = styled.span<{ $bg: string; $fg: string; $iconOnly: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: ${({ $iconOnly }) => ($iconOnly ? '2px' : '2px 6px')};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background-color: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  flex-shrink: 0;
  line-height: 1;
`;

type Props = {
  platform: Platform;
  iconOnly?: boolean;
};

export function PlatformBadge({ platform, iconOnly = false }: Props) {
  const c = COLORS[platform] ?? COLORS.twitch;
  const icon =
    platform === 'twitch' ? (
      <TwitchIcon size={iconOnly ? 12 : 11} color={c.fg} />
    ) : platform === 'kick' ? (
      <KickIcon size={iconOnly ? 12 : 11} color={c.fg} />
    ) : platform === 'youtube' ? (
      <YouTubeIcon size={iconOnly ? 12 : 11} color={c.fg} />
    ) : (
      <TikTokIcon size={iconOnly ? 12 : 11} color={c.fg} />
    );
  return (
    <Badge $bg={c.bg} $fg={c.fg} $iconOnly={iconOnly} title={c.label}>
      {icon}
      {!iconOnly && c.label}
    </Badge>
  );
}
