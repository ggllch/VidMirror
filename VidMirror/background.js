const enabledTabIds = new Set();

function isSupportedUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function applyBadge(tabId, enabled) {
  if (!tabId) {
    return;
  }

  chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? "#2563eb" : "#64748b" });
  chrome.action.setTitle({
    tabId,
    title: enabled ? "VidMirror: включено" : "VidMirror: выключено"
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "VIDMIRROR_PING" });
    return true;
  } catch (_error) {
    // Content script not injected yet.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (_error) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"]
    });
  } catch (_error) {
    // Some embedded frames can be restricted; keep the main frame enabled.
  }

  return true;
}

async function sendStateToTab(tabId, enabled) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (nextEnabled) => {
        globalThis.__VIDMIRROR_CONTROLLER__?.setEnabled(Boolean(nextEnabled));
      },
      args: [enabled]
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function setTabEnabled(tabId, enabled) {
  if (!tabId) {
    return;
  }

  if (enabled) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_error) {
      applyBadge(tabId, false);
      return;
    }

    if (!isSupportedUrl(tab.url)) {
      applyBadge(tabId, false);
      return;
    }

    const ready = await ensureContentScript(tabId);
    if (!ready) {
      applyBadge(tabId, false);
      return;
    }

    enabledTabIds.add(tabId);
    applyBadge(tabId, true);
    await sendStateToTab(tabId, true);
    return;
  }

  enabledTabIds.delete(tabId);
  applyBadge(tabId, false);
  await sendStateToTab(tabId, false);
}

async function disableAllTabs() {
  const ids = [...enabledTabIds];
  for (const tabId of ids) {
    await setTabEnabled(tabId, false);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void disableAllTabs().then(() => {
    applyBadge(tabId, false);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enabledTabIds.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "VIDMIRROR_GET_TAB_STATE") {
    const tabId = Number(message.tabId);
    sendResponse({ enabled: enabledTabIds.has(tabId) });
    return;
  }

  if (message?.type === "VIDMIRROR_SET_TAB_STATE") {
    const tabId = Number(message.tabId);
    const enabled = Boolean(message.enabled);

    void setTabEnabled(tabId, enabled).then(() => {
      sendResponse({ ok: true, enabled: enabledTabIds.has(tabId) });
    });
    return true;
  }
});
