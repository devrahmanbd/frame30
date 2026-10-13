/**
 * Level B WebGL capability proof — product showcase section definition.
 *
 * One developer section proving a `webgl` scene ships behind a
 * capability gate without touching core: data arrives only through the §5
 * read-scoped commerce context (`commerce.ts`), merchant settings use only
 * the closed builder-field set (§4: text, product-selection, image), and the
 * component binds to the `main` slot by registration — the core renderer
 * map stays closed (§3).
 *
 * Capability rules (single-engine pattern, mirroring the animation slice's
 * dynamic-`import("gsap")` policy in `examples/dev-theme-slice/`):
 * the Three.js engine is reached ONLY through a dynamic
 * `await import("three")` inside `mountShowcaseScene` — never a static
 * import — and only after the gate (`resolveShowcaseMode`) reports `webgl`.
 * The gate reports `static` when WebGL is unavailable OR when the visitor
 * prefers reduced motion, and the static-image fallback below is always
 * functional, so the section reads complete with no JS and no GPU at all.
 * Scenes are disposed on unmount; a live-scene registry backs the
 * no-leak assertion.
 *
 * Declared-but-unimplemented here: the bundle pipeline that vendors the
 * pinned `three` bytes and the human review checklist — see README.md.
 */

import type { ShowcaseCommerceContext, ShowcaseProduct } from "./commerce";
import { findShowcaseProducts, isShowcaseProductAvailable } from "./commerce";

export const SECTION_KEY = "webgl-showcase";
export const COMPONENT_NAME = "WebGLProductShowcase";
export const SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const REQUIRED_CAPABILITIES = [
  "presentation",
  "webgl",
  "commerce-read",
] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const SETTINGS_SCHEMA = [
  { key: "heading", label: "Heading", type: "text" },
  { key: "products", label: "Products", type: "product-selection" },
  { key: "poster", label: "Fallback poster", type: "image" },
] as const;

export type MerchantSettingsInput = {
  heading?: unknown;
  products?: unknown;
  poster?: unknown;
};

export type ShowcaseSettings = {
  heading: string;
  products: string[];
  poster: string;
};

export const DEFAULT_SETTINGS: ShowcaseSettings = {
  heading: "Featured in 3D",
  products: [],
  poster: "/ph/webgl/poster.jpg",
};

/** Unknown merchant input falls back to defaults — never a crash. */
export function coerceShowcaseSettings(
  input: MerchantSettingsInput,
): ShowcaseSettings {
  const heading =
    typeof input.heading === "string" && input.heading.trim().length > 0
      ? input.heading.trim().slice(0, 80)
      : DEFAULT_SETTINGS.heading;
  const products = Array.isArray(input.products)
    ? [...new Set(input.products.filter((id) => typeof id === "string"))]
    : [];
  const poster =
    typeof input.poster === "string" && input.poster.trim().length > 0
      ? input.poster.trim()
      : DEFAULT_SETTINGS.poster;
  return {
    heading,
    products: products.slice(0, 12),
    poster,
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
export type ShowcaseSection = {
  id: string;
  type: typeof SECTION_KEY;
  props: { heading: string; products: string[]; poster: string };
};

export function buildShowcaseSection(
  id: string,
  settings: MerchantSettingsInput,
): ShowcaseSection {
  const coerced = coerceShowcaseSettings(settings);
  return {
    id,
    type: SECTION_KEY,
    props: {
      heading: coerced.heading,
      products: coerced.products,
      poster: coerced.poster,
    },
  };
}

/* ------------------------------------------------------- capability gate */

export type ShowcaseMode = "webgl" | "static";

export type GateInput = {
  prefersReducedMotion?: boolean;
  /** Injectable probe result; defaults to the live `isWebGLAvailable`. */
  webglAvailable?: boolean;
};

/**
 * Capability gate: `webgl` only when a GL context exists AND the visitor
 * has not asked for reduced motion. Everything else renders the static
 * fallback — including SSR/node, where no canvas exists at all.
 */
export function resolveShowcaseMode(input: GateInput = {}): ShowcaseMode {
  if (input.prefersReducedMotion === true) return "static";
  const available = input.webglAvailable ?? isWebGLAvailable();
  return available ? "webgl" : "static";
}

/** Live probe. SSR-safe: no document, no throw — reports unavailable. */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return gl !== null && gl !== undefined;
  } catch {
    return false;
  }
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

/* ------------------------------------------------------------- rendering */

export type RenderInput = {
  settings: MerchantSettingsInput;
  commerce: ShowcaseCommerceContext;
  prefersReducedMotion: boolean;
  /** Injectable probe result for tests; defaults to the live probe. */
  webglAvailable?: boolean;
};

export type RenderOutput = {
  html: string;
  products: ShowcaseProduct[];
  heading: string;
  mode: ShowcaseMode;
  /** True whenever the static-image fallback is what the visitor gets. */
  fallback: boolean;
};

function renderCard(product: ShowcaseProduct): string {
  const available = isShowcaseProductAvailable(product);
  const image = product.images[0] ?? "/ph/webgl/placeholder.jpg";
  return (
    `<li data-showcase-card="${escapeHtml(product.id)}">` +
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
 * Static-first render: the fallback (poster image + product rail) is always
 * emitted and is fully functional with no JS and no GPU. In `webgl` mode a
 * canvas mount point is added AHEAD of the fallback; the loader enhances it
 * and the fallback stays as the no-JS poster beneath.
 */
export function renderWebGLProductShowcase(input: RenderInput): RenderOutput {
  const settings = coerceShowcaseSettings(input.settings);
  const products = findShowcaseProducts(input.commerce, settings.products);
  const mode = resolveShowcaseMode({
    prefersReducedMotion: input.prefersReducedMotion,
    webglAvailable: input.webglAvailable,
  });
  const cards = products.map(renderCard).join("");
  const mount =
    mode === "webgl"
      ? `<canvas data-showcase-mount="${SECTION_KEY}" aria-hidden="true"></canvas>`
      : "";
  const html =
    `<section data-showcase="${SECTION_KEY}" data-mode="${mode}">` +
    `<h2>${escapeHtml(settings.heading)}</h2>` +
    mount +
    `<img data-showcase-poster src="${escapeHtml(settings.poster)}" alt="" loading="lazy" />` +
    `<ul>${cards}</ul></section>`;
  return {
    html,
    products,
    heading: settings.heading,
    mode,
    fallback: mode === "static",
  };
}

/* ---------------------------------------------------------- scene mount */

export type ShowcaseGL = object;

export type ShowcaseCanvasLike = {
  getContext(kind: string): ShowcaseGL | null;
};

/** Structural minimum the slice needs — no static engine type import. */
export type ShowcaseScene = {
  render(): void;
  dispose(): void;
  isDisposed(): boolean;
};

export type ShowcaseEngine = {
  createScene(canvas: ShowcaseCanvasLike, gl: ShowcaseGL): ShowcaseScene;
};

export type ShowcaseEngineLoader = () => Promise<unknown>;

export type MountOptions = {
  prefersReducedMotion?: boolean;
  loader?: ShowcaseEngineLoader;
};

export type MountedShowcaseScene = {
  scene: ShowcaseScene | null;
  /** True whenever the static fallback stands (engine untouched). */
  fallback: boolean;
  destroy: () => void;
};

const liveShowcaseScenes = new Set<ShowcaseScene>();

/** Registry backing the no-leaked-scenes assertion. */
export function liveShowcaseSceneCount(): number {
  return liveShowcaseScenes.size;
}

function canvasContext(canvas: ShowcaseCanvasLike | null): ShowcaseGL | null {
  if (canvas === null || typeof canvas.getContext !== "function") return null;
  try {
    return canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  } catch {
    return null;
  }
}

function asEngine(loaded: unknown): ShowcaseEngine | null {
  if (typeof loaded !== "object" || loaded === null) return null;
  const record = loaded as Record<string, unknown>;
  const candidate =
    typeof record["createScene"] === "function"
      ? (loaded as ShowcaseEngine)
      : null;
  return candidate;
}

/**
 * Enhance a static render with a Three.js scene. The engine loads ONLY when
 * the gate reports `webgl`: under reduced motion or without a GL context
 * the loader is never called and the static fallback stands. Call `destroy`
 * on unmount to dispose the scene.
 */
export async function mountShowcaseScene(
  canvas: ShowcaseCanvasLike | null,
  options: MountOptions = {},
): Promise<MountedShowcaseScene> {
  const noop = (): MountedShowcaseScene => ({
    scene: null,
    fallback: true,
    destroy: () => {},
  });
  if (options.prefersReducedMotion === true) return noop();

  const gl = canvasContext(canvas);
  if (gl === null) return noop();

  const load: ShowcaseEngineLoader =
    options.loader ?? (async () => await import("three"));
  const engine = asEngine(await load());
  if (engine === null || canvas === null) return noop();

  const scene = engine.createScene(canvas, gl);
  liveShowcaseScenes.add(scene);
  scene.render();

  let destroyed = false;
  return {
    scene,
    fallback: false,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      scene.dispose();
      liveShowcaseScenes.delete(scene);
    },
  };
}
