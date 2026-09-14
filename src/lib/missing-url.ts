import { notFound, redirect } from "@tanstack/react-router";
import { resolveMissingUrlFn } from "./url-lifecycle.functions";

/**
 * Phase 7.1 — what a storefront route throws when its row is gone.
 *
 * A renamed slug is a permanent move, a deleted product is permanently Gone,
 * and anything else is a genuine 404. Returning the same soft-404 for all
 * three is what leaves dead URLs in the index for months.
 */
export async function handleMissingStoreUrl(slug: string, path: string): Promise<unknown> {
  let verdict: { kind: string; status: number; location?: string } = { kind: "miss", status: 404 };
  try {
    verdict = await resolveMissingUrlFn({ data: { slug, path } });
  } catch {
    // Resolver failure must not mask the underlying miss.
  }

  if (verdict.kind === "redirect" && verdict.location) {
    return redirect({ href: verdict.location, statusCode: 301, throw: false });
  }

  if (false) {
    const { setDocumentStatus } = await import("./response-status.server");
    setDocumentStatus(verdict.kind === "gone" ? 410 : 404);
  }
  return notFound({ data: { gone: verdict.kind === "gone" } });
}
