import { LOCAL_HOSTNAMES, hostnameOf, resolveBaseURL } from "./helpers";

/**
 * Global setup: deterministic cold-start warm-up.
 *
 * The config `webServer.url` probe hits `/favicon.ico` on purpose — it
 * proves vite is serving without paying for (or depending on) an SSR
 * compile. The first SSR hit on `/theme-preview/songoskriti` is what is
 * cold-sensitive (dep re-optimize + route compile can exceed 180 s on a
 * fresh checkout), and it used to flake the first spec that touched the
 * preview route.
 *
 * So BEFORE any spec asserts, this probe GETs the preview route itself
 * until it answers 200, with a generous total budget. After this returns,
 * the SSR module graph is compiled and every spec's first navigation is
 * warm. Hermetic: loopback only (throws otherwise). No processes spawned,
 * no handles kept — nothing to clean up.
 */
export default async function globalSetup(): Promise<void> {
  const baseURL = resolveBaseURL();
  const host = hostnameOf(baseURL);
  if (host === null || !LOCAL_HOSTNAMES.has(host)) {
    throw new Error(`[e2e warm-up] refusing non-loopback baseURL: ${baseURL}`);
  }
  const target = `${baseURL}/theme-preview/songoskriti`;
  const budgetMs = 300_000;
  const attemptTimeoutMs = 120_000;
  const intervalMs = 2_000;
  const deadline = Date.now() + budgetMs;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const res = await fetch(target, {
        signal: controller.signal,
        redirect: "manual",
      });
      // Drain the body so the socket is released before specs run.
      try {
        await res.arrayBuffer();
      } catch {
        // Body drain is best-effort; status is the signal.
      }
      if (res.status === 200) {
        console.log(
          `[e2e warm-up] SSR ready: ${target} answered 200 after ${attempt} attempt(s)`,
        );
        return;
      }
      console.log(
        `[e2e warm-up] attempt ${attempt}: status ${res.status}, retrying…`,
      );
    } catch (err) {
      const reason =
        err instanceof Error ? err.name : String(err ?? "unknown error");
      console.log(`[e2e warm-up] attempt ${attempt}: ${reason}, retrying…`);
    } finally {
      clearTimeout(timer);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `[e2e warm-up] ${target} did not answer 200 within ${budgetMs / 1000}s ` +
          `(${attempt} attempts). Cold dep re-optimize may still be running; ` +
          `retry the run rather than weakening assertions.`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
