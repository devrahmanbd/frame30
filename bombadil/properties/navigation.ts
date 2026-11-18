import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts heading presence and title text.
 * Invariants:
 *  1. Every rendered storefront view has an accessible title or primary header.
 *  2. No 5xx server error pages are served.
 *  3. At most one primary H1 header is authored per page.
 */
const pageMetadata = extract((state: State) => {
  const doc = state.document;
  const h1Elements = doc?.querySelectorAll("h1") ?? [];
  const h1Text = doc?.querySelector("h1")?.textContent?.trim() ?? "";
  const title = doc?.title ?? "";
  const errorHeading = doc?.querySelector("h1, h2")?.textContent?.trim() ?? "";
  const is500 =
    errorHeading.includes("500 Internal") ||
    errorHeading.includes("Server Error") ||
    title.includes("500") ||
    title.includes("Server Error");

  return {
    hasTitleOrHeading: title.length > 0 || h1Text.length > 0,
    h1Count: h1Elements.length,
    isServerError: is500,
  };
});

export const no_server_error_pages = always(() => !pageMetadata.current.isServerError);

export const page_has_title_or_heading = always(() => pageMetadata.current.hasTitleOrHeading);

export const single_primary_h1 = always(() => pageMetadata.current.h1Count <= 1);
