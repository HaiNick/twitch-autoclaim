(() => {
  "use strict";

  const api = globalThis.browser ?? globalThis.chrome;
  const GROUPS = globalThis.TWITCH_AUTOCLAIM_SELECTORS;

  const DEFAULTS = {
    enabled: true,
    channelPoints: true,
    streamDrops: true,
    inventoryDrops: true,
    playerPrompts: false,
    minDelayMs: 1200,
    maxDelayMs: 4500,
    logToConsole: true
  };

  let settings = { ...DEFAULTS };
  let stats = {};
  let running = false;
  let pendingScan = null;
  let lastPath = location.pathname;
  let statsFlushedAt = 0;

  const CLICK_COOLDOWN_MS = 20000;
  const SCAN_DEBOUNCE_MS = 400;
  const SAFETY_INTERVAL_MS = 5000;
  const STATS_FLUSH_MS = 5000;

  const clicked = new WeakMap();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function log(...args) {
    if (settings.logToConsole) console.log("%c[auto-claim]", "color:#a970ff", ...args);
  }

  function randomDelay() {
    const min = Math.max(0, Number(settings.minDelayMs) || 0);
    const max = Math.max(min, Number(settings.maxDelayMs) || min);
    return min + Math.random() * (max - min);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none";
  }

  function isDisabled(el) {
    return el.disabled === true || el.getAttribute("aria-disabled") === "true";
  }

  function accessibleName(el) {
    return (el.getAttribute("aria-label") || el.textContent || "").trim();
  }

  function onCooldown(el) {
    const last = clicked.get(el);
    return typeof last === "number" && Date.now() - last < CLICK_COOLDOWN_MS;
  }

  function collect(group) {
    const found = new Set();

    for (const selector of group.selectors) {
      let matches;
      try {
        matches = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of matches) {
        const target = node.closest("button") || node;
        if (isVisible(target) && !isDisabled(target)) found.add(target);
      }
    }

    for (const scopeSelector of group.textScopes || []) {
      let scopes;
      try {
        scopes = document.querySelectorAll(scopeSelector);
      } catch {
        continue;
      }
      for (const scope of scopes) {
        for (const button of scope.querySelectorAll("button")) {
          if (!group.textPattern.test(accessibleName(button))) continue;
          if (isVisible(button) && !isDisabled(button)) found.add(button);
        }
      }
    }

    return [...found];
  }

  function record(name, { seen = false, claimed = false } = {}) {
    const entry = stats[name] || { claims: 0, lastSeen: null, lastClaim: null };
    if (seen) entry.lastSeen = Date.now();
    if (claimed) {
      entry.claims += 1;
      entry.lastClaim = Date.now();
    }
    stats[name] = entry;

    const now = Date.now();
    if (claimed || now - statsFlushedAt > STATS_FLUSH_MS) {
      statsFlushedAt = now;
      api.storage.local.set({ stats });
    }
  }

  async function scan(reason) {
    if (!settings.enabled || running) return;
    running = true;
    try {
      for (const [name, group] of Object.entries(GROUPS)) {
        if (!settings[group.toggle]) continue;
        if (group.pathTest && !group.pathTest.test(location.pathname)) continue;

        const targets = collect(group);
        if (!targets.length) continue;
        record(name, { seen: true });

        for (const target of targets) {
          if (onCooldown(target)) continue;

          await sleep(randomDelay());
          if (!settings.enabled) return;
          if (!isVisible(target) || isDisabled(target)) continue;

          target.click();
          clicked.set(target, Date.now());
          record(name, { claimed: true });
          log(`claimed ${group.label} (${reason}): "${accessibleName(target).slice(0, 40)}"`);

          await sleep(700);
        }
      }
    } catch (error) {
      console.warn("[auto-claim] scan failed:", error);
    } finally {
      running = false;
    }
  }

  function queueScan(reason) {
    if (pendingScan) return;
    pendingScan = setTimeout(() => {
      pendingScan = null;
      scan(reason);
    }, SCAN_DEBOUNCE_MS);
  }

  function dryRun() {
    const report = {};
    for (const [name, group] of Object.entries(GROUPS)) {
      const applies = !group.pathTest || group.pathTest.test(location.pathname);
      report[name] = {
        label: group.label,
        applies,
        matches: applies ? collect(group).length : 0
      };
    }
    return { url: location.pathname, report };
  }

  new MutationObserver(() => queueScan("mutation")).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      log("navigated to", lastPath);
    }
    queueScan("interval");
  }, SAFETY_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) queueScan("visible");
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) settings = { ...DEFAULTS, ...changes.settings.newValue };
    if (changes.stats && changes.stats.newValue) stats = changes.stats.newValue;
  });

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "scanNow") {
      sendResponse(dryRun());
      queueScan("manual");
    }
    return false;
  });

  api.storage.local.get(["settings", "stats"]).then((stored) => {
    settings = { ...DEFAULTS, ...(stored.settings || {}) };
    stats = stored.stats || {};
    log("active on", location.pathname, settings.enabled ? "(enabled)" : "(paused)");
    queueScan("startup");
  });
})();
