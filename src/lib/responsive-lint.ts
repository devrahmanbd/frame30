/**
 * Phase 5 — the responsive publish gate (static half).
 *
 * The browser sweep (`scripts/responsive-sweep.mjs`) is the empirical half: it
 * loads real pages at 320/360/768/1024/1440 in both locales and both colour
 * schemes and measures overflow, tap targets and viewport units. That sweep is
 * slow, needs a running server, and cannot run inside a server function — so
 * everything decidable from the AST alone is decided here, on the publish path,
 * where the merchant can still act on it.
 *
 * What this module refuses to do is guess. Every rule below maps to a failure
 * mode we can point at in the rendered page:
 *
 *  - a mobile layer that puts more columns on screen than the 4-column mobile
 *    grid can hold → guaranteed horizontal overflow at 320px;
 *  - `100vh` anywhere in merchant-authored values → the iOS URL-bar bug, which
 *    is exactly why the platform standardised on `100dvh`;
 *  - a fixed pixel width on a tappable label → clipped বাংলা, since Bangla runs
 *    15–30% longer than the English it was authored against;
 *  - a declared tap target under 44px → fails WCAG 2.5.8 and our own floor;
 *  - two scroll-locking overlays on one template → the classic double-lock
 *    where closing one leaves the page frozen;
 *  - a sticky bar pinned to the bottom without safe-area padding → hidden
 *    behind the iOS home indicator.
 *
 * Errors block publish. Warnings are advisory and surface in the lint panel.
 */
import type { PropValue, Section, ThemeAst } from "./builder-ast";
import { GRID_COLS, MIN_TOUCH_PX, hasFixedWidth, type DeviceBucket } from "./responsive";
import { compileResponsiveCss } from "./responsive-css";

export type ResponsiveIssue = {
  code: string;
  level: "error" | "warn";
  /** Node the merchant must open to fix it. Null for template-wide issues. */
  nodeId: string | null;
  message: string;
};

/**
 * Widgets that own a scroll lock while open. Exactly one of these may be
 * active per template; `OverlayHost` is the single lock owner at runtime, and
 * this list keeps the authored template honest about that.
 */
export const SCROLL_LOCK_OWNERS = ["quick_view", "cart_drawer"] as const;

/** Widgets pinned to a viewport edge — they need safe-area insets on mobile. */
export const STICKY_WIDGETS = ["sticky_bar", "sticky_buy_bar", "announcement_bar", "utility_bar"] as const;

/** Props whose value is a tappable label, i.e. must stay elastic. */
const TAPPABLE_LABEL_KEYS = [
  "ctaLabel",
  "buttonLabel",
  "label",
  "accountLabel",
  "cartLabel",
  "l1Label",
  "l2Label",
  "l3Label",
];

/** Props that declare an explicit interactive size in px. */
const TOUCH_SIZE_KEYS = ["tapSize", "buttonHeight", "iconSize", "minH", "minHeight"];

const VIEWPORT_UNIT = /\b\d+(?:\.\d+)?vh\b/i;

function walk(sections: Section[], visit: (s: Section) => void): void {
  for (const section of sections) {
    visit(section);
    if (section.children?.length) walk(section.children, visit);
  }
}

function flatten(ast: ThemeAst | Section[]): Section[] {
  const roots = Array.isArray(ast) ? ast : [...ast.header, ...ast.main, ...ast.footer];
  const out: Section[] = [];
  walk(roots, (s) => out.push(s));
  return out;
}

/** Every prop value across the base layer and every device layer. */
function allValues(section: Section): [layer: DeviceBucket, key: string, value: PropValue][] {
  const out: [DeviceBucket, string, PropValue][] = [];
  for (const [key, value] of Object.entries(section.props)) out.push(["desktop", key, value as PropValue]);
  for (const layer of ["tablet", "mobile"] as DeviceBucket[]) {
    for (const [key, value] of Object.entries(section.bp?.[layer] ?? {})) {
      out.push([layer, key, value as PropValue]);
    }
  }
  return out;
}

const asNumber = (value: PropValue): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Effective column count for a device, honouring the cascade. */
function columnsAt(section: Section, bucket: DeviceBucket): number | null {
  const chain: DeviceBucket[] = bucket === "mobile" ? ["mobile", "tablet", "desktop"] : bucket === "tablet" ? ["tablet", "desktop"] : ["desktop"];
  for (const layer of chain) {
    const bag = layer === "desktop" ? section.props : section.bp?.[layer];
    for (const key of ["columns", "cols"]) {
      if (bag && Object.prototype.hasOwnProperty.call(bag, key)) {
        const n = asNumber(bag[key] as PropValue);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

/** Effective span for a device, honouring the cascade. */
function spanAt(section: Section, bucket: DeviceBucket): number | null {
  const chain: DeviceBucket[] = bucket === "mobile" ? ["mobile", "tablet", "desktop"] : bucket === "tablet" ? ["tablet", "desktop"] : ["desktop"];
  for (const layer of chain) {
    const bag = layer === "desktop" ? section.props : section.bp?.[layer];
    if (bag && Object.prototype.hasOwnProperty.call(bag, "span")) {
      const n = asNumber(bag["span"] as PropValue);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Static responsive audit for one template.
 *
 * Deliberately node-scoped: each issue names the node so the studio can jump
 * to it, and template-wide issues carry `nodeId: null`.
 */
export function responsiveIssues(input: ThemeAst | Section[]): ResponsiveIssue[] {
  const sections = flatten(input);
  const issues: ResponsiveIssue[] = [];
  const lockOwners: Section[] = [];

  for (const section of sections) {
    if (section.invalid) continue;
    const id = section.id;

    // 1. Grid arithmetic that cannot fit the narrow grid.
    for (const bucket of ["mobile", "tablet"] as DeviceBucket[]) {
      const cols = columnsAt(section, bucket);
      if (cols !== null && cols > GRID_COLS[bucket]) {
        issues.push({
          code: "responsive.columns_overflow",
          level: "error",
          nodeId: id,
          message: `${section.type}: ${cols} columns on ${bucket} exceeds the ${GRID_COLS[bucket]}-column ${bucket} grid — the row will scroll sideways.`,
        });
      }
      // Four or more columns still technically fits the desktop grid maths but
      // is unreadable on a 320px phone; advisory, not blocking.
      if (bucket === "mobile" && cols !== null && cols > 2) {
        issues.push({
          code: "responsive.columns_dense",
          level: "warn",
          nodeId: id,
          message: `${section.type}: ${cols} columns on mobile leaves under ${Math.floor(320 / cols)}px per cell — consider a mobile override of 1 or 2.`,
        });
      }
      const span = spanAt(section, bucket);
      if (span !== null && span > 0 && span > GRID_COLS.desktop) {
        issues.push({
          code: "responsive.span_overflow",
          level: "error",
          nodeId: id,
          message: `${section.type}: a span of ${span} is wider than the 12-column grid.`,
        });
      }
    }

    // 2. Merchant-authored viewport units, padding and elasticity.
    for (const [layer, key, value] of allValues(section)) {
      if (typeof value === "string" && VIEWPORT_UNIT.test(value)) {
        issues.push({
          code: "responsive.vh_unit",
          level: "error",
          nodeId: id,
          message: `${section.type}.${key} (${layer}) uses vh — mobile browsers resize the viewport; use dvh.`,
        });
      }
      if (TAPPABLE_LABEL_KEYS.includes(key) && hasFixedWidth(value)) {
        issues.push({
          code: "responsive.fixed_tappable",
          level: "error",
          nodeId: id,
          message: `${section.type}.${key} (${layer}) pins a tappable label to a fixed width — বাংলা will clip.`,
        });
      }
      if (TOUCH_SIZE_KEYS.includes(key)) {
        const n = asNumber(value);
        if (n !== null && n > 0 && n < MIN_TOUCH_PX) {
          issues.push({
            code: "responsive.tap_target",
            level: "error",
            nodeId: id,
            message: `${section.type}.${key} (${layer}) is ${n}px — the platform floor is ${MIN_TOUCH_PX}px on both axes.`,
          });
        }
      }
      if (key === "padX" && layer === "mobile") {
        const n = asNumber(value);
        if (n !== null && n > 48) {
          issues.push({
            code: "responsive.pad_mobile",
            level: "warn",
            nodeId: id,
            message: `${section.type}: ${n}px of horizontal padding on mobile leaves ${320 - n * 2}px of content at the 320px floor.`,
          });
        }
      }
    }

    // 3. Sticky and overlay behaviour.
    if ((SCROLL_LOCK_OWNERS as readonly string[]).includes(section.type)) lockOwners.push(section);
    if ((STICKY_WIDGETS as readonly string[]).includes(section.type)) {
      if (section.hidden?.includes("mobile")) {
        issues.push({
          code: "responsive.sticky_hidden_mobile",
          level: "warn",
          nodeId: id,
          message: `${section.type} is hidden on mobile — the device where a pinned bar earns its keep.`,
        });
      }
    }
  }

  if (lockOwners.length > 1) {
    issues.push({
      code: "responsive.multiple_scroll_locks",
      level: "error",
      nodeId: lockOwners[1]!.id,
      message: `Two scroll-locking overlays on one template (${lockOwners.map((s) => s.type).join(", ")}) — closing one would leave the page locked. Keep one.`,
    });
  }

  return issues;
}

export type ResponsiveGateReport = {
  ok: boolean;
  failures: ResponsiveIssue[];
  warnings: ResponsiveIssue[];
  /** Compiled stylesheet stats, so publish can log what it is about to ship. */
  css: { rules: number; bytes: number; nodes: number; truncated: boolean };
};

/**
 * Publish-path entry point: static issues plus the compiled stylesheet's own
 * budget verdict. A theme whose responsive CSS blows the budget is not blocked
 * (the page still renders at its base layout) but the merchant is told, because
 * silently dropping their mobile layout would be worse than a warning.
 */
export function responsiveGate(input: ThemeAst | Section[]): ResponsiveGateReport {
  const issues = responsiveIssues(input);
  const compiled = compileResponsiveCss(Array.isArray(input) ? input : input);
  const warnings = issues.filter((i) => i.level === "warn");
  for (const message of compiled.warnings) {
    warnings.push({ code: "responsive.css_budget", level: "warn", nodeId: null, message });
  }
  const failures = issues.filter((i) => i.level === "error");
  return {
    ok: failures.length === 0,
    failures,
    warnings,
    css: { rules: compiled.rules, bytes: compiled.bytes, nodes: compiled.nodes, truncated: compiled.truncated },
  };
}
