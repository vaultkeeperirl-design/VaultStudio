import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenesPanel } from '../../components/studio/ScenesPanel';
import { mockScenes } from '../../mocks/mockData';

describe('ScenesPanel', () => {
  it('renders all scenes', () => {
    render(<ScenesPanel scenes={mockScenes} activeSceneId="scene-1" onSwitchScene={() => {}} />);
    expect(screen.getByText('Main Scene')).toBeInTheDocument();
    expect(screen.getByText('BRB Screen')).toBeInTheDocument();
    expect(screen.getByText('Starting Soon')).toBeInTheDocument();
  });

  it('calls onSwitchScene when a scene is clicked', async () => {
    const onSwitch = vi.fn();
    render(<ScenesPanel scenes={mockScenes} activeSceneId="scene-1" onSwitchScene={onSwitch} />);
    await userEvent.click(screen.getByText('BRB Screen'));
    expect(onSwitch).toHaveBeenCalledWith('scene-2');
  });

  it('renames a scene from the right-click menu', async () => {
    const onRenameScene = vi.fn();
    render(
      <ScenesPanel
        scenes={mockScenes}
        activeSceneId="scene-1"
        onSwitchScene={() => {}}
        onRenameScene={onRenameScene}
      />
    );

    fireEvent.contextMenu(screen.getByText('BRB Screen'));
    await userEvent.click(screen.getByText('Rename'));

    // A modal prompt opens, pre-filled with the current name.
    const input = screen.getByLabelText('Rename scene');
    await userEvent.clear(input);
    await userEvent.type(input, 'Away{Enter}');

    expect(onRenameScene).toHaveBeenCalledWith('scene-2', 'Away');
  });
});
