import { lookupWord } from "./dict-api.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "seeMeaning", title: "See Meaning", contexts: ["selection"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "seeMeaning" || !tab?.id) return;
  const text = (info.selectionText || "").trim().split(/\s+/)[0];
  if (!text) return;
  // Fails on pages without the content script (chrome://, Web Store, tabs opened before install).
  chrome.tabs.sendMessage(tab.id, { type: "show", text }, { frameId: 0 }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "lookup") return;
  lookupWord(msg.text).then(
    (entry) => sendResponse({ entry }),
    (err) => sendResponse({ error: err.message === "not found" ? "not found" : "failed" })
  );
  return true; // keep the channel open for the async response
});
