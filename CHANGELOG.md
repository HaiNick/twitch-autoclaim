# Changelog

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
