/**
 * Phase 6 — the composed publish gate.
 *
 * The a11y / perf / vitals scripts existed as npm scripts nothing blocked on.
 * This module is the in-product half of that story: the checks that can be
 * decided from the theme itself (parse, lint, বাংলা coverage, contrast in every
 * scheme × locale, skeleton parity) run on the publish path, and the checks
 * that need a browser (`scripts/a11y-gate.mjs`, `scripts/perf-budget.mjs`,
 * `scripts/vitals-gate.mjs`) are declared here so CI and the app describe the
 * same release gate instead of two drifting lists.
 *
 * Pure data + pure functions: no DB, no browser, so tests assert on it directly.
 */
import {
  DEFAULT_DARK_TOKENS,
  contrastRatio,
  inkOn,
  type DarkTokens,
  type ThemeTokens,
} from "./builder-ast";
import { LIGHTHOUSE_BUDGET, VITALS_BUDGET } from "./web-vitals";
import { WIDGET_REGISTRY, WIDGET_TYPES } from "./widget-registry";
import { skeletonSpec } from "./widget-skeletons";
import { perfGate, type PerfGateReport } from "./widget-weight";
import { responsiveGate, type ResponsiveGateReport } from "./responsive-lint";
import {
  auditMotionPage,
  type MotionPageMeasurement,
} from "./motion-choreography";
import { motionEffectOf } from "./builder-advanced";
import type {
  Section,
  SectionType,
  TemplateKey,
  ThemeAst,
} from "./builder-ast";

/** WCAG floors. Body copy is AA text; a control's own edge is a UI component. */
export const CONTRAST_FLOOR = { text: 4.5, ui: 3 } as const;

export type ColourScheme = "light" | "dark";
export type GateLocale = "en" | "bn";

/** Every combination the a11y gate sweeps — kept identical to the CI script. */
export const GATE_MATRIX: { scheme: ColourScheme; locale: GateLocale }[] = [
  { scheme: "light", locale: "en" },
  { scheme: "dark", locale: "en" },
  { scheme: "light", locale: "bn" },
  { scheme: "dark", locale: "bn" },
];

export type GateFailure = {
  /** Stable machine code — CI prints these, tests assert on them. */
  code: string;
  message: string;
};

/**
 * The dark set a theme actually renders with: its designed one, or the
 * platform default when the theme is light-only. Publishing is gated on the
 * rendered set, not on whether the merchant declared one.
 */
export function effectiveDark(tokens: ThemeTokens): DarkTokens {
  return tokens.dark ?? DEFAULT_DARK_TOKENS;
}

type Pair = {
  label: string;
  fg: string;
  bg: string;
  floor: number;
  blocking: boolean;
};

function pairsFor(set: {
  brand: string;
  accent: string;
  surface: string;
  ink: string;
}): Pair[] {
  return [
    {
      label: "body copy",
      fg: set.ink,
      bg: set.surface,
      floor: CONTRAST_FLOOR.text,
      blocking: true,
    },
    {
      label: "brand button label",
      fg: inkOn(set.brand, set.ink),
      bg: set.brand,
      floor: CONTRAST_FLOOR.text,
      blocking: true,
    },
    {
      label: "accent button label",
      fg: inkOn(set.accent, set.ink),
      bg: set.accent,
      floor: CONTRAST_FLOOR.text,
      blocking: true,
    },
    // Non-text brand chrome: reported so a merchant sees the number, advisory so a
    // legitimate brand hue is not a publish blocker.
    {
      label: "brand edge on surface",
      fg: set.brand,
      bg: set.surface,
      floor: CONTRAST_FLOOR.ui,
      blocking: false,
    },
    {
      label: "accent edge on surface",
      fg: set.accent,
      bg: set.surface,
      floor: CONTRAST_FLOOR.ui,
      blocking: false,
    },
  ];
}

export type ContrastRow = {
  scheme: ColourScheme;
  label: string;
  ratio: number;
  floor: number;
  ok: boolean;
  /** Text pairs block publishing; non-text chrome is advisory. */
  blocking: boolean;
};

/** Every ink/surface/accent pair, light and dark, with its measured ratio. */
export function contrastReport(tokens: ThemeTokens): ContrastRow[] {
  const sets: [
    ColourScheme,
    { brand: string; accent: string; surface: string; ink: string },
  ][] = [
    ["light", tokens],
    ["dark", effectiveDark(tokens)],
  ];
  return sets.flatMap(([scheme, set]) =>
    pairsFor(set).map((pair) => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      return {
        scheme,
        label: pair.label,
        ratio,
        floor: pair.floor,
        ok: ratio >= pair.floor,
        blocking: pair.blocking,
      };
    }),
  );
}

/**
 * Contrast gate. Colour is locale-independent, but the matrix is reported per
 * locale anyway because that is what the browser gate sweeps and a merchant
 * reading a failure needs to recognise the surface it came from.
 */
export function contrastGate(tokens: ThemeTokens): GateFailure[] {
  return contrastReport(tokens)
    .filter((row) => !row.ok && row.blocking)
    .map((row) => ({
      code: `contrast.${row.scheme}`,
      message: `contrast: ${row.label} is ${row.ratio.toFixed(2)}:1 in ${row.scheme} mode — needs ${row.floor}:1.`,
    }));
}

/**
 * Zero-CLS skeleton parity: a data widget that reserves a box must reserve a
 * box with a known aspect, or the loaded image resizes it and the page shifts.
 */
export const RESERVED_RATIOS = [
  "aspect-[3/4]",
  "aspect-[4/5]",
  "aspect-square",
  "aspect-video",
] as const;

export function skeletonParityGate(
  types: SectionType[] = WIDGET_TYPES,
): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const type of types) {
    const meta = WIDGET_REGISTRY[type];
    if (!meta?.skeleton) continue;
    const spec = skeletonSpec(type);
    if (!spec) {
      failures.push({
        code: "skeleton.missing",
        message: `skeleton: ${type} reserves no box while its rows are in flight.`,
      });
      continue;
    }
    if (spec.count < 1) {
      failures.push({
        code: "skeleton.count",
        message: `skeleton: ${type} draws ${spec.count} placeholder units.`,
      });
    }
    if ((spec.kind === "cards" || spec.kind === "media") && !spec.ratio) {
      failures.push({
        code: "skeleton.ratio",
        message: `skeleton: ${type} reserves media with no aspect ratio — the image will shift the page.`,
      });
    }
    if (
      spec.ratio &&
      !(RESERVED_RATIOS as readonly string[]).includes(spec.ratio)
    ) {
      failures.push({
        code: "skeleton.ratio_unknown",
        message: `skeleton: ${type} reserves "${spec.ratio}", which is not a platform ratio.`,
      });
    }
  }
  return failures;
}

/**
 * Phase 1A — trust gates: blocking a11y + reduced-motion publish gates.
 *
 * Two theme-side rules graduate from advisory to blocking here, decided from
 * the AST alone so they run on the publish path with no browser:
 *
 *  - every interactive element is reachable and named (`interactiveGate`);
 *  - status is never carried by colour alone (`statusGate`).
 *
 * And one browser-side rule gets wired in (`reducedMotionGate`): the
 * reduced-motion verdicts from `motion-choreography.ts` (no running animation
 * under reduced intent, counters at their final value) fail the publish when
 * the caller supplies reduced-intent measurements — typically the CI motion
 * sweep's output. Full-intent pages are never assessed here; that auditor
 * owns that pass.
 *
 * All three report `GateFailure` with stable machine codes and land in the
 * `failures` (blocking) list of `composePublishGate`, never in `warnings`.
 */

/** Every node in the tree, so container children count as first-class. */
function flattenSections(ast: ThemeAst): Section[] {
  const out: Section[] = [];
  const walk = (nodes: Section[]): void => {
    for (const node of nodes) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk([...ast.header, ...ast.main, ...ast.footer]);
  return out;
}

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Label/target pairs: when the target is authored, the label is the control's
 * accessible name, so an empty label is an unnamed control. `split_feature`
 * spells its links `ctaUrl`/`ctaUrl2`; everything else uses `*Href`.
 */
const LABEL_HREF_PAIRS: [label: string, href: string][] = [
  ["ctaLabel", "ctaHref"],
  ["ctaLabel", "ctaUrl"],
  ["ctaLabel2", "ctaUrl2"],
  ["label", "href"],
  ["buttonLabel", "buttonHref"],
  ["linkLabel", "linkHref"],
  ["askLabel", "askHref"],
  ["l1Label", "l1Href"],
  ["l2Label", "l2Href"],
  ["l3Label", "l3Href"],
  ["b1Name", "b1Href"],
  ["b2Name", "b2Href"],
  ["b3Name", "b3Href"],
  ["b4Name", "b4Href"],
  ["b5Name", "b5Href"],
  ["d1Label", "d1Href"],
  ["d2Label", "d2Href"],
  ["d3Label", "d3Href"],
  ["d4Label", "d4Href"],
  ["c1Title", "c1Href"],
  ["c2Title", "c2Href"],
  ["c3Title", "c3Href"],
  ["c4Title", "c4Href"],
  ["c5Title", "c5Href"],
];

/** Type-scoped pairs for link keys that do not end in `Href`. */
const TYPE_LINK_PAIRS: Record<string, [label: string, href: string][]> = {
  // The verification link is a `url` field named `source`; `product_rail`
  // reuses the key for a non-URL select, so this pair must stay type-scoped.
  authenticity_badge: [["label", "source"]],
};

/**
 * Controls that always render (submit buttons, inputs, toggles): unnamed even
 * with no target. `button` renders a real `<button>`; an empty label is an
 * empty control, not an absent one.
 */
const REQUIRED_LABELS: Record<string, string[]> = {
  newsletter: ["buttonLabel"],
  form: ["nameLabel", "emailLabel", "messageLabel", "buttonLabel"],
  search_command: ["placeholder", "buttonLabel"],
  back_in_stock: ["buttonLabel"],
  bundle_offer: ["buttonLabel"],
  bundle_builder: ["buttonLabel"],
  combo_card: ["buttonLabel"],
  complete_the_look: ["buttonLabel"],
  buy_box: ["label"],
  add_to_cart: ["label"],
  sticky_buy_bar: ["label"],
  wishlist_button: ["addLabel", "savedLabel"],
  quick_view: ["buttonLabel"],
  account_cart: ["accountLabel", "cartLabel"],
  quiz: ["resultLabel"],
  button: ["label"],
};

/**
 * Labels required only while their control is switched on. A coupon button
 * with no label blocks publish when the coupon field is shown; when the
 * field is hidden the label is dead copy, not an unnamed control.
 */
const CONDITIONAL_LABELS: {
  type: string;
  key: string;
  unless: { key: string; is: unknown };
}[] = [
  { type: "form", key: "phoneLabel", unless: { key: "showPhone", is: false } },
  { type: "cart_summary", key: "ctaLabel", unless: { key: "showCta", is: false } },
  {
    type: "cart_summary",
    key: "couponApplyLabel",
    unless: { key: "showCoupon", is: false },
  },
];

/** Prop keys that count as naming text for the generic link fallback. */
const NAMING_KEY =
  /(label|name|title|text|heading|message|note|prefix|suffix|caption|alt|aria-label)$/i;
const NAMING_EXACT = new Set(["m1", "m2", "m3", "text"]);

/**
 * Types excluded from unnamed-link checks. `logo` ships a `href: "/"`
 * default with empty text/image/alt (placeholder state), and `image` links
 * are already covered by the blocking alt-text lint — flagging either here
 * would turn defaults into publish blockers. Logo naming belongs to the
 * image-alt lint family, not this gate.
 */
const UNNAMED_FALLBACK_EXEMPT = new Set(["logo", "image"]);

/**
 * Widgets whose controls always render, for the unreachable check: a node of
 * one of these types hidden on every breakpoint removes working controls from
 * the tab order, not just copy.
 */
const ALWAYS_INTERACTIVE = new Set([
  "form",
  "newsletter",
  "search_command",
  "quiz",
  "nav_menu",
  "account_cart",
  "variant_picker",
  "filter_chips",
  "facet_sidebar",
  "pagination",
  "size_selector",
  "wishlist_button",
  "back_in_stock",
  "add_to_cart",
  "buy_box",
  "bundle_offer",
  "bundle_builder",
  "combo_card",
  "complete_the_look",
  "quick_view",
  "button",
  "tabs",
  "accordion",
  "faq",
  "product_qna",
  "consult_cta",
  "gift_builder",
  "sample_picker",
  "emi_calculator",
  "shade_finder",
  "skin_quiz",
]);

const ALL_BREAKPOINTS = ["mobile", "tablet", "desktop"] as const;

function hasLinkTarget(section: Section): boolean {
  const props = section.props as Record<string, unknown>;
  for (const key of Object.keys(props)) {
    if (/href$/i.test(key) && textOf(props[key])) return true;
  }
  if (
    section.type === "authenticity_badge" &&
    textOf(props["source"])
  )
    return true;
  return false;
}

/**
 * C1, first half: every interactive element is reachable and named.
 *
 *  - `a11y.interactive.unnamed` — a rendered link/button/input whose
 *    accessible name is empty: a target with no label, an always-rendered
 *    control with no label, or a menu/slide row linking nowhere-nameable.
 *  - `a11y.interactive.unreachable` — an interactive node hidden on every
 *    breakpoint: its controls leave the tab order entirely.
 *
 * Base props only; per-breakpoint label overrides stay presentation-only and
 * `invalid` nodes are already errors elsewhere, so both are out of scope.
 */
export function interactiveGate(ast: ThemeAst): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const section of flattenSections(ast)) {
    if (section.invalid) continue;
    const props = section.props as Record<string, unknown>;
    const at = `${section.type} (${section.id})`;

    for (const [labelKey, hrefKey] of [
      ...LABEL_HREF_PAIRS,
      ...(TYPE_LINK_PAIRS[section.type] ?? []),
    ]) {
      // Placeholder-state types are exempt (see UNNAMED_FALLBACK_EXEMPT).
      if (
        UNNAMED_FALLBACK_EXEMPT.has(section.type) &&
        labelKey === "label" &&
        hrefKey === "href"
      )
        continue;
      if (textOf(props[hrefKey]) && !textOf(props[labelKey])) {
        failures.push({
          code: "a11y.interactive.unnamed",
          message: `a11y: ${at} links to "${textOf(props[hrefKey])}" with no ${labelKey} — a screen reader announces an unnamed link.`,
        });
      }
    }

    // Repeater rows that carry links: menu items and hero slides.
    const rows = props["items"];
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (typeof row !== "object" || row === null) continue;
        const cell = (key: string) =>
          textOf((row as Record<string, unknown>)[key]);
        for (const [labelKey, hrefKey] of [
          ["label", "href"],
          ["ctaLabel", "ctaHref"],
        ] as const) {
          if (cell(hrefKey) && !cell(labelKey)) {
            failures.push({
              code: "a11y.interactive.unnamed",
              message: `a11y: ${at} has a row linking to "${cell(hrefKey)}" with no ${labelKey} — a screen reader announces an unnamed link.`,
            });
          }
        }
      }
    }

    // Generic fallback for link keys outside the pair table: a target with
    // no naming text anywhere on the node.
    if (!UNNAMED_FALLBACK_EXEMPT.has(section.type)) {
      const hrefKeys = Object.keys(props).filter(
        (key) =>
          /href$/i.test(key) &&
          !LABEL_HREF_PAIRS.some(([, href]) => href === key) &&
          textOf(props[key]),
      );
      if (hrefKeys.length > 0) {
        const named = Object.entries(props).some(
          ([key, value]) =>
            (NAMING_KEY.test(key) || NAMING_EXACT.has(key)) &&
            textOf(value),
        );
        if (!named) {
          failures.push({
            code: "a11y.interactive.unnamed",
            message: `a11y: ${at} links to "${textOf(props[hrefKeys[0]])}" with no accessible name on the node.`,
          });
        }
      }
    }

    for (const key of REQUIRED_LABELS[section.type] ?? []) {
      if (!textOf(props[key])) {
        failures.push({
          code: "a11y.interactive.unnamed",
          message: `a11y: ${at} renders a control with no ${key} — the control has no accessible name.`,
        });
      }
    }
    for (const rule of CONDITIONAL_LABELS) {
      if (rule.type !== section.type) continue;
      if (props[rule.unless.key] === rule.unless.is) continue;
      if (!textOf(props[rule.key])) {
        failures.push({
          code: "a11y.interactive.unnamed",
          message: `a11y: ${at} renders a control with no ${rule.key} — the control has no accessible name.`,
        });
      }
    }

    const hiddenEverywhere =
      Array.isArray(section.hidden) &&
      ALL_BREAKPOINTS.every((bp) =>
        (section.hidden as string[]).includes(bp),
      );
    if (
      hiddenEverywhere &&
      (hasLinkTarget(section) || ALWAYS_INTERACTIVE.has(section.type))
    ) {
      failures.push({
        code: "a11y.interactive.unreachable",
        message: `a11y: ${at} is hidden on every breakpoint but carries interactive controls — nothing on it can be reached by keyboard.`,
      });
    }
  }
  return failures;
}

/**
 * C1, second half: status is never carried by colour alone.
 *
 * Each rule pairs a status signal with the text that must accompany it: a
 * toned banner with no message, progress stages with no stage names, a chart
 * with no text alternative, a progress bar with no copy, a claim source with
 * no claim, a verified badge with no label. In every case the sighted visitor
 * gets the state from colour/position while assistive tech gets silence.
 */
export function statusGate(ast: ThemeAst): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const section of flattenSections(ast)) {
    if (section.invalid) continue;
    const props = section.props as Record<string, unknown>;
    const at = `${section.type} (${section.id})`;

    if (section.type === "banner" && !textOf(props["text"])) {
      failures.push({
        code: "a11y.status.color_only",
        message: `a11y: ${at} carries a ${textOf(props["tone"]) || "toned"} banner with no message — status is conveyed by colour alone.`,
      });
    }

    if (
      section.type === "checkout_steps" ||
      section.type === "order_tracker"
    ) {
      const empty = ["heading", "step1", "step2", "step3", "step4"].filter(
        (key) => !textOf(props[key]),
      );
      if (empty.length > 0) {
        failures.push({
          code: "a11y.status.color_only",
          message: `a11y: ${at} has progress stages with no text (${empty.join(", ")}) — the current stage is shown by highlight alone.`,
        });
      }
    }

    if (
      section.type === "free_shipping_bar" &&
      !textOf(props["freeShippingLabel"]) &&
      !textOf(props["freeShippingSuffix"]) &&
      !textOf(props["freeShippingDone"])
    ) {
      failures.push({
        code: "a11y.status.color_only",
        message: `a11y: ${at} renders a shipping progress bar with no copy — progress is conveyed by fill alone.`,
      });
    }

    if (section.type === "price_sparkline" && !textOf(props["summary"])) {
      failures.push({
        code: "a11y.status.color_only",
        message: `a11y: ${at} renders a price chart with no text alternative — the trend is visible only to sighted visitors.`,
      });
    }

    if (section.type === "sustain_badge") {
      for (const n of [1, 2, 3]) {
        if (
          textOf(props[`c${n}Source`]) &&
          !textOf(props[`c${n}Label`])
        ) {
          failures.push({
            code: "a11y.status.color_only",
            message: `a11y: ${at} cites a source for claim ${n} with no claim text — the badge signals trust by colour alone.`,
          });
        }
      }
    }

    if (
      section.type === "authenticity_badge" &&
      props["verified"] !== false &&
      !textOf(props["label"])
    ) {
      failures.push({
        code: "a11y.status.color_only",
        message: `a11y: ${at} shows a verified mark with no label — trust is conveyed by the icon alone.`,
      });
    }
  }
  return failures;
}

export type MotionGateReport = {
  ok: boolean;
  failures: GateFailure[];
  /** Reduced-intent pages assessed. Full/SSR passes are never assessed here. */
  pages: number;
};

/**
 * B7: the reduced-motion verdicts from `motion-choreography.ts`, as publish
 * failures. Under reduced intent nothing may hold a running animation
 * (`motion.reduced.loop`, `motion.reduced.duration`, `motion.reduced.property`)
 * and every counter must already read its final value
 * (`motion.reduced.counter`); a node parked invisible by the downgrade
 * (`motion.fold.pending`) fails for the same reason. Advisory motion findings
 * (drift windows, stagger budgets) stay out — blocking a deploy on 60ms of
 * easing is how gates get switched off.
 */
export function reducedMotionGate(
  pages: MotionPageMeasurement[] = [],
): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const page of pages) {
    if (page.intent !== "reduced") continue;
    const { findings } = auditMotionPage(page);
    for (const finding of findings) {
      if (finding.severity !== "error") continue;
      if (
        finding.code === "motion.fold.pending" ||
        finding.code.startsWith("motion.reduced.")
      ) {
        failures.push({
          code: finding.code,
          message: `reduced motion: ${finding.message} (${finding.where})`,
        });
      }
    }
  }
  return failures;
}

/**
 * B6: per-theme motion budgets, decided from the AST alone so they run on the
 * publish path with no browser — the static half of the motion ceiling whose
 * runtime half is `MotionBudget` (`motion-policy.ts`) + `auditBudget`
 * (`motion-choreography.ts`).
 *
 * Two ceilings, both blocking (failures, never warnings — matching the
 * `perf.weight` convention where a breached budget fails the publish and only
 * a near-miss is advisory):
 *
 *  - `motion.budget.tweens` — at most `maxAnimatedNodes` nodes may request a
 *    motion effect. A fast scroll fires every entrance together, so the
 *    declared worst case must fit inside the runtime's concurrent-animation
 *    budget (`new MotionBudget(12)` default; the page holds 14 with room for
 *    chrome). Count-up and scroll-scrub nodes count the same as CSS ones:
 *    they hold a tween, a budget slot and the engine chunk.
 *  - `motion.budget.loops` — at most `maxLoopLayers` lively (infinite)
 *    layer. Loops never settle, so each one is a permanent compositor tax;
 *    one marquee per theme is the allowance.
 */
export const MOTION_THEME_BUDGET = {
  maxAnimatedNodes: 12,
  maxLoopLayers: 1,
} as const;

/** Effects that never settle on their own — the page pays for them forever. */
const LOOP_EFFECTS: ReadonlySet<string> = new Set(["marquee"]);

export function motionBudgetGate(ast: ThemeAst): GateFailure[] {
  const failures: GateFailure[] = [];
  let animated = 0;
  let loops = 0;
  let firstLoopWhere = "";
  for (const section of flattenSections(ast)) {
    if (section.invalid) continue;
    const effect = motionEffectOf(
      (section.props as Record<string, unknown>)["advMotion"],
    );
    if (effect === "none") continue;
    animated += 1;
    if (LOOP_EFFECTS.has(effect)) {
      loops += 1;
      if (!firstLoopWhere) firstLoopWhere = `${section.type} (${section.id})`;
    }
  }
  if (animated > MOTION_THEME_BUDGET.maxAnimatedNodes) {
    failures.push({
      code: "motion.budget.tweens",
      message:
        `motion: ${animated} nodes request motion effects against a ceiling of ` +
        `${MOTION_THEME_BUDGET.maxAnimatedNodes} concurrent tweens — a fast scroll fires them together and drops frames on a mid-range phone.`,
    });
  }
  if (loops > MOTION_THEME_BUDGET.maxLoopLayers) {
    failures.push({
      code: "motion.budget.loops",
      message:
        `motion: ${loops} lively loop layers against a ceiling of ${MOTION_THEME_BUDGET.maxLoopLayers} — loops never settle, so each one is a permanent compositor tax (first: ${firstLoopWhere}).`,
    });
  }
  return failures;
};

/**
 * Browser-side gates. They cannot run inside a server function, so publish
 * cannot block on them — they block the release instead, and are declared here
 * so `bun run gates:release` and this module can never disagree.
 */
export const RELEASE_GATES = [
  {
    key: "a11y",
    script: "scripts/a11y-gate.mjs",
    npm: "a11y:gate",
    /** Weighted axe score floor per surface, swept over GATE_MATRIX. */
    floor: LIGHTHOUSE_BUDGET.accessibility,
    describes: "axe score + 4.5:1 contrast in light/dark × EN/বাংলা",
  },
  {
    key: "perf",
    script: "scripts/perf-budget.mjs",
    npm: "perf:budget",
    floor: null,
    describes: "gzipped CSS/JS transfer budget per storefront route",
  },
  {
    key: "vitals",
    script: "scripts/vitals-gate.mjs",
    npm: "vitals:gate",
    floor: LIGHTHOUSE_BUDGET.performance,
    describes: `LCP < ${VITALS_BUDGET.lcpMs}ms · CLS < ${VITALS_BUDGET.cls} · TBT ≤ ${LIGHTHOUSE_BUDGET.tbtMs}ms on index/collection/product`,
  },
  {
    key: "responsive",
    script: "scripts/responsive-sweep.mjs",
    npm: "responsive:sweep",
    floor: null,
    describes:
      "zero horizontal overflow, ≥44px tap targets and no 100vh at 320/360/768/1024/1440 × light/dark × EN/বাংলা",
  },
  {
    key: "browser-support",
    script: "scripts/browser-smoke.mjs",
    npm: "e2e:browsers",
    floor: null,
    describes:
      "Chromium/Firefox/WebKit journey plus readable and navigable no-JS SSR",
  },
] as const;

/**
 * The theme-side half of the publish gate, composed in one place: lint and
 * translation failures come from the caller (they need the parsed AST), colour
 * and skeleton parity are decided here.
 */
export function composePublishGate(input: {
  tokens: ThemeTokens;
  lint?: string[];
  translation?: string[];
  fonts?: string[];
  /**
   * Phase 4: the template being published, checked against its widget JS
   * budget, the hydration policy and the image contract. Optional so callers
   * that only validate theme tokens keep working unchanged.
   */
  perf?: { ast: ThemeAst; template?: TemplateKey | null };
  /**
   * Phase 5: the template's responsive audit. Shares the `perf` AST when the
   * caller supplies one, so a publish never checks performance against one
   * tree and responsiveness against another.
   */
  responsive?: { ast: ThemeAst } | false;
  /**
   * Phase 1A: the template's trust audit — every interactive element reachable
   * and named, status never colour-only. Takes the same tree as `responsive`
   * when the caller passes one explicitly; there is no implicit fallback, so
   * token-only callers keep working unchanged.
   */
  a11y?: { ast: ThemeAst } | false;
  /**
   * Phase 1A: reduced-intent motion measurements (typically the CI motion
   * sweep's output). Reduced-motion verdicts from `motion-choreography.ts`
   * block the publish; full-intent pages in the same batch are ignored.
   */
  motion?: { pages: MotionPageMeasurement[] } | false;
}): {
  ok: boolean;
  failures: GateFailure[];
  warnings: GateFailure[];
  perf: PerfGateReport | null;
  responsive: ResponsiveGateReport | null;
  a11y: { ok: boolean; failures: GateFailure[] } | null;
  motion: MotionGateReport | null;
} {
  const perf = input.perf
    ? perfGate({ ast: input.perf.ast, template: input.perf.template ?? null })
    : null;
  const responsiveAst =
    input.responsive === false
      ? null
      : (input.responsive?.ast ?? input.perf?.ast ?? null);
  const responsive = responsiveAst ? responsiveGate(responsiveAst) : null;
  const a11yAst = input.a11y === false ? null : (input.a11y?.ast ?? null);
  const a11yFailures = a11yAst
    ? [...interactiveGate(a11yAst), ...statusGate(a11yAst)]
    : null;
  const motionPages =
    input.motion === false || !input.motion ? null : input.motion.pages;
  const motionFailures = motionPages ? reducedMotionGate(motionPages) : null;
  // B6: per-theme motion budgets ride the same AST the responsive gate audits,
  // so a publish never checks motion against a different tree. Token-only
  // callers (no AST) skip it exactly like the responsive gate does.
  const motionBudgetAst = responsiveAst ?? a11yAst;
  const motionBudgetFailures = motionBudgetAst
    ? motionBudgetGate(motionBudgetAst)
    : null;
  const failures: GateFailure[] = [
    ...(input.lint ?? []).map((message) => ({ code: "lint", message })),
    ...(input.translation ?? []).map((message) => ({
      code: "translation",
      message,
    })),
    ...(input.fonts ?? []).map((message) => ({ code: "fonts", message })),
    ...contrastGate(input.tokens),
    ...skeletonParityGate(),
    ...(perf?.failures ?? []).map((f) => ({
      code: f.code,
      message: f.message,
    })),
    ...(responsive?.failures ?? []).map((f) => ({
      code: f.code,
      message: f.message,
    })),
    ...(a11yFailures ?? []),
    ...(motionFailures ?? []),
    ...(motionBudgetFailures ?? []),
  ];
  const warnings: GateFailure[] = [
    ...(perf?.warnings ?? []).map((f) => ({
      code: f.code,
      message: f.message,
    })),
    ...(responsive?.warnings ?? []).map((f) => ({
      code: f.code,
      message: f.message,
    })),
  ];
  return {
    ok: failures.length === 0,
    failures,
    warnings,
    perf,
    responsive,
    a11y: a11yFailures
      ? { ok: a11yFailures.length === 0, failures: a11yFailures }
      : null,
    motion: motionFailures
      ? {
          ok: motionFailures.length === 0,
          failures: motionFailures,
          pages: motionPages?.filter((p) => p.intent === "reduced").length ?? 0,
        }
      : null,
  };
}
