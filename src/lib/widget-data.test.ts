import { describe, expect, it } from "vitest";
import { newSection, type Section, type ThemeAst } from "./builder-ast";
import {
  MAX_WIDGET_REQUESTS,
  MAX_WIDGET_ROWS,
  collectWidgetRequests,
  nodeRows,
  requestForSection,
  requestKey,
} from "./widget-data";
import { resolveWidgetData, type SourceLoaders } from "./widget-data.server";
import { WIDGET_REGISTRY } from "./widget-registry";

function grid(props: Record<string, unknown> = {}): Section {
  const section = newSection("product_grid");
  return { ...section, props: { ...section.props, ...props } as Section["props"] };
}

function ast(main: Section[]): ThemeAst {
  return { header: [], main, footer: [] };
}

describe("widget data collection", () => {
  it("only data widgets produce requests", () => {
    expect(requestForSection(newSection("hero"))).toBeNull();
    expect(requestForSection(newSection("product_grid"))?.source).toBe("collection");
    expect(requestForSection(newSection("collection_grid"))?.source).toBe("taxonomy");
  });

  it("identical widgets collapse to one request", () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 8 }), grid({ limit: 8 }), grid({ limit: 8 })]));
    expect(bundle.requests).toHaveLength(1);
    expect(Object.keys(bundle.byNode)).toHaveLength(3);
    const keys = new Set(Object.values(bundle.byNode));
    expect(keys.size).toBe(1);
  });

  it("different params produce different requests", () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 8 }), grid({ limit: 12 })]));
    expect(bundle.requests).toHaveLength(2);
  });

  it("heading and other non-param props never change the request key", () => {
    const a = requestForSection(grid({ limit: 8, heading: "Deals" }));
    const b = requestForSection(grid({ limit: 8, heading: "New in" }));
    expect(a?.key).toBe(b?.key);
  });

  it("clamps limit to the row ceiling", () => {
    const request = requestForSection(grid({ limit: 5000 }));
    expect(request?.params["limit"]).toBe(MAX_WIDGET_ROWS);
  });

  it("collects data widgets nested inside containers", () => {
    const container = { ...newSection("container"), children: [grid({ limit: 4 })] };
    const bundle = collectWidgetRequests(ast([container]));
    expect(bundle.requests).toHaveLength(1);
  });

  it("skips invalid nodes", () => {
    const broken = { ...grid(), invalid: "unknown type" };
    expect(requestForSection(broken)).toBeNull();
  });

  it("caps the batch size", () => {
    const many = Array.from({ length: MAX_WIDGET_REQUESTS + 10 }, (_, i) => grid({ limit: i + 1 }));
    expect(collectWidgetRequests(ast(many)).requests.length).toBeLessThanOrEqual(MAX_WIDGET_REQUESTS);
  });

  it("request keys are stable regardless of prop order", () => {
    expect(requestKey("collection", { limit: 4, sort: "title" })).toBe(
      requestKey("collection", { sort: "title", limit: 4 }),
    );
  });
});

describe("batched resolution", () => {
  it("a full template issues exactly one call per source, no matter how many widgets", () => {
    const calls: { source: string; count: number }[] = [];
    const loaders: SourceLoaders = {
      collection: async (_m, requests) => {
        calls.push({ source: "collection", count: requests.length });
        return Object.fromEntries(requests.map((r) => [r.key, [{ id: r.key, title: "p" }]]));
      },
      taxonomy: async (_m, requests) => {
        calls.push({ source: "taxonomy", count: requests.length });
        return Object.fromEntries(requests.map((r) => [r.key, [{ id: r.key, title: "c" }]]));
      },
    };

    const template = ast([
      newSection("hero"),
      grid({ limit: 8 }),
      grid({ limit: 8 }),
      grid({ limit: 12 }),
      newSection("collection_grid"),
      { ...newSection("container"), children: [grid({ limit: 8 })] },
    ]);
    const bundle = collectWidgetRequests(template);

    return resolveWidgetData("merchant-1", bundle, loaders).then((map) => {
      // One round trip per distinct source — never one per widget.
      expect(calls).toHaveLength(2);
      expect(calls.find((c) => c.source === "collection")?.count).toBe(2);
      expect(Object.keys(map)).toHaveLength(bundle.requests.length);
      // Every node can read rows, including the duplicates and the nested one.
      for (const nodeId of Object.keys(bundle.byNode)) {
        expect(nodeRows(bundle, map, nodeId)).toBeDefined();
      }
    });
  });

  it("an empty template makes no call at all", async () => {
    let called = false;
    const loaders: SourceLoaders = {
      collection: async () => {
        called = true;
        return {};
      },
    };
    const map = await resolveWidgetData("m", collectWidgetRequests(ast([newSection("hero")])), loaders);
    expect(called).toBe(false);
    expect(map).toEqual({});
  });

  it("a failing source degrades to empty rows instead of throwing", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 4 })]));
    const map = await resolveWidgetData("m", bundle, {
      collection: async () => {
        throw new Error("db down");
      },
    });
    expect(map[bundle.requests[0]!.key]).toEqual([]);
  });

  it("a source with no loader still resolves to an empty array", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 4 })]));
    const map = await resolveWidgetData("m", bundle, {});
    expect(map[bundle.requests[0]!.key]).toEqual([]);
  });

  it("hand-assembled duplicate requests are deduped before querying", async () => {
    let calls = 0;
    const request = requestForSection(grid({ limit: 4 }))!;
    await resolveWidgetData(
      "m",
      { requests: [request, { ...request }], byNode: {} },
      {
        collection: async (_m, requests) => {
          calls += 1;
          expect(requests).toHaveLength(1);
          return {};
        },
      },
    );
    expect(calls).toBe(1);
  });
});

describe("registry contract", () => {
  it("every data widget declares params and a skeleton", () => {
    for (const meta of Object.values(WIDGET_REGISTRY)) {
      if (!meta.data) continue;
      expect(meta.skeleton, `${meta.type} must ship a skeleton`).toBe(true);
      expect(Array.isArray(meta.data.params)).toBe(true);
    }
  });

  it("param keys are unique per widget", () => {
    for (const meta of Object.values(WIDGET_REGISTRY)) {
      if (!meta.data) continue;
      const keys = meta.data.params.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
