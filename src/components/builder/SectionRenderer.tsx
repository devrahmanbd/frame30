import { useCallback, useMemo } from "react";
import type {
  Breakpoint,
  Section,
  SectionType,
  TemplateKey,
} from "@/lib/builder-ast";
import {
  catalogEntry,
  isContextMismatch,
  isSkinnableType,
  resolveProps,
  resolveSkin,
  sectionStyle,
} from "@/lib/builder-ast";
import {
  advancedAttrs,
  isEntranceEffect,
  motionEffectOf,
} from "@/lib/builder-advanced";
import { resolveDynamicProps } from "@/lib/dynamic-tags";
import { useDynamicContext } from "./DynamicContext";
import type { Locale } from "@/lib/bitext";
import { useLang } from "@/lib/i18n";
import { abMatches, evaluateVisibility } from "@/lib/visibility";
import { useCartContext } from "./CartContext";
import { useExperiments, useExposure } from "./ExperimentContext";
import { useHydrated } from "./reveal";
import { useReveal } from "./reveal";
import { useMotionFx } from "./motion-fx";
import { widgetReader } from "./widgets";
import { resolveWidgetComponent } from "./theme-widgets";
import {
  resolveThemeOwnedComponent,
  resolveThemePresentation,
} from "@/lib/theme-presentations";
import { isExtensionNode, type ExtensionNode } from "@/lib/builder-ast";
import { resolvePresentation } from "@/lib/widget-presentation";
import { validateInstanceProps } from "@/components/marketplace/WidgetSandbox";
import { PluginBlock } from "./PluginBlock";
import {
  ThemeWidgetPreview,
  type ThemeHostHandler,
  type ThemeIdentity,
} from "../theme-runtime/ThemeRuntime";
import { validateProps } from "@/lib/widget-props";
import { useInstalledPlugins } from "./PluginContext";
import {
  parsePluginWidgetKey,
  type InstalledPlugin,
} from "@/lib/plugin-manifest";
import { getOfficialPlugin, isOfficialPluginKey } from "@/lib/official-plugins";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromStudioCatalog,
  listWidgets as listSingletonWidgets,
  type UnifiedRegistry,
} from "@/lib/unified-widget-registry";
import { useNodeData } from "./WidgetDataContext";
import { WidgetBoundary } from "./WidgetBoundary";
import { WidgetIsland } from "./WidgetIsland";
import { hydrationMode } from "@/lib/widget-hydration";
import { responsiveClassOf } from "@/lib/responsive-css";
import { StoreSlugContext } from "@/lib/store-slug-context";

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
  /**
   * Theme-remediation Task 3: explicit theme key driving per-theme widget
   * resolution (`resolveWidgetComponent`). Null/undefined keeps the legacy
   * unkeyed composition (studio + existing tests), byte-identical. Live
   * storefront hosts pass the merchant theme key; the preview frame passes
   * its blueprint key.
   */
  themeKey?: string | null;
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
  /** Optional base path to prefix root-relative links with (e.g. `/store/foo`) */
  linkBase?: string;
  /**
   * Frame30 extension registry for namespaced `extension` nodes. Absent uses
   * the builtin + studio fallback plus any singleton defs (tests), so legacy
   * non-extension sections never touch it — byte-identical when inactive.
   */
  registry?: UnifiedRegistry;
  /**
   * Frame30 Level B — runtime binding for uploaded-theme widgets. Absent
   * keeps the theme-owned sandbox path fail-closed (explicit placeholder):
   * the binding arrives only with server-projected approval (asset origin,
   * pinned identity, grants), so an unbound render can never execute
   * theme code. Editor and storefront hosts omit this until then.
   */
  devThemeBinding?: DevThemeBinding;
};

/**
 * Server-projected runtime binding for ONE approved Level B release.
 * Every member is validated where it is consumed (`ThemeWidgetPreview`
 * fails closed without a valid immutable URL); the binding itself carries
 * no secrets and no cross-install data.
 */
export type DevThemeBinding = {
  /** Controlled https origin serving version-pinned theme documents. */
  assetOrigin: string;
  /** Pinned approved identity (name + immutable version). */
  theme: ThemeIdentity;
  /** Granted `theme:*` scopes for this install. */
  granted: readonly string[];
  /** Exact https origins the theme may navigate to (empty = paths only). */
  navigateAllowlist?: readonly string[];
  /** Host implementation behind authorized bridge calls. */
  onCall: ThemeHostHandler;
};

/**
 * Frame30 extension presentation for the renderer. Builds the fallback
 * registry (builtin + studio + singleton defs) when the caller supplies
 * none, then resolves via `resolvePresentation`. Never throws; null means
 * the caller keeps the legacy path untouched.
 *
 * `opts.installedPlugins` (the host's server-authorized installs) drives
 * Class A/B attribution for community widgets: passed, a themeable-declared
 * widget resolves `plugin-themeable`; absent, every community widget takes
 * the fail-safe `plugin-isolated` sandbox. Official and builtin outcomes are
 * identical either way, so existing callers stay unchanged.
 */
export function resolveExtensionForRender(
  section: Section,
  themeKey: string | null | undefined,
  injected?: UnifiedRegistry,
  opts?: { installedPlugins?: readonly InstalledPlugin[] },
): ReturnType<typeof resolvePresentation> | null {
  try {
    if (!isExtensionNode(section)) return null;
    const ext = section as unknown as ExtensionNode;
    const widgetKey =
      typeof ext.widgetKey === "string" ? ext.widgetKey.trim() : "";
    if (!widgetKey) return null;
    const props =
      ext.props && typeof ext.props === "object" && !Array.isArray(ext.props)
        ? (ext.props as Record<string, unknown>)
        : {};
    let registry = injected;
    if (!registry || typeof registry.resolveWidget !== "function") {
      const fallback = createWidgetRegistry();
      for (const def of [...fromBuiltinWidgets(), ...fromStudioCatalog()]) {
        try {
          fallback.registerWidget(def);
        } catch {
          // A single bad adapter def never breaks the render.
        }
      }
      try {
        for (const def of listSingletonWidgets()) {
          try {
            fallback.registerWidget(def);
          } catch {
            // Hostile singleton entries are dropped, never stored.
          }
        }
      } catch {
        // Singleton unreadable — builtin/studio fallback still stands.
      }
      registry = fallback;
    }
    const result = resolvePresentation({
      widgetId: ext.version
        ? { ...ext, widgetKey, props }
        : { ...ext, widgetKey, props },
      themeKey: themeKey ?? null,
      registry,
      props,
      ...(typeof ext.version === "string" && ext.version.trim()
        ? { version: ext.version.trim() }
        : {}),
      ...(opts?.installedPlugins
        ? { installedPlugins: opts.installedPlugins }
        : {}),
    });
    // Plugin lanes only (official / isolated / themeable): the extension
    // node's per-instance props are validated against the widget's own
    // schema (hostile/unknown keys stripped, never executed; unserializable
    // values dropped fail-closed) before they reach `PluginBlock`, which
    // re-validates. Native-builtin, theme-owned and missing outcomes return
    // untouched below — byte-identical.
    try {
      if (
        result &&
        result.ok &&
        (result.mode === "official" ||
          result.mode === "plugin-isolated" ||
          result.mode === "plugin-themeable")
      ) {
        const clean = validateInstanceProps(props, result.def.propsSchema);
        if (clean !== result.props) return { ...result, props: clean };
      }
    } catch {
      // Validation never breaks resolution: fall through with the raw result.
    }
    return result;
  } catch {
    return null;
  }
}

/** Builtin `SectionType` for a native-builtin hit, else null. */
export function builtinTypeForPresentation(
  result: ReturnType<typeof resolvePresentation>,
): SectionType | null {
  try {
    if (!result.ok || result.mode !== "native-builtin") return null;
    const id = result.def.id;
    const bare = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    const clean = bare.trim();
    if (!clean || clean.includes(":") || clean.includes("/")) return null;
    return clean as SectionType;
  } catch {
    return null;
  }
}

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
  themeKey,
  primary = false,
  editing = false,
  device,
  locale: localeProp,
  selectedIds,
  onInlineEdit,
  signedIn,
  segments,
  linkBase,
  registry,
  devThemeBinding,
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
  // Frame30 extension lanes: the host's server-authorized installs, read
  // here so Class A/B attribution (isolated vs themeable) matches the
  // PluginBlock decision below. Reading context renders nothing, so the
  // legacy built-in path stays byte-identical.
  const installedPlugins = useInstalledPlugins();
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
  // Hooks run unconditionally in the same order on every render, so the
  // motion inputs are resolved here, above every early return. Rendered
  // output is unchanged — the returns below are untouched.
  const resolved = resolveProps(dynSection, device);
  const fx = motionEffectOf(resolved["advMotion"]);
  const motionFx = useMotionFx(fx, !editing);
  // Both observers share one wrapper node, so both refs attach here. The
  // ref objects are stable, keeping this callback stable too.
  const wrapRef = useCallback(
    (node: HTMLDivElement | null) => {
      (reveal.ref as React.MutableRefObject<HTMLElement | null>).current = node;
      (motionFx.ref as React.MutableRefObject<HTMLElement | null>).current =
        node;
    },
    [reveal.ref, motionFx.ref],
  );

  if (section.invalid) {
    // A bad widget never breaks the page: it is skipped in production and
    // surfaced inline in the editor so the merchant can remove it.
    if (!editing) return null;
    return (
      <div
        role="note"
        className="rounded-fq-md border border-dashed border-danger bg-danger-soft p-4 text-sm"
      >
        Unsupported widget — remove it or reinstall the theme. (
        {section.invalid})
      </div>
    );
  }

  if (gatedOut && !editing) return null;

  const hidden = section.hidden ?? [];
  if (device && hidden.includes(device) && !editing) return null;
  const hideClasses = editing ? "" : hidden.map((b) => HIDE_CLASS[b]).join(" ");
  // Phase 0.4: the universal style layer is applied here, once, so no widget
  // hand-rolls padding, background, radius or reveal.
  const chrome = sectionStyle(resolved);
  // Widget skins (spec 2026-09-25 §3): the resolved skin rides on the chrome
  // wrapper alongside data-fq-node, so theme skin sheets can key on
  // `[data-widget][data-skin]` without any widget knowing about themes. Only
  // skinnable widgets emit the pair; every other node renders exactly as
  // before (no wrapper churn, no DOM change).
  const skin = isSkinnableType(section.type)
    ? resolveSkin(section.type, resolved["skin"])
    : null;
  // Universal Advanced layer: spacing, stacking, custom id/classes and the
  // entrance animation, applied to the same wrapper so a widget never has to
  // know about them.
  const advanced = advancedAttrs(resolved);
  // Theme-motion manifest: a theme requests a named effect via advMotion and
  // the engine executes it here — no renderer fork, no theme import.
  // Entrance effects park behind the shared observer like reveals do.
  const fxParked = fx !== "none" && isEntranceEffect(fx) && !reveal.shown;
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
    advanced.animation !== "none"
      ? `fq-anim fq-anim-${advanced.animation}`
      : "",
    revealMode !== "none" && !reveal.shown ? "fq-reveal-pending" : "",
    fx !== "none" ? `fq-fx fq-fx-${fx}` : "",
    fxParked ? "fq-reveal-pending" : "",
    editing ? "relative" : "",
    selected ? "outline outline-2 outline-primary" : "",
    // Studio only: a conditional section that would be hidden right now is
    // outlined instead of removed, so the merchant can still select it.
    editing && gatedOut
      ? "outline outline-1 outline-dashed outline-warning opacity-70"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasStyle =
    Object.keys(chrome.style).length > 0 ||
    Object.keys(advanced.style).length > 0;
  const wrap = (node: React.ReactNode) =>
    editing || wrapperClass || hasStyle || skin ? (
      <div
        ref={wrapRef}
        className={wrapperClass}
        style={{ ...chrome.style, ...advanced.style } as React.CSSProperties}
        {...(advanced.id ? { id: advanced.id } : {})}
        data-fq-node={section.id}
        {...(skin ? { "data-widget": section.type, "data-skin": skin } : {})}
        {...(fx !== "none" ? { "data-motion-effect": fx } : {})}
        {...(locale === "bn" ? { lang: "bn" } : {})}
        {...(editing ? { "data-node-id": section.id } : {})}
      >
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  const entry = catalogEntry(section.type);
  // Frame30 extension swap-in (beside `resolveThemePresentation`): namespaced
  // `extension` nodes resolve via `resolvePresentation`. Missing and
  // recoverable-fallback outcomes reuse the EXISTING unavailable placeholder
  // below — no new placeholder design. Non-extension sections skip this
  // entirely, so the legacy built-in path stays byte-identical.
  try {
    const isExt = (isExtensionNode as (value: unknown) => boolean)(section);
    if (isExt) {
      const presentation = resolveExtensionForRender(
        section,
        themeKey,
        registry,
        { installedPlugins },
      );
      // A null resolution (bad key, hostile shape) is a miss: placeholder.
      if (!presentation || !presentation.ok) {
        return editing ? (
          <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Widget preview unavailable
          </div>
        ) : null;
      }
      // Recoverable theme-owned fallback preserves data and placeholders.
      if (
        presentation.ok &&
        presentation.mode === "theme-owned" &&
        presentation.presentation === "recoverable-fallback"
      ) {
        return editing ? (
          <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Widget preview unavailable
          </div>
        ) : null;
      }
      // Native-builtin extensions render the SAME builtin component as the
      // legacy path, via a tail recursion over an adapted section. Every
      // other ok mode continues into its renderer lane below — fail-closed,
      // never another owner's component.
      if (presentation.ok && presentation.mode === "native-builtin") {
        const builtinType = builtinTypeForPresentation(presentation);
        if (builtinType) {
          const adapted = {
            ...(section as unknown as Record<string, unknown>),
            type: builtinType,
            props: { ...presentation.props },
          } as unknown as Section;
          return (
            <SectionRenderer
              section={adapted}
              productSlot={productSlot}
              collectionSlot={collectionSlot}
              contextSlots={contextSlots}
              template={template}
              storeSlug={storeSlug}
              themeKey={themeKey}
              primary={primary}
              editing={editing}
              device={device}
              locale={locale}
              selectedIds={selectedIds}
              onInlineEdit={onInlineEdit}
              signedIn={signedIn}
              segments={segments}
              linkBase={linkBase}
              registry={registry}
              devThemeBinding={devThemeBinding}
            />
          );
        }
        return editing ? (
          <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Widget preview unavailable
          </div>
        ) : null;
      }
      // Frame30 plugin lanes (official / isolated / themeable): the ONE
      // sandboxed plugin frame (`PluginBlock` — null-origin island, never
      // page DOM; bundle bytes are never inlined into this document). The
      // official lane additionally requires a trusted in-repo source behind
      // the plugin id; Class B dressing (theme presentation vs island) is
      // decided inside `PluginBlock` from the installed manifest plus the
      // registered presentations, so the bundle never executes on the
      // dressed path either.
      if (
        presentation.ok &&
        (presentation.mode === "official" ||
          presentation.mode === "plugin-isolated" ||
          presentation.mode === "plugin-themeable")
      ) {
        if (presentation.mode === "official") {
          const parsed = parsePluginWidgetKey(presentation.widgetId);
          const sourceId = parsed ? parsed.pluginId : "";
          if (
            !sourceId ||
            !isOfficialPluginKey(sourceId) ||
            !getOfficialPlugin(sourceId)
          ) {
            return editing ? (
              <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Widget preview unavailable
              </div>
            ) : null;
          }
        }
        // Legacy `plugin_block` height contract (clamped 80–1200, 320
        // default), read off the resolved props — never trusted blindly.
        const rawHeight = presentation.props["height"];
        const height =
          typeof rawHeight === "number" && Number.isFinite(rawHeight)
            ? Math.min(1200, Math.max(80, Math.trunc(rawHeight)))
            : 320;
        return wrap(
          <WidgetBoundary type={section.type} editing={editing}>
            <PluginBlock
              pluginKey={presentation.widgetId}
              height={height}
              editing={editing}
              themeKey={themeKey ?? null}
              instanceProps={presentation.props}
            />
          </WidgetBoundary>,
        );
      }
      // Theme-owned owner-definition: the owning theme ships a native
      // trusted-source component (approved in-repo theme source, same
      // process as builtins — no sandbox). A registered hit renders
      // through the same boundary + chrome wrap as every native lane.
      // Recoverable fallbacks (foreign theme, or an owner-definition with
      // no approved component yet) keep the explicit placeholder below —
      // fail-closed, never another owner's component.
      if (
        presentation.ok &&
        presentation.mode === "theme-owned" &&
        presentation.presentation === "owner-definition"
      ) {
        const Owned = resolveThemeOwnedComponent(presentation.widgetId);
        if (Owned) {
          // Extension nodes are leaves, but a hand-built section may still
          // carry children: recurse with the legacy child prop list so
          // nested output stays identical to the non-extension path.
          const renderOwnedChildren = () =>
            (section.children ?? []).map((child) => (
              <SectionRenderer
                key={child.id}
                section={child}
                productSlot={productSlot}
                collectionSlot={collectionSlot}
                contextSlots={contextSlots}
                template={template}
                storeSlug={storeSlug}
                themeKey={themeKey}
                editing={editing}
                device={device}
                locale={locale}
                selectedIds={selectedIds}
                onInlineEdit={onInlineEdit}
                linkBase={linkBase}
                registry={registry}
                devThemeBinding={devThemeBinding}
              />
            ));
          return wrap(
            <WidgetBoundary type={section.type} editing={editing}>
              <Owned
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
                data={nodeData}
                productSlot={productSlot}
                collectionSlot={collectionSlot}
                link={(href: string) => {
                  if (
                    !href ||
                    href.startsWith("http") ||
                    href.startsWith("mailto:") ||
                    href.startsWith("tel:") ||
                    href === "#"
                  )
                    return href;
                  const h = href.startsWith("/") ? href : `/${href}`;
                  return linkBase ? `${linkBase}${h}` : h;
                }}
                renderChildren={renderOwnedChildren}
                {...(onInlineEdit
                  ? {
                      inlineEdit: (key: string, value: string) =>
                        onInlineEdit(section.id, key, value),
                    }
                  : {})}
              />
            </WidgetBoundary>,
          );
        }
        // Level B uploaded-theme widget: no native in-repo component, but a
        // `theme:<id>/...` def with `renderer: "custom"` in the injected
        // registry (inert `themeId`/`themeComponent` name tokens survive the
        // registry allow-list) and a server-projected runtime binding whose
        // pinned identity AND version match the def. Ownership was already
        // gated by the presentation (`owner-definition` resolves only under
        // the owning theme), so no theme-identity comparison happens here —
        // shared code never branches on theme names (see the
        // theme-independence pin). Renders ONLY through the sandboxed
        // `ThemeWidgetPreview` (opaque origin, allow-scripts, pinned URL)
        // with schema-validated instance props — never page-DOM execution.
        // Unbound (no approval projected) falls through to the explicit
        // placeholder below — fail-closed.
        if (devThemeBinding) {
          try {
            const def = registry?.getWidget?.(presentation.widgetId);
            const component =
              typeof def?.themeComponent === "string"
                ? def.themeComponent.trim()
                : "";
            const defThemeId =
              typeof def?.themeId === "string" ? def.themeId : "";
            const bindingTheme = devThemeBinding.theme;
            if (
              def &&
              def.namespace === "theme" &&
              def.renderer === "custom" &&
              component &&
              defThemeId &&
              bindingTheme &&
              typeof bindingTheme.name === "string" &&
              typeof bindingTheme.version === "string" &&
              defThemeId === bindingTheme.name &&
              def.version === bindingTheme.version
            ) {
              const clean = validateProps(
                def.propsSchema,
                (presentation.props ?? {}) as Record<string, unknown>,
              ).clean;
              return wrap(
                <WidgetBoundary type={section.type} editing={editing}>
                  <ThemeWidgetPreview
                    assetOrigin={devThemeBinding.assetOrigin}
                    theme={bindingTheme}
                    widgetId={presentation.widgetId}
                    component={component}
                    instanceProps={clean}
                    granted={devThemeBinding.granted}
                    navigateAllowlist={devThemeBinding.navigateAllowlist ?? []}
                    onCall={devThemeBinding.onCall}
                  />
                </WidgetBoundary>,
              );
            }
          } catch {
            // A hostile def shape must never break the render: placeholder.
          }
        }
      }
      // Recoverable theme-owned outcome (foreign-theme fallback, missing
      // owner-definition component, or an unregistered id): the EXISTING
      // unavailable placeholder — no new design, data preserved, never
      // another owner's component.
      return editing ? (
        <div className="rounded-fq-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Widget preview unavailable
        </div>
      ) : null;
    }
  } catch {
    // Presentation never breaks the legacy path: fall through below.
  }
  // Per-widget theme presentations (REGISTRY CORE): a registered
  // themeKey × widgetType presentation wins; unregistered pairs fall back
  // to the existing theme-keyed resolution — byte-identical behavior.
  const Widget = resolveThemePresentation(
    themeKey,
    section.type,
    resolveWidgetComponent(themeKey, section.type),
  );
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
          {entry.label} — available on {entry.templates.join(", ")} templates
          only.
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
        themeKey={themeKey}
        editing={editing}
        device={device}
        locale={locale}
        selectedIds={selectedIds}
        onInlineEdit={onInlineEdit}
        linkBase={linkBase}
        // Nested extensions resolve against the same route registry;
        // legacy children ignore it (non-extension sections never touch it).
        registry={registry}
        devThemeBinding={devThemeBinding}
      />
    ));

  // Phase 8: containers and context widgets always hydrate — their children's
  // own islands live inside them. Leaves follow the registry policy.
  const island: "eager" | ReturnType<typeof hydrationMode> =
    editing || (section.children?.length ?? 0) > 0 || entry.templates
      ? "eager"
      : hydrationMode(section.type);

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
        link={(href: string) => {
          if (
            !href ||
            href.startsWith("http") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href === "#"
          )
            return href;
          const h = href.startsWith("/") ? href : `/${href}`;
          return linkBase ? `${linkBase}${h}` : h;
        }}

        renderChildren={renderChildren}
        {...(onInlineEdit
          ? {
              inlineEdit: (key: string, value: string) =>
                onInlineEdit(section.id, key, value),
            }
          : {})}
      />
    </WidgetBoundary>
  );

  return (
    // Phase1-T1: the tenant slug rides React context so deep card trees
    // (wishlist heart, Quick View) can read it without prop drilling.
    <StoreSlugContext.Provider value={storeSlug ?? null}>
      {wrap(
        island === "eager" ? (
          widget
        ) : (
          <WidgetIsland mode={island} type={section.type}>
            {widget}
          </WidgetIsland>
        ),
      )}
    </StoreSlugContext.Provider>
  );
}
