const api = globalThis.autoclaimApi;
const SCAN_RESET_MS = 15000;

const LABELS = {
  channelPoints: "channel points",
  streamDrops: "stream drops",
  inventoryDrops: "inventory drops"
};

const STALE_MS = 24 * 60 * 60 * 1000;
const FRESH_MS = 60 * 60 * 1000;

let settings = { ...globalThis.AUTOCLAIM_DEFAULTS };
let stats = {};
let scan = null;
let scanTimer = null;

const $ = (id) => document.getElementById(id);

function age(timestamp) {
  if (!timestamp) return "never";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function renderRows() {
  const rows = $("rows");
  rows.textContent = "";
  $("colright").textContent = scan ? "on this page" : "";

  for (const [key, label] of Object.entries(LABELS)) {
    const entry = stats[key] || {};
    const on = Boolean(settings[key]);

    const row = document.createElement("label");
    row.className = "row" + (on ? "" : " off");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = on;
    box.addEventListener("change", () => {
      settings[key] = box.checked;
      save();
    });

    const name = document.createElement("span");
    name.textContent = label;

    const meta = document.createElement("span");
    meta.className = "meta";

    if (scan) {
      const matches = scan.report[key];
      if (matches === null || matches === undefined) {
        meta.textContent = "n/a";
      } else if (matches > 0) {
        meta.textContent = `${matches} found`;
        meta.classList.add("found");
        row.classList.add("hit");
      } else {
        meta.textContent = "0";
      }
    } else if (!on) {
      meta.textContent = "off";
    } else {
      meta.textContent = `${entry.claims || 0} · ${age(entry.lastSeen)}`;
      if (entry.lastSeen && Date.now() - entry.lastSeen < FRESH_MS) meta.classList.add("fresh");
    }

    row.append(box, name, meta);
    rows.append(row);
  }
}

/** One line, only when a group that has worked before stops matching. */
function renderAlert() {
  const broken = Object.entries(LABELS).find(([key]) => {
    const entry = stats[key] || {};
    return settings[key] && entry.claims > 0 && entry.lastSeen && Date.now() - entry.lastSeen > STALE_MS;
  });

  const alert = $("alert");
  alert.hidden = !broken;
  if (broken) alert.textContent = `${LABELS[broken[0]]} stopped matching`;
}

function renderSettings() {
  document.body.classList.toggle("paused", !settings.enabled);
  const master = $("master");
  master.setAttribute("aria-checked", String(settings.enabled));
  master.textContent = settings.enabled ? "on" : "paused";

  for (const input of document.querySelectorAll("[data-setting]")) {
    input.checked = Boolean(settings[input.dataset.setting]);
  }

  $("sweepInterval").value = String(settings.sweepIntervalMinutes);
  $("sweepInterval").disabled = !settings.autoSweep;

  const seconds = Number(settings.maxDelaySeconds) || 4;
  $("delay").value = String(seconds);
  $("delayOut").textContent = `${Math.round(seconds / 2)} to ${seconds}s`;
}

function renderSweep(last) {
  $("lastSweep").textContent = last ? `last sweep ${age(last.at)} ago, ${last.outcome}` : "no sweep yet";
}

async function save() {
  await globalThis.writeSettings(settings);
  renderSettings();
  renderRows();
}

async function load() {
  const [loaded, stored] = await Promise.all([
    globalThis.readSettings(),
    api.storage.local.get(["stats", "lastSweep"])
  ]);
  settings = loaded;
  stats = stored.stats || {};
  renderSettings();
  renderRows();
  renderAlert();
  renderSweep(stored.lastSweep);
}

$("master").addEventListener("click", () => {
  settings.enabled = !settings.enabled;
  save();
});

$("sweepInterval").addEventListener("change", (event) => {
  settings.sweepIntervalMinutes = Number(event.target.value);
  save();
});

$("delay").addEventListener("input", (event) => {
  settings.maxDelaySeconds = Number(event.target.value);
  save();
});

$("history").addEventListener("click", () => {
  api.runtime.openOptionsPage();
  window.close();
});

$("sweepNow").addEventListener("click", async () => {
  const bar = $("scanbar");
  bar.hidden = false;
  bar.className = "scanbar";
  bar.textContent = "sweeping…";
  try {
    const result = await api.runtime.sendMessage({ type: "sweepNow" });
    bar.textContent = result?.outcome || "no reply from the background worker";
  } catch (error) {
    bar.className = "scanbar off";
    bar.textContent = `background worker unreachable: ${error.message}`;
  }
  setTimeout(load, 1500);
});

$("scan").addEventListener("click", async () => {
  const bar = $("scanbar");
  bar.hidden = false;
  bar.className = "scanbar";
  bar.textContent = "scanning…";
  clearTimeout(scanTimer);

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try {
    const result = await api.tabs.sendMessage(tab.id, { type: "scanNow" });
    if (!result) throw new Error("no response");
    scan = result;
    const total = Object.values(result.report).reduce((sum, n) => sum + (n || 0), 0);
    bar.className = "scanbar ok";
    bar.textContent = total ? `${total} claimable now, selectors match` : "nothing claimable here";
  } catch {
    scan = null;
    bar.className = "scanbar off";
    bar.textContent = "not a Twitch page, or reload the tab";
  }

  renderRows();
  // Claim counts come back on their own, so a stale scan is never mistaken for history.
  scanTimer = setTimeout(() => {
    scan = null;
    bar.hidden = true;
    renderRows();
  }, SCAN_RESET_MS);
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.stats) {
    stats = changes.stats.newValue || {};
    renderRows();
    renderAlert();
  }
  if (area === "local" && changes.lastSweep) renderSweep(changes.lastSweep.newValue);
});

load();
