/**
 * Scheduled inventory sweep.
 *
 * On a timer, opens the drops inventory in a background tab, lets the content
 * script claim what is there, then closes the tab.
 *
 * tabs.create and tabs.remove do not require the "tabs" permission, so only
 * "alarms" is added for this feature. The extension still cannot read any tab
 * outside www.twitch.tv.
 */
importScripts("settings.js");

const api = globalThis.autoclaimApi;
const TWITCH_ORIGIN = "https://www.twitch.tv/";
const SWEEP_URL = "https://www.twitch.tv/drops/inventory";
const ALARM_SWEEP = "sweep";
const ALARM_TIMEOUT = "sweep-timeout";
const STALE_STATE_MS = 10 * 60 * 1000;
const MIN_SCHEDULED_GAP_MS = 10 * 60 * 1000;

const getState = async () => (await api.storage.local.get("sweepState")).sweepState || null;
const setState = (state) => api.storage.local.set({ sweepState: state });
const report = (outcome, claimed = 0) => api.storage.local.set({ lastSweep: { at: Date.now(), outcome, claimed } });

/**
 * Chrome unloads the service worker between events and re-runs this file on
 * every wake, so syncAlarm must leave a correct alarm alone. Recreating it
 * unconditionally restarts the countdown, and because a sweep wakes the worker
 * itself, that turns any interval into a loop.
 */
async function syncAlarm() {
  const settings = await globalThis.readSettings();
  const existing = await api.alarms.get(ALARM_SWEEP);

  if (!settings.enabled || !settings.autoSweep) {
    if (existing) await api.alarms.clear(ALARM_SWEEP);
    return;
  }

  const period = Math.max(15, Number(settings.sweepIntervalMinutes) || 60);
  if (existing && existing.periodInMinutes === period) return;

  api.alarms.create(ALARM_SWEEP, { delayInMinutes: period, periodInMinutes: period });
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
      // The tab is already gone, which is the outcome we wanted anyway.
    }
  }
}

async function startSweep(trigger) {
  const settings = await globalThis.readSettings();

  if (!settings.enabled || !settings.inventoryDrops) {
    const outcome = settings.enabled ? "skipped: inventory claiming is off" : "skipped: claiming is paused";
    await report(outcome);
    return outcome;
  }

  if (trigger === "schedule") {
    const { lastSweep } = await api.storage.local.get("lastSweep");
    if (lastSweep && Date.now() - lastSweep.at < MIN_SCHEDULED_GAP_MS) {
      // Deliberately does not call report(): overwriting lastSweep.at here
      // would push the window forward and block the next real sweep too.
      return "skipped: swept recently";
    }
  }

  const state = await getState();
  if (state) {
    if (Date.now() - state.startedAt <= STALE_STATE_MS) {
      const outcome = "skipped: a sweep is already running";
      await report(outcome);
      return outcome;
    }
    await finishSweep("recovered from a stuck sweep");
  }

  // tabs.query ignores its url filter without the right grant, so filter here.
  const all = await api.tabs.query({});
  const twitch = all.filter((tab) => typeof tab.url === "string" && tab.url.startsWith(TWITCH_ORIGIN));

  if (trigger === "schedule" && settings.sweepOnlyWithTwitch && !twitch.length) {
    const outcome = "skipped: no Twitch tab open";
    await report(outcome);
    return outcome;
  }

  if (twitch.some((tab) => tab.url.startsWith(SWEEP_URL))) {
    const outcome = "skipped: inventory already open in a tab";
    await report(outcome);
    return outcome;
  }

  const tab = await api.tabs.create({ url: SWEEP_URL, active: false });
  await setState({ tabId: tab.id, startedAt: Date.now(), trigger });
  api.alarms.create(ALARM_TIMEOUT, {
    delayInMinutes: Math.max(0.5, (Number(settings.sweepTimeoutSeconds) || 120) / 60)
  });

  const outcome = `opened tab ${tab.id}`;
  await report(outcome);
  return outcome;
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
      finishSweep(message.reason === "loggedOut" ? "not signed in" : `claimed ${message.claimed}`, message.claimed || 0);
    });
    return false;
  }

  if (message?.type === "sweepNow") {
    startSweep("manual")
      .then((outcome) => sendResponse({ outcome: outcome || "started" }))
      .catch((error) => sendResponse({ outcome: `worker error: ${error.message}` }));
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

// Only the settings the schedule depends on may re-arm the alarm.
api.storage.onChanged.addListener((changes, area) => {
  if (!changes.settings || (area !== "sync" && area !== "local")) return;
  const before = changes.settings.oldValue || {};
  const after = changes.settings.newValue || {};
  const keys = ["enabled", "autoSweep", "sweepIntervalMinutes"];
  if (keys.some((key) => before[key] !== after[key])) syncAlarm();
});

api.runtime.onInstalled.addListener(syncAlarm);
api.runtime.onStartup.addListener(syncAlarm);
syncAlarm();
