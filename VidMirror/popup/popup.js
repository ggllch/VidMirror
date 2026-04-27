const statusEl = document.getElementById("status");
const statusHintEl = document.getElementById("statusHint");
const enabledToggle = document.getElementById("enabledToggle");
const api = globalThis.browser ?? globalThis.chrome;
let activeTabId = null;

function setStatus(enabled) {
  statusEl.classList.remove("is-enabled", "is-disabled", "is-error");
  statusEl.textContent = enabled ? "Active" : "Inactive";
  statusHintEl.textContent = enabled
    ? "Mirroring is currently enabled."
    : "Turn on the switch to mirror this tab.";
  statusEl.classList.add(enabled ? "is-enabled" : "is-disabled");
}

function setErrorStatus(message) {
  statusEl.classList.remove("is-enabled", "is-disabled", "is-error");
  statusEl.textContent = "Error";
  statusHintEl.textContent = message;
  statusEl.classList.add("is-error");
}

async function getActiveTabId() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab");
  }
  return tab.id;
}

async function loadState() {
  activeTabId = await getActiveTabId();
  const data = await api.runtime.sendMessage({
    type: "VIDMIRROR_GET_TAB_STATE",
    tabId: activeTabId
  });
  const enabled = Boolean(data?.enabled);
  enabledToggle.checked = enabled;
  setStatus(enabled);
}

enabledToggle.addEventListener("change", async () => {
  if (!activeTabId) {
    setErrorStatus("Error: active tab was not found.");
    enabledToggle.checked = false;
    return;
  }

  const next = enabledToggle.checked;
  const result = await api.runtime.sendMessage({
    type: "VIDMIRROR_SET_TAB_STATE",
    tabId: activeTabId,
    enabled: next
  });
  const applied = Boolean(result?.enabled);
  enabledToggle.checked = applied;
  setStatus(applied);
});

loadState().catch((error) => {
  console.error("Failed to load state", error);
  setErrorStatus("Data loading error.");
});
