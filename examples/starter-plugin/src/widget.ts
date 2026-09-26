/**
 * Starter plugin widget — the single source of truth for the widget the
 * manifest in `../manifest.json` declares.
 *
 * `WIDGET_ENTRY` is the exact string shipped as `widgets[0].entry`. It runs
 * inside the null-origin sandbox frame, so it keeps to plain DOM calls:
 * no `eval(`, `import(`, `new Function`, `document.write(`, or
 * `.innerHTML =` — every one of those fails the bundle gate.
 */
export const PLUGIN_ID = "starter-hello";
export const WIDGET_KEY = "greeting";

/** Namespaced key: `plugin:{pluginId}/{widget}`. */
export const NAMESPACED_KEY = `plugin:${PLUGIN_ID}/${WIDGET_KEY}`;

export const WIDGET_ENTRY =
  'var box=document.createElement("div");box.textContent="Hello from the starter plugin.";framique.mount(box);';

export const WIDGET_SLOT = "main" as const;
export const WIDGET_HEIGHT = 160;
