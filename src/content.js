(() => {
  "use strict";

  const api = globalThis.autoclaimApi;
  const GROUPS = globalThis.TWITCH_AUTOCLAIM_SELECTORS;
  const SWEEP_LABEL = "drops inventory";

  let settings = { ...globalThis.AUTOCLAIM_DEFAULTS };
  let stats = {};
  let running = false;
  let pendingScan = null;
  let lastPath = location.pathname;
  let statsFlushedAt = 0;

  let sweepMode = false;
  let sweepClaims = 0;
  let sweepIdleChecks = 0;
  let sweepStartedAt = 0;

  const CLICK_COOLDOWN_MS = 20000;
  const SCAN_DEBOUNCE_MS = 400;
  const SAFETY_INTERVAL_MS = 5000;
  const STATS_FLUSH_MS = 5000;
  const MAX_EVENTS = 50;
  const SWEEP_MIN_DELAY_MS = 250;
  const SWEEP_MAX_DELAY_MS = 900;
  const SWEEP_SETTLE_MS = 10000;
  const SWEEP_GIVE_UP_MS = 25000;
  const SWEEP_IDLE_CHECKS = 3;

  const clicked = new WeakMap();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function log(...args) {
    if (settings.logToConsole) console.log("%c[auto-claim]", "color:#a970ff", ...args);
  }

  function randomDelay() {
    if (sweepMode) return SWEEP_MIN_DELAY_MS + Math.random() * (SWEEP_MAX_DELAY_MS - SWEEP_MIN_DELAY_MS);
    const max = Math.max(2, Number(settings.maxDelaySeconds) || 4) * 1000;
    const min = max / 2;
    return min + Math.random() * (max - min);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none";
  }

  const isDisabled = (el) => el.disabled === true || el.getAttribute("aria-disabled") === "true";
  const accessibleName = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim();

  function onCooldown(el) {
    const last = clicked.get(el);
    return typeof last === "number" && Date.now() - last < CLICK_COOLDOWN_MS;
  }

  function applies(group) {
    return !group.pathTest || group.pathTest.test(location.pathname);
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

  /** Inventory claims belong to the sweep, not to whatever channel you last watched. */
  function currentChannel() {
    if (/^\/drops\/inventory/.test(location.pathname)) return null;
    const segment = location.pathname.split("/").filter(Boolean)[0];
    if (!segment) return null;
    return /^(directory|drops|settings|u|videos|search|following|subscriptions|wallet)$/.test(segment) ? null : segment;
  }

  function dayKey(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /**
   * History is read-modify-written on every claim rather than held in memory,
   * so two Twitch tabs claiming at the same time do not overwrite each other.
   * Daily buckets are never pruned: a bucket costs roughly 115 bytes, so a
   * decade of daily use stays under 3 percent of the local quota, and keeping
   * them is what makes the all-time view exact.
   */
  async function appendHistory(name) {
    const at = Date.now();
    const channel = currentChannel();
    const stored = await api.storage.local.get(["daily", "events"]);

    const daily = stored.daily || {};
    const key = dayKey(at);
    const bucket = daily[key] || { channels: {} };
    bucket[name] = (bucket[name] || 0) + 1;
    if (channel) {
      bucket.channels = bucket.channels || {};
      bucket.channels[channel] = (bucket.channels[channel] || 0) + 1;
    }
    daily[key] = bucket;

    const events = stored.events || [];
    events.push({ at, group: name, channel: channel || SWEEP_LABEL });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

    await api.storage.local.set({ daily, events });
  }

  async function scan(reason) {
    if (!settings.enabled || running) return;
    running = true;
    try {
      for (const [name, group] of Object.entries(GROUPS)) {
        if (!settings[group.toggle] || !applies(group)) continue;

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
          appendHistory(name).catch((error) => console.warn("[auto-claim] history write failed:", error));
          if (sweepMode) sweepClaims += 1;
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

  /** Reports matches per group without clicking. null means the group does not apply here. */
  function dryRun() {
    const report = {};
    for (const [name, group] of Object.entries(GROUPS)) {
      report[name] = applies(group) ? collect(group).length : null;
    }
    return { path: location.pathname, twitch: true, report };
  }

  const isLoggedOut = () => Boolean(document.querySelector('[data-a-target="login-button"]'));
  const inventoryRendered = () => Boolean(document.querySelector('[data-test-selector*="Drops" i], [class*="inventory" i]'));

  function endSweep(reason) {
    if (!sweepMode) return;
    sweepMode = false;
    log(`sweep finished (${reason}), claimed ${sweepClaims}`);
    api.runtime.sendMessage({ type: "sweepDone", claimed: sweepClaims, reason }).catch(() => {});
  }

  function watchSweep() {
    if (!sweepMode) return;
    const age = Date.now() - sweepStartedAt;

    if (isLoggedOut()) {
      endSweep("loggedOut");
      return;
    }

    if (collect(GROUPS.inventoryDrops).length) {
      sweepIdleChecks = 0;
      queueScan("sweep");
      return;
    }

    if (age < SWEEP_SETTLE_MS || (!inventoryRendered() && age < SWEEP_GIVE_UP_MS)) return;

    sweepIdleChecks += 1;
    if (sweepIdleChecks >= SWEEP_IDLE_CHECKS || age > SWEEP_GIVE_UP_MS) endSweep("done");
  }

  async function initSweep() {
    if (!/^\/drops\/inventory/.test(location.pathname)) return;

    let response;
    try {
      response = await api.runtime.sendMessage({ type: "sweepStatus" });
    } catch {
      return;
    }
    if (!response?.sweeping) return;

    sweepMode = true;
    sweepStartedAt = Date.now();
    log("sweep mode active, draining inventory");
    setInterval(watchSweep, 2000);
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
    if (changes.settings && (area === "sync" || area === "local")) {
      globalThis.readSettings().then((next) => {
        settings = next;
      });
    }
    if (area === "local" && changes.stats?.newValue) stats = changes.stats.newValue;
  });

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "scanNow") {
      sendResponse(dryRun());
      queueScan("manual");
    }
    return false;
  });

  Promise.all([globalThis.readSettings(), api.storage.local.get("stats")]).then(([loaded, stored]) => {
    settings = loaded;
    stats = stored.stats || {};
    log("active on", location.pathname, settings.enabled ? "(enabled)" : "(paused)");
    queueScan("startup");
    initSweep();
  });
})();
