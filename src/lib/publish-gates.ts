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
import type { SectionType, TemplateKey, ThemeAst } from "./builder-ast";

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

type Pair = { label: string; fg: string; bg: string; floor: number; blocking: boolean };

function pairsFor(set: { brand: string; accent: string; surface: string; ink: string }): Pair[] {
  return [
    { label: "body copy", fg: set.ink, bg: set.surface, floor: CONTRAST_FLOOR.text, blocking: true },
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
    { label: "brand edge on surface", fg: set.brand, bg: set.surface, floor: CONTRAST_FLOOR.ui, blocking: false },
    { label: "accent edge on surface", fg: set.accent, bg: set.surface, floor: CONTRAST_FLOOR.ui, blocking: false },
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
  const sets: [ColourScheme, { brand: string; accent: string; surface: string; ink: string }][] = [
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
export const RESERVED_RATIOS = ["aspect-[3/4]", "aspect-[4/5]", "aspect-square", "aspect-video"] as const;


export function skeletonParityGate(types: SectionType[] = WIDGET_TYPES): GateFailure[] {
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
    if (spec.ratio && !(RESERVED_RATIOS as readonly string[]).includes(spec.ratio)) {
      failures.push({
        code: "skeleton.ratio_unknown",
        message: `skeleton: ${type} reserves "${spec.ratio}", which is not a platform ratio.`,
      });
    }
  }
  return failures;
}

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
    describes: "Chromium/Firefox/WebKit journey plus readable and navigable no-JS SSR",
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
}): {
  ok: boolean;
  failures: GateFailure[];
  warnings: GateFailure[];
  perf: PerfGateReport | null;
  responsive: ResponsiveGateReport | null;
} {
  const perf = input.perf ? perfGate({ ast: input.perf.ast, template: input.perf.template ?? null }) : null;
  const responsiveAst =
    input.responsive === false ? null : (input.responsive?.ast ?? input.perf?.ast ?? null);
  const responsive = responsiveAst ? responsiveGate(responsiveAst) : null;
  const failures: GateFailure[] = [
    ...(input.lint ?? []).map((message) => ({ code: "lint", message })),
    ...(input.translation ?? []).map((message) => ({ code: "translation", message })),
    ...(input.fonts ?? []).map((message) => ({ code: "fonts", message })),
    ...contrastGate(input.tokens),
    ...skeletonParityGate(),
    ...(perf?.failures ?? []).map((f) => ({ code: f.code, message: f.message })),
    ...(responsive?.failures ?? []).map((f) => ({ code: f.code, message: f.message })),
  ];
  const warnings: GateFailure[] = [
    ...(perf?.warnings ?? []).map((f) => ({ code: f.code, message: f.message })),
    ...(responsive?.warnings ?? []).map((f) => ({ code: f.code, message: f.message })),
  ];
  return { ok: failures.length === 0, failures, warnings, perf, responsive };
}
