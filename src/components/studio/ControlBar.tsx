import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { Button } from '../common/Button';
import type { GuardStatus } from '../../types';

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  flex-wrap: wrap;
  min-width: 0;
`;

const Timer = styled.span<{ $color: string }>`
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.bold};
  color: ${({ $color }) => $color};
  font-variant-numeric: tabular-nums;
  min-width: 64px;
  text-align: center;
`;

const GuardChip = styled.span<{ $state: GuardStatus['state'] }>`
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  padding: 2px 8px;
  border-radius: ${tokens.borderRadius.sm};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background-color: ${({ $state }) =>
    $state === 'monitoring' ? 'rgba(83, 252, 24, 0.12)' : $state === 'brb' || $state === 'reconnecting' ? 'rgba(255, 48, 69, 0.15)' : 'transparent'};
  color: ${({ $state }) =>
    $state === 'monitoring' ? tokens.colors.kick : $state === 'brb' || $state === 'reconnecting' ? tokens.colors.danger : tokens.colors.muted};
`;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SmallToggle = styled.button<{ $active: boolean }>`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;
  border: 1px solid ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  background-color: ${({ $active }) => ($active ? 'rgba(214, 162, 58, 0.18)' : tokens.colors.panel2)};
  color: ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.text)};
  transition: all 0.15s ease;

  &:hover {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

type Props = {
  isStreaming: boolean;
  isRecording: boolean;
  streamDuration?: number;
  recordDuration?: number;
  guardStatus?: GuardStatus | null;
  disabled?: boolean;
  virtualCamActive?: boolean;
  replayActive?: boolean;
  onStartStream: () => void;
  onStopStream: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onToggleVirtualCam?: () => void;
  onClipReplay?: () => void;
};

export function ControlBar({
  isStreaming,
  isRecording,
  streamDuration = 0,
  recordDuration = 0,
  guardStatus,
  disabled = false,
  virtualCamActive = false,
  replayActive = false,
  onStartStream,
  onStopStream,
  onStartRecording,
  onStopRecording,
  onToggleVirtualCam,
  onClipReplay,
}: Props) {
  return (
    <Bar>
      {guardStatus && guardStatus.active && guardStatus.state !== 'idle' && (
        <GuardChip $state={guardStatus.state} title={guardStatus.message}>
          {guardStatus.state === 'monitoring'
            ? 'Protected'
            : guardStatus.state === 'reconnecting'
              ? `Reconnecting ${guardStatus.retriesUsed}`
              : 'BRB Mode'}
        </GuardChip>
      )}
      {isStreaming && <Timer $color={tokens.colors.live}>{formatDuration(streamDuration)}</Timer>}
      {isStreaming ? (
        <Button variant="danger" onClick={onStopStream}>
          Stop Stream
        </Button>
      ) : (
        <Button variant="secondary" onClick={onStartStream} disabled={disabled}>
          Go Live
        </Button>
      )}
      {isRecording && <Timer $color={tokens.colors.gold}>{formatDuration(recordDuration)}</Timer>}
      {isRecording ? (
        <Button variant="danger" onClick={onStopRecording}>
          Stop Record
        </Button>
      ) : (
        <Button variant="secondary" onClick={onStartRecording} disabled={disabled}>
          Record
        </Button>
      )}
      {onClipReplay && (
        <SmallToggle
          $active={replayActive}
          onClick={onClipReplay}
          disabled={disabled}
          title={replayActive ? 'Save a clip of the last moments' : 'Arm the replay buffer'}
        >
          {replayActive ? 'Clip' : 'Replay'}
        </SmallToggle>
      )}
      {onToggleVirtualCam && (
        <SmallToggle
          $active={virtualCamActive}
          onClick={onToggleVirtualCam}
          disabled={disabled}
          title="Toggle virtual camera"
        >
          VCam
        </SmallToggle>
      )}
    </Bar>
  );
}
