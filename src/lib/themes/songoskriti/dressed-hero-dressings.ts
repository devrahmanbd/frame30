/**
 * Songoskriti versioned dressing descriptors (no components).
 *
 * Kept separate from `dressed-hero-presentation.tsx` so each file owns one
 * concern (the react-refresh lint contract: files exporting components
 * export nothing else). Entries claim the shared `builtin:hero` widget
 * (`^1.0.0` line with a builder-API floor, plus a legacy `headline` →
 * `title` migration so a theme switch preserves merchant settings) and the
 * compatible third-party `plugin:acme/reviews` widget (`^1.0.0`).
 *
 * Registered into the versioned table on import (guarded, idempotent,
 * first-wins — the same side-effect pattern as the sibling presentation
 * modules), so importing the theme wires its dressings; tests re-register
 * the exported descriptors after the shared reset.
 */
import {
  registerVersionedPresentation,
  type VersionedPresentationEntry,
} from "@/lib/theme-presentations";
import {
  SongoskritiDressedHeroPresentation,
  SongoskritiDressedReviewsPresentation,
} from "./dressed-hero-presentation";

export const SONGOSKRITI_HERO_DRESSING: VersionedPresentationEntry = {
  owner: "songoskriti",
  widgetId: "builtin:hero",
  versionRange: "^1.0.0",
  minBuilderApi: "3.1.0",
  component: SongoskritiDressedHeroPresentation,
  migrate: (prev) => {
    const next: Record<string, unknown> = { ...prev };
    if (typeof next["title"] !== "string" || !next["title"]) {
      const legacy = next["headline"];
      if (typeof legacy === "string" && legacy) next["title"] = legacy;
    }
    return next;
  },
};

export const SONGOSKRITI_REVIEWS_DRESSING: VersionedPresentationEntry = {
  owner: "songoskriti",
  widgetId: "plugin:acme/reviews",
  versionRange: "^1.0.0",
  component: SongoskritiDressedReviewsPresentation,
};

try {
  registerVersionedPresentation(SONGOSKRITI_HERO_DRESSING);
  registerVersionedPresentation(SONGOSKRITI_REVIEWS_DRESSING);
} catch {
  // Table unavailable — threaded callers still resolve the descriptors.
}
