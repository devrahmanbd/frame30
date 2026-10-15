/**
 * Level B (reviewed developer themes) — install → activation gate (pure) +
 * sandbox-only runtime binding (pure) + fingerprint-bound flag flip (server).
 *
 * Install writes merchant rows WITHOUT activating (`is_active: false` — see
 * `dev-theme-bundle-install.ts`). Activation is a SEPARATE fingerprint-bound
 * step owned by this module:
 *
 * - Pure gate (`resolveDevThemeActivation`): only a `published` release
 *   carrying an `approve` review for its EXACT fingerprint resolves, and
 *   only for the named fingerprint (+ optional theme binding). `in_review`,
 *   `rejected`, `revoked`, and `removed` releases refuse; a live `store`
 *   re-check refuses snapshots revoked after they were taken (same posture
 *   as the install lane's live re-verification). Approval binds bytes, never
 *   a row id — a tampered fingerprint never rides an old approval.
 * - Runtime binding (`bindDevThemeRuntime`): maps the resolved activation to
 *   the sandboxed `ThemeRuntime` frame identity — version-pinned URL +
 *   restrictive frame CSP + least-privilege `theme:*` grants derived from
 *   the manifest capabilities. The URL/CSP shapes MIRROR `ThemeRuntime.tsx`
 *   (`buildThemeFrameUrl` / `themeFrameCSP`) by small intentional
 *   DUPLICATION, not import: a server lib module must not import a React
 *   component file, and the sandbox harness (`dev-theme-sandbox.test.tsx`)
 *   asserts the two stay identical. Grants mirror `capabilities.ts`
 *   `THEME_METHODS` scope strings (same reason — values identical, tested).
 * - Flag flip (`activateDevThemeInstall`): verifies the installed rows carry
 *   the SAME fingerprint (`marketplace_installs.artifact_checksum` +
 *   `theme_versions.checksum`) before flipping `store_themes.is_active`
 *   (exactly one active, mirroring `activateTheme`) and auditing
 *   `dev_theme.activated` into the existing `theme_audit` shape (no
 *   migration — free-form audit columns, same argument
 *   `dev-theme-review.ts` makes). Every refusal happens BEFORE any write.
 *
 * Capability → grant map (least-privilege; rendering-only capabilities grant
 * no bridge scope — animation/WebGL execute in the frame, they are not data
 * access): presentation → theme:storefront:read; commerce-read →
 * theme:storefront:read + theme:variant:select; cart-write → theme:cart:add.
 * `theme:navigate` is NEVER granted implicitly (default-deny, like
 * `buildThemeGrants({})`): navigation allowlists travel explicitly per
 * install. The theme NEVER decides price/payment — the bridge + server
 * contracts in `bridge-v2.ts` already enforce that; this binding only
 * selects which methods the frame may call.
 *
 * Lane separation: this lane never reads or writes data-only theme rows
 * (`theme.json` packages have no fingerprint-bound rows, so the checksum
 * linkage refuses them); the frozen data-only lane is NOT modified.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import type { DevThemeRelease, DevThemeReleaseStore } from "./dev-theme-review";

type Client = SupabaseClient<Database>;

/* ------------------------------------------------------------ error shape */

export class DevThemeActivationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DevThemeActivationError";
  }
}

function fail(code: string, detail?: string): never {
  throw new DevThemeActivationError(code, detail ? `${code}: ${detail}` : code);
}

/* ------------------------------------------------------------ pure gate */

export type ActivationGateInput = {
  /** Approval snapshot (caller looked it up via the review store). */
  release: DevThemeRelease;
  /** The fingerprint the activator approved. Must equal the release's own. */
  expectedFingerprint: string;
  /** Marketplace-level theme binding. When set, the approval must cover it. */
  expectedThemeId?: string;
  /** Live store for re-verifying a snapshot that may have been revoked. */
  store?: DevThemeReleaseStore;
};

export type DevThemeActivation = {
  themeId: string;
  fingerprint: string;
  version: string;
  runtime: typeof DEV_THEME_RUNTIME_VERSION;
  capabilities: string[];
};

/**
 * Re-enforce the review-store publish invariants on an approval snapshot
 * (the same two gates `publish()` enforces — `published` status plus an
 * `approve` review binding the exact fingerprint — re-checked here so a
 * hand-built or stale snapshot can never activate unreviewed bytes), then
 * bind the named fingerprint (+ optional theme id) and the runtime pin.
 */
function assertPublishedApproval(release: DevThemeRelease): void {
  if (release.status === "revoked" || release.status === "removed") {
    fail(
      "dev_theme_activate.revoked",
      `Release ${release.id} is ${release.status}: revoked bytes never activate.`,
    );
  }
  if (release.status !== "published") {
    fail(
      "dev_theme_activate.unapproved",
      `Release ${release.id} is ${release.status}: a published approval for these exact bytes is required.`,
    );
  }
  const approval = release.reviews.some(
    (r) => r.decision === "approve" && r.fingerprint === release.fingerprint,
  );
  if (!approval) {
    fail(
      "dev_theme_activate.approval_missing",
      `Release ${release.id} carries no approval covering its own fingerprint.`,
    );
  }
}

export function resolveDevThemeActivation(
  input: ActivationGateInput,
): DevThemeActivation {
  let release = input.release;
  if (!release || typeof release.fingerprint !== "string") {
    fail("dev_theme_activate.approval_missing", "No approval snapshot given.");
  }
  // Live re-verification: a snapshot taken before a revoke must not activate.
  if (input.store) {
    const live = input.store.get(release.id);
    if (!live) {
      fail(
        "dev_theme_activate.approval_missing",
        `Release ${release.id} is unknown to the review store.`,
      );
    }
    release = live as DevThemeRelease;
    if (release.fingerprint !== input.release.fingerprint) {
      fail(
        "dev_theme_activate.fingerprint_mismatch",
        "Live release no longer carries the snapshotted bytes.",
      );
    }
  }
  assertPublishedApproval(release);
  if (input.expectedFingerprint !== release.fingerprint) {
    fail(
      "dev_theme_activate.fingerprint_mismatch",
      "Activation names a different fingerprint than the release carries.",
    );
  }
  if (
    input.expectedThemeId !== undefined &&
    release.themeId !== input.expectedThemeId
  ) {
    fail(
      "dev_theme_activate.theme_mismatch",
      `Approval covers theme ${release.themeId}, not ${input.expectedThemeId}.`,
    );
  }
  const runtime = (release.manifest as { runtime?: unknown } | null)?.runtime;
  if (runtime !== DEV_THEME_RUNTIME_VERSION) {
    fail(
      "dev_theme_activate.runtime_mismatch",
      "Approval targets a different runtime pin.",
    );
  }
  const capabilities = Array.isArray(
    (release.manifest as { capabilities?: unknown } | null)?.capabilities,
  )
    ? [...(release.manifest as { capabilities: string[] }).capabilities]
    : [];
  return {
    themeId: release.themeId,
    fingerprint: release.fingerprint,
    version: release.manifest.version,
    runtime: DEV_THEME_RUNTIME_VERSION,
    capabilities,
  };
}

/* ------------------------------------------------------------ grants */

// Scope strings mirror `src/components/theme-runtime/capabilities.ts`
// THEME_METHODS (documented duplication — see header).
const SCOPE_STOREFRONT_READ = "theme:storefront:read";
const SCOPE_VARIANT_SELECT = "theme:variant:select";
const SCOPE_CART_ADD = "theme:cart:add";

/**
 * Least-privilege grant constructor from manifest capabilities.
 * Rendering-only capabilities (`animation`, `webgl`) grant no bridge scope;
 * unknown capabilities fail closed (the manifest gate already refuses them,
 * so this is belt-and-braces for hand-built snapshots).
 */
export function devThemeGrantsFor(capabilities: readonly string[]): string[] {
  const granted: string[] = [];
  const push = (scope: string): void => {
    if (!granted.includes(scope)) granted.push(scope);
  };
  for (const cap of capabilities) {
    switch (cap) {
      case "presentation":
        push(SCOPE_STOREFRONT_READ);
        break;
      case "commerce-read":
        push(SCOPE_STOREFRONT_READ);
        push(SCOPE_VARIANT_SELECT);
        break;
      case "cart-write":
        push(SCOPE_CART_ADD);
        break;
      case "animation":
      case "webgl":
        break;
      default:
        fail("dev_theme_activate.capability", `Unknown capability ${cap}.`);
    }
  }
  return granted;
}

/* ------------------------------------------------------------ runtime binding */

export type DevThemeRuntimeBinding = {
  /** Controlled https origin serving version-pinned theme documents. */
  assetOrigin: string;
  /** Pinned theme identity (name + immutable version). */
  theme: { name: string; version: string };
  /** Version-pinned theme-document URL (the frame's ONLY source). */
  url: string;
  /** Restrictive frame-CSP contract served by the asset origin. */
  csp: string;
  /** Granted `theme:*` scopes for this install. */
  granted: string[];
  /** Exact https origins the theme may navigate to (empty = paths only). */
  navigateAllowlist: string[];
  /** Approved release fingerprint this binding executes. */
  fingerprint: string;
};

// Mirrors of ThemeRuntime.tsx identity + CSP helpers (see header: duplicated
// on purpose — values identical, pinned equal by dev-theme-sandbox.test.tsx).
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const THEME_NAME_RE = /^[a-z0-9-]{1,64}$/;
const THEME_VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,32})?$/i;

function normalizeNavigateAllowlist(
  input: readonly string[] | undefined,
): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const origin = raw.trim().toLowerCase();
    if (ORIGIN_RE.test(origin) && !out.includes(origin)) out.push(origin);
  }
  return out;
}

/**
 * Bind a resolved activation to the sandboxed runtime frame. Fail-closed:
 * unapproved origins, mutable versions, and unparseable identities throw
 * (no URL is minted), so the frame can never be pointed at attacker bytes.
 */
export function bindDevThemeRuntime(
  activation: DevThemeActivation,
  opts: { assetOrigin: string; navigateAllowlist?: readonly string[] },
): DevThemeRuntimeBinding {
  const origin = opts.assetOrigin;
  if (
    typeof origin !== "string" ||
    (!ORIGIN_RE.test(origin) && !LOCAL_ORIGIN_RE.test(origin))
  ) {
    fail("dev_theme_activate.origin", "Asset origin is not approved.");
  }
  if (!THEME_NAME_RE.test(activation.themeId)) {
    fail("dev_theme_activate.identity", "Theme identity is not URL-safe.");
  }
  if (!THEME_VERSION_RE.test(activation.version)) {
    fail(
      "dev_theme_activate.version",
      "Theme version is not an immutable pin.",
    );
  }
  const url = `${origin}/t/${activation.themeId}/${activation.version}/index.html`;
  const csp = [
    "default-src 'none'",
    `script-src ${origin}`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data:`,
    `font-src ${origin}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return {
    assetOrigin: origin,
    theme: { name: activation.themeId, version: activation.version },
    url,
    csp,
    granted: devThemeGrantsFor(activation.capabilities),
    navigateAllowlist: normalizeNavigateAllowlist(opts.navigateAllowlist),
    fingerprint: activation.fingerprint,
  };
}

/* ------------------------------------------------------------ flag flip */

export type ActivateDevThemeInstallInput = {
  /** Host theme row created by the fingerprint-pinned install. */
  themeId: string;
  /** Ledger row from the install (resolved via the theme link when absent). */
  installId?: string;
  release: DevThemeRelease;
  expectedFingerprint: string;
  expectedThemeId?: string;
  store?: DevThemeReleaseStore;
  actorId?: string | null;
};

export type ActivateDevThemeInstallResult = {
  themeId: string;
  fingerprint: string;
};

/**
 * Fingerprint-bound activation: the pure gate PLUS installed-row linkage.
 * The ledger row's `artifact_checksum` and the host version row's `checksum`
 * must BOTH equal the approved fingerprint — otherwise the merchant
 * installed other bytes than the approval covers and activation refuses.
 * Refusals happen before any flag flips or audit row lands; the flip itself
 * mirrors `activateTheme` (clear others, set live) minus the AST pointer the
 * executable lane does not use (executable content is addressed by
 * fingerprint and executes only in the `ThemeRuntime` frame, never as AST).
 */
export async function activateDevThemeInstall(
  db: Client,
  merchantId: string,
  input: ActivateDevThemeInstallInput,
): Promise<ActivateDevThemeInstallResult> {
  const activation = resolveDevThemeActivation({
    release: input.release,
    expectedFingerprint: input.expectedFingerprint,
    expectedThemeId: input.expectedThemeId,
    store: input.store,
  });

  const { data: themeRow } = await db
    .from("store_themes")
    .select("id, source_install_id")
    .eq("merchant_id", merchantId)
    .eq("id", input.themeId)
    .maybeSingle();
  if (!themeRow) {
    fail(
      "dev_theme_activate.link_mismatch",
      "No installed theme row for this activation.",
    );
  }
  const linkedInstallId =
    input.installId ??
    (themeRow as { source_install_id?: unknown }).source_install_id;
  if (typeof linkedInstallId !== "string" || !linkedInstallId) {
    fail(
      "dev_theme_activate.link_mismatch",
      "Installed theme carries no install linkage.",
    );
  }

  const { data: installRow } = await db
    .from("marketplace_installs")
    .select("id, kind, status, artifact_checksum")
    .eq("merchant_id", merchantId)
    .eq("id", linkedInstallId)
    .maybeSingle();
  const install = installRow as unknown as {
    id: string;
    kind: string;
    status: string;
    artifact_checksum?: unknown;
  } | null;
  if (!install || install.kind !== "theme") {
    fail(
      "dev_theme_activate.install_state",
      "No theme install backs this activation.",
    );
  }
  if (install.status !== "installed" && install.status !== "trial") {
    fail(
      "dev_theme_activate.install_state",
      `Install is ${install.status}: only live installs activate.`,
    );
  }
  if (install.artifact_checksum !== activation.fingerprint) {
    fail(
      "dev_theme_activate.fingerprint_mismatch",
      "Installed bytes do not match the approved fingerprint.",
    );
  }

  const { data: versions } = await db
    .from("theme_versions")
    .select("id, checksum")
    .eq("merchant_id", merchantId)
    .eq("theme_id", input.themeId);
  const pinned = (
    (versions ?? []) as { id: string; checksum?: unknown }[]
  ).some((v) => v.checksum === activation.fingerprint);
  if (!pinned) {
    fail(
      "dev_theme_activate.version_mismatch",
      "No host version row carries the approved fingerprint.",
    );
  }

  const { error: clearError } = await db
    .from("store_themes")
    .update({ is_active: false })
    .eq("merchant_id", merchantId)
    .neq("id", input.themeId);
  if (clearError) throw clearError;
  const { error } = await db
    .from("store_themes")
    .update({ is_active: true })
    .eq("merchant_id", merchantId)
    .eq("id", input.themeId);
  if (error) throw error;

  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: input.themeId,
    actor: input.actorId ?? null,
    action: "dev_theme.activated",
    before: null,
    after: {
      fingerprint: activation.fingerprint,
      release_id: input.release.id,
      version: activation.version,
    },
  });

  return { themeId: input.themeId, fingerprint: activation.fingerprint };
}
