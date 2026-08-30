# Chrome Web Store submission notes

Paste these values into the developer dashboard. Reviewers compare the answers against the source, so change them only when the code changes.

## Single purpose

Click the claim buttons that Twitch displays to the signed-in user: channel point bonuses, drop rewards on a stream page, and drop rewards in the drops inventory.

## Summary

Maximum 132 characters:

> Claims Twitch channel point bonuses and drops for you. Runs only on twitch.tv and stores nothing off your machine.

## Description

Twitch Auto Claim clicks the claim buttons Twitch already shows you, so a bonus chest or a finished drop does not expire while you are away from the keyboard.

What it does:

- Claims the channel point bonus chest on a stream page.
- Claims drop rewards on a stream page and in the drops inventory.
- On a timer, opens the drops inventory in a background tab, claims what is there, and closes the tab. The sweep runs only while a Twitch tab is open, and it is off by default.
- Records a local history of what it claimed and when, with a daily chart and per-channel totals.

What it does not do:

- Reach any site other than twitch.tv.
- Make network requests of its own. It contains no analytics, no telemetry, and no remote code.
- Read, store, or transmit account credentials.

Every claim is a click on a button that is already visible to you.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Saves the local claim history and the user's settings. History uses `chrome.storage.local` and stays on the device; settings use `chrome.storage.sync` so they follow the user's Chrome profile. |
| `alarms` | Schedules the optional drops inventory sweep. The sweep cannot run on a timer without it. |
| `https://www.twitch.tv/*` | The extension reads the page to find the claim button and click it. This is the only host it requests. |

## Data usage disclosure

Answer no to every data collection category. The extension makes no network requests, so it transmits nothing itself and sells nothing. Claim history stays in `chrome.storage.local` on the user's machine. Settings use `chrome.storage.sync`, which Chrome copies to the user's own Google account; that is Chrome Sync moving the user's own preferences, not the extension collecting data. The privacy policy states this plainly.

## Distribution

Choose **Unlisted**. The extension is a personal tool, and unlisted visibility keeps store installs and automatic updates working without a public listing. **Private**, restricted to your own account, behaves the same way and draws less attention.

Review carries real risk here. The extension automates interactions on a site you do not own, and the Twitch Terms of Service restrict automated access. A reviewer who reads it that way can reject the listing or remove it later.

## Required assets

| Asset | Size | Source |
| --- | --- | --- |
| Store icon | 128x128 PNG | `icons/icon-128.png` |
| Screenshot | 1280x800 or 640x400 | Capture the popup and the history page yourself |
| Small promo tile | 440x280 PNG | `store/promo-440x280.png` |
| Marquee tile | 1400x560 | Optional |

Google's guidance for promo tiles is to communicate the brand, leave out screenshots, and avoid text, which turns unreadable at half size.
