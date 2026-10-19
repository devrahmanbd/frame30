import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Plain .mjs module — imported across runners, so it must stay dependency-free.
import {
  ASSETS,
  BUDGETS,
} from "../../../scripts/songoskriti-assets-manifest.mjs";
import {
  imageInfo,
  sha256,
  fileInfo,
} from "../../../scripts/songoskriti-assets-image.mjs";
import {
  blessExpectationFile,
  blessWorld,
  checkSongoskritiAssets,
  defaultWorld,
} from "../../../scripts/songoskriti-assets-check.mjs";
// Plain .mjs module — the generator stays dependency-free and keyless at import.
import {
  assertFormatMatches,
  buildPlan,
  diffAssetSets,
  findExtraFiles,
  isUpToDate,
} from "../../../scripts/gen-songoskriti-assets.mjs";
import expectation from "../../../scripts/songoskriti-assets-expected.json";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ASSET_DIR = resolve(ROOT, "public/ph/songoskriti");

describe("songoskriti asset manifest", () => {
  it("declares 21 unique theme assets with a valid format and extension", () => {
    expect(ASSETS).toHaveLength(21);
    const names = ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(21);
    for (const a of ASSETS) {
      const ext = a.name.slice(a.name.lastIndexOf(".") + 1);
      const expected = ext === "jpg" ? "jpeg" : ext;
      expect(a.format).toBe(expected);
      expect(a.name).toMatch(/^[a-z0-9-]+\.(png|jpg|svg)$/);
    }
  });
  it("gives every generated asset a prompt and every raster a floor", () => {
    for (const a of ASSETS) {
      if (a.format === "svg") {
        expect(a.minWidth).toBeNull();
        expect(a.minHeight).toBeNull();
        expect(a.generated).toBe(false);
        continue;
      }
      expect(a.minWidth).toBeGreaterThan(0);
      expect(a.minHeight).toBeGreaterThan(0);
      expect(a.generated).toBe(true);
      expect(a.prompt && a.prompt.length).toBeGreaterThan(20);
      expect(a.aspect).toMatch(/^\d+:\d+$/);
    }
  });
  it("pins the size budgets", () => {
    expect(BUDGETS.maxFileBytes).toBe(3_000_000);
    expect(BUDGETS.maxTotalBytes).toBe(28_000_000);
    expect(BUDGETS.maxBytesPerPixel.png).toBe(2);
    expect(BUDGETS.maxBytesPerPixel.jpeg).toBe(1);
  });
});

describe("songoskriti asset bytes", () => {
  it("decodes PNG and JPEG geometry from the bytes alone", () => {
    const png = imageInfo(readFileSync(resolve(ASSET_DIR, "cat-women.png")));
    expect(png.format).toBe("png");
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
    const jpeg = imageInfo(
      readFileSync(resolve(ASSET_DIR, "hero-festive.jpg")),
    );
    expect(jpeg.format).toBe("jpeg");
    expect(jpeg.width).toBe(1376);
    expect(jpeg.height).toBe(768);
    const svg = imageInfo(readFileSync(resolve(ASSET_DIR, "logo-lockup.svg")));
    expect(svg.format).toBe("svg");
  });

  it("the expectation matches the shipped bytes exactly", () => {
    expect(expectation.assets).toHaveLength(21);
    for (const rec of expectation.assets) {
      const info = fileInfo(resolve(ASSET_DIR, rec.name));
      expect(info, rec.name).not.toBeNull();
      expect(info?.format).toBe(rec.format);
      expect(info?.width).toBe(rec.width);
      expect(info?.height).toBe(rec.height);
      expect(sha256(readFileSync(resolve(ASSET_DIR, rec.name)))).toBe(
        rec.sha256,
      );
    }
  });

  it("the expectation and the manifest name the same set", () => {
    expect(expectation.assets.map((a) => a.name).sort()).toEqual(
      ASSETS.map((a) => a.name).sort(),
    );
  });
});

/**
 * The synthetic world the gate's negative fixtures run against. It is a
 * minimal, known-clean tree: one raster manifest entry, its file, one live
 * source file per scan root that references it, and a matching expectation
 * entry. Every fixture mutates exactly one of those.
 */
type AssetWorld = {
  repoRoot: string;
  assetDir: string;
  publicDir: string;
  scanRoots: { path: string; kind: string }[];
  migrationsRoot: string;
  buildRoots: string[];
  manifest: {
    name: string;
    format: string;
    minWidth: number | null;
    minHeight: number | null;
    class?: string;
    generated?: boolean;
  }[];
  expectation: {
    assets: {
      name: string;
      format: string;
      width: number | null;
      height: number | null;
      sha256: string;
    }[];
  };
};

/**
 * The synthetic roots the fixtures create. They are removed after every
 * test so repeated runs do not pile ~27 MB of copied assets into /tmp.
 */
const syntheticRoots: string[] = [];

function cleanWorld() {
  const root = mkdtempSync(join(tmpdir(), "songoskriti-assets-"));
  syntheticRoots.push(root);
  const assetDir = join(root, "public/ph/songoskriti");
  const publicDir = join(root, "public");
  const ownedDir = join(root, "src/lib/themes/songoskriti");
  const sharedDir = join(root, "src/lib");
  mkdirSync(assetDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(ownedDir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  const real = join(assetDir, "cat-women.png");
  copyFileSync(resolve(ROOT, "public/ph/songoskriti/cat-women.png"), real);
  // Both roots reference the asset, so the asset stays referenced unless a
  // fixture removes the reference on purpose.
  writeFileSync(
    join(ownedDir, "homepage.ts"),
    'image: "/ph/songoskriti/cat-women.png",',
  );
  writeFileSync(
    join(sharedDir, "demo-catalog.ts"),
    'image: "/ph/songoskriti/cat-women.png",',
  );
  const manifest: AssetWorld["manifest"] = [
    {
      name: "cat-women.png",
      format: "png",
      minWidth: 1024,
      minHeight: 1024,
      class: "category",
      generated: true,
    },
  ];
  const expectation: AssetWorld["expectation"] = {
    assets: [
      {
        name: "cat-women.png",
        format: "png",
        width: 1024,
        height: 1024,
        sha256: sha256(readFileSync(real)),
      },
    ],
  };
  return {
    root,
    world: {
      repoRoot: root,
      assetDir,
      publicDir,
      scanRoots: [
        { path: ownedDir, kind: "owned" },
        { path: sharedDir, kind: "shared" },
      ],
      migrationsRoot: join(root, "supabase/migrations"),
      buildRoots: [join(root, "dist")],
      manifest,
      expectation,
    } satisfies AssetWorld,
  };
}

/** Write a line into the owned root, keeping the shared root untouched. */
function ownedSource(world: AssetWorld, line: string) {
  writeFileSync(
    join(world.scanRoots[0].path, "homepage.ts"),
    `image: "/ph/songoskriti/cat-women.png",\n${line}\n`,
  );
}

function codes(result: {
  findings: { code: string }[];
  notes: { code: string }[];
}) {
  return result.findings.map((f) => f.code).sort();
}

describe("songoskriti asset gate", () => {
  afterEach(() => {
    for (const root of syntheticRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("pins every manifest entry's name, format and floors", async () => {
    await expect(
      ASSETS.map((a) => ({
        name: a.name,
        format: a.format,
        minWidth: a.minWidth,
        minHeight: a.minHeight,
      })),
      // The snapshot lives beside the test file, not in the conventional
      // `__snapshots__/` folder: `src/lib/themes/isolation.test.ts` walks
      // every immediate sub-directory of `src/lib/themes/` and expects each
      // to hold prod source files, so a `__snapshots__/` folder there reads
      // as an empty theme directory and fails that pre-existing guard.
    ).toMatchFileSnapshot(
      resolve(ROOT, "src/lib/themes/songoskriti-assets.test.ts.snap"),
    );
  });

  it("the repository is green", () => {
    const result = checkSongoskritiAssets(defaultWorld());
    expect(result.findings.map((f) => `${f.code} ${f.path}`)).toEqual([]);
  });

  it("a clean world produces no findings", () => {
    const { world } = cleanWorld();
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a missing file", () => {
    const { world } = cleanWorld();
    rmSync(join(world.assetDir, "cat-women.png"));
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.expectation_drift",
      "asset.missing",
    ]);
  });

  it("flags an orphan file in the asset dir", () => {
    const { world } = cleanWorld();
    copyFileSync(
      join(world.assetDir, "cat-women.png"),
      join(world.assetDir, "extra.png"),
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.duplicate",
      "asset.unexpected",
    ]);
  });

  it("flags JPEG bytes in a .png-named file against a jpeg manifest", () => {
    const { world } = cleanWorld();
    const jpeg = readFileSync(
      resolve(ROOT, "public/ph/songoskriti/hero-festive.jpg"),
    );
    writeFileSync(join(world.assetDir, "cat-women.png"), jpeg);
    world.manifest[0].format = "jpeg";
    world.expectation.assets[0].format = "jpeg";
    world.expectation.assets[0].width = 1376;
    world.expectation.assets[0].height = 768;
    world.expectation.assets[0].sha256 = sha256(jpeg);
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.extension_mismatch",
      "asset.format_mismatch",
    ]);
  });

  it("flags a manifest that declares the wrong format for the file", () => {
    const { world } = cleanWorld();
    world.manifest[0].format = "jpeg";
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.extension_mismatch",
    ]);
  });

  it("flags an undersized file", () => {
    const { world } = cleanWorld();
    world.manifest[0].minWidth = 4096;
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.undersized"]);
  });

  it("flags a duplicate copy of a theme raster in another public directory", () => {
    const { world } = cleanWorld();
    const other = join(world.publicDir, "media");
    mkdirSync(other, { recursive: true });
    copyFileSync(
      join(world.assetDir, "cat-women.png"),
      join(other, "cat-women.png"),
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.duplicate"]);
  });

  it("flags a reference to a file that is not in the manifest", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ghost: "/ph/songoskriti/ghost.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["ref.unknown"]);
  });

  it("flags a dangling reference in a SHARED root too", () => {
    const { world } = cleanWorld();
    writeFileSync(
      join(world.scanRoots[1].path, "demo-catalog.ts"),
      'image: "/ph/songoskriti/ghost.png",',
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual(["ref.unknown"]);
  });

  it("does not flag a cross-theme reference in a shared root", () => {
    const { world } = cleanWorld();
    writeFileSync(
      join(world.scanRoots[1].path, "demo-catalog.ts"),
      'image: "/ph/songoskriti/cat-women.png",\nother: "/ph/somvabona/cat-men.jpg",',
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a package-form URL in an owned root", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'pkg: "assets/cat-women.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.wrong_form"]);
  });

  it("flags a cross-theme reference in an owned root", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'other: "/ph/somvabona/cat-men.jpg",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.cross_theme"]);
  });

  it("does not flag a placeholder-lane URL", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ph: "/api/public/ph/womens/saree.svg",');
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a file-shaped placeholder URL", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ph: "/api/public/ph/songoskriti/cat-women.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.wrong_form"]);
  });

  it("flags an asset nothing references", () => {
    const { world } = cleanWorld();
    writeFileSync(
      join(world.scanRoots[0].path, "homepage.ts"),
      "const nothing = 1;",
    );
    writeFileSync(
      join(world.scanRoots[1].path, "demo-catalog.ts"),
      "const nothing = 1;",
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.unreferenced",
    ]);
  });

  it("flags expectation drift", () => {
    const { world } = cleanWorld();
    world.expectation.assets[0].sha256 = "0".repeat(64);
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.expectation_drift",
    ]);
  });

  it("flags a video file whose bytes contradict its extension", () => {
    const { world } = cleanWorld();
    // The manifest declares raster and SVG assets only, so a video in the
    // asset directory is an orphan as well as a container mismatch. The
    // bytes are a PNG that is NOT the asset's own bytes, so the duplicate
    // rule stays out of this fixture (copying cat-women.png would also
    // raise asset.duplicate — correctly).
    const png = readFileSync(
      resolve(ROOT, "public/ph/songoskriti/cat-jewelry.png"),
    );
    writeFileSync(join(world.assetDir, "clip.mp4"), png);
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.unexpected",
      "video.format_mismatch",
    ]);
  });

  it("does not flag an absolute placeholder-lane URL", () => {
    const { world } = cleanWorld();
    ownedSource(
      world,
      'cdn: "https://cdn.example.com/api/public/ph/womens/x.svg",',
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("blesses a corrupt expectation file", () => {
    const { world } = cleanWorld();
    const expectationPath = join(
      world.repoRoot,
      "scripts/songoskriti-assets-expected.json",
    );
    mkdirSync(join(world.repoRoot, "scripts"), { recursive: true });
    writeFileSync(expectationPath, "{ this is not json");
    // The CLI's bless action, against a scratch tree with a corrupt
    // expectation: it must rewrite the file instead of failing on it.
    const blessed = blessExpectationFile({ repoRoot: world.repoRoot });
    expect(blessed).toEqual(["cat-women.png"]);
    const written = JSON.parse(readFileSync(expectationPath, "utf8"));
    expect(written.assets).toHaveLength(1);
    expect(written.assets[0].name).toBe("cat-women.png");
    expect(written.assets[0].sha256).toBe(
      sha256(readFileSync(join(world.assetDir, "cat-women.png"))),
    );
  });

  it("builds the bless world without reading the expectation", () => {
    const world = blessWorld();
    expect(world.expectation).toBeNull();
    expect(world.assetDir).toContain("public/ph/songoskriti");
  });
});

/**
 * The scratch roots the generator fixtures create. They are removed after
 * every test so repeated runs leave nothing behind.
 */
const generatorScratchRoots: string[] = [];

describe("songoskriti asset generator", () => {
  afterEach(() => {
    for (const root of generatorScratchRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses JPEG bytes under a .png name", () => {
    const jpeg = readFileSync(
      resolve(ROOT, "public/ph/songoskriti/hero-festive.jpg"),
    );
    expect(() => assertFormatMatches("cat-women.png", jpeg)).toThrow(/format/i);
    const png = readFileSync(
      resolve(ROOT, "public/ph/songoskriti/cat-women.png"),
    );
    expect(() => assertFormatMatches("cat-women.png", png)).not.toThrow();
  });

  it("plans the 21 assets deterministically", () => {
    const a = buildPlan();
    const b = buildPlan();
    expect(a).toEqual(b);
    expect(a).toHaveLength(21);
    expect(a.every((p) => p.name && p.aspect && p.format)).toBe(true);
  });

  it("--check passes without a key and without network", () => {
    const out = execFileSync(
      "node",
      ["scripts/gen-songoskriti-assets.mjs", "--check"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, GEMINI_API_KEY: "" },
      },
    );
    expect(out).toMatch(/GREEN/);
    // The verdict alone is not enough: the plan must cover the whole
    // manifest, the hand-built brand asset included.
    expect(out).toContain("logo-lockup.svg");
  });

  it("treats an existing .jpg as present, not absent", () => {
    // Regression guard for the nine renamed assets: the old PNG-only check
    // treated every .jpg as absent and overwrote it.
    const jpeg = fileInfo(resolve(ASSET_DIR, "hero-festive.jpg"));
    expect(isUpToDate({ format: "jpeg" }, jpeg)).toBe(true);
    expect(isUpToDate({ format: "png" }, jpeg)).toBe(false);
    expect(isUpToDate({ format: "jpeg" }, null)).toBe(false);
    const png = fileInfo(resolve(ASSET_DIR, "cat-women.png"));
    expect(isUpToDate({ format: "png" }, png)).toBe(true);
  });

  it("compares the manifest's formats with the expectation's", () => {
    expect(
      diffAssetSets(
        ASSETS,
        expectation.assets,
        "the manifest",
        "the expectation",
      ),
    ).toEqual([]);
    // A manifest that declares a different format than the expectation is a
    // defect, not a rename.
    const drifted = ASSETS.map((a) =>
      a.name === "cat-women.png" ? { ...a, format: "jpeg" } : a,
    );
    const problems = diffAssetSets(
      drifted,
      expectation.assets,
      "the manifest",
      "the expectation",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("cat-women.png");
    expect(problems[0]).toContain("jpeg");
  });

  it("reports a file the expectation does not name", () => {
    const dir = mkdtempSync(join(tmpdir(), "songoskriti-extra-"));
    generatorScratchRoots.push(dir);
    writeFileSync(join(dir, "stray.png"), "not an asset");
    expect(findExtraFiles(dir, ["cat-women.png"])).toEqual(["stray.png"]);
    expect(findExtraFiles(dir, ["cat-women.png", "stray.png"])).toEqual([]);
    expect(findExtraFiles(join(dir, "absent"), ["cat-women.png"])).toEqual([]);
  });

  it("--check reports an extra file in the output directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "songoskriti-extra-cli-"));
    generatorScratchRoots.push(dir);
    // Copies, not hard links: a hard link needs the workspace and TMPDIR on
    // one filesystem, and CI's checkout and TMPDIR may sit on different
    // mounts (EXDEV). The copy costs ~25 MB of scratch space, which the
    // afterEach removes.
    for (const record of expectation.assets) {
      copyFileSync(resolve(ASSET_DIR, record.name), join(dir, record.name));
    }
    writeFileSync(join(dir, "stray.png"), "not an asset");
    let status = 0;
    let stderr = "";
    try {
      execFileSync(
        "node",
        ["scripts/gen-songoskriti-assets.mjs", "--check", "--out", dir],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: { ...process.env, GEMINI_API_KEY: "" },
        },
      );
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status ?? 0;
      stderr = String(failure.stderr ?? "");
    }
    expect(status).toBe(1);
    expect(stderr).toContain("extra file in the output directory: stray.png");
    // The stray file is the ONLY problem: nothing is missing.
    expect(stderr).not.toContain("missing:");
  });
});
