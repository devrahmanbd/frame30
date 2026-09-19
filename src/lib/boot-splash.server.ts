/**
 * Server half of the boot-splash gate.
 *
 * The splash must render ONLY for client-gated routes (the `_authenticated`
 * subtree, which sets `ssr: false` and would otherwise flash a white void on
 * reload). Public SSR routes stream content immediately — a splash there
 * would cover real pixels and hurt LCP. Same import-protection pattern as
 * `lang-boot.server.ts`: request read lives here, reached from `__root.tsx`
 * through `createIsomorphicFn`.
 */
import { getRequest } from "@tanstack/react-start/server";
import { isClientGatedPath } from "./boot-splash";

export function readServerBootSplash(): boolean {
  try {
    const request = getRequest();
    return isClientGatedPath(new URL(request.url).pathname);
  } catch {
    return false;
  }
}
