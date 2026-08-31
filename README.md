# Twitch Auto Claim

A Chrome extension that clicks the claim buttons Twitch already shows you: channel point bonus chests, drop rewards on a stream page, and drop rewards in the drops inventory. It replaces the abandoned "Automatic Twitch: Drops, Moments and Points" extension, which shipped adware after its developer sold it.

## What the extension can reach

The original extension caused damage because its permissions covered every site. This one is scoped so the same failure cannot happen:

- `host_permissions` lists `https://www.twitch.tv/*` and nothing else. On any other site, Chrome injects no code from this extension.
- `permissions` lists `storage` and `alarms`. There is no `tabs`, `webRequest`, `scripting`, `cookies`, or `<all_urls>`.
- The extension makes no network requests. It contains no analytics, no telemetry, and no remote code.
- Your claim history lives in `chrome.storage.local` and never leaves the machine.
- Your settings live in `chrome.storage.sync`, so they follow your Chrome profile to another computer. Chrome Sync sends them to Google. Nothing else is synced.

To verify the network claim, run `grep -rn "fetch(\|XMLHttpRequest" src/`. It returns nothing.

The extension does run a background service worker, added for the inventory sweep. Chrome unloads it between alarms, and each wake reads a few settings and one tab list.

## Install the extension

1. Go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**, and select the `twitch-autoclaim` folder.
4. Reload any Twitch tab that is already open.

Chrome injects content scripts when a page loads, so tabs opened before the install claim nothing until you reload them.

After you edit a file, click the reload icon on the extension card. If you edited `src/selectors.js` or `src/content.js`, reload the Twitch tab as well.

`manifest.json` targets Chrome through `background.service_worker`, which Firefox does not support. To build for Firefox, replace that key with `"scripts": ["src/background.js"]` and add a `browser_specific_settings.gecko.id`. The rest of the source runs on both browsers.

## Claim while you watch

The popup holds one toggle per selector group:

- **Channel point bonuses** claims the bonus chest on a stream page.
- **Drops on the stream page** claims a drop reward shown next to the player.
- **Drops in the inventory** claims rewards at `https://www.twitch.tv/drops/inventory`.
The delay slider sets the upper bound of the random wait before each click, from 2 to 15 seconds; the lower bound follows at half that value. The default upper bound is 4 seconds, because a bonus chest can expire during a longer wait. A random delay in the low seconds resembles a person reaching for the chest icon. An instant click on every DOM mutation does not.

The master switch at the top pauses every group without uninstalling the extension.

### Fullscreen

Claiming works in fullscreen, and getting there took two fixes worth knowing about before you touch `isClickable` in `src/content.js`.

The guard never measures an element. `HTMLElement.click()` dispatches to React's listener without hit-testing the page, so a zero-size button clicks fine, and a size test only rejects buttons that would have worked. `test/visibility-test.mjs` fails if one reappears.

In fullscreen, Twitch also puts an ancestor of the chat column into `display:none` while leaving it mounted. A click still lands there, so the guard waives its rendered check under three conditions together: the group declares a `hiddenInFullscreen` container, `document.fullscreenElement` is set, and the element sits inside that container. Channel points is the only group that declares one.

Keep all three. A general "click hidden buttons" rule would let a stray match on Twitch's shared button component redeem a reward instead of claiming a bonus, which is the one mistake that costs the user something.

## Sweep the drops inventory

Claiming happens only on a page you have open, so a drop that finishes while the inventory page is closed waits for your next visit. The sweep makes that visit for you.

To turn it on, select **Sweep the drops inventory** in the popup and choose an interval. On that timer, the service worker opens the inventory in an inactive background tab, the content script claims what it finds and reports back, and the worker closes the tab. **Sweep now** runs one immediately.

**Only while Twitch is open** is on by default. With it, a scheduled sweep runs only when a `www.twitch.tv` tab already exists in some window. Any Twitch page counts, not only the inventory. Manual sweeps ignore this check, because pressing the button states the intent.

A sweep also skips itself when the extension is paused, when **Drops in the inventory** is off, or when the inventory is already open in a tab. The last rule prevents the worker from closing a tab you are using.

The popup reports the outcome of the last sweep:

| Message | Meaning |
| --- | --- |
| `opened tab N` | The sweep started. |
| `skipped: no Twitch tab open` | No Twitch tab exists and the gate is on. |
| `skipped: inventory already open in a tab` | You have that page open. |
| `skipped: claiming is paused` | The master switch is off. |
| `claimed N` | The sweep finished and closed its tab. |
| `background worker unreachable` | The worker did not load. Check `chrome://extensions` for a manifest error, then reload the extension. |

Inside the sweep tab, claim delays drop to 0.25 to 0.9 seconds. The tab closes once no claim button has been visible for three consecutive checks, with a 10 second floor that lets Twitch render. A `sweep-timeout` alarm closes the tab after 120 seconds regardless, so an outage or a login wall cannot leave a stray tab behind. If you are signed out, the content script detects the login button and reports back at once. State that gets stuck clears itself after 10 minutes.

Chrome unloads the service worker between events and re-runs `src/background.js` on every wake, so `syncAlarm` checks for an existing alarm and leaves a correct one in place. Recreating it on each wake restarts the countdown, and because a sweep wakes the worker itself, that turns any interval into a loop. As a second guard, a scheduled sweep refuses to run within 10 minutes of the previous one.

The timeout is generous because Chrome throttles hidden tabs. Timers clamp to roughly one second while a tab is hidden, then to once per minute after five minutes. The sweep is sized to finish inside that first window.

This feature needs the `alarms` permission. It does not need `tabs`: `tabs.create` and `tabs.remove` work without it, and withholding `tabs` keeps the extension from reading the URL or title of anything outside `www.twitch.tv`.

## View your claim history

Click **History** in the popup to open the history page. It reads the same `chrome.storage.local` keys the content script writes:

- Totals over 7, 30, or 90 days, or all time: claims in range, claims today, claims per active day, and best day.
- One column per day, stacked by claim type. Days with nothing show a thin tick, so a sparse history still reads as a pattern.
- Per-type totals as bars, showing each type's share of the range.
- Where the claims came from: the drops inventory on its own line, then the channels, all filtered by the selected range.
- The 12 most recent claims.

**Clear history** deletes the daily buckets and events, and leaves your settings in place.

Daily buckets are never pruned, which is what makes the all-time view exact. A bucket costs roughly 115 bytes, so ten years of daily use stays under 3 percent of the local quota. The event log keeps the 50 most recent claims, since the charts read from the buckets rather than from it. Each claim reads and rewrites the history keys, so two Twitch tabs claiming at the same moment do not overwrite each other's totals.

## Check selector health

Each claim row carries its own claim count and the time its selectors last matched, so a group that has gone quiet is visible where you would toggle it. A green value means a match within the hour. If a group that has claimed before stops matching for a day, a line appears at the top of the popup naming it.

**Scan** runs a dry pass over the current page and replaces those counts with live matches for 15 seconds. `n/a` means the group does not apply to this page, which is what inventory drops shows on a stream page. `0` means the group applies and found nothing, which is the signal that a selector broke if you can see a claim button on screen.

## Update the selectors when Twitch changes its UI

Unmaintained selectors are what broke the older auto-claim extensions. Every DOM assumption in this one lives in `src/selectors.js`.

1. On Twitch, right-click the claim button and select **Inspect**.
2. In DevTools, find a `data-test-selector` or `data-a-target` attribute on the button or its nearest ancestor. Prefer those attributes over class names, because Twitch generates classes such as `ScCoreButton-sc-ocjdkq-0` from styled-components and the hash changes with every deploy.
3. Add the new selector at the top of that group's `selectors` array. Leave the existing entries in place; they cost nothing and still match pages Twitch has not migrated.
4. Reload the extension, then reload the Twitch tab.

If the element carries only hashed classes, add a stable container to `textScopes` instead and let `textPattern` match the button by its accessible name.

**Warning:** never add a bare `button` selector outside a scope. Twitch renders redeem, subscribe, and gift with the same button component, so an unscoped match can spend your channel points instead of collecting them. `test/selector-test.mjs` asserts that no group matches a **Redeem** button or the points balance.

## Run the tests

```bash
cd test && npm install jsdom
node selector-test.mjs      # no group matches Redeem or the points balance
node stats-render-test.mjs  # the history page renders against fake data
node sweep-test.mjs         # the sweep opens one tab, closes it, and leaves other tabs alone
node settings-sync-test.mjs # sync wins, local is the fallback, writes survive sync being off
node popup-test.mjs         # every popup control round trips through storage
```

## Package for the Chrome Web Store

The store expects `manifest.json` at the root of the archive rather than inside a folder, and it does not need the tests or the listing copy:

```bash
cd twitch-autoclaim
zip -rq ../twitch-autoclaim-1.4.0.zip . -x '.git/*' 'node_modules/*' 'test/*' 'store/*' '*.zip' '.gitignore'
```

`store/listing.md` holds the description, single purpose statement, permission justifications, and data disclosure answers for the developer dashboard. Reviewers compare those answers against the source, so keep them accurate.

## Limitations

- Drops advance only while a qualifying stream plays in a tab. The sweep collects finished drops; it does not progress them. To farm without video, use [Twitch Drops Miner](https://github.com/DevilXD/TwitchDropsMiner), which drives the GraphQL API and carries a different risk profile.
- Twitch has shipped anti-automation checks on drop claiming before. If claims start failing, turn the drop groups off and claim by hand for a while.
- The [Twitch Terms of Service](https://www.twitch.tv/p/legal/terms-of-service/) restrict automated access to the service. Clicking a button the site renders on a page you have open sits at the mild end of that, and the account risk is yours.

## File map

```
manifest.json             permissions and entry points
src/settings.js           shared defaults, and the sync read with a local fallback
src/selectors.js          every DOM assumption, the file to edit when Twitch changes
src/content.js            observer, debounce, cooldown, click logic, sweep mode
src/background.js         sweep scheduling, tab lifecycle, timeout
src/popup.html/.css/.js   toggles, sweep controls, selector health readout
src/stats.html/.css/.js   history page: daily chart, groups, channels, events
test/                     jsdom checks for selector safety, rendering, and sweeps
store/                    Chrome Web Store listing copy and promo tile
icons/                    generated PNGs
```
