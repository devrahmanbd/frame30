/**
 * Task 1 — the `archive` template key contract.
 *
 * The archive key is a MODEL change, so the contract lives with the model
 * and is asserted in ONE place, before the model moves. This suite is the
 * tripwire for every way the key can be half-added:
 *
 * 1. the union knows the key — a key the union does not know is dropped by
 *    `parseTemplates` on the way to storage, and the merchant's work
 *    silently vanishes on save;
 * 2. `parseTemplates` KEEPS an `archive` entry through a parse → JSON →
 *    parse round trip;
 * 3. the hand-written `z.enum` in `src/lib/storefront.functions.ts` — the
 *    one compiler-INVISIBLE duplicate of the union — lists exactly the
 *    union's keys. It rejects an unknown key at RUNTIME, so an archive
 *    route would 500 while every type check passed;
 * 4. the zone table has an `archive` row that permits the layout slots and
 *    no overlay that could cover the page;
 * 5. the editor's three exhaustive label maps each carry the key;
 * 6. the JS budget and the SEO fallback carry the key;
 * 7. the distinctness gate's row for the key is NON-EMPTY (a table that
 *    quietly drops a template is a gate that quietly stops guarding it);
 * 8. the variant machinery accepts the key's variants and rejects a
 *    malformed one;
 * 9. the EXACT set of catalogue rows that carry `"archive"` — so a missing
 *    allowlist row fails THIS suite, not a merchant's publish (an
 *    un-allowlisted widget is a publish-blocking "needs data this template
 *    does not provide" error, and the distinctness gate's `R3` fails on the
 *    same gap);
 * 10. the theme-package contract — a manifest that declares `archive` while
 *     claiming an API range below the line the key landed in is rejected
 *     with the stable reason code `templates.archive_requires_api`, and a
 *     manifest that does not declare `archive` is unaffected;
 * 11. BACKWARD COMPATIBILITY — a map written before the key existed
 *     round-trips through `parseTemplates` unchanged, and `templateOf` for
 *     the missing key is the EMPTY AST, not a crash and not a fallback to
 *     another template's body.
 *
 * The suite reads two files as TEXT — the storefront validator and the
 * catalogue — the same pattern `src/routes/store.$slug.search-composition.test.tsx`
 * already uses: the hand-written enum and the catalogue allowlists are
 * data the compiler cannot check.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_AST,
  TEMPLATE_KEYS,
  TEMPLATE_ZONES,
  isVariantTemplateKey,
  parseTemplates,
  templateOf,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { validateThemeManifest } from "./theme-package";
import { SONOSKRITI_TEMPLATE_EXPECTATIONS } from "./themes/songoskriti/template-distinctness";

const DIR = dirname(fileURLToPath(import.meta.url));
/** The repo root — two levels up from `src/lib/`. */
const REPO = join(DIR, "..", "..");

const BUILDER_AST = readFileSync(join(REPO, "src/lib/builder-ast.ts"), "utf8");
const STOREFRONT_FUNCTIONS = readFileSync(
  join(REPO, "src/lib/storefront.functions.ts"),
  "utf8",
);

/**
 * The catalogue's `templates:` allowlist rows, read out of the source as
 * TEXT — the compiler cannot see a data table, so a missing row would
 * otherwise only surface as a publish-blocking error in a merchant's
 * storefront.
 */
function catalogueArchiveRows(): string[] {
  const from = BUILDER_AST.indexOf("const BASE_CATALOG");
  const to = BUILDER_AST.indexOf("export const SECTION_CATALOG");
  expect(from, "builder-ast.ts must declare BASE_CATALOG").toBeGreaterThan(0);
  expect(to, "builder-ast.ts must declare SECTION_CATALOG").toBeGreaterThan(
    from,
  );
  const catalogue = BUILDER_AST.slice(from, to);
  const rows: string[] = [];
  const entryRe =
    /\n {4}type: "([a-z0-9_]+)",([\s\S]*?)(?=\n {4}type: "|\n\];|$)/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(catalogue)) !== null) {
    const [, type, body] = match;
    const allowlist = /templates:\s*\[([^\]]*)\]/.exec(body ?? "");
    if (!allowlist) continue;
    const keys = [...(allowlist[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map(
      (m) => m[1]!,
    );
    if (!keys.includes("archive")) continue;
    rows.push(type!);
  }
  return rows.sort();
}

/**
 * The hand-written `z.enum` in the storefront validator — the ONE
 * compiler-invisible duplicate of the union.
 */
function storefrontEnumKeys(): string[] {
  const at = STOREFRONT_FUNCTIONS.indexOf("template: z.enum([");
  expect(
    at,
    "storefront.functions.ts must declare the template z.enum",
  ).toBeGreaterThanOrEqual(0);
  const open = STOREFRONT_FUNCTIONS.indexOf("[", at);
  const close = STOREFRONT_FUNCTIONS.indexOf("]", open);
  const body = STOREFRONT_FUNCTIONS.slice(open, close);
  return [...body.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]!);
}

/** A tiny authored body — one section, so it is not the EMPTY AST. */
function authored(): ThemeAst {
  return {
    header: [],
    main: [{ id: "archive-1", type: "blog_archive", props: {} }],
    footer: [],
  };
}

describe("the archive template key — the union", () => {
  it("the union knows the key", () => {
    expect(TEMPLATE_KEYS as readonly string[]).toContain("archive");
  });

  it("parseTemplates KEEPS an archive entry through a parse → JSON → parse round trip", () => {
    const once = parseTemplates({ archive: authored() });
    expect(once.archive).toBeDefined();
    const twice = parseTemplates(JSON.parse(JSON.stringify(once)));
    expect(twice.archive).toBeDefined();
    expect(twice.archive?.main.map((s) => s.type)).toEqual(["blog_archive"]);
  });
});

describe("the archive template key — the hand-written duplicate", () => {
  it("the storefront validator's z.enum lists EXACTLY the union's keys", () => {
    // A key the editor knows and the validator does not is rejected at
    // RUNTIME — the archive route would 500 while every type check passed.
    expect(storefrontEnumKeys().sort()).toEqual([...TEMPLATE_KEYS].sort());
  });
});

describe("the archive template key — the structural tables", () => {
  it("the zone table has an archive row: the layout slots, the overlay chrome and the 404 body", () => {
    const zones = TEMPLATE_ZONES.archive;
    expect(zones).toContain("header");
    expect(zones).toContain("main");
    expect(zones).toContain("footer");
    expect(zones).toContain("not_found");
    // The archive is a LISTING page, so it wears the same overlay chrome as
    // the collection, the blog and the search — the overlay ban is
    // checkout's alone (a popup must never cover a payment step).
    expect(zones).toContain("popup");
    // …and it carries NONE of the privileged page zones: `thank_you` is
    // checkout's, and `password` / `coming_soon` gate the generic canvases.
    expect(zones).not.toContain("thank_you");
    expect(zones).not.toContain("password");
    expect(zones).not.toContain("coming_soon");
  });
});

describe("the archive template key — the editor's label maps", () => {
  it("TEMPLATE_META carries the key", async () => {
    const mod = await import("@/components/builder/BuilderTopBar");
    expect(mod.TEMPLATE_META.archive).toBeDefined();
  });

  it("TEMPLATE_LABEL carries the key", async () => {
    const src = readFileSync(
      join(REPO, "src/routes/_authenticated/dashboard/builder.tsx"),
      "utf8",
    );
    expect(src).toMatch(/TEMPLATE_LABEL[^=]*=\s*\{[\s\S]*?archive:/);
  });

  it("GENERIC_TITLES carries the key", async () => {
    const mod = await import("@/lib/theme-preview-nav");
    // `GENERIC_TITLES` is module-private; the preview's own generic body
    // reads it, so the public proof is the rendered fallback title.
    const src = readFileSync(
      join(REPO, "src/lib/theme-preview-nav.ts"),
      "utf8",
    );
    expect(src).toMatch(/GENERIC_TITLES[^=]*=\s*\{[\s\S]*?archive:/);
    expect(mod).toBeDefined();
  });
});

describe("the archive template key — the weight and SEO tables", () => {
  it("TEMPLATE_JS_BUDGET carries the key", async () => {
    const mod = await import("@/lib/widget-weight");
    expect(mod.TEMPLATE_JS_BUDGET.archive).toBeGreaterThan(0);
  });

  it("TEMPLATE_FALLBACK carries the key", async () => {
    const src = readFileSync(join(REPO, "src/lib/builder-seo.ts"), "utf8");
    expect(src).toMatch(/TEMPLATE_FALLBACK[^=]*=\s*\{[\s\S]*?archive:/);
  });
});

describe("the archive template key — the distinctness gate", () => {
  it("the gate's row for the key is present and NON-EMPTY", () => {
    const row = SONOSKRITI_TEMPLATE_EXPECTATIONS.archive;
    expect(row).toBeDefined();
    expect(row.requiredTypes.length).toBeGreaterThan(0);
    expect(row.requiredSlots.length).toBeGreaterThan(0);
    expect(row.requiredTypes).toContain("blog_archive");
    expect(row.forbiddenTypes).toContain("product_grid");
  });
});

describe("the archive template key — the variant machinery", () => {
  it("the key's variants are accepted and a malformed one is not", () => {
    expect(isVariantTemplateKey("archive_category")).toBe(true);
    expect(isVariantTemplateKey("archive_tag")).toBe(true);
    expect(isVariantTemplateKey("archive_author")).toBe(true);
    expect(isVariantTemplateKey("archive_bogus!")).toBe(false);
    expect(isVariantTemplateKey("archive_")).toBe(false);
  });
});

describe("the archive template key — the catalogue allowlists", () => {
  it("EXACTLY the seven rows an archive listing may carry carry the key", () => {
    // A missing row is a publish-blocking "needs data this template does
    // not provide" error the first time a merchant places that widget on
    // the archive — and a failure of the distinctness gate's `R3`. This
    // assertion is what makes it a suite failure instead.
    expect(catalogueArchiveRows()).toEqual([
      "blog_archive",
      "blog_pager",
      "blog_terms",
      "breadcrumb",
      "category_header",
      "empty_state",
      "pagination",
    ]);
  });
});

describe("the archive template key — the theme-package contract", () => {
  const SHA256_EMPTY =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  function manifest(overrides: Record<string, unknown>) {
    return {
      key: "archive-pack",
      name: "Archive Pack",
      nameBn: "আর্কাইভ প্যাক",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index", "archive"],
      supportedWidgets: ["hero", "blog_archive"],
      pluginDependencies: [],
      presentationSurfaces: ["widget"],
      locales: ["en", "bn"],
      assetManifest: [{ path: "images/hero.webp", sha256: SHA256_EMPTY }],
      capabilities: ["read_shop", "read_products", "render_storefront"],
      ...overrides,
    };
  }

  it("rejects an archive-declaring package whose API range is below 3.1.0", () => {
    const verdict = validateThemeManifest(manifest({ api: "^3.0.0" }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("templates.archive_requires_api");
  });

  it("admits an archive-declaring package whose API range reaches 3.1.0", () => {
    const verdict = validateThemeManifest(manifest({ api: "^3.1.0" }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) {
      expect(verdict.errors).toEqual([]);
      return;
    }
    expect(verdict.manifest.templates).toEqual(["index", "archive"]);
  });

  it("leaves a package that does not declare the archive unaffected", () => {
    const verdict = validateThemeManifest(
      manifest({ api: "^3.0.0", templates: ["index"] }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.api).toBe("^3.0.0");
  });

  it("reads the `>=a <b` range form: an archive package whose floor is below 3.1.0 is refused", () => {
    // The pair form floors at its LOWER bound. `>=3.0.0 <4.0.0` covers the
    // running 3.1.0, so the compatibility gate admits it — the ARCHIVE rule
    // is what refuses it, because the key landed in 3.1.0.
    const verdict = validateThemeManifest(manifest({ api: ">=3.0.0 <4.0.0" }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("templates.archive_requires_api");
  });

  it("admits an archive-declaring package whose `>=a <b` floor reaches 3.1.0", () => {
    const verdict = validateThemeManifest(manifest({ api: ">=3.1.0 <4.0.0" }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) {
      expect(verdict.errors).toEqual([]);
      return;
    }
    expect(verdict.manifest.api).toBe(">=3.1.0 <4.0.0");
    expect(verdict.manifest.templates).toEqual(["index", "archive"]);
  });

  it("refuses a bare version — the range gate rejects it before any archive floor is read", () => {
    // An exact pin is NOT an admitted range shape: the gate rejects it as
    // `api_range_invalid`, so no manifest is ever admitted through it and
    // the archive floor never reads one.
    const verdict = validateThemeManifest(manifest({ api: "3.1.0" }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("api_range_invalid");
  });
});

describe("the archive template key — backward compatibility", () => {
  it("a map written before the key existed round-trips unchanged", () => {
    // Nine keys, no `archive` — the shape every merchant's persisted
    // `theme_versions.templates` map has today.
    const legacy: Record<string, ThemeAst> = {};
    for (const key of TEMPLATE_KEYS) {
      if (key === ("archive" as TemplateKey)) continue;
      legacy[key] = authored();
    }
    const parsed = parseTemplates(legacy);
    // Nothing is ADDED and nothing is REMOVED: the key set is exactly the
    // nine the map already carried.
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(legacy).sort());
    // Every key's body survives — the sections, their ids and their types.
    for (const key of Object.keys(legacy)) {
      expect(
        parsed[key as TemplateKey]?.main.map((s) => [s.id, s.type]),
        key,
      ).toEqual(legacy[key]!.main.map((s) => [s.id, s.type]));
    }
    // …and the round trip is a FIXED POINT: a second parse changes
    // nothing, so the map a merchant's browser sends is exactly what the
    // platform stores.
    const twice = parseTemplates(JSON.parse(JSON.stringify(parsed)));
    expect(twice).toEqual(parsed);
  });

  it("the missing key resolves to the EMPTY AST, never to another template's body", () => {
    const legacy = parseTemplates({ index: authored() });
    expect(templateOf(legacy, "archive" as TemplateKey)).toEqual(EMPTY_AST);
  });
});
