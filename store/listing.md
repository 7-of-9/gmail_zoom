# Chrome Web Store listing: Pane Zoom for Gmail

Source of truth for every field of the store submission. Images are in `store/img/` and are rebuilt
from the demo page by `tools/media.mjs`. The upload package is `dist/pane-zoom-for-gmail-<version>.zip`,
made by `./build.mjs --zip`.

## Item

- Item ID `egpapgddflnnnhokjchhinhokpgchmnf`, listing https://chromewebstore.google.com/detail/egpapgddflnnnhokjchhinhokpgchmnf
- 1.3.8 submitted 2026-11-12 (replaced 1.3.6 before review), publishes automatically when approved.
- Next store update (after 1.3.8 is approved): upload the current package and re-paste the description
  (it now mentions drafts following the zoom, added in 1.3.9, and draft-only zoom keys, 1.3.10). Updates: upload a new
  `./build.mjs --zip` package on the item's Package tab, then Submit for review.
- The Test instructions tab has no credentials (Chrome autofill put some there once; clear them).

## Package

- Upload: `dist/pane-zoom-for-gmail-<version>.zip` (manifest, background.js, content.js, content.css,
  icons). No remote code.

## Store listing tab

Paste the description with each paragraph unwrapped onto one line (the block below is wrapped for
reading here; the store keeps every line break).

- **Name** (from the manifest): Pane Zoom for Gmail
- **Summary** (from the manifest, 132 max): Zoom only the Gmail reading pane: one text size for all mail,
  synced across your machines. No login. Cmd/Ctrl +/− zoom.
- **Category**: Productivity › Communication
- **Language**: English (United States)
- **Icon**: `icons/icon-128.png`
- **Screenshots** (1280×800): `store/img/screenshot-1.png` … `screenshot-4.png`
- **Small promo tile** (440×280): `store/img/promo-440x280.png`
- **Marquee** (1400×560): `store/img/marquee-1400x560.png`
- **Homepage URL**: https://7-of-9.github.io/gmail_zoom/
- **Support URL**: https://github.com/7-of-9/gmail_zoom/issues
- **Mature content**: No

### Description

```text
Zoom the email you're reading, not the whole of Gmail.

Chrome's zoom blows up everything: the inbox list, the sidebars, the toolbars. Pane Zoom puts a small
− 100% + control at the top-left of the open conversation and zooms only the subject and the message.

• One text size for all mail. Every message, whoever sent it, and the subject line are set to one
  size, then zoomed to your level. A Hotmail reply and a Gmail one read exactly the same.

• Chrome's zoom keys zoom the email. While a message is open, ⌘+ / ⌘− / ⌘0 on Mac (Ctrl++ /
  Ctrl+− / Ctrl+0 on Windows, Linux and ChromeOS) zoom the message instead of the whole page; with
  only a draft open, they zoom just the draft. Click the percentage to go back to 100%.

• Works on all your machines, without logging in. Your Gmail account is the identity, so your zoom
  level follows you to every computer where you open Gmail with the extension. No account, no
  password, nothing to set up.

• Write at the size you read. Reply drafts and compose windows follow your level too; the mail you
  send is untouched.

• Wide emails fit. Fixed-width newsletters and Outlook tables reflow to the pane instead of running
  off the side.

Privacy

The extension never sends your email address, anyone else's address or any mail content anywhere,
and doesn't look at who emails you. Sync stores a one-way SHA-256 hash of your Gmail address, your
zoom level and when you set it. No analytics, no ads. Because there is no login, someone who
already knows your Gmail address could see or change your zoom level; nothing else is stored. Turn
sync off, or delete your synced level on every machine, from the toolbar icon's right-click menu.
Full policy: https://7-of-9.github.io/gmail_zoom/privacy.html

Free and open source (MIT): https://github.com/7-of-9/gmail_zoom

Gmail is a trademark of Google LLC. Pane Zoom is not affiliated with or endorsed by Google.
```

## Privacy practices tab

- **Single purpose**: Zooms the Gmail reading pane (subject, message text and drafts) at one uniform
  text size, and syncs the user's zoom level across their machines.
- **Permission justifications**:
  - `contextMenus`: the toolbar icon's right-click menu shows the version, the sync on/off switch and
    "Delete synced zoom levels (all machines)".
  - `storage`: remembers the sync on/off switch and the hashed account keys the delete item acts on.
  - Host access `https://mail.google.com/*` (content script): needed to add the zoom control to
    Gmail's reading pane and zoom the open message. No other sites.
- **Remote code**: No, I am not using remote code.
- **Data usage**, collected:
  - Personally identifiable information: yes (a SHA-256 hash of the Gmail address, used as the sync
    key; the address itself is never sent).
  - Personal communications: no from 1.4 (1.3.x synced hashed sender addresses; 1.4 deletes them).
    Untick it with the 1.4 update.
  - Everything else (health, financial, authentication, location, web history, user activity,
    website content): no.
- **Certifications**: tick all three (not sold to third parties; not used or transferred for
  purposes unrelated to the single purpose; not used to determine creditworthiness or for lending).
- **Privacy policy URL**: https://7-of-9.github.io/gmail_zoom/privacy.html

## Distribution tab

- Visibility: Public. Regions: all. Pricing: free.
- Trader declaration: non-trader (individual publishing a free, open-source extension).

## Notes for the reviewer (Test instructions)

```text
No account or login is needed. Open https://mail.google.com, open any conversation. A small
− 100% + control appears at the top-left of the reading pane. Click + or press Cmd/Ctrl+= to
zoom the open message; Cmd/Ctrl+− zooms out; Cmd/Ctrl+0 or clicking the percentage resets to 100%. Hover the
control for the shortcuts. Open a message from another sender: it shows at
the same text size and level. The toolbar icon's right-click menu has the sync switch and the delete item.
```
