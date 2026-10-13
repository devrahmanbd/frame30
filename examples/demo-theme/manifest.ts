/**
 * Demo theme fixture — manifest entrypoint.
 *
 * The shipped `dev.theme.json` is the single source of truth; this module
 * only re-exports it and validates it through the core gate
 * (`parseDevThemeManifest` — used, never reimplemented, per the Level B
 * contract). Capability notes: `presentation` + `animation` cover the
 * storytelling block and the carousel; `commerce-read` covers catalogue
 * reads through `commerce.ts`; `cart-write` covers scoped cart lines through
 * the `product-cards.ts` envelope builders only (the host re-checks every
 * write server-side). `webgl` is deliberately NOT declared — an
 * isolated-canvas scene with a static fallback is the documented follow-up
 * (see README.md).
 */

import {
  parseDevThemeManifest,
  type DevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import demoSource from "./dev.theme.json";

export const DEMO_MANIFEST_SOURCE: unknown = demoSource;

/** Validated manifest — throws when the fixture drifts from the contract. */
export function demoManifest(): DevThemeManifest {
  const verdict = parseDevThemeManifest(DEMO_MANIFEST_SOURCE);
  if (!verdict.ok) {
    throw new Error(`demo manifest invalid: ${verdict.errors.join("; ")}`);
  }
  return verdict.manifest;
}
