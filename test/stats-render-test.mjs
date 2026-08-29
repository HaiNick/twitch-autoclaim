import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// three days of fake history, including an empty day and two groups on one day
const now = Date.now();
const day = (offset) => {
  const d = new Date(now - offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const store = {
  daily: {
    [day(0)]: { channelPoints: 4, streamDrops: 1 },
    [day(1)]: { channelPoints: 7 },
    [day(3)]: { inventoryDrops: 2, playerPrompts: 1 }
  },
  channels: {
    hasanabi: { claims: 9, lastClaim: now - 3600000 },
    "(inventory)": { claims: 2, lastClaim: now - 200000000 }
  },
  events: [
    { at: now - 500000, group: "channelPoints", channel: "hasanabi" },
    { at: now - 100000, group: "streamDrops", channel: "hasanabi" }
  ],
  stats: { channelPoints: { claims: 11, lastSeen: now, lastClaim: now - 500000 } }
};

const html = fs.readFileSync(path.join(root, "src/stats.html"), "utf8");
const dom = new JSDOM(html, {
  url: "moz-extension://test/src/stats.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.chrome = {
      storage: {
        local: {
          get: async () => structuredClone(store),
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      },
      runtime: { openOptionsPage: () => {} }
    };
  }
});

const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.message));
dom.window.eval(fs.readFileSync(path.join(root, "src/stats.js"), "utf8"));

await new Promise((r) => setTimeout(r, 60));
const d = dom.window.document;

const checks = [
  ["totals rendered", d.getElementById("total-range").textContent !== "0"],
  ["today rendered", d.getElementById("total-today").textContent === "5"],
  ["best day is 7", d.getElementById("best-day").textContent === "7"],
  ["active days is 3", d.getElementById("active-days").textContent === "3"],
  ["chart drew bars", d.querySelectorAll("#chart svg rect").length === 5],
  ["chart empty hidden", d.getElementById("chart-empty").hidden === true],
  ["group rows", d.querySelectorAll("#groups tbody tr").length === 4],
  ["channel rows", d.querySelectorAll("#channels tbody tr").length === 2],
  ["events newest first", d.querySelector("#events li .what").textContent === "stream drops"],
  ["legend", d.querySelectorAll("#legend li").length === 4],
  ["no runtime errors", errors.length === 0]
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
if (errors.length) console.log(errors);
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
