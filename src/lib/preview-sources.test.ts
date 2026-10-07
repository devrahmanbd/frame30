/**
 * Preview sources registry — dynamic theme wiring, no hardcoding.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultPreviewKey,
  demoPreviewTarget,
  previewSourceFor,
  previewSourceKeys,
  registerStaticPreviewSource,
} from "./preview-sources";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
import { somvabonaPreviewSource } from "./themes/somvabona/preview";

// O2: static theme sources are build-time-only — this test file is a
// build-time context, so it wires the factories explicitly. Production
// runtime resolves merchant previews from installed artifacts instead.
registerStaticPreviewSource("songoskriti", songoskritiPreviewSource);
registerStaticPreviewSource("somvabona", somvabonaPreviewSource);

describe("preview-sources registry", () => {
  it("registers keys without the engine naming themes", () => {
    expect(previewSourceKeys()).toContain("songoskriti");
    expect(defaultPreviewKey()).toBe(previewSourceKeys()[0]);
  });

  it("resolves registered keys and null for unknown", () => {
    expect(previewSourceFor("songoskriti")?.key).toBe("songoskriti");
    expect(previewSourceFor("nope")).toBeNull();
  });

  it("builds merchant-less demo targets with template + focus", () => {
    expect(demoPreviewTarget("songoskriti", "collection", "Bestsellers")).toBe(
      "/theme-preview/songoskriti?template=collection&focus=bestsellers",
    );
    expect(demoPreviewTarget("songoskriti", "product", "x")).toBe(
      "/theme-preview/songoskriti?template=product&focus=x",
    );
  });
});

describe("installed package discovery (SWITCHOVER-3)", () => {
  const ARTIFACT = {
    key: "acme-pack",
    themeName: "Acme Pack",
    author: "Acme",
    tokens: { surface: "#112233" },
    templates: {
      index: {
        header: [],
        main: [{ id: "s1", type: "heading", props: { text: "Acme home" } }],
        footer: [],
      },
    },
    variations: [
      {
        key: "minimal",
        label: "Minimal",
        label_bn: "মিনিমাল",
        tokenOverrides: { surface: "#FFFFFF" },
        skinDefaults: {},
      },
    ],
  };

  it("installed set is authoritative: lists installed only, never source fallback", () => {
    // K2: merchant context (array, even empty) lists installed ONLY — source
    // keys fail closed. Legacy null/undefined still lists the registered
    // build-time sources.
    expect(previewSourceKeys([ARTIFACT])).toEqual(["acme-pack"]);
    expect(previewSourceKeys(["songoskriti", ARTIFACT])).toEqual([
      "songoskriti",
      "acme-pack",
    ]);
    expect(previewSourceKeys([])).toEqual([]);
    // Legacy: no merchant context still lists the registered build-time floor.
    expect(previewSourceKeys()).toContain("songoskriti");
    expect(previewSourceKeys(null)).toContain("somvabona");
  });

  it("installed versions resolve to their artifact content", () => {
    const source = previewSourceFor("acme-pack", undefined, [ARTIFACT])!;
    expect(source.key).toBe("acme-pack");
    expect(source.themeName).toBe("Acme Pack");
    expect(source.tokens.surface).toBe("#112233");
    expect(source.main("index", ((t: string, p = {}) => ({ id: "x", type: t, props: p })) as never)).toHaveLength(1);
    // Un-authored templates return null so the engine generic fallback applies.
    expect(source.main("product", ((t: string, p = {}) => ({ id: "x", type: t, props: p })) as never)).toBeNull();
    expect((source.variations ?? []).map((v) => v.key)).toEqual(["minimal"]);
  });

  it("installed variations apply over stored base tokens, unknown falls back", () => {
    const varied = previewSourceFor("acme-pack", "minimal", [ARTIFACT])!;
    expect(varied.tokens.surface).toBe("#FFFFFF");
    const base = previewSourceFor("acme-pack", "nope", [ARTIFACT])!;
    expect(base.tokens.surface).toBe("#112233");
  });

  it("installed rows win over source keys with the same key", () => {
    // K2: installed artifact authoritative — a colliding installed row shadows
    // the static source (never a silent wrong theme).
    const shadow = { ...ARTIFACT, key: "songoskriti", themeName: "Shadow" };
    expect(previewSourceFor("songoskriti", undefined, [shadow])?.themeName).toBe(
      "Shadow",
    );
    expect(previewSourceKeys([shadow])).toEqual(["songoskriti"]);
  });

  it("removal disappears from lists and resolution without crashing", () => {
    expect(previewSourceKeys([ARTIFACT])).toContain("acme-pack");
    expect(previewSourceKeys()).not.toContain("acme-pack");
    expect(previewSourceKeys([])).not.toContain("acme-pack");
    expect(previewSourceFor("acme-pack")).toBeNull();
    expect(previewSourceFor("acme-pack", undefined, [])).toBeNull();
    // Registered build-time keys stay intact after removal.
    expect(previewSourceKeys()).toContain("songoskriti");
    expect(previewSourceFor("songoskriti")?.key).toBe("songoskriti");
  });

  it("garbage installed inputs never crash discovery", () => {
    const garbage = [null, undefined, "", "   ", 42, {}, { key: 7 }] as never[];
    // K2: merchant context (array) fails closed to [] on garbage — never source.
    expect(previewSourceKeys(garbage)).toEqual([]);
    expect(previewSourceFor("acme-pack", undefined, garbage)).toBeNull();
    expect(previewSourceFor("acme-pack", undefined, [{ key: "acme-pack" }])).not.toBeNull();
  });

  it("malformed artifact payloads resolve to safe defaults, never throw", () => {
    const bad = { key: "bad-pack", tokens: "nope", templates: 42 } as never;
    const source = previewSourceFor("bad-pack", undefined, [bad])!;
    expect(source.key).toBe("bad-pack");
    expect(source.themeName).toBe("bad-pack");
    expect(typeof source.tokens.surface).toBe("string");
    expect(
      source.main("index", ((t: string, p = {}) => ({ id: "x", type: t, props: p })) as never),
    ).toBeNull();
  });

  it("unregistered keys fail closed with no merchant context (never source)", () => {
    // O2: nothing is registered for this key at build time, and no installed
    // set is passed — resolution fails closed to null, never a wrong theme.
    expect(previewSourceFor("never-built-xyz")).toBeNull();
    expect(previewSourceFor("never-built-xyz", undefined, null)).toBeNull();
    expect(previewSourceKeys()).not.toContain("never-built-xyz");
  });

  it("ships no static theme imports — static sources are build-time-only", () => {
    // O2: the runtime module must never import theme source directly;
    // build-time contexts wire factories through registerStaticPreviewSource.
    const src = readFileSync(
      join(process.cwd(), "src/lib/preview-sources.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/themes\/(songoskriti|somvabona)\/preview/);
    expect(src).toMatch(/registerStaticPreviewSource/);
  });
});
