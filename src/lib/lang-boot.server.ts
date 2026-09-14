/**
 * Server half of the language boot (§10.6 CLS fix).
 *
 * `@tanstack/react-start/server` is blocked from the client graph by import
 * protection, and `src/routes/__root.tsx` is by definition in that graph — even
 * a `await import()` inside an `import.meta.env.SSR` branch is rejected at
 * resolve time, which 500'd the whole document. The request read therefore lives
 * in a `.server.ts` module (blocked by filename, never bundled for the browser)
 * and the root route reaches it through `createIsomorphicFn`.
 *
 * Fail-soft: a cosmetic preference must never fail a document, so every failure
 * path resolves to English.
 */
import { getRequest } from "@tanstack/react-start/server";
import { resolveRequestLang, type BootLang } from "./lang-boot";

export function readServerBootLang(): BootLang {
  try {
    const request = getRequest();
    const url = new URL(request.url);
    return resolveRequestLang({
      search: url.search,
      cookieHeader: request.headers.get("cookie"),
    });
  } catch {
    // No request context (prerender, a unit test, a warmed render): English is
    // the documented default and the client corrects it on the next paint.
    return "en";
  }
}
