/**
 * Claims-activation isolation — editor carrier alone.
 *
 * Imports ONLY the editor chain (`@/lib/unified-widget-registry` →
 * `components/builder/songoskriti.tsx` → `claims-activation.ts`); never
 * `builtin-themes` / `preview.ts`. Proves the pack's lazy activation hop
 * (`claims-activation.ts`) registers all 13 presentation claims without the
 * storefront carrier — the gap the Task 6 value-import silently held (and
 * `widget-registry.test.ts` rejects). RED tooth: removing the dynamic hop
 * from the pack file fails this file.
 */
import { describe, expect, it, vi } from "vitest";
import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";
import { resolveThemePresentation } from "@/lib/theme-presentations";
import "@/lib/unified-widget-registry";
import { SONGOSKRITI_PRESENTATION_CLAIMS } from "./presentation-claims";

describe("claims-activation — editor carrier alone", () => {
  it("registers every claim through the pack's lazy activation hop (no preview.ts)", async () => {
    await vi.waitFor(
      () => {
        for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
          expect(resolveThemePresentation("songoskriti", key)).toBeDefined();
        }
      },
      { timeout: 2000 },
    );
    for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
      expect(resolveThemePresentation("songoskriti", key)).toBe(
        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS],
      );
    }
  });
});
