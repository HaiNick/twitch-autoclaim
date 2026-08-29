const api = globalThis.browser ?? globalThis.chrome;
const SVG_NS = "http://www.w3.org/2000/svg";

const GROUPS = {
  channelPoints: { label: "channel points", color: "var(--g1)" },
  streamDrops: { label: "stream drops", color: "var(--g2)" },
  inventoryDrops: { label: "inventory drops", color: "var(--g3)" },
  playerPrompts: { label: "player prompts", color: "var(--g4)" }
};

let range = 30;
let data = { daily: {}, channels: {}, events: [], stats: {} };

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function lastDays(count) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

function totalFor(day) {
  return Object.values(data.daily[day] || {}).reduce((sum, n) => sum + n, 0);
}

function formatDate(day) {
  const [y, m, d] = day.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short"
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "never";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTotals(days) {
  const totals = days.map(totalFor);
  const sum = totals.reduce((a, b) => a + b, 0);
  const best = Math.max(0, ...totals);
  const bestDay = days[totals.indexOf(best)];

  document.getElementById("total-range").textContent = String(sum);
  document.getElementById("total-caption").textContent = `claims in ${range} days`;
  document.getElementById("total-today").textContent = String(totalFor(dayKey(new Date())));
  document.getElementById("best-day").textContent = String(best);
  document.getElementById("best-day-caption").textContent = best ? `best day, ${formatDate(bestDay)}` : "best day";
  document.getElementById("active-days").textContent = String(totals.filter((n) => n > 0).length);
}

function renderLegend() {
  const list = document.getElementById("legend");
  list.textContent = "";
  for (const group of Object.values(GROUPS)) {
    const item = el("li");
    const swatch = el("span", "swatch");
    swatch.style.background = group.color;
    item.append(swatch, el("span", null, group.label));
    list.append(item);
  }
}

function renderChart(days) {
  const host = document.getElementById("chart");
  const empty = document.getElementById("chart-empty");
  host.textContent = "";

  const totals = days.map(totalFor);
  const peak = Math.max(...totals);
  empty.hidden = peak > 0;
  if (peak === 0) return;

  const width = 900;
  const height = 210;
  const padBottom = 24;
  const padTop = 8;
  const slot = width / days.length;
  const barWidth = Math.max(2, Math.min(22, slot - 3));
  const plot = height - padBottom - padTop;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Claims per day over the last ${range} days`);

  for (const fraction of [0, 0.5, 1]) {
    const y = padTop + plot * fraction;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", 0);
    line.setAttribute("x2", width);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.style.stroke = "var(--line)";
    svg.append(line);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", 2);
    label.setAttribute("y", y - 4);
    label.style.fill = "var(--stale)";
    label.style.font = "10px var(--mono)";
    label.textContent = String(Math.round(peak * (1 - fraction)));
    svg.append(label);
  }

  days.forEach((day, index) => {
    const buckets = data.daily[day] || {};
    const x = index * slot + (slot - barWidth) / 2;
    let cursor = padTop + plot;

    for (const [key, group] of Object.entries(GROUPS)) {
      const value = buckets[key] || 0;
      if (!value) continue;
      const barHeight = (value / peak) * plot;
      cursor -= barHeight;

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", cursor);
      rect.setAttribute("width", barWidth);
      rect.setAttribute("height", barHeight);
      rect.style.fill = group.color;
      rect.setAttribute("rx", 1);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${formatDate(day)}: ${value} ${group.label}`;
      rect.append(title);
      svg.append(rect);
    }

    const showLabel = days.length <= 10 || index % Math.ceil(days.length / 10) === 0;
    if (showLabel) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x + barWidth / 2);
      label.setAttribute("y", height - 8);
      label.style.fill = "var(--stale)";
      label.style.font = "10px var(--mono)";
      label.setAttribute("text-anchor", "middle");
      label.textContent = formatDate(day);
      svg.append(label);
    }
  });

  host.append(svg);
}

function renderGroups(days) {
  const body = document.querySelector("#groups tbody");
  body.textContent = "";

  const counts = {};
  for (const day of days) {
    for (const [key, value] of Object.entries(data.daily[day] || {})) {
      counts[key] = (counts[key] || 0) + value;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  for (const [key, group] of Object.entries(GROUPS)) {
    const claims = counts[key] || 0;
    const row = el("tr");
    row.append(
      el("td", null, group.label),
      el("td", null, String(claims)),
      el("td", null, total ? `${Math.round((claims / total) * 100)}%` : "0%"),
      el("td", null, formatTime(data.stats[key]?.lastClaim))
    );
    body.append(row);
  }
}

function renderChannels() {
  const body = document.querySelector("#channels tbody");
  body.textContent = "";

  const rows = Object.entries(data.channels)
    .sort((a, b) => b[1].claims - a[1].claims)
    .slice(0, 10);

  if (!rows.length) {
    const row = el("tr");
    const cell = el("td", null, "nothing yet");
    cell.colSpan = 3;
    row.append(cell);
    body.append(row);
    return;
  }

  for (const [channel, entry] of rows) {
    const row = el("tr");
    row.append(
      el("td", null, channel),
      el("td", null, String(entry.claims)),
      el("td", null, formatTime(entry.lastClaim))
    );
    body.append(row);
  }
}

function renderEvents() {
  const list = document.getElementById("events");
  list.textContent = "";

  const recent = [...data.events].reverse().slice(0, 25);
  if (!recent.length) {
    list.append(el("li", null, "nothing yet"));
    return;
  }

  for (const event of recent) {
    const item = el("li");
    item.append(
      el("span", "when", formatTime(event.at)),
      el("span", "who", event.channel),
      el("span", "what", GROUPS[event.group]?.label || event.group)
    );
    list.append(item);
  }
}

function renderAll() {
  const days = lastDays(range);
  renderTotals(days);
  renderChart(days);
  renderGroups(days);
  renderChannels();
  renderEvents();
}

async function load() {
  const stored = await api.storage.local.get(["daily", "channels", "events", "stats"]);
  data = {
    daily: stored.daily || {},
    channels: stored.channels || {},
    events: stored.events || [],
    stats: stored.stats || {}
  };
  renderAll();
}

for (const button of document.querySelectorAll("[data-range]")) {
  button.addEventListener("click", () => {
    range = Number(button.dataset.range);
    for (const other of document.querySelectorAll("[data-range]")) other.classList.toggle("on", other === button);
    renderAll();
  });
}

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `twitch-autoclaim-${dayKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  document.getElementById("message").textContent = "exported";
});

document.getElementById("clear").addEventListener("click", async () => {
  document.getElementById("message").textContent = "";
  if (!confirm("Delete all claim history? Toggles and delay settings stay.")) return;
  await api.storage.local.set({ daily: {}, channels: {}, events: [], stats: {} });
  await load();
  document.getElementById("message").textContent = "history cleared";
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.daily || changes.events || changes.channels || changes.stats) load();
});

renderLegend();
load();
