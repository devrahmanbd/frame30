/**
 * PKG-2 — ZIP reader + security suite (cases only).
 *
 * Covers: valid stored/deflated round-trips, malformed archives, the
 * zip-slip suite (absolute / `..` / drive / backslash / null byte / empty
 * segments), symlink + encrypted + spanned + unknown-method rejections,
 * per-file / total / count caps, and the package-area layout gate.
 */
import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  assertSafePackagePath,
  collectBrokenAssetRefs,
  extractEntry,
  extractPackageFiles,
  parseZip,
  validatePackageLayout,
  PackageZipError,
  type ZipEntry,
} from "./package-zip";

/* ------------------------------------------------- flexible test zip builder */

type RawEntry = {
  name: string;
  data: Uint8Array;
  /** Central-directory method (local header mirrors it unless overridden). */
  method?: number;
  localMethod?: number;
  flags?: number;
  externalAttrs?: number;
  diskStart?: number;
};

const enc = new TextEncoder();
const str = (s: string) => enc.encode(s);

function crc32(data: Uint8Array): number {
  let t: number[] | null = (crc32 as { t?: number[] }).t ?? null;
  if (!t) {
    t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    (crc32 as { t?: number[] }).t = t;
  }
  let crc = 0xffffffff;
  for (const b of data) crc = t[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

function buildRawZip(
  entries: RawEntry[],
  opts: { diskNumber?: number; cdDisk?: number; countOverride?: number } = {},
): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const nameBytes = Array.from(enc.encode(e.name));
    const method = e.method ?? 0;
    const payload = Array.from(method === 8 ? deflateRawSync(e.data) : e.data);
    const flags = e.flags ?? 0x0800;
    const localOffset = out.length;
    out.push(
      0x50, 0x4b, 0x03, 0x04,
      ...u16(20), ...u16(flags), ...u16(e.localMethod ?? method),
      ...u16(0), ...u16(0),
      ...u32(crc32(e.data)), ...u32(payload.length), ...u32(e.data.length),
      ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...payload,
    );
    central.push(
      0x50, 0x4b, 0x01, 0x02,
      ...u16(20), ...u16(20), ...u16(flags), ...u16(method),
      ...u16(0), ...u16(0),
      ...u32(crc32(e.data)), ...u32(payload.length), ...u32(e.data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(e.diskStart ?? 0), ...u16(0), ...u32(e.externalAttrs ?? 0),
      ...u32(localOffset), ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  const count = opts.countOverride ?? entries.length;
  out.push(
    0x50, 0x4b, 0x05, 0x06,
    ...u16(opts.diskNumber ?? 0), ...u16(opts.cdDisk ?? 0),
    ...u16(count), ...u16(count),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  );
  return new Uint8Array(out);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

function codeOfSync(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof PackageZipError) return e.code;
    return (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

/* ------------------------------------------------------------------ parsing */

describe("PKG-2 reader", () => {
  it("round-trips stored + deflated entries", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str(JSON.stringify({ name: "T" })) },
      { name: "styles/main.css", data: str("a{color:red}"), method: 8 },
    ]);
    const entries = parseZip(zip);
    expect(entries.map((e) => [e.name, e.method])).toEqual([
      ["theme.json", 0],
      ["styles/main.css", 8],
    ]);
    const files = extractPackageFiles(zip, entries);
    expect(new TextDecoder().decode(files[1]!.bytes)).toBe("a{color:red}");
  });

  it("extracts a single entry by handle", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}"), method: 8 }]);
    const [entry] = parseZip(zip) as [ZipEntry];
    expect(new TextDecoder().decode(extractEntry(zip, entry!))).toBe("{}");
  });

  it("rejects non-zip bytes as malformed", () => {
    expect(codeOfSync(() => parseZip(str("hello world, not a zip")))).toBe(
      "zip.malformed",
    );
  });

  it("rejects truncated archives as malformed", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}") }]);
    expect(codeOfSync(() => parseZip(zip.slice(0, 10)))).toBe("zip.malformed");
  });

  it("rejects encrypted entries with a reason code", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}"), flags: 0x0801 }]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.encrypted");
  });

  it("rejects multi-disk / spanned archives with a reason code", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}") }], {
      diskNumber: 1,
      cdDisk: 1,
    });
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.spanned");
  });

  it("rejects per-entry disk numbers as spanned", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}"), diskStart: 2 }]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.spanned");
  });

  it("rejects unknown compression methods with a reason code", () => {
    // method 12 (bzip2): local + central agree, so the method gate fires.
    const zip = buildRawZip([{ name: "theme.json", data: str("{}"), method: 12 }]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.unsupported_method");
  });

  it("rejects local/central method disagreement as malformed", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str("{}"), method: 0, localMethod: 8 },
    ]);
    const [entry] = parseZip(zip) as [ZipEntry];
    expect(codeOfSync(() => extractEntry(zip, entry!))).toBe("zip.malformed");
  });

  it("rejects symlink entries with a reason code", () => {
    const SYMLINK = (0xa000 | 0o777) << 16;
    const zip = buildRawZip([
      { name: "theme.json", data: str("{}") },
      { name: "link", data: str("theme.json"), externalAttrs: SYMLINK >>> 0 },
    ]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.symlink");
  });
});

/* --------------------------------------------------------------- zip-slip suite */

describe("PKG-2 zip-slip suite", () => {
  const BAD = [
    "../evil.json",
    "../../evil.json",
    "a/../../evil.json",
    "templates/../../evil.json",
    "/abs.json",
    "C:/evil.json",
    "C:evil.json",
    "d:foo/bar.json",
    "a\\b.json",
    "..\\evil.json",
    "evil\0.json",
    "a//b.json",
    "",
    "..",
    "./",
    "a/./b.json",
  ];
  for (const bad of BAD) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(codeOfSync(() => assertSafePackagePath(bad))).toBe("zip.unsafe_path");
    });
  }

  it("rejects slip entries end-to-end even with a valid manifest", () => {
    for (const bad of ["../../evil.json", "/abs.json", "C:/evil.json", "a\\b.json"]) {
      const zip = buildRawZip([
        { name: "theme.json", data: str(JSON.stringify({ name: "T" })) },
        { name: bad, data: str("{}") },
      ]);
      expect(codeOfSync(() => parseZip(zip))).toBe("zip.unsafe_path");
    }
  });

  it("accepts ordinary nested + space + unicode names", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str("{}") },
      { name: "templates/my page.json", data: str("{}") },
      { name: "assets/লোগো.png", data: str("x") },
      { name: "./templates/index.json", data: str("{}") },
    ]);
    expect(parseZip(zip).map((e) => e.name)).toEqual([
      "theme.json",
      "templates/my page.json",
      "assets/লোগো.png",
      "./templates/index.json",
    ]);
  });
});

/* --------------------------------------------------------------------- caps */

describe("PKG-2 size caps", () => {
  it("rejects oversized archives before parsing", () => {
    const zip = buildRawZip([{ name: "theme.json", data: str("{}") }]);
    expect(codeOfSync(() => parseZip(zip, { maxArchiveBytes: 4 }))).toBe(
      "zip.archive_too_large",
    );
  });

  it("rejects entries whose claimed size exceeds the per-file cap", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str(JSON.stringify({ name: "T" })) },
      { name: "assets/big.png", data: str("0123456789") },
    ]);
    expect(codeOfSync(() => parseZip(zip, { maxEntryBytes: 8 }))).toBe(
      "zip.entry_too_large",
    );
  });

  it("rejects real inflated output past the total cap", () => {
    const chunk = "x".repeat(1000);
    const zip = buildRawZip([
      { name: "a.txt", data: str(chunk) },
      { name: "b.txt", data: str(chunk) },
    ]);
    // Claims are small; the running total on real output trips instead.
    expect(
      codeOfSync(() => {
        const entries = parseZip(zip, {
          maxEntryBytes: 10_000,
          maxTotalBytes: 10_000,
        });
        extractPackageFiles(zip, entries, { maxTotalBytes: 1500 });
      }),
    ).toBe("zip.total_too_large");
  });

  it("rejects archives over the file-count cap", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str("{}") },
      { name: "a.json", data: str("{}") },
      { name: "b.json", data: str("{}") },
    ]);
    expect(codeOfSync(() => parseZip(zip, { maxFiles: 2 }))).toBe(
      "zip.too_many_files",
    );
  });
});

/* -------------------------------------------------------------------- layout */

function themeFiles(extra: [string, string][] = []): { path: string; bytes: Uint8Array }[] {
  return [
    { path: "theme.json", bytes: str(JSON.stringify({ name: "T", version: "1.0.0" })) },
    { path: "templates/index.json", bytes: str("{}") },
    { path: "styles/main.css", bytes: str("a{}") },
    { path: "assets/logo.png", bytes: str("png") },
    { path: "locales/en.json", bytes: str("{}") },
    ...extra.map(([path, content]) => ({ path, bytes: str(content) })),
  ];
}

describe("PKG-2 package layout", () => {
  it("accepts a well-formed theme package", () => {
    const out = validatePackageLayout(themeFiles(), "theme");
    expect(out.manifest).toMatchObject({ name: "T" });
  });

  it("accepts a well-formed plugin package", () => {
    const out = validatePackageLayout(
      [{ path: "plugin.json", bytes: str(JSON.stringify({ name: "P" })) }],
      "plugin",
    );
    expect(out.manifest).toMatchObject({ name: "P" });
  });

  it("requires the manifest at the root (nested copies do not count)", () => {
    expect(
      codeOfSync(() =>
        validatePackageLayout(
          [{ path: "sub/theme.json", bytes: str(JSON.stringify({ name: "T" })) }],
          "theme",
        ),
      ),
    ).toBe("zip.missing_manifest");
  });

  it("refuses executables anywhere", () => {
    for (const bad of [
      "assets/app.js",
      "templates/x.ts",
      "styles/evil.exe",
      "locales/run.sh",
      "evil.py",
    ]) {
      expect(
        codeOfSync(() => validatePackageLayout(themeFiles([[bad, "x"]]), "theme")),
      ).toBe("zip.blocked_extension");
    }
  });

  it("refuses files outside their package area", () => {
    expect(
      codeOfSync(() =>
        validatePackageLayout(themeFiles([["templates/style.css", "x"]]), "theme"),
      ),
    ).toBe("zip.disallowed_location");
    expect(
      codeOfSync(() =>
        validatePackageLayout(themeFiles([["docs/readme.md", "x"]]), "theme"),
      ),
    ).toBe("zip.disallowed_location");
  });

  it("rejects a manifest that is not a JSON object", () => {
    expect(
      codeOfSync(() =>
        validatePackageLayout([{ path: "theme.json", bytes: str("[1,2]") }], "theme"),
      ),
    ).toBe("zip.manifest_invalid");
  });
});

describe("PKG-2 broken presentation refs", () => {
  it("passes when referenced assets exist", () => {
    const files = themeFiles([
      ["templates/index.json", JSON.stringify({ hero: "assets/logo.png" })],
    ]);
    expect(collectBrokenAssetRefs(files)).toEqual([]);
  });

  it("lists template references to files missing from the package", () => {
    const files = themeFiles([
      ["templates/index.json", JSON.stringify({ hero: "assets/missing.png" })],
    ]);
    expect(collectBrokenAssetRefs(files)).toEqual(["assets/missing.png"]);
  });
});

export { codeOf };

describe("PKG-2 hostile entry strictness (threat-defense)", () => {
  it("refuses exact-duplicate file entries", () => {
    const zip = buildRawZip([
      { name: "theme.json", data: str("{}") },
      { name: "theme.json", data: str("{}") },
    ]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.duplicate_entry");
  });

  it("tolerates duplicate directory entries (never extracted)", () => {
    const zip = buildRawZip([
      { name: "assets/", data: new Uint8Array() },
      { name: "assets/", data: new Uint8Array() },
      { name: "theme.json", data: str("{}") },
    ]);
    expect(codeOfSync(() => parseZip(zip))).toBe("no_throw");
  });

  it("refuses macOS resource-fork packaging", () => {
    const zip = buildRawZip([
      { name: "__MACOSX/._theme.json", data: str("{}") },
      { name: "theme.json", data: str("{}") },
    ]);
    expect(codeOfSync(() => parseZip(zip))).toBe("zip.unsafe_path");
  });

  it("skips dotfiles at extract instead of shipping them", () => {
    const zip = buildRawZip([
      { name: ".DS_Store", data: str("junk") },
      { name: "theme.json", data: str("{}") },
    ]);
    const entries = parseZip(zip);
    const files = extractPackageFiles(zip, entries);
    expect(files.map((f) => f.path)).toEqual(["theme.json"]);
  });

  it("refuses fifo/char/block/socket mode bits", () => {
    for (const mode of [0x1000, 0x2000, 0x6000, 0xc000]) {
      const zip = buildRawZip([
        {
          name: "theme.json",
          data: str("{}"),
          externalAttrs: ((mode | 0o644) << 16) >>> 0,
        },
      ]);
      expect(codeOfSync(() => parseZip(zip))).toBe("zip.special_file");
    }
  });

  it("accepts regular, directory, and absent mode bits", () => {
    for (const attrs of [
      ((0x8000 | 0o644) << 16) >>> 0,
      ((0x4000 | 0o755) << 16) >>> 0,
      0,
    ]) {
      const zip = buildRawZip([
        { name: "theme.json", data: str("{}"), externalAttrs: attrs },
      ]);
      expect(codeOfSync(() => parseZip(zip))).toBe("no_throw");
    }
  });
});
