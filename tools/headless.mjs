// Minimal Chrome DevTools Protocol client for a private headless Chrome.
// Launches its own Chrome with a throwaway profile (never the user's Chrome),
// connects over Node's global WebSocket, and offers the few calls media.mjs
// needs: open a page at a viewport size, evaluate, mouse/keys, screenshot.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const dir = mkdtempSync(join(tmpdir(), 'gpz-media-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    '--allow-file-access-from-files', '--disable-features=Translate', 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });

  let nextId = 1;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail, method } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(`${method}: ${msg.error.message}`)); else ok(msg.result);
    } else if (msg.method) {
      for (const w of [...waiters]) if (w.method === msg.method && w.sessionId === msg.sessionId) { waiters.splice(waiters.indexOf(w), 1); w.ok(msg.params); }
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = nextId++;
    pending.set(id, { ok, fail, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const event = (method, sessionId) => new Promise((ok) => waiters.push({ method, sessionId, ok }));

  async function page(width, height, scale = 1, { scheme = 'light' } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    await s('Page.enable');
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    const p = {
      async goto(url, settle = 900) {
        const loaded = event('Page.loadEventFired', sessionId);
        await s('Page.navigate', { url });
        await loaded;
        await sleep(settle);
      },
      async eval(expr) {
        const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      },
      rect: (sel) => p.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`),
      move: (x, y) => s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }),
      async click(x, y) {
        await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      },
      // Cmd+Shift+= (dir 1) or Cmd+Shift+- (dir -1)
      async zoomKey(dir) {
        const k = dir > 0 ? { key: '+', code: 'Equal', windowsVirtualKeyCode: 187 } : { key: '_', code: 'Minus', windowsVirtualKeyCode: 189 };
        await s('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 4 | 8, ...k });
        await s('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4 | 8, ...k });
      },
      async shot(file, clip) {
        const { data } = await s('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : {}) });
        const { writeFileSync } = await import('node:fs');
        writeFileSync(file, Buffer.from(data, 'base64'));
      },
      close: () => send('Target.closeTarget', { targetId }),
    };
    return p;
  }

  async function close() {
    try { await send('Browser.close'); } catch { /* already gone */ }
    ws.close();
    proc.kill();
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
  return { page, close };
}
