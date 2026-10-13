import { useRouter } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";

/**
 * True for retryable infrastructure failures: HTTP 5xx (and 408/429), aborts,
 * timeouts and transport-level fetch failures. Everything else — null data,
 * TanStack `notFound()` signals, redirects, 4xx client errors — is NOT
 * infrastructure, so loaders keep mapping those to the 404 path for genuine
 * unknown slugs instead of offering a retry for a page that cannot exist.
 */
export function isStorefrontInfrastructureError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err === "string") return isInfraMessage(err);
  if (typeof err !== "object") return false;
  const rec = err as Record<string, unknown>;
  // Routing outcomes are never infrastructure failures.
  if (rec.isNotFound === true) return false;
  if (
    typeof rec.options === "object" &&
    rec.options !== null &&
    typeof (rec.options as Record<string, unknown>).href === "string"
  )
    return false;
  const status =
    typeof rec.status === "number"
      ? rec.status
      : typeof rec.statusCode === "number"
        ? rec.statusCode
        : null;
  if (status !== null) {
    if (status >= 500 || status === 408 || status === 429) return true;
    return false;
  }
  if (typeof rec.code === "string") {
    const code = rec.code.toUpperCase().replace(/[-_\s]/g, "");
    if (
      code === "ETIMEDOUT" ||
      code === "ETIMEOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ECONNABORTED" ||
      code === "EAIAGAIN" ||
      code === "EPIPE" ||
      code === "ENOTFOUND" ||
      code === "FETCHFAILED" ||
      code === "NETWORKERROR" ||
      code === "ABORTERR"
    )
      return true;
  }
  const name = typeof rec.name === "string" ? rec.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (err instanceof Error) return isInfraMessage(err.message);
  return (
    typeof rec.message === "string" && isInfraMessage(rec.message as string)
  );
}

function isInfraMessage(message: string): boolean {
  return (
    /timed?\s?out/i.test(message) ||
    /socket hang up/i.test(message) ||
    /fetch failed|failed to fetch|network\s?(error|failure)?/i.test(message) ||
    /temporarily unavailable|bad gateway|service unavailable|gateway timeout/i.test(
      message,
    ) ||
    // "…failed with status 502" transport phrasing — the bare number alone
    // is deliberately NOT matched (e.g. "500 products" is not a failure).
    /status\s*(5\d\d)\b/i.test(message)
  );
}

/**
 * Loader catches rethrow through here so the shared boundary always receives
 * an `Error` instance (transports sometimes throw strings or null). Error
 * instances pass through untouched — message and stack preserved.
 */
export function normalizeStorefrontLoaderError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error("storefront_unavailable", { cause: err });
}

/**
 * Shared storefront failure UI. Rendered by `errorComponent` on every
 * `/store/$slug/*` route (and the root): a localized explanation plus a
 * retry button that invalidates the loader. Genuine unknown slugs never land
 * here — those keep rendering each route's `notFoundComponent`.
 */
export function StorefrontError({
  reset,
}: {
  error?: unknown;
  reset?: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
      <h1 className="text-2xl font-semibold">
        {t("Couldn't load this storefront", "এই দোকানটি লোড করা যায়নি")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "This looks like a temporary connection problem. Try again — nothing was lost.",
          "এটি সাময়িক সংযোগ সমস্যা বলে মনে হচ্ছে। আবার চেষ্টা করুন — কিছুই হারায়নি।",
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          reset?.();
          void router.invalidate();
        }}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        {t("Try again", "আবার চেষ্টা করুন")}
      </button>
    </main>
  );
}
