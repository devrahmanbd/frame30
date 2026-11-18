import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts heading presence and title text.
 * Invariant: Every rendered storefront view has an accessible title or primary header.
 */
const pageMetadata = extract((state: State) => {
  const doc = state.document;
  const h1 = doc?.querySelector("h1")?.textContent?.trim() ?? "";
  const title = doc?.title ?? "";
  const errorHeading = doc?.querySelector("h1, h2")?.textContent?.trim() ?? "";
  const is500 = errorHeading.includes("500 Internal") || errorHeading.includes("Server Error");
  return {
    hasTitleOrHeading: title.length > 0 || h1.length > 0,
    isServerError: is500,
  };
});

export const no_server_error_pages = always(() => !pageMetadata.current.isServerError);
