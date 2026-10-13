/**
 * Demo theme fixture — bespoke product cards + variant selector (3 of 3).
 *
 * Custom cards proving the bespoke-commerce story without core changes:
 * catalogue reads flow through the §5 read-scoped context (`commerce.ts`),
 * and every shopper action travels ONLY through versioned bridge v2
 * envelopes (`variant.select` + `cart.add`) that the host authorizes per
 * install and re-checks server-side. Theme code never sees catalogue
 * figures, readiness counts, or shop identity — the envelope builders below
 * attach exactly the fields the bridge schema admits (`variantId`,
 * `quantity`, optional `promoCode`) and throw instead of emitting a weak
 * envelope. The cards proof scans theme source to keep it that way
 * (`product-cards.test.ts`: commerce-context purity).
 */

import type { DemoCommerceContext, DemoProduct } from "./commerce";
import { findDemoProducts, isDemoProductAvailable } from "./commerce";
import {
  clampInt,
  escapeHtml,
  resolveMotionPreset,
  type MotionPreset,
} from "./shared";

export const CARDS_SECTION_KEY = "curated-cards";
export const CARDS_COMPONENT_NAME = "CuratedCards";
export const CARDS_SECTION_SLOT = "main";

/** Capabilities this section needs the manifest to declare (§2). */
export const CARDS_REQUIRED_CAPABILITIES = [
  "presentation",
  "commerce-read",
  "cart-write",
] as const;

/** Settings schema — every type is a member of the closed builder set (§4). */
export const CARDS_SETTINGS_SCHEMA = [
  { key: "cards-heading", label: "Cards heading", type: "text" },
  { key: "cards-products", label: "Cards products", type: "product-selection" },
  { key: "cards-accent", label: "Cards accent", type: "color" },
  { key: "cards-gap", label: "Cards spacing", type: "spacing" },
  { key: "cards-motion", label: "Cards motion", type: "animation" },
] as const;

export type CardsSettings = {
  heading: string;
  products: string[];
  accent: string;
  gap: number;
  motion: MotionPreset;
};

export type CardsSettingsInput = {
  heading?: unknown;
  products?: unknown;
  accent?: unknown;
  gap?: unknown;
  motion?: unknown;
};

export const DEFAULT_CARDS_SETTINGS: CardsSettings = {
  heading: "Handpicked for you",
  products: [],
  accent: "#166534",
  gap: 16,
  motion: "standard",
};

export function coerceCardsSettings(input: CardsSettingsInput): CardsSettings {
  const heading =
    typeof input.heading === "string" && input.heading.trim().length > 0
      ? input.heading.trim().slice(0, 80)
      : DEFAULT_CARDS_SETTINGS.heading;
  const products = Array.isArray(input.products)
    ? [...new Set(input.products.filter((id) => typeof id === "string"))]
    : [];
  const accent =
    typeof input.accent === "string" && input.accent.trim().length > 0
      ? input.accent.trim().slice(0, 32)
      : DEFAULT_CARDS_SETTINGS.accent;
  return {
    heading,
    products: products.slice(0, 12),
    accent,
    gap: clampInt(input.gap, DEFAULT_CARDS_SETTINGS.gap, 0, 64),
    motion: resolveMotionPreset(input.motion),
  };
}

/**
 * Resolve the shopper's variant choice: the exact match first, then the
 * first ready variant, then the first variant. Products without variants
 * resolve to null (the card renders without an add control).
 */
export function resolveSelectedVariant(
  product: DemoProduct,
  variantId: unknown,
): DemoProduct["variants"][number] | null {
  if (typeof variantId === "string" && variantId.length > 0) {
    const exact = product.variants.find((variant) => variant.id === variantId);
    if (exact) return exact;
  }
  return (
    product.variants.find((variant) => variant.available) ??
    product.variants[0] ??
    null
  );
}

/* ------------------------------------------- bridge v2 envelope builders */

export type BridgeEnvelope = {
  v: 2;
  id: string;
  method: string;
  params?: unknown;
};

function cleanRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 128) : null;
}

/**
 * Shopper-picked variant, display resolution only. Carries a variant or
 * product reference and nothing else — the host resolves display data.
 * Throws instead of emitting a weak envelope.
 */
export function buildVariantSelectEnvelope(
  id: unknown,
  ref: { variantId?: unknown; productId?: unknown },
): BridgeEnvelope {
  const envelopeId = cleanRef(id);
  if (!envelopeId) throw new Error("cards.envelope_id");
  const variantId = cleanRef(ref.variantId);
  const productId = cleanRef(ref.productId);
  if (!variantId && !productId) throw new Error("cards.variant_ref");
  const params: Record<string, string> = {};
  if (variantId) params["variantId"] = variantId;
  if (productId) params["productId"] = productId;
  return { v: 2, id: envelopeId, method: "variant.select", params };
}

/**
 * Shopper add request: variant + quantity (+ optional merchant promo code).
 * Exactly the fields the `cart.add` schema admits — no figure, readiness,
 * or identity fields are ever attached. Throws on weak input.
 */
export function buildCartAddEnvelope(
  id: unknown,
  line: { variantId?: unknown; quantity?: unknown; promoCode?: unknown },
): BridgeEnvelope {
  const envelopeId = cleanRef(id);
  if (!envelopeId) throw new Error("cards.envelope_id");
  const variantId = cleanRef(line.variantId);
  if (!variantId) throw new Error("cards.variant_ref");
  if (
    typeof line.quantity !== "number" ||
    !Number.isInteger(line.quantity) ||
    line.quantity < 1 ||
    line.quantity > 99
  ) {
    throw new Error("cards.quantity");
  }
  const params: Record<string, string | number> = {
    variantId,
    quantity: line.quantity,
  };
  const promoCode = cleanRef(line.promoCode);
  if (promoCode) {
    if (promoCode.length > 64) throw new Error("cards.promo_code");
    params["promoCode"] = promoCode;
  }
  return { v: 2, id: envelopeId, method: "cart.add", params };
}

/* ---------------------------------------------------------------- render */

export type CardsRenderInput = {
  settings: CardsSettingsInput;
  products: unknown;
  commerce: DemoCommerceContext;
  /** Shopper choices by product id (variant id per product). */
  selection?: Record<string, unknown>;
};

export type CardsRenderOutput = {
  html: string;
  products: DemoProduct[];
  heading: string;
  motion: MotionPreset;
};

function renderVariantOptions(
  product: DemoProduct,
  selectedId: string | null,
): string {
  return product.variants
    .map((variant) => {
      const selected = variant.id === selectedId ? ` selected="selected"` : "";
      const note = variant.available ? "" : " (back soon)";
      return `<option value="${escapeHtml(variant.id)}"${selected}>${escapeHtml(variant.title)}${note}</option>`;
    })
    .join("");
}

function renderCard(
  product: DemoProduct,
  selectedVariantId: string | null,
): string {
  const ready = isDemoProductAvailable(product);
  const image = product.images[0] ?? "/ph/demo/placeholder.jpg";
  const selector =
    product.variants.length > 0
      ? `<label>Choice<select data-variant-select="${escapeHtml(product.id)}">` +
        renderVariantOptions(product, selectedVariantId) +
        `</select></label>`
      : "";
  const action =
    selectedVariantId !== null
      ? `<button type="button" data-cart-add="${escapeHtml(selectedVariantId)}" data-qty="1">Add to bag</button>`
      : "";
  return (
    `<li data-cards-card="${escapeHtml(product.id)}">` +
    `<a href="/p/${encodeURIComponent(product.handle)}">` +
    `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" />` +
    `<span>${escapeHtml(product.title)}</span>` +
    `</a>` +
    selector +
    `<span data-readiness="${ready ? "available" : "unavailable"}">` +
    `${ready ? "Available" : "Back soon"}</span>` +
    action +
    `</li>`
  );
}

/**
 * Static-first render: cards, selectors, and add controls with no JS. The
 * controls carry variant references only — the host bridge performs the
 * action, so an empty catalogue renders an empty note instead of failing.
 */
export function renderProductCards(input: CardsRenderInput): CardsRenderOutput {
  const settings = coerceCardsSettings(input.settings);
  const products = findDemoProducts(input.commerce, input.products);
  const selection =
    input.selection && typeof input.selection === "object"
      ? (input.selection as Record<string, unknown>)
      : {};
  const cards =
    products.length === 0
      ? `<p data-empty="cards">New picks are on their way.</p>`
      : products
          .map((product) => {
            const resolved = resolveSelectedVariant(
              product,
              selection[product.id],
            );
            return renderCard(product, resolved ? resolved.id : null);
          })
          .join("");
  const html =
    `<section data-demo="${CARDS_SECTION_KEY}" data-motion="${settings.motion}" data-gap="${settings.gap}">` +
    `<h2>${escapeHtml(settings.heading)}</h2>` +
    `<ul>${cards}</ul></section>`;
  return { html, products, heading: settings.heading, motion: settings.motion };
}

/** Host Section shape (§3): the registered key, never a core renderer fork. */
export type CardsSection = {
  id: string;
  type: typeof CARDS_SECTION_KEY;
  props: {
    heading: string;
    products: string[];
    accent: string;
    gap: number;
    motion: MotionPreset;
  };
};

export function buildCardsSection(
  id: string,
  settings: CardsSettingsInput,
): CardsSection {
  const coerced = coerceCardsSettings(settings);
  return {
    id,
    type: CARDS_SECTION_KEY,
    props: {
      heading: coerced.heading,
      products: coerced.products,
      accent: coerced.accent,
      gap: coerced.gap,
      motion: coerced.motion,
    },
  };
}
