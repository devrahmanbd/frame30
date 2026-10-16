/**
 * Somvabona versioned dressing descriptor (no components).
 *
 * Kept separate from `dressed-hero-presentation.tsx` so each file owns one
 * concern (the react-refresh lint contract: files exporting components
 * export nothing else). The entry claims the shared `builtin:hero` widget on
 * every widget version with pass-through settings (no migrate hook).
 *
 * Registered into the versioned table on import (guarded, idempotent,
 * first-wins — the same side-effect pattern as the sibling presentation
 * modules), so importing the theme wires its dressing; tests re-register
 * the exported descriptor after the shared reset.
 */
import {
  registerVersionedPresentation,
  type VersionedPresentationEntry,
} from "@/lib/theme-presentations";
import { SomvabonaDressedHeroPresentation } from "./dressed-hero-presentation";

export const SOMVABONA_HERO_DRESSING: VersionedPresentationEntry = {
  owner: "somvabona",
  widgetId: "builtin:hero",
  versionRange: "*",
  component: SomvabonaDressedHeroPresentation,
};

try {
  registerVersionedPresentation(SOMVABONA_HERO_DRESSING);
} catch {
  // Table unavailable — threaded callers still resolve the descriptor.
}
