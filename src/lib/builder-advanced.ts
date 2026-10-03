/**
 * Elementor-parity "Advanced" controls, available on **every** widget.
 *
 * The catalog describes what a widget *is*; these describe how any node is
 * placed on the page. They live in one module so the inspector, the renderer
 * and the published stylesheet all read the same schema, and so adding a
 * control never means touching 117 catalog entries.
 *
 * Values are stored as ordinary props under an `adv` prefix, which keeps every
 * existing AST valid without migration and lets the per-breakpoint cascade
 * (`bp`) apply to them exactly like any other prop.
 */
import type { Field, PropValue, Section } from "./builder-ast";

/** Prop keys reserved by the Advanced tab. */
export const ADVANCED_KEYS = [
  "advMarginTop",
  "advMarginBottom",
  "advPadY",
  "advPadX",
  "advZIndex",
  "advId",
  "advClass",
  "advAnimation",
  "advMotion",
  "advCss",
] as const;

export type AdvancedKey = (typeof ADVANCED_KEYS)[number];

const ADVANCED_SET = new Set<string>(ADVANCED_KEYS);
export function isAdvancedKey(key: string): boolean {
  return ADVANCED_SET.has(key);
}

/** Entrance animations; `none` also covers a reduced-motion visitor. */
export const ADVANCED_ANIMATIONS = [
  "none",
  "fade",
  "rise",
  "slide-left",
  "slide-right",
  "zoom",
] as const;
export type AdvancedAnimation = (typeof ADVANCED_ANIMATIONS)[number];

/**
 * Theme-motion manifest (closed vocabulary). A theme requests a named effect
 * via `advMotion`; the engine executes it — themes never touch shared
 * renderer code (isolation rule). CSS-executable effects run from the
 * stylesheet; `count-up` and `scroll-scrub` need JS executors and run behind
 * the lazy engine loader (`src/components/builder/motion-fx.ts`), gated by
 * the shared observer exactly like reveals. Every effect collapses under
 * `prefers-reduced-motion` and `motion: none`.
 */
export const MOTION_EFFECTS = [
  "none",
  "fade",
  "rise",
  "zoom",
  "stagger-grid",
  "marquee",
  "line-reveal",
  "count-up",
  "scroll-scrub",
] as const;
export type MotionEffect = (typeof MOTION_EFFECTS)[number];

/**
 * B3: entrance-animation names that predate the motion manifest, resolved into
 * the reveal vocabulary. `zoom`/`none`/`fade`/`rise` are already members, so
 * they pass through untouched; the horizontal entrances have no `fq-fx`
 * counterpart (the CSS contract for this phase is keyframes only), so they
 * normalise to the platform entrance token — a 16px rise — instead of
 * collapsing to `none` and silently dropping the merchant's motion. The full
 * directional tween stays available through `advAnimation` (`fq-anim-*`),
 * which already ships both slide keyframes.
 */
const FX_ALIAS: Record<string, MotionEffect> = {
  "slide-left": "rise",
  "slide-right": "rise",
};

/** Unknown or empty values resolve to `none` — never a crash, never empty. */
export function motionEffectOf(value: unknown): MotionEffect {
  const name = typeof value === "string" ? value : "";
  const aliased = FX_ALIAS[name] ?? name;
  return (MOTION_EFFECTS as readonly string[]).includes(aliased)
    ? (aliased as MotionEffect)
    : "none";
}

/** Entrance-type effects park until the shared observer reports on-screen. */
export function isEntranceEffect(effect: MotionEffect): boolean {
  return effect !== "none" && effect !== "marquee" && effect !== "scroll-scrub";
}

/**
 * Effects that cannot run from CSS and need a JS executor behind the engine
 * loader. `count-up` tweens a numeral on entry; `scroll-scrub` drives a
 * scroll-linked drift while its node crosses the viewport.
 */
export function isJsEffect(effect: MotionEffect): boolean {
  return effect === "count-up" || effect === "scroll-scrub";
}

export const ADVANCED_FIELDS: Field[] = [
  {
    key: "advMarginTop",
    label: "Margin top",
    kind: "number",
    min: -80,
    max: 240,
    step: 4,
    panel: "advanced",
    responsive: true,
  },
  {
    key: "advMarginBottom",
    label: "Margin bottom",
    kind: "number",
    min: -80,
    max: 240,
    step: 4,
    panel: "advanced",
    responsive: true,
  },
  {
    key: "advPadY",
    label: "Padding — vertical",
    kind: "number",
    min: 0,
    max: 240,
    step: 4,
    panel: "advanced",
    responsive: true,
  },
  {
    key: "advPadX",
    label: "Padding — horizontal",
    kind: "number",
    min: 0,
    max: 160,
    step: 4,
    panel: "advanced",
    responsive: true,
  },
  {
    key: "advZIndex",
    label: "Z-index",
    kind: "number",
    min: -10,
    max: 999,
    panel: "advanced",
  },
  { key: "advId", label: "CSS id", kind: "text", max: 60, panel: "advanced" },
  {
    key: "advClass",
    label: "CSS classes",
    kind: "text",
    max: 200,
    panel: "advanced",
  },
  {
    key: "advAnimation",
    label: "Entrance animation",
    kind: "select",
    panel: "advanced",
    responsive: true,
    options: [
      { value: "none", label: "None" },
      { value: "fade", label: "Fade in" },
      { value: "rise", label: "Rise" },
      { value: "slide-left", label: "Slide from left" },
      { value: "slide-right", label: "Slide from right" },
      { value: "zoom", label: "Zoom" },
    ],
  },
  {
    key: "advMotion",
    label: "Motion effect",
    kind: "select",
    panel: "advanced",
    options: [
      { value: "none", label: "None" },
      { value: "fade", label: "Fade in" },
      { value: "rise", label: "Rise" },
      { value: "zoom", label: "Zoom" },
      { value: "stagger-grid", label: "Staggered grid" },
      { value: "marquee", label: "Marquee loop" },
      { value: "line-reveal", label: "Line reveal" },
      { value: "count-up", label: "Count up" },
      { value: "scroll-scrub", label: "Scroll scrub" },
    ],
  },
  {
    key: "advCss",
    label: "Custom CSS",
    kind: "html",
    max: 2000,
    panel: "advanced",
  },
];

/** Sanitised, spaced-out class list. Never lets a class break out of an attribute. */
function classList(value: PropValue | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .split(/[\s,]+/)
    .map((token) => token.replace(/[^A-Za-z0-9_:\-[\]/.%]/g, ""))
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");
}

/** A CSS id is a single ident; anything else is dropped rather than guessed at. */
function cssId(value: PropValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().replace(/[^A-Za-z0-9_-]/g, "");
  return /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(id) ? id : undefined;
}

function num(
  value: PropValue | undefined,
  min: number,
  max: number,
): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export type AdvancedAttrs = {
  id?: string;
  className: string;
  style: Record<string, string>;
  animation: AdvancedAnimation;
};

/**
 * Turns the Advanced props of one node into the attributes its wrapper needs.
 * Everything is clamped: a merchant cannot push a widget off-canvas or stack
 * it above the store's own dialogs.
 */
export function advancedAttrs(props: Record<string, PropValue>): AdvancedAttrs {
  const style: Record<string, string> = {};
  const mt = num(props["advMarginTop"], -80, 240);
  const mb = num(props["advMarginBottom"], -80, 240);
  const py = num(props["advPadY"], 0, 240);
  const px = num(props["advPadX"], 0, 160);
  const z = num(props["advZIndex"], -10, 999);
  if (mt !== null) style["marginTop"] = `${mt}px`;
  if (mb !== null) style["marginBottom"] = `${mb}px`;
  if (py !== null) style["paddingBlock"] = `${py}px`;
  if (px !== null) style["paddingInline"] = `${px}px`;
  if (z !== null) style["zIndex"] = String(z);
  const raw = props["advAnimation"];
  const animation = (ADVANCED_ANIMATIONS as readonly string[]).includes(
    String(raw),
  )
    ? (raw as AdvancedAnimation)
    : "none";
  const id = cssId(props["advId"]);
  return {
    ...(id ? { id } : {}),
    className: classList(props["advClass"]),
    style,
    animation,
  };
}

/** True when this node asked for anything the wrapper has to render. */
export function hasAdvanced(props: Record<string, PropValue>): boolean {
  return ADVANCED_KEYS.some((key) => {
    const value = props[key];
    return (
      value !== undefined && value !== "" && value !== 0 && value !== "none"
    );
  });
}

/**
 * Per-element custom CSS, scoped to the node so it can never leak into the
 * rest of the store. `selector` is Elementor's convention for "this element";
 * a rule authored without it is wrapped automatically.
 */
export function scopedCss(nodeId: string, css: PropValue | undefined): string {
  if (typeof css !== "string") return "";
  const cleaned = css
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:javascript|data):[^)]*\)/gi, "url()")
    .trim();
  if (!cleaned) return "";
  const scope = `[data-fq-node="${nodeId.replace(/["\\]/g, "")}"]`;
  const body = cleaned.includes("{")
    ? cleaned.replace(/selector/g, scope)
    : `${scope}{${cleaned}}`;
  // A rule that never names the element is still scoped, so stray selectors
  // cannot restyle the whole storefront.
  return body.includes(scope)
    ? body
    : `${scope}{${cleaned.replace(/[{}]/g, "")}}`;
}

/** Every node's scoped CSS in one stylesheet, budget-capped. */
export function advancedCssFor(
  sections: Section[],
  budgetBytes = 24_000,
): string {
  const out: string[] = [];
  let size = 0;
  for (const section of sections) {
    const rule = scopedCss(section.id, section.props["advCss"]);
    if (!rule) continue;
    size += rule.length;
    if (size > budgetBytes) break;
    out.push(rule);
  }
  return out.join("\n");
}
