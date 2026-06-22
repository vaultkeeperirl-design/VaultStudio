import { fireEvent, render, screen, within } from '@testing-library/react';
import { UnifiedChat } from '../../components/studio/UnifiedChat';
import { mockChatMessages } from '../../mocks/mockData';
import type { PlatformStatus } from '../../types';

const sendableStatuses: PlatformStatus[] = [
  { platform: 'twitch', channel: 'deadbeatst', chatConnected: true, canSend: true },
  { platform: 'kick', channel: 'vaultkeeper', chatConnected: true, canSend: true },
];

describe('UnifiedChat', () => {
  it('renders chat messages with platform badges', () => {
    render(<UnifiedChat messages={mockChatMessages} onSend={() => {}} chatTarget="all" onTargetChange={() => {}} />);
    expect(screen.getByText('Mysticlloyd')).toBeInTheDocument();
    expect(screen.getByText('Cheer to take #3!')).toBeInTheDocument();
    expect(screen.getAllByTitle('Twitch').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Kick').length).toBeGreaterThan(0);
  });

  it('renders the send target selector', () => {
    render(<UnifiedChat messages={mockChatMessages} onSend={() => {}} chatTarget="all" onTargetChange={() => {}} />);
    expect(screen.getByText('Send to:')).toBeInTheDocument();
  });

  it('keeps the all-platform send target label stable while listing platforms in the tooltip', () => {
    render(
      <UnifiedChat
        messages={mockChatMessages}
        onSend={() => {}}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={sendableStatuses}
      />
    );

    expect(screen.getByRole('combobox')).toHaveDisplayValue('All Platforms');
    expect(screen.queryByText(/Twitch.*vault/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('Sends to Twitch (deadbeatst), Kick (vaultkeeper)')).toBeInTheDocument();
  });

  it('allows sending when any connected platform can send', () => {
    render(
      <UnifiedChat
        messages={mockChatMessages}
        onSend={() => {}}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={[{ platform: 'kick', channel: 'vaultkeeper', chatConnected: true, canSend: true }]}
      />
    );

    expect(screen.getByPlaceholderText('Type a message...')).toBeEnabled();
  });

  it('collapses duplicate all-platform self echoes into one rotating chat identity row', () => {
    render(
      <UnifiedChat
        messages={[
          {
            id: 'kick-self-1',
            platform: 'kick',
            channelId: 'vaultkeeper',
            username: 'Vaultkeeper',
            displayName: 'Vaultkeeper',
            message: 'test',
            timestamp: 1000,
          },
          {
            id: 'twitch-self-1',
            platform: 'twitch',
            channelId: 'deadbeatst',
            username: 'DeadBeatST',
            displayName: 'DeadBeatST',
            message: 'test',
            timestamp: 1800,
          },
        ]}
        onSend={() => {}}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={sendableStatuses}
      />
    );

    expect(screen.getAllByText('test')).toHaveLength(1);
    expect(screen.getByText('Vaultkeeper')).toBeInTheDocument();
    expect(screen.queryByText('Kick - Vaultkeeper')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Posted to Kick - Vaultkeeper, Twitch - DeadBeatST')).toHaveAttribute(
      'title',
      'Kick - Vaultkeeper\nTwitch - DeadBeatST'
    );
  });

  it('collapses delayed all-platform self echoes even when other chat arrives between them', () => {
    render(
      <UnifiedChat
        messages={[
          {
            id: 'kick-self-1',
            platform: 'kick',
            channelId: 'vaultkeeper',
            username: 'Vaultkeeper',
            displayName: 'Vaultkeeper',
            message: 'test',
            timestamp: 1000,
          },
          {
            id: 'viewer-between',
            platform: 'kick',
            channelId: 'viewer',
            username: 'MysticLloyd',
            displayName: 'MysticLloyd',
            message: 'between',
            timestamp: 2400,
          },
          {
            id: 'twitch-self-1',
            platform: 'twitch',
            channelId: 'deadbeatst',
            username: 'DeadBeatST',
            displayName: 'DeadBeatST',
            message: 'test',
            timestamp: 4200,
          },
        ]}
        onSend={() => {}}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={sendableStatuses}
      />
    );

    const identity = screen.getByLabelText('Posted to Kick - Vaultkeeper, Twitch - DeadBeatST');
    expect(screen.getAllByText('test')).toHaveLength(1);
    expect(screen.getByText('between')).toBeInTheDocument();
    expect(within(identity).getByText('Vaultkeeper')).toBeInTheDocument();
    expect(within(identity).queryByText(/Kick - Vaultkeeper/)).not.toBeInTheDocument();
  });

  it('collapses all-platform self echoes when one source is chat-connected but not send-capable', () => {
    render(
      <UnifiedChat
        messages={[
          {
            id: 'twitch-self-1',
            platform: 'twitch',
            channelId: 'deadbeatst',
            username: 'DeadBeatST',
            displayName: 'DeadBeatST',
            message: 'test',
            timestamp: 1000,
          },
          {
            id: 'viewer-between',
            platform: 'kick',
            channelId: 'viewer',
            username: 'MysticLloyd',
            displayName: 'MysticLloyd',
            message: 'between',
            timestamp: 2400,
          },
          {
            id: 'kick-self-1',
            platform: 'kick',
            channelId: 'vaultkeeper',
            username: 'Vaultkeeper',
            displayName: 'Vaultkeeper',
            message: 'test',
            timestamp: 4200,
          },
        ]}
        onSend={() => {}}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={[
          { platform: 'twitch', channel: 'deadbeatst', chatConnected: true, canSend: false },
          { platform: 'kick', channel: 'vaultkeeper', chatConnected: true, canSend: true },
        ]}
      />
    );

    expect(screen.getAllByText('test')).toHaveLength(1);
    expect(screen.getByText('between')).toBeInTheDocument();
    expect(screen.getByLabelText('Posted to Twitch - DeadBeatST, Kick - Vaultkeeper')).toBeInTheDocument();
  });

  it('clears local chat instead of sending /clear to platforms', () => {
    const onClear = vi.fn();
    const onSend = vi.fn();

    render(
      <UnifiedChat
        messages={mockChatMessages}
        onSend={onSend}
        onClear={onClear}
        chatTarget="all"
        onTargetChange={() => {}}
        platformStatuses={sendableStatuses}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: '/clear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});
