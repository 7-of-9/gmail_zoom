#!/usr/bin/env node
// content.js carries its own synchronous SHA-256; check it against Node's.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
const src = readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const code = src.match(/  const K = \[[\s\S]*?\n  const b64url = [^\n]*\n/)[0];
const { sha256, b64url } = new Function(`${code}; return { sha256, b64url };`)();
let n = 0;
const cases = ['', 'abc', 'gpz1|someone@example.com', 'é✓😀', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)];
for (let i = 0; i < 200; i++) cases.push(randomBytes(i).toString('latin1'));
for (const c of cases) {
  const want = createHash('sha256').update(c, 'utf8').digest();
  const got = Buffer.from(sha256(c));
  if (!got.equals(want)) { console.log('FAIL', JSON.stringify(c.slice(0, 20)), c.length); n++; }
  if (b64url(sha256(c)) !== want.toString('base64url')) { console.log('FAIL b64url', c.length); n++; }
}
console.log(n ? `${n} failures` : `ok: ${cases.length} hashes match`);
process.exit(n ? 1 : 0);
