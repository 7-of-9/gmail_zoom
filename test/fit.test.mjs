#!/usr/bin/env node
// Loads test/fit.html in headless Chrome at a few zoom levels and checks that
// every message body keeps the asked-for zoom and nothing sticks out.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = join(dirname(fileURLToPath(import.meta.url)), 'fit.html');
let failed = 0;
for (const z of [0.9, 1.3, 1.7, 3]) {
  const prof = mkdtempSync(join(tmpdir(), 'gpz-fit-'));
  try {
    const dom = execFileSync(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--allow-file-access-from-files',
      '--virtual-time-budget=4000', '--window-size=1000,1000', '--dump-dom', `file://${page}?z=${z}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const res = JSON.parse(dom.match(/RESULT (\{.*?\})<\/pre>/s)[1].replace(/&quot;/g, '"'));
    const subj = res.subject;
    delete res.subject;
    // draft text on screen = newest body text on screen; nothing set on the editor itself
    const dr = res.draft;
    delete res.draft;
    const want = Math.round(z * parseFloat(subj.newestBody) / parseFloat(dr.editorFont) * 100) / 100;
    const draftOk = parseFloat(dr.wrapZoom) === want && dr.editorStyleZoom === '';
    if (!draftOk) failed++;
    console.log(`${draftOk ? 'ok  ' : 'FAIL'} z=${z} draft ${JSON.stringify({ ...dr, want })}`);
    const subjOk = parseFloat(subj.zoom) === z && subj.size === '14px';
    if (!subjOk) failed++;
    console.log(`${subjOk ? 'ok  ' : 'FAIL'} z=${z} subject ${JSON.stringify(subj)}`);
    for (const [id, r] of Object.entries(res)) {
      const ok = parseFloat(r.zoom) === z && (z <= 1 || r.overflowPx <= 1) && r.sizes.join() === '14px';
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} z=${z} ${id} ${JSON.stringify(r)}`);
    }
  } finally {
    rmSync(prof, { recursive: true, force: true });
  }
}
// Chrome's zoom keys (no Shift) zoom the pane instead of the page
{
  const prof = mkdtempSync(join(tmpdir(), 'gpz-keys-'));
  try {
    const dom = execFileSync(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--allow-file-access-from-files',
      '--virtual-time-budget=4000', '--window-size=1000,1000', '--dump-dom', `file://${page}?z=1.3&keys=1`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const r = JSON.parse(dom.match(/KEYS (\{.*?\})<\/pre>/s)[1].replace(/&quot;/g, '"'));
    const ok = r.plusPrevented && r.minusPrevented && r.zeroPrevented && r.before === '130%'
      && r.afterPlus === '140%' && r.afterMinus === '130%' && r.afterZero === '100%' && r.tip === 3;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} keys ${JSON.stringify(r)}`);
  } finally {
    rmSync(prof, { recursive: true, force: true });
  }
}
// Compose window, no conversation: the keys change the level for the draft,
// and go back to Chrome once it's closed
{
  const prof = mkdtempSync(join(tmpdir(), 'gpz-compose-'));
  try {
    const dom = execFileSync(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--allow-file-access-from-files',
      '--virtual-time-budget=5000', '--window-size=1000,1000', '--dump-dom', `file://${join(dirname(page), 'compose.html')}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const r = JSON.parse(dom.match(/COMPOSE (\{.*?\})<\/pre>/s)[1].replace(/&quot;/g, '"'));
    // wrapper zoom = level x 14px base / 13px editor text
    const ok = r.start === '1.29' && r.plus && r.afterPlus === '1.4' && r.afterPlus2 === '1.51' && r.minus
      && r.afterMinus === '1.4' && r.zero && r.afterZero === '1.08' && r.editorStyleZoom === '' && !r.noDraftPrevented;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} compose ${JSON.stringify(r)}`);
  } finally {
    rmSync(prof, { recursive: true, force: true });
  }
}
// Upgrade from per-sender levels: median becomes the level, senders deleted
{
  const prof = mkdtempSync(join(tmpdir(), 'gpz-migrate-'));
  try {
    const dom = execFileSync(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--allow-file-access-from-files',
      '--virtual-time-budget=4000', '--dump-dom', `file://${join(dirname(page), 'migrate.html')}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const r = JSON.parse(dom.match(/MIGRATE (\{.*?\})<\/pre>/s)[1].replace(/&quot;/g, '"'));
    const ok = r.pct === '100%' && r.doc.d[0] === 1 && r.doc.d[1] === 3001 && r.doc.x === 3000 && !Object.keys(r.doc.s).length;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} migrate ${JSON.stringify(r)}`);
  } finally {
    rmSync(prof, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
