/**
 * Level B thin vertical slice — manifest entrypoint.
 *
 * The shipped `dev.theme.json` is the single source of truth; this module
 * only re-exports it and validates it through the core gate
 * (`parseDevThemeManifest` — used, never reimplemented, per the slice task).
 */

import {
  parseDevThemeManifest,
  type DevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import sliceSource from "./dev.theme.json";

export const SLICE_MANIFEST_SOURCE: unknown = sliceSource;

/** Validated manifest — throws when the fixture drifts from the contract. */
export function sliceManifest(): DevThemeManifest {
  const verdict = parseDevThemeManifest(SLICE_MANIFEST_SOURCE);
  if (!verdict.ok) {
    throw new Error(`slice manifest invalid: ${verdict.errors.join("; ")}`);
  }
  return verdict.manifest;
}
