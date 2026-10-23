/**
 * The merchant-scoped category archive reader (Batch B, gap 3).
 *
 * The platform keeps DATA and TENANT authority end to end: this loader is
 * reached only through `storeBlogArchiveFn` (rate-limited, IP-hashed), it
 * resolves the merchant through the existing store-chrome read
 * (`loadStoreChrome` — `status = "active"` or null), and it windows the
 * listing through the SAME reader the store-less taxonomy routes use
 * (`loadTermArchive`), scoped to that merchant.
 *
 * The composition is resolved SERVER-SIDE through the ONE resolver —
 * `resolveTemplateForHost({ mode: "published", host: "storefront" })` — with
 * the variant-first rule its `findBody` already implements
 * (`archive_category` → its `archive` base, suffix/base matches only, never
 * the homepage). The home chrome is merged through the SAME resolver on
 * `index`, mirroring `publishedTemplatePayload`'s rule; there is no second
 * lookup rule in this file. The client receives the resolved `ThemeAst` —
 * never the theme's template map.
 */
import { publicClient } from "./pricing.server";
import type { ThemeAst, ThemeTokens } from "./builder-ast";
import type { PermalinkSettings } from "./permalink";
import type { TermArchive } from "./blog-index.server";

export async function loadStoreBlogArchive(
  slug: string,
  termSlug: string,
  page: number,
): Promise<{
  merchant: { id: string; name: string; slug: string };
  origin: string | null;
  settings: PermalinkSettings;
  menus: import("./menus/menu").StoreMenus;
  themeKey: string | null;
  tokens: ThemeTokens | null;
  ast: ThemeAst | null;
  archive: TermArchive;
  basePath: string;
} | null> {
  // Tenant authority: the same read every store surface uses — an unknown
  // or inactive merchant is null, and the route answers a real 404.
  const { loadStoreChrome } = await import("./storefront.server");
  const chrome = await loadStoreChrome(slug, "archive");
  if (!chrome) return null;

  // The published theme's TEMPLATE MAP — the tenant-keyed, version-cached
  // read the storefront's own variant path uses. A themeless store keeps
  // `ast`/`tokens` null and the route renders the platform grid.
  let ast: ThemeAst | null = null;
  let tokens: ThemeTokens | null = null;
  const { publishedTheme } = await import("./themes.server");
  const theme = await publishedTheme(publicClient(), chrome.merchant.id);
  if (theme) {
    tokens = theme.tokens;
    const { resolveTemplateForHost } = await import("./pipeline-resolver");
    const resolution = resolveTemplateForHost({
      template: "archive_category",
      variants: theme.templates,
      tenant: chrome.merchant.id,
      mode: "published",
      host: "storefront",
      tokens: theme.tokens,
    });
    // The chrome rule the base path already applies, through the SAME
    // resolver — resolved ONCE and reused for the decline below: a template
    // that publishes no header/footer borrows the home template's, so a
    // shopper never lands on a page without the store's navigation or its
    // policy links.
    const home = resolveTemplateForHost({
      template: "index",
      variants: theme.templates,
      tenant: chrome.merchant.id,
      mode: "published",
      host: "storefront",
    });
    const homeAst = home.status === "resolved" ? home.ast : null;
    // The NAMED decline (Decision Gate G3): a PUBLISHED theme that authors
    // no archive body keeps the platform's grid — but inside the theme's
    // own chrome, in the store's voice, as the DECLINED-TEMPLATE frame
    // (`ThemeChrome` answers an empty main with
    // `data-fq-theme-state="declined-template"`, `theme-body-slot.ts`),
    // never a silent, unbranded grid and never the StoreWelcome panel.
    // A store with NO theme keeps `ast` null: the naked-and-honest grid is
    // that store's pinned blog-index rule.
    ast = {
      header:
        resolution.status === "resolved" && resolution.ast.header.length
          ? resolution.ast.header
          : (homeAst?.header ?? []),
      main: resolution.status === "resolved" ? resolution.ast.main : [],
      footer:
        resolution.status === "resolved" && resolution.ast.footer.length
          ? resolution.ast.footer
          : (homeAst?.footer ?? []),
    };
  }

  // The archive's own URLs — the loader's prev/next, the feed and the head
  // all derive from this one base.
  const basePath = `/store/${slug}/blog/category/${termSlug}`;
  const archiveBase = (p: number) =>
    p > 1 ? `${basePath}?page=${p}` : basePath;

  const { loadTermArchive, TermNotFound } = await import("./blog-index.server");
  let archive: TermArchive;
  try {
    archive = await loadTermArchive("category", termSlug, page, {
      merchantId: chrome.merchant.id,
      basePath: archiveBase,
    });
  } catch (error) {
    // An unknown term for THIS store is a 404 — never another store's
    // same-named category, never an empty-but-200 archive.
    if (error instanceof TermNotFound) return null;
    throw error;
  }

  const { permalinkSettingsFor } = await import("./permalink.server");
  const { requestOrigin } = await import("./site-origin.server");
  return {
    merchant: {
      id: chrome.merchant.id,
      name: chrome.merchant.name,
      slug: chrome.merchant.slug,
    },
    origin: requestOrigin(),
    settings: await permalinkSettingsFor(publicClient(), chrome.merchant.id),
    menus: chrome.menus,
    themeKey: chrome.themeKey,
    tokens,
    ast,
    archive,
    basePath,
  };
}
