// Pane Zoom for Gmail: floating − / + at the top-left of the reading pane that
// zoom only the open conversation (subject + message bodies) and drafts.
//
// - One text size everywhere: every message's text, the subject and drafts are
//   set to one base size (BASE), so all mail reads alike, then zoomed by one
//   reading level. The level is per Gmail account and synced across your
//   machines with no login: the Gmail account you're in is the identity.
// - Zoomed fixed-width HTML emails are reflowed to the pane width; anything
//   that still won't fit is shrunk on its own (see fitBody).
// - Shortcuts: Cmd+= / Cmd+- / Cmd+0 (Ctrl on Windows/Linux), Shift optional.
//   While a conversation or a draft is open they replace Chrome's page zoom.
//
// DOM is built with createElement/textContent and styled via CSSOM only,
// because Gmail enforces Trusted Types and a strict CSP.
(() => {
  'use strict';
  if (window.top !== window || document.getElementById('gpz-bar')) return;

  const LOCAL = 'gmailPaneZoom.v3.';  // + account key: sync document, below
  const OLD = 'gmailPaneZoom.v2';     // before sync: {def, senders: {address: zoom}}
  const OLDER = 'gmailPaneZoom';      // v1: one global number
  const VAR = '--gpz-zoom';           // the level, read by content.css
  const BASE = 14;                    // px: every message's text, before zoom (Gmail's header text size)
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

  // ---- settings: { d: [zoom, t], s: { key: [zoom, t] }, x: t } -------------
  // d = the reading level, t = when it was set (ms); the newest t wins when
  // tabs or machines merge. s = per-sender levels from before one-size
  // (1.4); only read once, to pick the first level. x = when synced data was
  // deleted (toolbar menu): anything set before it is dropped.
  const valid = (e) => Array.isArray(e) && +e[0] >= MIN && +e[0] <= MAX && +e[1] >= 0;
  function mergeInto(doc, other) {
    let changed = false;
    if (!other || typeof other !== 'object') return false;
    if (+other.x > doc.x) {
      doc.x = +other.x;
      if (doc.d && doc.d[1] <= doc.x) doc.d = null;
      for (const k of Object.keys(doc.s)) if (doc.s[k][1] <= doc.x) delete doc.s[k];
      changed = true;
    }
    const live = (e) => valid(e) && +e[1] > doc.x;
    if (live(other.d) && (!doc.d || +other.d[1] > doc.d[1])) { doc.d = [clamp(+other.d[0]), +other.d[1]]; changed = true; }
    for (const [k, e] of Object.entries(other.s && typeof other.s === 'object' ? other.s : {})) {
      if (live(e) && (!doc.s[k] || +e[1] > doc.s[k][1])) { doc.s[k] = [clamp(+e[0]), +e[1]]; changed = true; }
    }
    return changed;
  }
  const blank = () => ({ d: null, s: {}, x: 0 });
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

  // Settings from before sync (one shared level), stamped t=1 so a real change
  // from any machine wins over it.
  function legacy() {
    const doc = blank();
    const o = readJSON(OLD);
    const z = o && typeof o === 'object' ? +o.def : parseFloat(readJSON(OLDER));
    if (z) doc.d = [clamp(z), 1];
    return doc;
  }
  // Coming from per-sender levels (before 1.4): unless the level was changed
  // since, start it from their median, not from whichever sender was zoomed
  // last. Then delete them: x = the newest one's time drops them here, on the
  // server and on every machine as it syncs. Stamped just after, so the level
  // survives, every machine picks the same value, and any later change wins.
  // Nothing writes sender entries any more, so this runs once per account.
  function fromSenders(doc) {
    const es = Object.values(doc.s);
    if (!es.length) return;
    const newest = Math.max(...es.map((e) => e[1]));
    if (!doc.d || doc.d[1] <= newest) {
      const zs = es.map((e) => e[0]).sort((a, b) => a - b);
      doc.d = [clamp(zs[(zs.length - 1) >> 1]), newest + 1];
    }
    doc.x = Math.max(doc.x, newest);
    doc.s = {};
  }
  function load() {
    const doc = blank();
    if (!mergeInto(doc, readJSON(LOCAL + acctKey))) mergeInto(doc, legacy());
    fromSenders(doc);
    return doc;
  }
  let state = legacy(); // until the account is known
  const save = () => {
    if (!acctKey) return;
    try { localStorage.setItem(LOCAL + acctKey, JSON.stringify(state)); } catch { /* blocked: session only */ }
  };
  const level = () => (state.d ? state.d[0] : 1);

  // Another Gmail tab of this account changed the settings: follow.
  window.addEventListener('storage', (e) => {
    if (acctKey && e.key === LOCAL + acctKey) { state = load(); tick(); }
  });

  // ---- sync across machines (background.js talks to the server) -----------
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
    if (r && r.off) return;
    if (!r || !r.doc) { syncSoon(60000); return; } // offline or server down: retry
    if (mergeInto(state, r.doc)) { save(); tick(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSync > 30000) sync();
  });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, SYNC_EVERY);
  try {
    chrome.storage.onChanged.addListener((c) => { // toolbar menu
      if (c.forgetAt && mergeInto(state, { x: c.forgetAt.newValue })) { save(); tick(); }
      if (c.syncOff || c.forgetAt) sync();
    });
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
    // remember this account's key so "Delete synced zoom levels" can reach it
    try {
      chrome.storage.local.get('accounts').then(({ accounts = [] }) => {
        if (!accounts.includes(acctKey)) chrome.storage.local.set({ accounts: [...accounts, acctKey] });
      }, () => {});
    } catch { /* orphaned */ }
  }

  const shown = (el) => el.getBoundingClientRect().width > 0;
  const firstShown = (sel) => {
    for (const el of document.querySelectorAll(sel)) if (shown(el)) return el;
    return null;
  };

  // ---- one text size everywhere --------------------------------------------
  // Emails come in every size (13px Gmail, 16px Outlook and Hotmail, 9pt
  // signatures, big headings) and Gmail's subject is far bigger than any of
  // them. Every visible piece of text in every body is set to BASE (the
  // subject and drafts too, see tick and zoomDrafts), so the reading level
  // means the same on-screen size for all mail. Text under 4px is left alone:
  // it's hidden on purpose (preview-text and spacer tricks).
  const evened = new WeakMap(); // body -> element count when done
  const INVISIBLE = /[\s ͏​-‍⁠﻿]+/g;

  function evenText(body) {
    const n = body.getElementsByTagName('*').length; // cheap: changes only when Gmail adds content
    if (evened.get(body) === n) return;
    const els = new Set([body, ...body.querySelectorAll('li')]); // li: list numbers
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (t.parentElement && t.data.replace(INVISIBLE, '')) els.add(t.parentElement);
    }
    const px = `${BASE}px`;
    for (const el of els) {
      if (el.style.getPropertyValue('font-size') === px) continue;
      if (!(parseFloat(getComputedStyle(el).fontSize) >= 4)) continue;
      el.style.setProperty('font-size', px, 'important');
      // a fixed line height made for smaller text would make lines overlap
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      if (lh && lh < BASE * 1.15) el.style.setProperty('line-height', 'normal', 'important');
    }
    evened.set(body, body.getElementsByTagName('*').length);
  }

  // ---- drafts: write at the size you read ---------------------------------
  // Inline replies and compose windows (Gmail's editor, [g_editable]) are
  // zoomed so their text is BASE at the reading level on screen, like the
  // messages. The zoom goes on the editor's wrapper, never inside the editor,
  // so nothing changes in the mail you send.
  const draftOpen = () => [...document.querySelectorAll('[g_editable="true"]')].some(shown);
  function zoomDrafts() {
    for (const ed of document.querySelectorAll('[g_editable="true"]')) {
      const wrap = ed.parentElement;
      if (!wrap || !shown(ed)) continue;
      const own = parseFloat(getComputedStyle(ed).fontSize) || 13;
      const z = String(Math.round(level() * (BASE / own) * 100) / 100);
      if (wrap.style.zoom !== z) wrap.style.zoom = z;
    }
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
  const KEY_IN = mac ? '⌘+' : 'Ctrl++';
  const KEY_OUT = mac ? '⌘−' : 'Ctrl+−';
  const KEY_RESET = mac ? '⌘0' : 'Ctrl+0';

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
  const pct = button('', () => setLevel(1), 'gpz-pct', `Back to 100% (${KEY_RESET})`);
  const inn = button('+', () => step(1), '', `Zoom in (${KEY_IN})`);
  const tip = document.createElement('div'); // instant hover help, see content.css
  tip.id = 'gpz-tip';


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

  let reading = false; // a conversation is open

  function setLevel(z) {
    state.d = [clamp(z), Date.now()];
    save();
    syncSoon(2000);
    tick();
  }
  const step = (d) => setLevel(level() + d * STEP);

  const setText = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  tip.textContent = `${KEY_IN}  zoom in\n${KEY_OUT}  zoom out\n${KEY_RESET}  100%`; // hover help: shortcuts only

  function render() {
    const z = level();
    setText(pct, 'textContent', pctText(z));
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
    const z = level();
    if (document.documentElement.style.getPropertyValue(VAR) !== String(z)) {
      document.documentElement.style.setProperty(VAR, String(z));
    }

    const bodies = [...document.querySelectorAll('.a3s')].filter(shown);
    for (const b of bodies) { evenText(b); fitBody(b, z); }

    // The subject: same size and level as the message text.
    const subject = firstShown('h2.hP');
    if (subject) {
      if (subject.style.zoom !== String(z)) subject.style.zoom = String(z);
      if (subject.style.getPropertyValue('font-size') !== `${BASE}px`) {
        subject.style.setProperty('font-size', `${BASE}px`, 'important');
        subject.style.setProperty('line-height', 'normal', 'important');
      }
    }
    zoomDrafts();

    const pane = paneRect(subject || bodies[0]);
    reading = bodies.length > 0;
    render();
    place(pane);
  }

  // ---- shortcuts: Chrome's zoom keys, Cmd/Ctrl + (= or +) / (- or _) / 0 ----
  // Shift optional. With a conversation or a draft open they change the
  // reading level (messages, subject and drafts, never Gmail's own UI).
  // Otherwise (inbox list, nothing to zoom) Chrome's page zoom keeps working.
  window.addEventListener('keydown', (e) => {
    if (e.altKey || !(e.metaKey || e.ctrlKey)) return;
    if (!reading && !draftOpen()) return;
    let act = null;
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') act = () => step(1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '_' || e.key === '-') act = () => step(-1);
    else if (!e.shiftKey && (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0')) act = () => setLevel(1);
    if (!act) return;
    e.preventDefault();           // stop Chrome's whole-page zoom
    e.stopImmediatePropagation(); // and Gmail's own handlers
    act();
  }, true);

  tick();
  setInterval(tick, 300);
  window.addEventListener('resize', tick);
})();
