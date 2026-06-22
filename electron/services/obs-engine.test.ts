import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/vaultstudio'),
  },
}));

vi.mock('./store', () => ({
  store: {
    getSettings: vi.fn(() => ({})),
  },
}));

import {
  buildSourceSettingsForPlatform,
  getAppTypeToKindForPlatform,
  getSourceDevicePropertyForPlatform,
  mapSourceKind,
} from './obs-engine';

describe('obs engine platform source mapping', () => {
  it('uses OBS source ids native to each packaged platform', () => {
    expect(getAppTypeToKindForPlatform('win32', 'camera')).toBe('dshow_input');
    expect(getAppTypeToKindForPlatform('win32', 'audio_output')).toBe('wasapi_output_capture');
    expect(getAppTypeToKindForPlatform('darwin', 'camera')).toBe('av_capture_input');
    expect(getAppTypeToKindForPlatform('darwin', 'audio_output')).toBe('coreaudio_output_capture');
    expect(getAppTypeToKindForPlatform('linux', 'camera')).toBe('v4l2_input');
    expect(getAppTypeToKindForPlatform('linux', 'audio_output')).toBe('pulse_output_capture');
  });

  it('asks each platform camera plugin for the right device property', () => {
    expect(getSourceDevicePropertyForPlatform('win32', 'camera')).toBe('video_device_id');
    expect(getSourceDevicePropertyForPlatform('darwin', 'camera')).toBe('device');
    expect(getSourceDevicePropertyForPlatform('linux', 'camera')).toBe('device_id');
  });

  it('writes camera settings with the selected platform property name', () => {
    expect(buildSourceSettingsForPlatform('win32', 'camera', { deviceId: 'cam-win' })).toMatchObject({
      video_device_id: 'cam-win',
    });
    expect(buildSourceSettingsForPlatform('darwin', 'camera', { deviceId: 'cam-mac' })).toMatchObject({
      device: 'cam-mac',
    });
    expect(buildSourceSettingsForPlatform('linux', 'camera', { deviceId: 'cam-linux' })).toMatchObject({
      device_id: 'cam-linux',
    });
  });

  it('maps native capture kinds back to the app source types', () => {
    expect(mapSourceKind('coreaudio_input_capture')).toBe('audio_input');
    expect(mapSourceKind('pulse_output_capture')).toBe('audio_output');
    expect(mapSourceKind('pipewire-screen-capture-source')).toBe('display_capture');
    expect(mapSourceKind('text_ft2_source')).toBe('text');
  });
});
