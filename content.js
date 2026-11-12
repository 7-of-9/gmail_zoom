// Pane Zoom for Gmail: floating − / + at the top-left of the reading pane that
// zoom only the open conversation (subject + message bodies).
//
// - Zoom is remembered per sender, per Gmail account, and synced across your
//   machines with no login: the Gmail account you're in is the identity.
//   Senders you have not set yet use the last level you picked.
// - Zoomed fixed-width HTML emails are reflowed to the pane width; anything
//   that still won't fit is shrunk on its own (see fitBody).
// - Shortcuts: Cmd+Shift+= / Cmd+Shift+- (Ctrl+Shift on Windows/Linux).
//
// DOM is built with createElement/textContent and styled via CSSOM only,
// because Gmail enforces Trusted Types and a strict CSP.
(() => {
  'use strict';
  if (window.top !== window || document.getElementById('gpz-bar')) return;

  const LOCAL = 'gmailPaneZoom.v3.';  // + account key: sync document, below
  const OLD = 'gmailPaneZoom.v2';     // before sync: {def, senders: {address: zoom}}
  const OLDER = 'gmailPaneZoom';      // v1: one global number
  const VAR = '--gpz-zoom';           // default level, read by content.css
  const MIN = 0.5;
  const MAX = 3;
  const STEP = 0.1;
  const SYNC_EVERY = 5 * 60 * 1000;   // while the tab is visible

  const clamp = (z) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));
  const pctText = (z) => `${Math.round(z * 100)}%`;

  // ---- hashing: addresses never leave the browser ------------------------
  // Synchronous SHA-256 (crypto.subtle is async, and a hash is needed while
  // laying out each message). Tested against Node's crypto in test/.
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const n = ((bytes.length + 72) >> 6) << 6;
    const m = new Uint8Array(n);
    m.set(bytes);
    m[bytes.length] = 0x80;
    const v = new DataView(m.buffer);
    v.setUint32(n - 8, Math.floor(bytes.length / 0x20000000));
    v.setUint32(n - 4, (bytes.length * 8) >>> 0);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Int32Array(64);
    const ror = (x, r) => (x >>> r) | (x << (32 - r));
    for (let i = 0; i < n; i += 64) {
      for (let j = 0; j < 16; j++) w[j] = v.getInt32(i + j * 4);
      for (let j = 16; j < 64; j++) {
        const a = w[j - 15], b = w[j - 2];
        w[j] = w[j - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[j - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10));
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let j = 0; j < 64; j++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((x, k) => { H[k] = (H[k] + x) | 0; });
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    H.forEach((x, k) => ov.setInt32(k * 4, x));
    return out;
  }
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // ---- which Gmail account ----------------------------------------------
  // Gmail's tab title is "<view> - <address> - <Gmail or the org's name>".
  const EMAIL = /^[^\s@()]+@[^\s@()]+\.[^\s@()]+$/;
  function detectAccount() {
    const parts = document.title.split(' - ').map((p) => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) if (EMAIL.test(parts[i])) return parts[i].toLowerCase();
    const a = document.querySelector('a[href^="https://accounts.google.com/SignOutOptions"][aria-label]');
    const m = a && a.getAttribute('aria-label').match(/[^\s@()]+@[^\s@()]+\.[^\s@()]+/);
    return m ? m[0].toLowerCase() : '';
  }
  let acct = '';    // Gmail address, lowercased; '' until known
  let acctKey = ''; // its hash: the sync id and the localStorage suffix
  const senderKeys = new Map();
  function senderKey(addr) {
    let k = senderKeys.get(addr);
    if (!k) senderKeys.set(addr, (k = b64url(sha256(`gpz1|${acct}|${addr}`).subarray(0, 16))));
    return k;
  }

  // ---- settings: { d: [zoom, t], s: { senderKey: [zoom, t] } } -------------
  // d = level for senders not set yet, s = per sender, t = when it was set
  // (ms). The newest t wins per entry when tabs or machines merge.
  const valid = (e) => Array.isArray(e) && +e[0] >= MIN && +e[0] <= MAX && +e[1] >= 0;
  function mergeInto(doc, other) {
    let changed = false;
    if (!other || typeof other !== 'object') return false;
    if (valid(other.d) && (!doc.d || +other.d[1] > doc.d[1])) { doc.d = [clamp(+other.d[0]), +other.d[1]]; changed = true; }
    for (const [k, e] of Object.entries(other.s && typeof other.s === 'object' ? other.s : {})) {
      if (valid(e) && (!doc.s[k] || +e[1] > doc.s[k][1])) { doc.s[k] = [clamp(+e[0]), +e[1]]; changed = true; }
    }
    return changed;
  }
  const blank = () => ({ d: null, s: {} });
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

  // Settings from before sync (one set for every account), stamped t=1 so a
  // real change from any machine wins over them.
  function legacy(withSenders) {
    const doc = blank();
    const o = readJSON(OLD);
    if (o && typeof o === 'object') {
      doc.d = [clamp(+o.def || 1), 1];
      if (withSenders) {
        for (const [addr, z] of Object.entries(o.senders || {})) if (+z) doc.s[senderKey(addr)] = [clamp(+z), 1];
      }
    } else if (parseFloat(readJSON(OLDER))) {
      doc.d = [clamp(parseFloat(readJSON(OLDER))), 1];
    }
    return doc;
  }
  function load() {
    const doc = blank();
    if (!mergeInto(doc, readJSON(LOCAL + acctKey))) mergeInto(doc, legacy(true));
    return doc;
  }
  let state = legacy(false); // until the account is known: old default only
  const save = () => {
    if (!acctKey) return;
    try { localStorage.setItem(LOCAL + acctKey, JSON.stringify(state)); } catch { /* blocked: session only */ }
  };
  const defZoom = () => (state.d ? state.d[0] : 1);
  const zoomFor = (sender) => {
    const e = sender && acct ? state.s[senderKey(sender)] : null;
    return e ? e[0] : defZoom();
  };

  // Another Gmail tab of this account changed the settings: follow.
  window.addEventListener('storage', (e) => {
    if (acctKey && e.key === LOCAL + acctKey) { state = load(); tick(); }
  });

  // ---- sync across machines (background.js talks to the server) -----------
  let syncStatus = 'connecting'; // shown in the tooltip
  let syncTimer = 0;
  let lastSync = 0;
  const syncSoon = (ms) => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); };
  async function sync() {
    clearTimeout(syncTimer);
    if (!acctKey) return;
    lastSync = Date.now();
    let r = null;
    try {
      r = await chrome.runtime.sendMessage({ type: 'gpz-sync', acct: acctKey, doc: state });
    } catch { /* extension reloaded or updated: this page's script is orphaned */ }
    if (r && r.off) { syncStatus = 'off'; return; }
    if (!r || !r.doc) { syncStatus = 'error'; syncSoon(60000); return; }
    syncStatus = 'on';
    if (mergeInto(state, r.doc)) { save(); tick(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSync > 30000) sync();
  });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, SYNC_EVERY);
  try {
    chrome.storage.onChanged.addListener((c) => { if ('syncOff' in c) sync(); }); // toggled in the menu
  } catch { /* orphaned */ }

  function findAccount() {
    if (acct) return;
    const a = detectAccount();
    if (!a) return;
    acct = a;
    acctKey = b64url(sha256(`gpz1|${a}`));
    state = load();
    save();
    sync();
  }

  // ---- which message, which sender ----------------------------------------
  const shown = (el) => el.getBoundingClientRect().width > 0;
  const firstShown = (sel) => {
    for (const el of document.querySelectorAll(sel)) if (shown(el)) return el;
    return null;
  };

  // Sender = the .gD[email] in the nearest ancestor of the body that has one,
  // i.e. this message's own header.
  const senders = new WeakMap();
  function senderOf(body) {
    if (senders.has(body)) return senders.get(body);
    for (let el = body.parentElement; el && el !== document.body; el = el.parentElement) {
      const s = el.querySelector('.gD[email]');
      if (s) {
        const addr = (s.getAttribute('email') || '').trim().toLowerCase();
        if (addr) senders.set(body, addr);
        return addr;
      }
    }
    return '';
  }

  // The message the control acts on: the body under a reading line a quarter
  // of the way down the pane, else the next one below it, else the last.
  function pickFocus(bodies, pane) {
    if (!pane || !bodies.length) return bodies[0] || null;
    const y = pane.top + pane.height / 4;
    let below = null;
    for (const b of bodies) {
      const r = b.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) return b;
      if (r.top > y && !below) below = b;
    }
    return below || bodies[bodies.length - 1];
  }

  // ---- one text size per message -------------------------------------------
  // Emails mix sizes (headings, 9pt signatures, list numbers in another font)
  // and Gmail's subject is far bigger than any body text. Every visible piece
  // of text in a body is set to the size most of that body's text already
  // has; the subject gets the newest message's size (see tick). Zoom then
  // scales one uniform size. Text under 4px is left alone: it's hidden on
  // purpose (preview-text and spacer tricks).
  const evened = new WeakMap(); // body -> { size, n: element count when done }
  const INVISIBLE = /[\s ͏​-‍⁠﻿]+/g;

  function evenText(body) {
    const n = body.getElementsByTagName('*').length; // cheap: changes only when Gmail adds content
    const done = evened.get(body);
    if (done && done.n === n) return done.size;
    const chars = new Map(); // element -> visible characters directly inside it
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const len = t.data.replace(INVISIBLE, '').length;
      if (len && t.parentElement) chars.set(t.parentElement, (chars.get(t.parentElement) || 0) + len);
    }
    const bySize = new Map();
    const els = [];
    for (const [el, len] of chars) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (!(fs >= 4)) continue;
      els.push(el);
      const k = Math.round(fs * 2) / 2;
      bySize.set(k, (bySize.get(k) || 0) + len);
    }
    let size = 0;
    let most = 0;
    for (const [k, len] of bySize) if (len > most) { most = len; size = k; }
    if (size) {
      const px = `${size}px`;
      for (const el of [...els, ...body.querySelectorAll('li')]) {
        if (el.style.getPropertyValue('font-size') !== px) el.style.setProperty('font-size', px, 'important');
        // a fixed line height made for smaller text would make lines overlap
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        if (lh && lh < size * 1.15) el.style.setProperty('line-height', 'normal', 'important');
      }
    }
    evened.set(body, { size, n: body.getElementsByTagName('*').length });
    return size;
  }

  // ---- zoom one body, keeping it inside the pane --------------------------
  // The body always gets the zoom asked for; the text is what you want bigger.
  // When zoomed in, anything that won't fit the pane is dealt with in steps,
  // each only if the one before wasn't enough:
  //   1. .gpz-fit  : reflow (max-width: 100% on everything), see content.css
  //   2. .gpz-fit2 : also drop fixed table/cell widths and no-wrap (Outlook
  //                  tables in pt, signature blocks)
  //   3. shrink    : each element still sticking out gets its own smaller zoom
  //                  so it just fits; the rest of the message keeps its size
  const fitted = new WeakMap();  // body -> "zoom|width" it was last set up for
  const stuck = new WeakMap();   // body -> scrollWidth at which shrinking gave up
  const ownZoom = new WeakMap(); // shrunk element -> its inline zoom before
  const MIN_SHRINK = 0.25;

  const overflows = (el) => el.scrollWidth > el.clientWidth + 1;

  function unshrink(body) {
    for (const e of body.querySelectorAll('.gpz-shrunk')) {
      e.style.zoom = ownZoom.get(e) || '';
      e.classList.remove('gpz-shrunk');
    }
  }

  // Shrink the outermost elements that stick out past the body's right edge.
  // Returns whether anything changed. Only descends into elements that
  // overflow, so a message that fits costs one check.
  function shrinkWide(body) {
    const right = body.getBoundingClientRect().right;
    let changed = false;
    const walk = (parent) => {
      for (const c of parent.children) {
        const r = c.getBoundingClientRect();
        if (r.width && r.right > right + 1) {
          if (!ownZoom.has(c)) ownZoom.set(c, c.style.zoom);
          const cur = c.classList.contains('gpz-shrunk') ? parseFloat(c.style.zoom) || 1 : 1;
          const base = parseFloat(ownZoom.get(c)) || 1;
          const f = Math.max(MIN_SHRINK, Math.floor(((right - r.left) / r.width) * cur * 100) / 100);
          if (f < cur) {
            c.style.zoom = String(Math.round(base * f * 100) / 100);
            c.classList.add('gpz-shrunk');
            changed = true;
          }
        } else if (c.clientWidth ? overflows(c) : c.children.length) {
          walk(c);
        }
      }
    };
    walk(body);
    return changed;
  }

  function fitBody(el, want) {
    const w = el.getBoundingClientRect().width;
    if (!w || !el.clientWidth) return;
    const key = `${want}|${Math.round(w)}`;
    if (fitted.get(el) !== key) { // new zoom or pane width: start over
      fitted.set(el, key);
      stuck.delete(el);
      unshrink(el);
      el.classList.remove('gpz-fit2');
      el.classList.toggle('gpz-fit', want > 1);
      if (el.style.zoom !== String(want)) el.style.zoom = String(want);
    }
    if (want <= 1 || !overflows(el) || stuck.get(el) === el.scrollWidth) return;
    if (!el.classList.contains('gpz-fit2')) {
      el.classList.add('gpz-fit2');
      if (!overflows(el)) return;
    }
    if (!shrinkWide(el)) stuck.set(el, el.scrollWidth); // retry if it grows (images)
  }

  // ---- UI ----------------------------------------------------------------
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const mac = /mac/i.test(platform);
  const KEY_IN = mac ? '⌘⇧+' : 'Ctrl+Shift+=';
  const KEY_OUT = mac ? '⌘⇧−' : 'Ctrl+Shift+−';

  const button = (text, onClick, cls, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  };

  const out = button('−', () => step(-1), '', `Zoom out (${KEY_OUT})`);
  const pct = button('', () => setFocusZoom(1), 'gpz-pct', 'Back to 100%');
  const inn = button('+', () => step(1), '', `Zoom in (${KEY_IN})`);
  const tip = document.createElement('div'); // instant hover help, see content.css
  tip.id = 'gpz-tip';

  let version = '';
  try { version = chrome.runtime.getManifest().version; } catch { /* extension reloaded */ }

  const row = document.createElement('div');
  row.id = 'gpz-row';
  row.append(out, pct, inn);
  const bar = document.createElement('div');
  bar.id = 'gpz-bar';  // positioned, never zoomed
  bar.append(row, tip);
  // Keep Gmail from treating clicks on the bar as clicks on the conversation,
  // and don't steal keyboard focus from Gmail.
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
    bar.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'mousedown') e.preventDefault(); });
  }

  let focus = null;

  function setFocusZoom(z) {
    z = clamp(z);
    const s = focus ? senderOf(focus) : '';
    const t = Date.now();
    if (s && acct) state.s[senderKey(s)] = [z, t];
    state.d = [z, t]; // senders not set yet follow your latest choice
    save();
    syncSoon(2000);
    tick();
  }
  const step = (d) => setFocusZoom(zoomFor(focus ? senderOf(focus) : '') + d * STEP);

  const setText = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  const SYNC_TEXT = {
    connecting: 'sync: connecting…',
    on: 'synced across machines for @',
    off: 'sync off (toolbar icon menu)',
    error: 'sync: server unreachable, retrying',
  };

  function render() {
    const s = focus ? senderOf(focus) : '';
    const z = zoomFor(s);
    const shrunk = !!(focus && focus.querySelector('.gpz-shrunk'));
    setText(pct, 'textContent', pctText(z));
    setText(tip, 'textContent', [
      `${s || 'this sender'}: ${pctText(z)}${shrunk ? ' (wide parts shrunk to fit)' : ''}`,
      `${KEY_IN}   zoom in`,
      `${KEY_OUT}   zoom out`,
      'click %   back to 100%',
      SYNC_TEXT[syncStatus].replace('@', acct || 'this account'),
      `Pane Zoom for Gmail${version ? ` v${version}` : ''}`,
    ].join('\n'));
    out.disabled = z <= MIN;
    inn.disabled = z >= MAX;
  }

  // ---- placement ---------------------------------------------------------
  // The reading pane = nearest pane-sized scrolling ancestor of the open
  // conversation. Null when none is open.
  function paneRect(anchor) {
    if (!anchor) return null;
    for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (r.width < 250 || r.height < 150) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return r;
    }
    const main = anchor.closest('[role="main"]');
    return main ? main.getBoundingClientRect() : null;
  }

  let lastPos = null;
  function place(r) {
    const pos = r ? `${Math.round(r.left + 8)},${Math.round(Math.max(r.top, 0) + 8)}` : '';
    if (pos === lastPos) return;
    lastPos = pos;
    if (!r) { bar.classList.remove('gpz-on'); return; }
    const [x, y] = pos.split(',');
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
    bar.classList.add('gpz-on');
  }

  // ---- main loop (Gmail is a SPA: panes come and go without events) ---------
  function tick() {
    if (!bar.isConnected && document.body) document.body.append(bar);
    findAccount();
    if (document.documentElement.style.getPropertyValue(VAR) !== String(defZoom())) {
      document.documentElement.style.setProperty(VAR, String(defZoom()));
    }

    const bodies = [...document.querySelectorAll('.a3s')].filter(shown);
    for (const b of bodies) { evenText(b); fitBody(b, zoomFor(senderOf(b))); }

    // The subject follows the newest open message: its sender's zoom and its
    // text size, so title and body read at the same size.
    const subject = firstShown('h2.hP');
    if (subject) {
      const last = bodies[bodies.length - 1];
      const z = String(last ? zoomFor(senderOf(last)) : defZoom());
      if (subject.style.zoom !== z) subject.style.zoom = z;
      const size = last ? evenText(last) : 0;
      if (size && subject.style.getPropertyValue('font-size') !== `${size}px`) {
        subject.style.setProperty('font-size', `${size}px`, 'important');
        subject.style.setProperty('line-height', 'normal', 'important');
      }
    }

    const pane = paneRect(subject || bodies[0]);
    focus = pickFocus(bodies, pane);
    render();
    place(pane);
  }

  // ---- shortcuts: Cmd/Ctrl + Shift + (= or +) / (- or _) -----------------
  window.addEventListener('keydown', (e) => {
    if (!e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
    let d = 0;
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') d = 1;
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '_' || e.key === '-') d = -1;
    if (!d) return;
    e.preventDefault();           // stop Chrome's whole-page zoom
    e.stopImmediatePropagation(); // and Gmail's own handlers
    step(d);
  }, true);

  tick();
  setInterval(tick, 300);
  window.addEventListener('resize', tick);
})();
