import { useMemo } from "react";
import type { Breakpoint, Section, SectionType, TemplateKey } from "@/lib/builder-ast";
import { catalogEntry, isContextMismatch, resolveProps, sectionStyle } from "@/lib/builder-ast";
import { advancedAttrs } from "@/lib/builder-advanced";
import { resolveDynamicProps } from "@/lib/dynamic-tags";
import { useDynamicContext } from "./DynamicContext";
import type { Locale } from "@/lib/bitext";
import { useLang } from "@/lib/i18n";
import { abMatches, evaluateVisibility } from "@/lib/visibility";
import { useCartContext } from "./CartContext";
import { useExperiments, useExposure } from "./ExperimentContext";
import { useHydrated } from "./reveal";
import { useReveal } from "./reveal";
import { WIDGET_COMPONENTS, widgetReader } from "./widgets";
import { useNodeData } from "./WidgetDataContext";
import { WidgetBoundary } from "./WidgetBoundary";
import { WidgetIsland } from "./WidgetIsland";
import { hydrationMode } from "@/lib/widget-hydration";
import { responsiveClassOf } from "@/lib/responsive-css";

type Props = {
  section: Section;
  /** Rendered in place of a product_grid section by the host surface. */
  productSlot?: React.ReactNode;
  /** Rendered in place of a collection_grid section by the host surface. */
  collectionSlot?: React.ReactNode;
  /**
   * Live data for context-aware widgets, supplied by the template host. A
   * missing slot renders a labelled placeholder instead of crashing.
   */
  contextSlots?: Partial<Record<SectionType, React.ReactNode>>;
  /** Template being rendered — drives context-widget resolution. */
  template?: TemplateKey;
  /**
   * Store slug this render belongs to. Namespaces the cross-section channel
   * and is the slug the bundle/total contract quotes against.
   */
  storeSlug?: string;
  /** The page's primary heading. Exactly one section per page may claim it. */
  primary?: boolean;
  /** Editor preview only: shows placeholders and hidden widgets. */
  editing?: boolean;
  /** Active breakpoint when previewing responsive visibility. */
  device?: Breakpoint;
  /**
   * Language this render targets. Drives bilingual props and numerals. The
   * studio passes it per preview frame; the storefront inherits the visitor's
   * language from the i18n provider.
   */
  locale?: Locale;
  /** Editor only: ids the studio currently has selected (outlines the node). */
  selectedIds?: string[];
  /** Editor only: commits inline canvas text edits. */
  onInlineEdit?: (nodeId: string, key: string, value: string) => void;
  /** Phase 3.2: shopper auth state for conditional visibility rules. */
  signedIn?: boolean;
  /** Phase 3.2: segments the visitor belongs to (conditional visibility). */
  segments?: string[];
};

/**
 * Phase 5: visibility ranges match `LAYER_RANGE` exactly — mobile is < 768,
 * tablet is 768–1279, desktop is >= 1280. They used to be authored against
 * Tailwind's `sm`/`lg` defaults, which meant a node "hidden on tablet" stayed
 * visible between 640 and 768px.
 */
const HIDE_CLASS: Record<Breakpoint, string> = {
  mobile: "max-md:hidden",
  tablet: "max-xl:md:hidden",
  desktop: "xl:hidden",
};

/**
 * Chrome around every widget: invalid nodes, responsive visibility, context
 * resolution, and child recursion. The widget itself comes from the closed
 * registry in `./widgets`, so this component never grows a per-widget branch.
 */
export function SectionRenderer({
  section,
  productSlot,
  collectionSlot,
  contextSlots,
  template,
  storeSlug,
  primary = false,
  editing = false,
  device,
  locale: localeProp,
  selectedIds,
  onInlineEdit,
  signedIn,
  segments,
}: Props) {
  const { lang } = useLang();
  const dynamic = useDynamicContext(editing);
  const locale: Locale = localeProp ?? lang;
  // Dynamic tags are substituted before anything reads the node, so a widget
  // only ever sees finished copy — never `{{product.title}}`.
  const dynSection = useMemo(() => {
    const props = resolveDynamicProps(section.props, dynamic);
    return props === section.props ? section : { ...section, props };
  }, [section, dynamic]);
  const { str, bool, int, money } = widgetReader(dynSection, device, locale);
  // Rows for this node come from the page's single batched data call; the
  // widget itself never fetches.
  const nodeData = useNodeData(section.id);
  // Phase 1.4: a reveal only animates once the node is actually on screen, and
  // never when the visitor asked for reduced motion.
  const revealMode = String(resolveProps(section, device)["reveal"] ?? "none");
  const reveal = useReveal(revealMode !== "none" && !editing);

  // Phase 3.2: conditional visibility + A/B slot. Visitor-dependent rules only
  // resolve after hydration, so SSR never renders a state the client disagrees
  // with. The studio always renders (with a badge) so nothing disappears while
  // the merchant is editing it.
  const hydrated = useHydrated();
  const cart = useCartContext();
  const { assignments } = useExperiments();
  const gate = evaluateVisibility(section.when, {
    signedIn: hydrated ? (signedIn ?? false) : null,
    cartCount: hydrated ? cart.count : null,
    cartTotalMinor: hydrated ? (cart.totals?.totalMinor ?? 0) : null,
    locale,
    now: Date.now(),
    segments: hydrated ? (segments ?? []) : null,
  });
  const abOk = abMatches(section.ab, assignments);
  const conditional = !!section.when?.length || !!section.ab;
  const gatedOut = conditional && (!gate.visible || !abOk);
  useExposure(section.ab, section.id, !editing && abOk && gate.visible);

  if (section.invalid) {
    // A bad widget never breaks the page: it is skipped in production and
    // surfaced inline in the editor so the merchant can remove it.
    if (!editing) return null;
    return (
      <div
        role="note"
        className="rounded-fq-md border border-dashed border-danger bg-danger-soft p-4 text-sm"
      >
        Unsupported widget — remove it or reinstall the theme. ({section.invalid})
      </div>
    );
  }

  if (gatedOut && !editing) return null;

  const hidden = section.hidden ?? [];
  if (device && hidden.includes(device) && !editing) return null;
  const hideClasses = editing ? "" : hidden.map((b) => HIDE_CLASS[b]).join(" ");
  // Phase 0.4: the universal style layer is applied here, once, so no widget
  // hand-rolls padding, background, radius or reveal.
  const resolved = resolveProps(dynSection, device);
  const chrome = sectionStyle(resolved);
  // Universal Advanced layer: spacing, stacking, custom id/classes and the
  // entrance animation, applied to the same wrapper so a widget never has to
  // know about them.
  const advanced = advancedAttrs(resolved);
  // In the studio every node carries a handle so a click anywhere on the
  // canvas can select the deepest widget under the pointer, Webflow-style.
  const selected = editing && !!selectedIds?.includes(section.id);
  // Phase 5: per-device layout overrides are compiled into a range-scoped
  // stylesheet by the template host; the node only carries the shared class.
  // Nodes without overrides get no class at all, so the common case is free.
  const responsiveClass = editing ? null : responsiveClassOf(section);
  const wrapperClass = [
    // Phase 6: every node is a query container, so widgets respond to their
    // own width instead of the viewport.
    "fq-node",
    responsiveClass ?? "",
    hideClasses,
    chrome.className,
    advanced.className,
    advanced.animation !== "none" ? `fq-anim fq-anim-${advanced.animation}` : "",
    revealMode !== "none" && !reveal.shown ? "fq-reveal-pending" : "",
    editing ? "relative" : "",
    selected ? "outline outline-2 outline-primary" : "",
    // Studio only: a conditional section that would be hidden right now is
    // outlined instead of removed, so the merchant can still select it.
    editing && gatedOut ? "outline outline-1 outline-dashed outline-warning opacity-70" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasStyle = Object.keys(chrome.style).length > 0 || Object.keys(advanced.style).length > 0;
  const wrap = (node: React.ReactNode) =>
    editing || wrapperClass || hasStyle ? (
      <div
        ref={reveal.ref as React.Ref<HTMLDivElement>}
        className={wrapperClass}
        style={{ ...chrome.style, ...advanced.style } as React.CSSProperties}
        {...(advanced.id ? { id: advanced.id } : {})}
        data-fq-node={section.id}
        {...(locale === "bn" ? { lang: "bn" } : {})}
        {...(editing ? { "data-node-id": section.id } : {})}
      >
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  const entry = catalogEntry(section.type);
  const Widget = WIDGET_COMPONENTS[section.type];
  if (!entry || !Widget) {
    return editing ? (
      <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Widget preview unavailable
      </div>
    ) : null;
  }

  let slot: React.ReactNode;
  if (entry.templates) {
    // Context widget: only the templates that own the data render it live.
    if (isContextMismatch(section.type, template)) {
      if (!editing) return null;
      return (
        <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {entry.label} — available on {entry.templates.join(", ")} templates only.
        </div>
      );
    }
    slot = contextSlots?.[section.type];
    if (slot === undefined) {
      if (!editing) return null;
      return (
        <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {entry.label} — live data appears on the storefront.
        </div>
      );
    }
  }

  const renderChildren = () =>
    (section.children ?? []).map((child) => (
      <SectionRenderer
        key={child.id}
        section={child}
        productSlot={productSlot}
        collectionSlot={collectionSlot}
        contextSlots={contextSlots}
        template={template}
        storeSlug={storeSlug}
        editing={editing}
        device={device}
        locale={locale}
        selectedIds={selectedIds}
        onInlineEdit={onInlineEdit}
      />
    ));

  // Phase 8: containers and context widgets always hydrate — their children's
  // own islands live inside them. Leaves follow the registry policy.
  const island: "eager" | ReturnType<typeof hydrationMode> =
    editing || (section.children?.length ?? 0) > 0 || entry.templates ? "eager" : hydrationMode(section.type);

  const widget = (
    <WidgetBoundary type={section.type} editing={editing}>
      <Widget
        section={section}
        str={str}
        bool={bool}
        int={int}
        money={money}
        locale={locale}
        Heading={primary ? "h1" : "h2"}
        primary={primary}
        editing={editing}
        device={device}
        template={template}
        storeSlug={storeSlug}
        slot={slot}
        data={nodeData}
        productSlot={productSlot}
        collectionSlot={collectionSlot}

        renderChildren={renderChildren}
        {...(onInlineEdit
          ? { inlineEdit: (key: string, value: string) => onInlineEdit(section.id, key, value) }
          : {})}
      />
    </WidgetBoundary>
  );

  return wrap(island === "eager" ? widget : <WidgetIsland mode={island} type={section.type}>{widget}</WidgetIsland>);
}
