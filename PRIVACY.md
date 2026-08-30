# Privacy policy

Last updated: August 30, 2026

Twitch Auto Claim collects no personal data. It sends no data anywhere, because it makes no network requests at all.

## What the extension stores

Your claim history is written to `chrome.storage.local`, which keeps it on your own machine:

- Daily claim counts per claim type and per channel.
- The 50 most recent claim events. An event records a timestamp, the claim type, and the channel name taken from the page URL.

This history never leaves the device. Chrome deletes it when you uninstall the extension, and **Clear history** on the extension's history page deletes it at any time.

Your settings are written to `chrome.storage.sync`: which claim types are enabled, the click delay, and the sweep interval and its options. Chrome Sync copies them to your Google account so they apply on any computer where you are signed in to the same Chrome profile, which means these settings are handled by Google under its own privacy policy. Turning Chrome Sync off keeps them local. No claim history and no browsing data is ever synced.

## What the extension does not do

- It makes no network requests. It contains no analytics, no telemetry, no crash reporting, and no remote code.
- It does not read, store, or transmit account credentials, cookies, or authentication tokens.
- It does not share or sell data. The extension itself sends nothing anywhere; the only data that leaves the device is your settings, carried by Chrome Sync.
- It cannot access any site other than `https://www.twitch.tv`, which is the only host in its `host_permissions`.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Saves your local claim history and your synced settings. |
| `alarms` | Schedules the optional drops inventory sweep. |
| `https://www.twitch.tv/*` | Reads the page to find a claim button and click it. |

## Source

The full source is at [github.com/HaiNick/twitch-autoclaim](https://github.com/HaiNick/twitch-autoclaim). Anyone can verify these claims by reading it.

## Contact

Open an issue at [github.com/HaiNick/twitch-autoclaim/issues](https://github.com/HaiNick/twitch-autoclaim/issues).
