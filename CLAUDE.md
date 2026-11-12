# gmail_zoom: agent rules

- **Build = `./build.mjs`, after every change.** It bumps the patch version in `manifest.json` (shown in
  the toolbar icon's right-click menu, its hover title and the % tooltip), reloads the unpacked
  extension in Chrome through the local CDP bridge (`~/.claude/tools/cdp.mjs`) and reloads Gmail tabs
  that have no draft open. Never hand over a change without building it.
- **Verify on live Gmail through the bridge**, not only on mock pages. Read structure, zoom values and
  sender domains; don't dump mail content and don't change saved zoom settings while testing.
- **Gmail selectors** the extension depends on: `.a3s` (message body), `h2.hP` (subject),
  `.gD[email]` (sender). Check them live before changing any.
- **Public repo.** No secrets and no personal data (addresses, mail content, screenshots of mail) in
  code, tests, docs or commit messages.
