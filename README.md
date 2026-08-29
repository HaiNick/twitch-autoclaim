# Twitch Auto Claim (personal build)

A single-purpose MV3 extension that clicks the claim buttons Twitch already shows you: channel point bonus chests, drop claim buttons on the stream page, and drop claim buttons in the drops inventory. It replaces the abandoned "Automatic Twitch: Drops, Moments and Points" extension without the parts that made that one dangerous.

## What it does not do

The failure mode of the original extension was scope. Once the developer sold it, the existing permissions were enough to open ad tabs on any site. This build removes that possibility:

- `host_permissions` is `https://www.twitch.tv/*` only. It cannot read or touch any other site.
- No `tabs`, `webRequest`, `scripting`, `cookies`, or `<all_urls>` permission.
- No background service worker, so nothing runs when you are not on Twitch.
- No `fetch`, no `XMLHttpRequest`, no analytics, no remote code. Everything ships in the package.
- The only storage is `storage.local` holding your toggles and claim counters.

You can verify all of this with `grep -rn "fetch\|XMLHttpRequest\|http" src/`. The only hits are comments.

## Install

Firefox (temporary, resets on restart):

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**, and select `manifest.json`.

Firefox (permanent) requires either Developer Edition with `xpinstall.signatures.required=false` in `about:config`, or a self-signed build through [web-ext sign](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/). Package it with:

```bash
cd twitch-autoclaim && zip -r ../twitch-autoclaim.xpi . -x '*.git*'
```

Chromium, Brave, or Edge:

1. Go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**, and select the `twitch-autoclaim` folder.

After loading, reload any open Twitch tab. Content scripts do not inject into tabs that were already open.

## Use

Click the toolbar icon for the popup. The master switch pauses everything without uninstalling. The four toggles map one to one to the selector groups in `src/selectors.js`.

The delay slider sets the upper bound of the random wait before a click, from 1 to 15 seconds. The lower bound follows at half the upper value. A random delay in the low seconds looks like a person reaching for a chest icon; an instant click on every mutation does not.

`playerPrompts` is off by default. It accepts mature content gates and "still watching" prompts, which is convenient for long AFK sessions but means the extension clicks through a consent dialog for you. Turn it on deliberately.

## Stats

Click **History** in the popup, or open the extension's options entry, for the full history page. It reads the same `storage.local` data the content script writes:

- Totals for the last 7, 30, or 90 days: claims in range, claims today, best day, days with activity.
- A stacked bar per day, colored by selector group, so a drop in one group stands out from a quiet week.
- A per-group table with each group's share of the range and its last successful claim.
- All-time top channels, taken from the first path segment of the URL at claim time. The drops inventory is recorded as `(inventory)`.
- The last 25 individual claims with timestamp, channel, and group.

**Export JSON** writes the whole store to a file. **Clear history** wipes counts, channels, and events, and leaves your toggles alone.

History keeps 90 days of daily buckets and the last 800 events, pruned on write, so the store stays well under the `storage.local` quota. Each claim does a read-modify-write of the history keys, so two Twitch tabs claiming at the same moment do not overwrite each other's totals.

## The readout

The popup shows three columns per selector group: the group name, how many claims it has made, and when its selectors last matched anything on the page. That last column is the diagnostic. If channel points shows `3d ago` while you have been watching all week, Twitch changed the DOM and the selectors need an update. Green means matched within the hour.

**Scan this tab** runs a dry pass against the current page and reports how many elements each group matches right now, without clicking. Use it when a claim button is visible on screen and you want to know whether the extension can see it.

## Fixing it when Twitch changes the UI

This is the maintenance that killed the old extensions. Everything DOM-specific lives in `src/selectors.js`, so a fix is a two-minute edit:

1. On Twitch, right-click the claim button and select **Inspect**.
2. In DevTools, find the nearest ancestor or the button itself carrying a `data-test-selector` or `data-a-target` attribute. Prefer those over class names. Twitch generates classes like `ScCoreButton-sc-ocjdkq-0` from styled-components, and the hash changes on every deploy.
3. Add the new selector at the top of that group's `selectors` array in `src/selectors.js`. Leave the old entries in place. They cost nothing and keep working on pages Twitch has not migrated yet.
4. Reload the extension, then reload the Twitch tab.

If you can only find hashed classes, use the `textScopes` and `textPattern` mechanism instead: add a container selector that is stable, and let the button be found by its accessible name. Never add a bare `button` selector outside a scope. Twitch reuses the same button component for redeeming rewards, subscribing, and gifting, so an unscoped match can spend your points instead of collecting them. The included jsdom test in the project notes covers exactly that case.

## Known limits

- Drops only progress while a qualifying stream is actually playing in a tab. This extension claims, it does not mine. For AFK farming without video, [Twitch Drops Miner](https://github.com/DevilXD/TwitchDropsMiner) talks to the GraphQL API instead, which is a different risk profile.
- Twitch has shipped anti-automation checks on drop claiming before. If claims start failing, turn the drop groups off and claim from the inventory page by hand for a while.
- Automating interactions is a gray area under the [Twitch Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/), which restricts automated access to the service. Clicking a button that the site renders for you on a page you have open is the mildest end of it, but it is your account.

## Files

```
manifest.json        permissions and entry points
src/selectors.js     every DOM assumption, the only file to edit on breakage
src/content.js       observer, debounce, cooldown, click logic
src/popup.html/.css/.js   toggles and the selector health readout
src/stats.html/.css/.js   history page: daily chart, groups, channels, events
test/                     jsdom checks for selector safety and page rendering
icons/               generated PNGs
```

## Tests

```bash
cd test && npm install jsdom
node selector-test.mjs      # no selector may match Redeem or the points balance
node stats-render-test.mjs  # history page renders against fake data without errors
```
