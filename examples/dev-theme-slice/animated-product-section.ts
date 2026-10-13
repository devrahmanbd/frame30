/**
 * Level B thin vertical slice — animated product section definition.
 *
 * One developer section proving a custom animated block ships without
 * touching core: data arrives only through the §5 read-scoped commerce
 * context (`commerce.ts`), merchant settings use only the closed
 * builder-field set (§4: text, product-selection, animation), and the
 * component binds to the `main` slot by registration — the core renderer
 * map stays closed (§3).
 *
 * Motion rules (single-engine policy: `src/lib/motion.contract.test.ts`):
 * the GSAP engine is reached ONLY through a dynamic `import("gsap")` —
 * never a static import — inside `mountSectionAnimation`. Decorative motion
 * is skipped under reduced-motion preference and the static render below
 * is always functional, so the section reads complete with no JS at all
 * (same settled-state precedent as `Reveal.tsx`). Timelines are killed on
 * unmount; a live-timeline registry backs the no-leak assertion.
 *
 * Declared-but-unimplemented here: `webgl` (a Three.js isolated-canvas scene
 * with a static fallback is the documented next slice — see README.md).
 */

import type { SliceCommerceContext, SliceProduct } from "./commerce";
import { findSliceProducts, isSliceProductAvailable } from "./commerce";

export const SECTION_KEY = "animated-spotlight";
export const COMPONENT_NAME = "AnimatedProductSection";
export const SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const REQUIRED_CAPABILITIES = [
  "presentation",
  "animation",
  "commerce-read",
] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const SETTINGS_SCHEMA = [
  { key: "heading", label: "Heading", type: "text" },
  { key: "products", label: "Products", type: "product-selection" },
  { key: "intensity", label: "Animation intensity", type: "animation" },
] as const;

export type IntensityPreset = "gentle" | "standard" | "bold";

export type SliceSettings = {
  heading: string;
  products: string[];
  intensity: IntensityPreset;
};

export type MerchantSettingsInput = {
  heading?: unknown;
  products?: unknown;
  intensity?: unknown;
};

export const DEFAULT_SETTINGS: SliceSettings = {
  heading: "Featured products",
  products: [],
  intensity: "standard",
};

/**
 * Entrance presets. Durations and travel are capped so one section can never
 * blow the page motion budget: at most 600ms and 48px per card.
 */
export const MAX_INTENSITY_DURATION_MS = 600;
export const MAX_INTENSITY_TRAVEL_PX = 48;

const INTENSITY_PRESETS: Record<
  IntensityPreset,
  { durationMs: number; travelPx: number }
> = {
  gentle: { durationMs: 240, travelPx: 12 },
  standard: { durationMs: 360, travelPx: 24 },
  bold: { durationMs: 600, travelPx: 48 },
};

/** Unknown merchant input falls back to standard — never a crash. */
export function resolveIntensity(raw: unknown): IntensityPreset {
  if (raw === "gentle" || raw === "standard" || raw === "bold") return raw;
  return "standard";
}

export function coerceSliceSettings(
  input: MerchantSettingsInput,
): SliceSettings {
  const heading =
    typeof input.heading === "string" && input.heading.trim().length > 0
      ? input.heading.trim().slice(0, 80)
      : DEFAULT_SETTINGS.heading;
  const products = Array.isArray(input.products)
    ? [...new Set(input.products.filter((id) => typeof id === "string"))]
    : [];
  return {
    heading,
    products: products.slice(0, 12),
    intensity: resolveIntensity(input.intensity),
  };
}

/** Merchant copy is copy only: always rendered escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Host Section shape (§3): the registered key, never a core renderer fork. */
export type SliceSection = {
  id: string;
  type: typeof SECTION_KEY;
  props: { heading: string; products: string[]; intensity: IntensityPreset };
};

export function buildSliceSection(
  id: string,
  settings: MerchantSettingsInput,
): SliceSection {
  const coerced = coerceSliceSettings(settings);
  return {
    id,
    type: SECTION_KEY,
    props: {
      heading: coerced.heading,
      products: coerced.products,
      intensity: coerced.intensity,
    },
  };
}

export type RenderInput = {
  settings: MerchantSettingsInput;
  commerce: SliceCommerceContext;
  prefersReducedMotion: boolean;
};

export type RenderOutput = {
  html: string;
  products: SliceProduct[];
  heading: string;
  intensity: IntensityPreset;
  /** False under reduced motion or with nothing selected: static stands. */
  animated: boolean;
};

function renderCard(product: SliceProduct): string {
  const available = isSliceProductAvailable(product);
  const image = product.images[0] ?? "/ph/slice/placeholder.jpg";
  return (
    `<li data-slice-card="${escapeHtml(product.id)}">` +
    `<a href="/p/${encodeURIComponent(product.handle)}">` +
    `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" />` +
    `<span>${escapeHtml(product.title)}</span>` +
    `</a>` +
    `<span data-availability="${available ? "available" : "unavailable"}">` +
    `${available ? "Available" : "Back soon"}` +
    `</span></li>`
  );
}

/**
 * Static-first render: complete, legible content with no JS. The animation
 * mount only enhances it, so the reduced-motion fallback IS this output.
 */
export function renderAnimatedProductSection(input: RenderInput): RenderOutput {
  const settings = coerceSliceSettings(input.settings);
  const products = findSliceProducts(input.commerce, settings.products);
  const cards = products.map(renderCard).join("");
  const html =
    `<section data-slice="${SECTION_KEY}" data-intensity="${settings.intensity}">` +
    `<h2>${escapeHtml(settings.heading)}</h2>` +
    `<ul>${cards}</ul></section>`;
  return {
    html,
    products,
    heading: settings.heading,
    intensity: settings.intensity,
    animated: !input.prefersReducedMotion && products.length > 0,
  };
}

/** Host-provided preference probe. SSR-safe: no window, no throw. */
export function hostPrefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------- animation mount (GSAP) */

/** Structural minimum the slice needs — no static gsap type import. */
export type SliceTimeline = {
  fromTo(
    target: object,
    fromVars: object,
    toVars: object,
    position?: number,
  ): unknown;
  getChildren(
    nested?: boolean,
    tweens?: boolean,
    timelines?: boolean,
  ): unknown[];
  play(): unknown;
  kill(): void;
  clear(): unknown;
  isActive(): boolean;
};

export type SliceEngine = {
  timeline(vars?: Record<string, unknown>): SliceTimeline;
};

export type SliceEngineLoader = () => Promise<
  { gsap: SliceEngine } | SliceEngine
>;

export type TweenState = { opacity: number; y: number };

export type MountOptions = {
  intensity?: unknown;
  prefersReducedMotion?: boolean;
  loader?: SliceEngineLoader;
};

export type MountedSectionAnimation = {
  timeline: SliceTimeline | null;
  tweenCount: number;
  animated: boolean;
  destroy: () => void;
};

const liveSliceTimelines = new Set<SliceTimeline>();

/** Registry backing the no-leaked-tweens assertion. */
export function liveSliceTimelineCount(): number {
  return liveSliceTimelines.size;
}

const STAGGER_GAP_S = 0.08;

/**
 * Enhance a static render with a GSAP entrance timeline. Under reduced
 * motion the engine is never loaded and the static render stands as the
 * functional fallback. Call `destroy` on unmount to kill the timeline.
 */
export async function mountSectionAnimation(
  states: TweenState[],
  options: MountOptions = {},
): Promise<MountedSectionAnimation> {
  const noop = (): MountedSectionAnimation => ({
    timeline: null,
    tweenCount: 0,
    animated: false,
    destroy: () => {},
  });
  if (options.prefersReducedMotion === true) return noop();

  const load: SliceEngineLoader =
    options.loader ?? (async () => await import("gsap"));
  const loaded = (await load()) as { gsap?: SliceEngine } & SliceEngine;
  const engine: SliceEngine = loaded.gsap ?? loaded;
  const preset = INTENSITY_PRESETS[resolveIntensity(options.intensity)];
  const durationMs = Math.min(preset.durationMs, MAX_INTENSITY_DURATION_MS);
  const travelPx = Math.min(preset.travelPx, MAX_INTENSITY_TRAVEL_PX);

  const timeline = engine.timeline({
    defaults: { ease: "power2.out" },
  });
  states.forEach((state, index) => {
    timeline.fromTo(
      state,
      { opacity: 0, y: travelPx },
      { opacity: 1, y: 0, duration: durationMs / 1000 },
      index * STAGGER_GAP_S,
    );
  });
  liveSliceTimelines.add(timeline);
  timeline.play();

  let destroyed = false;
  return {
    timeline,
    tweenCount: timeline.getChildren().length,
    animated: true,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      timeline.kill();
      timeline.clear();
      liveSliceTimelines.delete(timeline);
    },
  };
}
