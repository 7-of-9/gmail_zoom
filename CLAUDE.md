# gmail_zoom (Pane Zoom for Gmail): agent rules

- **Build = `./build.mjs`, after every change.** It bumps the patch version in `manifest.json` (shown in
  the toolbar icon's right-click menu and its hover title), reloads the unpacked
  extension in Chrome through the local CDP bridge (`~/.claude/tools/cdp.mjs`) and reloads Gmail tabs
  that have no draft open. Never hand over a change without building it.
- **Tests before landing**: `node test/fit.test.mjs`, `node test/sha256.test.mjs`, `node --test server/`.
  A fit or text-size bug seen in real mail gets a fake-content case in `test/fit.html` first.
- **Verify on live Gmail through the bridge**, not only on mock pages. Read structure, zoom values,
  font sizes, counts and sender domains; don't dump mail content and don't change saved zoom settings
  while testing. To look at a specific thread, open it in a temporary background tab
  (`Target.createTarget` + `Emulation.setFocusEmulationEnabled`, search `from:<domain>` in the right
  `/u/N/` account), measure, close it. Don't navigate the user's own tabs.
- **Gmail selectors** the extension depends on: `.a3s` (message body), `h2.hP` (subject),
  `[g_editable="true"]` (draft editor; zoom its parent, never the editor), and the tab title
  `<view> - <address> - <Gmail or org name>` (account).
  Check them live before changing any.
- **One size, one level**: every message's text, the subject and drafts render at `BASE` (14px) times
  one reading level per account. No per-sender levels (removed in 1.4 at the user's direction:
  uniform size across all mail beats per-sender tuning); don't reintroduce per-message variation.
- **Sync**: the server only ever sees a SHA-256 hash of `gpz1|<address>` (the account key) and the
  level. Never send or log a plaintext address, and don't read sender addresses.
  The merge rules exist twice (`content.js` `mergeInto`, `server/zoom/merge.js`): change both together.
  Deploy the server with `server/deploy.sh` (Azure: resource group `panezoom`, app `panezoom-sync`,
  storage `panezoomsync`, Southeast Asia). Test against throwaway account keys and delete their blobs.
- **Release**: `./build.mjs --zip` makes `dist/pane-zoom-for-gmail-<version>.zip`; upload it on the store
  item `egpapgddflnnnhokjchhinhokpgchmnf` (Package tab), then Submit for review. Every store field
  lives in `store/listing.md`; store images in `store/img/`. The store name must keep the form
  "… for Gmail" (Google trademark rules).
- **Site and media**: `docs/` is the GitHub Pages site (main branch, `/docs`). All screenshots, store
  images and the demo video come from `docs/demo/` (fake mail, running the real `content.js`) via
  `node tools/media.mjs`. Re-run it when the UI changes. Never use real Gmail for media.
- **Public repo.** No secrets and no personal data (addresses, mail content, screenshots of mail) in
  code, tests, docs or commit messages.
