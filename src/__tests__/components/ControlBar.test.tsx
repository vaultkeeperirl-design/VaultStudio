import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../../components/studio/ControlBar';

describe('ControlBar', () => {
  it('renders Go Live and Record buttons', () => {
    render(
      <ControlBar
        isStreaming={false}
        isRecording={false}
        onStartStream={() => {}}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    expect(screen.getByText('Go Live')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('shows Stop Stream when streaming', () => {
    render(
      <ControlBar
        isStreaming={true}
        isRecording={false}
        onStartStream={() => {}}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    expect(screen.getByText('Stop Stream')).toBeInTheDocument();
  });

  it('calls onStartStream when Go Live is clicked', async () => {
    const onStart = vi.fn();
    render(
      <ControlBar
        isStreaming={false}
        isRecording={false}
        onStartStream={onStart}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    await userEvent.click(screen.getByText('Go Live'));
    expect(onStart).toHaveBeenCalled();
  });
});
