import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts image load integrity across DOM states.
 * Invariant: No broken images (completed images must have naturalWidth > 0).
 */
const imageInspection = extract((state: State) => {
  const doc = state.document;
  const images = Array.from(doc?.querySelectorAll("img") ?? []);
  if (images.length === 0) {
    return { brokenCount: 0, totalCount: 0 };
  }

  const broken = images.filter((img) => {
    const el = img as HTMLImageElement;
    // Check if the image source is defined and the image completed loading with 0 natural width
    return el.complete && el.naturalWidth === 0 && (el.currentSrc || el.src);
  });

  return {
    brokenCount: broken.length,
    totalCount: images.length,
  };
});

export const all_images_loaded = always(() => imageInspection.current.brokenCount === 0);
