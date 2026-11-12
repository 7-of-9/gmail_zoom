// Pane Zoom for Gmail: cross-machine sync of per-sender zoom levels.
//   GET  /api/v1/zoom/{acct}  stored document
//   POST /api/v1/zoom/{acct}  merge the posted document in, return the result
// {acct} is a SHA-256 hash of the Gmail address, made in the extension.
// Stored as blob zoom/{acct}.json. Clients always post their whole document,
// so a write lost to a race is restored by that client's next sync.
'use strict';
const { clean, merge } = require('./merge');

const ACCT = /^[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 256 * 1024;
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

// The Functions worker may hand over JSON blobs already parsed.
const parse = (s) => {
  if (s && typeof s === 'object' && !Buffer.isBuffer(s)) return s;
  try { return JSON.parse(String(s)); } catch { return null; }
};

module.exports = async function (context, req) {
  const reply = (status, body) => {
    context.res = { status, headers: HEADERS, body: body === undefined ? '' : JSON.stringify(body) };
  };
  if (req.method === 'OPTIONS') return reply(204);
  if (!ACCT.test(context.bindingData.acct || '')) return reply(400, { error: 'bad account key' });

  const stored = clean(parse(context.bindings.stored));
  if (req.method === 'GET') return reply(200, stored);

  const raw = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || null);
  if (raw.length > MAX_BODY) return reply(413, { error: 'too large' });
  const incoming = parse(raw);
  if (!incoming || typeof incoming !== 'object') return reply(400, { error: 'bad document' });

  const { doc, changed } = merge(stored, clean(incoming));
  if (changed) context.bindings.saved = JSON.stringify(doc);
  return reply(200, doc);
};
