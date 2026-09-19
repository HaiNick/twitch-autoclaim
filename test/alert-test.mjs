import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86400000;

/** The stale alert must fire on broken selectors and stay quiet otherwise. */
async function alertFor(stats, settings = {}) {
  const html = fs.readFileSync(path.join(root, "src/popup.html"), "utf8");
  const saved = {
    settings: {
      enabled: true, channelPoints: true, streamDrops: true, inventoryDrops: true,
      autoSweep: true, sweepOnlyWithTwitch: true, sweepIntervalMinutes: 60,
      sweepTimeoutSeconds: 120, maxDelaySeconds: 4, logToConsole: true, ...settings
    },
    stats
  };

  const dom = new JSDOM(html, {
    url: "chrome-extension://test/src/popup.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.chrome = {
        storage: {
          local: {
            get: async (k) => {
              const keys = Array.isArray(k) ? k : [k];
              return Object.fromEntries(keys.filter((x) => x in saved).map((x) => [x, structuredClone(saved[x])]));
            },
            set: async () => {}
          },
          sync: { get: async (k) => (k in saved ? { [k]: structuredClone(saved[k]) } : {}), set: async () => {} },
          onChanged: { addListener: () => {} }
        },
        runtime: { openOptionsPage: () => {}, sendMessage: async () => ({}) },
        tabs: { query: async () => [{ id: 1 }], sendMessage: async () => null }
      };
    }
  });

  for (const file of ["src/settings.js", "src/selectors.js", "src/popup.js"]) {
    dom.window.eval(fs.readFileSync(path.join(root, file), "utf8"));
  }
  await new Promise((r) => setTimeout(r, 50));

  const node = dom.window.document.getElementById("alert");
  return node.hidden ? null : node.textContent;
}

const now = Date.now();
const checks = [];
const check = (n, ok) => checks.push([n, ok]);

check("quiet when everything is matching", await alertFor({
  channelPoints: { claims: 22, lastApplied: now - 60000, lastSeen: now - 60000 }
}) === null);

check("fires when a watched page stops matching", await alertFor({
  channelPoints: { claims: 22, lastApplied: now - 60000, lastSeen: now - 3 * DAY }
}) === "channel points stopped matching");

check("quiet when Twitch has not been open, the old false alarm", await alertFor({
  channelPoints: { claims: 22, lastApplied: now - 6 * DAY, lastSeen: now - 6 * DAY }
}) === null);

check("inventory drops never raise it, an empty inventory is normal", await alertFor({
  inventoryDrops: { claims: 2, lastApplied: now - 60000, lastSeen: now - 6 * DAY }
}) === null);

check("stream drops never raise it either", await alertFor({
  streamDrops: { claims: 4, lastApplied: now - 60000, lastSeen: now - 6 * DAY }
}) === null);

check("quiet for a group that has never claimed", await alertFor({
  channelPoints: { claims: 0, lastApplied: now - 60000, lastSeen: null }
}) === null);

check("quiet when the group is switched off", await alertFor(
  { channelPoints: { claims: 22, lastApplied: now - 60000, lastSeen: now - 3 * DAY } },
  { channelPoints: false }
) === null);

let failed = 0;
for (const [n, ok] of checks) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); }
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
