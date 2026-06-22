import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StudioPage } from './pages/StudioPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SplashScreen } from './components/SplashScreen';
import { ChatPopoutPage } from './pages/ChatPopoutPage';
import { ChangelogModal } from './components/ChangelogModal';
import { UpdateToast } from './components/UpdateToast';

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

const SPLASH_MIN_MS = 2200;
const SPLASH_MAX_MS = 20000;

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.5.1';

export function App() {
  const [obsState, setObsState] = useState<string>('disconnected');
  const [splashMinMet, setSplashMinMet] = useState(false);
  const [splashMaxMet, setSplashMaxMet] = useState(false);
  const [version] = useState(APP_VERSION);
  const [showChangelog, setShowChangelog] = useState(false);
  const [dontShowChangelogAgain, setDontShowChangelogAgain] = useState(false);
  const changelogPromptChecked = useRef(false);
  const isChatPopoutRoute =
    typeof window !== 'undefined' && window.location.hash.startsWith('#/chat-popout');

  useEffect(() => {
    if (!vaultApi || isChatPopoutRoute) return;

    // Catch up on current state — the engine may already be connected
    // before this listener attaches (events sent pre-mount are lost).
    vaultApi.obs.getConnectionState().then(({ state }) => setObsState(state));

    const onObsStatus = (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        setObsState(args[0]);
      }
    };
    vaultApi.on('obs:status', onObsStatus);

    return () => {
      vaultApi.off('obs:status', onObsStatus);
    };
  }, [isChatPopoutRoute]);

  // Show splash for at least SPLASH_MIN_MS, never longer than SPLASH_MAX_MS.
  useEffect(() => {
    const minTimer = setTimeout(() => setSplashMinMet(true), SPLASH_MIN_MS);
    const maxTimer = setTimeout(() => setSplashMaxMet(true), SPLASH_MAX_MS);
    return () => { clearTimeout(minTimer); clearTimeout(maxTimer); };
  }, []);

  const getStatusMessage = () => {
    switch (obsState) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting to engine...';
      case 'obs-not-running': return 'Starting engine...';
      default: return 'Initializing...';
    }
  };

  const appReady = splashMinMet && (!vaultApi || obsState === 'connected' || splashMaxMet);
  const changelogDismissKey = `vaultstudio:changelog-dismissed:${version}`;

  useEffect(() => {
    if (isChatPopoutRoute || !appReady || changelogPromptChecked.current) return;
    changelogPromptChecked.current = true;

    try {
      if (window.localStorage.getItem(changelogDismissKey) !== 'true') {
        setShowChangelog(true);
      }
    } catch {
      setShowChangelog(true);
    }
  }, [appReady, changelogDismissKey, isChatPopoutRoute]);

  const closeChangelog = () => {
    if (dontShowChangelogAgain) {
      try {
        window.localStorage.setItem(changelogDismissKey, 'true');
      } catch {
        // Ignore storage failures; the changelog remains dismissible for this session.
      }
    }
    setShowChangelog(false);
  };

  // Splash stays visible until the minimum display time passes and the engine is connected,
  // with a hard cap so users can still reach the studio if hardware init stalls.
  if (isChatPopoutRoute) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/chat-popout" element={<ChatPopoutPage />} />
        </Routes>
      </HashRouter>
    );
  }

  if (!appReady) {
    return <SplashScreen version={version} status={getStatusMessage()} />;
  }

  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/" element={<StudioPage />} />
          <Route path="/settings" element={<Navigate to="/settings/stream" replace />} />
          <Route path="/settings/:section" element={<SettingsLayout />} />
          {/* Back-compat redirects for the old standalone pages */}
          <Route path="/connections" element={<Navigate to="/settings/connections" replace />} />
          <Route path="/targets" element={<Navigate to="/settings/destinations" replace />} />
        </Routes>
      </HashRouter>
      <ChangelogModal
        open={showChangelog}
        onClose={closeChangelog}
        showDontShowAgain
        dontShowAgain={dontShowChangelogAgain}
        onDontShowAgainChange={setDontShowChangelogAgain}
      />
      <UpdateToast />
    </>
  );
}
