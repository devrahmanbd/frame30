/**
 * Frame30 starter — isolated WebGL scene (Three.js, React-compatible).
 *
 * Static-first render (`renderStarterWebgl`) is an isolated canvas
 * placeholder plus a poster still (the local asset under ../assets/). The
 * real Three.js frame (`mountStarterWebgl`) is reached ONLY through a dynamic
 * bare-specifier import behind the `webgl` capability gate, the
 * reduced-motion gate, and a canvas context probe. One frame, then dispose
 * forces context loss. A live-scene registry backs the no-leak assertion.
 */

import { escapeHtml } from "../components/shared.js";

export const STARTER_WEBGL_KEY = "webgl-scene";
export const STARTER_WEBGL_COMPONENT = "WebglScene";
export const STARTER_CLEAR_HEX = 0x1e1b4b;
export const STARTER_CUBE_HEX = 0xf59e0b;

export function coerceStarterWebgl(input) {
  const src = input ?? {};
  const caption =
    typeof src.caption === "string" && src.caption.trim().length > 0
      ? src.caption.trim().slice(0, 80)
      : "Night glow";
  const poster =
    typeof src.poster === "string" ? src.poster.trim().slice(0, 2048) : "";
  return { caption, poster };
}

export function renderStarterWebgl(input) {
  const src = input ?? {};
  const settings = coerceStarterWebgl(src.settings ?? {});
  const caption = escapeHtml(settings.caption);
  const poster = settings.poster
    ? `<img data-webgl-poster src="${escapeHtml(settings.poster)}" alt="${caption} still" loading="lazy" />`
    : `<img data-webgl-poster alt="${caption} still" />`;
  const html =
    `<section data-starter="${STARTER_WEBGL_KEY}" data-layout="starter-grid">` +
    `<h2>${caption}</h2>` +
    `<div data-webgl-stage><canvas data-webgl-canvas width="640" height="360"></canvas>` +
    poster +
    `</div></section>`;
  return { html, caption: settings.caption, poster: settings.poster };
}

const liveStarterScenes = new Set();

export function liveStarterSceneCount() {
  return liveStarterScenes.size;
}

export async function mountStarterWebgl(canvas, options) {
  const opts = options ?? {};
  const noop = () => ({ renderer: null, mounted: false, destroy: () => {} });
  const granted = Array.isArray(opts.capabilities) ? opts.capabilities : [];
  if (!granted.includes("webgl")) return noop();
  if (opts.prefersReducedMotion === true) return noop();
  let probe = null;
  try {
    probe = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  } catch {
    probe = null;
  }
  if (!probe) return noop();
  const load = opts.loader ?? (async () => await import("three"));
  const engine = await load();
  const scene = new engine.Scene();
  scene.background = new engine.Color(STARTER_CLEAR_HEX);
  const camera = new engine.PerspectiveCamera(
    45,
    canvas.width / Math.max(1, canvas.height),
    0.1,
    100,
  );
  camera.position.z = 4;
  camera.updateProjectionMatrix();
  const geometry = new engine.BoxGeometry(1.6, 1.6, 1.6);
  const material = new engine.MeshBasicMaterial({ color: STARTER_CUBE_HEX });
  const mesh = new engine.Mesh(geometry, material);
  mesh.rotation.x = 0.5;
  mesh.rotation.y = 0.7;
  scene.add(mesh);
  const renderer = new engine.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(canvas.width, canvas.height);
  renderer.render(scene, camera);
  const record = { renderer, geometry, material };
  liveStarterScenes.add(record);
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
      liveStarterScenes.delete(record);
    },
  };
}
