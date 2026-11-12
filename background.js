// Shows the version in the toolbar icon's right-click menu and hover title.
const { name, version } = chrome.runtime.getManifest();

function setup() {
  chrome.action.setTitle({ title: `${name} v${version}` });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'gpz-version', title: `Version ${version}`, contexts: ['action'], enabled: false });
  });
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
