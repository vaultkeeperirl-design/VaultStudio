import { useCallback, useEffect, useState } from 'react';

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'error';

export type UpdateState = {
  phase: UpdatePhase;
  currentVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  error?: string;
};

/**
 * Shared in-app update state. Pass `{ auto: true }` to check once on mount
 * (used by the launch toast); the License settings panel drives it manually.
 * No-ops gracefully when the Electron bridge isn't present (web/test).
 */
export function useAppUpdate(options?: { auto?: boolean }) {
  const auto = options?.auto ?? false;
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });

  const check = useCallback(async () => {
    if (!vaultApi?.updates?.check) return;
    setState((s) => ({ ...s, phase: 'checking' }));
    try {
      const r = await vaultApi.updates.check();
      if (!r.ok) {
        setState({ phase: 'error', currentVersion: r.currentVersion, error: r.error });
        return;
      }
      setState({
        phase: r.updateAvailable ? 'available' : 'current',
        currentVersion: r.currentVersion,
        latestVersion: r.latestVersion,
        downloadUrl: r.downloadUrl,
      });
    } catch (e) {
      setState({ phase: 'error', error: e instanceof Error ? e.message : 'Update check failed' });
    }
  }, []);

  const openDownload = useCallback(async () => {
    if (state.downloadUrl && vaultApi?.updates?.openDownload) {
      await vaultApi.updates.openDownload(state.downloadUrl);
    }
  }, [state.downloadUrl]);

  useEffect(() => {
    if (auto) void check();
  }, [auto, check]);

  return { state, check, openDownload };
}
