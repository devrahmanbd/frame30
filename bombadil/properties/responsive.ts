import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts horizontal dimensions of document and viewport.
 * Invariant: document.documentElement.scrollWidth <= window.innerWidth
 */
const dimensions = extract((state: State) => {
  const doc = state.document?.documentElement;
  const win = state.window;
  return {
    scrollWidth: doc?.scrollWidth ?? 0,
    clientWidth: doc?.clientWidth ?? (win?.innerWidth ?? 0),
    innerWidth: win?.innerWidth ?? 0,
  };
});

export const no_horizontal_overflow = always(() => {
  const { scrollWidth, innerWidth } = dimensions.current;
  if (!innerWidth || !scrollWidth) return true;
  // Allow a 1px subpixel rendering margin
  return scrollWidth <= innerWidth + 1;
});
