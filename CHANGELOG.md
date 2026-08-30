# Changelog

## 2.0.0

- Settings now live in `chrome.storage.sync`, so they follow your Chrome profile to another computer. Reads fall back to a local copy when sync is off or unavailable, and writes always keep one. History stays local.
- Removes the player prompts group. It never matched anything on a real page, and it was the only feature that clicked a consent dialog on your behalf.
- Rebuilds the popup. Each claim row carries its own claim count and last-seen, replacing the separate readout table, and a line appears at the top when a group that used to work stops matching.
- **Scan** now reports live matches in the rows themselves, distinguishing `n/a` for a group that does not apply from `0` for one that applies and found nothing.
- Rebuilds the history page: an all-time range, one column per day with a tick for empty days, per-type bars, and a `where` section that splits the drops inventory from the channels.
- Channel totals follow the selected range. Channel counts moved into the daily buckets, which removes the unbounded all-time `channels` store.
- Daily buckets are no longer pruned at 90 days, which is what makes all time exact. The event log shrank from 800 entries to 50.
- Removes the JSON export.
- Default click delay is 2 to 4 seconds rather than up to 15, because a bonus chest can expire during a longer wait.

## 1.5.0

- Fixes sweeps running far more often than the chosen interval. Chrome re-runs the service worker file on every wake, and `syncAlarm` recreated the alarm each time with a one minute delay, so the countdown restarted constantly and a sweep, which wakes the worker itself, kept scheduling the next one.
- `syncAlarm` now leaves a correct alarm in place, and the first sweep waits a full interval instead of one minute.
- Only `enabled`, `autoSweep`, and `sweepIntervalMinutes` re-arm the alarm. An unrelated toggle no longer restarts the countdown.
- A scheduled sweep refuses to run within 10 minutes of the previous one, whatever the alarm does.

## 1.4.1

- Renames the extension to Twitch Auto Claim for the store listing.

## 1.4.0

- Scheduled sweeps run only when a `www.twitch.tv` tab already exists. **Only while Twitch is open** controls this and is on by default. Manual sweeps ignore it.

## 1.3.0

- Targets Chrome alone. `manifest.json` declares `background.service_worker` only, drops `browser_specific_settings`, and needs no build step.

## 1.2.1

- Tab detection no longer relies on the `tabs.query` URL filter, which a browser can ignore. The filter made every sweep report the inventory as already open.
- Sweep state that gets stuck clears itself after 10 minutes.
- **Sweep now** reports the outcome instead of leaving `sweeping...` on screen.

## 1.2.0

- Adds the scheduled inventory sweep: the service worker opens the drops inventory in a background tab, claims, and closes the tab. Adds the `alarms` permission.

## 1.1.0

- Adds the history page: daily chart, per-group and per-channel tables, recent claims, and JSON export.

## 1.0.0

- Claims channel point bonuses, drops, and player prompts, with a selector health readout in the popup.
