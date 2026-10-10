/**
 * Frame30 hard proof — official installs never touch the ZIP pipeline.
 *
 * The `package-install.server` module is armed to throw on import: if any
 * official-theme path ever loads the custom ZIP installer again, every
 * test here fails at the import boundary. Songoskriti and Somvabona must
 * still install, replay, and render source rows. Custom-upload coverage
 * stays in its own unmocked suite (`themes-install-catalog.test.ts`).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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

const { installOfficialTheme } = await import("./themes/appearance.server");

const MERCHANT = "88888888-8888-4888-8888-888888888888";
const ACTOR = "user-no-pipeline";

function installDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      theme_catalog_favourites: [],
      theme_registry: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("Frame30 official installs without the ZIP pipeline", () => {
  it("control: the pipeline entry is actually blocked in this file", async () => {
    const mod = (await import("./package-install.server")) as unknown as {
      installPackage: (...args: never[]) => unknown;
    };
    expect(() => mod.installPackage()).toThrow(
      /must not load during official installs/,
    );
  });
  for (const key of ["songoskriti", "somvabona"] as const) {
    it(`${key} installs from source with the pipeline module blocked`, async () => {
      const db = installDb();
      const out = await installOfficialTheme(
        db.asClient(),
        MERCHANT,
        key,
        ACTOR,
      );
      expect(out.alreadyInstalled).toBe(false);
      expect(db.rows("store_themes")).toHaveLength(1);
      expect(db.rows("theme_versions")).toHaveLength(1);
      expect(db.rows("theme_drafts")).toHaveLength(1);
      expect(JSON.stringify(db.rows("theme_versions")[0])).toContain(
        `/ph/${key}/`,
      );
      expect(db.rows("marketplace_installs")[0]).toMatchObject({
        artifact_pinned: `official:${key}`,
      });
    });
  }

  it("reinstall replays without the pipeline", async () => {
    const db = installDb();
    const first = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    const second = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    expect(second).toMatchObject({ id: first.id, alreadyInstalled: true });
    expect(db.rows("store_themes")).toHaveLength(1);
  });
});
