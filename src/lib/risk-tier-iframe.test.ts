import { describe, it, expect } from "vitest";
import { resolvePolicy } from "./risk-tier";

describe("iframe sandbox by tier", () => {
  it("low: allow-forms allow-popups", () => {
    expect(resolvePolicy("low").iframe.sandbox).toBe(
      "allow-forms allow-popups",
    );
  });

  it("lower_medium: allow-forms only", () => {
    expect(resolvePolicy("lower_medium").iframe.sandbox).toBe("allow-forms");
  });

  it("medium: empty (full lockdown)", () => {
    expect(resolvePolicy("medium").iframe.sandbox).toBe("");
  });

  it("high: empty (full lockdown)", () => {
    expect(resolvePolicy("high").iframe.sandbox).toBe("");
  });

  it("low: maxHeight 4000", () => {
    expect(resolvePolicy("low").iframe.maxHeight).toBe(4000);
  });

  it("medium: maxHeight 1000", () => {
    expect(resolvePolicy("medium").iframe.maxHeight).toBe(1000);
  });

  it("high: maxHeight 0 (disabled)", () => {
    expect(resolvePolicy("high").iframe.maxHeight).toBe(0);
  });
});
