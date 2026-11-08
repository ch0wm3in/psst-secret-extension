import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { pendingItem, serverItem } from '@/lib/settings';

const SHARE_SELECTION = 'psst-share-selection';
const REVEAL_LINK = 'psst-reveal-link';

async function setupMenus(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: SHARE_SELECTION,
    title: 'Share selection as a whisper',
    contexts: ['selection'],
  });
  const server = await serverItem.getValue();
  if (server) {
    browser.contextMenus.create({
      id: REVEAL_LINK,
      title: 'Reveal whisper',
      contexts: ['link'],
      targetUrlPatterns: [`${server}whisper/*`],
    });
  }
}

let menus = Promise.resolve();
function refreshMenus(): void {
  menus = menus.catch(() => {}).then(setupMenus);
}

/** Read the selection from the page, which keeps line breaks that `selectionText` loses. */
async function readSelection(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<string> {
  if (tab?.id !== undefined) {
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        func: () => window.getSelection()?.toString() ?? '',
      });
      if (typeof result?.result === 'string' && result.result) return result.result;
    } catch {
      // Pages such as the browser's own cannot be scripted.
    }
  }
  return info.selectionText ?? '';
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(refreshMenus);
  browser.runtime.onStartup.addListener(refreshMenus);
  serverItem.watch(refreshMenus);

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === SHARE_SELECTION) {
      await pendingItem.setValue({ kind: 'send', text: await readSelection(info, tab) });
    } else if (info.menuItemId === REVEAL_LINK && info.linkUrl) {
      await pendingItem.setValue({ kind: 'reveal', link: info.linkUrl });
    } else {
      return;
    }
    // Content travels through session storage, never the page URL or history.
    await browser.tabs.create({ url: browser.runtime.getURL('/popup.html') });
  });
});
