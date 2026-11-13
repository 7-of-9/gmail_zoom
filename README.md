# Pane Zoom for Gmail

Zoom the email you're reading, not the whole of Gmail. A Chrome extension that puts a small
`[−][100%][+]` control at the top-left of the open conversation and zooms only the subject and the
message, leaving the inbox list, sidebars and toolbars alone.

**Website, demo and screenshots: https://7-of-9.github.io/gmail_zoom/**

![icon](icons/icon-128.png)

## Features

- **One text size for all mail.** Every message's text (headings, small print, list numbers
  included), whoever sent it, and the subject line are set to one base size (14px), then zoomed to
  your level. A 16px Hotmail reply and a 13px Gmail one read exactly the same.
- **Chrome's zoom keys zoom the email.** While a conversation or a draft is open, `Cmd+=` / `Cmd+-`
  / `Cmd+0` on Mac (`Ctrl` elsewhere; Shift optional) change the level instead of Chrome's whole-page
  zoom. On the inbox list with nothing open they stay Chrome's page zoom. The `−` `%` `+` control
  does the same (click the % for 100%); 10% steps from 50% to 300%.
- **Works on all your machines, no login.** The Gmail account you're in is the identity: your level
  syncs to every machine where you open that account with the extension. Each Gmail account has its
  own level.
- **Write at the size you read.** Reply drafts and compose windows are zoomed so their text matches
  (the zoom goes on the editor's wrapper, so the mail you send is unchanged).
- **Wide emails fit.** When zoomed in, fixed-width layouts reflow to the pane; if something still
  sticks out (an Outlook table, a no-wrap signature) only that part is shrunk to fit.
- Hover the control for the shortcuts; the version is in the toolbar icon's right-click menu.
- Before 1.4 the level was per sender. 1.4 starts each account at the median of its old sender
  levels and deletes them, locally and on the server.

## Privacy

- Your Gmail address is read from the tab title and hashed (SHA-256) in the browser before anything
  is stored or sent. The extension doesn't look at who emails you and never reads message content;
  it only changes how text is displayed.
- Sync sends only: a hash of your Gmail address (the record's name), your zoom level and when you
  set it. No names, no mail content, no analytics.
- There is no login, so anyone who already knows your Gmail address could see or change your zoom
  level. The toolbar icon's right-click menu has **Sync zoom levels across machines** (on/off) and
  **Delete synced zoom levels (all machines)**.
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

- `content.js` sets every visible text in each message body to the base size, sets the body's zoom
  inline to the level, and fits anything too wide; the subject and draft editors get the same. It places the control at the top-left of
  the nearest pane-sized scrolling ancestor. Gmail is a single-page app, so all of this re-runs every
  300 ms. The DOM is built with `createElement` and styled through CSSOM only, because Gmail enforces
  Trusted Types and a strict CSP.
- `content.css` zooms `h2.hP` (subject) and `.a3s` (message body) by default and holds the reflow
  rules (`.gpz-fit`, `.gpz-fit2`) and the control's style.
- Settings are one document per Gmail account, `{ d: [zoom, t], x: t }` (level, deletion time; `s`
  held per-sender levels before 1.4), cached in `localStorage` and merged newest-wins. `background.js` posts it to the sync server and returns the merged result; tabs sync on
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
