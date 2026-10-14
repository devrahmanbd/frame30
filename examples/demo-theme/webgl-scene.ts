/**
 * Demo theme fixture — isolated WebGL scene (section 4 of 4).
 *
 * A lookbook orbit scene proving rich 3D ships without touching core: the
 * static render below is complete with no JS and no GL (an isolated canvas
 * placeholder plus a poster still), merchant settings use only the closed
 * builder-field set (§4: text, image), and the block binds to the `main`
 * slot by registration (§3).
 *
 * Engine rules (mirrors the GSAP single-engine policy in `story-block.ts`):
 * the Three.js engine is reached ONLY through one dynamic three import —
 * never a static import — inside `mountWebglScene`. Two gates stand in
 * front of the engine and never touch it: the manifest `webgl` capability
 * declaration and the host reduced-motion probe. A canvas whose context
 * probe answers null keeps the poster still without loading the engine.
 * Mount renders exactly one frame (no loop, no listeners), so teardown is
 * a straight line: renderer + geometry + material dispose, forced context
 * loss, registry release. A live-scene registry backs the no-leak
 * assertion.
 */

import { escapeHtml } from "./shared";

export const WEBGL_SECTION_KEY = "webgl-scene";
export const WEBGL_COMPONENT_NAME = "WebglScene";
export const WEBGL_SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const WEBGL_REQUIRED_CAPABILITIES = ["presentation", "webgl"] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const WEBGL_SETTINGS_SCHEMA = [
  { key: "webgl-caption", label: "WebGL caption", type: "text" },
  { key: "webgl-poster", label: "WebGL poster", type: "image" },
] as const;

/** Backdrop wash behind the orbit cube. */
export const WEBGL_CLEAR_HEX = 0x1e1b4b;
/** Sunlit face of the orbit cube. */
export const WEBGL_CUBE_HEX = 0xf59e0b;

export type WebglSettings = {
  caption: string;
  poster: string;
};

export type WebglSettingsInput = {
  caption?: unknown;
  poster?: unknown;
};

export const DEFAULT_WEBGL_SETTINGS: WebglSettings = {
  caption: "Night glow",
  poster: "",
};

export function coerceWebglSettings(input: WebglSettingsInput): WebglSettings {
  const caption =
    typeof input.caption === "string" && input.caption.trim().length > 0
      ? input.caption.trim().slice(0, 80)
      : DEFAULT_WEBGL_SETTINGS.caption;
  const poster =
    typeof input.poster === "string" ? input.poster.trim().slice(0, 2048) : "";
  return { caption, poster };
}

/** Host Section shape (§3): the registered key, never a core renderer fork. */
export type WebglSection = {
  id: string;
  type: typeof WEBGL_SECTION_KEY;
  props: {
    caption: string;
    poster: string;
  };
};

export function buildWebglSection(
  id: string,
  settings: WebglSettingsInput,
): WebglSection {
  const coerced = coerceWebglSettings(settings);
  return {
    id,
    type: WEBGL_SECTION_KEY,
    props: {
      caption: coerced.caption,
      poster: coerced.poster,
    },
  };
}

export type WebglRenderInput = {
  settings: WebglSettingsInput;
};

export type WebglRenderOutput = {
  html: string;
  caption: string;
  poster: string;
};

/**
 * Static-first render: an isolated canvas placeholder plus the poster
 * still. With no JS and no GL the poster carries the section, so the
 * reduced-motion and no-WebGL fallbacks ARE this output.
 */
export function renderWebglScene(input: WebglRenderInput): WebglRenderOutput {
  const settings = coerceWebglSettings(input.settings);
  const caption = escapeHtml(settings.caption);
  const poster = settings.poster
    ? `<img data-webgl-poster src="${escapeHtml(settings.poster)}" alt="${caption} still" loading="lazy" />`
    : `<img data-webgl-poster alt="${caption} still" />`;
  const html =
    `<section data-demo="${WEBGL_SECTION_KEY}">` +
    `<h2>${caption}</h2>` +
    `<div data-webgl-stage>` +
    `<canvas data-webgl-canvas width="640" height="360"></canvas>` +
    poster +
    `</div></section>`;
  return { html, caption: settings.caption, poster: settings.poster };
}

/* ------------------------------------------------------ scene mount (three) */

/** Structural minimum the scene needs from a host canvas — no DOM import. */
export type WebglCanvasHost = {
  getContext(kind: string, attrs?: Record<string, unknown>): unknown | null;
  width: number;
  height: number;
};

export type WebglSceneLike = {
  background: unknown;
  add(child: unknown): void;
};

export type WebglCameraLike = {
  aspect: number;
  position: { x: number; y: number; z: number };
  updateProjectionMatrix(): void;
};

export type WebglRendererLike = {
  render(scene: unknown, camera: unknown): void;
  setSize(width: number, height: number): void;
  dispose(): void;
  forceContextLoss(): void;
};

export type WebglGeometryLike = {
  dispose(): void;
};

export type WebglMaterialLike = {
  dispose(): void;
};

export type WebglMeshLike = {
  rotation: { x: number; y: number };
};

/** Structural minimum the scene needs — no static three type import. */
export type WebglEngine = {
  Scene: new () => WebglSceneLike;
  PerspectiveCamera: new (
    fov: number,
    aspect: number,
    near: number,
    far: number,
  ) => WebglCameraLike;
  WebGLRenderer: new (options: {
    canvas: unknown;
    antialias: boolean;
    preserveDrawingBuffer?: boolean;
  }) => WebglRendererLike;
  BoxGeometry: new (
    width: number,
    height: number,
    depth: number,
  ) => WebglGeometryLike;
  MeshBasicMaterial: new (options: { color: number }) => WebglMaterialLike;
  Mesh: new (geometry: unknown, material: unknown) => WebglMeshLike;
  Color: new (hex: number) => unknown;
};

export type WebglEngineLoader = () => Promise<unknown>;

export type WebglMountOptions = {
  /** Host-granted manifest capabilities: must include `webgl`. */
  capabilities?: readonly unknown[];
  prefersReducedMotion?: boolean;
  /** Test/evidence readback: keep the frame around for pixel grabs. */
  preserveDrawingBuffer?: boolean;
  loader?: WebglEngineLoader;
};

export type MountedWebglScene = {
  renderer: WebglRendererLike | null;
  mounted: boolean;
  destroy: () => void;
};

const liveWebglScenes = new Set<object>();

/** Registry backing the no-leaked-context assertion. */
export function liveWebglSceneCount(): number {
  return liveWebglScenes.size;
}

/**
 * Enhance the static render with one real Three.js frame. The capability
 * gate, the reduced-motion gate, and the context probe each return the
 * static path BEFORE the engine loads. Call `destroy` on unmount to
 * dispose GL resources and force context loss.
 */
export async function mountWebglScene(
  canvas: WebglCanvasHost,
  options: WebglMountOptions = {},
): Promise<MountedWebglScene> {
  const noop = (): MountedWebglScene => ({
    renderer: null,
    mounted: false,
    destroy: () => {},
  });
  const granted = Array.isArray(options.capabilities)
    ? options.capabilities
    : [];
  if (!granted.includes("webgl")) return noop();
  if (options.prefersReducedMotion === true) return noop();

  let probe: unknown = null;
  try {
    probe = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  } catch {
    probe = null;
  }
  if (!probe) return noop();

  const load: WebglEngineLoader =
    options.loader ?? (async () => await import("three"));
  const engine = (await load()) as unknown as WebglEngine;

  const scene = new engine.Scene();
  scene.background = new engine.Color(WEBGL_CLEAR_HEX);
  const camera = new engine.PerspectiveCamera(
    45,
    canvas.width / Math.max(1, canvas.height),
    0.1,
    100,
  );
  camera.position.z = 4;
  camera.updateProjectionMatrix();
  const geometry = new engine.BoxGeometry(1.6, 1.6, 1.6);
  const material = new engine.MeshBasicMaterial({ color: WEBGL_CUBE_HEX });
  const mesh = new engine.Mesh(geometry, material);
  mesh.rotation.x = 0.5;
  mesh.rotation.y = 0.7;
  scene.add(mesh);

  const renderer = new engine.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  renderer.setSize(canvas.width, canvas.height);
  renderer.render(scene, camera);

  const record = { renderer, geometry, material };
  liveWebglScenes.add(record);
  let destroyed = false;
  return {
    renderer,
    mounted: true,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      renderer.dispose();
      renderer.forceContextLoss();
      geometry.dispose();
      material.dispose();
      liveWebglScenes.delete(record);
    },
  };
}
