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
 * blog / home) and the `?template=` deep link. Checkout / cart / account
 * flows and every form submit are blocked with a "Disabled in preview"
 * toast — capture-phase interception runs before widget handlers so no
 * contact/newsletter/coupon submission ever fires.
 */
import { useMemo, useState, type MouseEvent } from "react";
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
import {
  type Section,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";

/** Toast copy shown whenever a preview action is blocked. */
export const PREVIEW_DISABLED_MESSAGE = "Disabled in preview";

/**
 * Href segments that must never act in preview: checkout / cart flows and
 * account / auth flows, in root shape (`/checkout`) or path shape
 * (`/store/<slug>/checkout`). Segment-bounded so `/cartoon` never matches.
 */
const BLOCKED_HREF_RE =
  /(^|\/)(checkout|cart|account|sign-?in|sign-?up|login|register)([\/?#]|$)/i;

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
 */
export function previewTemplateForHref(href: string): TemplateKey | null {
  if (isPreviewBlockedHref(href)) return null;
  const path = (href.split(/[?#]/, 1)[0] ?? "").toLowerCase();
  if (!path.startsWith("/")) return null;
  const rest = path.replace(/^\/store\/[^/]+/, "") || "/";
  if (/^\/p\/[^/]+/.test(rest) || /^\/products?\//.test(rest)) return "product";
  if (/^\/c\/[^/]+/.test(rest) || /^\/collections?\//.test(rest))
    return "collection";
  if (rest === "/search" || rest === "/search/") return "search";
  if (/^\/pages?\//.test(rest)) return "page";
  if (rest === "/blog" || rest.startsWith("/blog/")) return "blog";
  if (rest === "/" || rest === "/index" || rest === "/home") return "index";
  return null;
}

export type PreviewClickAction =
  | { kind: "blocked" }
  | { kind: "switch"; template: TemplateKey }
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
  const next = previewTemplateForHref(href);
  return next ? { kind: "switch", template: next } : { kind: "allow" };
}

type PreviewCanvasClickEvent = {
  // `unknown` keeps the fake-event stubs in the node-env suite assignable;
  // the handler only reads `closest` through a guarded cast.
  target: unknown;
  preventDefault: () => void;
  stopPropagation: () => void;
};

const SUBMIT_CONTROL_SELECTOR =
  'button[type="submit"],input[type="submit"]';

/**
 * Capture-phase click interception for the preview canvas: submit controls
 * inside any form and checkout / account links are blocked with a toast,
 * product / collection / search / page / blog / home links switch the
 * preview template. Everything else passes through untouched.
 */
export function handlePreviewCanvasClick(
  event: PreviewCanvasClickEvent,
  setTemplate: (template: TemplateKey) => void,
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
    setTemplate(action.template);
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
}: ThemePreviewFrameProps) {
  const [template, setTemplate] = useState<TemplateKey>(
    initialTemplate ?? "index",
  );

  const ast = templates[template] ?? templates.index;
  const allSections: Section[] = [...ast.header, ...ast.main, ...ast.footer];
  const responsiveCss = compileResponsiveCss(allSections);
  // Preview has no merchant data: feed every data widget demo catalog rows
  // so grids/rails render products instead of skeleton-spinning forever.
  const previewData: { bundle: WidgetDataBundle; map: WidgetDataMap } =
    useMemo(() => {
      const bundle = collectWidgetRequests(ast);
      return { bundle, map: previewDemoMap(bundle, blueprintKey) };
    }, [ast, blueprintKey]);

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
    return { orders_list: build("orders_list"), profile_card: build("profile_card") };
  }, [template, ast, previewData, lang, blueprintKey]);

  // Envato-style demo browsing: mapped links switch the preview tab with
  // demo content instead of escaping to live routes that 404 on hosts
  // without a merchant. Unmapped links keep default browser behavior.
  const onCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest?.("a[href]");
    if (!anchor) return;
    const next = previewTemplateForHref(anchor.getAttribute("href") ?? "");
    if (!next) return;
    event.preventDefault();
    setTemplate(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${themeName} theme preview`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---- responsive CSS injected once ---- */}
      {responsiveCss && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.fq-theme-scope{${responsiveCss}}`,
          }}
        />
      )}

      {/* ---- preview canvas: full-bleed, no frame. Clicks navigate between
          templates in place; actions and submits are blocked. ---- */}
      <div
        className="flex-1 overflow-auto bg-background"
        onClickCapture={(event) =>
          handlePreviewCanvasClick(event, setTemplate)
        }
        onSubmitCapture={handlePreviewCanvasSubmit}
      >
        <div className="mx-auto" style={{ maxWidth: "100%" }}>
          <ThemeSurface tokens={tokens}>
            {/* Wordmark row, as on a live storefront — the blueprint's
                header sections render beneath it. */}
            <StoreHeader
              slug={blueprintKey}
              name={themeName}
              menus={null}
            />
            <WidgetDataProvider
              bundle={previewData.bundle}
              map={previewData.map}
            >
              {/* header slot */}
              {ast.header.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                  contextSlots={accountSlots}
                />
              ))}

              {/* main slot */}
              {ast.main.length > 0 ? (
                ast.main.map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={section}
                    template={template}
                    editing={false}
                    contextSlots={accountSlots}
                    primary={section.id === ast.main[0]?.id}
                  />
                ))
              ) : (
                <div className="grid min-h-[40vh] place-items-center p-8 text-sm text-muted-foreground">
                  No sections authored for this template.
                </div>
              )}

              {/* footer slot */}
              {ast.footer.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                  contextSlots={accountSlots}
                />
              ))}
            </WidgetDataProvider>
          </ThemeSurface>
        </div>
      </div>

    </div>
  );
}
