import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const day = (offset) => {
  const d = new Date(Date.now() - offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const now = Date.now();
const store = {
  daily: {
    [day(0)]: { channelPoints: 3, inventoryDrops: 4, channels: { syrix: 3 } },
    [day(1)]: { channelPoints: 7, channels: { syrix: 4, nmplol: 3 } },
    [day(3)]: { inventoryDrops: 2 },
    [day(200)]: { channelPoints: 5, channels: { oldstreamer: 5 } }
  },
  events: [
    { at: now - 500000, group: "channelPoints", channel: "syrix" },
    { at: now - 100000, group: "inventoryDrops", channel: "drops inventory" }
  ]
};

const html = fs.readFileSync(path.join(root, "src/stats.html"), "utf8");
const dom = new JSDOM(html, {
  url: "chrome-extension://test/src/stats.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.chrome = {
      storage: {
        local: { get: async () => structuredClone(store), set: async () => {} },
        sync: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      },
      runtime: { openOptionsPage: () => {} }
    };
  }
});

const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.message));
dom.window.eval(fs.readFileSync(path.join(root, "src/settings.js"), "utf8"));
dom.window.eval(fs.readFileSync(path.join(root, "src/stats.js"), "utf8"));
await new Promise((r) => setTimeout(r, 60));

const d = dom.window.document;
const click = (sel) => d.querySelector(sel).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

const checks = [];
const check = (name, ok) => checks.push([name, ok]);

check("30d total counts only the last 30 days", d.getElementById("total").textContent === "16");
check("today", d.getElementById("today").textContent === "7");
check("best day", d.getElementById("best").textContent === "7");
check("rate per active day", d.getElementById("rate").textContent === "5.3");
check("strip has one column per day", d.querySelectorAll("#strip .col").length === 30);
check("empty days render a tick", d.querySelectorAll("#strip .empty").length === 27);
check("three claim-type bars", d.querySelectorAll("#bars .bar").length === 3);
check("sweep line shows inventory total", d.querySelector("#sweepline .n").textContent === "6");
check("channels are ranked", d.querySelector("#channels .channel span").textContent === "syrix");
check("channels exclude the inventory", !d.getElementById("channels").textContent.includes("inventory"));
check("recent is newest first", d.querySelector("#recent .event span:nth-child(2)").textContent === "drops inventory");

click('[data-range="7"]');
await new Promise((r) => setTimeout(r, 20));
check("7d narrows the total", d.getElementById("total").textContent === "16");
check("7d narrows the strip", d.querySelectorAll("#strip .col").length === 7);

click('[data-range="0"]');
await new Promise((r) => setTimeout(r, 20));
check("all time includes the old day", d.getElementById("total").textContent === "21");
check("all time reaches back to the oldest bucket", d.querySelectorAll("#strip .col").length === 201);
check("all time picks up the old channel", d.getElementById("channels").textContent.includes("oldstreamer"));
check("no runtime errors", errors.length === 0);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
if (errors.length) console.log(errors);
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
