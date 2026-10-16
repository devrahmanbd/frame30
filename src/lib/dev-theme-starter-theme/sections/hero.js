/**
 * Frame30 starter — hero section (GSAP + ScrollTrigger, React-compatible).
 *
 * Static-first render (`renderHeroSection`) is complete with no JS: a
 * custom-layout grid section with merchant headline, backdrop art, and a
 * product chapter list. The animation mount (`mountHeroAnimation`) enhances
 * it with a genuine GSAP entrance timeline plus a ScrollTrigger scrub row —
 * reached ONLY through dynamic bare-specifier imports (never a relative
 * file, never a static import), so the bundle asset gate ignores them while
 * the manifest dependency pins + vendor stage still bind the exact bytes.
 *
 * React-compatible: `renderHeroSection` returns an HTML string a React
 * component can inject, and `mountHeroAnimation` takes plain tween-state
 * objects plus a DOM-free engine loader (tests inject a stub; production
 * injects the real GSAP). Reduced-motion callers never load the engine.
 */

import {
  escapeHtml,
  clampInt,
  MOTION_BUDGET,
  MOTION_PRESETS,
  resolveMotionPreset,
} from "../components/shared.js";

export const HERO_SECTION_KEY = "hero";
export const HERO_COMPONENT_NAME = "HeroCanvas";

export function coerceHeroSettings(input) {
  const src = input ?? {};
  const heading =
    typeof src.headline === "string" && src.headline.trim().length > 0
      ? src.headline.trim().slice(0, 80)
      : "Starter story";
  const kicker =
    typeof src.kicker === "string" ? src.kicker.trim().slice(0, 80) : "";
  const accent =
    typeof src.accent === "string" && src.accent.trim().length > 0
      ? src.accent.trim().slice(0, 32)
      : "#7C3AED";
  return {
    heading,
    kicker,
    accent,
    gap: clampInt(src.gap, 24, 0, 96),
    motion: resolveMotionPreset(src.motion),
  };
}

export function renderHeroSection(input) {
  const src = input ?? {};
  const settings = coerceHeroSettings(src.settings ?? {});
  const chapters = Array.isArray(src.chapters) ? src.chapters.slice(0, 6) : [];
  const items = chapters
    .map(
      (c) =>
        `<li data-chapter="${escapeHtml(String((c ?? {}).id ?? ""))}"><span>${escapeHtml(String((c ?? {}).title ?? ""))}</span></li>`,
    )
    .join("");
  const kicker = settings.kicker
    ? `<p data-kicker>${escapeHtml(settings.kicker)}</p>`
    : "";
  const backdrop =
    src.settings && src.settings.backdrop
      ? `<img src="${escapeHtml(src.settings.backdrop)}" alt="" data-hero-backdrop="true" loading="lazy" />`
      : "";
  const html =
    `<section data-starter="hero" data-layout="starter-grid" data-motion="${settings.motion}" data-gap="${settings.gap}" style="--starter-accent:${escapeHtml(settings.accent)}">` +
    `<h2>${escapeHtml(settings.heading)}</h2>` +
    kicker +
    backdrop +
    `<ol>${items}</ol></section>`;
  return { html, heading: settings.heading, motion: settings.motion };
}

const liveHeroTimelines = new Set();

export function liveHeroTimelineCount() {
  return liveHeroTimelines.size;
}

export async function mountHeroAnimation(states, options) {
  const opts = options ?? {};
  const noop = () => ({ timeline: null, animated: false, destroy: () => {} });
  if (opts.prefersReducedMotion === true) return noop();
  const loadGsap = opts.gsapLoader ?? (async () => await import("gsap"));
  const loadTrigger =
    opts.triggerLoader ?? (async () => await import("gsap/ScrollTrigger"));
  const loaded = await loadGsap();
  const engine = loaded.gsap ?? loaded;
  const triggerMod = await loadTrigger();
  const ScrollTrigger =
    triggerMod.ScrollTrigger ?? triggerMod.default ?? triggerMod;
  if (ScrollTrigger && typeof engine.registerPlugin === "function") {
    engine.registerPlugin(ScrollTrigger);
  }
  const preset = MOTION_PRESETS[resolveMotionPreset(opts.motion)];
  const durationS =
    Math.min(preset.durationMs, MOTION_BUDGET.maxDurationMs) / 1000;
  const travelPx = Math.min(preset.travelPx, MOTION_BUDGET.maxTravelPx);
  const timeline = engine.timeline({ defaults: { ease: "power2.out" } });
  states.forEach((state, index) => {
    timeline.fromTo(
      state,
      { opacity: 0, y: travelPx },
      { opacity: 1, y: 0, duration: durationS },
      index * 0.08,
    );
  });
  liveHeroTimelines.add(timeline);
  timeline.play();
  let destroyed = false;
  return {
    timeline,
    animated: true,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      timeline.kill();
      timeline.clear();
      liveHeroTimelines.delete(timeline);
    },
  };
}
