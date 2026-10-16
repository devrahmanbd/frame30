/**
 * Frame30 starter — shared presentation helpers (ships in the bundle).
 *
 * Pure string helpers only: HTML escaping, merchant-input clamps, and the
 * page motion budget the GSAP mounts respect. No network, no secrets, no
 * server imports — the bundle gate scans this file like every other.
 */

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clampInt(value, fallback, min, max) {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : fallback;
  return Math.min(max, Math.max(min, n));
}

export const MOTION_BUDGET = { maxDurationMs: 600, maxTravelPx: 48 };

export const MOTION_PRESETS = {
  subtle: { durationMs: 240, travelPx: 12 },
  standard: { durationMs: 420, travelPx: 24 },
  expressive: { durationMs: 600, travelPx: 48 },
};

export function resolveMotionPreset(value) {
  return value === "subtle" || value === "expressive" ? value : "standard";
}
