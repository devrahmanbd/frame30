/**
 * Per-route permission declarations.
 *
 * A console route declares `staticData: { permission: "orders.read" }` once and
 * two consumers read it: the shell hides nav entries the actor cannot use, and
 * the route gate refuses to render the page. Hiding is never the control — the
 * server function behind the page still enforces `requirePermission`.
 *
 * `/root` is intentionally not a consumer of this module: it has its own gate
 * and its own shell, and shares nothing with the merchant console.
 */

import type { Permission } from "./authz";

export type ConsoleStaticData = {
  /** Grant required to view this route. Absent = visible to any active member. */
  permission?: Permission;
  /** Nav label fallbacks; the shell owns presentation. */
  navHidden?: boolean;
  /** `false` = full-screen takeover (editors): no console sidebar/topbar. */
  chrome?: boolean;
};

export function consoleRoute(data: ConsoleStaticData): ConsoleStaticData {
  return data;
}

type MatchLike = { staticData?: unknown };

/** The most specific declared permission across the matched route chain. */
export function permissionFromMatches(matches: readonly MatchLike[]): Permission | null {
  let found: Permission | null = null;
  for (const match of matches) {
    const data = match.staticData as ConsoleStaticData | undefined;
    if (data && typeof data.permission === "string") found = data.permission;
  }
  return found;
}

/** True when any matched route asks to drop the console chrome. */
export function chromeFromMatches(matches: readonly MatchLike[]): boolean {
  for (const match of matches) {
    const data = match.staticData as ConsoleStaticData | undefined;
    if (data && data.chrome === false) return false;
  }
  return true;
}
