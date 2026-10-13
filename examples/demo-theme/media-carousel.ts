/**
 * Demo theme fixture — lazy media carousel (section 2 of 3).
 *
 * A bespoke lookbook carousel proving rich media ships without touching
 * core: slides arrive as platform-provided values (merchant picks through
 * the image control surface up, catalogue art alongside), merchant settings
 * use only the closed builder-field set (§4: text, image, spacing,
 * animation), and the block binds to the `main` slot by registration (§3).
 *
 * Loading contract: nothing below the fold fetches until the host marks the
 * block visible. The hidden render carries `data-src` placeholders and no
 * `src` attributes, so a loader stub stays silent; `requestSlideLoad` is the
 * single gate the tests assert against. Video slides degrade to their still
 * frame when the host reports no video support, and an empty slide list
 * renders a quiet empty note instead of failing.
 */

import {
  clampInt,
  escapeHtml,
  resolveMotionPreset,
  type MotionPreset,
} from "./shared";

export const CAROUSEL_SECTION_KEY = "media-carousel";
export const CAROUSEL_COMPONENT_NAME = "MediaCarousel";
export const CAROUSEL_SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const CAROUSEL_REQUIRED_CAPABILITIES = [
  "presentation",
  "animation",
] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const CAROUSEL_SETTINGS_SCHEMA = [
  { key: "carousel-caption", label: "Carousel caption", type: "text" },
  { key: "carousel-poster", label: "Carousel poster", type: "image" },
  { key: "carousel-gap", label: "Carousel spacing", type: "spacing" },
  { key: "carousel-motion", label: "Carousel motion", type: "animation" },
] as const;

export type CarouselSlideKind = "image" | "video";

export type CarouselSlide = {
  kind: CarouselSlideKind;
  src: string;
  poster: string;
  alt: string;
};

export type CarouselSlideInput = {
  kind?: unknown;
  src?: unknown;
  poster?: unknown;
  alt?: unknown;
};

export type CarouselSettings = {
  caption: string;
  poster: string;
  gap: number;
  motion: MotionPreset;
};

export type CarouselSettingsInput = {
  caption?: unknown;
  poster?: unknown;
  gap?: unknown;
  motion?: unknown;
};

export const DEFAULT_CAROUSEL_SETTINGS: CarouselSettings = {
  caption: "Lookbook",
  poster: "",
  gap: 16,
  motion: "standard",
};

export function coerceCarouselSettings(
  input: CarouselSettingsInput,
): CarouselSettings {
  const caption =
    typeof input.caption === "string" && input.caption.trim().length > 0
      ? input.caption.trim().slice(0, 80)
      : DEFAULT_CAROUSEL_SETTINGS.caption;
  const poster =
    typeof input.poster === "string" ? input.poster.trim().slice(0, 2048) : "";
  return {
    caption,
    poster,
    gap: clampInt(input.gap, DEFAULT_CAROUSEL_SETTINGS.gap, 0, 64),
    motion: resolveMotionPreset(input.motion),
  };
}

/**
 * Coerce platform-provided slide values. Unknown kinds and empty sources
 * are dropped; at most 12 slides ride one carousel.
 */
export function coerceCarouselSlides(input: unknown): CarouselSlide[] {
  if (!Array.isArray(input)) return [];
  const out: CarouselSlide[] = [];
  for (const raw of input) {
    if (out.length >= 12) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const slide = raw as CarouselSlideInput;
    if (slide.kind !== "image" && slide.kind !== "video") continue;
    if (typeof slide.src !== "string" || slide.src.trim().length === 0)
      continue;
    out.push({
      kind: slide.kind,
      src: slide.src.trim().slice(0, 2048),
      poster:
        typeof slide.poster === "string"
          ? slide.poster.trim().slice(0, 2048)
          : "",
      alt: typeof slide.alt === "string" ? slide.alt.trim().slice(0, 120) : "",
    });
  }
  return out;
}

/* ------------------------------------------------------- lazy-load gate */

export type SlideLoadResult = "loaded" | "gated" | "missing";

export type SlideLoader = (slide: CarouselSlide) => void;

export type CarouselGate = {
  markVisible: () => void;
  reset: () => void;
  isVisible: () => boolean;
  loadedCount: () => number;
  requestLoad: (
    index: number,
    slides: readonly CarouselSlide[],
    loader: SlideLoader,
  ) => SlideLoadResult;
};

/**
 * The single gate between the carousel and the network. While the block is
 * hidden every request resolves `gated` and the loader is never invoked —
 * the test asserts the loader stub stays silent. `reset` models observer
 * disconnect on unmount.
 */
export function createCarouselGate(): CarouselGate {
  let visible = false;
  const loaded = new Set<number>();
  return {
    markVisible: () => {
      visible = true;
    },
    reset: () => {
      visible = false;
      loaded.clear();
    },
    isVisible: () => visible,
    loadedCount: () => loaded.size,
    requestLoad: (index, slides, loader) => {
      if (!visible) return "gated";
      const slide = slides[index];
      if (!slide) return "missing";
      loader(slide);
      loaded.add(index);
      return "loaded";
    },
  };
}

/** Unmount hook: close the gate so no further load can start. */
export function destroyCarouselGate(gate: CarouselGate): void {
  gate.reset();
}

/* ---------------------------------------------------------------- render */

export type CarouselRenderInput = {
  settings: CarouselSettingsInput;
  slides: unknown;
  /** Host intersection state: false keeps every slide a placeholder. */
  visible: boolean;
  /** Host video support probe: false renders stills for video slides. */
  supportsVideo: boolean;
};

export type CarouselRenderOutput = {
  html: string;
  slides: CarouselSlide[];
  caption: string;
  motion: MotionPreset;
};

function renderHiddenSlide(slide: CarouselSlide, index: number): string {
  const alt = escapeHtml(slide.alt);
  if (slide.kind === "video") {
    return (
      `<li data-slide="${index}" data-kind="video">` +
      `<video data-src="${escapeHtml(slide.src)}" data-poster="${escapeHtml(slide.poster)}" preload="none"></video>` +
      `<span>${alt}</span></li>`
    );
  }
  return (
    `<li data-slide="${index}" data-kind="image">` +
    `<img data-src="${escapeHtml(slide.src)}" alt="${alt}" />` +
    `</li>`
  );
}

function renderShownSlide(
  slide: CarouselSlide,
  index: number,
  supportsVideo: boolean,
  fallbackPoster: string,
): string {
  const alt = escapeHtml(slide.alt);
  if (slide.kind === "video" && supportsVideo) {
    return (
      `<li data-slide="${index}" data-kind="video">` +
      `<video src="${escapeHtml(slide.src)}" poster="${escapeHtml(slide.poster)}" controls preload="metadata"></video>` +
      `<span>${alt}</span></li>`
    );
  }
  if (slide.kind === "video") {
    const still = slide.poster || fallbackPoster;
    return (
      `<li data-slide="${index}" data-kind="video" data-fallback="image">` +
      `<img src="${escapeHtml(still)}" alt="${alt}" loading="lazy" />` +
      `</li>`
    );
  }
  return (
    `<li data-slide="${index}" data-kind="image">` +
    `<img src="${escapeHtml(slide.src)}" alt="${alt}" loading="lazy" />` +
    `</li>`
  );
}

/**
 * Static-first render. Hidden output carries placeholders only (no `src`
 * attributes on media); shown output carries real sources. Video without
 * host support renders the still frame; no slides renders an empty note.
 */
export function renderMediaCarousel(
  input: CarouselRenderInput,
): CarouselRenderOutput {
  const settings = coerceCarouselSettings(input.settings);
  const slides = coerceCarouselSlides(input.slides);
  const items =
    slides.length === 0
      ? `<p data-empty="carousel">Fresh stories are on their way.</p>`
      : slides
          .map((slide, index) =>
            input.visible
              ? renderShownSlide(
                  slide,
                  index,
                  input.supportsVideo,
                  settings.poster,
                )
              : renderHiddenSlide(slide, index),
          )
          .join("");
  const html =
    `<section data-demo="${CAROUSEL_SECTION_KEY}" data-motion="${settings.motion}" data-gap="${settings.gap}">` +
    `<h2>${escapeHtml(settings.caption)}</h2>` +
    `<ul>${items}</ul></section>`;
  return { html, slides, caption: settings.caption, motion: settings.motion };
}

/** Host Section shape (§3): the registered key, never a core renderer fork. */
export type CarouselSection = {
  id: string;
  type: typeof CAROUSEL_SECTION_KEY;
  props: {
    caption: string;
    poster: string;
    gap: number;
    motion: MotionPreset;
  };
};

export function buildCarouselSection(
  id: string,
  settings: CarouselSettingsInput,
): CarouselSection {
  const coerced = coerceCarouselSettings(settings);
  return {
    id,
    type: CAROUSEL_SECTION_KEY,
    props: {
      caption: coerced.caption,
      poster: coerced.poster,
      gap: coerced.gap,
      motion: coerced.motion,
    },
  };
}
