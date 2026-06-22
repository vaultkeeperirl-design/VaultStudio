import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import { ModIcon, SubIcon, VipIcon } from '../common/icons';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuItem } from '../common/ContextMenu';
import type { UnifiedChatMessage, ChatTarget, PlatformStatus } from '../../types';

export type ChatModAction = 'delete' | 'timeout-600' | 'timeout-3600' | 'ban' | 'unban';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

/*
 * Inline flow (not flex): badges and the username sit in the text run, so a
 * wrapped message keeps everything on the first line baseline instead of
 * pushing badges out of line.
 */
const MessageRow = styled.div`
  display: block;
  padding: 2px 0;
  font-size: ${tokens.fontSize.sm};
  line-height: 1.45;
  word-break: break-word;

  > * {
    vertical-align: middle;
  }
`;

const Username = styled.span<{ $color?: string }>`
  font-weight: ${tokens.fontWeight.bold};
  color: ${({ $color }) => $color ?? tokens.colors.text};
  margin-right: ${tokens.spacing.xs};
`;

const RoleIconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  margin-right: ${tokens.spacing.xs};
  vertical-align: -2px;
`;

const identityFade = keyframes`
  0% {
    opacity: 0;
    transform: translateY(2px);
  }
  18%, 82% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-2px);
  }
`;

const RotatingIdentityWrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  width: 92px;
  margin-right: ${tokens.spacing.xs};
  white-space: nowrap;
  vertical-align: -2px;
`;

const RotatingIdentityText = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: ${tokens.colors.gold};
  font-weight: ${tokens.fontWeight.bold};
  text-overflow: ellipsis;
  animation: ${identityFade} 2.4s ease-in-out both;
`;

const MessageText = styled.span`
  color: ${tokens.colors.text};
  word-break: break-word;
`;

const MessageLink = styled.a`
  color: ${tokens.colors.gold};
  text-decoration: none;
  word-break: break-all;

  &:hover {
    text-decoration: underline;
  }
`;

const EmoteImg = styled.img`
  height: 20px;
  vertical-align: middle;
  margin: -3px 1px;
`;

// Split a text fragment into [text, link, text, ...] segments so URLs render
// as clickable anchors. Matches http(s) and www. prefixes.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
function renderTextWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[1];
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    parts.push(
      <MessageLink
        key={`link-${m.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.vaultstudio?.openExternal(href);
        }}
      >
        {raw}
      </MessageLink>
    );
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  text-align: center;
  padding: ${tokens.spacing.lg};
`;

const ChatInputRow = styled.div`
  display: flex;
  gap: ${tokens.spacing.xs};
  padding-top: ${tokens.spacing.sm};
  border-top: 1px solid ${tokens.colors.border};
  align-items: center;
`;

const ChatInput = styled.input`
  flex: 1;
  min-width: 60px;
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  outline: none;

  &:focus {
    border-color: ${tokens.colors.gold};
  }
`;

const SendButton = styled.button`
  background-color: ${tokens.colors.gold};
  color: #000;
  border: none;
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;

  &:hover {
    background-color: ${tokens.colors.darkGold};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FilterTabs = styled.div`
  display: flex;
  gap: ${tokens.spacing.xs};
  padding-bottom: ${tokens.spacing.sm};
`;

const FilterTab = styled.button<{ $active: boolean; $color?: string }>`
  background: ${({ $active }) => ($active ? tokens.colors.panel2 : 'transparent')};
  border: 1px solid ${({ $active, $color }) => ($active ? $color || tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  color: ${({ $active, $color }) => ($active ? $color || tokens.colors.gold : tokens.colors.muted)};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.medium};
  padding: 2px 10px;
  cursor: pointer;

  &:hover {
    border-color: ${({ $color }) => $color || tokens.colors.gold};
  }
`;

const TargetSelector = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
`;

const TargetWrap = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

const TargetSelect = styled.select`
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.xs};
  padding: 2px 4px;
  outline: none;
  min-width: 124px;
`;

function platformLabel(p: string): string {
  return p === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1);
}

const SendHint = styled.div`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  padding-top: 4px;
`;

type Props = {
  messages: UnifiedChatMessage[];
  onSend: (message: string) => void;
  chatTarget: ChatTarget;
  onTargetChange: (target: ChatTarget) => void;
  onClear?: () => void;
  platformStatuses?: PlatformStatus[];
  onModerate?: (action: ChatModAction, message: UnifiedChatMessage) => void;
  /** Hide a message from this feed/overlay only — no platform call, works
   *  with no login and on any platform. */
  onHideLocal?: (message: UnifiedChatMessage) => void;
};

const PLATFORM_TAB_COLORS: Record<string, string> = {
  twitch: tokens.colors.twitch,
  kick: tokens.colors.kick,
  youtube: '#FF0000',
};

const GROUP_DUPLICATE_SEND_WINDOW_MS = 120000;
const ROTATING_IDENTITY_INTERVAL_MS = 2400;

type ChatRenderRow = {
  id: string;
  messages: UnifiedChatMessage[];
};

function normalizeMessageText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function identityLabel(msg: UnifiedChatMessage): string {
  return `${platformLabel(msg.platform)} - ${msg.displayName}`;
}

function normalizeIdentity(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function isLikelySelfEcho(msg: UnifiedChatMessage, statusByPlatform: Map<string, PlatformStatus>): boolean {
  const status = statusByPlatform.get(msg.platform);
  const channel = normalizeIdentity(status?.channel);
  if (!channel) return false;
  return [msg.username, msg.displayName, msg.channelId].some((value) => normalizeIdentity(value) === channel);
}

function canAppendToDuplicateSendGroup(
  group: UnifiedChatMessage[],
  msg: UnifiedChatMessage,
  groupablePlatformSet: Set<string>,
  statusByPlatform: Map<string, PlatformStatus>
): boolean {
  if (!groupablePlatformSet.has(msg.platform) || !isLikelySelfEcho(msg, statusByPlatform)) return false;

  const first = group[0];
  if (!first || !groupablePlatformSet.has(first.platform) || !isLikelySelfEcho(first, statusByPlatform)) return false;
  if (group.some((m) => m.platform === msg.platform)) return false;
  if (normalizeMessageText(first.message) !== normalizeMessageText(msg.message)) return false;

  return Math.abs(msg.timestamp - first.timestamp) <= GROUP_DUPLICATE_SEND_WINDOW_MS;
}

function buildChatRenderRows(
  messages: UnifiedChatMessage[],
  groupablePlatforms: string[],
  statusByPlatform: Map<string, PlatformStatus>
): ChatRenderRow[] {
  const groupablePlatformSet = new Set(groupablePlatforms);
  const rows: ChatRenderRow[] = [];

  for (const msg of messages) {
    if (!groupablePlatformSet.has(msg.platform) || !isLikelySelfEcho(msg, statusByPlatform)) {
      rows.push({ id: msg.id, messages: [msg] });
      continue;
    }

    let matchingRowIndex = -1;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (canAppendToDuplicateSendGroup(rows[i].messages, msg, groupablePlatformSet, statusByPlatform)) {
        matchingRowIndex = i;
        break;
      }
    }

    if (matchingRowIndex >= 0) {
      const messages = [...rows[matchingRowIndex].messages, msg];
      rows[matchingRowIndex] = {
        id: messages.map((m) => m.id).join('|'),
        messages,
      };
    } else {
      rows.push({ id: msg.id, messages: [msg] });
    }
  }

  return rows;
}

function RotatingChatIdentity({ messages }: { messages: UnifiedChatMessage[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const labels = messages.map(identityLabel);
  const active = messages[activeIndex % messages.length];

  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = window.setInterval(
      () => setActiveIndex((index) => (index + 1) % messages.length),
      ROTATING_IDENTITY_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <RotatingIdentityWrap
      aria-label={`Posted to ${labels.join(', ')}`}
      title={labels.join('\n')}
    >
      <PlatformBadge platform={active.platform} iconOnly />
      <RotatingIdentityText key={`${active.id}-${activeIndex}`}>
        {active.displayName}
      </RotatingIdentityText>
    </RotatingIdentityWrap>
  );
}

export function UnifiedChat({ messages, onSend, chatTarget, onTargetChange, onClear, platformStatuses, onModerate, onHideLocal }: Props) {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [modMenu, setModMenu] = useState<{ x: number; y: number; msg: UnifiedChatMessage } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Only platforms that are actually connected get tabs / send targets.
  const connectedPlatforms = [...new Set((platformStatuses ?? []).map((s) => s.platform))];
  const sendablePlatforms = [...new Set((platformStatuses ?? []).filter((s) => s.canSend).map((s) => s.platform))];
  const groupablePlatforms = [
    ...new Set((platformStatuses ?? []).filter((s) => s.chatConnected || s.canSend).map((s) => s.platform)),
  ];
  const statusByPlatform = new Map((platformStatuses ?? []).map((s) => [s.platform, s]));
  const sendTargets = sendablePlatforms.map((p) => ({ platform: p, name: statusByPlatform.get(p)?.channel ?? p }));
  const allTargetsTooltip = sendTargets.length
    ? 'Sends to ' + sendTargets.map((t) => `${platformLabel(t.platform)} (${t.name})`).join(', ')
    : 'All connected platforms';
  const activeFilter = filter !== 'all' && !connectedPlatforms.includes(filter) ? 'all' : filter;

  const visibleMessages =
    activeFilter === 'all' ? messages : messages.filter((m) => m.platform === activeFilter);
  const chatRows =
    activeFilter === 'all' && groupablePlatforms.length > 1
      ? buildChatRenderRows(visibleMessages, groupablePlatforms, statusByPlatform)
      : visibleMessages.map((msg) => ({ id: msg.id, messages: [msg] }));

  // Auto-scroll unless the streamer scrolled up to read history.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, filter]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const canSendAnything = platformStatuses ? sendablePlatforms.length > 0 : true;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === '/clear') {
      onClear?.();
      setInput('');
      return;
    }
    if (canSendAnything) {
      onSend(trimmed);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <ChatContainer>
      {connectedPlatforms.length > 0 && (
        <FilterTabs>
          <FilterTab $active={activeFilter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterTab>
          {connectedPlatforms.map((p) => (
            <FilterTab
              key={p}
              $active={activeFilter === p}
              $color={PLATFORM_TAB_COLORS[p]}
              onClick={() => setFilter(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </FilterTab>
          ))}
        </FilterTabs>
      )}
      {visibleMessages.length === 0 ? (
        <EmptyState>
          Chat from all connected platforms appears here.
          <br />
          Connect your channels on the Connections page.
        </EmptyState>
      ) : (
        <MessageList ref={listRef} onScroll={handleScroll}>
          {chatRows.map((row) => {
            const msg = row.messages[0];
            const isDuplicateSendGroup = row.messages.length > 1;

            return (
              <MessageRow
                key={row.id}
                onContextMenu={(e) => {
                  if (!onModerate && !onHideLocal) return;
                  e.preventDefault();
                  setModMenu({ x: e.clientX, y: e.clientY, msg });
                }}
              >
                {isDuplicateSendGroup ? (
                  <RotatingChatIdentity messages={row.messages} />
                ) : (
                  <>
                    <RoleIconWrap>
                      <PlatformBadge platform={msg.platform} iconOnly />
                    </RoleIconWrap>
                    {msg.isMod && (
                      <RoleIconWrap title="Moderator">
                        <ModIcon />
                      </RoleIconWrap>
                    )}
                    {msg.isVip && !msg.isMod && (
                      <RoleIconWrap title="VIP">
                        <VipIcon />
                      </RoleIconWrap>
                    )}
                    {msg.isSub && (
                      <RoleIconWrap title="Subscriber">
                        <SubIcon />
                      </RoleIconWrap>
                    )}
                    <Username $color={msg.userColor}>{msg.displayName}</Username>
                  </>
                )}
                <MessageText>
                  {msg.fragments
                    ? msg.fragments.map((frag, i) =>
                        frag.type === 'emote' && frag.url ? (
                          <EmoteImg key={i} src={frag.url} alt={frag.name} title={frag.name} />
                        ) : (
                          <span key={i}>{renderTextWithLinks(frag.text ?? '')}</span>
                        )
                      )
                    : renderTextWithLinks(msg.message)}
                </MessageText>
              </MessageRow>
            );
          })}
        </MessageList>
      )}
      <ChatInputRow>
        <TargetSelector>
          <span>Send to:</span>
          <TargetWrap title={chatTarget === 'all' ? allTargetsTooltip : undefined}>
            <TargetSelect
              value={chatTarget}
              onChange={(e) => onTargetChange(e.target.value as ChatTarget)}
            >
              <option value="all">All Platforms</option>
              {sendablePlatforms.map((p) => (
                <option key={p} value={p}>
                  {platformLabel(p)} only
                </option>
              ))}
            </TargetSelect>
          </TargetWrap>
        </TargetSelector>
        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={canSendAnything ? 'Type a message...' : 'Log in to a platform to send chat'}
          disabled={!canSendAnything}
        />
        <SendButton onClick={handleSend} disabled={!canSendAnything}>
          Send
        </SendButton>
      </ChatInputRow>
      {platformStatuses && !canSendAnything && (
        <SendHint>
          Reading chat works without login. To send + moderate, log in with Twitch, Kick, or YouTube on the Connections page.
        </SendHint>
      )}
      {modMenu && (onModerate || onHideLocal) && (() => {
        const { msg } = modMenu;
        const p = msg.platform;
        const label = p === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1);
        const canModeratePlatform =
          (platformStatuses?.some((s) => s.platform === p && s.canSend) ?? false) &&
          (p === 'twitch' || p === 'kick' || p === 'youtube');
        const items: (ContextMenuItem | 'separator')[] = [];
        if (onModerate) {
          if (canModeratePlatform) {
            // Kick has no single-message delete; YouTube has no in-app unban.
            if (p !== 'kick') {
              items.push({ label: `Delete message`, action: () => onModerate('delete', msg) }, 'separator');
            }
            items.push(
              { label: `Timeout ${msg.displayName} (10 min)`, action: () => onModerate('timeout-600', msg) },
              { label: `Timeout ${msg.displayName} (1 hour)`, action: () => onModerate('timeout-3600', msg) },
              'separator',
              { label: `Ban ${msg.displayName}`, action: () => onModerate('ban', msg), danger: true }
            );
            if (p !== 'youtube') {
              items.push({ label: `Unban ${msg.displayName}`, action: () => onModerate('unban', msg) });
            }
          } else if (p === 'twitch' || p === 'kick' || p === 'youtube') {
            items.push({
              label: `Log in with ${label} (Connections page) to moderate`,
              action: () => {},
              disabled: true,
            });
          } else {
            items.push({
              label: `Mod actions not available for ${label} yet`,
              action: () => {},
              disabled: true,
            });
          }
        }
        if (onHideLocal) {
          if (items.length) items.push('separator');
          items.push({ label: 'Remove from feed (local only)', action: () => onHideLocal(msg) });
        }
        return <ContextMenu x={modMenu.x} y={modMenu.y} items={items} onClose={() => setModMenu(null)} />;
      })()}
    </ChatContainer>
  );
}
