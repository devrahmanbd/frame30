/**
 * Batch C — the PREVIEW-PARITY contract.
 *
 * The brief's §3 promise is that *"the same template is used by storefront
 * route, editor preview and publish validation"*. This suite proves the
 * part that is easy to get wrong: **the CONTEXT SLOTS**. A context widget
 * renders nothing when its slot is not granted, so a preview that grants
 * fewer slots than the storefront shows a merchant a page that is missing
 * its rails — and a storefront that grants fewer shows a shopper one.
 *
 * The suite reads BOTH hosts' source as text — the same "read it as text"
 * pattern the repo already uses (`src/routes/store.$slug.search-composition.test.tsx`)
 * — and compares the two slot maps. A granted slot is always a catalogue
 * `SectionType`, so a comment or a JSX prop can never be mistaken for one.
 *
 * The differences the suite NAMES (and does not close):
 *
 *  - **`facet_sidebar` is granted by BOTH hosts** (Decision G2 (a)): the
 *    storefront resolves the widget-data batch on the server and mounts the
 *    `WidgetDataProvider` that feeds the same `source: "facets"` rows the
 *    preview uses. The old preview-only difference is CLOSED.
 *  - **The article detail grants `page_content` on top of the pack** — the
 *    route-owned body slot the article's title, excerpt, cover and body
 *    flow through. The blog LISTING grants exactly the pack.
 *
 * The `archive` template is the one case with NO live production route (the
 * three platform taxonomy surfaces are store-less and keep the platform
 * grid), so its preview grant set must be EXACTLY the archive body's six
 * functional slots — the set the deferred merchant-scoped route must grant
 * when it lands.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { catalogEntry, type SectionType } from "@/lib/builder-ast";

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, "..");
const read = (...parts: string[]): string =>
  readFileSync(join(SRC, ...parts), "utf8");

const PREVIEW = read("components", "store", "ThemePreviewFrame.tsx");
const BLOG_HOST = read("components", "store", "BlogArchiveTheme.tsx");
const PAGE_VIEW = read("components", "store", "PageView.tsx");
const SONGOSKRITI = read("lib", "themes", "songoskriti", "preview.ts");

/** True when the name is a catalogue widget — i.e. a grantable slot. */
function isSlot(name: string): boolean {
  return catalogEntry(name as SectionType) !== undefined;
}

/**
 * The balanced `{…}` block that starts at the first `{` after `marker`.
 */
function block(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `the source must contain ${marker}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("{", at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced block after ${marker}`);
}

/**
 * The slots a host grants, read from its source.
 *
 * The keys of the granted object, plus the keys of any LOCAL map the host
 * spreads in (`...accountSlots`) — resolved by finding that map's own
 * definition. A name that is not a catalogue widget (a comment word, a JSX
 * prop, a local variable) is not a grant.
 */
function grantedSlots(src: string, marker: string): string[] {
  const body = block(src, marker);
  const slots = new Set<string>();
  for (const m of body.matchAll(/([a-z_]+)\s*:/g)) {
    if (isSlot(m[1]!)) slots.add(m[1]!);
  }
  // The SHORTHAND form (`{ breadcrumb, page_content: … }`).
  for (const m of body.matchAll(/([a-z_]+)\s*,/g)) {
    if (isSlot(m[1]!)) slots.add(m[1]!);
  }
  for (const m of body.matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1]!;
    const def = `const ${name} =`;
    if (!src.includes(def)) continue;
    const local = block(src, def);
    for (const k of local.matchAll(/([a-z_]+)\s*:/g)) {
      if (isSlot(k[1]!)) slots.add(k[1]!);
    }
    // A map built by assignment (`out.orders_list = …`).
    for (const a of local.matchAll(/out\.([a-z_]+)\s*=/g)) {
      if (isSlot(a[1]!)) slots.add(a[1]!);
    }
  }
  return [...slots].sort();
}

/** The union of two grant sets. */
function union(...sets: string[][]): string[] {
  return [...new Set(sets.flat())].sort();
}

/** The difference between two grant sets. */
function difference(a: string[], b: string[]): string[] {
  return a.filter((slot) => !b.includes(slot)).sort();
}

describe("the preview and the storefront grant the SAME slots", () => {
  it("search — the two hosts grant the SAME slots (Decision G2 (a) closed the difference)", () => {
    const preview = grantedSlots(PREVIEW, "const searchSlots =");
    const production = grantedSlots(
      read("routes", "store.$slug.search.tsx"),
      "contextSlots={{",
    );
    expect(difference(production, preview)).toEqual([]);
    // Decision G2 (a): the storefront grants the facet sidebar too — the
    // widget batch its rows come from is resolved on the server and mounted
    // by the route. The OLD difference — the preview's extra
    // `facet_sidebar` — is CLOSED, so the two sets are EQUAL.
    expect(difference(preview, production)).toEqual([]);
    expect(preview).toContain("facet_sidebar");
    expect(production).toContain("facet_sidebar");
    expect(production).toContain("empty_state");
  });

  it("cart — the five cart slots, on both sides", () => {
    const preview = grantedSlots(PREVIEW, "const cartSlots =");
    const production = grantedSlots(
      read("routes", "store.$slug.cart.tsx"),
      "contextSlots={{",
    );
    expect(preview).toEqual([
      "cart_drawer",
      "cart_lines",
      "cart_summary",
      "checkout_steps",
      "payment_methods",
    ]);
    expect(preview).toEqual(production);
  });

  it("checkout — the five cart slots plus the route-owned body", () => {
    const preview = grantedSlots(PREVIEW, "const checkoutSlots =");
    const production = grantedSlots(
      read("routes", "store.$slug.checkout.tsx"),
      "contextSlots={{",
    );
    expect(preview).toEqual([
      "cart_drawer",
      "cart_lines",
      "cart_summary",
      "checkout_steps",
      "page_content",
      "payment_methods",
    ]);
    expect(preview).toEqual(production);
  });

  it("account — the account widgets, the placeable panels and the route-owned body", () => {
    const preview = union(
      grantedSlots(PREVIEW, "const accountSlots ="),
      grantedSlots(PREVIEW, "const accountBodySlot ="),
    );
    const production = grantedSlots(
      read("routes", "store.$slug.account.tsx"),
      "contextSlots={{",
    );
    // The four PLACEABLE panels join the two account widgets: a panel the
    // theme places is granted to the theme's body, and a panel it does not
    // place is the dashboard's.
    expect(preview).toEqual([
      "account_details",
      "account_nav",
      "account_orders",
      "account_overview",
      "orders_list",
      "page_content",
      "profile_card",
    ]);
    expect(preview).toEqual(production);
  });

  it("blog — the listing grants exactly the pack", () => {
    const preview = grantedSlots(PREVIEW, "const blogSlots =");
    // The merchant-scoped listing route wears the theme's composition
    // through the shared blog host, which grants the pack.
    const production = grantedSlots(BLOG_HOST, "contextSlots={{");
    expect(preview).toEqual(["blog_archive", "blog_pager", "blog_terms"]);
    expect(preview).toEqual(production);
  });

  it("blog article — the pack plus the route-owned article body", () => {
    const preview = grantedSlots(PREVIEW, "const blogSlots =");
    const production = grantedSlots(
      read("routes", "store.$slug.blog.$articleSlug.tsx"),
      "contextSlots={{",
    );
    // The pack is granted on both sides …
    expect(difference(preview, production)).toEqual([]);
    // … and the detail adds exactly ONE slot: the route-owned body the
    // article flows through.
    expect(difference(production, preview)).toEqual(["page_content"]);
  });

  it("page — the breadcrumb and the route-owned body", () => {
    const preview = grantedSlots(PREVIEW, "const pageSlots =");
    const production = grantedSlots(PAGE_VIEW, "contextSlots={{");
    expect(preview).toEqual(["breadcrumb", "page_content"]);
    expect(preview).toEqual(production);
  });

  it("archive — no live production route, so the preview's grant set IS the contract", () => {
    const preview = grantedSlots(PREVIEW, "const archiveSlots =");
    // EXACTLY the archive body's six functional slots — the set the
    // deferred merchant-scoped route must grant when it lands.
    const six = [
      "blog_archive",
      "blog_pager",
      "blog_terms",
      "category_header",
      "empty_state",
      "pagination",
    ];
    expect(preview).toEqual(six);
    // … and the theme's own archive body uses EXACTLY those six, so the
    // grant set is neither wider nor narrower than the body.
    const at = SONGOSKRITI.indexOf('case "archive":');
    expect(at, "the theme must author an archive body").toBeGreaterThanOrEqual(
      0,
    );
    const body = SONGOSKRITI.slice(
      at,
      SONGOSKRITI.indexOf('case "search":', at),
    );
    const used = [
      ...new Set([...body.matchAll(/s\("([a-z_]+)"/g)].map((m) => m[1]!)),
    ]
      .filter((name) => isSlot(name))
      .sort();
    expect(used).toEqual(six);
  });
});

/* ------------------------------------------------------------------------- *
 * The VARIANT parity — the same body through BOTH seams.
 *
 * The slot maps above cover the BASE templates. A VARIANT is a different
 * surface, and the two hosts resolve it through two different entry
 * points: the preview's `resolvePreviewVariantAst`
 * (`src/lib/theme-preview-nav.ts`) and the storefront's `resolveVariantAst`
 * (`src/lib/template-variants.ts`). The review found the preview's seam
 * EXPORTED and never called — so nothing proved the two agree.
 *
 * This case resolves one variant through BOTH seams over the SAME map and
 * asserts the same winning key and the same AST — and that the winning
 * key is the VARIANT, not the base.
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- *
 * The EDITOR and the PREVIEW — the same demo data.
 *
 * The editor canvas used to mount NO data provider at all: it read the
 * studio's `DEMO_CART` snapshot ("Sample product"), the blog pack's engine
 * `SAMPLE` rows and no account rows at all, while the preview read the
 * theme's own synthetic cart, feed and query. Two hosts, two datasets — the
 * plan's **D2**.
 *
 * The storefront is the ONE host that differs, and it differs BY DESIGN: it
 * mounts the LIVE scope (`LiveCartScope`), never the demo providers. The
 * case below pins all three.
 * ------------------------------------------------------------------------- */

describe("the editor, the preview and the storefront mount the RIGHT data", () => {
  const BUILDER = read("routes", "_authenticated", "dashboard", "builder.tsx");
  const CANVAS_SCOPE = read("components", "builder", "CanvasDemoScope.tsx");
  const CHROME = read("components", "store", "ThemeChrome.tsx");

  it("the editor and the preview mount the SAME demo providers — the theme's own data", () => {
    // The builder's provider scope is the extracted `CanvasDemoScope`, so the
    // mount is asserted on the module the builder actually renders (review
    // M5: the account provider joins the same scope).
    expect(BUILDER).toContain("<CanvasDemoScope");
    for (const provider of [
      "CartProvider",
      "CollectionQueryProvider",
      "BlogFeedProvider",
      "AccountDashboardProvider",
    ]) {
      expect(
        CANVAS_SCOPE,
        `the editor canvas must mount ${provider}`,
      ).toContain(provider);
      expect(PREVIEW, `the preview must mount ${provider}`).toContain(provider);
    }
    // The theme's OWN demo values — the same module on both sides, so the
    // editor and the preview cannot disagree about a product, a price or a
    // row.
    for (const source of [BUILDER, PREVIEW]) {
      expect(source).toContain("songoskritiPreviewCart");
      expect(source).toContain("songoskritiPreviewFeed");
    }
    expect(BUILDER).toContain("songoskritiPreviewAccountOverview");
    expect(BUILDER).toContain("songoskritiPreviewOrders");
  });

  it("the storefront mounts ONLY the live scope — never the demo providers", () => {
    expect(CHROME).toContain("LiveCartScope");
    expect(CHROME).not.toContain("songoskritiPreviewCart");
    expect(CHROME).not.toContain("songoskritiPreviewFeed");
    expect(CHROME).not.toContain("BlogFeedProvider");
    expect(CHROME).not.toContain("CollectionQueryProvider");
  });
});

describe("a variant resolves to the SAME body through both seams", () => {
  it("the preview seam and the storefront seam agree on the key and the AST", async () => {
    const { resolvePreviewVariantAst } =
      await import("@/lib/theme-preview-nav");
    const { resolveVariantAst } = await import("@/lib/template-variants");
    const { resolveThemePreview } = await import("@/lib/theme-preview-nav");
    const preset = resolveThemePreview("songoskriti")!;
    // The map the storefront reads: the base templates plus the authored
    // variant bodies, in ONE map (the parser persists them side by side).
    const bag = { ...preset.templates, ...preset.variants };

    for (const [variant, suffix] of [
      ["blog_listing", "listing"],
      ["blog_article", "article"],
    ] as const) {
      const preview = resolvePreviewVariantAst(bag, variant);
      const storefront = resolveVariantAst(bag, "blog", suffix);
      expect(preview, `${variant} must resolve in the preview`).not.toBeNull();
      expect(
        storefront,
        `${variant} must resolve in the storefront`,
      ).not.toBeNull();
      // The SAME winning key …
      expect(preview!.key).toBe(storefront!.key);
      // … and the SAME AST.
      expect(preview!.ast).toEqual(storefront!.ast);
      // The winner is the VARIANT — the variant's own body, not the base's.
      expect(preview!.key).toBe(variant);
      expect(preview!.ast).not.toEqual(preset.templates.blog);
    }
  });
});
