/**
 * Songoskriti ornament divider — registry WidgetDef (no components).
 *
 * Kept separate from `ornament-presentation.tsx` so each file owns one
 * concern (the react-refresh lint contract: files exporting components
 * export nothing else). Identity `theme:songoskriti/ornament`, claimed by
 * `songoskriti`: value-layer shape only (`PropField` from
 * `src/lib/widget-props.ts` — text plus two closed selects; no invented
 * kinds) with defaults that validate clean through `validateProps`.
 *
 * The def is NOT registered synchronously here. `unified-widget-registry.ts`
 * creates its singleton eagerly (`const shared = createWidgetRegistry()`,
 * :927) and statically imports the widget packs (:110-127), while
 * `widgets.tsx` statically imports the pack (:43) and eagerly spreads
 * `...SONGOSKRITI_WIDGETS` at module body (:1666-1668). A static
 * `import { registerWidget }` from this file would initialize the registry
 * inside the pack's evaluation window — either a TDZ crash
 * (`widgets.tsx` body reads the not-yet-initialized pack const) or, in
 * registry-first orders, a silent skip (the existing try/catch swallows the
 * TDZ), leaving the def off the singleton that the editor tray reads.
 *
 * Instead this file is registry-import-free at runtime (`import type`
 * only) and self-claims the def lazily via a guarded dynamic
 * `import("@/lib/unified-widget-registry")`. The dynamic import defers
 * registry evaluation until after the static graph settles, in every
 * evaluation order; the `getWidget` guard makes the claim idempotent across
 * carriers, and the rejection handler keeps it free of unhandled
 * rejections. `registerWidget` is itself idempotent (same id + version
 * overwrites in place), so a repeat claim is harmless.
 *
 * TDZ resilience: when this file is reached through the pack's own static
 * import window (registry-first order), `shared` (:927) is not yet
 * initialized and any exported accessor throws "Cannot access 'shared'
 * before initialization". The claim retries on the next tick so it lands
 * after the static graph settles in every evaluation order.
 */
import type { WidgetDef } from "@/lib/unified-widget-registry";

/** Registry identity this theme owns (`theme:<owner>/...`). */
export const SONGOSKRITI_ORNAMENT_ID = "theme:songoskriti/ornament";

/**
 * Registry WidgetDef for the ornament divider: `text` eyebrow plus two
 * closed `select` vocabularies; every default validates clean.
 */
export const SongoskritiOrnamentDef: WidgetDef = {
  id: SONGOSKRITI_ORNAMENT_ID,
  namespace: "theme",
  version: "1.0.0",
  label: "Songoskriti ornament",
  category: "content",
  slots: ["header", "main", "footer"],
  defaults: { eyebrow: "", motif: "diamond", rule: "single" },
  propsSchema: {
    fields: [
      { key: "eyebrow", label: "Eyebrow", kind: "text" },
      {
        key: "motif",
        label: "Motif",
        kind: "select",
        options: [
          { value: "diamond", label: "Diamond" },
          { value: "bloom", label: "Bloom" },
          { value: "rule", label: "Rule only" },
        ],
      },
      {
        key: "rule",
        label: "Rule",
        kind: "select",
        options: [
          { value: "single", label: "Single" },
          { value: "double", label: "Double" },
          { value: "none", label: "None" },
        ],
      },
    ],
  },
  themes: ["songoskriti"],
  renderer: "custom",
};

/**
 * Lazy, idempotent self-claim of this def on the shared registry singleton.
 */
function claimSongoskritiOrnament(
  registry: typeof import("@/lib/unified-widget-registry"),
): void {
  try {
    if (registry.getWidget(SONGOSKRITI_ORNAMENT_ID)) return;
    registry.registerWidget(SongoskritiOrnamentDef);
  } catch {
    // TDZ guard (registry-first order): `shared` is not yet initialized when
    // this dynamic import resolves mid-evaluation. Retry on the next tick so
    // the claim lands after the static graph settles.
    setTimeout(() => {
      import("@/lib/unified-widget-registry")
        .then(claimSongoskritiOrnament)
        .catch(() => {});
    }, 0);
  }
}

// Self-claim the def on the shared singleton after the static graph settles.
import("@/lib/unified-widget-registry")
  .then(claimSongoskritiOrnament)
  .catch(() => {});
