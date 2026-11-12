// Background worker:
// - version in the toolbar icon's right-click menu and hover title
// - "Sync zoom levels across machines" switch in that menu (on by default)
// - talks to the sync server for the Gmail tabs (content.js sends
//   {type: 'gpz-sync', acct, doc}; the reply is the merged document)
const { name, version } = chrome.runtime.getManifest();
const API = 'https://panezoom-sync.azurewebsites.net/api/v1/zoom/';
const SYNC_ITEM = 'gpz-sync';

const syncOn = async () => !(await chrome.storage.local.get('syncOff')).syncOff;

async function setup() {
  chrome.action.setTitle({ title: `${name} v${version}` });
  const checked = await syncOn();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'gpz-version', title: `Version ${version}`, contexts: ['action'], enabled: false });
    chrome.contextMenus.create({ id: SYNC_ITEM, type: 'checkbox', checked, title: 'Sync zoom levels across machines', contexts: ['action'] });
  });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === SYNC_ITEM) chrome.storage.local.set({ syncOff: !info.checked });
});

async function sync(acct, doc) {
  if (!(await syncOn())) return { off: true };
  if (!/^[A-Za-z0-9_-]{43}$/.test(acct || '')) return { error: 'bad account key' };
  // text/plain keeps this a simple CORS request (no preflight)
  const r = await fetch(API + acct, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(doc) });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return { doc: await r.json() };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'gpz-sync' || sender.id !== chrome.runtime.id) return false;
  sync(msg.acct, msg.doc).then(reply, (e) => reply({ error: String(e) }));
  return true; // reply comes later
});
