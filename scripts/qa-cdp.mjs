import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = join(process.cwd(), '.chrome-qa-profile');

export async function launchBrowser({ headless = true, port = 9222 } = {}) {
  if (existsSync(USER_DATA)) {
    try {
      rmSync(USER_DATA, { recursive: true, force: true });
    } catch {}
  }
  mkdirSync(USER_DATA, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
    '--window-size=1280,900',
  ];

  if (headless) {
    args.push('--headless=new');
  }

  const proc = spawn(CHROME_PATH, args, { stdio: 'ignore', detached: false });

  // Wait for port to be ready
  let endpoint = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const json = await res.json();
        endpoint = json.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!endpoint) {
    proc.kill();
    throw new Error('Chrome failed to start or open CDP port');
  }

  // Create a new tab or use existing
  let target;
  try {
    const newTabRes = await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' });
    target = await newTabRes.json();
  } catch {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await listRes.json();
    target = tabs[0];
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map();
  const listeners = new Map();

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
    } else if (msg.method) {
      const handlers = listeners.get(msg.method) || [];
      for (const h of handlers) h(msg.params);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
  }

  // Enable essential domains
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Network.enable');

  async function navigate(url, { waitUntil = 'load', timeout = 30000 } = {}) {
    const navPromise = new Promise((resolve) => {
      const done = () => resolve();
      on('Page.loadEventFired', done);
    });
    await send('Page.navigate', { url });
    await Promise.race([
      navPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), timeout)),
    ]);
    // Small settling time
    await new Promise((r) => setTimeout(r, 500));
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async function screenshot() {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(res.data, 'base64');
  }

  async function close() {
    try {
      ws.close();
    } catch {}
    try {
      proc.kill();
    } catch {}
    try {
      rmSync(USER_DATA, { recursive: true, force: true });
    } catch {}
  }

  return { proc, send, on, navigate, evaluate, screenshot, close };
}
