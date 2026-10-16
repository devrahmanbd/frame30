/**
 * Level B real-execution fixture — theme entry (TEMPLATE).
 *
 * This file is NOT assembled directly. The E2E prep (`.e2e/helpers-levelb.ts`
 * `prepareRealTheme`) substitutes the four `__VENDOR_*__` tokens with the
 * content-hashed output names of the repo's OWN `gsap` ESM sources
 * (`gsap-core.js` verbatim, `CSSPlugin.js` + `ScrollTrigger.js` verbatim
 * except their single intra-package relative specifier pinned to the hashed
 * sibling, `Observer.js` verbatim) and `three` (`three.core.js` verbatim),
 * then feeds the result through the REAL assemble → review → publish
 * pipeline. Reviewed bytes therefore import the genuine libraries by pinned
 * relative URLs — no hand-written animation stand-ins anywhere in this
 * file. (The UMD `dist/` builds are NOT used: their wrapper assigns
 * `window.window` and throws when loaded as an ES module — measured.)
 *
 * Runtime contract (inside the sandboxed frame, `type="module"`):
 * - Genuine ESM imports: `gsap` core + `CSSPlugin` + `ScrollTrigger`
 *   (registered via the real `gsap.registerPlugin`) and the whole `three`
 *   namespace (document order: gsap-core, cssplugin, observer,
 *   scrolltrigger, three, app — see `selectDevThemeDocumentAssets`).
 * - A GSAP timeline animates the hero mount (opacity + x) to a verifiable
 *   end state; a ScrollTrigger scrub tween is created and the frame is
 *   scrolled so its progress is observable.
 * - A REAL `THREE.WebGLRenderer` renders a real scene (box mesh + camera)
 *   and reports `renderer.info`; when headless lacks a GPU the genuine
 *   fallback path runs instead and reports WHY (error text) — the spec
 *   asserts which path executed.
 * - The ONLY frame→host signal is one `parent.postMessage` receipt (the
 *   opaque host cannot read frame DOM). Every path — success, reduced
 *   motion, failure — posts exactly one receipt so the host never hangs.
 */

import { gsap } from "./__VENDOR_GSAP_CORE__";
import { CSSPlugin } from "./__VENDOR_CSSPLUGIN__";
import { ScrollTrigger } from "./__VENDOR_SCROLLTRIGGER__";
import * as THREE from "./__VENDOR_THREE__";

gsap.registerPlugin(CSSPlugin, ScrollTrigger);

const RECEIPT_VERSION = "e2e-levelb-real";

function postReceipt(payload) {
  try {
    parent.postMessage({ v: RECEIPT_VERSION, executed: true, ...payload }, "*");
  } catch {
    // The host listener may be absent in isolation; receipt loss is observed
    // by the host's wait, never by a throw here.
  }
}

export function HeroCanvas(el) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    el.style.opacity = "1";
    return Promise.resolve({ reduced: true, progress: 0 });
  }
  // Scrollable runway so the scrub tween below has genuine scroll to bind.
  document.body.style.minHeight = "300vh";
  const entrance = gsap.to(el, {
    opacity: 1,
    x: 0,
    duration: 0.4,
    ease: "power2.out",
    paused: true,
  });
  const st = ScrollTrigger.create({
    trigger: el,
    start: "top 95%",
    end: "bottom top",
    scrub: true,
    animation: gsap.to(el, { rotation: 8, duration: 1, paused: true }),
  });
  window.scrollTo(0, document.body.scrollHeight);
  return new Promise((resolve) => {
    entrance.eventCallback("onComplete", () => {
      // Let the scrubbed scroll settle, then report observables.
      window.setTimeout(() => {
        const done = {
          reduced: false,
          instances: ScrollTrigger.getAll().length,
          progress: st.progress,
        };
        try {
          st.kill();
        } catch {
          // Teardown is best-effort; the observables above already hold.
        }
        resolve(done);
      }, 300);
    });
    entrance.play();
  });
}

export function WebglScene(root) {
  const canvas = root.querySelector("[data-webgl-canvas]");
  const fallback = document.querySelector("[data-fallback]");
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 3;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x66ccff }),
    );
    scene.add(mesh);
    renderer.render(scene, camera);
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    if (calls < 1) throw new Error("renderer reported no draw calls");
    return {
      mode: "webgl",
      revision: THREE.REVISION,
      calls,
      triangles,
      reason: "",
    };
  } catch (err) {
    if (fallback) fallback.hidden = false;
    return {
      mode: "fallback",
      revision: THREE.REVISION,
      calls: 0,
      triangles: 0,
      reason: String((err && err.message) || err).slice(0, 200),
    };
  }
}

async function boot() {
  try {
    const hero = document.querySelector("[data-hero-canvas]");
    const scene = document.querySelector("[data-webgl-scene]");
    if (!hero || !scene) throw new Error("theme mounts missing");
    const three = WebglScene(scene);
    const motion = await HeroCanvas(hero);
    const style = window.getComputedStyle(hero);
    postReceipt({
      ok: true,
      reduced: motion.reduced,
      gsapVersion: gsap.version,
      gsapFinalOpacity: style.opacity,
      stVersion: ScrollTrigger.version,
      stInstances: motion.instances ?? 0,
      stProgress: motion.progress ?? 0,
      threeRevision: three.revision,
      threeMode: three.mode,
      threeCalls: three.calls,
      threeTriangles: three.triangles,
      fallbackReason: three.reason,
    });
  } catch (err) {
    try {
      const fallback = document.querySelector("[data-fallback]");
      if (fallback) fallback.hidden = false;
    } catch {
      // Fallback reveal is best-effort before the failure receipt.
    }
    postReceipt({
      ok: false,
      reason: String((err && err.message) || err).slice(0, 200),
    });
  }
}

void boot();
