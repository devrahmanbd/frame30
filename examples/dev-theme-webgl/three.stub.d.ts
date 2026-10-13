/**
 * Ambient stub so the capability-gated dynamic `import("three")` typechecks
 * in editors without adding `three` to the root `package.json`.
 *
 * `three` is intentionally NOT installed at the repo root: the declared pin
 * in `dev.theme.json` is vendored by the bundle pipeline at bundle time
 * (see `manifest.ts`). Theme code must only reach the engine through the
 * lazy loader in `webgl-product-showcase.ts` — never a static import.
 */
declare module "three";
