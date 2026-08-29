# Privacy policy

Last updated: August 30, 2026

Twitch Auto Claim collects no personal data. It sends no data anywhere, because it makes no network requests at all.

## What the extension stores

The extension writes the following to `chrome.storage.local`, which keeps data on your own machine:

- Your settings: which claim types are enabled, the click delay, and the sweep interval.
- A claim history: daily claim counts per claim type, per-channel claim totals, and the 800 most recent claim events. An event records a timestamp, the claim type, and the channel name taken from the page URL.

The extension uses `chrome.storage.local` and never `chrome.storage.sync`, so this data does not travel to a Google account or to another device. Chrome deletes it when you uninstall the extension. **Clear history** on the extension's history page deletes it at any time.

## What the extension does not do

- It makes no network requests. It contains no analytics, no telemetry, no crash reporting, and no remote code.
- It does not read, store, or transmit account credentials, cookies, or authentication tokens.
- It does not share or sell data, because no data leaves your machine.
- It cannot access any site other than `https://www.twitch.tv`, which is the only host in its `host_permissions`.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Saves your settings and local claim history. |
| `alarms` | Schedules the optional drops inventory sweep. |
| `https://www.twitch.tv/*` | Reads the page to find a claim button and click it. |

## Source

The full source is at [github.com/HaiNick/twitch-autoclaim](https://github.com/HaiNick/twitch-autoclaim). Anyone can verify these claims by reading it.

## Contact

Open an issue at [github.com/HaiNick/twitch-autoclaim/issues](https://github.com/HaiNick/twitch-autoclaim/issues).
