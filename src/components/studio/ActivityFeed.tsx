import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import { HeartIcon, SubIcon, GiftIcon, RaidIcon, CoinIcon } from '../common/icons';
import type { UnifiedActivityEvent } from '../../types';

const FeedContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const EventRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  padding: ${tokens.spacing.xs} 0;
  font-size: ${tokens.fontSize.sm};
`;

const EventUsername = styled.span`
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.text};
  flex-shrink: 0;
`;

const EventVerb = styled.span`
  color: ${tokens.colors.muted};
`;

const EventMessage = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  padding-left: 26px;
  word-break: break-word;
`;

const EventTime = styled.span`
  margin-left: auto;
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  flex-shrink: 0;
  opacity: 0.7;
`;

const IconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
`;

const EmptyState = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  text-align: center;
  padding: ${tokens.spacing.lg};
`;

function eventIcon(type: UnifiedActivityEvent['type']) {
  switch (type) {
    case 'follow':
      return <HeartIcon />;
    case 'sub':
    case 'resub':
    case 'stream_streak':
      return <SubIcon />;
    case 'gift_sub':
      return <GiftIcon />;
    case 'raid':
      return <RaidIcon />;
    case 'cheer':
    case 'donation':
      return <CoinIcon />;
  }
}

function eventVerb(event: UnifiedActivityEvent): string {
  switch (event.type) {
    case 'follow':
      return 'followed';
    case 'sub':
      return event.amount ? `subscribed (${event.amount} months)` : 'subscribed';
    case 'resub':
      return event.amount ? `resubscribed (${event.amount} months)` : 'resubscribed';
    case 'gift_sub':
      return event.amount ? `gifted ${event.amount} subs` : 'gifted a sub';
    case 'cheer':
      return event.amount ? `cheered ${event.amount} bits` : 'cheered';
    case 'raid':
      return event.amount ? `raided with ${event.amount} viewers` : 'raided';
    case 'stream_streak':
      return 'extended their streak';
    case 'donation':
      return event.message || (event.amount ? `gifted ${event.amount} Kicks` : 'sent a gift');
  }
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

type Props = {
  events: UnifiedActivityEvent[];
};

export function ActivityFeed({ events }: Props) {
  if (events.length === 0) {
    return <EmptyState>Follows, subs, raids, and gifts from every platform land here.</EmptyState>;
  }
  return (
    <FeedContainer>
      {[...events].reverse().map((event) => (
        <div key={event.id}>
          <EventRow>
            <PlatformBadge platform={event.platform} iconOnly />
            <IconWrap>{eventIcon(event.type)}</IconWrap>
            <EventUsername>{event.username}</EventUsername>
            <EventVerb>{eventVerb(event)}</EventVerb>
            <EventTime>{relativeTime(event.timestamp)}</EventTime>
          </EventRow>
          {event.message && event.type !== 'donation' && <EventMessage>{event.message}</EventMessage>}
        </div>
      ))}
    </FeedContainer>
  );
}
