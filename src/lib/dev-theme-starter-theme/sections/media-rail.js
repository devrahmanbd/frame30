/**
 * Frame30 starter — media rail (video interaction + custom layout).
 *
 * Lazy media rail: hidden output carries `data-src` placeholders and no
 * `src` attributes, so nothing fetches until the host marks the block
 * visible (`createMediaGate`). Shown video slides render a `video` element
 * with poster + controls + preload metadata; without host video support
 * they degrade to their still frame; an empty list renders a quiet note.
 * The rail wrapper carries the starter custom-layout token
 * (`data-layout="starter-rail"`), styled by styles/main.css.
 */

import {
  escapeHtml,
  clampInt,
  resolveMotionPreset,
} from "../components/shared.js";

export const MEDIA_RAIL_KEY = "media-rail";
export const MEDIA_RAIL_COMPONENT = "MediaRail";

export function coerceMediaSettings(input) {
  const src = input ?? {};
  const caption =
    typeof src.caption === "string" && src.caption.trim().length > 0
      ? src.caption.trim().slice(0, 80)
      : "Lookbook rail";
  const poster =
    typeof src.poster === "string" ? src.poster.trim().slice(0, 2048) : "";
  const note =
    typeof src.railNote === "string" ? src.railNote.trim().slice(0, 80) : "";
  return {
    caption,
    poster,
    note,
    gap: clampInt(src.gap, 16, 0, 64),
    motion: resolveMotionPreset(src.motion),
  };
}

export function coerceMediaSlides(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (out.length >= 12) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    if (raw.kind !== "image" && raw.kind !== "video") continue;
    if (typeof raw.src !== "string" || raw.src.trim().length === 0) continue;
    out.push({
      kind: raw.kind,
      src: raw.src.trim().slice(0, 2048),
      poster:
        typeof raw.poster === "string" ? raw.poster.trim().slice(0, 2048) : "",
      alt: typeof raw.alt === "string" ? raw.alt.trim().slice(0, 120) : "",
    });
  }
  return out;
}

export function createMediaGate() {
  let visible = false;
  const loaded = new Set();
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

function renderHiddenSlide(slide, index) {
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
    `<img data-src="${escapeHtml(slide.src)}" alt="${alt}" /></li>`
  );
}

function renderShownSlide(slide, index, supportsVideo, fallbackPoster) {
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
      `<img src="${escapeHtml(still)}" alt="${alt}" loading="lazy" /></li>`
    );
  }
  return (
    `<li data-slide="${index}" data-kind="image">` +
    `<img src="${escapeHtml(slide.src)}" alt="${alt}" loading="lazy" /></li>`
  );
}

export function renderMediaRail(input) {
  const src = input ?? {};
  const settings = coerceMediaSettings(src.settings ?? {});
  const slides = coerceMediaSlides(src.slides);
  const items =
    slides.length === 0
      ? `<p data-empty="rail">Fresh stories are on their way.</p>`
      : slides
          .map((slide, index) =>
            src.visible
              ? renderShownSlide(
                  slide,
                  index,
                  src.supportsVideo,
                  settings.poster,
                )
              : renderHiddenSlide(slide, index),
          )
          .join("");
  const note = settings.note
    ? `<p data-rail-note>${escapeHtml(settings.note)}</p>`
    : "";
  const html =
    `<section data-starter="${MEDIA_RAIL_KEY}" data-layout="starter-rail" data-motion="${settings.motion}" data-gap="${settings.gap}">` +
    `<h2>${escapeHtml(settings.caption)}</h2>` +
    note +
    `<ul>${items}</ul></section>`;
  return { html, slides, caption: settings.caption, motion: settings.motion };
}
