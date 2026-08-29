import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeEnv({ settings, openTabs = [] }) {
  const store = { settings };
  const log = { created: [], removed: [], alarms: {}, cleared: [] };
  const listeners = {};

  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        set: async (obj) => Object.assign(store, structuredClone(obj))
      },
      onChanged: { addListener: () => {} }
    },
    alarms: {
      create: (name, opts) => { log.alarms[name] = opts; },
      clear: async (name) => { log.cleared.push(name); delete log.alarms[name]; },
      onAlarm: { addListener: (fn) => { listeners.alarm = fn; } }
    },
    tabs: {
      query: async () => openTabs,
      create: async (opts) => { log.created.push(opts); return { id: 42 }; },
      remove: async (id) => { log.removed.push(id); },
      onRemoved: { addListener: (fn) => { listeners.tabRemoved = fn; } }
    },
    runtime: {
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} }
    }
  };
  delete globalThis.browser;
  return { store, log, listeners };
}

const wait = () => new Promise((r) => setTimeout(r, 20));
const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
const run = () => (0, eval)(source);

const checks = [];
const check = (name, ok) => checks.push([name, ok]);

// 1. schedule alarm only when enabled and autoSweep are both on
let env = makeEnv({ settings: { enabled: true, autoSweep: true, inventoryDrops: true, sweepIntervalMinutes: 60 } });
run(); await wait();
check("alarm created when sweeping is on", env.log.alarms.sweep?.periodInMinutes === 60);

env = makeEnv({ settings: { enabled: true, autoSweep: false } });
run(); await wait();
check("no alarm when sweeping is off", !env.log.alarms.sweep);

// 2. a scheduled sweep opens one inactive tab
env = makeEnv({ settings: { enabled: true, autoSweep: true, inventoryDrops: true } });
run(); await wait();
await env.listeners.alarm({ name: "sweep" }); await wait();
check("opens a background tab", env.log.created.length === 1 && env.log.created[0].active === false);
check("targets the inventory", env.log.created[0].url.endsWith("/drops/inventory"));
check("arms the timeout alarm", Boolean(env.log.alarms["sweep-timeout"]));

// 3. the content script reporting back closes the tab
const respond = (msg, sender) => new Promise((resolve) => {
  const kept = env.listeners.message(msg, sender, resolve);
  if (!kept) resolve(undefined);
});
await respond({ type: "sweepDone", claimed: 3 }, { tab: { id: 42 } }); await wait();
check("closes the tab it opened", env.log.removed.includes(42));
check("records the result", env.store.lastSweep?.claimed === 3);
check("clears sweep state", env.store.sweepState === null);

// 4. a foreign tab reporting done must not close anything
env = makeEnv({ settings: { enabled: true, autoSweep: true, inventoryDrops: true } });
run(); await wait();
await env.listeners.alarm({ name: "sweep" }); await wait();
await respond({ type: "sweepDone", claimed: 9 }, { tab: { id: 999 } }); await wait();
check("ignores sweepDone from an unrelated tab", env.log.removed.length === 0);

// 5. never fight a tab the user already has open
env = makeEnv({ settings: { enabled: true, autoSweep: true, inventoryDrops: true }, openTabs: [{ id: 7 }] });
run(); await wait();
await env.listeners.alarm({ name: "sweep" }); await wait();
check("skips when the inventory is already open", env.log.created.length === 0);
check("says why it skipped", env.store.lastSweep?.outcome.includes("already open"));

// 6. paused extension does not sweep
env = makeEnv({ settings: { enabled: false, autoSweep: true, inventoryDrops: true } });
run(); await wait();
await env.listeners.alarm({ name: "sweep" }); await wait();
check("no tab while claiming is paused", env.log.created.length === 0);

// 7. timeout closes the tab even if the page never reports
env = makeEnv({ settings: { enabled: true, autoSweep: true, inventoryDrops: true } });
run(); await wait();
await env.listeners.alarm({ name: "sweep" }); await wait();
await env.listeners.alarm({ name: "sweep-timeout" }); await wait();
check("timeout closes the tab", env.log.removed.includes(42));

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
