// test-edit-layout.js — drives the real Electron app to verify the
// Edit Layout -> Realtime black-screen fix.
//
// Run with: node_modules\.bin\electron.cmd scripts\test-edit-layout.js
// Captures 4 screenshots into %TEMP%\opencode\preview-shots\.

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = path.join(process.env.TEMP || 'C:\\Users\\VAULTK~1\\AppData\\Local\\Temp\\opencode', 'preview-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const SHOT = (name) => path.join(SHOT_DIR, name);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grabWindow(win, name) {
  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  const file = SHOT(name);
  fs.writeFileSync(file, png);
  console.log(`[shot] ${name} -> ${file} (${png.length} bytes)`);
  return file;
}

async function evaluate(win, code) {
  return win.webContents.executeJavaScript(code, true);
}

async function findAndClick(win, selector) {
  return evaluate(win, `(() => {
    const btn = document.querySelector(${JSON.stringify(selector)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

async function run() {
  // Lazy-import the real main so its app.whenReady() / createWindow() runs.
  require(path.join(__dirname, '..', 'dist-electron', 'main.js'));

  let mainWindow = null;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    mainWindow = BrowserWindow.getAllWindows()[0] || null;
    if (mainWindow) break;
  }
  if (!mainWindow) throw new Error('No window appeared');
  console.log('[main] window found');

  await sleep(2000);
  if (mainWindow.webContents.isLoading()) {
    await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', () => resolve()));
  }
  await sleep(2000);

  for (let i = 0; i < 60; i++) {
    const active = await evaluate(mainWindow, `(() => {
      const chips = document.querySelectorAll('div');
      for (const c of Array.from(chips)) {
        if (c.textContent && c.textContent.trim() === 'Realtime') return true;
      }
      return false;
    })()`);
    if (active) {
      console.log('[main] preview is in Realtime mode');
      break;
    }
    await sleep(250);
  }
  // Wait extra time for the native viewport to attach and start rendering
  // before we test the toggle. The snapshot chip shows "Realtime" almost
  // immediately, but the native viewport takes a bit longer.
  await sleep(3000);

  // Probe whether the native viewport is actually active (the snapshot
  // also makes the chip say "Realtime" — we need to know which path is
  // driving the preview to interpret the screenshots correctly).
  const probeState = async (label) => {
    const result = await evaluate(mainWindow, `(() => {
      // Heuristic: count on-screen <img> for the preview fallback vs the
      // native HWND. There's no JS-accessible signal for the native
      // viewport, but we can check the global vaultApi setViewportVisible
      // mock and inspect window state.
      return {
        imgCount: document.querySelectorAll('img[alt="Stream preview"]').length,
        videoCount: document.querySelectorAll('video[autoplay]').length,
        anyChip: (Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.trim() === 'Realtime')) ? 'yes' : 'no',
      };
    })()`);
    console.log(`[probe] ${label}:`, JSON.stringify(result));
  };

  await probeState('before shot 1');

  await grabWindow(mainWindow, '1-initial-realtime.png');

  const clickedEnter = await findAndClick(mainWindow, 'button[aria-label="Edit layout"]');
  console.log('[main] clicked Edit Layout (enter):', clickedEnter);
  await sleep(1500);
  await probeState('after enter Edit Layout');
  await grabWindow(mainWindow, '2-edit-layout.png');

  const clickedExit = await findAndClick(mainWindow, 'button[aria-label="Edit layout"]');
  console.log('[main] clicked Edit Layout (exit):', clickedExit);
  await sleep(2500);
  await probeState('after exit Edit Layout');
  await grabWindow(mainWindow, '3-back-to-realtime.png');

  await sleep(2000);
  await probeState('settled');
  await grabWindow(mainWindow, '4-realtime-settled.png');

  console.log('[main] DONE');
  app.quit();
}

app.whenReady().then(() => {
  run().catch((e) => {
    console.error('[main] FAILED', e);
    app.exit(1);
  });
});
