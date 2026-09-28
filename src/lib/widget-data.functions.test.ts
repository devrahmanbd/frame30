/**
 * T7 quick-wins — resolveWidgetDataFn source enum must cover the full
 * WidgetDataSource union (widget-registry.ts). Client-initiated refetches for
 * product-detail/account widgets (variants, qna, order, specs, finance,
 * product, orders, profile) fail zod validation while the SSR batch serves
 * them fine.
 */
import { describe, expect, it } from "vitest";
import { widgetDataRequestSchema } from "./widget-data.functions";

const ALL_SOURCES = [
  "collection",
  "manual",
  "recommendation",
  "reviews",
  "facets",
  "taxonomy",
  "variants",
  "qna",
  "order",
  "specs",
  "finance",
  "product",
  "orders",
  "profile",
] as const;

describe("resolveWidgetDataFn input validation", () => {
  it.each(ALL_SOURCES)("accepts source %s", (source) => {
    const parsed = widgetDataRequestSchema.safeParse({
      key: "node-1",
      source,
      params: {},
    });
    expect(parsed.success, source).toBe(true);
  });

  it("rejects unknown sources", () => {
    expect(
      widgetDataRequestSchema.safeParse({
        key: "node-1",
        source: "definitely-not-a-source",
        params: {},
      }).success,
    ).toBe(false);
  });
});
