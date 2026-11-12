// Sync document: { d: [zoom, t], s: { senderKey: [zoom, t] } }
//   d = default level for senders not set yet, s = per-sender levels,
//   t = ms timestamp of the change. Newest t wins, per entry.
// Keys are client-side SHA-256 hashes (base64url); no addresses reach here.
'use strict';

const KEY = /^[A-Za-z0-9_-]{22}$/;
const MAX_ENTRIES = 5000;
const DAY = 86400000;

function entry(v, now) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const z = Math.round(Number(v[0]) * 100) / 100;
  const t = Math.floor(Number(v[1]));
  if (!(z >= 0.5 && z <= 3) || !(t >= 0)) return null;
  return [z, Math.min(t, now + DAY)]; // a fast clock can't win forever
}

// Validate and normalise anything into a document.
function clean(doc, now = Date.now()) {
  const out = { d: null, s: {} };
  if (!doc || typeof doc !== 'object') return out;
  out.d = entry(doc.d, now);
  const s = doc.s && typeof doc.s === 'object' ? doc.s : {};
  let list = [];
  for (const [k, v] of Object.entries(s)) {
    const e = KEY.test(k) && entry(v, now);
    if (e) list.push([k, e]);
  }
  if (list.length > MAX_ENTRIES) list = list.sort((a, b) => b[1][1] - a[1][1]).slice(0, MAX_ENTRIES);
  for (const [k, e] of list) out.s[k] = e;
  return out;
}

// Merge b into a (both clean). Returns { doc, changed }.
function merge(a, b) {
  const doc = { d: a.d, s: { ...a.s } };
  let changed = false;
  if (b.d && (!doc.d || b.d[1] > doc.d[1])) { doc.d = b.d; changed = true; }
  for (const [k, e] of Object.entries(b.s)) {
    const cur = doc.s[k];
    if (!cur || e[1] > cur[1]) { doc.s[k] = e; changed = true; }
  }
  return { doc: clean(doc), changed };
}

module.exports = { clean, merge };
