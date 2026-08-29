/**
 * Scheduled inventory sweep.
 *
 * On a timer, opens https://www.twitch.tv/drops/inventory in a background tab,
 * lets the content script claim what is there, then closes the tab.
 *
 * Note on permissions: tabs.create and tabs.remove do not require the "tabs"
 * permission. Only "alarms" is added for this feature. The extension still
 * cannot read any tab outside www.twitch.tv.
 */
const api = globalThis.browser ?? globalThis.chrome;

const SWEEP_URL = "https://www.twitch.tv/drops/inventory";
const SWEEP_MATCH = "https://www.twitch.tv/drops/inventory*";
const ALARM_SWEEP = "sweep";
const ALARM_TIMEOUT = "sweep-timeout";

const DEFAULTS = {
  enabled: true,
  inventoryDrops: true,
  autoSweep: false,
  sweepIntervalMinutes: 60,
  sweepTimeoutSeconds: 120
};

async function getSettings() {
  const stored = await api.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

async function getState() {
  const stored = await api.storage.local.get("sweepState");
  return stored.sweepState || null;
}

async function setState(state) {
  await api.storage.local.set({ sweepState: state });
}

async function report(outcome, claimed = 0) {
  await api.storage.local.set({ lastSweep: { at: Date.now(), outcome, claimed } });
}

async function syncAlarm() {
  const settings = await getSettings();
  await api.alarms.clear(ALARM_SWEEP);
  if (!settings.enabled || !settings.autoSweep) return;

  const period = Math.max(15, Number(settings.sweepIntervalMinutes) || 60);
  api.alarms.create(ALARM_SWEEP, { delayInMinutes: 1, periodInMinutes: period });
}

async function finishSweep(outcome, claimed = 0) {
  const state = await getState();
  await api.alarms.clear(ALARM_TIMEOUT);
  await setState(null);
  await report(outcome, claimed);

  if (state?.tabId) {
    try {
      await api.tabs.remove(state.tabId);
    } catch {
      // the tab is already gone, which is the outcome we wanted anyway
    }
  }
}

async function startSweep(trigger) {
  const settings = await getSettings();

  if (!settings.enabled || !settings.inventoryDrops) {
    await report("skipped: claiming is paused");
    return;
  }

  const state = await getState();
  if (state) {
    await report("skipped: a sweep is already running");
    return;
  }

  const open = await api.tabs.query({ url: SWEEP_MATCH });
  if (open.length) {
    await report("skipped: inventory already open in a tab");
    return;
  }

  const tab = await api.tabs.create({ url: SWEEP_URL, active: false });
  await setState({ tabId: tab.id, startedAt: Date.now(), trigger });

  const settle = Math.max(0.5, (Number(settings.sweepTimeoutSeconds) || 120) / 60);
  api.alarms.create(ALARM_TIMEOUT, { delayInMinutes: settle });
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_SWEEP) startSweep("schedule");
  if (alarm.name === ALARM_TIMEOUT) finishSweep("timed out, tab closed");
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "sweepStatus") {
    getState().then((state) => sendResponse({ sweeping: Boolean(state) && state.tabId === sender.tab?.id }));
    return true;
  }

  if (message?.type === "sweepDone") {
    getState().then((state) => {
      if (!state || state.tabId !== sender.tab?.id) return;
      const label = message.reason === "loggedOut" ? "not logged in" : `claimed ${message.claimed}`;
      finishSweep(label, message.claimed || 0);
    });
    return false;
  }

  if (message?.type === "sweepNow") {
    startSweep("manual").then(() => sendResponse({ started: true }));
    return true;
  }

  return false;
});

api.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state?.tabId === tabId) {
    await api.alarms.clear(ALARM_TIMEOUT);
    await setState(null);
  }
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) syncAlarm();
});

api.runtime.onInstalled.addListener(syncAlarm);
api.runtime.onStartup.addListener(syncAlarm);
syncAlarm();
