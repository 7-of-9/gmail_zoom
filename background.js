// Background worker:
// - version in the toolbar icon's right-click menu and hover title
// - "Sync zoom levels across machines" switch in that menu (on by default)
// - "Delete synced zoom levels (all machines)" in that menu
// - talks to the sync server for the Gmail tabs (content.js sends
//   {type: 'gpz-sync', acct, doc}; the reply is the merged document)
const { name, version } = chrome.runtime.getManifest();
const API = 'https://panezoom-sync.azurewebsites.net/api/v1/zoom/';
const SYNC_ITEM = 'gpz-sync';
const FORGET_ITEM = 'gpz-forget';

const syncOn = async () => !(await chrome.storage.local.get('syncOff')).syncOff;

async function setup() {
  chrome.action.setTitle({ title: `${name} v${version}` });
  const checked = await syncOn();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'gpz-version', title: `Version ${version}`, contexts: ['action'], enabled: false });
    chrome.contextMenus.create({ id: SYNC_ITEM, type: 'checkbox', checked, title: 'Sync zoom levels across machines', contexts: ['action'] });
    chrome.contextMenus.create({ id: FORGET_ITEM, title: 'Delete synced zoom levels (all machines)', contexts: ['action'] });
  });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === SYNC_ITEM) chrome.storage.local.set({ syncOff: !info.checked });
  if (info.menuItemId === FORGET_ITEM) {
    // Every Gmail account this browser has used: erase on the server now
    // (works even with sync off); open tabs clear locally via storage.onChanged,
    // other machines when they next sync.
    const x = Date.now();
    const { accounts = [] } = await chrome.storage.local.get('accounts');
    await Promise.allSettled(accounts.map((a) => post(a, { x })));
    chrome.storage.local.set({ forgetAt: x });
  }
});

// text/plain keeps this a simple CORS request (no preflight)
const post = (acct, doc) => fetch(API + acct, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(doc) });

async function sync(acct, doc) {
  if (!(await syncOn())) return { off: true };
  if (!/^[A-Za-z0-9_-]{43}$/.test(acct || '')) return { error: 'bad account key' };
  const r = await post(acct, doc);
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return { doc: await r.json() };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'gpz-sync' || sender.id !== chrome.runtime.id) return false;
  sync(msg.acct, msg.doc).then(reply, (e) => reply({ error: String(e) }));
  return true; // reply comes later
});
