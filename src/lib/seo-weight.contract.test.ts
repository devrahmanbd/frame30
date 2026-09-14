import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { auditImportGraph, auditQueryDiscipline, auditRenderPathRead, byteLength, checkGraphSingletons, composeWeightReport, measureHead, staticImports } from "./seo-weight";

describe("Phase 7 weight contract", () => {
  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    expect(byteLength("দোকান")).toBeGreaterThan("দোকান".length);
  });

  it("uses an injected real-gzip measurement", () => {
    const head = { meta: [{ title: "A".repeat(600) }], links: [], scripts: [] };
    const measured = measureHead("/store/demo", head, (text) => gzipSync(Buffer.from(text)).byteLength);
    expect(measured.gzBytes).toBe(gzipSync(Buffer.from(measured.html)).byteLength);
    expect(measured.rawBytes).toBeGreaterThan(measured.gzBytes);
  });

  it("names duplicated graph types and blocks the report", () => {
    const graph = { type: "application/ld+json", children: JSON.stringify({ "@type": "Product" }) };
    const measured = measureHead("/p/a", { meta: [], links: [], scripts: [graph, graph] });
    expect(checkGraphSingletons(measured)[0]?.offender).toBe("Product");
    expect(composeWeightReport({ heads: [measured] }).ok).toBe(false);
  });

  it("walks transitive static imports but ignores lazy imports", () => {
    const files = { "entry.ts": 'import "./middle";\nvoid import("./seo-analysis");', "middle.ts": 'import "./seo-analysis";' };
    const found = auditImportGraph(files, (specifier) => specifier === "./middle" ? "middle.ts" : null, ["entry.ts"]);
    expect(found).toHaveLength(1);
    expect(staticImports(files["entry.ts"])).toEqual(["./middle"]);
  });

  it("rejects render reads without timeout/cache/fallback contract", () => {
    const read = { module: "x.ts", fn: "load", note: "test" };
    const findings = auditRenderPathRead(read, "export async function load() { return db.from('x'); }");
    expect(findings.map((f) => f.code)).toContain("render_read:uncontracted");
    expect(findings.map((f) => f.code)).toContain("render_read:no_fallback");
  });

  it("flags awaited database calls in loops", () => {
    expect(auditQueryDiscipline("x.ts", "for (const id of ids) {\n await db.from('x').select().eq('id', id);\n}")[0]?.code).toBe("query:n_plus_one");
  });
});