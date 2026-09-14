/// <reference lib="webworker" />
/**
 * SEO analysis worker (Phase 2).
 *
 * Scoring a 5k-word article touches every word several times. On the main
 * thread that is a visible keystroke stall in the editor, so the whole
 * analysis runs here instead. The worker owns no state beyond the request id:
 * it is a pure function behind `postMessage`, which means it can be killed and
 * respawned at any time and the caller loses nothing but one score.
 *
 * Protocol (versioned so a stale cached worker cannot silently mis-answer):
 *   in  → { v: 1, id: number, draft: SeoDraft }
 *   out → { v: 1, id: number, ok: true, report, ms } | { v: 1, id, ok: false, error }
 */
import { analyseSeo } from "./seo-analysis";
import { SEO_WORKER_PROTOCOL, type SeoWorkerRequest, type SeoWorkerResponse } from "./seo-analysis-worker-contract";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<SeoWorkerRequest>) => {
  const request = event.data;
  if (!request || request.v !== SEO_WORKER_PROTOCOL) return;
  const started = Date.now();
  try {
    const report = analyseSeo(request.draft);
    const response: SeoWorkerResponse = {
      v: SEO_WORKER_PROTOCOL,
      id: request.id,
      ok: true,
      report,
      ms: Date.now() - started,
    };
    scope.postMessage(response);
  } catch (error) {
    const response: SeoWorkerResponse = {
      v: SEO_WORKER_PROTOCOL,
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
});
