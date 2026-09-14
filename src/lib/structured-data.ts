/**
 * Phase 7.2 — structured data.
 *
 * Schema is emitted by widgets, never hand-written by a merchant into a custom
 * code box: the AST already knows a `faq` node is an FAQPage and a
 * `store_locator` node is a LocalBusiness, so the graph is derived from what
 * the page actually renders. Anything derived here is also validated here, and
 * `jsonLdIssues` runs at publish time so a broken graph never reaches a
 * crawler.
 *
 * Pure module: no React, no network, no Supabase.
 */
import type { Section, ThemeAst } from "./builder-ast";
import { authorJsonLd } from "./seo-answers";

export type JsonLdNode = Record<string, unknown>;

const SCHEMA = "https://schema.org";

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/* --------------------------------- offers --------------------------------- */

export const ITEM_CONDITIONS = {
  new: `${SCHEMA}/NewCondition`,
  refurbished: `${SCHEMA}/RefurbishedCondition`,
  used: `${SCHEMA}/UsedCondition`,
} as const;
export type ItemCondition = keyof typeof ITEM_CONDITIONS;

export type ReviewInput = {
  author: string;
  rating: number;
  body?: string | null;
  title?: string | null;
  published_at?: string | null;
};

export type RatingSummary = { value: number; count: number };

/**
 * Aggregate rating from published reviews. Returns null below the threshold —
 * Google rejects (and shoppers distrust) a five-star average built from one
 * review.
 */
export function aggregateRating(reviews: ReviewInput[], min = 1): JsonLdNode | null {
  const rated = reviews.filter((r) => Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5);
  if (rated.length < min || rated.length === 0) return null;
  const sum = rated.reduce((acc, r) => acc + r.rating, 0);
  return {
    "@type": "AggregateRating",
    ratingValue: (Math.round((sum / rated.length) * 10) / 10).toFixed(1),
    reviewCount: rated.length,
    bestRating: "5",
    worstRating: "1",
  };
}

/** Individual reviews, capped so the payload stays small. */
export function reviewNodes(reviews: ReviewInput[], limit = 5): JsonLdNode[] {
  return reviews
    .filter((r) => str(r.author) && r.rating >= 1 && r.rating <= 5)
    .slice(0, limit)
    .map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: str(r.author) },
      reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5", worstRating: "1" },
      ...(str(r.title) ? { name: str(r.title) } : {}),
      ...(str(r.body) ? { reviewBody: str(r.body) } : {}),
      ...(r.published_at ? { datePublished: r.published_at } : {}),
    }));
}

export type ReturnPolicyInput = {
  /** Days a shopper has to return; 0 disables the node entirely. */
  days: number;
  /** Who pays return shipping. */
  fees?: "free" | "shopper";
  country?: string;
};

/** `MerchantReturnPolicy` for an Offer. Bangladesh-default country. */
export function returnPolicyNode(input: ReturnPolicyInput): JsonLdNode | null {
  const days = Math.trunc(input.days);
  if (!Number.isFinite(days) || days <= 0) return null;
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: input.country ?? "BD",
    returnPolicyCategory: `${SCHEMA}/MerchantReturnFiniteReturnWindow`,
    merchantReturnDays: days,
    returnMethod: `${SCHEMA}/ReturnByMail`,
    returnFees:
      input.fees === "free" ? `${SCHEMA}/FreeReturn` : `${SCHEMA}/ReturnShippingFees`,
  };
}

export type ShippingInput = {
  /** Flat rate in minor units; 0 means free. */
  flatMinor: number;
  currency: string;
  /** Order value above which delivery is free, in minor units. */
  freeThresholdMinor?: number | null;
  /** Handling + transit, in business days. */
  handlingDays?: [number, number];
  transitDays?: [number, number];
  country?: string;
};

/** `OfferShippingDetails` — courier reality for a Bangladeshi storefront. */
export function shippingDetailsNode(input: ShippingInput, priceString: (minor: number, currency: string) => string): JsonLdNode {
  const handling = input.handlingDays ?? [0, 1];
  const transit = input.transitDays ?? [1, 3];
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: priceString(Math.max(0, Math.trunc(input.flatMinor)), input.currency),
      currency: input.currency,
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: input.country ?? "BD" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: handling[0], maxValue: handling[1], unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: transit[0], maxValue: transit[1], unitCode: "DAY" },
    },
    ...(input.freeThresholdMinor
      ? {
          // Documented as a note rather than a second rate: schema.org has no
          // clean "free above X" primitive, and inventing one fails validation.
          description: `Free delivery above ${priceString(input.freeThresholdMinor, input.currency)} ${input.currency}`,
        }
      : {}),
  };
}

/* ---------------------------- widget-emitted LD ---------------------------- */

/** Numbered prop groups (`q1`/`a1`, `s1Title`/`s1Body`) the catalogue uses. */
function numbered(props: Record<string, unknown>, keys: string[], max = 6) {
  const rows: string[][] = [];
  for (let i = 1; i <= max; i += 1) {
    const values = keys.map((k) => str(props[k.replace("#", String(i))]));
    if (values.every((v) => v)) rows.push(values);
  }
  return rows;
}

/**
 * Phase 5 — page-level types that may appear at most once per URL. Product,
 * ItemList and BreadcrumbList join the content types: duplicates are dropped
 * when collecting and reported as errors when linting.
 */
export const JSONLD_SINGLETONS = new Set([
  "FAQPage",
  "HowTo",
  "Article",
  "Product",
  "ItemList",
  "BreadcrumbList",
]);

export type LdContext = {
  /** Absolute page URL, when known. */
  url?: string | null;
  storeName: string;
};

/**
 * The JSON-LD a single widget contributes, or null when it says nothing a
 * crawler can use. Incomplete authoring (an empty FAQ, a video with no source)
 * yields null rather than a hollow node.
 */
export function sectionJsonLd(section: Section, ctx: LdContext): JsonLdNode | null {
  if (section.invalid) return null;
  const p = section.props;
  switch (section.type) {
    case "faq": {
      const pairs = numbered(p, ["q#", "a#"]);
      if (!pairs.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "FAQPage",
        mainEntity: pairs.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      };
    }
    case "care_panel": {
      // Composition / care / origin are answers to real questions, so the panel
      // emits the same FAQPage a `faq` widget would — and `lintTemplate` keeps
      // a template from shipping both.
      const heading = str(p["heading"]) || "Material & care";
      const rows: [string, string][] = [
        ["What is it made of?", str(p["composition"])],
        ["How should I care for it?", str(p["care"])],
        ["Where is it made?", str(p["origin"])],
      ];
      const answered = rows.filter(([, a]) => a);
      if (!answered.length) return null;
      return {
        "@context": SCHEMA,
        "@type": "FAQPage",
        name: heading,
        mainEntity: answered.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      };
    }
    case "how_to_use": {
      const steps = numbered(p, ["s#Title", "s#Body"]);
      if (steps.length < 2) return null;
      return {
        "@context": SCHEMA,
        "@type": "HowTo",
        name: str(p["heading"]) || "How to use",
        step: steps.map(([name, text], i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name,
          text,
        })),
        // Phase 7.4: expertise is a trust signal, so attribution rides on the
        // node when the merchant supplied it.
        ...authorJsonLd(p),
      };
    }
    case "buying_guide": {
      const headline = str(p["heading"]);
      const body = str(p["body"]);
      if (!headline || !body) return null;
      return {
        "@context": SCHEMA,
        "@type": "Article",
        headline,
        articleBody: body,
        ...(ctx.url ? { url: ctx.url } : {}),
        publisher: { "@type": "Organization", name: ctx.storeName },
        ...authorJsonLd(p),
      };
    }
    case "store_locator": {
      const stores = numbered(p, ["s#Name", "s#Address"], 3);
      if (!stores.length) return null;
      const nodes = stores.map(([name, address], i) => ({
        "@type": "LocalBusiness",
        name,
        address: { "@type": "PostalAddress", streetAddress: address, addressCountry: "BD" },
        ...(str(p[`s${i + 1}Phone`]) ? { telephone: str(p[`s${i + 1}Phone`]) } : {}),
        ...(str(p[`s${i + 1}Hours`]) ? { openingHours: str(p[`s${i + 1}Hours`]) } : {}),
        ...(ctx.url ? { url: ctx.url } : {}),
      }));
      return nodes.length === 1
        ? { "@context": SCHEMA, ...nodes[0]! }
        : { "@context": SCHEMA, "@graph": nodes };
    }
    case "video": {
      const src = str(p["src"]);
      const name = str(p["title"]);
      if (!src || !name) return null;
      return {
        "@context": SCHEMA,
        "@type": "VideoObject",
        name,
        embedUrl: src,
        description: `${name} — ${ctx.storeName}`,
        uploadDate: str(p["uploadDate"]) || undefined,
      };
    }
    default:
      return null;
  }
}

/**
 * Every node a rendered template contributes, in document order. Duplicate
 * page-level types are dropped: two FAQPage graphs on one URL is a validation
 * error, not twice the coverage.
 */
export function collectJsonLd(sections: Section[], ctx: LdContext): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const singletons = new Set<string>();
  for (const section of sections) {
    const node = sectionJsonLd(section, ctx);
    if (!node) continue;
    const type = String(node["@type"] ?? "");
    if (JSONLD_SINGLETONS.has(type)) {
      if (singletons.has(type)) continue;
      singletons.add(type);
    }
    out.push(node);
  }
  return out;
}

/** Flattens a theme AST and collects its schema graph. */
export function astJsonLd(
  ast: ThemeAst | null | undefined,
  ctx: LdContext,
  flatten: (ast: ThemeAst) => Section[],
): JsonLdNode[] {
  if (!ast) return [];
  return collectJsonLd(flatten(ast), ctx);
}

/* -------------------------------- validation ------------------------------- */

/** Properties Google requires before a rich result can be earned. */
const REQUIRED: Record<string, string[]> = {
  Product: ["name", "offers"],
  Offer: ["price", "priceCurrency", "availability"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  VideoObject: ["name", "embedUrl", "description"],
  LocalBusiness: ["name", "address"],
  ItemList: ["itemListElement"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name"],
  WebSite: ["name", "url"],
  Article: ["headline"],
  AggregateRating: ["ratingValue", "reviewCount"],
  Review: ["author", "reviewRating"],
};

function missing(node: JsonLdNode, type: string): string[] {
  const required = REQUIRED[type] ?? [];
  return required.filter((key) => {
    const value = node[key];
    if (value === undefined || value === null || value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

/**
 * Publish-time validation. Returns human-readable problems; an empty array
 * means the graph is safe to ship. Deliberately strict about the things that
 * silently disqualify a rich result: missing required props, unknown
 * `@context`, floats where schema.org wants strings, ratings out of range.
 */
export function jsonLdIssues(node: unknown, path = "$"): string[] {
  const issues: string[] = [];
  if (!node || typeof node !== "object") {
    return [`${path}: JSON-LD node must be an object.`];
  }
  const obj = node as JsonLdNode;
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    graph.forEach((child, i) => issues.push(...jsonLdIssues(child, `${path}.@graph[${i}]`)));
  }
  if (path === "$" && obj["@context"] !== SCHEMA && !Array.isArray(graph)) {
    issues.push(`${path}: @context must be "${SCHEMA}".`);
  }
  const type = obj["@type"];
  if (Array.isArray(graph) && !type) return issues;
  if (typeof type !== "string" || !type) {
    issues.push(`${path}: @type is required.`);
    return issues;
  }
  for (const key of missing(obj, type)) {
    issues.push(`${path} (${type}): missing required property "${key}".`);
  }
  if (type === "Offer") {
    const price = obj["price"];
    if (typeof price === "number") {
      issues.push(`${path} (Offer): price must be a string in minor-unit-derived decimal form, not a number.`);
    }
    const availability = obj["availability"];
    if (typeof availability === "string" && !availability.startsWith(`${SCHEMA}/`)) {
      issues.push(`${path} (Offer): availability must be a schema.org URL.`);
    }
  }
  if (type === "AggregateRating") {
    const value = Number(obj["ratingValue"]);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      issues.push(`${path} (AggregateRating): ratingValue must be between 1 and 5.`);
    }
    if (Number(obj["reviewCount"]) < 1) {
      issues.push(`${path} (AggregateRating): reviewCount must be at least 1.`);
    }
  }
  // Recurse into nested typed objects so a broken Offer inside a valid Product
  // is still caught.
  for (const [key, value] of Object.entries(obj)) {
    if (key === "@graph") continue;
    const children = Array.isArray(value) ? value : [value];
    children.forEach((child, i) => {
      if (child && typeof child === "object" && (child as JsonLdNode)["@type"]) {
        const suffix = Array.isArray(value) ? `${key}[${i}]` : key;
        issues.push(...jsonLdIssues(child, `${path}.${suffix}`));
      }
    });
  }
  return issues;
}

/** Validates a whole graph; used by the publish gate. */
export function graphIssues(nodes: unknown[]): string[] {
  return nodes.flatMap((node, i) => jsonLdIssues(node, `$[${i}]`));
}
