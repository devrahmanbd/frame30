/**
 * Songoskriti presentation-claims activation — lane (b) activator.
 *
 * Called by the widget pack (`components/builder/songoskriti.tsx`) through a
 * lazy dynamic hop once the pack's own evaluation has initialized it. The
 * hop — never a value import — is required by the widget-layer invariant in
 * `widget-registry.test.ts` ("imports no theme-specific module"), and
 * passing the already-evaluated pack sidesteps the TDZ cycle `ornament-def.ts`
 * documents for static forms. The pack is loaded by
 * `unified-widget-registry.ts` in every editor graph, so this carrier covers
 * the editor; `preview.ts` adds a synchronous storefront claim. The registrar
 * is idempotent (it skips pairs already claimed) — carriers never fight.
 */
import type { SectionType } from "@/lib/builder-ast";
import type { WidgetComponent } from "@/components/builder/widgets";
import { registerSongoskritiPresentationClaims } from "./presentation-claims";

/** Register every unclaimed Songoskriti dressing for the given pack. */
export function activateSongoskritiPresentationClaims(
  pack: Partial<Record<SectionType, WidgetComponent>>,
): void {
  registerSongoskritiPresentationClaims(pack);
}
