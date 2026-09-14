import { createServerFn } from "@tanstack/react-start";

/**
 * Public, unauthenticated read for `/`. Safe to call from a route loader on a
 * prerendered surface: it never touches a session and never throws.
 */
export const getLanding = createServerFn({ method: "GET" }).handler(async () => {
  const { loadLanding } = await import("./landing.server");
  return loadLanding();
});
