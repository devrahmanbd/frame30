import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

export interface ImageFailureRecord {
  url: string;
  reason:
    | "missing-src"
    | "invalid-src"
    | "incomplete-loading"
    | "zero-natural-dimensions"
    | "product-container-missing-img";
  selector?: string;
}

/**
 * Extracts comprehensive image load, decode, dimension, and DOM presence integrity across DOM states.
 *
 * Invariants:
 *  1. Expected product images exist (cards, heroes, galleries must not have empty image slots).
 *  2. Every image has a valid, non-empty, non-corrupt src attribute.
 *  3. Every image finishes loading (complete === true).
 *  4. Every image decodes successfully with naturalWidth > 0 and naturalHeight > 0.
 *  5. Lazy-loaded images that enter or approach viewport trigger loading without stalls.
 *  6. Any failed image URLs and specific failure reasons are captured directly for trace reporting.
 */
const imageInspection = extract((state: State) => {
  const doc = state.document;
  if (!doc) {
    return {
      totalImages: 0,
      brokenCount: 0,
      failedUrls: [] as string[],
      failureDetails: [] as ImageFailureRecord[],
    };
  }

  const failures: ImageFailureRecord[] = [];

  // 1. Verify expected images in product containers (cards, hero, gallery)
  const productContainers = Array.from(
    doc.querySelectorAll(
      "[data-product-card], [data-testid='product-card'], article.product-card, .product-card, [data-hero-image], [data-gallery-image]"
    )
  );

  for (const container of productContainers) {
    const containedImg = container.querySelector("img");
    if (!containedImg) {
      failures.push({
        url: `<container:${container.tagName.toLowerCase()}.${container.className || "unnamed"}>`,
        reason: "product-container-missing-img",
        selector: container.getAttribute("data-testid") || container.className || container.tagName,
      });
    }
  }

  // 2. Validate all <img> tags present in DOM
  const images = Array.from(doc.querySelectorAll("img"));

  for (const img of images) {
    const rawSrc = img.getAttribute("src")?.trim() || "";
    const currentSrc = img.currentSrc?.trim() || "";
    const effectiveSrc = currentSrc || rawSrc;

    // Missing or corrupt source
    if (!rawSrc && !currentSrc) {
      failures.push({
        url: "<missing-src>",
        reason: "missing-src",
        selector: img.className || img.alt || "img",
      });
      continue;
    }

    if (
      effectiveSrc.includes("undefined") ||
      effectiveSrc.includes("null") ||
      (!effectiveSrc.startsWith("data:image/svg+xml") && effectiveSrc.length < 5)
    ) {
      failures.push({
        url: effectiveSrc,
        reason: "invalid-src",
        selector: img.className || img.alt || "img",
      });
      continue;
    }

    const isLazy = img.getAttribute("loading") === "lazy";
    const win = state.window;

    // Incomplete loading and natural dimension verification
    if (img.complete) {
      // Completed image MUST have valid positive natural dimensions (proves decode completed and not broken 404)
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        failures.push({
          url: effectiveSrc,
          reason: "zero-natural-dimensions",
          selector: img.className || img.alt || "img",
        });
        continue;
      }
    } else {
      // Image has NOT completed loading (!img.complete)
      // Eager images must complete once exploration actions have begun.
      // Lazy-loaded images must complete once scrolled into the viewport.
      const hasInteracted = state.lastAction !== null;
      if (hasInteracted) {
        if (!isLazy) {
          failures.push({
            url: effectiveSrc,
            reason: "incomplete-loading",
            selector: img.className || img.alt || "img",
          });
          continue;
        } else if (win) {
          try {
            const rect = img.getBoundingClientRect();
            const inViewport =
              rect.bottom > -150 &&
              rect.top < (win.innerHeight || 800) + 150 &&
              rect.right > -150 &&
              rect.left < (win.innerWidth || 1024) + 150 &&
              rect.width > 0 &&
              rect.height > 0;
            const style = win.getComputedStyle(img);
            const isHidden =
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0" ||
              img.closest(
                '[aria-hidden="true"], [hidden], [style*="visibility: hidden"], [style*="display: none"]'
              ) !== null;

            if (inViewport && !isHidden) {
              failures.push({
                url: effectiveSrc,
                reason: "incomplete-loading",
                selector: img.className || img.alt || "img",
              });
              continue;
            }
          } catch {
            // Ignore geometry evaluation errors
          }
        }
      }
    }
  }

  if (failures.length > 0) {
    // Log failed URLs and reasons to stderr/stdout so they are preserved in Bombadil trace output
    for (const f of failures) {
      console.error(`[bombadil:image-failure] Failed image: ${f.url} (reason: ${f.reason}, selector: ${f.selector || "unknown"})`);
    }
  }

  return {
    totalImages: images.length,
    brokenCount: failures.length,
    failedUrls: failures.map((f) => `${f.url} [${f.reason}]`),
    failureDetails: failures,
  };
});

export const all_images_loaded = always(() => {
  const { brokenCount } = imageInspection.current;
  return brokenCount === 0;
});

