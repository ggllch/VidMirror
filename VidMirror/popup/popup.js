const statusEl = document.getElementById("status");
const enabledToggle = document.getElementById("enabledToggle");
let activeTabId = null;

function setStatus(enabled) {
  statusEl.textContent = enabled
    ? "Статус: отзеркалено"
    : "Статус: не отзеркалено";
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab");
  }
  return tab.id;
}

async function loadState() {
  activeTabId = await getActiveTabId();
  const data = await chrome.runtime.sendMessage({
    type: "VIDMIRROR_GET_TAB_STATE",
    tabId: activeTabId
  });
  const enabled = Boolean(data?.enabled);
  enabledToggle.checked = enabled;
  setStatus(enabled);
}

enabledToggle.addEventListener("change", async () => {
  if (!activeTabId) {
    statusEl.textContent = "Ошибка: активная вкладка не найдена.";
    enabledToggle.checked = false;
    return;
  }

  const next = enabledToggle.checked;
  const result = await chrome.runtime.sendMessage({
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
  statusEl.textContent = "Ошибка загрузки данных.";
});
