import { useStudioStore } from '../../stores/studioStore';
import { mockScenes, mockAudioSources, mockChatMessages, mockActivityEvents, mockStats, mockOutputStats } from '../../mocks/mockData';

describe('studioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      scenes: [],
      audioSources: [],
      chatMessages: [],
      activityEvents: [],
      stats: { totalViewers: 0, platforms: [] },
      outputStats: null,
      activeSceneId: null,
      chatTarget: 'all',
    });
  });

  it('initializes with empty state', () => {
    const state = useStudioStore.getState();
    expect(state.scenes).toEqual([]);
    expect(state.chatMessages).toEqual([]);
    expect(state.activeSceneId).toBeNull();
  });

  it('sets scenes and active scene', () => {
    useStudioStore.getState().setScenes(mockScenes);
    const state = useStudioStore.getState();
    expect(state.scenes).toHaveLength(3);
    expect(state.activeSceneId).toBe('scene-1');
  });

  it('switches active scene', () => {
    useStudioStore.getState().setScenes(mockScenes);
    useStudioStore.getState().switchScene('scene-2');
    expect(useStudioStore.getState().activeSceneId).toBe('scene-2');
  });

  it('adds a chat message', () => {
    useStudioStore.getState().addChatMessage(mockChatMessages[0]);
    expect(useStudioStore.getState().chatMessages).toHaveLength(1);
  });

  it('adds an activity event', () => {
    useStudioStore.getState().addActivityEvent(mockActivityEvents[0]);
    expect(useStudioStore.getState().activityEvents).toHaveLength(1);
  });

  it('does not add duplicate activity events by id', () => {
    const event = mockActivityEvents[0];
    useStudioStore.getState().addActivityEvent(event);
    useStudioStore.getState().addActivityEvent(event);
    expect(useStudioStore.getState().activityEvents).toHaveLength(1);
  });

  it('sets chat target', () => {
    useStudioStore.getState().setChatTarget('twitch');
    expect(useStudioStore.getState().chatTarget).toBe('twitch');
  });

  it('sets audio sources', () => {
    useStudioStore.getState().setAudioSources(mockAudioSources);
    expect(useStudioStore.getState().audioSources).toHaveLength(3);
  });

  it('sets stats', () => {
    useStudioStore.getState().setStats(mockStats);
    expect(useStudioStore.getState().stats.totalViewers).toBe(37);
  });

  it('sets output stats', () => {
    useStudioStore.getState().setOutputStats(mockOutputStats);
    expect(useStudioStore.getState().outputStats?.isStreaming).toBe(true);
  });
});
