import { contextBridge, ipcRenderer } from 'electron';

type Listener = (...args: unknown[]) => void;
const listenerMap = new Map<Listener, (e: unknown, ...args: unknown[]) => void>();

contextBridge.exposeInMainWorld('vaultstudio', {
  obs: {
    getConnectionState: () => ipcRenderer.invoke('obs:getConnectionState'),
    getProfiles: () => ipcRenderer.invoke('obs:getProfiles'),
    setProfile: (name: string) => ipcRenderer.invoke('obs:setProfile', name),
    launchObs: () => ipcRenderer.invoke('obs:launchObs'),
    stopEngine: () => ipcRenderer.invoke('obs:stopEngine'),
    getScenes: () => ipcRenderer.invoke('obs:getScenes'),
    createScene: (name: string) => ipcRenderer.invoke('obs:createScene', name),
    deleteScene: (id: string) => ipcRenderer.invoke('obs:deleteScene', id),
    switchScene: (id: string) => ipcRenderer.invoke('obs:switchScene', id),
    renameScene: (id: string, name: string) => ipcRenderer.invoke('obs:renameScene', id, name),
    duplicateScene: (id: string) => ipcRenderer.invoke('obs:duplicateScene', id),
    setSceneIndex: (id: string, index: number) => ipcRenderer.invoke('obs:setSceneIndex', id, index),
    renameSource: (sceneId: string, sourceName: string, name: string) =>
      ipcRenderer.invoke('obs:renameSource', sceneId, sourceName, name),
    moveSource: (sceneId: string, sourceId: string, direction: string) =>
      ipcRenderer.invoke('obs:moveSource', sceneId, sourceId, direction),
    setSourceIndex: (sceneId: string, sourceId: string, index: number) =>
      ipcRenderer.invoke('obs:setSourceIndex', sceneId, sourceId, index),
    setSourceLocked: (sceneId: string, sourceId: string, locked: boolean) =>
      ipcRenderer.invoke('obs:setSourceLocked', sceneId, sourceId, locked),
    setSourceTransform: (sceneId: string, sourceId: string, transform: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:setSourceTransform', sceneId, sourceId, transform),
    toggleVirtualCam: () => ipcRenderer.invoke('obs:toggleVirtualCam'),
    clipReplay: () => ipcRenderer.invoke('obs:clipReplay'),
    getSources: (sceneId: string) => ipcRenderer.invoke('obs:getSources', sceneId),
    addSource: (sceneId: string, type: string, settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:addSource', sceneId, type, settings),
    listSourceDevices: (type: string) => ipcRenderer.invoke('obs:listSourceDevices', type),
    removeSource: (sceneId: string, sourceId: string) =>
      ipcRenderer.invoke('obs:removeSource', sceneId, sourceId),
    setSourceVisible: (sceneId: string, sourceId: string, visible: boolean) =>
      ipcRenderer.invoke('obs:setSourceVisible', sceneId, sourceId, visible),
    updateSourceSettings: (sourceId: string, settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:updateSourceSettings', sourceId, settings),
    syncDrawingOverlay: (imageDataUrl: string, hasDrawing: boolean) =>
      ipcRenderer.invoke('obs:syncDrawingOverlay', imageDataUrl, hasDrawing),
    startStreaming: () => ipcRenderer.invoke('obs:startStreaming'),
    stopStreaming: () => ipcRenderer.invoke('obs:stopStreaming'),
    startRecording: (path: string) => ipcRenderer.invoke('obs:startRecording', path),
    stopRecording: () => ipcRenderer.invoke('obs:stopRecording'),
    getOutputStats: () => ipcRenderer.invoke('obs:getOutputStats'),
    getAvailableEncoders: () => ipcRenderer.invoke('obs:getAvailableEncoders'),
    getActiveEncoder: () => ipcRenderer.invoke('obs:getActiveEncoder'),
    getAudioSources: () => ipcRenderer.invoke('obs:getAudioSources'),
    setVolume: (sourceId: string, volume: number) =>
      ipcRenderer.invoke('obs:setVolume', sourceId, volume),
    setMuted: (sourceId: string, muted: boolean) =>
      ipcRenderer.invoke('obs:setMuted', sourceId, muted),
    getSettings: () => ipcRenderer.invoke('obs:getSettings'),
    updateSettings: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:updateSettings', settings),
  },
  preview: {
    start: (options?: Record<string, unknown>) => ipcRenderer.invoke('preview:start', options),
    stop: () => ipcRenderer.invoke('preview:stop'),
  },
  targets: {
    list: () => ipcRenderer.invoke('targets:list'),
    platformServers: () => ipcRenderer.invoke('targets:platformServers'),
    add: (target: Record<string, unknown>) => ipcRenderer.invoke('targets:add', target),
    update: (target: Record<string, unknown>) => ipcRenderer.invoke('targets:update', target),
    remove: (id: string) => ipcRenderer.invoke('targets:remove', id),
    importFromObs: () => ipcRenderer.invoke('targets:import'),
    apply: () => ipcRenderer.invoke('targets:apply'),
  },
  platforms: {
    getConnections: () => ipcRenderer.invoke('platforms:getConnections'),
    connect: (connection: Record<string, unknown>) => ipcRenderer.invoke('platforms:connect', connection),
    disconnect: (platform: string) => ipcRenderer.invoke('platforms:disconnect', platform),
    oauthLogin: (platform: string) => ipcRenderer.invoke('platforms:oauthLogin', platform),
    oauthLogout: (platform: string) => ipcRenderer.invoke('platforms:oauthLogout', platform),
    getStats: () => ipcRenderer.invoke('platforms:getStats'),
    setDashboardEnabled: (platform: string, enabled: boolean) =>
      ipcRenderer.invoke('platforms:setDashboardEnabled', platform, enabled),
  },
  chat: {
    sendMessage: (message: string, target: string) =>
      ipcRenderer.invoke('chat:sendMessage', message, target),
    hideLocal: (messageId: string) => ipcRenderer.invoke('chat:hideLocal', messageId),
    getHistory: () => ipcRenderer.invoke('chat:getHistory'),
    moderate: (action: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('chat:moderate', action, opts),
    clearHistory: () => ipcRenderer.invoke('chat:clearHistory'),
  },
  guard: {
    get: () => ipcRenderer.invoke('guard:get'),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke('guard:update', patch),
  },
  irl: {
    get: () => ipcRenderer.invoke('irl:get'),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke('irl:update', patch),
    setupScenes: () => ipcRenderer.invoke('irl:setupScenes'),
  },
  layout: {
    get: () => ipcRenderer.invoke('layout:get'),
    save: (layout: unknown) => ipcRenderer.invoke('layout:save', layout),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:update', settings),
  },
  chatPopout: {
    get: () => ipcRenderer.invoke('chatPopout:get'),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke('chatPopout:update', patch),
    show: () => ipcRenderer.invoke('chatPopout:show'),
    hide: () => ipcRenderer.invoke('chatPopout:hide'),
  },
  license: {
    getInfo: () => ipcRenderer.invoke('license:getInfo'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    buyPro: () => ipcRenderer.invoke('license:buyPro'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    openDownload: (url: string) => ipcRenderer.invoke('updates:openDownload', url),
  },
  files: {
    selectImage: () => ipcRenderer.invoke('files:selectImage'),
    selectMedia: () => ipcRenderer.invoke('files:selectMedia'),
    selectVideo: () => ipcRenderer.invoke('files:selectVideo'),
    selectAudio: () => ipcRenderer.invoke('files:selectAudio'),
    selectPlaylist: () => ipcRenderer.invoke('files:selectPlaylist'),
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  on: (event: string, callback: Listener) => {
    const wrapper = (_e: unknown, ...args: unknown[]) => callback(...args);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on(event, wrapper);
  },
  off: (event: string, callback: Listener) => {
    const wrapper = listenerMap.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener(event, wrapper);
      listenerMap.delete(callback);
    }
  },
});
