const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  enabled: true,
  channelPoints: true,
  streamDrops: true,
  inventoryDrops: true,
  playerPrompts: false,
  autoSweep: false,
  sweepOnlyWithTwitch: true,
  sweepIntervalMinutes: 60,
  sweepTimeoutSeconds: 120,
  minDelayMs: 1200,
  maxDelayMs: 4500,
  logToConsole: true
};

const LABELS = {
  channelPoints: "channel points",
  streamDrops: "stream drops",
  inventoryDrops: "inventory drops",
  playerPrompts: "player prompts"
};

const message = document.getElementById("message");
let settings = { ...DEFAULTS };

function say(text) {
  message.textContent = text;
}

function age(timestamp) {
  if (!timestamp) return "never";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function renderSettings() {
  document.body.classList.toggle("active", settings.enabled);
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("state-label").textContent = settings.enabled ? "on" : "paused";

  for (const input of document.querySelectorAll("[data-setting]")) {
    input.checked = Boolean(settings[input.dataset.setting]);
  }

  document.getElementById("sweepInterval").value = String(settings.sweepIntervalMinutes);
  document.getElementById("sweepInterval").disabled = !settings.autoSweep;
  document.getElementById("maxDelay").value = settings.maxDelayMs;
  document.getElementById("delay-readout").textContent =
    `${(settings.minDelayMs / 1000).toFixed(1)}s to ${(settings.maxDelayMs / 1000).toFixed(1)}s`;
}

function renderHealth(stats) {
  const container = document.getElementById("health");
  container.textContent = "";

  for (const [key, label] of Object.entries(LABELS)) {
    const entry = stats[key] || {};
    const row = document.createElement("div");
    row.className = "health-row";
    if (entry.lastSeen && Date.now() - entry.lastSeen < 3600000) row.classList.add("fresh");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = label;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(entry.claims || 0);

    const seen = document.createElement("span");
    seen.className = "age";
    seen.textContent = age(entry.lastSeen);

    row.append(name, count, seen);
    container.append(row);
  }
}

async function save() {
  await api.storage.local.set({ settings });
  renderSettings();
}

function renderSweep(last) {
  const line = document.getElementById("sweep-last");
  if (!last) {
    line.textContent = "no sweep yet";
    return;
  }
  line.textContent = `last sweep ${age(last.at)}: ${last.outcome}`;
}

async function load() {
  const stored = await api.storage.local.get(["settings", "stats", "lastSweep"]);
  settings = { ...DEFAULTS, ...(stored.settings || {}) };
  renderSettings();
  renderHealth(stored.stats || {});
  renderSweep(stored.lastSweep);
}

document.getElementById("enabled").addEventListener("change", (event) => {
  settings.enabled = event.target.checked;
  save();
});

for (const input of document.querySelectorAll("[data-setting]")) {
  input.addEventListener("change", (event) => {
    settings[event.target.dataset.setting] = event.target.checked;
    save();
  });
}

document.getElementById("sweepInterval").addEventListener("change", (event) => {
  settings.sweepIntervalMinutes = Number(event.target.value);
  save();
});

document.getElementById("sweep").addEventListener("click", async () => {
  say("sweeping...");
  try {
    const result = await api.runtime.sendMessage({ type: "sweepNow" });
    say(result?.outcome || "no reply from the background worker");
  } catch (error) {
    say(`background worker unreachable: ${error.message}`);
  }
  setTimeout(load, 1500);
});

document.getElementById("maxDelay").addEventListener("input", (event) => {
  const max = Number(event.target.value);
  settings.maxDelayMs = max;
  settings.minDelayMs = Math.min(settings.minDelayMs, Math.round(max / 2));
  save();
});

document.getElementById("stats").addEventListener("click", () => {
  api.runtime.openOptionsPage();
  window.close();
});

document.getElementById("scan").addEventListener("click", async () => {
  say("scanning...");
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    say("no active tab");
    return;
  }

  try {
    const result = await api.tabs.sendMessage(tab.id, { type: "scanNow" });
    if (!result) throw new Error("no response");
    const hits = Object.entries(result.report)
      .filter(([, group]) => group.applies)
      .map(([key, group]) => `${LABELS[key] || key}: ${group.matches}`)
      .join(", ");
    say(hits || "nothing applies on this page");
  } catch {
    say("open a www.twitch.tv tab and reload it");
  }
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.stats) renderHealth(changes.stats.newValue || {});
  if (changes.lastSweep) renderSweep(changes.lastSweep.newValue);
});

load();
