import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKEND,
  FRESH_BREAKER,
  coalesceIndexOps,
  decideEngine,
  explainHealth,
  normalizeBackend,
  normalizeQuery,
  recordFailure,
  recordSuccess,
  sortExpression,
  toFilterExpression,
} from "./search-backend";

describe("normalizeBackend", () => {
  it("falls back to postgres when a remote engine has no host", () => {
    expect(normalizeBackend({ engine: "meilisearch" }).engine).toBe("postgres");
  });

  it("keeps a remote engine that is fully configured", () => {
    const c = normalizeBackend({ engine: "typesense", host: "https://s.example.com" });
    expect(c.engine).toBe("typesense");
  });

  it("clamps absurd timeouts and thresholds", () => {
    const c = normalizeBackend({ timeoutMs: 999_999, failureThreshold: 0, cooldownSeconds: 1 });
    expect(c.timeoutMs).toBe(5000);
    expect(c.failureThreshold).toBe(1);
    expect(c.cooldownSeconds).toBe(5);
  });
});

describe("circuit breaker", () => {
  const config = normalizeBackend({ engine: "meilisearch", host: "https://s.example.com" });

  it("serves the remote engine while healthy", () => {
    expect(decideEngine(config, FRESH_BREAKER).engine).toBe("meilisearch");
  });

  it("reports degraded after a failure that has not tripped the breaker", () => {
    const b = recordFailure(config, FRESH_BREAKER, "timeout");
    const d = decideEngine(config, b);
    expect(d.engine).toBe("meilisearch");
    expect(d.health).toBe("degraded");
  });

  it("falls back to postgres once the threshold trips", () => {
    let b = FRESH_BREAKER;
    for (let i = 0; i < config.failureThreshold; i += 1) b = recordFailure(config, b, "timeout", 1000);
    const d = decideEngine(config, b, 1000);
    expect(d.action).toBe("open");
    expect(d.engine).toBe("postgres");
    expect(d.health).toBe("down");
  });

  it("does not reset the cooldown clock on further failures while open", () => {
    let b = FRESH_BREAKER;
    for (let i = 0; i < config.failureThreshold; i += 1) b = recordFailure(config, b, "timeout", 1000);
    const openedAt = b.openedAt;
    b = recordFailure(config, b, "timeout", 50_000);
    expect(b.openedAt).toBe(openedAt);
  });

  it("allows a single probe after the cooldown elapses", () => {
    let b = FRESH_BREAKER;
    for (let i = 0; i < config.failureThreshold; i += 1) b = recordFailure(config, b, "timeout", 1000);
    const d = decideEngine(config, b, 1000 + config.cooldownSeconds * 1000);
    expect(d.action).toBe("probe");
  });

  it("closes fully on a successful probe", () => {
    expect(recordSuccess()).toEqual(FRESH_BREAKER);
  });

  it("never opens for the postgres engine", () => {
    const d = decideEngine(DEFAULT_BACKEND, { ...FRESH_BREAKER, openedAt: 1 });
    expect(d.engine).toBe("postgres");
    expect(d.action).toBe("closed");
  });
});

describe("query normalization", () => {
  it("strips control characters and caps length", () => {
    const q = normalizeQuery({ term: `  shirt\u0001 ${"x".repeat(300)}` });
    expect(q.term.length).toBeLessThanOrEqual(120);
    expect(q.term).not.toContain("\u0001");
  });

  it("clamps pagination", () => {
    expect(normalizeQuery({ limit: 500, offset: -5 })).toMatchObject({ limit: 60, offset: 0 });
  });
});

describe("filter expressions", () => {
  it("quotes and escapes string values", () => {
    const expr = toFilterExpression("meilisearch", { brand: 'A" OR 1=1' });
    expect(expr).toBe('brand = "A\\" OR 1=1"');
  });

  it("drops keys with unsafe characters", () => {
    expect(toFilterExpression("meilisearch", { "bad key!": "x" })).toBe('badkey = "x"');
  });

  it("uses the typesense conjunction", () => {
    const expr = toFilterExpression("typesense", { a: 1, b: true });
    expect(expr).toBe("a = 1 && b = true");
  });

  it("skips empty values", () => {
    expect(toFilterExpression("meilisearch", { a: null, b: "" })).toBe("");
  });

  it("sorts by text match for relevance on typesense only", () => {
    expect(sortExpression("typesense", "relevance")).toEqual(["_text_match:desc"]);
    expect(sortExpression("meilisearch", "relevance")).toEqual([]);
    expect(sortExpression("meilisearch", "price_asc")).toEqual(["price_minor:asc"]);
  });
});

describe("coalesceIndexOps", () => {
  it("keeps only the last intent per document", () => {
    const out = coalesceIndexOps([
      { documentId: "p1", op: "upsert", seq: 1 },
      { documentId: "p1", op: "delete", seq: 2 },
      { documentId: "p2", op: "upsert", seq: 3 },
    ]);
    expect(out).toEqual([
      { documentId: "p1", op: "delete" },
      { documentId: "p2", op: "upsert" },
    ]);
  });

  it("ignores out-of-order stale ops", () => {
    const out = coalesceIndexOps([
      { documentId: "p1", op: "delete", seq: 5 },
      { documentId: "p1", op: "upsert", seq: 2 },
    ]);
    expect(out).toEqual([{ documentId: "p1", op: "delete" }]);
  });
});

describe("explainHealth", () => {
  it("reassures the merchant that search still works when down", () => {
    expect(explainHealth("down")).toContain("still fully searchable");
    expect(explainHealth("down", "bn")).toContain("বিল্ট-ইন");
  });
});
