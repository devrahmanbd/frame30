/**
 * Songoskriti-as-installed-artifact — LIVE proof (cases only).
 *
 * The exporter builds the Songoskriti ZIP from source, `installPackage`
 * installs it through the normal pipeline, and `seedOfficialArtifacts`
 * reconciles that lane — but until this suite, nothing proved the LIVE
 * path serves the installed artifact. Proven here against `fakeDb`:
 * - seed → the publish fallback (`loadPublishArtifact`) resolves the
 *   installed artifact content (templates/tokens), not source statics;
 * - activate → `publishedTheme` (the live path) serves those installed
 *   rows, with key templates (`index`, `product`) structurally identical
 *   to today's source render;
 * - provisioning wiring (`seedSongoskritiBestEffort`, the call the trial
 *   claim runs): called once, idempotent on replay, never throws.
 *
 * No network, no real database: `fakeDb` backs every read and write.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeDb } from "./__fixtures__/fake-db";
import { buildOfficialArtifact, type OfficialArtifact } from "./official-artifacts";
import { seedOfficialArtifacts } from "./official-artifacts-seed.server";
import { activatePackage } from "./package-install.server";
import { loadPublishArtifact, publishedTheme } from "./themes.server";
import { seedSongoskritiBestEffort, SONGOSKRITI_SEED_VERSION } from "./billing.functions";
import {
  buildOfficialSections,
  normalizeAssetLists,
  officialThemeTokens,
  rewriteThemeUrls,
  stableStringify,
  type OfficialThemeKey,
} from "./theme-export";
import type { TemplateKey, ThemeAst } from "./builder-ast";
import { parseTemplates, parseTokens } from "./builder-ast";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MERCHANT = "55555555-5555-4555-8555-555555555555";
const WIRE_MERCHANT = "66666666-6666-4666-8666-666666666666";

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

let songoskritiArtifact: OfficialArtifact | null = null;

/** Today's pinned source build — the same inputs the exporter takes. */
function sourceArtifact(): OfficialArtifact {
  if (!songoskritiArtifact) {
    const key: OfficialThemeKey = "songoskriti";
    const cssText = readFileSync(
      join(ROOT, "src", "lib", "themes", key, "skins.css"),
      "utf8",
    );
    const dir = join(ROOT, "public", "ph", key);
    const assets = readdirSync(dir)
      .filter((f) => statSync(join(dir, f)).isFile())
      .sort()
      .map((file) => ({ file, bytes: readBytes(join(dir, file)) }));
    songoskritiArtifact = buildOfficialArtifact({
      key,
      version: SONGOSKRITI_SEED_VERSION,
      cssText,
      assets,
    });
  }
  return songoskritiArtifact;
}

/** What the storefront renders from source today, per template. */
function expectedTemplate(template: TemplateKey) {
  const ast = normalizeAssetLists(
    rewriteThemeUrls(buildOfficialSections("songoskriti", template)!, "songoskriti"),
  ) as ThemeAst;
  return {
    format: "official-theme-template/1",
    theme: "songoskriti",
    template,
    packageVersion: SONGOSKRITI_SEED_VERSION,
    header: ast.header,
    main: ast.main,
    footer: ast.footer,
  };
}

function liveDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

describe("songoskriti live proof: installed artifact serves the storefront", () => {
  it("seed → publish fallback resolves installed content → live serves it", async () => {
    const db = liveDb();
    const artifact = sourceArtifact();
    const [seeded] = await seedOfficialArtifacts(
      db.asClient(),
      MERCHANT,
      [artifact],
      "user-live-1",
    );
    expect(seeded.created).toBe(true);

    // Resolve installed: the publish fallback reads the newest version row.
    const resolved = await loadPublishArtifact(
      db.asClient(),
      MERCHANT,
      seeded.themeId,
    );
    expect(resolved?.themeKey).toBe("songoskriti");
    expect(stableStringify(resolved?.templates)).toBe(
      stableStringify(artifact.templates),
    );
    expect(stableStringify(resolved?.tokens)).toBe(
      stableStringify(artifact.tokens),
    );

    // Publish the installed version, then read the live path.
    await activatePackage(db.asClient(), MERCHANT, seeded.themeId, seeded.versionId);
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live).not.toBeNull();
    expect(live!.versionId).toBe(seeded.versionId);
    expect(live!.themeKey).toBe("songoskriti");
    // The live path serves the installed rows through the standard gates
    // every merchant render uses (template parse + token defaults) — no
    // source statics anywhere in the chain.
    const stored = db.rows("theme_versions")[0]!;
    expect(stableStringify(live!.templates)).toBe(
      stableStringify(parseTemplates(stored.templates)),
    );
    expect(stableStringify(live!.tokens)).toBe(
      stableStringify(parseTokens(stored.tokens)),
    );
    // And every installed token reaches the live render.
    expect(live!.tokens).toMatchObject(
      artifact.tokens as Record<string, unknown>,
    );
  });

  it("installed key templates are structurally identical to today's source render", async () => {
    // Envelope-level exactness (no parse gates): the installed payload for
    // index/product deep-equals what the exporter renders from source today.
    // The parity suite proves the same for the ZIP lane; this pins it for
    // the seed lane the live path above reads.
    const artifact = sourceArtifact();
    for (const template of ["index", "product"] as const) {
      expect(
        stableStringify(artifact.templates[template]),
        template,
      ).toBe(stableStringify(expectedTemplate(template)));
    }
  });

  it("live tokens equal the source tokens", async () => {
    const db = liveDb();
    const merchant = "99999999-9999-4999-8999-999999999999";
    const [seeded] = await seedOfficialArtifacts(
      db.asClient(),
      merchant,
      [sourceArtifact()],
      "user-live-1",
    );
    await activatePackage(db.asClient(), merchant, seeded.themeId, seeded.versionId);
    const live = await publishedTheme(db.asClient(), merchant);
    expect(live).not.toBeNull();
    expect(live!.tokens).toMatchObject(
      officialThemeTokens("songoskriti") as unknown as Record<string, unknown>,
    );
    expect(stableStringify(live!.tokens)).toBe(
      stableStringify(parseTokens(officialThemeTokens("songoskriti"))),
    );
  });
});

describe("songoskriti provisioning wiring", () => {
  it("seeds once through the pipeline (one theme, one version)", async () => {
    const db = liveDb();
    const out = await seedSongoskritiBestEffort(db.asClient(), WIRE_MERCHANT);
    expect(out).toEqual({ ok: true, created: true });
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("store_themes")[0]).toMatchObject({
      merchant_id: WIRE_MERCHANT,
      source_listing_slug: "songoskriti",
      source_version: SONGOSKRITI_SEED_VERSION,
    });
  });

  it("replay is idempotent: no duplicate rows, same version", async () => {
    const db = liveDb();
    const first = await seedSongoskritiBestEffort(db.asClient(), WIRE_MERCHANT);
    expect(first).toEqual({ ok: true, created: true });
    const second = await seedSongoskritiBestEffort(db.asClient(), WIRE_MERCHANT);
    expect(second).toEqual({ ok: true, created: false });
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
  });

  it("never throws: invalid tenant and broken db resolve { ok: false }", async () => {
    const db = liveDb();
    await expect(
      seedSongoskritiBestEffort(db.asClient(), ""),
    ).resolves.toMatchObject({ ok: false });
    const broken = {
      from: () => {
        throw new Error("db exploded");
      },
    };
    await expect(
      seedSongoskritiBestEffort(broken as never, WIRE_MERCHANT),
    ).resolves.toMatchObject({ ok: false });
  });
});
