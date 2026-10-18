/**
 * Dormant presentation claims — lane (b), Songoskriti.
 *
 * Proves the dormant (b) rows are NOT registered through the productive
 * graphs, i.e. they miss to the caller fallback. This is the
 * inventory-named non-use fact:
 *
 * - HP-ANNOUNCEMENT-BAR (announcement_bar): classification.md A8 — grep
 *   returns only test files + comments; `preview.ts` does not import it;
 *   `index.ts` re-exports header-presentation + ornament only.
 * - VER-DRESSED-HERO / VER-DRESSED-REVIEWS: spec §3 lists dressed-hero as
 *   test-only; no productive importer of `dressed-hero-dressings.ts`
 *   outside tests.
 *
 * Existing direct-import proof suites (not duplicated here):
 * - src/lib/themes/announcement-presentations-proof.test.tsx
 * - src/lib/themes/footer-presentations-proof.test.tsx
 *
 * Spec §4.2(b) (presentation lane) + §4.4 (registration contract).
 */

import { describe, expect, it } from "vitest";
import {
  resolveThemePresentation,
  resolveVersionedPresentation,
} from "@/lib/theme-presentations";

// Productive entry modules (import-time registration is the subject under
// test). These must NOT register the dormant keys.
import "@/lib/themes/builtin-themes";
import "@/lib/unified-widget-registry";

const FALLBACK = () => null;

describe("songoskriti dormant presentation claims", () => {
  it("announcement_bar is not registered: misses to the fallback after productive imports", () => {
    expect(
      resolveThemePresentation("songoskriti", "announcement_bar", FALLBACK),
    ).toBe(FALLBACK);
  });

  it.each(["builtin:hero", "plugin:acme/reviews"])(
    "%s versioned dressing is not registered: misses to the fallback",
    (widgetId) => {
      expect(
        resolveVersionedPresentation("songoskriti", widgetId, {
          fallback: FALLBACK,
        }),
      ).toBe(FALLBACK);
    },
  );
});
