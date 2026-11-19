import { always, extract } from "@antithesishq/bombadil";
import { registerCustomAction } from "@antithesishq/bombadil/browser";
import type { State } from "@antithesishq/bombadil/browser";

export interface ImageFailureRecord {
  url: string;
  reason:
    | "missing-src"
    | "invalid-src"
    | "incomplete-loading"
    | "zero-natural-dimensions"
    | "product-container-missing-img"
    | "hero-container-missing-img"
    | "gallery-container-missing-img"
    | "missing-document-state"
    | "decode-failed";
  selector?: string;
}

/**
 * Custom browser action that explicitly awaits decode() on all completed images in the DOM,
 * setting data-decoded or data-decode-error attributes to verify decoding completed without stalls.
 */
export const await_image_decodes = registerCustomAction(
  "await_image_decodes",
  async (document: Document, _window: Window) => {
    const images = Array.from(document.querySelectorAll("img"));
    await Promise.allSettled(
      images.map(async (img) => {
        if (img.complete && typeof img.decode === "function") {
          try {
            await img.decode();
            img.setAttribute("data-decoded", "true");
          } catch (err: any) {
            img.setAttribute(
              "data-decode-error",
              err?.message || "decode-failure"
            );
          }
        }
      })
    );
  }
);

/**
 * Extracts comprehensive image load, decode, dimension, and DOM presence integrity across DOM states.
 *
 * Invariants:
 *  1. Expected product and hero images exist (homepage hero, collection cards, PDP gallery).
 *  2. Every image has a valid, non-empty, non-corrupt src attribute.
 *  3. Every image finishes loading (complete === true).
 *  4. Every image decodes successfully via explicit img.decode() check and positive natural dimensions.
 *  5. Lazy-loaded images that enter or approach viewport trigger loading without stalls.
 *  6. Any failed image URLs and specific failure reasons are captured directly for trace reporting.
 *  7. Missing document state fails closed.
 */
const imageInspection = extract((state: State) => {
  const doc = state.document;
  if (!doc) {
    return {
      totalImages: 0,
      brokenCount: 1,
      failedUrls: ["<document-missing> [missing-document-state]"],
      failureDetails: [
        {
          url: "<document-missing>",
          reason: "missing-document-state" as const,
          selector: "document",
        },
      ],
    };
  }

  const failures: ImageFailureRecord[] = [];

  const win = state.window;
  const hasInteracted = state.lastAction !== null;

  // Active decode trigger & watcher on live browser window
  if (win && !(win as any).__framique_decode_watcher) {
    (win as any).__framique_decode_watcher = true;
    const triggerDecode = (el: HTMLImageElement) => {
      if (
        typeof el.decode === "function" &&
        !el.hasAttribute("data-decoded") &&
        !el.hasAttribute("data-decode-error") &&
        !el.hasAttribute("data-decoding")
      ) {
        el.setAttribute("data-decoding", "true");
        el.setAttribute("data-decoding-start", String(Date.now()));
        el.decode()
          .then(() => {
            el.removeAttribute("data-decoding");
            el.setAttribute("data-decoded", "true");
          })
          .catch((err: any) => {
            el.removeAttribute("data-decoding");
            el.setAttribute("data-decode-error", err?.message || "decode-failure");
          });
      }
    };
    Array.from(doc.querySelectorAll("img")).forEach(triggerDecode);
    const observer = new win.MutationObserver(() => {
      Array.from(doc.querySelectorAll("img")).forEach(triggerDecode);
    });
    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true, attributes: true });
    win.addEventListener("scroll", () => {
      Array.from(doc.querySelectorAll("img")).forEach(triggerDecode);
    }, { passive: true });
  }

  // Determine current page route to apply page-type specific container requirements
  const currentUrl =
    state.navigationHistory?.current?.url ||
    state.window?.location?.href ||
    "";
  let pathname = "";
  try {
    pathname = new URL(currentUrl, "http://127.0.0.1:3000").pathname.toLowerCase();
  } catch {
    pathname = (state.window?.location?.pathname || "").toLowerCase();
  }

  // 1. Page-type specific required containers
  if (pathname === "/" || pathname === "" || pathname === "/index.html") {
    // Homepage must contain hero image and valid hero visual
    const heroImage = doc.querySelector(
      "[data-hero-image] img, [data-hero-image], [data-testid='hero-image'] img, [data-testid='hero-image'], section[aria-label*='hero' i] img, .hero-section img, .hero-visual img, img[alt='Dashboard'], .fq-halo ~ img, .fq-halo + img"
    );
    if (!heroImage) {
      failures.push({
        url: "<missing-hero-image>",
        reason: "hero-container-missing-img",
        selector: "hero-container",
      });
    }
  } else if (
    pathname.startsWith("/c/") ||
    pathname.includes("/collections/") ||
    pathname.includes("/c/")
  ) {
    // Collections page must have product cards with images
    const productContainers = Array.from(
      doc.querySelectorAll(
        "[data-product-card], [data-testid='product-card'], article.product-card, .product-card, li:has(a[href*='/p/'])"
      )
    );
    for (const container of productContainers) {
      const containedImg = container.querySelector("img");
      if (!containedImg) {
        failures.push({
          url: `<container:${container.tagName.toLowerCase()}.${container.className || "unnamed"}>`,
          reason: "product-container-missing-img",
          selector:
            container.getAttribute("data-testid") ||
            container.className ||
            container.tagName,
        });
      }
    }
  } else if (
    pathname.startsWith("/p/") ||
    pathname.includes("/products/") ||
    pathname.includes("/p/")
  ) {
    // PDP must have product gallery image
    const galleryContainer = doc.querySelector(
      "[data-gallery-image], [data-hero-image], .product-gallery, div[class*='aspect-'][class*='sticky'], main img"
    );
    if (!galleryContainer) {
      failures.push({
        url: "<missing-gallery-container>",
        reason: "gallery-container-missing-img",
        selector: "gallery-container",
      });
    } else if (
      galleryContainer.tagName.toLowerCase() !== "img" &&
      !galleryContainer.querySelector("img")
    ) {
      failures.push({
        url: `<container:${galleryContainer.tagName.toLowerCase()}.${galleryContainer.className || "gallery"}>`,
        reason: "gallery-container-missing-img",
        selector:
          galleryContainer.getAttribute("data-testid") ||
          galleryContainer.className ||
          galleryContainer.tagName,
      });
    }
  }

  // 2. Validate all <img> tags present in DOM
  const images = Array.from(doc.querySelectorAll("img"));

  for (const img of images) {
    // Synchronously ensure decode is triggered for every img found
    if (
      typeof img.decode === "function" &&
      !img.hasAttribute("data-decoded") &&
      !img.hasAttribute("data-decode-error") &&
      !img.hasAttribute("data-decoding")
    ) {
      img.setAttribute("data-decoding", "true");
      img.setAttribute("data-decoding-start", String(Date.now()));
      img.decode()
        .then(() => {
          img.removeAttribute("data-decoding");
          img.setAttribute("data-decoded", "true");
        })
        .catch((err: any) => {
          img.removeAttribute("data-decoding");
          img.setAttribute("data-decode-error", err?.message || "decode-failure");
        });
    }

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
      (!effectiveSrc.startsWith("data:image/") &&
        !effectiveSrc.startsWith("blob:") &&
        effectiveSrc.length < 5)
    ) {
      failures.push({
        url: effectiveSrc,
        reason: "invalid-src",
        selector: img.className || img.alt || "img",
      });
      continue;
    }

    // Explicit image decode error check
    const decodeError = img.getAttribute("data-decode-error");
    if (decodeError) {
      failures.push({
        url: effectiveSrc,
        reason: "decode-failed",
        selector: `${img.className || img.alt || "img"} [${decodeError}]`,
      });
      continue;
    }

    const isLazy = img.getAttribute("loading") === "lazy";

    // Incomplete loading and natural dimension verification
    if (img.complete) {
      // Completed image MUST have valid positive natural dimensions
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        failures.push({
          url: effectiveSrc,
          reason: "zero-natural-dimensions",
          selector: img.className || img.alt || "img",
        });
        continue;
      }

      // Mandatory successful decode verification:
      // Once decoding has had sufficient time (>= 400ms) or is already completed,
      // it MUST have data-decoded === "true". If it failed or stalled, fail closed.
      const decodeStartTime = parseInt(img.getAttribute("data-decoding-start") || "0", 10);
      const isDecoded = img.getAttribute("data-decoded") === "true";
      const decodeElapsed = decodeStartTime ? (Date.now() - decodeStartTime) : 0;

      if (!isDecoded && decodeElapsed >= 400) {
        failures.push({
          url: effectiveSrc,
          reason: "decode-failed",
          selector: `${img.className || img.alt || "img"} [decode-stalled-or-failed]`,
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
    // Log failed URLs and reasons so they appear in trace output
    for (const f of failures) {
      console.error(
        `[bombadil:image-failure] Failed image: ${f.url} (reason: ${f.reason}, selector: ${f.selector || "unknown"})`
      );
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

