/** Regression: auth mode must live in the URL (search.mode), never dual local state.
 *  Bug: tab click set local mode, URL stayed mode=signup, sync effect stomped local
 *  state back — Sign In tab "bounced" without switching. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextAuthSearch, parseAuthMode } from "./auth-mode";

describe("parseAuthMode", () => {
  it("accepts the three valid modes", () => {
    expect(parseAuthMode("signin")).toBe("signin");
    expect(parseAuthMode("signup")).toBe("signup");
    expect(parseAuthMode("reset")).toBe("reset");
  });

  it("rejects junk and missing values", () => {
    expect(parseAuthMode("admin")).toBeUndefined();
    expect(parseAuthMode(undefined)).toBeUndefined();
    expect(parseAuthMode(42)).toBeUndefined();
  });
});

describe("nextAuthSearch", () => {
  it("sets mode and preserves redirect", () => {
    expect(
      nextAuthSearch({ redirect: "/dashboard", mode: "signup" }, "signin"),
    ).toEqual({ redirect: "/dashboard", mode: "signin" });
  });

  it("works without redirect", () => {
    expect(nextAuthSearch({}, "signup")).toEqual({ mode: "signup" });
    expect(nextAuthSearch({ mode: "reset" }, "signin")).toEqual({
      mode: "signin",
    });
  });
});

describe("auth.tsx architecture guard", () => {
  const source = readFileSync(
    new URL("../routes/auth.tsx", import.meta.url),
    "utf8",
  );

  it("has no local mode state (single source of truth: URL search.mode)", () => {
    expect(source).not.toMatch(/useState<Mode>\(/);
    expect(source).not.toMatch(/\bsetMode\(/);
  });

  it("derives mode from the search param", () => {
    expect(source).toMatch(/search\.mode \?\? "signin"/);
  });
});
