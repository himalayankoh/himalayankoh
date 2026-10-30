#!/usr/bin/env node
/**
 * Viewport-accurate screenshots of the wholesale surfaces, via CDP.
 *
 * Chrome's `--screenshot` flag captures the *window* and cannot emulate a phone, so a
 * 390px-wide check rendered the desktop layout and cropped it — which is not a mobile
 * test. This drives the same headless Chrome over the DevTools protocol instead:
 * `Emulation.setDeviceMetricsOverride` fixes the CSS viewport, and
 * `Page.captureScreenshot` with `captureBeyondViewport` captures the whole page.
 *
 * Usage (the dev server must already be running):
 *   node scripts/qa-wholesale-screenshots.mjs http://127.0.0.1:3100
 *
 * READ-ONLY with respect to the application: it navigates public pages and reads no
 * credentials. Output lands in `qa-wholesale/`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'qa-wholesale');
const BASE = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '');
const PORT = 9333;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Users/basco/.agent-browser/browsers/chrome-156.0.8078.47/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const SHOTS = [
  { file: 'wholesale-landing-1440.png', url: '/wholesale', width: 1440, height: 900 },
  { file: 'wholesale-landing-768.png', url: '/wholesale', width: 768, height: 1024 },
  { file: 'wholesale-landing-390.png', url: '/wholesale', width: 390, height: 844 },
  { file: 'wholesale-apply-1440.png', url: '/wholesale/apply', width: 1440, height: 900 },
  { file: 'wholesale-apply-768.png', url: '/wholesale/apply', width: 768, height: 1024 },
  { file: 'wholesale-apply-390.png', url: '/wholesale/apply', width: 390, height: 844 },
  { file: 'wholesale-apply-360.png', url: '/wholesale/apply', width: 360, height: 800 },
  { file: 'wholesale-verify-1440.png', url: '/wholesale/verify', width: 1440, height: 900 },
  { file: 'wholesale-login-1440.png', url: '/wholesale/login', width: 1440, height: 900 },
  { file: 'home-header-360.png', url: '/', width: 360, height: 800 },
];

function chromeBinary() {
  const found = CHROME_CANDIDATES.find((path) => {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  });
  if (!found) throw new Error('No Chrome binary found. Set CHROME_PATH.');
  return found;
}

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Chrome did not open its DevTools port.');
}

/** A tiny CDP client: one socket, one tab, request ids. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => rejectOpen(new Error('CDP socket failed.')), { once: true });
  });
  return socket;
}

const pause = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(
    chromeBinary(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--remote-debugging-port=${PORT}`,
      // A throwaway profile belongs in the OS temp directory, not next to the
      // screenshots: it is hundreds of megabytes and must never be committed.
      `--user-data-dir=${join(tmpdir(), 'hk-wholesale-qa-chrome')}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForDevtools();
    const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((response) =>
      response.json()
    );
    const socket = await openSocket(target.webSocketDebuggerUrl);
    const cdp = new Cdp(socket);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const shot of SHOTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 1,
        mobile: shot.width < 768,
      });
      await cdp.send('Page.navigate', { url: `${BASE}${shot.url}` });
      await pause(1800);
      // The cookie notice is a real consent surface; dismiss it so it does not cover
      // the page being reviewed.
      await cdp
        .send('Runtime.evaluate', {
          expression: `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Decline$/i.test((x.textContent||'').trim())); if (b) b.click(); return true; })()`,
        })
        .catch(() => undefined);
      await pause(400);

      const metrics = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, title: document.title })`,
        returnByValue: true,
      });
      const info = JSON.parse(metrics.result.value || '{}');

      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      writeFileSync(join(OUT, shot.file), Buffer.from(capture.data, 'base64'));
      console.log(
        `${shot.file} ${shot.width}x${shot.height} inner=${info.innerWidth} scroll=${info.scrollWidth} overflow=${
          info.scrollWidth > info.innerWidth ? 'YES' : 'no'
        }`
      );
    }

    socket.close();
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
