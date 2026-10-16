/**
 * Frame30 item 13 (extension versioning + recovery) — Pass 1: pure
 * compatibility validation (RED first).
 *
 * Covers the pure helpers in `src/lib/plugin-package.ts`:
 * - version parsing / ordering (incl. prerelease, build metadata, garbage)
 * - downgrade detection (equal counts as "not an update")
 * - update compatibility: version ordering, builder-API floor (ranges AND
 *   exact pins), capability ceilings, permission widening (consent signal),
 *   widget removals (preserved-data signal), schema breaking changes
 * - schema diff + validated migration (safe defaults, explicit drops)
 */
import { describe, expect, it } from "vitest";
import {
  checkExtensionUpdateCompat,
  compareExtensionVersions,
  diffExtensionSchemas,
  isExtensionDowngrade,
  migrateExtensionProps,
  parseExtensionVersion,
} from "./plugin-package";

function manifest(
  version: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "acme-reviews",
    name: "Acme Reviews",
    version,
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
      },
    ],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
    budget: { jsKb: 10, mainThreadMs: 5 },
    ...extra,
  };
}

function schemaManifest(
  version: string,
  propsSchema: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const widgets = [
    {
      key: "reviews",
      label: "Customer Reviews",
      slots: ["main"],
      entry: "framique.mount(document.createElement('div'))",
      propsSchema,
    },
  ];
  return manifest(version, { widgets, ...extra });
}

describe("parseExtensionVersion", () => {
  it("parses strict semver", () => {
    expect(parseExtensionVersion("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
  });

  it("parses prerelease suffixes", () => {
    expect(parseExtensionVersion("2.0.0-beta.1")?.prerelease).toBe("beta.1");
  });

  it("ignores build metadata for ordering identity", () => {
    expect(parseExtensionVersion("1.2.3+build.9")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
  });

  it("rejects garbage as null (never a silent zero version)", () => {
    expect(parseExtensionVersion("banana")).toBeNull();
    expect(parseExtensionVersion("1.2")).toBeNull();
    expect(parseExtensionVersion("")).toBeNull();
    expect(parseExtensionVersion(undefined)).toBeNull();
  });
});

describe("compareExtensionVersions", () => {
  it("orders numerically, not lexicographically", () => {
    expect(compareExtensionVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareExtensionVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareExtensionVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("ranks prerelease below its release", () => {
    expect(compareExtensionVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(compareExtensionVersions("1.0.0", "1.0.0-alpha")).toBeGreaterThan(0);
  });

  it("ignores build metadata", () => {
    expect(compareExtensionVersions("1.0.0+a", "1.0.0+b")).toBe(0);
  });

  it("returns null when either side is unparseable (never silent equality)", () => {
    expect(compareExtensionVersions("banana", "1.0.0")).toBeNull();
    expect(compareExtensionVersions("1.0.0", "banana")).toBeNull();
  });
});

describe("isExtensionDowngrade", () => {
  it("flags older candidates", () => {
    expect(isExtensionDowngrade("1.1.0", "1.0.0")).toBe(true);
  });

  it("flags equal versions (reinstall is not an update)", () => {
    expect(isExtensionDowngrade("1.0.0", "1.0.0")).toBe(true);
  });

  it("allows strictly newer candidates", () => {
    expect(isExtensionDowngrade("1.0.0", "1.1.0")).toBe(false);
  });

  it("allows updates over legacy garbage (presence suffices, never stranded)", () => {
    expect(isExtensionDowngrade("banana", "1.0.0")).toBe(false);
  });
});

describe("checkExtensionUpdateCompat", () => {
  it("accepts a clean minor update", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0"),
    });
    expect(verdict.ok).toBe(true);
  });

  it("refuses same-version reinstalls as version_not_newer", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.0.0"),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("version_not_newer");
  });

  it("refuses downgrades as version_not_newer", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.1.0"),
      candidateManifest: manifest("1.0.0"),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("version_not_newer");
  });

  it("refuses candidates the running builder cannot satisfy", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0", { api: "^99.0.0" }),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("api_incompatible");
  });

  it("admits exact pins matching the running builder API", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0", { api: "3.1.0" }),
      builderApi: "3.1.0",
    });
    expect(verdict.ok).toBe(true);
  });

  it("refuses exact pins for a different API line", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0", { api: "3.0.0" }),
      builderApi: "3.1.0",
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("api_incompatible");
  });

  it("reports widened permissions as a consent signal (not silent)", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0", {
        permissions: ["read_shop", "render_storefront", "read_products"],
      }),
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.requiresConsent).toBe(true);
      expect(verdict.addedPermissions).toContain("read_products");
    }
  });

  it("flags removed widgets as preserved-data warnings (never deletion)", () => {
    const installed = manifest("1.0.0");
    const candidate = {
      ...manifest("1.1.0"),
      widgets: [],
    };
    const verdict = checkExtensionUpdateCompat({
      installedManifest: installed,
      candidateManifest: candidate,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.widgetsRemoved).toContain("reviews");
  });

  it("accepts added schema fields (safe defaults cover them)", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: schemaManifest("1.0.0", [
        { key: "title", label: "Title", kind: "text", default: "Hi" },
      ]),
      candidateManifest: schemaManifest("1.1.0", [
        { key: "title", label: "Title", kind: "text", default: "Hi" },
        { key: "limit", label: "Limit", kind: "number", default: 6 },
      ]),
    });
    expect(verdict.ok).toBe(true);
  });

  it("warns (not refuses) when an optional schema field is removed", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: schemaManifest("1.0.0", [
        { key: "title", label: "Title", kind: "text", default: "Hi" },
        { key: "note", label: "Note", kind: "text" },
      ]),
      candidateManifest: schemaManifest("1.1.0", [
        { key: "title", label: "Title", kind: "text", default: "Hi" },
      ]),
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(
        verdict.schemaMigrations.some((m) => m.droppedKeys.includes("note")),
      ).toBe(true);
    }
  });

  it("refuses removal of a required schema field (validated migration needed)", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: schemaManifest("1.0.0", [
        {
          key: "title",
          label: "Title",
          kind: "text",
          required: true,
          default: "Hi",
        },
      ]),
      candidateManifest: schemaManifest("1.1.0", []),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("schema_migration_required");
  });

  it("refuses type changes on shared schema keys", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: schemaManifest("1.0.0", [
        { key: "limit", label: "Limit", kind: "number", default: 6 },
      ]),
      candidateManifest: schemaManifest("1.1.0", [
        { key: "limit", label: "Limit", kind: "text", default: "6" },
      ]),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("schema_migration_required");
  });

  it("refuses capability ceilings over the documented budget", () => {
    const verdict = checkExtensionUpdateCompat({
      installedManifest: manifest("1.0.0"),
      candidateManifest: manifest("1.1.0", {
        budget: { jsKb: 9999, mainThreadMs: 5 },
      }),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("capability_ceiling");
  });
});

describe("diffExtensionSchemas", () => {
  it("reports added, removed, and type-changed keys", () => {
    const diff = diffExtensionSchemas(
      [
        { key: "keep", label: "Keep", kind: "text" },
        { key: "drop", label: "Drop", kind: "text" },
        { key: "flip", label: "Flip", kind: "number" },
      ],
      [
        { key: "keep", label: "Keep", kind: "text" },
        { key: "fresh", label: "Fresh", kind: "boolean" },
        { key: "flip", label: "Flip", kind: "text" },
      ],
    );
    expect(diff.added).toEqual(["fresh"]);
    expect(diff.removed).toEqual(["drop"]);
    expect(diff.typeChanged).toEqual([
      { key: "flip", from: "number", to: "text" },
    ]);
  });
});

describe("migrateExtensionProps", () => {
  const oldSchema = [
    { key: "title", label: "Title", kind: "text", default: "Hi" },
    { key: "limit", label: "Limit", kind: "number", default: 6 },
  ];
  const newSchema = [
    { key: "title", label: "Title", kind: "text", default: "Hi" },
    { key: "limit", label: "Limit", kind: "number", default: 6 },
    { key: "fresh", label: "Fresh", kind: "boolean", default: true },
  ];

  it("preserves surviving values and defaults added fields", () => {
    const out = migrateExtensionProps(oldSchema, newSchema, {
      title: "Kept",
      limit: 3,
    });
    expect(out.props.title).toBe("Kept");
    expect(out.props.limit).toBe(3);
    expect(out.props.fresh).toBe(true);
    expect(out.dropped).toEqual([]);
  });

  it("lists dropped keys explicitly (never silent data loss)", () => {
    const out = migrateExtensionProps(oldSchema, [], {
      title: "Kept",
      limit: 3,
      ghost: "unknown-key",
    });
    expect(out.dropped).toContain("title");
    expect(out.dropped).toContain("limit");
    expect(out.dropped).toContain("ghost");
    expect(out.props).toEqual({});
  });

  it("repairs invalid survivor values to safe defaults and reports errors", () => {
    const out = migrateExtensionProps(oldSchema, newSchema, {
      title: "Kept",
      limit: "not-a-number",
    });
    expect(out.props.title).toBe("Kept");
    expect(out.props.limit).toBe(6);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
