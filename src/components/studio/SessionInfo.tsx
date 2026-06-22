import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import type { CombinedStats, OutputStats } from '../../types';

const InfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
`;

const TotalViewers = styled.div`
  text-align: center;
`;

const ViewerCount = styled.div`
  font-size: ${tokens.fontSize.xxl};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.gold};
`;

const ViewerLabel = styled.div`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const PlatformRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.xs} 0;
`;

const PlatformViewers = styled.span`
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.text};
`;

const ChannelLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  margin-left: ${tokens.spacing.sm};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LiveDot = styled.span<{ $live: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${({ $live }) => ($live ? tokens.colors.live : tokens.colors.border)};
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${tokens.fontSize.sm};
  padding: ${tokens.spacing.xs} 0;
`;

const StatLabel = styled.span`
  color: ${tokens.colors.muted};
`;

const StatValue = styled.span<{ $warn?: boolean }>`
  color: ${({ $warn }) => ($warn ? tokens.colors.danger : tokens.colors.text)};
  font-weight: ${tokens.fontWeight.medium};
  font-variant-numeric: tabular-nums;
`;

const StatusBadge = styled.div<{ $streaming: boolean }>`
  text-align: center;
  padding: ${tokens.spacing.xs};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
  background-color: ${({ $streaming }) => ($streaming ? tokens.colors.live : tokens.colors.panel2)};
  color: ${({ $streaming }) => ($streaming ? '#fff' : tokens.colors.muted)};
`;

const SectionDivider = styled.div`
  border-top: 1px solid ${tokens.colors.border};
  margin: ${tokens.spacing.xs} 0;
`;

const TargetRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.sm};
  padding: 2px 0;
`;

const TargetDot = styled.span<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${({ $connected }) => ($connected ? tokens.colors.kick : tokens.colors.border)};
`;

const TargetName = styled.span`
  flex: 1;
  color: ${tokens.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Props = {
  stats: CombinedStats;
  outputStats: OutputStats | null;
};

export function SessionInfo({ stats, outputStats }: Props) {
  const isStreaming = outputStats?.isStreaming ?? false;
  const duration = outputStats?.streamDuration ?? 0;
  const totalFollowers = stats.platforms.reduce((sum, p) => sum + (p.followers ?? 0), 0);
  const dropped = outputStats?.droppedFrames ?? 0;
  const total = outputStats?.totalFrames ?? 0;
  const dropPct = total > 0 ? (dropped / total) * 100 : 0;

  return (
    <InfoContainer>
      <StatusBadge $streaming={isStreaming}>
        {isStreaming ? 'Live' : 'Offline'}
      </StatusBadge>

      <TotalViewers>
        <ViewerCount>{stats.totalViewers.toLocaleString()}</ViewerCount>
        <ViewerLabel>Combined Viewers</ViewerLabel>
      </TotalViewers>

      {stats.platforms.map((p) => (
        <PlatformRow key={`${p.platform}-${p.channel ?? ''}`}>
          <PlatformBadge platform={p.platform} />
          <ChannelLabel>
            <LiveDot $live={p.isLive ?? false} title={p.isLive ? 'Live' : 'Offline'} />
            {p.channel ?? ''}
          </ChannelLabel>
          <PlatformViewers>{p.viewers.toLocaleString()}</PlatformViewers>
        </PlatformRow>
      ))}

      <StatRow>
        <StatLabel>Followers</StatLabel>
        <StatValue>{totalFollowers.toLocaleString()}</StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>Time Live</StatLabel>
        <StatValue>{formatDuration(duration)}</StatValue>
      </StatRow>

      {outputStats && (
        <>
          <SectionDivider />
          <StatRow>
            <StatLabel>Bitrate</StatLabel>
            <StatValue $warn={isStreaming && outputStats.bitrateKbps < 500}>
              {outputStats.bitrateKbps.toLocaleString()} kbps
            </StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Dropped Frames</StatLabel>
            <StatValue $warn={dropPct > 2}>
              {dropped.toLocaleString()} ({dropPct.toFixed(1)}%)
            </StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>CPU / FPS</StatLabel>
            <StatValue>
              {outputStats.cpuUsage}% / {outputStats.fps}
            </StatValue>
          </StatRow>
          {outputStats.targets.length > 0 && (
            <>
              <SectionDivider />
              {outputStats.targets.map((t, i) => (
                <TargetRow key={`${t.platform}-${i}`}>
                  <TargetDot $connected={t.connected} />
                  <TargetName>{t.name || t.platform}</TargetName>
                  <StatLabel>{t.connected ? `${t.bitrateKbps} kbps` : 'off'}</StatLabel>
                </TargetRow>
              ))}
            </>
          )}
        </>
      )}
    </InfoContainer>
  );
}
