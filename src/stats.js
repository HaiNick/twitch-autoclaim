const api = globalThis.autoclaimApi;

const GROUPS = {
  channelPoints: { label: "channel points", color: "var(--points)" },
  streamDrops: { label: "stream drops", color: "var(--stream)" },
  inventoryDrops: { label: "inventory drops", color: "var(--inv)" }
};

let range = 30;
let daily = {};
let events = [];

const $ = (id) => document.getElementById(id);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const total = (bucket) => Object.keys(GROUPS).reduce((sum, key) => sum + (bucket?.[key] || 0), 0);

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const formatDay = (key) => fromKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function when(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

/** All time starts at the oldest bucket, so the strip never shows empty history. */
function daysInRange() {
  const keys = Object.keys(daily).sort();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start;
  if (range === 0) {
    start = keys.length ? fromKey(keys[0]) : new Date(today);
  } else {
    start = new Date(today);
    start.setDate(start.getDate() - (range - 1));
  }

  const out = [];
  for (const cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    out.push(dayKey(cursor));
  }
  return out.length ? out : [dayKey(today)];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const keys = daysInRange();
  const buckets = keys.map((key) => daily[key] || {});
  const sum = buckets.reduce((acc, bucket) => acc + total(bucket), 0);
  const active = buckets.filter((bucket) => total(bucket) > 0).length;
  const peak = Math.max(1, ...buckets.map(total));

  $("total").textContent = String(sum);
  $("totalCap").textContent = range === 0 ? `claims all time, ${keys.length} days` : `claims in ${range} days`;
  $("today").textContent = String(total(daily[dayKey(new Date())]));
  $("rate").textContent = active ? (sum / active).toFixed(1) : "0";
  $("best").textContent = String(sum ? peak : 0);
  $("from").textContent = formatDay(keys[0]);
  $("to").textContent = formatDay(keys[keys.length - 1]);

  const strip = $("strip");
  strip.textContent = "";
  keys.forEach((key, index) => {
    const bucket = buckets[index];
    const count = total(bucket);
    const col = el("div", "col");
    col.title = `${formatDay(key)}: ${count} ${count === 1 ? "claim" : "claims"}`;

    if (!count) {
      col.append(el("div", "empty"));
    } else {
      for (const [name, group] of Object.entries(GROUPS)) {
        if (!bucket[name]) continue;
        const seg = el("div", "seg");
        seg.style.height = `${(bucket[name] / peak) * 52}px`;
        seg.style.background = group.color;
        col.append(seg);
      }
    }
    strip.append(col);
  });

  const totals = {};
  const channels = {};
  for (const bucket of buckets) {
    for (const name of Object.keys(GROUPS)) totals[name] = (totals[name] || 0) + (bucket[name] || 0);
    for (const [name, count] of Object.entries(bucket.channels || {})) {
      channels[name] = (channels[name] || 0) + count;
    }
  }

  const bars = $("bars");
  bars.textContent = "";
  for (const [name, group] of Object.entries(GROUPS)) {
    const count = totals[name] || 0;
    const wrap = el("div", "bar");
    const label = el("div", "label");
    const title = el("span", null, group.label);
    if (!count) title.style.color = "var(--faint)";
    label.append(title, el("span", "n", String(count)));

    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = `${sum ? Math.round((count / sum) * 100) : 0}%`;
    fill.style.background = group.color;
    track.append(fill);

    wrap.append(label, track);
    bars.append(wrap);
  }

  const sweep = $("sweepline");
  sweep.textContent = "";
  const swatch = el("span", "swatch");
  swatch.style.background = GROUPS.inventoryDrops.color;
  sweep.append(swatch, el("span", "name", "drops inventory"), el("span", "n", String(totals.inventoryDrops || 0)));

  const list = $("channels");
  list.textContent = "";
  const ranked = Object.entries(channels).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!ranked.length) {
    list.append(el("div", "empty-note", "no channel claims in range"));
  } else {
    for (const [name, count] of ranked) {
      const row = el("div", "channel");
      row.append(el("span", "name", name), el("span", "n", String(count)));
      list.append(row);
    }
  }

  const recent = $("recent");
  recent.textContent = "";
  const latest = [...events].reverse().slice(0, 12);
  if (!latest.length) {
    recent.append(el("div", "empty-note", "nothing claimed yet"));
  } else {
    for (const event of latest) {
      const row = el("div", "event");
      const dot = el("span", "swatch");
      dot.style.background = GROUPS[event.group]?.color || "var(--faint)";
      row.append(dot, el("span", "name", event.channel), el("span", "when", when(event.at)));
      recent.append(row);
    }
  }
}

async function load() {
  const stored = await api.storage.local.get(["daily", "events"]);
  daily = stored.daily || {};
  events = stored.events || [];
  render();
}

$("range").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  range = Number(button.dataset.range);
  for (const other of $("range").children) other.classList.toggle("on", other === button);
  render();
});

$("clear").addEventListener("click", async () => {
  if (!confirm("Delete all claim history? Your settings stay.")) return;
  await api.storage.local.set({ daily: {}, events: [], stats: {} });
  await load();
  $("message").textContent = "history cleared";
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.daily || changes.events)) load();
});

load();
