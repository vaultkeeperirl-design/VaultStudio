import { fireEvent, render, screen } from '@testing-library/react';
import { AudioMixer } from '../../components/studio/AudioMixer';
import { mockAudioSources } from '../../mocks/mockData';

describe('AudioMixer', () => {
  it('renders all audio sources', () => {
    render(<AudioMixer sources={mockAudioSources} onVolumeChange={() => {}} onMuteToggle={() => {}} />);
    expect(screen.getByText('Microphone')).toBeInTheDocument();
    expect(screen.getByText('Desktop Audio')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('shows muted state for muted sources', () => {
    render(<AudioMixer sources={mockAudioSources} onVolumeChange={() => {}} onMuteToggle={() => {}} />);
    const muteButtons = screen.getAllByRole('button', { name: /mute/i });
    expect(muteButtons.length).toBeGreaterThan(0);
  });

  it('shows an empty state when no audio sources are available', () => {
    render(<AudioMixer sources={[]} onVolumeChange={() => {}} onMuteToggle={() => {}} />);
    expect(screen.getByText('No audio sources')).toBeInTheDocument();
  });

  it('renders dB meter readouts so quiet mic peaks are visible', () => {
    render(
      <AudioMixer
        sources={[{ id: 'mic', name: 'Mic/Aux', volume: 1, muted: false, meterLevel: 0.1 }]}
        onVolumeChange={() => {}}
        onMuteToggle={() => {}}
      />
    );

    expect(screen.getByText('-20 dB')).toBeInTheDocument();
    // Vertical is the default layout.
    expect(screen.getByLabelText('Mic/Aux vertical meter -20 dB')).toBeInTheDocument();
  });

  it('defaults to vertical faders and switches between vertical and horizontal layouts', () => {
    render(
      <AudioMixer
        sources={[{ id: 'mic', name: 'Mic/Aux', volume: 1, muted: false, meterLevel: 0.1 }]}
        onVolumeChange={() => {}}
        onMuteToggle={() => {}}
      />
    );

    const horizontal = screen.getByRole('button', { name: 'Horizontal audio meters' });
    const vertical = screen.getByRole('button', { name: 'Vertical audio meters' });

    expect(vertical).toHaveAttribute('aria-pressed', 'true');
    expect(horizontal).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Mic/Aux vertical meter -20 dB')).toBeInTheDocument();

    fireEvent.click(horizontal);

    expect(horizontal).toHaveAttribute('aria-pressed', 'true');
    expect(vertical).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Mic/Aux meter -20 dB')).toBeInTheDocument();
  });
});
