// Production smoke for the minimized-window chat overlay.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultstudio-chat-popout-'));
process.env.VAULTSTUDIO_USER_DATA_DIR = userDataDir;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, fn, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function findMainWindow() {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.getTitle() === 'VaultStudio') || null;
}

function findPopoutWindow() {
  return (
    BrowserWindow.getAllWindows().find(
      (win) =>
        !win.isDestroyed() &&
        (win.getTitle() === 'VaultStudio Chat Overlay' || win.webContents.getURL().includes('#/chat-popout'))
    ) || null
  );
}

async function run() {
  require(path.join(__dirname, '..', 'dist-electron', 'main.js'));

  const mainWindow = await waitFor('main window', () => findMainWindow());
  if (mainWindow.webContents.isLoading()) {
    await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
  }
  await sleep(1500);

  mainWindow.minimize();
  const popout = await waitFor('chat popout window after minimize', () => {
    const win = findPopoutWindow();
    return win && win.isVisible() ? win : null;
  });

  if (!popout.isAlwaysOnTop()) throw new Error('Chat popout is not always on top');
  const route = await popout.webContents.executeJavaScript('window.location.hash', true);
  if (route !== '#/chat-popout') throw new Error(`Unexpected popout route: ${route}`);
  const bodyView = await popout.webContents.executeJavaScript('document.body.dataset.view', true);
  if (bodyView !== 'chat-popout') throw new Error(`Popout body view was not applied: ${bodyView}`);

  const initialOpacity = popout.getOpacity();
  if (Math.abs(initialOpacity - 0.88) > 0.02) {
    throw new Error(`Unexpected initial popout opacity: ${initialOpacity}`);
  }

  await popout.webContents.executeJavaScript('window.vaultstudio.chatPopout.update({ opacity: 0.55 })', true);
  await sleep(500);
  const updatedOpacity = popout.getOpacity();
  if (Math.abs(updatedOpacity - 0.55) > 0.02) {
    throw new Error(`Popout opacity did not update live: ${updatedOpacity}`);
  }

  mainWindow.restore();
  await waitFor('chat popout hidden after restore', () => !popout.isVisible());

  console.log(`[chat-popout] OK userData=${userDataDir}`);
  app.quit();
}

app.whenReady().then(() => {
  run().catch((error) => {
    console.error('[chat-popout] FAILED', error);
    app.exit(1);
  });
});
