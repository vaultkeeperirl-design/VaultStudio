/**
 * obs-worker.ts — runs in a Node.js worker_threads thread.
 * Loads the native libobs addon and proxies all calls off the main thread.
 * The main thread communicates via parentPort messages.
 */
import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

const METER_POLL_MS = 500;

let addon: any = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;

// ---- uncaught crash handler ----

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT: ${err.stack || err.message}`);
  try { parentPort?.postMessage({ type: 'workerCrash', error: err.message }); } catch { /* ignore */ }
});

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason}`);
});

// ---- helpers ----

function log(line: string) {
  const msg = `[${new Date().toISOString()}] [obs-worker] ${line}`;
  console.log(msg);
  try { process.stderr.write(msg + '\n'); } catch { /* ignore */ }
}

// ---- message handling ----

parentPort?.on('message', (msg: any) => {
  try {
    switch (msg.type) {
      case 'init':
        handleInit(msg);
        break;
      case 'call':
        handleCall(msg);
        break;
      case 'startPreview':
        handleStartPreview(msg);
        break;
      case 'stopPreview':
        handleStopPreview(msg);
        break;
      case 'startMeterPolling':
        startMeterPolling();
        parentPort?.postMessage({ type: 'ack', id: msg.id });
        break;
      case 'stopMeterPolling':
        stopMeterPolling();
        parentPort?.postMessage({ type: 'ack', id: msg.id });
        break;
      case 'shutdown':
        handleShutdown(msg);
        break;
      default:
        parentPort?.postMessage({ type: 'error', id: msg.id, error: `Unknown message type: ${msg.type}` });
    }
  } catch (e) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: (e as Error).message });
  }
});

// ---- init ----

function handleInit(msg: { addonPath: string; runtimeDir: string; configDir: string; id?: string }) {
  try {
    const runtimeBin = path.join(msg.runtimeDir, 'bin', '64bit');
    process.env.PATH = runtimeBin + ';' + (process.env.PATH || '');

    log(`loading addon: ${msg.addonPath}`);
    addon = require(msg.addonPath);

    addon.registerEventCallback((eventName: string, jsonData: string) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(jsonData || '{}');
      } catch { /* tolerate malformed payloads */ }
      parentPort?.postMessage({ type: 'event', eventName, data });
    });

    log('addon loaded and event callback registered');
    // Auto-start meter polling — runs entirely in this worker thread
    startMeterPolling();
    parentPort?.postMessage({ type: 'ready', id: msg.id });
  } catch (e) {
    log(`init failed: ${(e as Error).message}`);
    parentPort?.postMessage({ type: 'workerCrash', error: (e as Error).message });
  }
}

// ---- generic call proxy ----

function handleCall(msg: { id: string; method: string; args: unknown[] }) {
  if (!addon) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: 'Addon not loaded' });
    return;
  }
  const fn = addon[msg.method];
  if (typeof fn !== 'function') {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: `Unknown addon method: ${msg.method}` });
    return;
  }
  try {
    const result = fn.apply(addon, msg.args);
    parentPort?.postMessage({ type: 'result', id: msg.id, result });
  } catch (e) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: (e as Error).message });
  }
}

// ---- preview ----

let previewActive = false;

function handleStartPreview(msg: { id: string; options: { width: number; height: number; fps: number } }) {
  if (!addon) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: 'Addon not loaded' });
    return;
  }
  if (previewActive) {
    parentPort?.postMessage({ type: 'result', id: msg.id, result: true });
    return;
  }
  try {
    addon.startPreview(
      (frame: { width: number; height: number; data: Buffer }) => {
        if (frame?.data) {
          parentPort?.postMessage({
            type: 'previewFrame',
            frame: { mime: 'image/jpeg', width: frame.width, height: frame.height, data: frame.data },
          });
        }
      },
      msg.options,
    );
    previewActive = true;
    parentPort?.postMessage({ type: 'result', id: msg.id, result: true });
  } catch (e) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: (e as Error).message });
  }
}

function handleStopPreview(msg: { id: string }) {
  if (!addon) {
    parentPort?.postMessage({ type: 'result', id: msg.id, result: true });
    return;
  }
  try {
    addon.stopPreview();
    previewActive = false;
    parentPort?.postMessage({ type: 'result', id: msg.id, result: true });
  } catch (e) {
    parentPort?.postMessage({ type: 'error', id: msg.id, error: (e as Error).message });
  }
}

// ---- meter polling (runs in worker, not main thread) ----

function startMeterPolling() {
  if (meterTimer) return;
  meterTimer = setInterval(() => {
    if (!addon) return;
    try {
      const levels = addon.getAudioLevels();
      if (levels && levels.length > 0) {
        parentPort?.postMessage({
          type: 'meterLevels',
          levels: levels.map((l: { name: string; level: number }) => ({ id: l.name, level: l.level })),
        });
      }
    } catch {
      /* engine busy or restarting */
    }
  }, METER_POLL_MS);
}

function stopMeterPolling() {
  if (meterTimer) {
    clearInterval(meterTimer);
    meterTimer = null;
  }
}

// ---- shutdown ----

function handleShutdown(msg: { id?: string }) {
  stopMeterPolling();
  if (addon) {
    try {
      addon.shutdownObs();
    } catch { /* best-effort */ }
    addon = null;
  }
  parentPort?.postMessage({ type: 'result', id: msg.id, result: true });
  // Give the message time to flush before exiting
  setTimeout(() => process.exit(0), 50);
}
