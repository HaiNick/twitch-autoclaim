import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shared = fs.readFileSync(path.join(root, "src/settings.js"), "utf8");

function env({ local = {}, sync = {}, syncFails = false } = {}) {
  const stores = { local: structuredClone(local), sync: structuredClone(sync) };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => (k in stores.local ? { [k]: structuredClone(stores.local[k]) } : {}),
        set: async (o) => Object.assign(stores.local, structuredClone(o))
      },
      sync: {
        get: async (k) => {
          if (syncFails) throw new Error("sync unavailable");
          return k in stores.sync ? { [k]: structuredClone(stores.sync[k]) } : {};
        },
        set: async (o) => {
          if (syncFails) throw new Error("sync unavailable");
          Object.assign(stores.sync, structuredClone(o));
        }
      }
    }
  };
  delete globalThis.browser;
  (0, eval)(shared);
  return stores;
}

const checks = [];
const check = (n, ok) => checks.push([n, ok]);

let s = env();
check("defaults when nothing is stored", (await globalThis.readSettings()).sweepIntervalMinutes === 60);
check("player prompts is gone from the defaults", !("playerPrompts" in globalThis.AUTOCLAIM_DEFAULTS));

s = env({ sync: { settings: { maxDelaySeconds: 9 } } });
check("sync values load", (await globalThis.readSettings()).maxDelaySeconds === 9);
check("defaults fill the gaps", (await globalThis.readSettings()).enabled === true);

s = env({ local: { settings: { maxDelaySeconds: 3 } }, sync: { settings: { maxDelaySeconds: 9 } } });
check("sync wins over the local copy", (await globalThis.readSettings()).maxDelaySeconds === 9);

s = env({ local: { settings: { maxDelaySeconds: 3 } }, syncFails: true });
check("falls back to local when sync is off", (await globalThis.readSettings()).maxDelaySeconds === 3);

s = env();
await globalThis.writeSettings({ ...globalThis.AUTOCLAIM_DEFAULTS, autoSweep: true });
check("a write lands in sync", s.sync.settings.autoSweep === true);
check("a write also lands locally", s.local.settings.autoSweep === true);

s = env({ syncFails: true });
await globalThis.writeSettings({ ...globalThis.AUTOCLAIM_DEFAULTS, autoSweep: true });
check("a failed sync write still saves locally", s.local.settings.autoSweep === true);

let failed = 0;
for (const [n, ok] of checks) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); }
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
