/** Stable Phase 6 policy shared by tests, tooling and UI. */
export const BROWSER_MATRIX = [
  "last 2 Chrome versions",
  "last 2 Edge versions",
  "last 2 Firefox versions",
  "Safari >= 16.4",
  "iOS >= 16.4",
  "last 2 ChromeAndroid versions",
  "last 2 Samsung versions",
] as const;

export const BUILDER_MIN_VIEWPORT_PX = 1024;

export const MODERN_CSS_FEATURES = [
  { token: "container-type", supports: "(container-type: inline-size)" },
  { token: "dvh", supports: "(height: 100dvh)" },
  { token: "subgrid", supports: "(grid-template-columns: subgrid)" },
] as const;

export const SMOKE_ENGINES = ["chromium", "firefox", "webkit"] as const;
