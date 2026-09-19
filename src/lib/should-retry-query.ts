/**
 * TanStack Query retry predicate — never retry rate-limited calls.
 *
 * Context (Sept 2026 live incident): the dashboard fans out dozens of
 * server-function calls on mount (route loaders + hover preloads +
 * hydration re-execution). When a per-user bucket trips, the default
 * `retry: 3` turns one 429 into a retry storm that keeps every bucket
 * exhausted. Retrying a 429 is also semantically wrong — the server
 * already told us to back off (`retry-after` header).
 *
 * Non-rate-limit errors keep the previous default (up to 3 attempts).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  if (/rate_limit|429|too many requests/i.test(message)) return false;
  return failureCount < 3;
}
