/**
 * No-download invariant for official plugins (Frame30 decision (a)).
 *
 * Official plugins are source-registered: merchant records initialize from
 * in-repo source at install time through the source-backed official lane —
 * never as a downloadable artifact, never through the archive lane. This
 * suite pins three consequences:
 * (a) no route serves official plugin bytes (routes-tree source scan);
 * (b) official source content carries no network URLs outside the allowlist;
 * (c) official installs stamp the `official:<key>` ledger pin with the
 *     source fingerprint as the row identity.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installOfficialPlugin, officialPluginFingerprint } =
  await import("./official-plugins.server");
const { OFFICIAL_PLUGIN_KEYS, officialPluginSource } =
  await import("./official-plugins");
const { exportBuiltinPluginZip, exportPluginManifestZip } =
  await import("./plugin-package");
const { extractPackageFiles, parseZip } = await import("./package-zip");

const ROUTES_ROOT = "src/routes";

/** Every shipped route module (test files excluded — they ship nothing). */
function routeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
    }
  };
  walk(ROUTES_ROOT);
  return out.sort();
}

beforeEach(() => {
  recorder.reset();
});

describe("official plugins have no downloadable artifact", () => {
  it("(a) no route builds, installs, or serves official plugin bytes", () => {
    const files = routeFiles();
    // Positive control: the scan must cover the real routes tree, or the
    // bans below would pass vacuously.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(path.join(ROUTES_ROOT, "pkg.$.ts"));
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      // No route reaches for the official byte builders or installer.
      expect(src).not.toMatch(
        /exportBuiltinPluginZip|exportPluginManifestZip|installOfficialPlugin|official-plugins\.server/,
      );
      // No route declares an archive payload.
      expect(src).not.toMatch(/application\/zip/);
      // Scoped to official keys: a route that names an official plugin must
      // never be a byte-serving endpoint (Response/bytes/download/export).
      if (/product-reviews|store-analytics|whatsapp-chat/.test(src)) {
        expect(src).not.toMatch(
          /new Response|octet-stream|\.zip|createObjectURL|\bdownload\b|\bexport\b/i,
        );
      }
    }
  });

  it("(b) official ZIP content holds no http URLs outside the allowlist", () => {
    // Pinned from actual exporter output: the only URL in any official ZIP
    // is the WhatsApp deep-link base inside the chat-bubble widget entry
    // (`"https://wa.me/" + phone`, built at runtime from merchant settings).
    const OFFICIAL_ZIP_URL_ALLOWLIST = ["https://wa.me/"] as const;
    for (const key of OFFICIAL_PLUGIN_KEYS) {
      const source = officialPluginSource(key)!;
      // Authored-manifest officials (store-analytics, fraud-shield) have no
      // builtin ZIP: their manifest-only export carries the same content the
      // source-backed install fingerprints.
      const bytes =
        key === "store-analytics" || key === "fraud-shield"
          ? exportPluginManifestZip(source.manifest)
          : exportBuiltinPluginZip(key);
      const blob = extractPackageFiles(bytes, parseZip(bytes))
        .map((f) => new TextDecoder().decode(f.bytes))
        .join("\n");
      const urls =
        blob.match(/https?:\/\/[A-Za-z0-9.-]+(?:\/[^\s"'\\]*)?/g) ?? [];
      for (const url of urls) {
        expect(
          OFFICIAL_ZIP_URL_ALLOWLIST.some((allowed) => url.startsWith(allowed)),
        ).toBe(true);
      }
      // product-reviews and store-analytics are URL-free; whatsapp-chat
      // carries exactly the deep-link base above.
      if (key === "whatsapp-chat") expect(urls).toEqual(["https://wa.me/"]);
      else expect(urls).toEqual([]);
    }
  });

  it("(c) official install stamps the official:<key> ledger pin", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_assets: [],
        marketplace_installs: [],
        theme_audit: [],
        theme_catalog_favourites: [],
        theme_registry: [],
        plugin_state: [],
        plugin_kill_switch: [],
        activity_log: [],
      },
    });
    const merchantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const out = await installOfficialPlugin(
      db.asClient(),
      merchantId,
      "product-reviews",
      "99999999-9999-4999-8999-999999999999",
    );
    expect(out.alreadyInstalled).toBe(false);
    const row = db
      .rows("marketplace_installs")
      .find((r) => r.id === out.packageId)!;
    expect(row).toMatchObject({
      listing_slug: "product-reviews",
      status: "installed",
      artifact_pinned: "official:product-reviews",
      // Source-bound identity: the fingerprint of the catalogue manifest,
      // never a byte hash — the install materializes no archive.
      artifact_checksum: officialPluginFingerprint(
        officialPluginSource("product-reviews")!.manifest,
      ),
    });
    expect(out.artifactId).toBe(row.artifact_checksum);
  });

  it("(d) official catalogue refs carry the source fingerprint, never built bytes", async () => {
    const { builtinCatalogArtifact } = await import("./marketplace.server");
    for (const key of OFFICIAL_PLUGIN_KEYS) {
      const source = officialPluginSource(key)!;
      const manifest = source.manifest as { version: string };
      const art = builtinCatalogArtifact({
        slug: key,
        version: manifest.version,
      })!;
      // Catalogue identity IS the install identity: same fingerprint the
      // install stamps, computed without materializing any archive.
      expect(art.checksum).toBe(officialPluginFingerprint(source.manifest));
      expect(art.pinned).toBe(`builtin:${key}`);
    }
    // Unknown slugs still read as null (fail-soft catalogue lane).
    expect(
      builtinCatalogArtifact({ slug: "ghost-plugin", version: "1.0.0" }),
    ).toBeNull();
  });
});
