import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIOS, markdownTable, scenarioVerdict } from "../../scripts/load-suite.mjs";

const CAPACITY = readFileSync("docs/14-operations/load-and-capacity.md", "utf8");
const RUNBOOKS = readFileSync("docs/14-operations/runbooks.md", "utf8");

function anchors(md: string) {
  const explicit = [...md.matchAll(/<a id="([a-z0-9-]+)"><\/a>/g)].map((m) => m[1]!);
  return new Set([
    ...explicit,
    ...(md
      .split("\n")
      .filter((l) => l.startsWith("#"))
      .map((l) =>
        l
          .replace(/^#+\s*/, "")
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-"),
      )),
  ]);
}

describe("Phase 14 — load suite", () => {
  it("covers the catalogue, order and crawler scenarios with budgets", () => {
    const keys = SCENARIOS.map((s: { key: string }) => s.key);
    for (const required of ["storefront_home", "collection_list", "search", "product_detail", "sitemap"]) {
      expect(keys).toContain(required);
    }
    for (const s of SCENARIOS as { budgetP95Ms: number }[]) {
      expect(s.budgetP95Ms).toBeGreaterThan(0);
      expect(s.budgetP95Ms).toBeLessThanOrEqual(2500);
    }
  });

  it("fails a scenario that passes the generic verdict but misses its own budget", () => {
    expect(scenarioVerdict({ verdict: "pass", p95Ms: 400 }, 800)).toBe("pass");
    expect(scenarioVerdict({ verdict: "pass", p95Ms: 1200 }, 800)).toBe("fail");
    expect(scenarioVerdict({ verdict: "fail", p95Ms: 10 }, 800)).toBe("fail");
  });

  it("prints a table an operator can paste into the record", () => {
    const md = markdownTable([
      { scenario: "search", scale: "2000 SKUs", concurrency: 20, requests: 100, p50Ms: 1, p95Ms: 2, p99Ms: 3, rps: 4, budgetP95Ms: 900, verdict: "pass" },
    ]);
    expect(md.split("\n")).toHaveLength(3);
    expect(md).toContain("| search |");
  });
});

describe("Phase 14 — capacity record", () => {
  it("states the scale, the budgets and the run record", () => {
    expect(CAPACITY).toContain("2,000 SKUs");
    expect(CAPACITY).toContain("50,000");
    expect(CAPACITY).toContain("50 stores");
    expect(CAPACITY).toContain("## Run record");
  });

  it("names what one node handles and the first thing to split out", () => {
    expect(CAPACITY).toMatch(/first thing to split out/i);
    expect(CAPACITY).toMatch(/Postgres/);
  });

  it("links five incidents to runbook anchors that exist", () => {
    const links = [...CAPACITY.matchAll(/\]\(\.\/runbooks\.md#([a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(new Set(links).size).toBeGreaterThanOrEqual(5);
    const available = anchors(RUNBOOKS);
    for (const anchor of links) expect(available.has(anchor)).toBe(true);
  });

  it("keeps every alert rule pointed at a runbook that exists", () => {
    const files = readdirSync("ops/observability").filter((f) => f.endsWith(".rules.yml"));
    const available = anchors(RUNBOOKS);
    for (const file of files) {
      const body = readFileSync(`ops/observability/${file}`, "utf8");
      for (const m of body.matchAll(/runbook:\s*"docs\/14-operations\/runbooks\.md#([a-z0-9-]+)"/g)) {
        expect(available.has(m[1]!), `${file} → ${m[1]}`).toBe(true);
      }
    }
  });
});
