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
 * Registered into the shared singleton on import (guarded, idempotent —
 * the same side-effect pattern as the `registerThemePresentation` calls
 * in the sibling presentation modules), so the editor resolves its schema
 * through the singleton path and threaded registries resolve the exported
 * def.
 */
import { registerWidget, type WidgetDef } from "@/lib/unified-widget-registry";

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

try {
  registerWidget(SongoskritiOrnamentDef);
} catch {
  // Singleton unavailable — threaded registries still resolve the def.
}
