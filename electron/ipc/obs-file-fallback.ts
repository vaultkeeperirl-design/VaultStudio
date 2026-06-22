/**
 * Read-only fallback when OBS is not running: parses the OBS profile and
 * scene-collection files on disk so the studio still shows the user's scenes,
 * sources, and output settings (view-only) before OBS is launched.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SOURCE_TYPE_MAP: Record<string, string> = {
  monitor_capture: 'display_capture',
  game_capture: 'display_capture',
  dshow_input: 'camera',
  browser_source: 'browser',
  image_source: 'image',
  ffmpeg_source: 'media',
  text_gdiplus: 'browser',
  text_gdiplus_v2: 'browser',
  color_source: 'image',
  color_source_v3: 'image',
  media_playlist_source_codeyan: 'media',
  slideshow: 'image',
  wasapi_output_capture: 'audio_output',
  wasapi_input_capture: 'audio_input',
  scene: 'scene',
};

function getObsBasePath(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'obs-studio');
}

export function readGlobalIni(): { profile: string; sceneCollection: string } {
  try {
    const content = fs.readFileSync(path.join(getObsBasePath(), 'global.ini'), 'utf-8');
    return {
      profile: content.match(/Profile=(.+)/)?.[1]?.trim() || 'Untitled',
      sceneCollection: content.match(/SceneCollection=(.+)/)?.[1]?.trim() || 'Untitled',
    };
  } catch {
    return { profile: 'Untitled', sceneCollection: 'Untitled' };
  }
}

export function readBasicIni(profileName: string) {
  const iniPath = path.join(getObsBasePath(), 'basic', 'profiles', profileName, 'basic.ini');
  try {
    const content = fs.readFileSync(iniPath, 'utf-8');
    const getVal = (section: string, key: string): string | undefined => {
      const sectionMatch = content.match(new RegExp(`\\[${section}\\]`, 'i'));
      if (!sectionMatch) return undefined;
      const afterSection = content.substring(content.indexOf(sectionMatch[0]) + sectionMatch[0].length);
      const nextSection = afterSection.indexOf('\n[');
      const block = nextSection === -1 ? afterSection : afterSection.substring(0, nextSection);
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().startsWith(key.toLowerCase() + '=')) {
          return trimmed.substring(key.length + 1);
        }
      }
      return undefined;
    };
    return {
      outputCX: parseInt(getVal('Video', 'OutputCX') || '1920', 10),
      outputCY: parseInt(getVal('Video', 'OutputCY') || '1080', 10),
      fps: parseInt(getVal('Video', 'FPSCommon') || '60', 10),
      vbitrate: parseInt(getVal('SimpleOutput', 'VBitrate') || '4500', 10),
      abitrate: parseInt(getVal('SimpleOutput', 'ABitrate') || '160', 10),
      streamEncoder: getVal('SimpleOutput', 'StreamEncoder') || 'x264',
      filePath: getVal('SimpleOutput', 'FilePath') || path.join(os.homedir(), 'Videos'),
    };
  } catch {
    return {
      outputCX: 1920,
      outputCY: 1080,
      fps: 60,
      vbitrate: 4500,
      abitrate: 160,
      streamEncoder: 'x264',
      filePath: path.join(os.homedir(), 'Videos'),
    };
  }
}

type ObsSource = {
  name: string;
  uuid: string;
  id: string;
  settings: Record<string, unknown>;
  enabled: boolean;
  muted: boolean;
  volume?: number;
  mixers?: number;
};

type ObsSceneItem = { name: string; source_uuid: string; visible: boolean };

function readSceneCollection(): {
  sources: ObsSource[];
  sceneOrder: { name: string }[];
  currentScene: string;
} | null {
  const { sceneCollection } = readGlobalIni();
  try {
    const content = fs.readFileSync(
      path.join(getObsBasePath(), 'basic', 'scenes', `${sceneCollection}.json`),
      'utf-8'
    );
    const data = JSON.parse(content);
    return {
      sources: data.sources || [],
      sceneOrder: data.scene_order || [],
      currentScene: data.current_program_scene || data.current_scene || '',
    };
  } catch {
    return null;
  }
}

export function getScenesFromFiles() {
  const data = readSceneCollection();
  if (!data) return [];
  return data.sceneOrder
    .map((item) => {
      const sceneSrc = data.sources.find((s) => s.name === item.name && s.id === 'scene');
      if (!sceneSrc) return null;
      const sceneItems = ((sceneSrc.settings?.items as unknown) as ObsSceneItem[]) || [];
      const sources = sceneItems
        .map((sceneItem) => {
          const def = data.sources.find((s) => s.name === sceneItem.name && s.id !== 'scene');
          if (!def) return null;
          return {
            id: def.name,
            name: def.name,
            type: SOURCE_TYPE_MAP[def.id] || 'browser',
            visible: sceneItem.visible,
            settings: def.settings || {},
          };
        })
        .filter(Boolean);
      return {
        id: item.name,
        name: item.name,
        isActive: item.name === data.currentScene,
        sources,
      };
    })
    .filter(Boolean);
}

export function getAudioSourcesFromFiles() {
  const data = readSceneCollection();
  if (!data) return [];
  return data.sources
    .filter((s) => s.id === 'wasapi_output_capture' || s.id === 'wasapi_input_capture')
    .map((src) => ({
      id: src.name,
      name: src.name,
      volume: src.volume ?? 1.0,
      muted: src.muted ?? false,
      meterLevel: 0,
    }));
}

export function getSettingsFromFiles() {
  const { profile } = readGlobalIni();
  const ini = readBasicIni(profile);
  return {
    outputResolution: `${ini.outputCX}x${ini.outputCY}`,
    fps: ini.fps,
    videoBitrate: ini.vbitrate,
    encoder: ini.streamEncoder,
    audioBitrate: ini.abitrate,
    recordingPath: ini.filePath,
  };
}
