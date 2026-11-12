# Gmail Pane Zoom

A Chrome extension that zooms only Gmail's reading pane. A floating `[−][100%][+]` control sits at the
top-left of the open conversation. It zooms the subject and message bodies and leaves the inbox list,
sidebars and toolbars as they are.

![icon](icons/icon-128.png)

## What it does

- **Per-sender zoom.** The level is saved for the sender of the message you're reading, e.g. GitHub
  at 110% and a newsletter at 130%. Senders you haven't set yet open at the last level you picked.
- **Controls.** `+` / `−` change the zoom in 10% steps, from 50% to 300%. Clicking the percentage sets
  that sender back to 100%. Hover over the percentage to see which sender it applies to.
- **Shortcuts.** `Cmd+Shift+=` / `Cmd+Shift+-` on Mac, `Ctrl+Shift+=` / `Ctrl+Shift+-` elsewhere.
  While Gmail has focus they replace Chrome's whole-page zoom.
- **No sideways scrolling.** Fixed-width HTML emails (600px receipts and newsletters) are reflowed to
  the pane width when zoomed. If a message still won't fit, for example because of a long unbreakable
  line, that message's zoom is capped so it just fits, never below 100%. The tooltip shows when this
  happens.
- **Threads.** Each message uses its own sender's zoom. The control acts on the message under a
  reading line a quarter of the way down the pane.
- **Storage.** Settings live in `localStorage` (`gmailPaneZoom.v2` on mail.google.com), so they
  survive reloads, cover every Gmail account, and open tabs pick up changes live.
- **Version.** Shown in the toolbar icon's right-click menu, its hover title and the % tooltip.
- The control hides when no conversation is open. The page script runs only on
  `https://mail.google.com/*`; the only permission is `contextMenus` (for the version item).

## Install

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the repo folder.
4. Reload the Gmail tab.

After pulling changes, click the reload arrow on the extension's card, then reload Gmail.

## Build

`./build.mjs` bumps the patch version (every build), re-renders the icons if the SVG changed, and,
if a local CDP bridge is available (`~/.claude/tools/cdp.mjs` or `$CDP_BRIDGE`), reloads the extension
in Chrome and reloads Gmail tabs that have no draft open. `./build.mjs --no-reload` only bumps.

## How it works

- `content.css` zooms `h2.hP` (subject) and `.a3s` (message body), reflows `.a3s.gpz-fit` bodies
  (`max-width: 100%` on everything inside, `min-width: 0` on tables and divs, proportional images,
  wrapping `<pre>`), and styles the control.
- `content.js` finds each body's sender from its header (`.gD[email]`), sets that body's zoom inline,
  measures any remaining overflow and caps the zoom if needed. It places the control at the top-left
  of the nearest pane-sized scrolling ancestor. Gmail is a single-page app, so all of this re-runs
  every 300 ms.
- The DOM is built with `createElement` and styled through CSSOM only, because Gmail enforces Trusted
  Types and a strict CSP.

## Icon

`icons/icon.svg` is the source. To regenerate the PNGs (uses headless Chrome), run
`icons/render-icons.sh`.

## License

MIT
