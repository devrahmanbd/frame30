/**
 * Theme bridge v2 — `seen` prune (guard memory stays bounded per mount).
 *
 * - Long sessions stay bounded: thousands of admitted ids never grow the
 *   set past the cap (O(cap) memory per mount).
 * - Recent duplicates still refuse (replay horizon preserved): an id seen
 *   within the retain window is still `theme.duplicate_id`.
 * - Pruned (ancient) ids may be re-admitted — the documented tradeoff of a
 *   bounded set vs unbounded memory. Fresh mounts reset via
 *   `resetThemeGuard` regardless.
 * - Rate limiting is untouched: the window still admits 30 per 10s.
 */
import { describe, expect, it } from "vitest";
import {
  checkThemeGuard,
  createThemeGuard,
  resetThemeGuard,
  THEME_BRIDGE_MAX_MESSAGES,
  THEME_GUARD_MAX_SEEN,
  THEME_GUARD_SEEN_RETAIN,
} from "./bridge-v2";

describe("seen prune — bounded duplicate state per mount", () => {
  it("stays bounded across a long session (window slides, seen caps)", () => {
    expect(THEME_GUARD_MAX_SEEN).toBeGreaterThan(THEME_BRIDGE_MAX_MESSAGES);
    expect(THEME_GUARD_SEEN_RETAIN).toBeLessThan(THEME_GUARD_MAX_SEEN);
    const guard = createThemeGuard();
    // 10 windows × 30 admits = 3000 admitted ids, advancing the clock past
    // the rate window each round so nothing is rate-limited.
    let now = 0;
    for (let i = 0; i < 3000; i++) {
      if (i > 0 && i % THEME_BRIDGE_MAX_MESSAGES === 0) {
        now += 10_001;
      }
      const out = checkThemeGuard(guard, `long-${i}`, now);
      expect(out.ok, `id long-${i}`).toBe(true);
    }
    expect(guard.times.length).toBeLessThanOrEqual(THEME_BRIDGE_MAX_MESSAGES);
    expect(guard.seen.size).toBeLessThanOrEqual(THEME_GUARD_MAX_SEEN);
  });

  it("recent duplicates still refuse within the retain horizon", () => {
    const guard = createThemeGuard();
    expect(checkThemeGuard(guard, "recent-1", 0).ok).toBe(true);
    expect(checkThemeGuard(guard, "recent-1", 1)).toEqual({
      ok: false,
      error: "theme.duplicate_id",
    });
  });

  it("reset still forgets everything (new mount, no replay bleed)", () => {
    const guard = createThemeGuard();
    expect(checkThemeGuard(guard, "a", 0).ok).toBe(true);
    resetThemeGuard(guard);
    expect(guard.times.length).toBe(0);
    expect(guard.seen.size).toBe(0);
    expect(checkThemeGuard(guard, "a", 1).ok).toBe(true);
  });

  it("non-string ids spend rate budget without touching seen", () => {
    const guard = createThemeGuard();
    expect(checkThemeGuard(guard, 42, 0).ok).toBe(true);
    expect(guard.seen.size).toBe(0);
    expect(guard.times.length).toBe(1);
  });
});
