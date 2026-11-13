# Pane Zoom for Gmail

Zoom the email you're reading, not the whole of Gmail. A Chrome extension that puts a small
`[−][100%][+]` control at the top-left of the open conversation and zooms only the subject and the
message, leaving the inbox list, sidebars and toolbars alone.

**Website, demo and screenshots: https://7-of-9.github.io/gmail_zoom/**

![icon](icons/icon-128.png)

## Features

- **Per-sender zoom.** The level is saved for the sender of the message you're reading, e.g.
  notifications at 110% and a newsletter at 140%. Senders you haven't set yet open at the last level
  you picked.
- **Chrome's zoom keys zoom the email.** While a conversation is open, `Cmd+=` / `Cmd+-` / `Cmd+0`
  on Mac (`Ctrl` elsewhere; Shift optional) zoom the message instead of Chrome's whole page. With
  only a compose or draft window open, they zoom just that draft (a separate level, synced). On the
  inbox list with nothing open they stay Chrome's page zoom. Clicking the percentage also sets that sender back to 100%.
  `+` / `−` step 10%, from 50% to 300%.
- **Works on all your machines, no login.** The Gmail account you're in is the identity: levels sync
  to every machine where you open that account with the extension. Each Gmail account has its own
  levels.
- **One text size.** Each message's text (headings, small print, list numbers included) is set to the
  size most of that message already uses, and the subject to the same size, so the conversation
  reads at one size at any zoom. Reply drafts and compose windows are zoomed to match (the zoom goes
  on the editor's wrapper, so the mail you send is unchanged); with no conversation open they use
  the default level.
- **Wide emails fit.** When zoomed in, fixed-width layouts reflow to the pane; if something still
  sticks out (an Outlook table, a no-wrap signature) only that part is shrunk to fit.
- **Threads.** Each message uses its own sender's zoom. The control acts on the message under a
  reading line a quarter of the way down the pane. Hover the control for the shortcuts; the version
  is in the toolbar icon's right-click menu.

## Privacy

- The sender address is read from the open message's header, and your Gmail address from the tab
  title. Both are hashed (SHA-256) in the browser before anything is stored or sent.
- Sync sends only: a hash of your Gmail address (the record's name), hashes of sender addresses, zoom
  levels and when you set them. No names, no mail content, no analytics.
- There is no login, so anyone who already knows your Gmail address could check whether you've
  zoomed a sender they guess, or change your levels. The toolbar icon's right-click menu has
  **Sync zoom levels across machines** (on/off) and **Delete synced zoom levels (all machines)**.
- Full policy: https://7-of-9.github.io/gmail_zoom/privacy.html

## Install

- **Chrome Web Store**: https://chromewebstore.google.com/detail/egpapgddflnnnhokjchhinhokpgchmnf (in review; listing copy in `store/listing.md`).
- **From source**: clone this repo, open `chrome://extensions`, turn on **Developer mode**, click
  **Load unpacked** and pick the repo folder, then reload Gmail. After pulling changes, click the
  reload arrow on the extension's card and reload Gmail.

## Develop

- `./build.mjs` bumps the patch version (every build), re-renders the icons if the SVG changed, and,
  if a local CDP bridge is available (`~/.claude/tools/cdp.mjs` or `$CDP_BRIDGE`), reloads the
  extension in Chrome and reloads Gmail tabs that have no draft open. `--no-reload` only bumps;
  `--zip` also writes the store upload `dist/pane-zoom-for-gmail-<version>.zip`.
- Tests: `node test/fit.test.mjs` (zoom, fit and text sizes on a mock pane in headless Chrome),
  `node test/sha256.test.mjs` (the in-page SHA-256 against Node's), `node --test server/` (merge
  rules).
- Site and media: `docs/` is the GitHub Pages site; `docs/demo/` runs the real `content.js` on a fake
  mail client. `node tools/media.mjs` rebuilds the screenshots, store images and demo video from it.

## How it works

- `content.js` finds each body's sender from its header (`.gD[email]`), evens out its text size,
  sets the body's zoom inline, and fits anything too wide. It places the control at the top-left of
  the nearest pane-sized scrolling ancestor. Gmail is a single-page app, so all of this re-runs every
  300 ms. The DOM is built with `createElement` and styled through CSSOM only, because Gmail enforces
  Trusted Types and a strict CSP.
- `content.css` zooms `h2.hP` (subject) and `.a3s` (message body) by default and holds the reflow
  rules (`.gpz-fit`, `.gpz-fit2`) and the control's style.
- Settings are one document per Gmail account, `{ d: [zoom, t], s: { senderKey: [zoom, t] }, x: t }`
  (default level, per-sender levels, deletion time), cached in `localStorage` and merged newest-wins
  per entry. `background.js` posts it to the sync server and returns the merged result; tabs sync on
  load, on focus, every 5 minutes and 2 s after a change.

## Sync server

An Azure Function (Windows Consumption plan, Node 22, Southeast Asia) in `server/`:
`POST /api/v1/zoom/{accountHash}` merges the posted document into blob `zoom/{accountHash}.json` and
returns the result; `GET` returns it. Records untouched for a year are deleted by a storage lifecycle
rule. Deploy with `server/deploy.sh` (needs `az login`). One-time setup, already done:

```sh
az group create -n panezoom -l southeastasia
az storage account create -n panezoomsync -g panezoom -l southeastasia --sku Standard_LRS
az storage container create --account-name panezoomsync -n zoom
az functionapp create -g panezoom -n panezoom-sync --storage-account panezoomsync \
  --consumption-plan-location southeastasia --runtime node --runtime-version 22 \
  --functions-version 4 --os-type Windows --disable-app-insights true
```

## Icon

`icons/icon.svg` is the source. To regenerate the PNGs (uses headless Chrome), run
`icons/render-icons.sh`.

## License

MIT. Gmail is a trademark of Google LLC; this project is not affiliated with Google.
