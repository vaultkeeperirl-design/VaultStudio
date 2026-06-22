import { useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { AudioSource } from '../../types';

type MeterOrientation = 'horizontal' | 'vertical';

const MixerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
  height: 100%;
  min-height: 0;
`;

// Vertical mode arranges channels side by side like a real mixer and lets the
// faders fill the panel height; horizontal mode stacks them.
const ChannelRack = styled.div<{ $orientation: MeterOrientation }>`
  display: flex;
  ${({ $orientation }) =>
    $orientation === 'vertical'
      ? `flex-direction: row;
         gap: ${tokens.spacing.xs};
         flex: 1;
         min-height: 0;
         align-items: stretch;
         overflow-x: auto;`
      : `flex-direction: column;
         gap: ${tokens.spacing.md};`}
`;

const MixerToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

const OrientationToggle = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  background: ${tokens.colors.panel2};
`;

const OrientationButton = styled.button<{ $active: boolean }>`
  width: 24px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ $active }) => ($active ? tokens.colors.gold : 'transparent')};
  border-radius: ${tokens.borderRadius.sm};
  background: ${({ $active }) => ($active ? 'rgba(214, 162, 58, 0.18)' : 'transparent')};
  color: ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.muted)};
  cursor: pointer;
  padding: 0;

  &:hover {
    border-color: ${tokens.colors.gold};
    color: ${tokens.colors.gold};
  }
`;

const OrientationIcon = styled.span<{ $orientation: MeterOrientation }>`
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  transform: ${({ $orientation }) => ($orientation === 'horizontal' ? 'rotate(90deg)' : 'none')};

  &::before,
  &::after {
    content: '';
    display: block;
    width: 4px;
    border-radius: 999px;
    background: currentColor;
  }

  &::before {
    height: 7px;
  }

  &::after {
    height: 13px;
  }
`;

const EmptyState = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  text-align: center;
  padding: ${tokens.spacing.lg};
`;

const MixerRow = styled.div<{ $orientation: MeterOrientation }>`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
  ${({ $orientation }) =>
    $orientation === 'vertical'
      ? `width: 58px;
         flex-shrink: 0;
         height: 100%;
         align-items: center;`
      : ''}
`;

const MixerHeader = styled.div<{ $orientation: MeterOrientation }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  ${({ $orientation }) =>
    $orientation === 'vertical'
      ? `flex-direction: column;
         width: 100%;`
      : `justify-content: space-between;`}
`;

const SourceName = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.text};
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
`;

const MuteButton = styled.button<{ $muted: boolean }>`
  background: none;
  border: 1px solid ${({ $muted }) => ($muted ? tokens.colors.danger : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  color: ${({ $muted }) => ($muted ? tokens.colors.danger : tokens.colors.muted)};
  font-size: ${tokens.fontSize.xs};
  padding: 2px 6px;
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
  }
`;

const SliderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

// Vertical mode lays the channel out like a real mixer: a full-height vertical
// fader next to its full-height vertical meter. Horizontal mode keeps the
// compact inline slider.
const VerticalChannel = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  align-items: stretch;
  justify-content: center;
  gap: ${tokens.spacing.xs};
  padding: ${tokens.spacing.xs} 0;
`;

const ChannelFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const VolumeSlider = styled.input<{ $orientation: MeterOrientation }>`
  -webkit-appearance: none;
  appearance: none;
  background: ${tokens.colors.border};
  border-radius: 2px;
  outline: none;
  ${({ $orientation }) =>
    $orientation === 'vertical'
      ? // writing-mode + direction give a bottom-to-top fader (max at the top);
        // align-self: stretch makes it fill the channel height like the
        // horizontal fader fills its row width.
        `writing-mode: vertical-lr;
         direction: rtl;
         width: 5px;
         height: 100%;
         align-self: stretch;`
      : `flex: 1;
         height: 4px;`}

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${tokens.colors.gold};
    cursor: pointer;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const VolumeLabel = styled.span`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  min-width: 32px;
  text-align: right;
`;

const MeterReadout = styled.div<{ $orientation: MeterOrientation }>`
  display: grid;
  grid-template-columns: ${({ $orientation }) => ($orientation === 'vertical' ? '15px 1fr' : '1fr')};
  gap: 2px;
  align-items: ${({ $orientation }) => ($orientation === 'vertical' ? 'stretch' : 'center')};
  height: ${({ $orientation }) => ($orientation === 'vertical' ? '100%' : 'auto')};
`;

const MeterBar = styled.div<{ $orientation: MeterOrientation }>`
  position: relative;
  height: ${({ $orientation }) => ($orientation === 'vertical' ? '100%' : '8px')};
  width: ${({ $orientation }) => ($orientation === 'vertical' ? '8px' : '100%')};
  background:
    ${({ $orientation }) => ($orientation === 'vertical'
      ? `linear-gradient(0deg,
      rgba(39, 168, 255, 0.18) 0 58%,
      rgba(83, 252, 24, 0.18) 58% 78%,
      rgba(214, 162, 58, 0.22) 78% 92%,
      rgba(255, 48, 69, 0.26) 92% 100%)`
      : `linear-gradient(90deg,
      rgba(39, 168, 255, 0.18) 0 58%,
      rgba(83, 252, 24, 0.18) 58% 78%,
      rgba(214, 162, 58, 0.22) 78% 92%,
      rgba(255, 48, 69, 0.26) 92% 100%)`)},
    ${tokens.colors.border};
  border-radius: 999px;
  overflow: hidden;
`;

const MeterFill = styled.div<{ $percent: number; $clipping: boolean; $orientation: MeterOrientation }>`
  position: ${({ $orientation }) => ($orientation === 'vertical' ? 'absolute' : 'static')};
  bottom: 0;
  left: 0;
  height: ${({ $orientation, $percent }) => ($orientation === 'vertical' ? `${$percent}%` : '100%')};
  width: ${({ $orientation, $percent }) => ($orientation === 'vertical' ? '100%' : `${$percent}%`)};
  background: ${({ $orientation }) => ($orientation === 'vertical'
    ? `linear-gradient(0deg, ${tokens.colors.neonBlue}, ${tokens.colors.kick} 55%, ${tokens.colors.gold} 78%, ${tokens.colors.danger})`
    : `linear-gradient(90deg, ${tokens.colors.neonBlue}, ${tokens.colors.kick} 55%, ${tokens.colors.gold} 78%, ${tokens.colors.danger})`)};
  box-shadow: ${({ $clipping }) => ($clipping ? `0 0 10px ${tokens.colors.danger}` : 'none')};
  transition: ${({ $orientation }) => ($orientation === 'vertical' ? 'height' : 'width')} 0.06s linear;
`;

const PeakMarker = styled.div<{ $percent: number; $clipping: boolean; $orientation: MeterOrientation }>`
  position: absolute;
  ${({ $orientation, $percent }) => ($orientation === 'vertical'
    ? `left: 0; right: 0; bottom: calc(${$percent}% - 1px); height: 2px;`
    : `top: 0; bottom: 0; left: calc(${$percent}% - 1px); width: 2px;`)}
  background: ${({ $clipping }) => ($clipping ? tokens.colors.danger : tokens.colors.gold)};
  box-shadow: ${({ $clipping }) => ($clipping ? `0 0 8px ${tokens.colors.danger}` : 'none')};
`;

const MeterScale = styled.div<{ $orientation: MeterOrientation }>`
  display: grid;
  grid-template-columns: ${({ $orientation }) => ($orientation === 'vertical' ? '1fr' : 'repeat(4, 1fr)')};
  grid-template-rows: ${({ $orientation }) => ($orientation === 'vertical' ? 'repeat(4, 1fr)' : 'none')};
  color: ${tokens.colors.muted};
  font-size: ${({ $orientation }) => ($orientation === 'vertical' ? '7px' : '9px')};
  line-height: 1;
  opacity: 0.72;
  overflow: hidden;
  height: ${({ $orientation }) => ($orientation === 'vertical' ? '100%' : 'auto')};

  span:nth-child(2),
  span:nth-child(3) {
    text-align: ${({ $orientation }) => ($orientation === 'vertical' ? 'left' : 'center')};
  }

  span:last-child {
    text-align: ${({ $orientation }) => ($orientation === 'vertical' ? 'left' : 'right')};
    color: ${({ $orientation }) => ($orientation === 'horizontal' ? tokens.colors.danger : tokens.colors.muted)};
  }

  span:first-child {
    color: ${({ $orientation }) => ($orientation === 'vertical' ? tokens.colors.danger : tokens.colors.muted)};
  }
`;

const MeterInfo = styled.span<{ $clipping: boolean; $orientation?: MeterOrientation }>`
  font-size: ${tokens.fontSize.xs};
  color: ${({ $clipping }) => ($clipping ? tokens.colors.danger : tokens.colors.muted)};
  ${({ $orientation }) =>
    $orientation === 'vertical'
      ? `text-align: center;`
      : `min-width: 52px;
         text-align: right;`}
`;

type Props = {
  sources: AudioSource[];
  onVolumeChange: (sourceId: string, volume: number) => void;
  onMuteToggle: (sourceId: string) => void;
};

function levelToDb(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return -60;
  return Math.max(-60, Math.min(0, 20 * Math.log10(level)));
}

function levelToMeterPercent(level: number): number {
  const db = levelToDb(level);
  // OBS users read audio on a logarithmic dB meter. Mapping -60..0 dB to the
  // full bar makes normal mic speech around -24..-12 dB visibly useful.
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export function AudioMixer({ sources, onVolumeChange, onMuteToggle }: Props) {
  const [meterOrientation, setMeterOrientation] = useState<MeterOrientation>('vertical');

  return (
    <MixerContainer>
      <MixerToolbar>
        <OrientationToggle aria-label="Audio meter orientation">
          <OrientationButton
            type="button"
            aria-label="Horizontal audio meters"
            aria-pressed={meterOrientation === 'horizontal'}
            title="Horizontal meters"
            $active={meterOrientation === 'horizontal'}
            onClick={() => setMeterOrientation('horizontal')}
          >
            <OrientationIcon $orientation="horizontal" />
          </OrientationButton>
          <OrientationButton
            type="button"
            aria-label="Vertical audio meters"
            aria-pressed={meterOrientation === 'vertical'}
            title="Vertical meters"
            $active={meterOrientation === 'vertical'}
            onClick={() => setMeterOrientation('vertical')}
          >
            <OrientationIcon $orientation="vertical" />
          </OrientationButton>
        </OrientationToggle>
      </MixerToolbar>
      {sources.length === 0 && <EmptyState>No audio sources</EmptyState>}
      <ChannelRack $orientation={meterOrientation}>
      {sources.map((source) => {
        const activeLevel = source.muted ? 0 : source.meterLevel;
        const db = levelToDb(activeLevel);
        const percent = levelToMeterPercent(activeLevel);
        const clipping = !source.muted && db > -1;
        const meterLabel = `${source.name}${meterOrientation === 'vertical' ? ' vertical' : ''} meter ${Math.round(db)} dB`;
        const volumePercent = Math.round((source.muted ? 0 : source.volume) * 100);
        const fader = (
          <VolumeSlider
            $orientation={meterOrientation}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={source.muted ? 0 : source.volume}
            onChange={(e) => onVolumeChange(source.id, parseFloat(e.target.value))}
            disabled={source.muted}
            aria-label={`${source.name} volume`}
          />
        );
        const dbInfo = (
          <MeterInfo $clipping={clipping} $orientation={meterOrientation}>
            {source.muted ? 'Muted' : clipping ? 'CLIP' : `${Math.round(db)} dB`}
          </MeterInfo>
        );
        const meter = (
          <MeterReadout $orientation={meterOrientation}>
            <MeterBar $orientation={meterOrientation} aria-label={meterLabel}>
              <MeterFill $percent={percent} $clipping={clipping} $orientation={meterOrientation} />
              {!source.muted && <PeakMarker $percent={percent} $clipping={clipping} $orientation={meterOrientation} />}
            </MeterBar>
            <MeterScale $orientation={meterOrientation} aria-hidden>
              {meterOrientation === 'vertical' ? (
                <>
                  <span>0</span>
                  <span>-12</span>
                  <span>-30</span>
                  <span>-60</span>
                </>
              ) : (
                <>
                  <span>-60</span>
                  <span>-30</span>
                  <span>-12</span>
                  <span>0</span>
                </>
              )}
            </MeterScale>
          </MeterReadout>
        );

        return (
          <MixerRow key={source.id} $orientation={meterOrientation}>
            <MixerHeader $orientation={meterOrientation}>
              <SourceName>{source.name}</SourceName>
              <MuteButton
                $muted={source.muted}
                onClick={() => onMuteToggle(source.id)}
                aria-label={`Mute ${source.name}`}
              >
                {source.muted ? 'MUTED' : 'MUTE'}
              </MuteButton>
            </MixerHeader>
            {meterOrientation === 'vertical' ? (
              <>
                <VerticalChannel>
                  {fader}
                  {meter}
                </VerticalChannel>
                <ChannelFooter>
                  <VolumeLabel>{volumePercent}%</VolumeLabel>
                  {dbInfo}
                </ChannelFooter>
              </>
            ) : (
              <>
                <SliderRow>
                  {fader}
                  <VolumeLabel>{volumePercent}%</VolumeLabel>
                  {dbInfo}
                </SliderRow>
                {meter}
              </>
            )}
          </MixerRow>
        );
      })}
      </ChannelRack>
    </MixerContainer>
  );
}
