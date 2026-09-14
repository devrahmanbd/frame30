import { describe, expect, it } from "vitest";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  expandImplied,
  intersectScopes,
  matchRoute,
  parseScopes,
  refusedScopes,
  requiresIdempotency,
  satisfies,
  SCOPE_CATALOG,
  SCOPES,
} from "./api-scopes";

describe("scope parsing", () => {
  it("accepts space, comma and array forms and drops unknown scopes", () => {
    expect(parseScopes("orders.read products.write")).toEqual(["orders.read", "products.write"]);
    expect(parseScopes("orders.read,shells.delete")).toEqual(["orders.read"]);
    expect(parseScopes(["orders.read", "orders.read"])).toEqual(["orders.read"]);
    expect(parseScopes(undefined)).toEqual([]);
  });

  it("documents every scope it ships", () => {
    expect(SCOPE_CATALOG.map((s) => s.scope).sort()).toEqual([...SCOPES].sort());
  });
});

describe("intersection is the only grant path", () => {
  it("never returns a scope the registration forbids", () => {
    const granted = intersectScopes(["orders.read", "products.write"], ["orders.read"]);
    expect(granted).toEqual(["orders.read"]);
    expect(refusedScopes(["orders.read", "products.write"], ["orders.read"])).toEqual([
      "products.write",
    ]);
  });

  it("an empty allowlist grants nothing", () => {
    expect(intersectScopes(["orders.read"], [])).toEqual([]);
  });
});

describe("implication", () => {
  it("write implies read on the same resource only", () => {
    expect(expandImplied(["products.write"])).toEqual(["products.read", "products.write"]);
    expect(satisfies(["products.write"], "products.read")).toBe(true);
    expect(satisfies(["products.write"], "orders.read")).toBe(false);
  });
});

describe("cursors", () => {
  it("round-trips", () => {
    const c = { ts: "2026-01-01T00:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("treats tampered input as absent instead of throwing", () => {
    expect(decodeCursor("!!!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(encodeCursor({ ts: "not-a-date", id: "x" }))).toBeNull();
  });

  it("clamps page size", () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit("5")).toBe(5);
    expect(clampLimit("5000")).toBe(100);
    expect(clampLimit("-2")).toBe(25);
  });
});

describe("route table", () => {
  it("matches params and rejects method mismatches", () => {
    expect(matchRoute("GET", "orders/123")?.params).toEqual({ id: "123" });
    expect(matchRoute("DELETE", "orders/123")).toBeNull();
    expect(matchRoute("GET", "orders/123/extra")).toBeNull();
  });

  it("requires idempotency on writes only", () => {
    expect(requiresIdempotency("GET")).toBe(false);
    expect(requiresIdempotency("post")).toBe(true);
  });
});
