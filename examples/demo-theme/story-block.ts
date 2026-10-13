/**
 * Demo theme fixture — animated storytelling block (section 1 of 3).
 *
 * One developer section proving a bespoke animated story ships without
 * touching core: chapters arrive only through the §5 read-scoped commerce
 * context (`commerce.ts`), merchant settings use only the closed
 * builder-field set (§4: text, image, color, spacing, animation), and the
 * block binds to the `main` slot by registration — the core renderer map
 * stays closed (§3).
 *
 * Motion rules (single-engine policy): the GSAP engine is reached ONLY
 * through a dynamic `import("gsap")` — never a static import — inside
 * `mountStoryAnimation`. Decorative motion is skipped under reduced-motion
 * preference and the static render below is always functional, so the block
 * reads complete with no JS at all. Timelines are killed on unmount; a
 * live-timeline registry backs the no-leak assertion.
 */

import type { DemoCommerceContext, DemoProduct } from "./commerce";
import { findDemoProducts, isDemoProductAvailable } from "./commerce";
import {
  clampInt,
  escapeHtml,
  MOTION_BUDGET,
  MOTION_PRESETS,
  resolveMotionPreset,
  type MotionPreset,
} from "./shared";

export const STORY_SECTION_KEY = "story-arc";
export const STORY_COMPONENT_NAME = "StoryArc";
export const STORY_SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const STORY_REQUIRED_CAPABILITIES = [
  "presentation",
  "animation",
  "commerce-read",
] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const STORY_SETTINGS_SCHEMA = [
  { key: "story-heading", label: "Story heading", type: "text" },
  { key: "story-backdrop", label: "Story backdrop", type: "image" },
  { key: "story-accent", label: "Story accent", type: "color" },
  { key: "story-gap", label: "Story spacing", type: "spacing" },
  { key: "story-motion", label: "Story motion", type: "animation" },
] as const;

export type StorySettings = {
  heading: string;
  backdrop: string;
  accent: string;
  gap: number;
  motion: MotionPreset;
};

export type StorySettingsInput = {
  heading?: unknown;
  backdrop?: unknown;
  accent?: unknown;
  gap?: unknown;
  motion?: unknown;
};

export const DEFAULT_STORY_SETTINGS: StorySettings = {
  heading: "Our story",
  backdrop: "",
  accent: "#7C3AED",
  gap: 24,
  motion: "standard",
};

export function coerceStorySettings(input: StorySettingsInput): StorySettings {
  const heading =
    typeof input.heading === "string" && input.heading.trim().length > 0
      ? input.heading.trim().slice(0, 80)
      : DEFAULT_STORY_SETTINGS.heading;
  const backdrop =
    typeof input.backdrop === "string"
      ? input.backdrop.trim().slice(0, 2048)
      : "";
  const accent =
    typeof input.accent === "string" && input.accent.trim().length > 0
      ? input.accent.trim().slice(0, 32)
      : DEFAULT_STORY_SETTINGS.accent;
  return {
    heading,
    backdrop,
    accent,
    gap: clampInt(input.gap, DEFAULT_STORY_SETTINGS.gap, 0, 96),
    motion: resolveMotionPreset(input.motion),
  };
}

/** Host Section shape (§3): the registered key, never a core renderer fork. */
export type StorySection = {
  id: string;
  type: typeof STORY_SECTION_KEY;
  props: {
    heading: string;
    backdrop: string;
    accent: string;
    gap: number;
    motion: MotionPreset;
  };
};

export function buildStorySection(
  id: string,
  settings: StorySettingsInput,
): StorySection {
  const coerced = coerceStorySettings(settings);
  return {
    id,
    type: STORY_SECTION_KEY,
    props: {
      heading: coerced.heading,
      backdrop: coerced.backdrop,
      accent: coerced.accent,
      gap: coerced.gap,
      motion: coerced.motion,
    },
  };
}

export type StoryRenderInput = {
  settings: StorySettingsInput;
  chapters: unknown;
  commerce: DemoCommerceContext;
  prefersReducedMotion: boolean;
};

export type StoryRenderOutput = {
  html: string;
  products: DemoProduct[];
  heading: string;
  motion: MotionPreset;
  /** False under reduced motion or with no chapters: static stands. */
  animated: boolean;
};

function renderChapter(product: DemoProduct): string {
  const ready = isDemoProductAvailable(product);
  const image = product.images[0] ?? "/ph/demo/placeholder.jpg";
  return (
    `<li data-story-chapter="${escapeHtml(product.id)}">` +
    `<a href="/p/${encodeURIComponent(product.handle)}">` +
    `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" />` +
    `<span>${escapeHtml(product.title)}</span>` +
    `</a>` +
    `<span data-readiness="${ready ? "available" : "unavailable"}">` +
    `${ready ? "Available" : "Back soon"}` +
    `</span></li>`
  );
}

/**
 * Static-first render: complete, legible content with no JS. The animation
 * mount only enhances it, so the reduced-motion fallback IS this output.
 */
export function renderStoryBlock(input: StoryRenderInput): StoryRenderOutput {
  const settings = coerceStorySettings(input.settings);
  const products = findDemoProducts(input.commerce, input.chapters);
  const chapters = products.map(renderChapter).join("");
  const backdrop = settings.backdrop
    ? `<img src="${escapeHtml(settings.backdrop)}" alt="" data-story-backdrop="true" loading="lazy" />`
    : "";
  const html =
    `<section data-demo="${STORY_SECTION_KEY}" data-motion="${settings.motion}" data-gap="${settings.gap}">` +
    `<h2>${escapeHtml(settings.heading)}</h2>` +
    backdrop +
    `<ol>${chapters}</ol></section>`;
  return {
    html,
    products,
    heading: settings.heading,
    motion: settings.motion,
    animated: !input.prefersReducedMotion && products.length > 0,
  };
}

/* ------------------------------------------------- animation mount (GSAP) */

/** Structural minimum the block needs — no static gsap type import. */
export type StoryTimeline = {
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

export type StoryEngine = {
  timeline(vars?: Record<string, unknown>): StoryTimeline;
};

export type StoryEngineLoader = () => Promise<
  { gsap: StoryEngine } | StoryEngine
>;

export type StoryTweenState = { opacity: number; y: number };

export type StoryMountOptions = {
  motion?: unknown;
  prefersReducedMotion?: boolean;
  loader?: StoryEngineLoader;
};

export type MountedStoryAnimation = {
  timeline: StoryTimeline | null;
  tweenCount: number;
  animated: boolean;
  destroy: () => void;
};

const liveStoryTimelines = new Set<StoryTimeline>();

/** Registry backing the no-leaked-tweens assertion. */
export function liveStoryTimelineCount(): number {
  return liveStoryTimelines.size;
}

const STORY_STAGGER_GAP_S = 0.08;

/**
 * Enhance a static render with a GSAP entrance timeline. Under reduced
 * motion the engine is never loaded and the static render stands as the
 * functional fallback. Call `destroy` on unmount to kill the timeline.
 */
export async function mountStoryAnimation(
  states: StoryTweenState[],
  options: StoryMountOptions = {},
): Promise<MountedStoryAnimation> {
  const noop = (): MountedStoryAnimation => ({
    timeline: null,
    tweenCount: 0,
    animated: false,
    destroy: () => {},
  });
  if (options.prefersReducedMotion === true) return noop();

  const load: StoryEngineLoader =
    options.loader ?? (async () => await import("gsap"));
  const loaded = (await load()) as { gsap?: StoryEngine } & StoryEngine;
  const engine: StoryEngine = loaded.gsap ?? loaded;
  const preset = MOTION_PRESETS[resolveMotionPreset(options.motion)];
  const durationMs = Math.min(preset.durationMs, MOTION_BUDGET.maxDurationMs);
  const travelPx = Math.min(preset.travelPx, MOTION_BUDGET.maxTravelPx);

  const timeline = engine.timeline({
    defaults: { ease: "power2.out" },
  });
  states.forEach((state, index) => {
    timeline.fromTo(
      state,
      { opacity: 0, y: travelPx },
      { opacity: 1, y: 0, duration: durationMs / 1000 },
      index * STORY_STAGGER_GAP_S,
    );
  });
  liveStoryTimelines.add(timeline);
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
      liveStoryTimelines.delete(timeline);
    },
  };
}
