const enabledTabIds = new Set();
const api = globalThis.browser ?? globalThis.chrome;

function isSupportedUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function applyBadge(tabId, enabled) {
  if (!tabId) {
    return;
  }

  api.action.setBadgeText({ tabId, text: enabled ? "ON" : "OFF" });
  api.action.setBadgeBackgroundColor({ tabId, color: enabled ? "#2563eb" : "#64748b" });
  api.action.setTitle({
    tabId,
    title: enabled ? "VidMirror: enabled" : "VidMirror: disabled"
  });
}

async function ensureContentScript(tabId) {
  try {
    await api.tabs.sendMessage(tabId, { type: "VIDMIRROR_PING" });
    return true;
  } catch (_error) {
    // Content script not injected yet.
  }

  try {
    await api.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (_error) {
    return false;
  }

  try {
    await api.scripting.executeScript({
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
    await api.scripting.executeScript({
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
      tab = await api.tabs.get(tabId);
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

api.tabs.onActivated.addListener(({ tabId }) => {
  void disableAllTabs().then(() => {
    applyBadge(tabId, false);
  });
});

api.tabs.onRemoved.addListener((tabId) => {
  enabledTabIds.delete(tabId);
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
