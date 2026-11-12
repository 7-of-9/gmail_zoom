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
    const subjOk = parseFloat(subj.zoom) === z && subj.size === subj.newestBody;
    if (!subjOk) failed++;
    console.log(`${subjOk ? 'ok  ' : 'FAIL'} z=${z} subject ${JSON.stringify(subj)}`);
    for (const [id, r] of Object.entries(res)) {
      const ok = parseFloat(r.zoom) === z && (z <= 1 || r.overflowPx <= 1) && r.sizes.length === 1;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} z=${z} ${id} ${JSON.stringify(r)}`);
    }
  } finally {
    rmSync(prof, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
