import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const saved = { local: {}, sync: {} };
const html = fs.readFileSync(path.join(root, "src/popup.html"), "utf8");

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
            return Object.fromEntries(keys.filter((x) => x in saved.local).map((x) => [x, saved.local[x]]));
          },
          set: async (o) => Object.assign(saved.local, structuredClone(o))
        },
        sync: {
          get: async (k) => (k in saved.sync ? { [k]: structuredClone(saved.sync[k]) } : {}),
          set: async (o) => Object.assign(saved.sync, structuredClone(o))
        },
        onChanged: { addListener: () => {} }
      },
      runtime: { openOptionsPage: () => {}, sendMessage: async () => ({}) },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async () => null }
    };
  }
});

const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.message));
dom.window.eval(fs.readFileSync(path.join(root, "src/settings.js"), "utf8"));
dom.window.eval(fs.readFileSync(path.join(root, "src/popup.js"), "utf8"));
await new Promise((r) => setTimeout(r, 50));

const d = dom.window.document;
const settle = () => new Promise((r) => setTimeout(r, 30));
const checks = [];
const check = (n, ok) => checks.push([n, ok]);

async function toggle(selector) {
  const input = d.querySelector(selector);
  input.checked = !input.checked;
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await settle();
  return input;
}

/** Every control the popup renders must survive a round trip through storage. */
const controls = [
  ['input[data-setting="autoSweep"]', "autoSweep"],
  ['input[data-setting="sweepOnlyWithTwitch"]', "sweepOnlyWithTwitch"]
];

for (const [selector, key] of controls) {
  const before = saved.sync.settings?.[key];
  const input = await toggle(selector);
  check(`${key} persists when toggled`, saved.sync.settings?.[key] === input.checked);
  check(`${key} actually changed`, saved.sync.settings?.[key] !== before);
  check(`${key} survives the re-render`, d.querySelector(selector).checked === input.checked);
}

const row = d.querySelector("#rows input");
row.checked = false;
row.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await settle();
check("a claim toggle persists", saved.sync.settings?.channelPoints === false);

check("the interval is never disabled", d.getElementById("sweepInterval").disabled === false);

const select = d.getElementById("sweepInterval");
select.value = "120";
select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await settle();
check("the interval persists", saved.sync.settings?.sweepIntervalMinutes === 120);

const delay = d.getElementById("delay");
delay.value = "9";
delay.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
await settle();
check("the delay persists", saved.sync.settings?.maxDelaySeconds === 9);
check("the delay readout follows", d.getElementById("delayOut").textContent === "5 to 9s");

d.getElementById("master").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
await settle();
check("the master switch persists", saved.sync.settings?.enabled === false);
check("settings are mirrored locally", saved.local.settings?.enabled === false);
check("every setting key round trips", Object.keys(dom.window.AUTOCLAIM_DEFAULTS).every((k) => k in saved.sync.settings));
check("no runtime errors", errors.length === 0);

let failed = 0;
for (const [n, ok] of checks) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); }
if (errors.length) console.log(errors);
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
