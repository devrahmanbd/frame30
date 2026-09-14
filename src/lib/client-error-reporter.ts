/**
 * Phase 12 — browser half of the single error reporter.
 *
 * The browser never holds a DSN. It posts a minimal, already-trimmed report to
 * `/api/public/errors`; the server scrubs it and fans it out to GlitchTip and
 * Sentry. That keeps one scrubbing implementation, one quota, and no error
 * backend address in the page source.
 *
 * Failure behaviour is deliberate: if the endpoint is unreachable the call is
 * swallowed and nothing is queued. A shopper's browser must never retry an
 * error report, and nothing sensitive is buffered anywhere.
 */
import {
  BROWSER_REPORT_MAX_BYTES,
  type BrowserErrorReport,
  type BrowserReportMechanism,
} from "./error-tracking";

const ENDPOINT = "/api/public/errors";
/** Hard ceiling per page view — a render loop cannot become a DoS on our own API. */
const MAX_REPORTS_PER_PAGE = 10;

let sent = 0;
let installed = false;
const seen = new Set<string>();

function release() {
  return import.meta.env["VITE_APP_RELEASE"] ?? undefined;
}

function commit() {
  return import.meta.env["VITE_COMMIT_SHA"] ?? undefined;
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack?.slice(0, 4_000) };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error)?.slice(0, 500) ?? "unknown error" };
  } catch {
    return { message: "unknown error" };
  }
}

export function reportBrowserError(error: unknown, mechanism: BrowserReportMechanism = "manual") {
  if (typeof window === "undefined") return;
  if (sent >= MAX_REPORTS_PER_PAGE) return;

  const { message, stack } = describe(error);
  if (!message) return;
  const dedupeKey = `${mechanism}:${message}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  sent += 1;

  const report: BrowserErrorReport = {
    message: message.slice(0, 500),
    ...(stack ? { stack } : {}),
    mechanism,
    route: window.location.pathname.slice(0, 200),
    ...(release() ? { release: release() } : {}),
    ...(commit() ? { commit: commit() } : {}),
  };

  let body = JSON.stringify(report);
  if (body.length > BROWSER_REPORT_MAX_BYTES) {
    body = JSON.stringify({ ...report, stack: undefined });
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* backend unreachable — degrade silently, buffer nothing */
    });
  } catch {
    /* fetch unavailable — nothing to do */
  }
}

/** Install the global handlers once, on the client only. */
export function installClientErrorReporter() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", (event) => {
    reportBrowserError(event.error ?? event.message, "onerror");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportBrowserError(event.reason, "unhandledrejection");
  });
}
