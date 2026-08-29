/**
 * Every assumption about Twitch's DOM lives in this file.
 * When Twitch ships a UI change, this is the only file you need to edit.
 *
 * Each group has:
 *   toggle      key in the settings object that enables the group
 *   label       name shown in the popup
 *   pathTest    optional: only run on matching location.pathname
 *   selectors   direct CSS matches, tried in order, most specific first
 *   textScopes  containers that are safe to search by button text
 *   textPattern accessible-name pattern used inside textScopes only
 *
 * Rule for adding selectors: never match a bare `button` outside a scope.
 * Twitch reuses generic button classes for reward redemption, subscribing,
 * and gifting, so an unscoped match can spend points instead of claiming them.
 */
globalThis.TWITCH_AUTOCLAIM_SELECTORS = {
  channelPoints: {
    toggle: "channelPoints",
    label: "Channel point bonus",
    selectors: [
      '[data-test-selector="community-points-summary"] button[aria-label*="claim" i]',
      '[data-test-selector="community-points-summary"] button[aria-label*="bonus" i]',
      'button[data-test-selector="community-points-claim"]',
      ".claimable-bonus__icon",
      'button[aria-label="Claim Bonus"]',
      'button[data-a-target="chat-claim-bonus-button"]'
    ],
    textScopes: [
      '[data-test-selector="community-points-summary"]',
      '[class*="community-points" i]'
    ],
    textPattern: /^(claim|bonus|claim bonus|prämie|bonus einlösen)/i
  },

  streamDrops: {
    toggle: "streamDrops",
    label: "Drop claim on stream",
    selectors: [
      '[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
      'button[data-a-target="drops-claim-button"]',
      'button[aria-label*="claim drop" i]'
    ],
    textScopes: [
      '[data-test-selector*="Drops" i]',
      '[class*="drops" i][class*="notification" i]',
      '[data-a-target="toast"]'
    ],
    textPattern: /^(claim|claim now|claim drop|einlösen)/i
  },

  inventoryDrops: {
    toggle: "inventoryDrops",
    label: "Drop claim in inventory",
    pathTest: /^\/drops\/inventory/,
    selectors: [
      '[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
      'button[data-a-target="drops-claim-button"]'
    ],
    textScopes: [
      '[data-test-selector*="Drops" i]',
      '[class*="inventory" i]'
    ],
    textPattern: /^(claim|claim now|einlösen)/i
  },

  playerPrompts: {
    toggle: "playerPrompts",
    label: "Player interruptions",
    selectors: [
      'button[data-a-target="player-overlay-mature-accept"]',
      'button[data-a-target="content-classification-gate-overlay-start-watching-button"]'
    ],
    textScopes: [
      '[data-a-target="player-overlay-click-handler"]',
      '[class*="content-overlay-gate" i]',
      '[class*="player-overlay" i]'
    ],
    textPattern: /^(start watching|continue watching|still watching|i'?m still here|weiter ansehen)/i
  }
};
