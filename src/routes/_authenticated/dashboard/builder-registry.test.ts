/**
 * Frame30 task (A) — builder route one-registry wiring pin.
 *
 * The route builds ONE registry from its server-authorized installed plugins
 * and passes it to BOTH the tray (listing/insertion) and the renderer
 * (preview), so listing, inspector-visible definitions, preview and
 * storefront render read the same truth. Tenant isolation holds because the
 * registry derives only from this tenant's authorized installs — nothing is
 * written to the shared singleton.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  "src/routes/_authenticated/dashboard/builder.tsx",
  "utf8",
);

describe("builder route one-registry wiring", () => {
  it("builds one registry from the authorized installs", () => {
    expect(SRC).toContain("buildTrayRegistry(");
    // The single build site feeds both consumers below.
    expect(SRC).toContain("builderRegistry");
  });

  it("passes the same registry to tray, renderer AND inspector", () => {
    const hits = SRC.match(/registry=\{builderRegistry\}/g) ?? [];
    expect(hits.length).toBe(3);
  });

  it("derives the registry only from the server-authorized plugin list", () => {
    expect(SRC).toContain("pluginsQuery.data?.plugins");
  });

  it("documents the one-registry data-flow at the wiring", () => {
    expect(SRC).toMatch(/one-registry|ONE registry/i);
  });
});
