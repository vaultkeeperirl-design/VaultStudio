/**
 * Multistream support.
 *
 * Streaming is natively multi-target: the engine fans one encode out to every
 * enabled target (no plugin, no per-target re-encode). This module keeps the
 * platform ingest presets and the one-time import of targets from an old
 * obs-multi-rtmp setup, so streamers migrating from OBS keep their endpoints.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { obsEngine } from './obs-engine';
import { store, type StreamTarget, type StreamTargetPlatform } from './store';

export const PLATFORM_SERVERS: Record<StreamTargetPlatform, string> = {
  twitch: 'rtmp://live.twitch.tv/app',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net',
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  custom: '',
};

function obsBasePath(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'obs-studio');
}

function currentProfile(): string {
  try {
    const content = fs.readFileSync(path.join(obsBasePath(), 'global.ini'), 'utf-8');
    return content.match(/Profile=(.+)/)?.[1]?.trim() || 'Untitled';
  } catch {
    return 'Untitled';
  }
}

/** Import targets from an OBS Studio obs-multi-rtmp install (one-time migration). */
export function importTargetsFromObs(): StreamTarget[] {
  const profilesDir = path.join(obsBasePath(), 'basic', 'profiles');
  const candidates = [currentProfile()];
  try {
    for (const dir of fs.readdirSync(profilesDir)) {
      if (!candidates.includes(dir)) candidates.push(dir);
    }
  } catch {
    return [];
  }

  for (const profile of candidates) {
    try {
      const file = path.join(profilesDir, profile, 'obs-multi-rtmp.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));
      const targets: StreamTarget[] = (data.targets || []).map(
        (t: { id?: string; name?: string; 'service-param'?: { server?: string; key?: string } }, idx: number) => {
          const server = t['service-param']?.server || '';
          const name = (t.name || `Target ${idx + 1}`).toLowerCase();
          let platform: StreamTargetPlatform = 'custom';
          if (server.includes('twitch') || name.includes('twitch')) platform = 'twitch';
          else if (server.includes('live-video.net') || name.includes('kick')) platform = 'kick';
          else if (server.includes('youtube') || name.includes('youtube')) platform = 'youtube';
          return {
            id: t.id || `imported-${Date.now()}-${idx}`,
            name: t.name || `Target ${idx + 1}`,
            platform,
            server,
            streamKey: t['service-param']?.key || '',
            enabled: true,
          };
        }
      );
      if (targets.length > 0) return targets;
    } catch {
      /* try next profile */
    }
  }
  return [];
}

/**
 * Targets are read directly from the store at stream start, so "applying"
 * only needs to communicate when they take effect.
 */
export async function applyTargets(): Promise<{ ok: boolean; error?: string }> {
  if (!obsEngine.isInitialized()) return { ok: true };
  const stats = await obsEngine.getOutputStats();
  if (stats.isStreaming) {
    return { ok: true, error: 'Targets saved — they apply the next time you go live.' };
  }
  return { ok: true };
}
