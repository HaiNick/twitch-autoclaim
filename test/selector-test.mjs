import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const html = `
<body>
  <div class="chat">
    <div data-test-selector="community-points-summary">
      <button aria-label="Claim Bonus" style="width:40px;height:40px"><div class="claimable-bonus__icon tw-flex"></div></button>
      <button aria-label="Channel Points Balance" style="width:40px;height:40px">1200</button>
    </div>
  </div>
  <div class="rewards-list">
    <button style="width:80px;height:30px">Redeem</button>
  </div>
  <div data-test-selector="DropsCampaignInProgressRewardPresentation">
    <button data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button" style="width:80px;height:30px">Claim Now</button>
  </div>
</body>`;

const dom = new JSDOM(html, { url: "https://www.twitch.tv/drops/inventory", pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.getComputedStyle = dom.window.getComputedStyle;
global.globalThis.location = dom.window.location;

// jsdom returns zero-size rects; stub layout so the visibility filter can run
dom.window.Element.prototype.getBoundingClientRect = function () {
  const w = parseInt(this.getAttribute("style")?.match(/width:(\d+)px/)?.[1] ?? "60", 10);
  const h = parseInt(this.getAttribute("style")?.match(/height:(\d+)px/)?.[1] ?? "30", 10);
  return { width: w, height: h, top: 0, left: 0, right: w, bottom: h };
};

eval(fs.readFileSync(path.join(root, "src/selectors.js"), "utf8"));
if (Object.keys(globalThis.TWITCH_AUTOCLAIM_SELECTORS).length !== 3) { console.log("FAIL  exactly three claim groups"); process.exit(1); }
console.log("PASS  exactly three claim groups");
const GROUPS = globalThis.TWITCH_AUTOCLAIM_SELECTORS;

const isVisible = (el) => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return el.isConnected && r.width >= 2 && r.height >= 2 && s.visibility !== "hidden" && s.display !== "none";
};
const isDisabled = (el) => el.disabled === true || el.getAttribute("aria-disabled") === "true";
const name = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim();

function collect(group) {
  const found = new Set();
  for (const sel of group.selectors) {
    for (const node of document.querySelectorAll(sel)) {
      const t = node.closest("button") || node;
      if (isVisible(t) && !isDisabled(t)) found.add(t);
    }
  }
  for (const scopeSel of group.textScopes || []) {
    for (const scope of document.querySelectorAll(scopeSel)) {
      for (const b of scope.querySelectorAll("button")) {
        if (group.textPattern.test(name(b)) && isVisible(b) && !isDisabled(b)) found.add(b);
      }
    }
  }
  return [...found];
}

let fails = 0;
for (const [key, group] of Object.entries(GROUPS)) {
  const applies = !group.pathTest || group.pathTest.test(location.pathname);
  const hits = applies ? collect(group).map(name) : [];
  console.log(`${key.padEnd(16)} applies=${String(applies).padEnd(5)} hits=${JSON.stringify(hits)}`);
  if (hits.includes("Redeem") || hits.includes("Channel Points Balance")) { fails++; console.log("  !! matched a button it must never click"); }
}
console.log(fails === 0 ? "\nPASS: no unsafe matches" : "\nFAIL");
