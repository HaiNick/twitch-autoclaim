/**
 * Settings live in chrome.storage.sync so they follow the Chrome profile to
 * another machine. History stays in chrome.storage.local: it is far too large
 * for sync, which caps at 102,400 bytes total and 8,192 per item.
 *
 * Loaded as a plain script by the content scripts and with a <script> tag by
 * the popup and the history page, so it defines globals rather than exports.
 * The service worker reads the same globals through importScripts.
 */
globalThis.AUTOCLAIM_DEFAULTS = {
  enabled: true,
  channelPoints: true,
  streamDrops: true,
  inventoryDrops: true,
  autoSweep: false,
  sweepOnlyWithTwitch: true,
  sweepIntervalMinutes: 60,
  sweepTimeoutSeconds: 120,
  maxDelaySeconds: 4,
  logToConsole: true
};

globalThis.autoclaimApi = globalThis.browser ?? globalThis.chrome;

/**
 * Sync can be unavailable when the user is signed out of Chrome or has sync
 * disabled, so every read falls back to the local copy and every write keeps
 * one. That local copy is also what makes the first run after an upgrade work.
 */
globalThis.readSettings = async function readSettings() {
  const api = globalThis.autoclaimApi;
  let synced = {};
  try {
    synced = (await api.storage.sync.get("settings")).settings || {};
  } catch {
    synced = {};
  }

  const local = (await api.storage.local.get("settings")).settings || {};
  return { ...globalThis.AUTOCLAIM_DEFAULTS, ...local, ...synced };
};

globalThis.writeSettings = async function writeSettings(settings) {
  const api = globalThis.autoclaimApi;
  await api.storage.local.set({ settings });
  try {
    await api.storage.sync.set({ settings });
  } catch {
    // Sync is off or over quota. The local copy still holds, so the extension
    // keeps working on this machine and picks sync up again when it returns.
  }
};
