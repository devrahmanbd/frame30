/**
 * Level B WebGL capability proof — manifest entrypoint.
 *
 * The shipped `dev.theme.json` is the single source of truth; this module
 * only re-exports it and validates it through the core gate
 * (`parseDevThemeManifest` — used, never reimplemented, per the slice task).
 *
 * The pinned `three` dependency is DECLARED here only. `three` is not in the
 * root `package.json` and this slice adds nothing there: the bundle pipeline
 * must vendor the pinned bytes at bundle time and verify the `integrity`
 * digest against the immutable bytes at review (contract §1: the validator
 * checks the `sha(256|384|512)-base64` shape only, never fetches).
 */

import {
  parseDevThemeManifest,
  type DevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import webglSource from "./dev.theme.json";

export const WEBGL_MANIFEST_SOURCE: unknown = webglSource;

/** Validated manifest — throws when the fixture drifts from the contract. */
export function webglManifest(): DevThemeManifest {
  const verdict = parseDevThemeManifest(WEBGL_MANIFEST_SOURCE);
  if (!verdict.ok) {
    throw new Error(`webgl manifest invalid: ${verdict.errors.join("; ")}`);
  }
  return verdict.manifest;
}
