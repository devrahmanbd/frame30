/**
 * Frame30 hard proof — official plugin installs never touch the archive pipeline.
 *
 * The `package-install.server` module is armed to throw on import: if the
 * official-plugin path ever loads the custom archive installer again, every
 * test here fails at the import boundary. product-reviews, store-analytics
 * and whatsapp-chat must still install, replay, and project host rows from
 * source. Custom-upload coverage stays in its own unmocked suites
 * (`plugin-package-acceptance` custom describes, `package-install` suites).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
type Recorder = ReturnType<typeof metricRecorder>;
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./package-install.server", () => ({
  installPackage: () => {
    throw new Error(
      "package-install.server must not load during official installs",
    );
  },
}));

const { installOfficialPlugin } = await import("./official-plugins.server");
const { OFFICIAL_PLUGIN_KEYS } = await import("./official-plugins");

const MERCHANT = "88888888-8888-4888-8888-888888888888";
const ACTOR = "user-no-pipeline";

function installDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [],
      theme_audit: [],
      plugin_state: [],
      plugin_kill_switch: [],
      activity_log: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("Frame30 official plugin installs without the archive pipeline", () => {
  it("control: the pipeline entry is actually blocked in this file", async () => {
    const mod = (await import("./package-install.server")) as unknown as {
      installPackage: (...args: never[]) => unknown;
    };
    expect(() => mod.installPackage()).toThrow(
      /must not load during official installs/,
    );
  });

  it("the official installer source never references the archive pipeline", () => {
    const src = fs.readFileSync(
      "/opt/frame28/src/lib/official-plugins.server.ts",
      "utf8",
    );
    const code = src
      .split("\n")
      .filter((line) => !/^\s*import type/.test(line))
      .join("\n");
    for (const banned of [
      "package-install.server",
      "package-zip",
      "installPackage",
      "exportBuiltinPluginZip",
      "exportPluginManifestZip",
      "artifactIdFor",
    ]) {
      expect(code).not.toContain(banned);
    }
  });

  for (const key of OFFICIAL_PLUGIN_KEYS) {
    it(`${key} installs from source with the pipeline module blocked`, async () => {
      const db = installDb();
      const out = await installOfficialPlugin(
        db.asClient(),
        MERCHANT,
        key,
        ACTOR,
      );
      expect(out.alreadyInstalled).toBe(false);
      expect(out.artifactId).toMatch(/^[a-f0-9]{64}$/);
      expect(out.versionId).toBe(out.packageId);
      const ledger = db.rows("marketplace_installs");
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        kind: "widget",
        listing_slug: key,
        status: "installed",
        artifact_pinned: `official:${key}`,
        artifact_checksum: out.artifactId,
        idempotency_key: `official:${MERCHANT}:${key}`,
      });
      // Host projection: the plugin renders like any install.
      const projected = db.rows("plugin_state");
      expect(projected).toHaveLength(1);
      expect(projected[0]).toMatchObject({ plugin_id: key });
      // Same audit action as the archive lane.
      expect(
        db.rows("theme_audit").filter((r) => r.action === "package.installed"),
      ).toHaveLength(1);
      // No archive bytes ever land: the official lane writes no asset rows.
      expect(db.rows("theme_assets")).toHaveLength(0);
    });
  }

  it("reinstall replays without the pipeline", async () => {
    const db = installDb();
    const first = await installOfficialPlugin(
      db.asClient(),
      MERCHANT,
      "product-reviews",
      ACTOR,
    );
    const second = await installOfficialPlugin(
      db.asClient(),
      MERCHANT,
      "product-reviews",
      ACTOR,
    );
    expect(second).toMatchObject({
      packageId: first.packageId,
      alreadyInstalled: true,
      artifactId: first.artifactId,
    });
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("plugin_state")).toHaveLength(1);
  });

  it("unknown keys fail without the pipeline and without writing", async () => {
    const db = installDb();
    const err = await installOfficialPlugin(
      db.asClient(),
      MERCHANT,
      "vapor",
      ACTOR,
    ).then(
      () => "no_throw",
      (e: unknown) =>
        (e as { code?: string }).code ?? (e as Error)?.message ?? "threw",
    );
    expect(err).toMatch(/plugin\.official_unknown/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });
});
