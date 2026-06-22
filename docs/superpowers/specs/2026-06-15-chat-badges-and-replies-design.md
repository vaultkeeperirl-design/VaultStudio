# Chat Badges and Reply Context — Design

Date: 2026-06-15
Status: Approved
Owner: VaultStudio

## 1. Problem

Chat in the unified panel currently shows three things before the username:
the platform badge, a hand-rolled moderator sword, a VIP diamond, and a
subscriber star. That is two problems:

1. **Roles are inaccurate.** The renderer infers moderator / VIP / sub from
   `isMod` / `isVip` / `isSub` booleans on `UnifiedChatMessage`. Twitch already
   sends a richer `badges` IRC tag (subscriber with tier, founder, sub-gifter,
   bits, premium, staff, broadcaster) and the renderer throws that data away.
   YouTube, Kick, and TikTok carry their own role data, none of which is
   surfaced today.

2. **Replies are invisible.** When `viewer_a` writes `@viewer_b lol` there is
   no way to tell, while reading the chat stream, that the message is aimed
   at `viewer_b` rather than the streamer or the room. The information is
   available from each platform's chat API/IRC tag and is being discarded.

Goal: show the real per-platform role badges inline, and show an inline
"replying to @user" prefix when one chatter is addressing another. Display
only — no changes to the send flow.

## 2. Non-goals

- No sender-side reply target UI. The chat input is unchanged.
- No new local badge artwork. If a platform does not send a badge URL, the
  existing local icon set is the fallback — nothing new is drawn.
- No new platform connections, OAuth flows, or auth scopes.
- No persistence of badge / reply state beyond the in-memory message buffer.

## 3. Data model

Extend `UnifiedChatMessage` in `src/types/index.ts`. The `badges` field
already exists on the type but is unused; this design changes its shape and
adds `replyParent`.

```ts
export type ChatBadge = {
  id: string;          // e.g. "subscriber", "founder", "bits/100", "premium"
  level?: number;      // tiered badges: sub tier 0-3, bits tier 100/1000/5000/10000/25000/50000/75000/100000
  url: string;         // absolute image URL
  title: string;       // hover label, e.g. "Subscriber (Tier 2)"
};

export type UnifiedChatMessage = {
  id: string;
  platform: Platform;
  channelId: string;
  username: string;
  displayName: string;
  userColor?: string;
  badges?: ChatBadge[];
  message: string;
  fragments?: ChatFragment[];
  timestamp: number;
  isMod?: boolean;
  isSub?: boolean;
  isVip?: boolean;
  replyParent?: {
    id: string;                // parent message id, best-effort
    displayName: string;       // "@user" label
    message?: string;          // reserved, not populated in v1
  };
};
```

`isMod` / `isVip` / `isSub` stay on the type for callers that want a quick
boolean, but the renderer no longer uses them to pick icons. They are
derived from the parsed `badges` array inside the connector.

## 4. Connector changes

A new module `electron/services/chat/badges.ts` owns per-platform badge
resolution. Each connector parses its native format and calls into this
module to normalize.

### 4.1 Twitch — `electron/services/chat/twitch-chat.ts`

IRC PRIVMSG tags carry the data:

- `badges=subscriber/2,bits/1000,premium/1`
- `badge-info=subscriber/6,bits/1000`  (months / bits amount)
- `@reply-parent-msg-id=<uuid>`  (Twitch chat replies since 2023)
- `@reply-parent-display-name=<name>`
- `@reply-parent-msg-body=<text>`  (may be omitted for deleted parents)

Parse both `badges` and `badge-info`, join on the same key, and resolve
through `resolveTwitchBadge(id, level, info)`:

- `subscriber` → `https://static-cdn.jtvnw.net/badges/v1/subscriber/{size}`,
  size = `1`/`2`/`3` matching `level` (0..3), title `Subscriber (Tier {level})`.
- `founder` → static badge `0`, title `Founder`.
- `sub-gifter/{N}` → `sub-gifter/{N}` badge, title `Sub Gifter ({N} gifts)`.
- `bits/{N}` where N ≥ 1 → `bits/{N}` badge, title `Cheerer (Level {tier})`
  where tier maps 1/100/1000/5000/10000/25000/50000/75000/100000.
- `premium/1` → Twitch Prime badge, title `Twitch Prime`.
- `broadcaster/1`, `moderator/1`, `vip/1`, `staff/1` → corresponding
  built-in badges with the same color and title.

Parse the `reply-parent-*` tags into `replyParent` with `id` from
`reply-parent-msg-id`, `displayName` from `reply-parent-display-name`
(without leading `@`), and `message` left undefined in v1.

### 4.2 YouTube — `electron/services/chat/youtube-chat.ts`

`LiveChatMessage.authorDetails` already includes role booleans
(`isChatModerator`, `isChatSponsor`, `isChatOwner`, `isVerified`).
`authorDetails.badgeThumbnailUrl` carries the official image. Map each
truthy boolean to a `ChatBadge`:

- `isChatOwner` → `id: "owner"`, `title: "Channel Owner"`, URL from
  `badgeThumbnailUrl`.
- `isChatModerator` → `id: "moderator"`, `title: "Moderator"`, URL.
- `isChatSponsor` → `id: "sponsor"`, `title: "Sponsor"`, URL.
- `isVerified` → `id: "verified"`, `title: "Verified"`, URL.

Reply parent: `LiveChatMessage.snippet.parentMessageId` →
`replyParent.id`. The display name is not in the snippet; resolve it by
holding a recent-message map (`messageId → displayName`) updated as
messages flow. If the parent is not in the map, set
`replyParent.displayName` to `"unknown"` and drop the `message` field.

YouTube badge URLs come directly from the API — `resolveYouTubeBadge`
passes the URL through without a CDN transformation.

### 4.3 Kick — `electron/services/chat/kick-chat.ts`

`App\\Events\\ChatMessageEvent` carries a `badges` array on the chatroom
author. Each entry is `{ type, text, count? }`. Map:

- `type === "subscriber"` → use `type` as id, look up image from
  `https://files.kick.com/badges/subscriber/image`; if the chat event
  supplies a thumbnail URL, prefer that. `title` = `Subscriber`
  (Kick does not expose tier).
- `type === "sub_gifter"` → id `sub-gifter`, title `Sub Gifter`.
- `type === "moderator"` → id `moderator`, title `Moderator`.
- `type === "broadcaster"` → id `broadcaster`, title `Broadcaster`.
- `type === "vip"` → id `vip`, title `VIP`.
- Unknown types are dropped.

Reply parent: Kick `ChatMessageEvent.metadata.original_message_id` (when
present) → `replyParent.id`. Display name is resolved from a local
recent-message map (same approach as YouTube).

### 4.4 TikTok — `electron/services/chat/tiktok-chat.ts`

TikTok's `WebcastChatMessage` is the least reliable. It carries a
`topGiftersInfo` block (the gifter top list is not a per-message badge) and
sometimes a `subscriber` flag. We do best-effort:

- If `msg.topGiftersInfo` includes the current user as top fan and the
  message comes from that user, add `id: "top-fan"`, `title: "Top Fan"`,
  local fallback icon only.
- If the user is a moderator (out-of-band: pre-known list, leave
  unconfigured for v1), add `id: "moderator"`, `title: "Moderator"`,
  local fallback icon only.
- `subscriber` flag, if present → `id: "subscriber"`, `title: "Subscriber"`,
  local fallback icon only.

No remote badge URL is stable enough to ship. The local icon set is the
authoritative visual for TikTok badges in v1.

Reply parent: TikTok exposes `parentMessageId` on `WebcastChatMessage` in
some regions. If present, populate `replyParent.id` and resolve the display
name from a recent-message map.

## 5. Renderer changes — `src/components/studio/UnifiedChat.tsx`

### 5.1 New components

- `src/components/common/RoleBadge.tsx` — renders a single badge. If the
  badge has a remote `url`, renders `<img>` with `onError` swapping to the
  fallback icon. If `url` is empty or `data:fallback`, renders the local
  icon directly. Props: `{ badge: ChatBadge; fallback: 'mod' | 'vip' | 'sub' }`.

- `src/components/common/RoleBadgeList.tsx` — maps `ChatBadge[]` →
  ordered list of `<RoleBadge>`. Order is fixed and authoritative:
  `broadcaster → staff → moderator → vip → founder → sub-gifter →
  subscriber → bits → premium → verified → sponsor → owner → top-fan`.
  Unknown ids append at the end in input order. Width 18px, vertical
  alignment middle, 2px gap.

- `src/components/studio/ReplyPrefix.tsx` — styled span:
  `↳ replying to @<displayName>` in `tokens.colors.muted`, font size
  `tokens.fontSize.xs`, inserted immediately before `Username` in the
  message row when `msg.replyParent` is set.

### 5.2 MessageRow update

Replace the `isMod` / `isVip` / `isSub` block (lines 266–280 of
`UnifiedChat.tsx`) with:

```tsx
<RoleIconWrap>
  <PlatformBadge platform={msg.platform} iconOnly />
</RoleIconWrap>
{msg.badges && msg.badges.length > 0 && (
  <RoleIconWrap>
    <RoleBadgeList badges={msg.badges} />
  </RoleIconWrap>
)}
{msg.replyParent && <ReplyPrefix parent={msg.replyParent} />}
<Username $color={msg.userColor}>{msg.displayName}</Username>
```

The local `ModIcon` / `VipIcon` / `SubIcon` are no longer rendered inline.
They move into `RoleBadge.tsx` as fallback graphics keyed by badge id.
`icons.tsx` keeps the components exported for that purpose.

### 5.3 Scrolling and layout

The message row stays `display: block` with `vertical-align: middle` on
children so wrapped text keeps badges on the first-line baseline. Badge
images are 18px tall; the existing `tokens.fontSize.sm` row height
absorbs that without extra padding.

## 6. Error handling

- **Image 404 / network error.** `RoleBadge` `onError` swaps to the local
  icon for the same `id`. We log once per (id, error-name) pair via
  `console.warn` in dev; no UI toast.
- **YouTube / Kick reply parent missing from recent-message map.** Render
  `↳ replying to @unknown` in muted color. This is ugly but it tells the
  reader "this is a reply, but I don't know who to" — strictly better
  than silence.
- **Twitch `reply-parent-display-name` malformed.** Drop the `replyParent`
  field; render the message normally.
- **Unknown badge id from any platform.** Render with a generic
  `data:image/svg+xml` placeholder or omit; never throw.

## 7. Testing

### 7.1 `electron/services/chat/badges.test.ts` (new)

- `resolveTwitchBadge('subscriber', 2)` returns CDN URL with `/2/`,
  title `Subscriber (Tier 2)`.
- `resolveTwitchBadge('bits', 1000)` returns `bits/1000`, title
  `Cheerer (Level 3)` (1 / 100 / 1k / 5k / 10k / 25k / 50k / 75k / 100k).
- `resolveTwitchBadge('founder', 0)` returns `founder/0`, title
  `Founder`.
- `resolveTwitchBadge('mystery', undefined)` returns `null` and the
  caller drops the badge.
- `resolveYouTubeBadge('https://yt3.ggpht.com/.../s28-c-k-c0x00ffffff-no-rj')`
  returns the same URL with title `Moderator` (passed by caller).

### 7.2 Twitch connector test (extend existing)

- `mapPrivmsg` with `badges=subscriber/2,bits/1000` and
  `badge-info=subscriber/6` produces two `ChatBadge` entries with
  correct URLs and titles.
- `mapPrivmsg` with `reply-parent-msg-id=abc-123` produces
  `replyParent: { id: 'abc-123', displayName: 'viewer_b' }`.

### 7.3 Renderer test (extend `UnifiedChat.test.tsx`)

- Message with `badges: [{ id: 'subscriber', level: 2, url: '...', title: 'Subscriber (Tier 2)' }]`
  renders the badge image.
- Message with `replyParent: { id: 'x', displayName: 'viewer_b' }`
  renders `<ReplyPrefix>` with the text `↳ replying to @viewer_b`.
- A badge image that fires `onError` swaps to the local `SubIcon` for the
  same id.

## 8. Sequencing

The implementation plan is split into three independent phases so a reviewer
can land them in any order, but the recommended order is:

1. **Types + connector** — extend `UnifiedChatMessage`, add
   `electron/services/chat/badges.ts`, wire each connector to populate
   `badges` and `replyParent`. Tests at the unit level.
2. **Renderer components** — `RoleBadge`, `RoleBadgeList`, `ReplyPrefix`.
   Unit tests with synthetic messages.
3. **Integration in `UnifiedChat.tsx`** — swap the message row, keep the
   existing scroll/filter/mod-menu logic intact. Update the renderer test
   to assert the new layout.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Twitch changes badge URL format again | Resolver is one file; tests pin the exact URL strings |
| YouTube `badgeThumbnailUrl` is missing for some roles | Role is still detected via boolean, badge renders as a colored box with the role letter |
| Kick `original_message_id` is unstable across Pusher versions | Reply is best-effort; missing parent falls back to `@unknown` |
| TikTok reply data is region-locked | v1 silently omits reply prefix for TikTok when `parentMessageId` is absent |
| Image fetches fail in offline streams | `onError` fallback to local icon is immediate; no retry, no toast |
| More badges per message = wider row, pushing the username right | Cap at the first 4 badges in `RoleBadgeList`; collapse the rest into a small `+N` chip |

## 10. Open questions

None at design time. Implementation may surface two:

- Should the `+N` collapse chip be a tooltip listing the rest, or just a
  counter? Default to a counter for v1.
- Should `ReplyPrefix` link to the parent message in the chat history if it
  is still in the buffer? Default to no in v1; messages scroll out of the
  buffer quickly.
