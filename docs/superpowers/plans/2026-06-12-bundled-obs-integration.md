# Bundled OBS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle OBS Studio binaries with VaultStudio, launch OBS as a managed child process, and show an animated splash screen during boot.

**Architecture:** OBS binaries live in `vendor/obs-studio/`, copied to a portable profile on first launch. A new `obs-bundler.ts` service manages the OBS process lifecycle. The renderer shows a splash screen with animated logo LEDs until OBS connects via obs-websocket.

**Tech Stack:** TypeScript, Electron, React, styled-components, obs-websocket protocol

---

## File Structure

| File | Purpose |
|------|---------|
| `electron/services/obs-bundler.ts` | NEW: Manages OBS binary bundling, process lifecycle, crash recovery |
| `electron/services/obs-bundler.test.ts` | NEW: Unit tests for bundler logic |
| `src/components/SplashScreen.tsx` | NEW: Animated logo splash with LED loader and version info |
| `src/components/SplashScreen.test.tsx` | NEW: Component tests for splash screen |
| `electron/main.ts` | MODIFY: Use obs-bundler instead of findObsExe() |
| `src/App.tsx` | MODIFY: Show splash while OBS connects |
| `.gitignore` | MODIFY: Add vendor/obs-studio/ |
| `electron-builder.yml` | MODIFY: Include vendor folder in installer |

---

### Task 1: OBS Bundler Service - Core Types and Config

**Files:**
- Create: `electron/services/obs-bundler.ts`
- Create: `electron/services/obs-bundler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// electron/services/obs-bundler.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ObsBundler, generatePassword } from './obs-bundler';

describe('ObsBundler', () => {
  const testDir = path.join(os.tmpdir(), 'vaultstudio-test-' + Date.now());
  const vendorDir = path.join(testDir, 'vendor');
  const portableDir = path.join(testDir, 'portable');

  beforeEach(() => {
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.mkdirSync(path.join(vendorDir, 'bin', '64bit'), { recursive: true });
    fs.mkdirSync(path.join(vendorDir, 'obs-plugins', '64bit'), { recursive: true });
    fs.mkdirSync(path.join(vendorDir, 'data'), { recursive: true });
    // Create dummy obs64.exe
    fs.writeFileSync(path.join(vendorDir, 'bin', '64bit', 'obs64.exe'), 'dummy');
    fs.writeFileSync(path.join(vendorDir, 'obs-plugins', '64bit', 'obs-websocket.dll'), 'dummy');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generatePassword', () => {
    it('should generate a 16-character password', () => {
      const password = generatePassword();
      expect(password).toHaveLength(16);
    });

    it('should generate unique passwords', () => {
      const p1 = generatePassword();
      const p2 = generatePassword();
      expect(p1).not.toBe(p2);
    });
  });

  describe('copyVendorToPortable', () => {
    it('should copy vendor directory to portable location', async () => {
      const bundler = new ObsBundler(vendorDir, portableDir);
      await bundler.copyVendorToPortable();
      
      expect(fs.existsSync(path.join(portableDir, 'bin', '64bit', 'obs64.exe'))).toBe(true);
      expect(fs.existsSync(path.join(portableDir, 'obs-plugins', '64bit', 'obs-websocket.dll'))).toBe(true);
    });

    it('should not copy if portable directory already exists', async () => {
      fs.mkdirSync(portableDir, { recursive: true });
      fs.writeFileSync(path.join(portableDir, 'existing-file.txt'), 'keep me');
      
      const bundler = new ObsBundler(vendorDir, portableDir);
      await bundler.copyVendorToPortable();
      
      expect(fs.existsSync(path.join(portableDir, 'existing-file.txt'))).toBe(true);
    });
  });

  describe('writeObsConfig', () => {
    it('should write config.json with generated password', async () => {
      const bundler = new ObsBundler(vendorDir, portableDir);
      await bundler.copyVendorToPortable();
      
      const config = await bundler.writeObsConfig();
      
      expect(config.server_port).toBe(4455);
      expect(config.auth_required).toBe(true);
      expect(config.server_password).toHaveLength(16);
      expect(config.server_enabled).toBe(true);
      
      const configPath = path.join(portableDir, 'config', 'obs-websocket', 'config.json');
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig).toEqual(config);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- electron/services/obs-bundler.test.ts`
Expected: FAIL with "Cannot find module './obs-bundler'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// electron/services/obs-bundler.ts
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export type ObsConfig = {
  alerts_enabled: boolean;
  auth_required: boolean;
  first_load: boolean;
  server_enabled: boolean;
  server_password: string;
  server_port: number;
};

export function generatePassword(): string {
  return randomBytes(12).toString('hex').slice(0, 16);
}

export class ObsBundler {
  private vendorDir: string;
  private portableDir: string;

  constructor(vendorDir: string, portableDir: string) {
    this.vendorDir = vendorDir;
    this.portableDir = portableDir;
  }

  async copyVendorToPortable(): Promise<void> {
    if (fs.existsSync(this.portableDir)) {
      return; // Already copied
    }

    fs.mkdirSync(this.portableDir, { recursive: true });
    await this.copyDir(this.vendorDir, this.portableDir);
  }

  async writeObsConfig(): Promise<ObsConfig> {
    const config: ObsConfig = {
      alerts_enabled: false,
      auth_required: true,
      first_load: false,
      server_enabled: true,
      server_password: generatePassword(),
      server_port: 4455,
    };

    const configDir = path.join(this.portableDir, 'config', 'obs-websocket');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));

    return config;
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        await this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- electron/services/obs-bundler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/services/obs-bundler.ts electron/services/obs-bundler.test.ts
git commit -m "feat: add OBS bundler service with config generation"
```

---

### Task 2: OBS Bundler Service - Process Management

**Files:**
- Modify: `electron/services/obs-bundler.ts`
- Modify: `electron/services/obs-bundler.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `electron/services/obs-bundler.test.ts`:

```typescript
describe('launchObs', () => {
  it('should launch OBS process with correct flags', async () => {
    const bundler = new ObsBundler(vendorDir, portableDir);
    await bundler.copyVendorToPortable();
    await bundler.writeObsConfig();
    
    const launched = bundler.launchObs();
    expect(launched).toBe(true);
    expect(bundler.isRunning()).toBe(true);
    
    bundler.killObs();
  });

  it('should return false if OBS exe not found', async () => {
    const badVendor = path.join(testDir, 'bad-vendor');
    fs.mkdirSync(badVendor, { recursive: true });
    
    const bundler = new ObsBundler(badVendor, portableDir);
    const launched = bundler.launchObs();
    expect(launched).toBe(false);
  });

  it('should emit status events on connection state changes', async () => {
    const bundler = new ObsBundler(vendorDir, portableDir);
    await bundler.copyVendorToPortable();
    await bundler.writeObsConfig();
    
    const statuses: string[] = [];
    bundler.on('status', (status: string) => statuses.push(status));
    
    bundler.launchObs();
    // Wait for process to start
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(statuses).toContain('launching');
    
    bundler.killObs();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- electron/services/obs-bundler.test.ts`
Expected: FAIL - "launchObs is not a function"

- [ ] **Step 3: Write minimal implementation**

Add to `electron/services/obs-bundler.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class ObsBundler extends EventEmitter {
  private process: ChildProcess | null = null;
  private vendorDir: string;
  private portableDir: string;

  constructor(vendorDir: string, portableDir: string) {
    super();
    this.vendorDir = vendorDir;
    this.portableDir = portableDir;
  }

  // ... existing methods ...

  launchObs(): boolean {
    const exePath = path.join(this.portableDir, 'bin', '64bit', 'obs64.exe');
    if (!fs.existsSync(exePath)) {
      return false;
    }

    this.emit('status', 'launching');
    
    this.process = spawn(exePath, [
      '--portable',
      '--disable-shutdown-check',
    ], {
      cwd: this.portableDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    this.process.unref();
    this.emit('status', 'launched');

    this.process.on('exit', (code) => {
      this.process = null;
      this.emit('status', code === 0 ? 'stopped' : 'crashed');
    });

    this.process.on('error', () => {
      this.process = null;
      this.emit('status', 'error');
    });

    return true;
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  killObs(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getObsExePath(): string {
    return path.join(this.portableDir, 'bin', '64bit', 'obs64.exe');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- electron/services/obs-bundler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/services/obs-bundler.ts electron/services/obs-bundler.test.ts
git commit -m "feat: add OBS process management to bundler"
```

---

### Task 3: SplashScreen Component

**Files:**
- Create: `src/components/SplashScreen.tsx`
- Create: `src/components/SplashScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/SplashScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
  it('should render the VaultStudio logo', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    const logo = screen.getByAlt('VaultStudio');
    expect(logo).toBeInTheDocument();
  });

  it('should display the version number', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    expect(screen.getByText('VaultStudio v0.1.0')).toBeInTheDocument();
  });

  it('should display the status message', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    expect(screen.getByText('Starting engine...')).toBeInTheDocument();
  });

  it('should render 5 LED indicators', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    const leds = screen.getAllByRole('img', { name: /led/i });
    expect(leds).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/SplashScreen.test.tsx`
Expected: FAIL with "Cannot find module './SplashScreen'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/SplashScreen.tsx
import styled, { keyframes } from 'styled-components';
import logoUrl from '../assets/logo.png';

type Props = {
  version: string;
  status: string;
};

const ledAnimation = keyframes`
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
`;

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #0B0B0D;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const LogoContainer = styled.div`
  position: relative;
  width: 200px;
  height: 200px;
`;

const Logo = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const LedRing = styled.div`
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Led = styled.div<{ delay: number }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #27A8FF;
  animation: ${ledAnimation} 1.5s ease-in-out infinite;
  animation-delay: ${(props) => props.delay}ms;
`;

const VersionText = styled.div`
  margin-top: 24px;
  color: #D6A23A;
  font-size: 14px;
  font-weight: 500;
`;

const StatusText = styled.div`
  margin-top: 8px;
  color: #A6A6A6;
  font-size: 12px;
`;

export function SplashScreen({ version, status }: Props) {
  return (
    <Container>
      <LogoContainer>
        <Logo src={logoUrl} alt="VaultStudio" />
        <LedRing>
          {[0, 150, 300, 450, 600].map((delay) => (
            <Led key={delay} delay={delay} role="img" aria-label={`led ${delay}`} />
          ))}
        </LedRing>
      </LogoContainer>
      <VersionText>VaultStudio v{version}</VersionText>
      <StatusText>{status}</StatusText>
    </Container>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/SplashScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SplashScreen.tsx src/components/SplashScreen.test.tsx
git commit -m "feat: add animated splash screen component"
```

---

### Task 4: Integrate OBS Bundler into Main Process

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Read current main.ts**

Read `electron/main.ts` lines 1-50 to understand current OBS initialization.

- [ ] **Step 2: Add OBS bundler imports**

Add to imports in `electron/main.ts`:

```typescript
import { ObsBundler } from './services/obs-bundler';
import path from 'path';
import * as os from 'os';
```

- [ ] **Step 3: Create bundler instance**

Add after `let mainWindow: BrowserWindow | null = null;`:

```typescript
const vendorDir = path.join(__dirname, '..', 'vendor', 'obs-studio');
const portableDir = path.join(os.homedir(), 'AppData', 'Roaming', 'VaultStudio', 'obs-portable');
const obsBundler = new ObsBundler(vendorDir, portableDir);
```

- [ ] **Step 4: Replace findObsExe logic**

Replace the `setTimeout` block at the end of `wireServices()` (lines 127-131):

```typescript
// OLD:
setTimeout(() => {
  if (!obsClient.isConnected() && obsClient.isObsInstalled()) {
    obsClient.launchObs();
  }
}, 2500);

// NEW:
setTimeout(async () => {
  if (!obsClient.isConnected()) {
    await obsBundler.copyVendorToPortable();
    await obsBundler.writeObsConfig();
    obsBundler.launchObs();
  }
}, 500);
```

- [ ] **Step 5: Add crash recovery**

Add after `obsClient.start()` in `wireServices()`:

```typescript
obsBundler.on('status', (status: string) => {
  if (status === 'crashed') {
    console.log('OBS crashed, restarting...');
    setTimeout(() => {
      obsBundler.launchObs();
    }, 2000);
  }
});
```

- [ ] **Step 6: Add clean shutdown**

Modify `shutdownEngineIfIdle()` to use bundler:

```typescript
async function shutdownEngineIfIdle() {
  if (!obsBundler.isRunning()) return;
  try {
    const stream = await obsClient.request<{ outputActive: boolean }>('GetStreamStatus', undefined, 1500);
    const record = await obsClient.request<{ outputActive: boolean }>('GetRecordStatus', undefined, 1500);
    if (stream.outputActive || record.outputActive) return;
  } catch {
    /* leave the engine running */
  }
  obsBundler.killObs();
}
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add electron/main.ts
git commit -m "feat: integrate OBS bundler into main process"
```

---

### Task 5: Integrate Splash Screen into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current App.tsx**

Read `src/App.tsx` to understand current routing structure.

- [ ] **Step 2: Add splash screen state**

Modify `src/App.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StudioPage } from './pages/StudioPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TargetsPage } from './pages/TargetsPage';
import { SplashScreen } from './components/SplashScreen';

const vaultApi = typeof window !== 'undefined' ? window.vaultstudio : undefined;

export function App() {
  const [obsState, setObsState] = useState<string>('disconnected');
  const [version] = useState(() => {
    // Version from package.json via Vite
    return '0.1.0';
  });

  useEffect(() => {
    if (!vaultApi) return;
    
    const onObsStatus = (state: string) => setObsState(state);
    vaultApi.on('obs:status', onObsStatus);
    
    return () => {
      vaultApi.off('obs:status', onObsStatus);
    };
  }, []);

  const getStatusMessage = () => {
    switch (obsState) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting to engine...';
      case 'obs-not-running': return 'Starting engine...';
      default: return 'Initializing...';
    }
  };

  if (obsState !== 'connected') {
    return <SplashScreen version={version} status={getStatusMessage()} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StudioPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/targets" element={<TargetsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </HashRouter>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show splash screen while OBS connects"
```

---

### Task 6: Update Build Configuration

**Files:**
- Modify: `.gitignore`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:

```
# Bundled OBS (large binaries)
vendor/obs-studio/
```

- [ ] **Step 2: Update electron-builder.yml**

Read `electron-builder.yml` first, then add:

```yaml
files:
  - dist/**/*
  - dist-electron/**/*
  - vendor/obs-studio/**/*
  - package.json
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore electron-builder.yml
git commit -m "chore: configure build for bundled OBS"
```

---

### Task 7: Integration Test

**Files:**
- No new files

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run electron dev**

Run: `npm run electron:dev`
Expected: 
- Splash screen appears with animated LEDs
- OBS launches in background
- Splash fades when OBS connects
- Studio UI appears

- [ ] **Step 4: Verify OBS process**

In another terminal:
```powershell
Get-Process obs64
```
Expected: obs64.exe is running

- [ ] **Step 5: Verify portable config**

```powershell
Get-Content "$env:APPDATA\VaultStudio\obs-portable\config\obs-websocket\config.json"
```
Expected: JSON with server_port: 4455 and server_password

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: complete bundled OBS integration"
```

---

## Summary

| Task | Files Changed | Purpose |
|------|---------------|---------|
| 1 | `obs-bundler.ts`, `obs-bundler.test.ts` | Core bundler with config generation |
| 2 | `obs-bundler.ts`, `obs-bundler.test.ts` | Process management and lifecycle |
| 3 | `SplashScreen.tsx`, `SplashScreen.test.tsx` | Animated splash component |
| 4 | `main.ts` | Integrate bundler into main process |
| 5 | `App.tsx` | Show splash while OBS connects |
| 6 | `.gitignore`, `electron-builder.yml` | Build configuration |
| 7 | (verification) | Integration testing |

**Total estimated time:** 2-3 hours
