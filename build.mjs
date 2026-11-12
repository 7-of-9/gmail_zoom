#!/usr/bin/env node
// Build: bump the patch version, re-render icons if the SVG changed, then (if
// the local CDP bridge is available) reload the unpacked extension in Chrome
// and reload Gmail tabs that don't have a draft open.
//   ./build.mjs              bump + reload
//   ./build.mjs --no-reload  bump only
//   ./build.mjs --zip        also write dist/pane-zoom-for-gmail-<version>.zip
//                            (the Chrome Web Store upload: runtime files only)
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// 1. version bump (patch), keeping the manifest's formatting
const mf = join(ROOT, 'manifest.json');
let version;
writeFileSync(mf, readFileSync(mf, 'utf8').replace(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/, (_, a, b, c) => {
  version = `${a}.${b}.${+c + 1}`;
  return `"version": "${version}"`;
}));
if (!version) throw new Error('no x.y.z version in manifest.json');
console.log(`version ${version}`);

// 2. icons
const svg = join(ROOT, 'icons/icon.svg');
const png = join(ROOT, 'icons/icon-128.png');
if (!existsSync(png) || statSync(svg).mtimeMs > statSync(png).mtimeMs) {
  execFileSync(join(ROOT, 'icons/render-icons.sh'), { stdio: 'inherit' });
}

// 3. store package
if (process.argv.includes('--zip')) {
  const zip = join(ROOT, 'dist', `pane-zoom-for-gmail-${version}.zip`);
  execFileSync('mkdir', ['-p', join(ROOT, 'dist')]);
  execFileSync('rm', ['-f', zip]);
  execFileSync('zip', ['-q', '-X', zip, 'manifest.json', 'background.js', 'content.js', 'content.css',
    'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png'], { cwd: ROOT });
  console.log(`package ${zip}`);
}

// 4. reload in Chrome via the CDP bridge
if (process.argv.includes('--no-reload')) process.exit(0);
const BRIDGE = process.env.CDP_BRIDGE || join(homedir(), '.claude/tools/cdp.mjs');
if (!existsSync(BRIDGE)) {
  console.log('No CDP bridge: reload the extension in chrome://extensions, then reload Gmail.');
  process.exit(0);
}
const cdp = await import(pathToFileURL(BRIDGE).href);
const { id } = await cdp.send('Extensions.loadUnpacked', { path: ROOT });
console.log(`extension reloaded (${id})`);
for (const t of await cdp.targets('page')) {
  if (!t.url.startsWith('https://mail.google.com/')) continue;
  const { sessionId } = await cdp.attach(t.targetId);
  try {
    if (await cdp.evaluate(sessionId, '!!document.querySelector(\'[g_editable="true"]\')')) {
      console.log('Gmail tab with a draft open: not reloaded');
    } else {
      await cdp.send('Page.reload', {}, sessionId);
      console.log('Gmail tab reloaded');
    }
  } finally {
    await cdp.detach(sessionId);
  }
}
process.exit(0);
