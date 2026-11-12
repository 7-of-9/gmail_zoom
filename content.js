// Gmail Pane Zoom: floating − / + at the top-left of the reading pane that zoom
// only the open conversation (subject + message bodies).
//
// - Zoom is remembered per sender address (localStorage). Senders you have not
//   set yet use the last level you picked.
// - Zoomed fixed-width HTML emails are reflowed to the pane width (content.css,
//   .gpz-fit); if one still won't fit, that message's zoom is capped (never
//   below 100%) so nothing goes off the side of the pane.
// - Shortcuts: Cmd+Shift+= / Cmd+Shift+- (Ctrl+Shift on Windows/Linux).
//
// DOM is built with createElement/textContent and styled via CSSOM only,
// because Gmail enforces Trusted Types and a strict CSP.
(() => {
  'use strict';
  if (window.top !== window || document.getElementById('gpz-bar')) return;

  const KEY = 'gmailPaneZoom.v2'; // {def, senders: {address: zoom}}
  const OLD_KEY = 'gmailPaneZoom'; // v1: one global number, migrated to def
  const VAR = '--gpz-zoom';        // default level, read by content.css
  const MIN = 0.5;
  const MAX = 3;
  const STEP = 0.1;

  const clamp = (z) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));
  const pctText = (z) => `${Math.round(z * 100)}%`;

  // ---- settings ----------------------------------------------------------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        return { def: clamp(+s.def || 1), senders: s.senders && typeof s.senders === 'object' ? s.senders : {} };
      }
      return { def: clamp(parseFloat(localStorage.getItem(OLD_KEY)) || 1), senders: {} };
    } catch {
      return { def: 1, senders: {} };
    }
  }
  let state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* blocked: session only */ }
  };
  const zoomFor = (sender) => clamp((sender && +state.senders[sender]) || state.def);

  // Another Gmail tab changed the settings: follow.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state = load(); tick(); }
  });

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

  // ---- zoom one body, keeping it inside the pane --------------------------
  const natural = new WeakMap(); // body -> min content width at 100%, screen px

  function fitBody(el, want) {
    const w = el.getBoundingClientRect().width; // screen px it must fit in
    if (!w || !el.clientWidth) return;
    el.classList.toggle('gpz-fit', want > 1);  // reflow fixed-width layouts
    if (want <= 1) natural.delete(el);
    const cur = parseFloat(el.style.zoom) || state.def;
    if (want > 1 && el.scrollWidth > el.clientWidth + 1) {
      // Still too wide after reflow. scrollWidth/clientWidth is a pure ratio,
      // so this gives the content's width at 100% whatever zoom it has now.
      natural.set(el, (w * el.scrollWidth) / el.clientWidth / cur);
    }
    const base = natural.get(el);
    const z = want > 1 && base
      ? Math.max(1, Math.min(want, Math.floor((w / base) * 100) / 100))
      : want;
    if (el.style.zoom !== String(z)) el.style.zoom = String(z);
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
    if (s) state.senders[s] = z;
    state.def = z; // senders not set yet follow your latest choice
    save();
    tick();
  }
  const step = (d) => setFocusZoom(zoomFor(focus ? senderOf(focus) : '') + d * STEP);

  const setText = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };

  function render() {
    const s = focus ? senderOf(focus) : '';
    const z = zoomFor(s);
    const got = focus ? parseFloat(focus.style.zoom) || z : z;
    setText(pct, 'textContent', pctText(z));
    setText(tip, 'textContent', [
      `${s || 'this sender'}: ${pctText(z)}${got < z ? ` (shown at ${pctText(got)} to fit)` : ''}`,
      `${KEY_IN}   zoom in`,
      `${KEY_OUT}   zoom out`,
      'click %   back to 100%',
      `Gmail Pane Zoom${version ? ` v${version}` : ''}`,
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
    if (document.documentElement.style.getPropertyValue(VAR) !== String(state.def)) {
      document.documentElement.style.setProperty(VAR, String(state.def));
    }

    const bodies = [...document.querySelectorAll('.a3s')].filter(shown);
    for (const b of bodies) fitBody(b, zoomFor(senderOf(b)));

    // The subject follows the newest open message's sender.
    const subject = firstShown('h2.hP');
    if (subject) {
      const z = String(bodies.length ? zoomFor(senderOf(bodies[bodies.length - 1])) : state.def);
      if (subject.style.zoom !== z) subject.style.zoom = z;
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
