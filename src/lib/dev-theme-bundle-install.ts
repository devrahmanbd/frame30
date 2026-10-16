/**
 * Level B reviewed-bundle ingestion — fingerprint-pinned merchant install.
 *
 * An APPROVED, fingerprint-pinned theme bundle version installs merchant
 * records WITHOUT re-validating from scratch as a trust decision, but
 * REFUSING anything whose bytes differ from the approved fingerprint: the
 * presented bytes are re-validated (`validateDevThemeBundle`) AND re-hashed
 * (`fingerprintDevThemeRelease`) at install time, and the install proceeds
 * only when the recomputed fingerprint EQUALS the published approval's
 * fingerprint. Unapproved / modified / revoked bytes never install, and every
 * refusal happens BEFORE any write (fail closed, zero rows).
 *
 * Approval model (no migration — justified): releases have no DB backing yet
 * (`dev-theme-review.ts` is pure; a Supabase backing is a follow-up), so the
 * published approval travels in-memory as a `DevThemeRelease` snapshot the
 * caller looked up via the review store (submit → review → publish). This
 * module re-enforces every store invariant on the snapshot — `published`
 * status plus an `approve` review binding the exact fingerprint — and accepts
 * an optional live `store` to re-verify a release id that may have been
 * revoked after the snapshot was taken. New `dev_theme.*` action codes fit
 * the existing free-form audit columns, so no schema change is required
 * (same argument `dev-theme-review.ts` makes for its audit rows).
 *
 * Persistence mapping (existing shapes only):
 * - ledger: `marketplace_installs`, same columns `installListing` writes for
 *   theme installs, plus the FOLLOW-UP artifact identity columns with
 *   `artifact_checksum` = the approved fingerprint (degrades to NULL on
 *   pre-migration DBs, same pattern as `patchInstallMarketplaceShape`).
 * - audit: `activity_log` via `auditAction`, action
 *   `market.dev_theme.installed` (distinct from `market.installed` so the
 *   fingerprint lane stays grep-able; same row shape).
 * - host projection: `store_themes` + `theme_versions` + `theme_drafts`
 *   triple mirroring `materializeListingTheme` (same columns, same
 *   `source_install_id` / `source_listing_slug` link, so
 *   `uninstallThemeInstall` → `deleteTheme` cascades uniformly).
 *   `theme_versions.checksum` carries the approved fingerprint;
 *   templates/tokens are inert `{}` (no AST claim — executable content is
 *   addressed by fingerprint; the install never activates, and
 *   activation/render is the runtime follow-up).
 * - asset projection: `theme_assets` rows under
 *   `dev-themes/<themeId>/<version>/…` (one per servable assembled output,
 *   text UTF-8 or base64) plus the `release.json` descriptor and the
 *   `.approval.json` snapshot, so the `/t/…` route and the workspace
 *   projection serve/prove the approved bytes. `theme_id` stays NULL
 *   (linking the FK would break theme deletes in lanes that cannot change
 *   here); a `dev-themes/` sweep on uninstall is the follow-up.
 * - money: paid listings charge through `postLedgerEntry` with source
 *   `market.theme.installed`, same split and idempotency posture as
 *   `installListing` (H3 order: projection BEFORE money moves; a money
 *   failure compensates projection + ledger, never an orphan charge).
 *
 * Lane entry lives in `marketplace-install.server.ts` (`installListing`
 * delegates theme listings carrying a `dev_theme` approval marker — see
 * `getReviewedThemeRef`). The marker is seller-controlled signposting only:
 * detection, never trust. Trust is bytes + approval, recomputed here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { money } from "./money";
import {
  fingerprintDevThemeRelease,
  validateDevThemeBundle,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import type { DevThemeRelease, DevThemeReleaseStore } from "./dev-theme-review";

type Client = SupabaseClient<Database>;

export type ReviewedThemeBundleBytes = DevThemeBundleInput;

export type ReviewedThemeListing = {
  id: string;
  slug: string;
  name: string;
  version: string;
  price_minor_int?: unknown;
  currency_code?: string;
  seller_merchant_id?: string | null;
  install_count?: unknown;
};

export type InstallReviewedThemeBundleInput = {
  /** Published approval snapshot (caller looked it up via the review store). */
  release: DevThemeRelease;
  /** Presented bundle bytes — re-validated and re-hashed at install. */
  bytes: ReviewedThemeBundleBytes;
  idempotencyKey: string;
  listing: ReviewedThemeListing;
  trial?: boolean;
  consentedBy?: string | null;
  grantedScopes?: string[];
  /** Marketplace-level theme binding (from the listing marker). When set,
   * the approval's theme id must equal it. */
  expectedThemeId?: string;
  /** Live store for re-verifying a snapshot that may have been revoked. */
  store?: DevThemeReleaseStore;
};

export type ReviewedThemeInstallResult = {
  installId: string;
  replayed: boolean;
  impacted: string[];
  appVersion: string;
  themeApplied: null;
  themeNoticeKey: null;
  artifact: {
    checksum: string;
    version: string;
    fileName: string;
    pinned: string;
  } | null;
};

export class ReviewedThemeInstallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReviewedThemeInstallError";
  }
}

function fail(code: string, detail?: string): never {
  throw new ReviewedThemeInstallError(
    code,
    detail ? `${code}: ${detail}` : code,
  );
}

function isDuplicateKey(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return msg.includes("duplicate key");
}

export type ReviewedThemeRef = {
  themeId: string;
  fingerprint: string;
};

/**
 * Detect a reviewed-theme listing: `manifest.dev_theme` carrying a theme id
 * plus a sha256-hex fingerprint. Malformed markers read as null — the lane
 * is never entered on seller-shaped metadata; callers fall back to the
 * historical ledger-only path. The marker fingerprint is advisory (which
 * approval the seller *claims*); the install trusts only the recomputed
 * fingerprint against the approval snapshot.
 */
export function getReviewedThemeRef(
  manifest: unknown,
): ReviewedThemeRef | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const ref = (manifest as Record<string, unknown>).dev_theme;
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  const record = ref as Record<string, unknown>;
  if (typeof record.theme_id !== "string" || !record.theme_id.trim()) {
    return null;
  }
  if (
    typeof record.fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.fingerprint)
  ) {
    return null;
  }
  return { themeId: record.theme_id.trim(), fingerprint: record.fingerprint };
}

/**
 * Seller bundle-attach encoding (listing-marker companion to
 * `getReviewedThemeRef`): the seller's reviewed bundle travels on the
 * listing row (`manifest.dev_theme.bundle`) as JSON-safe base64, so the
 * install lane resolves bytes server-side from the DB row instead of
 * trusting caller-supplied bytes. The attach is signposting only —
 * `decodeReviewedThemeListingBundle` + the install lane re-validate and
 * re-hash before trusting anything.
 */
export type ReviewedThemeListingBundleFile = {
  path: string;
  base64: string;
};

export type ReviewedThemeListingBundle = {
  manifest: unknown;
  files: ReviewedThemeListingBundleFile[];
  dependencies: unknown;
  allowedNetworkHosts: unknown;
};

export function encodeReviewedThemeBundleForListing(
  bytes: ReviewedThemeBundleBytes,
): ReviewedThemeListingBundle {
  return {
    manifest: bytes.manifest,
    files: bytes.files.map((f) => ({
      path: f.path,
      base64: Buffer.from(f.bytes).toString("base64"),
    })),
    dependencies: Array.isArray(bytes.dependencies)
      ? [...bytes.dependencies]
      : [],
    allowedNetworkHosts: Array.isArray(bytes.allowedNetworkHosts)
      ? [...bytes.allowedNetworkHosts]
      : [],
  };
}

function decodeBase64Bytes(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const raw = Buffer.from(value, "base64");
    if (!raw.length) return null;
    return Uint8Array.from(raw);
  } catch {
    return null;
  }
}

/**
 * Decode the seller-attached bundle from a listing manifest. Malformed
 * attaches (missing bundle, bad shapes, undecodable/oversized files) read
 * as null — the install lane falls back to the legacy caller-bytes path or
 * fails closed with `bytes_required`, never a crash and never blind bytes.
 */
export function decodeReviewedThemeListingBundle(
  manifest: unknown,
): ReviewedThemeBundleBytes | null {
  try {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return null;
    }
    const ref = (manifest as Record<string, unknown>).dev_theme;
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
    const bundle = (ref as Record<string, unknown>).bundle;
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
      return null;
    }
    const record = bundle as Record<string, unknown>;
    if (!Array.isArray(record.files) || record.files.length === 0) return null;
    if (record.files.length > 500) return null;
    const files: ReviewedThemeBundleBytes["files"] = [];
    let total = 0;
    for (const entry of record.files) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const { path, base64 } = entry as Record<string, unknown>;
      if (typeof path !== "string" || !path) return null;
      const bytes = decodeBase64Bytes(base64);
      if (!bytes) return null;
      // Decode-time safety cap only (the install validator enforces the
      // real bundle limits): never materialize absurd rows into memory.
      if (bytes.length > 5 * 1024 * 1024) return null;
      total += bytes.length;
      if (total > 50 * 1024 * 1024) return null;
      files.push({ path, bytes });
    }
    const dependencies = Array.isArray(record.dependencies)
      ? (record.dependencies as NonNullable<
          ReviewedThemeBundleBytes["dependencies"]
        >)
      : [];
    const allowedNetworkHosts = Array.isArray(record.allowedNetworkHosts)
      ? (record.allowedNetworkHosts as NonNullable<
          ReviewedThemeBundleBytes["allowedNetworkHosts"]
        >)
      : [];
    return {
      manifest: record.manifest,
      files,
      dependencies,
      allowedNetworkHosts,
    };
  } catch {
    return null;
  }
}

/**
 * Re-enforce the review-store publish invariants on an approval snapshot:
 * live `published` status (revoked/removed refuse on their own code) plus an
 * `approve` review binding the release's exact fingerprint — the same two
 * gates `publish()` enforces, re-checked here so a hand-built or stale
 * snapshot can never smuggle unreviewed bytes into an install.
 */
function assertPublishedApproval(release: DevThemeRelease): void {
  if (release.status === "revoked" || release.status === "removed") {
    fail(
      "dev_theme_install.revoked",
      `Release ${release.id} is ${release.status}: revoked bytes never install.`,
    );
  }
  if (release.status !== "published") {
    fail(
      "dev_theme_install.unapproved",
      `Release ${release.id} is ${release.status}: a published approval for these exact bytes is required.`,
    );
  }
  const approval = release.reviews.some(
    (r) => r.decision === "approve" && r.fingerprint === release.fingerprint,
  );
  if (!approval) {
    fail(
      "dev_theme_install.approval_missing",
      `Release ${release.id} carries no approval covering its own fingerprint.`,
    );
  }
}

type ReplayHit = {
  id: string;
  status: string;
  kind: string;
  theme_id: string | null;
  widget_id: string | null;
  listing_slug: string;
};

function boundReplay(
  hit: ReplayHit,
  idempotencyKey: string,
  listingId: string,
  listingSlug: string,
): { installId: string } {
  if (hit.status === "lapsed") throw new Error("market_trial_expired");
  const sameKind = hit.kind === "theme";
  const sameListing =
    hit.theme_id === listingId || hit.listing_slug === listingSlug;
  if (!sameKind || !sameListing) {
    throw new Error("market_idempotency_conflict");
  }
  void idempotencyKey;
  return { installId: hit.id };
}

async function snapshotPrevious(db: Client, merchantId: string) {
  const { data } = await db
    .from("marketplace_installs")
    .select("id, listing_slug, version, status")
    .eq("merchant_id", merchantId)
    .eq("kind", "theme")
    .in("status", ["installed", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? {};
}

/**
 * Best-effort artifact-identity patch with the same degrade posture as
 * `patchInstallMarketplaceShape`: pre-migration DBs keep the base
 * marketplace shape with NULL artifact identity instead of failing.
 */
async function patchReviewedArtifact(
  db: Client,
  merchantId: string,
  installId: string,
  artifact: Record<string, unknown>,
): Promise<void> {
  const { isMissingArtifactColumnError } =
    await import("./package-install.server");
  try {
    const { error } = await db
      .from("marketplace_installs")
      .update(artifact as never)
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    if (error) throw error;
  } catch (err) {
    if (!isMissingArtifactColumnError(err)) throw err;
    const { log } = await import("./observability.server");
    log("warn", "market.install_artifact_columns_missing", {
      merchantId,
      installId,
    });
  }
}

async function compensateInstall(
  db: Client,
  merchantId: string,
  installId: string,
  themeId: string | null,
  assetNames: string[] = [],
): Promise<void> {
  // Fingerprinted asset rows go first: they are keyed by exact name
  // (merchant-scoped), so a half-persisted bundle leaves no servable bytes.
  for (const name of assetNames) {
    try {
      await db
        .from("theme_assets")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("name", name);
    } catch {
      // Best-effort: the original error stays the thrown one.
    }
  }
  if (themeId) {
    await db
      .from("theme_versions")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    await db
      .from("theme_drafts")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    await db
      .from("store_themes")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", themeId);
  }
  await db
    .from("marketplace_installs")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", installId);
}

/**
 * Level B close-out: persist the assembled hashed bundle behind the bound
 * origin path. Assembles deterministically from the SAME verified inputs
 * (Gate 1 passed on these exact bytes, so re-validation is vacuous and any
 * refusal here is an internal error), then writes one `theme_assets` row
 * per servable output plus the `release.json` descriptor (name→hash map)
 * and the `.approval.json` snapshot (status + reviews for the projection's
 * real activation gate). Returns every written row name so callers can
 * compensate exactly. Throws after best-effort self-cleanup (never
 * half-persisted bytes).
 */
async function persistDevThemeAssetRows(
  db: Client,
  merchantId: string,
  input: {
    release: DevThemeRelease;
    bytes: ReviewedThemeBundleBytes;
  },
): Promise<string[]> {
  const { release } = input;
  // Belt-and-braces: the manifest gate proved these shapes, but row names
  // become URL paths — never interpolate unvalidated strings into them.
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(release.themeId)) {
    fail("dev_theme_install.identity", "Approval theme id is not URL-safe.");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version)) {
    fail("dev_theme_install.version", "Approval version is not semver.");
  }
  const assembled = assembleDevThemeBundle({
    manifestJson: input.bytes.manifest,
    files: input.bytes.files,
    dependencies: input.bytes.dependencies,
    allowedNetworkHosts: input.bytes.allowedNetworkHosts,
  });
  if (!assembled.ok) {
    fail(
      "dev_theme_install.assemble_failed",
      assembled.errors.slice(0, 3).join(","),
    );
  }
  // Single source of truth for namespace + encoding (the serve lane reads
  // the same helpers — persist and serve can never disagree). Dynamic
  // import, matching this module's lane-crossing convention below: the
  // theme-server module stays off this lane's static startup path.
  const {
    devThemeAssetNamespace,
    devThemeReleaseRowName,
    devThemeApprovalRowName,
    devThemeAssetEncoding,
    devThemeAssetKind,
  } = await import("./themes.server");
  const namespace = devThemeAssetNamespace(release.themeId, release.version);
  const rows: Record<string, unknown>[] = [];
  for (const output of assembled.outputs) {
    const encoding = devThemeAssetEncoding(output.path);
    const kind = devThemeAssetKind(output.path);
    // Unservable kinds (readme/license extras) persist no rows — serving
    // them 404s regardless, so no dead bytes accumulate.
    if (!encoding || !kind) continue;
    rows.push({
      merchant_id: merchantId,
      theme_id: null,
      name: `${namespace}/${output.path}`,
      kind,
      content:
        encoding === "text"
          ? new TextDecoder().decode(output.bytes)
          : Buffer.from(output.bytes).toString("base64"),
      url: `/t/${release.themeId}/${release.version}/${output.path}`,
      bytes: output.bytes.length,
      enabled: true,
    });
  }
  const releaseJson = assembled.releaseJson;
  rows.push({
    merchant_id: merchantId,
    theme_id: null,
    name: devThemeReleaseRowName(release.themeId, release.version),
    kind: "json",
    content: releaseJson,
    url: null,
    bytes: releaseJson.length,
    enabled: true,
  });
  const approvalJson = JSON.stringify(release);
  rows.push({
    merchant_id: merchantId,
    theme_id: null,
    name: devThemeApprovalRowName(release.themeId, release.version),
    kind: "json",
    content: approvalJson,
    url: null,
    bytes: approvalJson.length,
    enabled: true,
  });
  const names = rows.map((row) => row.name as string);
  try {
    const { error } = await db.from("theme_assets").insert(rows as never);
    if (error) throw error;
  } catch (err) {
    for (const name of names) {
      try {
        await db
          .from("theme_assets")
          .delete()
          .eq("merchant_id", merchantId)
          .eq("name", name);
      } catch {
        // Best-effort: the original error stays the thrown one.
      }
    }
    throw err;
  }
  return names;
}

export async function installReviewedThemeBundle(
  db: Client,
  merchantId: string,
  input: InstallReviewedThemeBundleInput,
): Promise<ReviewedThemeInstallResult> {
  // H5 parity: park past-due trials before any install state is read
  // (deferred import — this module is imported BY marketplace-install).
  const { lapseExpiredTrials } = await import("./marketplace-install.server");
  await lapseExpiredTrials(db, merchantId);

  const { data: existingKey } = await db
    .from("marketplace_installs")
    .select("id, status, kind, theme_id, widget_id, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingKey) {
    const hit = existingKey as unknown as ReplayHit;
    if (hit.kind !== "theme") throw new Error("market_idempotency_conflict");
    const { installId } = boundReplay(
      hit,
      input.idempotencyKey,
      input.listing.id,
      input.listing.slug,
    );
    return {
      installId,
      replayed: true,
      impacted: [],
      appVersion: (await import("./marketplace.server")).APP_VERSION,
      themeApplied: null,
      themeNoticeKey: null,
      artifact: null,
    };
  }

  // Live re-verification: a snapshot taken before a revoke must not install.
  let release = input.release;
  if (input.store) {
    const live = input.store.get(release.id);
    if (!live) {
      fail(
        "dev_theme_install.approval_missing",
        `Release ${release.id} is unknown to the review store.`,
      );
    }
    release = live as DevThemeRelease;
  }
  assertPublishedApproval(release);
  if (
    input.expectedThemeId !== undefined &&
    release.themeId !== input.expectedThemeId
  ) {
    fail(
      "dev_theme_install.theme_mismatch",
      `Approval covers theme ${release.themeId}, not ${input.expectedThemeId}.`,
    );
  }

  // Gate 1 — re-validate the presented bytes (never trust the claim).
  const verdict = validateDevThemeBundle(input.bytes);
  if (!verdict.ok) {
    fail(
      "dev_theme_install.invalid_bundle",
      verdict.errors.slice(0, 5).join(","),
    );
  }

  // Gate 2 — re-hash at install; ANY byte difference mints a different
  // fingerprint, and anything but equality with the published approval fails
  // closed. No writes have happened yet, and none will on this path.
  const computed = fingerprintDevThemeRelease(verdict.manifest, verdict.files);
  if (computed !== release.fingerprint) {
    fail(
      "dev_theme_install.fingerprint_mismatch",
      "Presented bytes do not match the approved fingerprint.",
    );
  }

  const { APP_VERSION, TRIAL_DAYS, SELLER_SHARE_BASIS_POINTS } =
    await import("./marketplace.server");
  const trial = input.trial === true;
  const charge = trial ? 0 : Number(input.listing.price_minor_int ?? 0);
  const currency =
    input.listing.currency_code === "USD" ? "USD" : ("BDT" as const);
  const previous = await snapshotPrevious(db, merchantId);
  const granted = Array.from(new Set(input.grantedScopes ?? [])).sort();

  const { data: install, error } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "theme",
      theme_id: input.listing.id,
      widget_id: null,
      listing_slug: input.listing.slug,
      listing_name: input.listing.name,
      version: release.version,
      price_minor_int: charge,
      currency_code: currency,
      is_trial: trial,
      status: trial ? "trial" : "installed",
      idempotency_key: input.idempotencyKey,
      previous_snapshot: previous as never,
      expires_at: trial
        ? new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
        : null,
      granted_scopes: granted as never,
      consented_by: (input.consentedBy ?? null) as never,
    })
    .select("id")
    .single();
  if (error || !install) {
    if (isDuplicateKey(error)) {
      const { data: raced } = await db
        .from("marketplace_installs")
        .select("id, status, kind, theme_id, widget_id, listing_slug")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced) {
        const { installId } = boundReplay(
          raced as unknown as ReplayHit,
          input.idempotencyKey,
          input.listing.id,
          input.listing.slug,
        );
        return {
          installId,
          replayed: true,
          impacted: [],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
          artifact: null,
        };
      }
    }
    throw new Error("market_install_failed");
  }
  const installId = (install as { id: string }).id;

  // Artifact identity: the approved fingerprint, so a later uninstall/GC can
  // attribute these exact bytes. Degrades to NULL pre-migration.
  const artifact = {
    checksum: release.fingerprint,
    version: release.version,
    fileName: `${release.themeId}.dev-theme`,
    pinned: `dev-theme:${release.id}`,
  };
  try {
    await patchReviewedArtifact(db, merchantId, installId, {
      artifact_checksum: artifact.checksum,
      artifact_version: artifact.version,
      artifact_pinned: artifact.pinned,
    });
  } catch {
    await compensateInstall(db, merchantId, installId, null);
    throw new Error("market_install_failed");
  }

  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    input.consentedBy ?? null,
    "market.dev_theme.installed",
    "theme",
    {
      before: previous,
      after: {
        listing: input.listing.slug,
        version: release.version,
        fingerprint: release.fingerprint,
        release_id: release.id,
        trial,
        charge_minor_int: charge,
        currency,
      },
    },
    installId,
  );

  // H3 order — host projection BEFORE any money moves, so a theme-row
  // failure compensates with just the install row, never an orphan charge.
  let hostThemeId: string | null = null;
  let assetNames: string[] = [];
  try {
    const { data: theme, error: themeError } = await db
      .from("store_themes")
      .insert({
        merchant_id: merchantId,
        name: input.listing.name,
        is_active: false,
        installed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (themeError || !theme) throw new Error("market_materialize_failed");
    hostThemeId = (theme as { id: string }).id;

    const { error: versionError } = await db.from("theme_versions").insert({
      merchant_id: merchantId,
      theme_id: hostThemeId,
      version: 1,
      status: "draft",
      label: input.listing.slug,
      checksum: release.fingerprint,
      templates: {} as never,
      tokens: {} as never,
      created_by: null,
    });
    if (versionError) throw new Error("market_materialize_failed");

    const { error: draftError } = await db.from("theme_drafts").insert({
      merchant_id: merchantId,
      theme_id: hostThemeId,
      revision: 1,
      templates: {} as never,
      tokens: {} as never,
    });
    if (draftError) throw new Error("market_materialize_failed");

    const { error: linkError } = await db
      .from("store_themes")
      .update({
        source_install_id: installId,
        source_listing_slug: input.listing.slug,
      })
      .eq("merchant_id", merchantId)
      .eq("id", hostThemeId);
    if (linkError) throw new Error("market_materialize_failed");

    // Level B close-out: persist the assembled hashed bundle bytes behind
    // the REAL bound origin path (`/t/<themeId>/<version>/…`, served by
    // `src/routes/t.$.ts`). Assembled deterministically from the SAME
    // verified inputs (re-validation is vacuous — Gate 1 passed on these
    // exact bytes), so the persisted rows are byte-identical to the
    // approval. Served rows: every servable output as a `theme_assets` row
    // (`dev-themes/<themeId>/<version>/<outPath>`, text UTF-8 or base64 per
    // `devThemeAssetEncoding`), plus the `release.json` descriptor
    // (name→hash map) and the `.approval.json` snapshot (status + reviews
    // for the projection's real activation gate). `theme_id` stays NULL:
    // linking the store_themes FK would break theme deletes in lanes that
    // cannot change here — a `dev-themes/` sweep on uninstall is the
    // follow-up (rows are merchant-scoped and namespace-addressable).
    // Failure compensates the whole install (never half-persisted bytes).
    try {
      assetNames = await persistDevThemeAssetRows(db, merchantId, {
        release,
        bytes: input.bytes,
      });
    } catch {
      throw new Error("market_materialize_failed");
    }
  } catch {
    await compensateInstall(db, merchantId, installId, hostThemeId, assetNames);
    throw new Error("market_install_failed");
  }

  if (charge > 0) {
    const seller = Math.floor((charge * SELLER_SHARE_BASIS_POINTS) / 10_000);
    const platform = charge - seller;
    const { postLedgerEntry } = await import("./ledger.server");
    try {
      await postLedgerEntry(db, {
        merchantId,
        counterpartyMerchantId: input.listing.seller_merchant_id ?? null,
        source: "market.theme.installed",
        referenceId: installId,
        direction: "debit",
        gross: money(charge, currency),
        platformFee: money(platform, currency),
        idempotencyKey: input.idempotencyKey,
        memo: `${input.listing.name} v${release.version}`,
      });
    } catch {
      await compensateInstall(
        db,
        merchantId,
        installId,
        hostThemeId,
        assetNames,
      );
      throw new Error("market_payment_failed");
    }
  }

  await db
    .from("marketplace_themes")
    .update({
      install_count: Number(input.listing.install_count ?? 0) + 1,
    })
    .eq("id", input.listing.id);

  return {
    installId,
    replayed: false,
    impacted: [],
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
    artifact,
  };
}
