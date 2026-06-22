/**
 * YouTube Data API v3 helpers for authenticated actions (OAuth bearer token,
 * scope youtube.force-ssl): resolve the user's active live chat, send messages,
 * delete messages, and ban/timeout users. Used by youtube-mod (moderation) and
 * by the YouTube chat connector when reading via OAuth instead of an API key.
 */
const YT_API = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${YT_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `YouTube API error ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) message = `YouTube: ${err.error.message}`;
    } catch {
      /* keep status message */
    }
    if (res.status === 401 || res.status === 403) {
      message += ' — reconnect YouTube on the Connections page';
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

/** The signed-in user's active broadcast live-chat id (mine=true). */
export async function resolveLiveChatId(token: string): Promise<string | null> {
  const data = (await ytFetch(
    token,
    'GET',
    '/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all&mine=true'
  )) as { items?: { snippet?: { liveChatId?: string } }[] };
  return data?.items?.[0]?.snippet?.liveChatId || null;
}

/** The signed-in user's channel (id + title), for display + read fallback. */
export async function getYouTubeSelf(token: string): Promise<{ channelId: string; title: string }> {
  const data = (await ytFetch(token, 'GET', '/channels?part=snippet&mine=true')) as {
    items?: { id: string; snippet?: { title?: string } }[];
  };
  const self = data?.items?.[0];
  if (!self?.id) throw new Error('Could not resolve your YouTube channel');
  return { channelId: self.id, title: self.snippet?.title || self.id };
}

export async function youtubeSendMessage(
  token: string,
  liveChatId: string,
  text: string
): Promise<void> {
  await ytFetch(token, 'POST', '/liveChat/messages?part=snippet', {
    snippet: {
      liveChatId,
      type: 'textMessageEvent',
      textMessageDetails: { messageText: text },
    },
  });
}

export async function youtubeDeleteMessage(token: string, messageId: string): Promise<void> {
  await ytFetch(token, 'DELETE', `/liveChat/messages?id=${encodeURIComponent(messageId)}`);
}

/** Ban (no duration) or timeout (banDurationSeconds) a viewer by channel id. */
export async function youtubeBan(
  token: string,
  liveChatId: string,
  bannedChannelId: string,
  durationSec?: number
): Promise<void> {
  await ytFetch(token, 'POST', '/liveChat/bans?part=snippet', {
    snippet: {
      liveChatId,
      type: durationSec ? 'temporary' : 'permanent',
      ...(durationSec ? { banDurationSeconds: Math.max(1, durationSec) } : {}),
      bannedUserDetails: { channelId: bannedChannelId },
    },
  });
}

export type YouTubeChatPage = {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: {
    id: string;
    authorDetails: { channelId: string; displayName: string; isChatModerator: boolean; isChatSponsor: boolean };
    snippet: { displayMessage?: string; publishedAt: string; superChatDetails?: { amountMicros: string; userComment?: string } };
  }[];
};

/** Read recent live-chat messages with an OAuth token (no API key needed). */
export async function youtubePollMessages(
  token: string,
  liveChatId: string,
  pageToken?: string
): Promise<YouTubeChatPage> {
  let path = `/liveChat/messages?part=snippet,authorDetails&liveChatId=${encodeURIComponent(liveChatId)}`;
  if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
  return (await ytFetch(token, 'GET', path)) as YouTubeChatPage;
}
