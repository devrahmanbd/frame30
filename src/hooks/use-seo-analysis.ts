/**
 * Live SEO scoring for the admin, off the main thread (Phase 2).
 *
 * Behaviour we actually need in production, not a happy-path wrapper:
 *  - debounced so typing does not queue one analysis per keystroke;
 *  - single-flight with a monotonic request id, so a slow answer for an old
 *    draft can never overwrite the score for the current one;
 *  - hard timeout per request — a wedged worker is terminated and respawned
 *    once, then we fall back to synchronous analysis permanently;
 *  - graceful degradation where `Worker` does not exist (SSR, old Safari,
 *    blocked blob workers): the same pure function runs inline;
 *  - the worker is torn down on unmount, so navigating away frees the thread.
 *
 * The score is always available: `report` is never null after the first pass.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { analyseSeo, type SeoDraft, type SeoReport } from "@/lib/seo-analysis";
import { SEO_WORKER_PROTOCOL, type SeoWorkerResponse } from "@/lib/seo-analysis-worker-contract";

export type SeoAnalysisState = {
  report: SeoReport;
  /** True while a newer draft is being scored. */
  analysing: boolean;
  /** Where the last report came from — surfaced in the UI as a quiet note. */
  source: "worker" | "inline";
  /** Wall time of the last worker analysis, for the perf budget assertion. */
  lastMs: number;
};

const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 2_000;
const MAX_WORKER_FAILURES = 2;

function createWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/seo-analysis.worker.ts", import.meta.url), {
      type: "module",
      name: "seo-analysis",
    });
  } catch {
    return null;
  }
}

export function useSeoAnalysis(draft: SeoDraft, options: { debounceMs?: number } = {}): SeoAnalysisState {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;

  // The first report is computed inline so the panel never flashes empty.
  const initial = useMemo(() => analyseSeo(draft), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<SeoAnalysisState>({
    report: initial,
    analysing: false,
    source: "inline",
    lastMs: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const failuresRef = useRef(0);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Serialising the draft is cheaper than deep-comparing it on every render and
  // gives us a stable dependency for the effect below.
  const key = JSON.stringify(draft);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, analysing: true }));

    const runInline = () => {
      if (cancelled) return;
      const started = Date.now();
      const report = analyseSeo(draftRef.current);
      setState({ report, analysing: false, source: "inline", lastMs: Date.now() - started });
    };

    const schedule = () => {
      if (failuresRef.current >= MAX_WORKER_FAILURES) {
        runInline();
        return;
      }
      if (!workerRef.current) workerRef.current = createWorker();
      const worker = workerRef.current;
      if (!worker) {
        failuresRef.current = MAX_WORKER_FAILURES;
        runInline();
        return;
      }

      const id = (requestRef.current += 1);

      const onMessage = (event: MessageEvent<SeoWorkerResponse>) => {
        const data = event.data;
        if (!data || data.id !== id) return; // stale answer for an older draft
        cleanup();
        if (cancelled) return;
        if (data.ok) {
          failuresRef.current = 0;
          setState({ report: data.report, analysing: false, source: "worker", lastMs: data.ms });
        } else {
          failuresRef.current += 1;
          runInline();
        }
      };

      const onError = () => {
        cleanup();
        failuresRef.current += 1;
        worker.terminate();
        workerRef.current = null;
        runInline();
      };

      const cleanup = () => {
        worker.removeEventListener("message", onMessage as EventListener);
        worker.removeEventListener("error", onError);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };

      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", onError);

      timeoutRef.current = setTimeout(() => {
        // A worker that missed its budget is not trusted again this session.
        cleanup();
        failuresRef.current += 1;
        worker.terminate();
        workerRef.current = null;
        runInline();
      }, TIMEOUT_MS);

      worker.postMessage({ v: SEO_WORKER_PROTOCOL, id, draft: draftRef.current });
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(schedule, debounceMs);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, debounceMs]);

  return state;
}
