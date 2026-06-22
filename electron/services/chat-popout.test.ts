import { describe, expect, it } from 'vitest';
import {
  clampChatPopoutOpacity,
  getEffectiveChatPopoutWindowOpacity,
  normalizeChatPopoutConfig,
} from './chat-popout';

describe('chat popout settings', () => {
  it('defaults to enabled with a readable transparent opacity', () => {
    expect(normalizeChatPopoutConfig(undefined)).toEqual({ enabled: true, opacity: 0.88, solidBackground: false });
  });

  it('clamps opacity so the overlay stays readable over games', () => {
    expect(clampChatPopoutOpacity(0.1)).toBe(0.35);
    expect(clampChatPopoutOpacity(0.74)).toBe(0.74);
    expect(clampChatPopoutOpacity(2)).toBe(1);
    expect(clampChatPopoutOpacity('bad')).toBe(0.88);
  });

  it('uses true window opacity when solid background is enabled', () => {
    expect(getEffectiveChatPopoutWindowOpacity({ enabled: true, opacity: 0.55, solidBackground: false })).toBe(0.55);
    expect(getEffectiveChatPopoutWindowOpacity({ enabled: true, opacity: 0.55, solidBackground: true })).toBe(1);
  });
});
