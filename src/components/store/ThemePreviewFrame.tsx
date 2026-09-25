/**
 * Task 8 — Full-screen theme preview frame.
 *
 * Renders blueprint sections (header / main / footer) with in-canvas
 * template navigation. No auth required; the route resolves the blueprint
 * from the URL key param and passes it here. Uses the same ThemeSurface +
 * SectionRenderer stack the storefront uses, but with placeholder widget
 * data so every section renders something visible.
 *
 * The preview is chrome-free: it shows exactly the store. Template switching
 * happens through in-canvas links (product / collection / search / page /
 * blog / cart / checkout / account / home) and the `?template=` deep link.
 * Signup, order tracking and every form submit are blocked with a
 * "Disabled in preview"
 * toast — capture-phase interception runs before widget handlers so no
 * contact/newsletter/coupon submission ever fires.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { StoreHeader } from "@/components/store/StoreHeader";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import {
  collectWidgetRequests,
  type WidgetDataBundle,
  type WidgetDataMap,
} from "@/lib/widget-data";
import { previewDemoMap } from "@/lib/preview-demo-data";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import { accountSlotCtx } from "./account-slots";
import { useLang } from "@/lib/i18n";
import { compileResponsiveCss } from "@/lib/responsive-css";
import { fontStylesheetUrl } from "@/lib/theme-fonts";
import {
  type Section,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import {
  primarySectionId,
  combineUsedSkinCss,
  usedWidgetSkins,
} from "@/lib/builder-ast";
import {
  applyDemoFocus,
  previewSearchForSwitch,
  resolveDemoFocus,
} from "@/lib/theme-preview-nav";

/** Toast copy shown whenever a preview action is blocked. */
export const PREVIEW_DISABLED_MESSAGE = "Disabled in preview";

/**
 * Href segments that must never act in preview: order tracking and
 * account / auth flows, in root shape (`/login`) or path shape
 * (`/store/<slug>/login`). Segment-bounded so `/cartoon` never matches.
 * Cart, checkout and account have authored demo templates, so they switch
 * instead of blocking — only the actions inside them (submits, payment)
 * are disabled.
 */
const BLOCKED_HREF_RE =
  /(^|\/)(order|track|sign-?in|sign-?up|login|register)([/?#]|$)/i;

/** True when an in-canvas href targets a blocked checkout/cart/account flow. */
export function isPreviewBlockedHref(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  return BLOCKED_HREF_RE.test(path);
}

/**
 * Maps an in-canvas href to the preview template it should switch to.
 * Blocked and unknown hrefs return null (blocked ones toast, unknown ones
 * keep their default behaviour). Demo rows use root-shaped `/p/<slug>` and
 * `/c/<slug>` hrefs; path-shaped `/store/<slug>/…` hrefs are stripped first.
 * Cart, checkout and account have authored demo templates — only signup,
 * order tracking and the actions inside (submits, payment) stay blocked.
 */
export function previewTemplateForHref(href: string): TemplateKey | null {
  return parsePreviewHref(href)?.template ?? null;
}

/**
 * In-canvas href parser: template plus the product/collection slug when the
 * link names one, plus the raw search query for `/search?…` links. The slug
 * is what lets every /c/* navbar link render its own collection instead of
 * one static demo page; the query is what lets the frame sync `q`/`max`
 * into the URL so refresh keeps search state.
 */
function parsePreviewHref(
  href: string,
): { template: TemplateKey; slug?: string; query: string | null } | null {
  if (isPreviewBlockedHref(href)) return null;
  const [hrefPath, queryRaw] = href.split("?", 2);
  const path = (hrefPath!.split("#", 1)[0] ?? "").toLowerCase();
  if (!path.startsWith("/")) return null;
  const query = queryRaw?.split("#", 1)[0] ?? null;
  const rest = path.replace(/^\/store\/[^/]+/, "") || "/";
  const seg = (re: RegExp): string | undefined => rest.match(re)?.[1];
  let slug: string | undefined;
  if ((slug = seg(/^\/(?:p|products?)\/([^/]+)/)) !== undefined)
    return { template: "product", slug, query };
  if (/^\/products?\//.test(rest)) return { template: "product", query };
  if ((slug = seg(/^\/(?:c|collections?)\/([^/]+)/)) !== undefined)
    return { template: "collection", slug, query };
  if (rest === "/search" || rest === "/search/")
    return { template: "search", query };
  if (rest === "/cart" || rest === "/cart/") return { template: "cart", query };
  if (rest === "/checkout" || rest === "/checkout/")
    return { template: "checkout", query };
  if (rest === "/account" || rest.startsWith("/account/"))
    return { template: "account", query };
  if (/^\/pages?\//.test(rest)) return { template: "page", query };
  if (rest === "/blog" || rest.startsWith("/blog/"))
    return { template: "blog", query };
  if (rest === "/" || rest === "/index" || rest === "/home")
    return { template: "index", query };
  return null;
}

export type PreviewClickAction =
  | { kind: "blocked" }
  | {
      kind: "switch";
      template: TemplateKey;
      slug?: string;
      query: string | null;
    }
  | { kind: "allow" };

/**
 * Pure click decision for an in-canvas anchor href. Hash jumps carry no
 * template meaning and keep their default behaviour.
 */
export function previewClickAction(
  href: string | null | undefined,
): PreviewClickAction {
  if (!href || href.startsWith("#")) return { kind: "allow" };
  if (isPreviewBlockedHref(href)) return { kind: "blocked" };
  const next = parsePreviewHref(href);
  if (!next) return { kind: "allow" };
  return next.slug !== undefined
    ? {
        kind: "switch",
        template: next.template,
        slug: next.slug,
        query: next.query,
      }
    : { kind: "switch", template: next.template, query: next.query };
}

type PreviewCanvasClickEvent = {
  // `unknown` keeps the fake-event stubs in the node-env suite assignable;
  // the handler only reads `closest` through a guarded cast.
  target: unknown;
  preventDefault: () => void;
  stopPropagation: () => void;
};

const SUBMIT_CONTROL_SELECTOR = 'button[type="submit"],input[type="submit"]';

/**
 * Capture-phase click interception for the preview canvas: submit controls
 * inside any form and signup / order-tracking links are blocked with a
 * toast, while product / collection / search / page / blog / cart /
 * checkout / account / home links report their target through `switchTo`
 * (template + focus slug + raw search query) so the frame can swap content
 * and sync the URL. Product/collection links additionally report their slug
 * through switchTo so the demo renders the clicked collection, not a
 * static page. Everything else passes through untouched.
 */
export function handlePreviewCanvasClick(
  event: PreviewCanvasClickEvent,
  switchTo: (
    template: TemplateKey,
    focus: string | null,
    query: string | null,
  ) => void,
): void {
  const el = event.target as HTMLElement | null;
  const submit = el?.closest?.(SUBMIT_CONTROL_SELECTOR) as HTMLElement | null;
  if (submit && submit.closest?.("form")) {
    event.preventDefault();
    event.stopPropagation();
    toast.info(PREVIEW_DISABLED_MESSAGE);
    return;
  }
  const anchor = el?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return;
  const action = previewClickAction(anchor.getAttribute("href"));
  if (action.kind === "blocked") {
    event.preventDefault();
    event.stopPropagation();
    toast.info(PREVIEW_DISABLED_MESSAGE);
  } else if (action.kind === "switch") {
    event.preventDefault();
    event.stopPropagation();
    switchTo(
      action.template,
      action.slug !== undefined &&
        (action.template === "collection" || action.template === "product")
        ? action.slug
        : null,
      action.query,
    );
  }
}

/**
 * Capture-phase submit interception for the preview canvas: newsletter,
 * contact, coupon and every other form is blocked with a toast. Runs in
 * capture so widget `onSubmit` handlers (contact API, coupon state) never
 * fire.
 */
export function handlePreviewCanvasSubmit(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
}): void {
  event.preventDefault();
  event.stopPropagation();
  toast.info(PREVIEW_DISABLED_MESSAGE);
}

export type ThemePreviewFrameProps = {
  /** Blueprint name for the header. */
  themeName: string;
  /** Blueprint author. */
  author: string;
  /** Blueprint key — selects the demo catalog for preview rows. */
  blueprintKey: string;
  /** Theme tokens applied to the preview surface. */
  tokens: ThemeTokens;
  /** All authored templates keyed by template key. */
  templates: Record<TemplateKey, ThemeAst>;
  /** Deep-linkable starting tab (?template=product). Defaults to homepage. */
  initialTemplate?: TemplateKey;
  /** Deep-linkable demo focus (?focus=bestsellers): renders that demo
      collection/product on first paint. In-canvas clicks replace it. */
  initialFocus?: string | null;
  /**
   * Lane B2-1: per-key theme skin sheets (`"<type>:<skin>"` → CSS, the
   * `combineUsedSkinCss` contract). Only the sheets for skins the rendered
   * template actually uses are inlined, inside ThemeSurface. Absent keeps
   * today's behavior — no skin stylesheet is inlined. The supplying lane
   * (theme/route) owns splitting full theme sheets per key.
   */
  skinSheets?: Partial<Record<string, string>> | null;
  /**
   * Retained for route compatibility. The preview renders no chrome, so the
   * close control is gone and this is intentionally unwired.
   */
  onClose: () => void;
};

export function ThemePreviewFrame({
  themeName,
  blueprintKey,
  tokens,
  templates,
  initialTemplate,
  initialFocus,
  skinSheets,
}: ThemePreviewFrameProps) {
  const startTemplate = initialTemplate ?? "index";
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateKey>(startTemplate);
  // Clicked product/collection slug: renders that demo collection instead
  // of one static page for every /c/* link. Cleared on any switch that
  // carries no slug. Deep-linkable via ?focus= for merchant-less URLs.
  const [focus, setFocus] = useState<{
    template: TemplateKey;
    slug: string;
  } | null>(() =>
    initialFocus &&
    (startTemplate === "collection" || startTemplate === "product")
      ? { template: startTemplate, slug: initialFocus }
      : null,
  );

  // Back/forward re-sync: the route owns the URL, the frame owns the paint.
  // Route search changes (history pop) re-render this frame with new
  // initial props, but useState keeps the stale click-time values without
  // this effect, so the back button would desync from the URL.
  useEffect(() => {
    setTemplate(initialTemplate ?? "index");
    setFocus(
      initialFocus &&
        (initialTemplate === "collection" || initialTemplate === "product")
        ? { template: initialTemplate, slug: initialFocus }
        : null,
    );
  }, [initialTemplate, initialFocus]);

  // Template/focus switch that syncs the URL: every in-canvas navigation
  // pushes a history entry (`?template=&focus=`, plus `q`/`max` on search)
  // with replace:false, so back/forward restores the painted template and
  // refresh keeps search state. Leaving search clears `q`/`max` so a
  // previous query never leaks into collection/product URLs.
  const switchTo = (
    nextTemplate: TemplateKey,
    nextFocus: string | null,
    query: string | null,
  ): void => {
    setTemplate(nextTemplate);
    setFocus(
      nextFocus && (nextTemplate === "collection" || nextTemplate === "product")
        ? { template: nextTemplate, slug: nextFocus }
        : null,
    );
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) =>
        previewSearchForSwitch(nextTemplate, nextFocus, query, prev),
      replace: false,
    } as never);
  };

  const ast = templates[template] ?? templates.index;
  const demoFocus =
    focus && focus.template === template
      ? resolveDemoFocus(blueprintKey, focus.template, focus.slug)
      : null;
  const focusedMain =
    demoFocus &&
    (template === "collection" || template === "product") &&
    demoFocus.template === template
      ? applyDemoFocus(ast.main, demoFocus)
      : ast.main;
  // The preview has no route to supply the h1, so the elected primary
  // section owns it — same election the storefront host runs.
  const primaryId = primarySectionId({ ...ast, main: focusedMain });
  // Lane B2-1: per-page skin sheets. Keys come from the RENDERED page
  // (header + focused main + footer, so a clicked collection's rails count);
  // only matching sheets inline, inside ThemeSurface. Fail-open: any failure
  // inlines nothing, today's behavior.
  let skinCss: string | null = null;
  try {
    if (skinSheets) {
      const used = usedWidgetSkins({
        header: ast.header,
        main: focusedMain,
        footer: ast.footer,
      }).map((skin) => skin.key);
      const combined = combineUsedSkinCss(skinSheets, used);
      skinCss = combined === "" ? null : combined;
    }
  } catch {
    skinCss = null;
  }
  const allSections: Section[] = [...ast.header, ...ast.main, ...ast.footer];
  // CompiledResponsive object — the stylesheet is `.css`. The storefront
  // host (ThemeChrome) inlines it verbatim inside ThemeSurface; preview
  // must do the same or per-device overrides silently die here.
  const responsive = compileResponsiveCss(allSections);
  // Preview has no merchant data: feed every data widget demo catalog rows
  // so grids/rails render products instead of skeleton-spinning forever.
  const previewData: { bundle: WidgetDataBundle; map: WidgetDataMap } =
    useMemo(() => {
      // Focused rails request the focused collection, so bundle from the
      // focused sections — otherwise rows would not match the heading.
      const bundle = collectWidgetRequests({ ...ast, main: focusedMain });
      return { bundle, map: previewDemoMap(bundle, blueprintKey) };
    }, [ast, focusedMain, blueprintKey]);

  const { lang } = useLang();
  // Account center is context-gated: feed the merchant sections demo rows
  // so the account tab renders instead of parking on skeletons.
  const accountSlots = useMemo(() => {
    if (template !== "account") return undefined;
    const sections = [...ast.header, ...ast.main, ...ast.footer];
    const build = (type: "orders_list" | "profile_card") => {
      const section = sections.find((s) => s.type === type);
      if (!section) return undefined;
      const key = previewData.bundle.byNode[section.id];
      const rows = key ? previewData.map[key] : undefined;
      const ctx = accountSlotCtx(section, {
        rows,
        pending: false,
        locale: lang,
        storeSlug: blueprintKey,
      });
      return type === "orders_list" ? (
        <OrdersList {...ctx} />
      ) : (
        <ProfileCard {...ctx} />
      );
    };
    return {
      orders_list: build("orders_list"),
      profile_card: build("profile_card"),
    };
  }, [template, ast, previewData, lang, blueprintKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${themeName} theme preview`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---- Google Font stylesheet for theme's font pairings ---- */}
      {fontStylesheetUrl(tokens) && (
        <link
          rel="stylesheet"
          href={fontStylesheetUrl(tokens)}
          crossOrigin="anonymous"
        />
      )}

      {/* ---- preview canvas: full-bleed, no frame. Clicks navigate between
          templates in place; actions and submits are blocked. ---- */}
      <div
        className="flex-1 overflow-auto bg-background"
        onClickCapture={(event) => handlePreviewCanvasClick(event, switchTo)}
        onSubmitCapture={handlePreviewCanvasSubmit}
      >
        <div className="mx-auto" style={{ maxWidth: "100%" }}>
          <ThemeSurface tokens={tokens} skinCss={skinCss}>
            {/* Per-device overrides, same contract as ThemeChrome:
                verbatim stylesheet, inside the theme scope. */}
            {responsive.css ? (
              <style
                data-fq-responsive={String(responsive.rules)}
                dangerouslySetInnerHTML={{ __html: responsive.css }}
              />
            ) : null}

            {/* Top-level ribbon bar (e.g. subbrand_bar) rendered above the store masthead */}
            {ast.header
              .filter((section) => section.type === "subbrand_bar")
              .map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                  contextSlots={accountSlots}
                />
              ))}

            {/* Wordmark row, as on a live storefront — the blueprint's
                navigation sections render beneath it. */}
            <StoreHeader slug={blueprintKey} name={themeName} menus={null} />
            <WidgetDataProvider
              bundle={previewData.bundle}
              map={previewData.map}
            >
              {/* Header sections below the masthead (e.g. mega_menu) */}
              {ast.header
                .filter((section) => section.type !== "subbrand_bar")
                .map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={section}
                    template={template}
                    editing={false}
                    contextSlots={accountSlots}
                  />
                ))}

              {/* main slot */}
              {focusedMain.length > 0 ? (
                <main className="space-y-12 sm:space-y-16 pb-16 [&>[data-fq-node^='hero_carousel']]:!mt-0 [&>[data-fq-node^='announcement_bar']]:!mt-0 [&>[data-fq-node^='announcement_bar']+*]:!mt-0">
                  {focusedMain.map((section) => (
                    <SectionRenderer
                      key={section.id}
                      section={section}
                      template={template}
                      editing={false}
                      contextSlots={accountSlots}
                      primary={section.id === primaryId}
                    />
                  ))}
                </main>
              ) : (
                <div className="grid min-h-[40vh] place-items-center p-8 text-sm text-muted-foreground">
                  No sections authored for this template.
                </div>
              )}

              {/* footer slot — landmark parity with ThemeChrome */}
              {ast.footer.length > 0 && (
                <footer className="border-t border-border bg-card/40 mt-16 pt-12 pb-16">
                  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                    {ast.footer.map((section) => (
                      <SectionRenderer
                        key={section.id}
                        section={section}
                        template={template}
                        editing={false}
                        contextSlots={accountSlots}
                      />
                    ))}
                  </div>
                </footer>
              )}
            </WidgetDataProvider>
          </ThemeSurface>
        </div>
      </div>
    </div>
  );
}
