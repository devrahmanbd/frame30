/**
 * Threat-defense — package quarantine scan (pure).
 *
 * `scanPackage` aggregates content findings over package files into a
 * verdict: secrets or script-bearing SVG flag the version for approval;
 * external URLs and permission inventories are informational (widening is
 * gated separately at update time). Verdicts drive the activation/enable
 * approval gates — never silent auto-pass for flagged content.
 */
import { describe, expect, it } from "vitest";
import { scanPackage } from "./package-scan";

const file = (path: string, content: string) => ({
  path,
  bytes: new TextEncoder().encode(content),
});

const OPENAI_KEY = "sk-abcdefghij0123456789ABCDEFGH0123";

describe("scanPackage", () => {
  it("reports clean for ordinary content", () => {
    const report = scanPackage([
      file("theme.json", JSON.stringify({ key: "t", version: "1.0.0" })),
      file("templates/index.json", JSON.stringify({ header: [], main: [], footer: [] })),
      file("styles/main.css", "a{color:red}"),
    ]);
    expect(report.verdict).toBe("clean");
    expect(report.findings).toEqual([]);
  });

  it("flags embedded secrets", () => {
    const report = scanPackage([
      file("templates/index.json", JSON.stringify({ note: `key ${OPENAI_KEY}` })),
    ]);
    expect(report.verdict).toBe("flagged");
    expect(report.findings.map((f) => f.code)).toContain("secret");
  });

  it("flags script-bearing SVG", () => {
    const report = scanPackage([
      file("assets/logo.svg", `<svg xmlns="http://www.w3.org/2000/svg"><g onload="evil()"></g></svg>`),
    ]);
    expect(report.verdict).toBe("flagged");
    expect(report.findings.map((f) => f.code)).toContain("svg-script");
  });

  it("treats external URLs as informational, still clean", () => {
    const report = scanPackage(
      [file("templates/index.json", JSON.stringify({ img: "https://cdn.example.com/a.png" }))],
      { permissions: ["read_shop"] },
    );
    expect(report.verdict).toBe("clean");
    expect(report.findings.map((f) => f.code)).toContain("external-urls");
  });

  it("inventories declared permissions", () => {
    const report = scanPackage(
      [file("plugin.json", JSON.stringify({ id: "p" }))],
      { permissions: ["read_shop", "write_orders"] },
    );
    expect(report.verdict).toBe("clean");
    expect(report.findings).toContainEqual({
      code: "permissions",
      severity: "info",
      detail: "read_shop, write_orders",
    });
  });
});
