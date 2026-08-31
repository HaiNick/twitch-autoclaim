import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pins the fullscreen behaviour: a zero-size button is claimable, a hidden one
 * is not, and the display:none waiver applies only to the points container
 * while the document is fullscreen.
 */
const dom = new JSDOM(`<body>
  <div id="normal"><button id="a" style="width:40px;height:40px">Claim Bonus</button></div>
  <div id="collapsed" style="width:0;height:0"><button id="b">Claim Bonus</button></div>
  <div id="gone" style="display:none"><button id="c">Claim Bonus</button></div>
  <div id="hidden" style="visibility:hidden"><button id="d">Claim Bonus</button></div>
  <div id="inert"><button id="e" style="pointer-events:none">Claim Bonus</button></div>
  <div id="clear"><button id="f" style="opacity:0">Claim Bonus</button></div>
  <div style="display:none">
    <div data-test-selector="community-points-summary"><button id="chest">Claim Bonus</button></div>
  </div>
  <div style="display:none"><div class="rewards-list"><button id="redeem">Redeem</button></div></div>
</body>`, { pretendToBeVisual: true });

const { document } = dom.window;
global.document = document;
global.getComputedStyle = dom.window.getComputedStyle;

let fullscreen = null;
Object.defineProperty(document, "fullscreenElement", { get: () => fullscreen });

eval(fs.readFileSync(path.join(root, "src/selectors.js"), "utf8"));
const POINTS = globalThis.TWITCH_AUTOCLAIM_SELECTORS.channelPoints;
const DROPS = globalThis.TWITCH_AUTOCLAIM_SELECTORS.streamDrops;

// mirrors src/content.js
function isRendered(el) {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
  }
  return true;
}

function isClickable(el, group) {
  if (!el || !el.isConnected) return false;
  if (getComputedStyle(el).pointerEvents === "none") return false;
  if (isRendered(el)) return true;
  return Boolean(group?.hiddenInFullscreen && document.fullscreenElement && el.closest(group.hiddenInFullscreen));
}

const $ = (id) => document.getElementById(id);
const checks = [];
const check = (n, ok) => checks.push([n, ok]);

check("a normal button is clickable", isClickable($("a"), POINTS) === true);
check("a zero-size button is clickable, the fullscreen case", isClickable($("b"), POINTS) === true);
check("visibility:hidden is not", isClickable($("d"), POINTS) === false);
check("pointer-events:none is not", isClickable($("e"), POINTS) === false);
check("opacity:0 is not", isClickable($("f"), POINTS) === false);
check("a hidden button outside the container is not", isClickable($("c"), POINTS) === false);
check("the hidden chest is refused when windowed", isClickable($("chest"), POINTS) === false);

fullscreen = document.body;
check("the hidden chest is allowed in fullscreen", isClickable($("chest"), POINTS) === true);
check("a hidden Redeem is still refused in fullscreen", isClickable($("redeem"), POINTS) === false);
check("drops get no waiver, they have no container", isClickable($("chest"), DROPS) === false);
check("pointer-events still wins in fullscreen", isClickable($("e"), POINTS) === false);
fullscreen = null;

const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
const guard = source.slice(source.indexOf("function isClickable"), source.indexOf("const isDisabled"));
const sized = /rect\.(width|height)|getBoundingClientRect/.test(guard);
check("the guard does not measure the element", !sized);
check("only channel points opts into the waiver",
  Object.values(globalThis.TWITCH_AUTOCLAIM_SELECTORS).filter((g) => g.hiddenInFullscreen).length === 1);

let failed = 0;
for (const [n, ok] of checks) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); }
console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
