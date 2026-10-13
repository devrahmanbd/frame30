/**
 * Demo theme fixture — shared presentation helpers for the three demo
 * sections. Pure module: no DOM at import time, no network, no engine
 * imports. Everything here is safe to run during server render, and the
 * static render of every section below is complete without it ever loading
 * an animation engine.
 */

/** Merchant copy is copy only: always rendered escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Host-provided preference probe. SSR-safe: no window, no throw. */
export function hostPrefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Clamp merchant numeric input into a closed range — never NaN, never throw. */
export function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const value =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.floor(raw)
      : typeof raw === "string" &&
          raw.trim() !== "" &&
          Number.isFinite(Number(raw))
        ? Math.floor(Number(raw))
        : fallback;
  return Math.max(min, Math.min(max, value));
}

export type MotionPreset = "gentle" | "standard" | "bold";

/** Unknown merchant input falls back to standard — never a crash. */
export function resolveMotionPreset(raw: unknown): MotionPreset {
  if (raw === "gentle" || raw === "standard" || raw === "bold") return raw;
  return "standard";
}

/**
 * Page motion guard: one section may move content at most 600ms and 48px.
 * Presets below are capped again at mount time, so a future preset edit
 * cannot silently blow the page allowance.
 */
export const MOTION_BUDGET = {
  maxDurationMs: 600,
  maxTravelPx: 48,
} as const;

export const MOTION_PRESETS: Record<
  MotionPreset,
  { durationMs: number; travelPx: number }
> = {
  gentle: { durationMs: 240, travelPx: 12 },
  standard: { durationMs: 360, travelPx: 24 },
  bold: { durationMs: 600, travelPx: 48 },
};
