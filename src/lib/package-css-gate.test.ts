/**
 * PKG frame30 — package CSS gate + SVG sanitize-or-reject suite (cases only).
 *
 * Covers:
 * - `gatePackageCss` benign cases (scoped output, relative/data:image urls,
 *   @media/@font-face/@keyframes, :root mapping, layout-safe sanitizations).
 * - `gatePackageCss` malicious cases incl. case-obfuscation (@import,
 *   javascript: urls, remote urls, data:text/html, expression(), -moz-binding,
 *   behavior:).
 * - `assertPackageContentAuthentic` SVG point (script stripped + replaced,
 *   clean SVG byte-identical, empty-after-sanitize refused, hostile CSS
 *   refused).
 * - Theme-lane installs: hostile-CSS and script-SVG packages fail; a
 *   sanitize-shaped SVG package installs with the script gone.
 */
import { describe, expect, it } from "vitest";
import { gatePackageCss } from "./package-css-gate";
import {
  assertPackageContentAuthentic,
  PackageZipError,
  type PackageFile,
} from "./package-zip";

const enc = new TextEncoder();
const cssFile = (text: string): PackageFile => ({
  path: "styles/main.css",
  bytes: enc.encode(text),
});
const svgFile = (text: string): PackageFile => ({
  path: "assets/icon.svg",
  bytes: enc.encode(text),
});

function codeOfSync(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof PackageZipError) return e.code;
    return (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

/* ------------------------------------------------- gate: benign + sanitize */

describe("package CSS gate — benign stylesheets pass, namespaced", () => {
  it("prefix-scopes a simple rule", () => {
    const r = gatePackageCss("a{color:red}");
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.sanitizedCss).toContain(".pkg-scope a");
    expect(r.sanitizedCss).toContain("color: red");
  });

  it("allows relative asset urls", () => {
    const r = gatePackageCss(".hero{background:url(assets/bg.png)}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).toContain("url(assets/bg.png)");
  });

  it("allows data:image urls", () => {
    const r = gatePackageCss(
      ".i{background:url(data:image/png;base64,iVBORw0KGgo=)}",
    );
    expect(r.ok).toBe(true);
  });

  it("keeps @media with scoped inner rules", () => {
    const r = gatePackageCss("@media (min-width: 100px){a{color:red}}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).toContain("@media");
    expect(r.sanitizedCss).toContain(".pkg-scope a");
  });

  it("keeps @font-face with a relative src", () => {
    const r = gatePackageCss(
      "@font-face{font-family:x;src:url(assets/face.woff2)}",
    );
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).toContain("@font-face");
  });

  it("keeps @keyframes steps untouched", () => {
    const r = gatePackageCss("@keyframes spin{from{opacity:0}to{opacity:1}}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).toContain("@keyframes spin");
  });

  it("maps :root to the scope root", () => {
    const r = gatePackageCss(":root{color:red}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).not.toMatch(/(^|[\s,{]):root/i);
    expect(r.sanitizedCss).toContain(".pkg-scope");
  });

  it("sanitizes (drops) --theme-* redefinitions but stays ok", () => {
    const r = gatePackageCss("a{--theme-ink:red;color:blue}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).not.toContain("--theme-ink");
    expect(r.sanitizedCss).toContain("color: blue");
  });

  it("sanitizes (drops) unknown at-rules but stays ok", () => {
    const r = gatePackageCss("@page{a{color:red}}a{color:blue}");
    expect(r.ok).toBe(true);
    expect(r.sanitizedCss).not.toContain("@page");
    expect(r.sanitizedCss).toContain(".pkg-scope a");
  });

  it("sanitizes (drops) bare position:fixed but keeps the opt-in class", () => {
    const fixed = gatePackageCss("a{position:fixed;color:red}");
    expect(fixed.ok).toBe(true);
    expect(fixed.sanitizedCss).not.toMatch(/fixed/i);
    expect(fixed.sanitizedCss).toContain("color: red");
    const allowed = gatePackageCss(".fq-allow-fixed{position:fixed}");
    expect(allowed.ok).toBe(true);
    expect(allowed.sanitizedCss).toMatch(/fixed/i);
  });

  it("accepts empty input", () => {
    expect(gatePackageCss("  ")).toMatchObject({ ok: true, errors: [] });
  });
});

/* ------------------------------------------------ gate: malicious → reject */

describe("package CSS gate — exfiltration attempts are rejected", () => {
  const cases: [string, string][] = [
    ["@import", `@import url("https://evil.example/x.css");a{color:red}`],
    ["@IMPORT obfuscated", `@IMPORT url("assets/x.css");a{color:red}`],
    ["javascript: url", `a{background:url(javascript:alert(1))}`],
    ["JAVASCRIPT: obfuscated", `a{background:url(JaVaScRiPt:alert(1))}`],
    ["http: url", `a{background:url(http://evil.example/x.png)}`],
    ["https: url", `a{background:url(https://evil.example/x.png)}`],
    ["protocol-relative url", `a{background:url(//evil.example/x.png)}`],
    ["data:text/html", `a{background:url(data:text/html,<script>)}`],
    [
      "DATA:TEXT/HTML obfuscated",
      `a{background:url(DATA:TEXT/HTML;base64,PHNjcmlwdD4=)}`,
    ],
    ["expression()", `a{width:expression(alert(1))}`],
    ["EXPRESSION obfuscated", `a{width:EXPRESSION (alert(1))}`],
    ["-moz-binding", `a{-moz-binding:url(x.xml#x)}`],
    ["-MOZ-BINDING obfuscated", `a{-MOZ-BINDING:url(x.xml#x)}`],
    ["behavior:", `a{behavior:url(x.htc)}`],
    ["BEHAVIOR obfuscated", `a{BEHAVIOR:url(x.htc)}`],
    [
      "hostile nested in @media",
      `@media screen{a{background:url(http://e.example/x.png)}}`,
    ],
    [
      "hostile @font-face src",
      `@font-face{font-family:x;src:url(javascript:alert(1))}`,
    ],
  ];
  it.each(cases)("rejects %s", (_name, css) => {
    const r = gatePackageCss(css);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.sanitizedCss).toBeUndefined();
  });
});

/* ------------------------------------------------- content-gate SVG point */

const CLEAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>`;
const SCRIPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>`;

describe("package content gate — SVG sanitize-or-reject", () => {
  it("strips scripts and replaces the file bytes (no throw)", () => {
    const file = svgFile(SCRIPT_SVG);
    expect(() => assertPackageContentAuthentic([file])).not.toThrow();
    const text = new TextDecoder().decode(file.bytes);
    expect(text).not.toContain("script");
    expect(text).toContain("<svg");
    expect(text).toContain("<circle");
  });

  it("leaves a clean SVG byte-identical", () => {
    const before = enc.encode(CLEAN_SVG);
    const file: PackageFile = {
      path: "assets/clean.svg",
      bytes: before.slice(),
    };
    expect(() => assertPackageContentAuthentic([file])).not.toThrow();
    expect(file.bytes).toEqual(before);
  });

  it("refuses an SVG that sanitizes to empty", () => {
    expect(
      codeOfSync(() =>
        assertPackageContentAuthentic([svgFile("<script>alert(1)</script>")]),
      ),
    ).toBe("zip.svg_rejected");
  });

  it("refuses hostile CSS with zip.css_rejected", () => {
    expect(
      codeOfSync(() =>
        assertPackageContentAuthentic([
          cssFile(`@import url("http://evil.example/x.css");`),
        ]),
      ),
    ).toBe("zip.css_rejected");
  });

  it("keeps accepting benign CSS and UTF-8/null-byte checks", () => {
    expect(() =>
      assertPackageContentAuthentic([cssFile("a{color:red}")]),
    ).not.toThrow();
    expect(
      codeOfSync(() =>
        assertPackageContentAuthentic([
          {
            path: "styles/main.css",
            bytes: new Uint8Array([0x61, 0x00, 0x62]),
          },
        ]),
      ),
    ).toBe("zip.content_mismatch");
  });
});

/* ------------------------------------------------- theme-lane installs */

describe("theme lane — CSS/SVG gate enforcement", () => {
  async function lane() {
    const { fakeDb } = await import("./__fixtures__/fake-db");
    const { installPackage } = await import("./package-install.server");
    const db = fakeDb({
      tables: {
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_assets: [],
        marketplace_installs: [],
        theme_audit: [],
      },
    });
    return { db, installPackage };
  }

  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [
    v & 0xff,
    (v >>> 8) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 24) & 0xff,
  ];
  type Entry = { name: string; content: string | Uint8Array };
  function buildZip(entries: Entry[]): Uint8Array {
    const out: number[] = [];
    const central: number[] = [];
    for (const e of entries) {
      const nameBytes = Array.from(enc.encode(e.name));
      const raw =
        typeof e.content === "string" ? enc.encode(e.content) : e.content;
      const localOffset = out.length;
      out.push(
        0x50,
        0x4b,
        0x03,
        0x04,
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(raw.length),
        ...u32(raw.length),
        ...u16(nameBytes.length),
        ...u16(0),
        ...nameBytes,
        ...raw,
      );
      central.push(
        0x50,
        0x4b,
        0x01,
        0x02,
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(raw.length),
        ...u32(raw.length),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(localOffset),
        ...nameBytes,
      );
    }
    const centralOffset = out.length;
    out.push(...central);
    const centralSize = out.length - centralOffset;
    out.push(
      0x50,
      0x4b,
      0x05,
      0x06,
      ...u16(0),
      ...u16(0),
      ...u16(entries.length),
      ...u16(entries.length),
      ...u32(centralSize),
      ...u32(centralOffset),
      ...u16(0),
    );
    return new Uint8Array(out);
  }

  const strictTheme = (version = "1.0.0") => ({
    key: "gate-probe",
    name: "Gate Probe",
    nameBn: "গেট প্রোব",
    version,
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
  });
  const themeZip = (manifest: Record<string, unknown>, extra: Entry[] = []) =>
    buildZip([
      { name: "theme.json", content: JSON.stringify(manifest) },
      { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
      ...extra,
    ]);

  const MERCHANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ACTOR = "99999999-9999-4999-8999-999999999999";
  let seq = 0;
  async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (e) {
      return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
    }
    return "no_throw";
  }

  it("fails a hostile-CSS package with zip.css_rejected, writing nothing", async () => {
    const { db, installPackage } = await lane();
    const zip = themeZip(strictTheme(), [
      {
        name: "styles/main.css",
        content: `@import url("http://evil.example/x.css");a{color:red}`,
      },
    ]);
    const code = await codeOf(
      installPackage(
        db.asClient(),
        MERCHANT,
        {
          kind: "theme",
          fileName: "theme.zip",
          bytes: zip,
          idempotencyKey: `gate-css-${(seq += 1)}`,
        },
        ACTOR,
      ),
    );
    expect(code).toBe("zip.css_rejected");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
  });

  it("fails a script-SVG package with zip.svg_rejected, writing nothing", async () => {
    const { db, installPackage } = await lane();
    const zip = themeZip(strictTheme(), [
      { name: "assets/evil.svg", content: "<script>alert(1)</script>" },
    ]);
    const code = await codeOf(
      installPackage(
        db.asClient(),
        MERCHANT,
        {
          kind: "theme",
          fileName: "theme.zip",
          bytes: zip,
          idempotencyKey: `gate-svg-${(seq += 1)}`,
        },
        ACTOR,
      ),
    );
    expect(code).toBe("zip.svg_rejected");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("installs a sanitize-shaped SVG (script stripped, package kept)", async () => {
    const { db, installPackage } = await lane();
    const zip = themeZip(strictTheme(), [
      { name: "styles/main.css", content: "a{color:red}" },
      { name: "assets/logo.svg", content: SCRIPT_SVG },
    ]);
    const res = await installPackage(
      db.asClient(),
      MERCHANT,
      {
        kind: "theme",
        fileName: "theme.zip",
        bytes: zip,
        idempotencyKey: `gate-ok-${(seq += 1)}`,
      },
      ACTOR,
    );
    expect(res.alreadyInstalled).toBe(false);
    expect(db.rows("store_themes")).toHaveLength(1);
  });
});
