// test-edit-layout.ts — drives the real Electron app to verify the
// Edit Layout -> Realtime black-screen fix.
//
// Strategy:
//  1. Boot the full app (main.ts does window creation, engine startup, etc.)
//  2. Wait for the StudioPage to render + the native preview to come up
//  3. Capture the preview pane
//  4. Click the Edit Layout button
//  5. Wait, capture again
//  6. Click again to leave Edit Layout
//  7. Wait, capture again — this is the one that was black before the fix
//
// We use webContents.capturePage() and crop to the preview rect (reported
// by the renderer via an in-page measurement helper) to make the failure
// obvious in the saved PNG.

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const SHOT_DIR = path.join(process.env.TEMP || 'C:\\Users\\VAULTK~1\\AppData\\Local\\Temp\\opencode', 'preview-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const SHOT = (name: string) => path.join(SHOT_DIR, name);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function grabWindow(win: BrowserWindow, name: string) {
  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  const file = SHOT(name);
  fs.writeFileSync(file, png);
  console.log(`[shot] ${name} -> ${file} (${png.length} bytes)`);
  return file;
}

async function evaluate(win: BrowserWindow, code: string) {
  return win.webContents.executeJavaScript(code, true);
}

async function getPreviewRect(win: BrowserWindow): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return evaluate(win, `(() => {
    const panel = document.querySelector('[aria-label="Preview drawing canvas"]')?.closest('div');
    if (!panel) return null;
    // Walk up to find the panel container with a meaningful bounding rect
    let el: HTMLElement | null = panel;
    while (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) {
        return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      }
      el = el.parentElement;
    }
    return null;
  })()`) as Promise<{ x: number; y: number; width: number; height: number } | null>;
}

async function findAndClick(win: BrowserWindow, selector: string) {
  return evaluate(win, `(() => {
    const btn = document.querySelector(${JSON.stringify(selector)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

async function run() {
  // Lazy-import the real main so its app.whenReady() / createWindow() runs.
  require('../electron/main.js');

  // Wait for a window to be created.
  let mainWindow: BrowserWindow | null = null;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
    if (mainWindow) break;
  }
  if (!mainWindow) throw new Error('No window appeared');
  console.log('[main] window found');

  // Wait for the renderer to finish loading and the engine to be connected.
  await sleep(2000);
  if (mainWindow.webContents.isLoading()) {
    await new Promise<void>((resolve) => mainWindow!.webContents.once('did-finish-load', () => resolve()));
  }
  await sleep(2000);

  // Poll for the preview to become active.
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
  await sleep(1500);

  // Screenshot 1: initial Realtime mirror.
  await grabWindow(mainWindow, '1-initial-realtime.png');

  // Click Edit Layout.
  const clickedEnter = await findAndClick(mainWindow, 'button[aria-label="Edit layout"]');
  console.log('[main] clicked Edit Layout (enter):', clickedEnter);
  await sleep(1500);
  await grabWindow(mainWindow, '2-edit-layout.png');

  // Click Edit Layout again to return to Realtime.
  const clickedExit = await findAndClick(mainWindow, 'button[aria-label="Edit layout"]');
  console.log('[main] clicked Edit Layout (exit):', clickedExit);
  await sleep(2500);
  await grabWindow(mainWindow, '3-back-to-realtime.png');

  // Wait a bit longer and snap again to make sure it's not just slow to redraw.
  await sleep(2000);
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
