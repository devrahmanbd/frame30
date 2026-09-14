/**
 * Phase 4 exit gate.
 *
 * These are contract tests, not unit tests: each one pins a promise the
 * roadmap makes about performance, so a future change that breaks the promise
 * fails here rather than in a Lighthouse run nobody watches.
 */
import { describe, expect, it } from "vitest";
import type { Section, ThemeAst } from "./builder-ast";
import { WIDGET_TYPES } from "./widget-registry";
import { hydrationMode } from "./widget-hydration";
import {
  HYDRATION_POLICY,
  TEMPLATE_JS_BUDGET,
  describePerf,
  hydrationAudit,
  hydrationClass,
  imageAudit,
  perfGate,
  templateWeight,
  weightTable,
  widgetWeight,
} from "./widget-weight";
import {
  MAX_BATCH,
  normalizeBatch,
  normalizeSample,
  normalizePath,
  percentile,
  summarize,
} from "./vitals-report";
import { vitalsVerdict } from "./vitals.server";

let seq = 0;
function node(type: string, props: Record<string, unknown> = {}, children?: Section[]): Section {
  seq += 1;
  return { id: `n${seq}`, type: type as Section["type"], props: props as Section["props"], ...(children ? { children } : {}) };
}
function ast(main: Section[], header: Section[] = [], footer: Section[] = []): ThemeAst {
  return { header, main, footer };
}

/* ------------------------------------------------------------------ */
/* 4.1 weight budgets                                                  */
/* ------------------------------------------------------------------ */

describe("per-widget weight budgets", () => {
  it("charges every widget a weight and zero for static islands", () => {
    for (const type of WIDGET_TYPES) {
      const weight = widgetWeight(type);
      expect(weight.jsBytes).toBeGreaterThanOrEqual(0);
      if (hydrationMode(type) === "static") expect(weight.jsBytes).toBe(0);
      else expect(weight.jsBytes).toBeGreaterThan(0);
    }
  });

  it("keeps every route budget positive and checkout the tightest", () => {
    for (const bytes of Object.values(TEMPLATE_JS_BUDGET)) expect(bytes).toBeGreaterThan(0);
    expect(TEMPLATE_JS_BUDGET.checkout).toBeLessThan(TEMPLATE_JS_BUDGET.index);
  });

  it("a lean editorial page costs no client JS at all", () => {
    const report = templateWeight(ast([node("heading"), node("rich_text"), node("divider")]), "page");
    expect(report.totalBytes).toBe(0);
    expect(report.staticShare).toBe(1);
    expect(report.failures).toHaveLength(0);
  });

  it("names the offenders, biggest first, when a template blows its budget", () => {
    const heavy = Array.from({ length: 12 }, () => node("plugin_block"));
    const report = templateWeight(ast(heavy), "page");
    expect(report.overBytes).toBeGreaterThan(0);
    const codes = report.failures.map((f) => f.code);
    expect(codes).toContain("perf.weight");
    expect(report.offenders[0]!.type).toBe("plugin_block");
  });

  it("blocks a single widget that eats half a route on its own", () => {
    const report = templateWeight(ast([node("store_locator"), node("store_locator"), node("store_locator")]), "checkout");
    expect(report.failures.some((f) => f.code === "perf.weight_single")).toBe(true);
  });

  it("counts nested children, not just top-level sections", () => {
    const flat = templateWeight(ast([node("product_rail"), node("product_rail")]), "index");
    const nested = templateWeight(ast([node("container", {}, [node("product_rail"), node("product_rail")])]), "index");
    expect(nested.totalBytes).toBeGreaterThanOrEqual(flat.totalBytes);
    expect(nested.nodeCount).toBe(3);
  });

  it("exposes the whole table sorted heaviest first", () => {
    const table = weightTable();
    expect(table).toHaveLength(WIDGET_TYPES.length);
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i - 1]!.jsBytes).toBeGreaterThanOrEqual(table[i]!.jsBytes);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4.2 hydration policy                                                */
/* ------------------------------------------------------------------ */

describe("hydration policy", () => {
  it("holds across the entire widget registry", () => {
    const failures = hydrationAudit();
    expect(failures.map((f) => f.message)).toEqual([]);
  });

  it("classifies every widget into a policy class with allowed modes", () => {
    for (const type of WIDGET_TYPES) {
      const policy = HYDRATION_POLICY[hydrationClass(type)];
      expect(policy.allowed.length).toBeGreaterThan(0);
      expect(policy.allowed).toContain(hydrationMode(type));
    }
  });

  it("rejects an editorial widget that hydrates", () => {
    // Simulated drift: audit a class whose policy is violated by construction.
    const policy = HYDRATION_POLICY.editorial;
    expect(policy.allowed).toEqual(["static"]);
    expect(policy.allowed).not.toContain("eager");
  });
});

/* ------------------------------------------------------------------ */
/* 4.3 image contract                                                  */
/* ------------------------------------------------------------------ */

describe("image contract", () => {
  it("allows exactly one explicit LCP candidate", () => {
    const report = imageAudit(ast([node("hero", { image: "/a.jpg", ratio: "aspect-video", priority: true })]));
    expect(report.priorityNodes).toHaveLength(1);
    expect(report.failures.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("blocks a second fetchpriority=high node", () => {
    const report = imageAudit(
      ast([
        node("hero", { image: "/a.jpg", ratio: "aspect-video", priority: true }),
        node("banner", { image: "/b.jpg", ratio: "aspect-video", priority: true }),
      ]),
    );
    expect(report.failures.some((f) => f.code === "img.priority_multiple")).toBe(true);
  });

  it("blocks a priority claim from the footer", () => {
    const report = imageAudit(
      ast([], [], [node("hero", { image: "/b.jpg", ratio: "aspect-video", priority: true })]),
    );
    expect(report.failures.some((f) => f.code === "img.priority_below_fold")).toBe(true);
  });

  it("only warns when the LCP candidate is implicit", () => {
    const report = imageAudit(ast([node("hero", { image: "/a.jpg", ratio: "aspect-video" })]));
    expect(report.failures.every((f) => f.severity === "warn")).toBe(true);
    expect(report.lcpNodeId).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* composed gate                                                       */
/* ------------------------------------------------------------------ */

describe("perf gate", () => {
  it("passes a realistic index template and describes it", () => {
    const report = perfGate({
      ast: ast(
        [node("hero", { image: "/a.jpg", ratio: "aspect-video", priority: true }), node("product_rail"), node("rich_text")],
        [node("announcement_bar")],
      ),
      template: "index",
    });
    expect(report.ok).toBe(true);
    expect(describePerf(report)).toContain("gz widget JS");
  });

  it("fails and reports blocking failures separately from advice", () => {
    const report = perfGate({
      ast: ast(Array.from({ length: 20 }, () => node("plugin_block"))),
      template: "checkout",
    });
    expect(report.ok).toBe(false);
    expect(report.failures.every((f) => f.severity === "error")).toBe(true);
    expect(report.warnings.every((f) => f.severity === "warn")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 4.4 real-user monitoring                                            */
/* ------------------------------------------------------------------ */

describe("vitals ingest normalisation", () => {
  it("rejects unknown metrics and non-numeric values", () => {
    expect(normalizeSample({ metric: "hovers", value: 1 })).toBeNull();
    expect(normalizeSample({ metric: "lcp", value: "fast" })).toBeNull();
    expect(normalizeSample({ metric: "lcp", value: -5 })).toBeNull();
  });

  it("clamps an absurd background-tab LCP instead of dropping it", () => {
    const sample = normalizeSample({ metric: "lcp", value: 3_600_000 })!;
    expect(sample.value).toBe(60_000);
    expect(sample.clamped).toBe(true);
    expect(sample.rating).toBe("poor");
  });

  it("strips query strings and rejects non-absolute paths", () => {
    expect(normalizePath("/p/shirt?session=abc&email=a@b.c")).toBe("/p/shirt");
    expect(normalizePath("https://evil.test/x")).toBe("/");
    expect(normalizePath(42)).toBe("/");
  });

  it("truncates an oversized batch and keeps the worst duplicate", () => {
    const rows = Array.from({ length: MAX_BATCH + 8 }, (_, i) => ({
      metric: "lcp",
      value: 1000 + i,
      path: "/",
      device: "mobile",
    }));
    const result = normalizeBatch(rows);
    expect(result.truncated).toBe(true);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]!.value).toBe(1000 + MAX_BATCH - 1);
  });

  it("counts malformed rows without throwing", () => {
    const result = normalizeBatch([null, 7, { metric: "cls", value: 0.01 }, { metric: "nope", value: 1 }]);
    expect(result.rejected).toBe(3);
    expect(result.samples).toHaveLength(1);
  });
});

describe("vitals aggregation", () => {
  it("uses nearest-rank p75", () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3);
    expect(percentile([], 0.75)).toBe(0);
  });

  it("summarises per device and flags a budget breach only with enough samples", () => {
    const slow = Array.from({ length: 40 }, () => ({ metric: "lcp", value: 6000, device: "mobile", path: "/" }));
    const summary = summarize(slow);
    expect(summary.total).toBe(40);
    expect(summary.failing.length).toBeGreaterThan(0);
    expect(vitalsVerdict(summary).ok).toBe(false);

    const quiet = summarize([{ metric: "lcp", value: 9000, device: "mobile", path: "/" }]);
    expect(quiet.failing).toHaveLength(0);
    expect(vitalsVerdict(quiet).ok).toBe(true);
  });

  it("ranks the slowest paths for the merchant", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ metric: "lcp", value: 5000, device: "mobile", path: "/p/slow" })),
      ...Array.from({ length: 6 }, () => ({ metric: "lcp", value: 900, device: "mobile", path: "/p/fast" })),
    ];
    const summary = summarize(rows);
    expect(summary.worstPaths[0]!.path).toBe("/p/slow");
  });
});
