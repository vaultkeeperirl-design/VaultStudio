import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcesPanel } from '../../components/studio/SourcesPanel';
import { mockScenes } from '../../mocks/mockData';

describe('SourcesPanel', () => {
  it('renders sources for the active scene', () => {
    render(<SourcesPanel sources={mockScenes[0].sources} />);
    expect(screen.getByText('Webcam')).toBeInTheDocument();
    expect(screen.getByText('Game Capture')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('shows empty state when no sources', () => {
    render(<SourcesPanel sources={[]} />);
    expect(screen.getByText('No sources')).toBeInTheDocument();
  });

  it('renders eye icons for source visibility states', () => {
    render(
      <SourcesPanel
        sources={[
          mockScenes[0].sources[0],
          { ...mockScenes[0].sources[1], visible: false },
        ]}
      />
    );

    expect(screen.getByLabelText('Hide source')).toHaveAttribute('data-icon', 'eye');
    expect(screen.getByLabelText('Show source')).toHaveAttribute('data-icon', 'eye-off');
  });

  it('toggles source visibility from the eye button', async () => {
    const onToggleVisibility = vi.fn();
    render(<SourcesPanel sources={mockScenes[0].sources} onToggleVisibility={onToggleVisibility} />);

    await userEvent.click(screen.getAllByLabelText('Hide source')[0]);

    expect(onToggleVisibility).toHaveBeenCalledWith(mockScenes[0].sources[0].id);
  });

  it('creates a browser source with configured settings', async () => {
    const onAddSource = vi.fn();
    render(<SourcesPanel sources={[]} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Browser Source'));
    await userEvent.clear(screen.getByLabelText('Source name'));
    await userEvent.type(screen.getByLabelText('Source name'), 'Alerts');
    await userEvent.type(screen.getByLabelText('URL'), 'https://alerts.example');
    await userEvent.click(screen.getByText('Add Browser Source'));

    expect(onAddSource).toHaveBeenCalledWith('browser', {
      name: 'Alerts',
      url: 'https://alerts.example',
    });
  });

  it('adds the IRL phone ingest as a media source', async () => {
    const onAddSource = vi.fn();
    render(
      <SourcesPanel
        sources={[]}
        onAddSource={onAddSource}
        irlIngestUrl="rtmp://192.168.1.23:1935/live/phone-key"
      />
    );

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ IRL Phone Feed'));

    expect(onAddSource).toHaveBeenCalledWith('media', {
      name: 'IRL Phone Feed',
      file: 'rtmp://192.168.1.23:1935/live/phone-key',
    });
  });

  it('selects an image file from the system picker when adding image sources', async () => {
    const onAddSource = vi.fn();
    const selectImage = vi.fn().mockResolvedValue('C:\\Art\\starting-soon.png');
    Object.defineProperty(window, 'vaultstudio', {
      configurable: true,
      value: { files: { selectImage } },
    });

    render(<SourcesPanel sources={[]} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Image'));
    await userEvent.click(screen.getByText('Browse...'));

    expect(selectImage).toHaveBeenCalled();
    expect(screen.getByLabelText('Image path')).toHaveValue('C:\\Art\\starting-soon.png');

    await userEvent.click(screen.getByText('Add Image'));
    expect(onAddSource).toHaveBeenCalledWith('image', {
      name: 'starting-soon',
      file: 'C:\\Art\\starting-soon.png',
    });
  });

  it('creates a camera source with the selected camera device', async () => {
    const onAddSource = vi.fn();
    render(
      <SourcesPanel
        sources={[]}
        onAddSource={onAddSource}
        devices={{ camera: [{ name: 'Iphone', value: 'iphone-device-id' }] }}
      />
    );

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Camera'));

    expect(screen.getByLabelText('Camera device')).toHaveValue('iphone-device-id');

    await userEvent.click(screen.getByText('Add Camera'));

    expect(onAddSource).toHaveBeenCalledWith('camera', {
      name: 'Iphone',
      deviceId: 'iphone-device-id',
    });
  });

  it('renames a source from the right-click menu', async () => {
    const onRenameSource = vi.fn();
    render(<SourcesPanel sources={mockScenes[0].sources} onRenameSource={onRenameSource} />);

    fireEvent.contextMenu(screen.getByText('Webcam'));
    await userEvent.click(screen.getByText('Rename'));

    // A modal prompt opens, pre-filled with the current name.
    const input = screen.getByLabelText('Rename source');
    await userEvent.clear(input);
    await userEvent.type(input, 'Front Cam{Enter}');

    expect(onRenameSource).toHaveBeenCalledWith('src-1', 'Front Cam');
  });

  it('adds a scene-local audio track from a file', async () => {
    const onAddSource = vi.fn();
    const selectAudio = vi.fn().mockResolvedValue('C:\\Music\\lofi.mp3');
    Object.defineProperty(window, 'vaultstudio', {
      configurable: true,
      value: { files: { selectAudio } },
    });

    render(<SourcesPanel sources={[]} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Audio Track'));
    await userEvent.click(screen.getByText('Browse...'));

    expect(selectAudio).toHaveBeenCalled();
    expect(screen.getByLabelText('Audio path')).toHaveValue('C:\\Music\\lofi.mp3');

    await userEvent.click(screen.getByText('Add Audio Track'));
    expect(onAddSource).toHaveBeenCalledWith('audio_track', {
      name: 'lofi',
      file: 'C:\\Music\\lofi.mp3',
      looping: true,
    });
  });

  it('adds a video source from a file (plays once by default)', async () => {
    const onAddSource = vi.fn();
    const selectVideo = vi.fn().mockResolvedValue('C:\\Clips\\intro.mp4');
    Object.defineProperty(window, 'vaultstudio', {
      configurable: true,
      value: { files: { selectVideo } },
    });

    render(<SourcesPanel sources={[]} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Video'));
    await userEvent.click(screen.getByText('Browse...'));

    expect(screen.getByLabelText('Video path')).toHaveValue('C:\\Clips\\intro.mp4');

    await userEvent.click(screen.getByText('Add Video'));
    expect(onAddSource).toHaveBeenCalledWith('video', {
      name: 'intro',
      file: 'C:\\Clips\\intro.mp4',
      looping: false,
    });
  });

  it('adds a playlist source from multiple files', async () => {
    const onAddSource = vi.fn();
    const selectPlaylist = vi.fn().mockResolvedValue(['C:\\Music\\a.mp3', 'C:\\Music\\b.mp3']);
    Object.defineProperty(window, 'vaultstudio', {
      configurable: true,
      value: { files: { selectPlaylist } },
    });

    render(<SourcesPanel sources={[]} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Playlist'));
    await userEvent.click(screen.getByText('+ Add files...'));

    expect(selectPlaylist).toHaveBeenCalled();
    // Both files appear in the ordered list before submitting.
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Add Playlist'));
    expect(onAddSource).toHaveBeenCalledWith('playlist', {
      name: 'a',
      files: ['C:\\Music\\a.mp3', 'C:\\Music\\b.mp3'],
      looping: true,
    });
  });

  it('selects rows and renders lock controls', async () => {
    const onSelectSource = vi.fn();
    const onToggleLock = vi.fn();
    render(
      <SourcesPanel
        sources={mockScenes[0].sources}
        selectedSourceId={mockScenes[0].sources[0].id}
        onSelectSource={onSelectSource}
        onToggleLock={onToggleLock}
      />
    );

    await userEvent.click(screen.getByText('Game Capture'));
    expect(onSelectSource).toHaveBeenCalledWith(mockScenes[0].sources[1].id);

    await userEvent.click(screen.getByLabelText(`Lock ${mockScenes[0].sources[0].name}`));
    expect(onToggleLock).toHaveBeenCalledWith(mockScenes[0].sources[0].id, true);
  });
});
