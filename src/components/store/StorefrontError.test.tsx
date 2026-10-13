/**
 * Frame30 storefront resilience — shared error-boundary contract.
 *
 * Storefront loaders used to `throw notFound()` on ANY null payload with no
 * `errorComponent` on the route, so a transient backend blip (5xx/timeout)
 * misreported as a permanent 404 with no retry affordance. The contract:
 *
 * - `isStorefrontInfrastructureError` distinguishes retryable transport
 *   failures (thrown 5xx/408/429, timeouts, fetch failures) from routing
 *   outcomes (`notFound()` signals, redirects, 4xx) and from null data.
 * - A thrown 500-class error takes the retry path (shared errorComponent);
 *   a null payload keeps taking the `notFound()` path (genuine unknown slug).
 * - `normalizeStorefrontLoaderError` guarantees the boundary always receives
 *   an `Error` instance, even when a transport throws a string/null.
 * - `StorefrontError` renders a localized message plus a retry button that
 *   invalidates the loader (`router.invalidate()`).
 *
 * Vitest env node — NO jsdom. Static markup via renderToStaticMarkup.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Router mock: `useRouter` supplies `invalidate` for the retry button; every
// other export stays real (notably `notFound`, used below as a fixture).
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => ({ invalidate: () => undefined }),
  };
});

import { notFound } from "@tanstack/react-router";
import { LanguageProvider } from "@/lib/i18n";
import {
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
  StorefrontError,
} from "./StorefrontError";

describe("isStorefrontInfrastructureError", () => {
  it("maps a thrown 500-class error to the retry path", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(
        isStorefrontInfrastructureError(
          Object.assign(new Error("backend blew up"), { status }),
        ),
      ).toBe(true);
      expect(
        isStorefrontInfrastructureError(
          Object.assign(new Error("backend blew up"), { statusCode: status }),
        ),
      ).toBe(true);
    }
  });

  it("maps timeouts and transport failures to the retry path", () => {
    expect(
      isStorefrontInfrastructureError(
        Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
      ),
    ).toBe(true);
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isStorefrontInfrastructureError(abort)).toBe(true);
    expect(isStorefrontInfrastructureError(new Error("fetch failed"))).toBe(
      true,
    );
    expect(isStorefrontInfrastructureError(new Error("timed out"))).toBe(true);
    expect(
      isStorefrontInfrastructureError(
        new Error("Server function failed with status 502"),
      ),
    ).toBe(true);
  });

  it("maps null data to the notFound path, never the retry path", () => {
    expect(isStorefrontInfrastructureError(null)).toBe(false);
    expect(isStorefrontInfrastructureError(undefined)).toBe(false);
  });

  it("reserves notFound() signals and redirects for the 404 path", () => {
    expect(isStorefrontInfrastructureError(notFound())).toBe(false);
    expect(
      isStorefrontInfrastructureError({ options: { href: "/elsewhere" } }),
    ).toBe(false);
  });

  it("does not mistake 4xx/client errors for infrastructure failures", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(
        isStorefrontInfrastructureError(
          Object.assign(new Error("client error"), { status }),
        ),
      ).toBe(false);
    }
    expect(isStorefrontInfrastructureError(new Error("Invalid uuid"))).toBe(
      false,
    );
  });
});

describe("normalizeStorefrontLoaderError", () => {
  it("passes Error instances through untouched", () => {
    const err = new Error("boom");
    expect(normalizeStorefrontLoaderError(err)).toBe(err);
  });

  it("wraps non-Error throws so the boundary always gets an Error", () => {
    const wrapped = normalizeStorefrontLoaderError("socket hang up");
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toContain("storefront_unavailable");
    expect(normalizeStorefrontLoaderError(null)).toBeInstanceOf(Error);
  });
});

describe("StorefrontError", () => {
  it("renders a localized message with a retry affordance", () => {
    const html = renderToStaticMarkup(
      createElement(StorefrontError, { error: new Error("boom") }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t load this storefront");
    expect(html).toContain("Try again");
    expect(html).toContain("<button");
  });

  it("renders Bangla copy under the Bangla locale", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        initialLang: "bn",
        children: createElement(StorefrontError),
      }),
    );
    expect(html).toContain("এই দোকানটি লোড করা যায়নি");
    expect(html).toContain("আবার চেষ্টা করুন");
  });

  it("retries by invalidating the loader (not by navigating away)", () => {
    const src = readFileSync(
      "src/components/store/StorefrontError.tsx",
      "utf8",
    );
    expect(src).toContain("router.invalidate()");
  });
});
