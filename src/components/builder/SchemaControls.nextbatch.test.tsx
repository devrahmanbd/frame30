/**
 * Frame30 next-batch controls (TDD) — `SchemaControls` placeholder kinds as
 * full editable controls on the SAME `(field, value, onChange)` contract.
 *
 * Rendering precedent: `renderToStaticMarkup` (vitest env is `node`, no DOM
 * harness — see `SchemaControls.test.tsx`); transitions are covered by the
 * exported pure helpers (`applyStructuredEntryChange` /
 * `applyStructuredEntryRemove` / `applyStructuredListChange` /
 * `applyStructuredListRemove`), which are the exact transitions the
 * handlers perform. The value layer (`validateProps`) is the ONLY validator:
 * every hostile/adversarial case below asserts through it, never through
 * component-side rejection rules.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { validateProps, type PropSchema } from "@/lib/widget-props";
import {
  applyStructuredEntryChange,
  applyStructuredEntryRemove,
  applyStructuredListChange,
  applyStructuredListRemove,
  SchemaControls,
  submitSchemaProps,
} from "./SchemaControls";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const noop = () => {};

describe("scalar pickers — editable inputs on the same contract", () => {
  const schema: PropSchema = [
    { key: "hero", label: "Hero image", kind: "image", required: true },
    { key: "trailer", label: "Trailer", kind: "video" },
    { key: "pick", label: "Product pick", kind: "product" },
  ];

  it("renders a labelled input plus Clear per picker", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ hero: "/a.jpg", pick: "prod_1" }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="image"');
    expect(out).toContain('data-placeholder="video"');
    expect(out).toContain('data-placeholder="product"');
    expect(out).toContain("/a.jpg");
    expect(out).toContain("prod_1");
    expect(out).toContain("Clear");
    // Media kinds take URLs, data kinds take handles.
    expect(out).toContain('type="url"');
  });

  it("renders collection and media pickers on the same contract", () => {
    const collectionSchema: PropSchema = [
      { key: "coll", label: "Collection", kind: "collection" },
      { key: "clip", label: "Clip", kind: "media" },
    ];
    const out = html(
      <SchemaControls
        schema={collectionSchema}
        props={{ coll: "summer-26", clip: "/v.mp4" }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="collection"');
    expect(out).toContain('data-placeholder="media"');
    expect(out).toContain("summer-26");
    expect(out).toContain("/v.mp4");
    expect(out).toContain("Clear");
  });

  it("pairs every picker label with its input", () => {
    const out = html(
      <SchemaControls schema={schema} props={{}} onChange={noop} />,
    );
    const fors = [...out.matchAll(/ for="([^"]+)"/g)].map((m) => m[1]);
    expect(fors.length).toBeGreaterThan(0);
    for (const id of fors) {
      expect(out).toContain(`id="${id}"`);
    }
  });

  it("renders non-string stored values as empty without throwing", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ hero: { evil: 1 }, trailer: ["x"], pick: 42 }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="image"');
    expect(out).not.toContain("[object Object]");
  });

  it("surfaces the validator's exact codes under pickers", () => {
    const props = { hero: "javascript:evil()", trailer: "ok" };
    const result = submitSchemaProps(schema, props);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("hero.not_a_url");
    const out = html(
      <SchemaControls
        schema={schema}
        props={props}
        errors={result.errors}
        onChange={noop}
      />,
    );
    expect(out).toContain("hero.not_a_url");
  });
});

describe("typography — conventional sub-controls, extras preserved", () => {
  const schema: PropSchema = [
    { key: "type", label: "Type", kind: "typography" },
  ];

  it("renders sub-controls bound to the stored value", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{
          type: { fontFamily: "Inter", fontSize: 18, fontWeight: "700" },
        }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Family");
    expect(out).toContain("Inter");
    expect(out).toContain("700");
  });

  it("merges sub-edits over unknown keys instead of replacing", () => {
    const base = { fontFamily: "Inter", custom: { kern: true } };
    const next = applyStructuredEntryChange(base, "fontSize", 18);
    expect(next).toEqual({
      fontFamily: "Inter",
      fontSize: 18,
      custom: { kern: true },
    });
    expect(base).toEqual({ fontFamily: "Inter", custom: { kern: true } });
    expect(next).not.toBe(base);
  });

  it("normalizes hostile bases and rejects hostile keys by reference", () => {
    const hostile = applyStructuredEntryChange({ evil: 1 }, "__proto__", "x");
    expect(hostile).toEqual({ evil: 1 });
    const proto = applyStructuredEntryChange(null, "constructor", "x");
    expect(proto).toEqual({});
    // Over-cap adds fail closed.
    const full: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) full[`k${i}`] = i;
    expect(applyStructuredEntryChange(full, "overflow", 1)).toBe(full);
  });

  it("removes entries immutably and fails closed on absent keys", () => {
    const base = { a: 1, b: 2 };
    const next = applyStructuredEntryRemove(base, "a");
    expect(next).toEqual({ b: 2 });
    expect(base).toEqual({ a: 1, b: 2 });
    expect(applyStructuredEntryRemove(base, "missing")).toBe(base);
  });
});

describe("responsive — editable cascade through the device layer", () => {
  const schema: PropSchema = [
    { key: "layout", label: "Layout", kind: "responsive" },
  ];

  it("edits record values as key rows with add/remove affordances", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ layout: { columns: 2 } }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="responsive"');
    expect(out).toContain("columns");
    expect(out).toContain("Add");
  });

  it("keeps nested structured entries read-only but preserved", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ layout: { nested: { deep: true } } }}
        onChange={noop}
      />,
    );
    expect(out).toContain("kept as-is");
    const base = { nested: { deep: true } };
    const next = applyStructuredEntryChange(base, "columns", 2);
    expect(next).toEqual({ nested: { deep: true }, columns: 2 });
  });

  it("tags the device layer on display without mutating overrides", () => {
    const overrides = { tablet: { layout: { columns: 1 } } };
    const snapshot = structuredClone(overrides);
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ layout: { columns: 2 } }}
        device="tablet"
        overrides={overrides}
        onChange={noop}
      />,
    );
    expect(out).toContain("tablet override");
    expect(overrides).toEqual(snapshot);
  });

  it("edits list values by index with pure transitions", () => {
    expect(applyStructuredListChange(["a", "b"], 1, "B")).toEqual(["a", "B"]);
    const base = ["a", "b"];
    expect(applyStructuredListChange(base, 7, "x")).toBe(base);
    expect(applyStructuredListRemove(base, 0)).toEqual(["b"]);
    expect(applyStructuredListRemove(base, 7)).toBe(base);
    expect(base).toEqual(["a", "b"]);
  });
});

describe("visibility — breakpoint toggles with extras preserved", () => {
  const schema: PropSchema = [
    { key: "vis", label: "Visibility", kind: "visibility" },
  ];

  it("defaults every breakpoint to visible and warns when all are off", () => {
    const on = html(
      <SchemaControls schema={schema} props={{}} onChange={noop} />,
    );
    expect(on).toContain("Desktop");
    expect(on).toContain("Tablet");
    expect(on).toContain("Mobile");
    expect(on).not.toContain("Off on every breakpoint");
    const off = html(
      <SchemaControls
        schema={schema}
        props={{ vis: { desktop: false, tablet: false, mobile: false } }}
        onChange={noop}
      />,
    );
    expect(off).toContain("Off on every breakpoint");
  });
});

describe("animation — effect controls with extras preserved", () => {
  const schema: PropSchema = [
    { key: "anim", label: "Entrance", kind: "animation" },
  ];

  it("renders effect, easing and timing controls bound to storage", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ anim: { type: "fade-up", durationMs: 300 } }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Effect");
    expect(out).toContain("fade-up");
    expect(out).toContain("Duration (ms)");
  });
});

describe("adversarial — hostile media, oversized refs, unknown kinds", () => {
  it("neutralizes hostile media URLs through the value layer only", () => {
    const schema: PropSchema = [
      { key: "hero", label: "Hero", kind: "image" },
      { key: "clip", label: "Clip", kind: "media" },
    ];
    for (const hostile of [
      "javascript:evil()",
      "JaVaScRiPt:evil()",
      "data:text/html,<script>evil()</script>",
      "vbscript:evil()",
    ]) {
      const result = submitSchemaProps(schema, {
        hero: hostile,
        clip: hostile,
      });
      expect(result.ok, hostile).toBe(false);
      expect(result.errors).toContain("hero.not_a_url");
      expect(result.clean.hero).toBe("");
      // SSR markup escapes — no executable markup reaches the document.
      const out = html(
        <SchemaControls
          schema={schema}
          props={{ hero: hostile }}
          errors={result.errors}
          onChange={noop}
        />,
      );
      expect(out).not.toContain("<script>");
      expect(out).toContain("hero.not_a_url");
    }
  });

  it("rejects oversized refs with truncated salvage, never storage", () => {
    const urlSchema: PropSchema = [
      { key: "hero", label: "Hero", kind: "image" },
    ];
    const long = `https://cdn.example/${"x".repeat(3000)}`;
    const urlResult = submitSchemaProps(urlSchema, { hero: long });
    expect(urlResult.ok).toBe(false);
    expect(urlResult.errors).toContain("hero.too_long");
    expect(String(urlResult.clean.hero)).toHaveLength(2048);
    const handleSchema: PropSchema = [
      { key: "pick", label: "Pick", kind: "product" },
    ];
    const handleResult = submitSchemaProps(handleSchema, {
      pick: "p".repeat(200),
    });
    expect(handleResult.ok).toBe(false);
    expect(handleResult.errors).toContain("pick.too_long");
  });

  it("renders cyclic structured values without throwing", () => {
    const cyclic: Record<string, unknown> = { fontFamily: "Inter" };
    cyclic.self = cyclic;
    const out = html(
      <SchemaControls
        schema={[{ key: "type", label: "Type", kind: "typography" }]}
        props={{ type: cyclic }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="typography"');
    expect(out).toContain("Inter");
  });

  it("edits placeholder kinds inside repeater rows on the same contract", () => {
    const schema: PropSchema = [
      {
        key: "slides",
        label: "Slides",
        kind: "repeater",
        fields: [
          { key: "title", label: "Title", kind: "text" },
          { key: "photo", label: "Photo", kind: "image" },
        ],
      },
    ];
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ slides: [{ title: "A", photo: "/a.jpg" }] }}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-placeholder="image"');
    expect(out).toContain("/a.jpg");
    expect(out).toContain("Clear");
  });
});

function structuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
