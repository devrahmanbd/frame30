/**
 * Frame30 item 13 (extension versioning + recovery) — Passes 1–3, server
 * paths (RED first).
 *
 * Exercises `installPackage(kind: "plugin")` and `rollbackPluginPackage` in
 * `src/lib/package-install.server.ts` through the in-memory fakeDb:
 * - P1: API/definition compat at install (exact pins, ranges, schema gates)
 * - P2: failure paths preserve last-good (refused updates write nothing;
 *   rollback restores the artifact with an audit row)
 * - P3: adversarial (downgrades, reinstalls, concurrent races,
 *   rollback-to-revoked, idempotent rollback replay)
 */
import { describe, expect, it, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { buildTestZip } from "./__fixtures__/test-zip";
import {
  installPackage,
  rollbackPluginPackage,
  setPackageManifestValidator,
} from "./package-install.server";
import { listInstalledPlugins, upsertPlugin } from "./plugins.server";

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";

function pkgDb(opts: { unique?: { table: string; columns: string[] }[] } = {}) {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      plugin_state: [],
      plugin_kill_switch: [],
      activity_log: [],
    },
    unique: opts.unique,
  });
}

let keySeq = 0;
const key = () => `v13-key-${(keySeq += 1)}`;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

function pluginManifest(
  version = "1.0.0",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "acme-reviews",
    name: "Acme Reviews",
    version,
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
      },
    ],
    hooks: [],
    settings: [
      { key: "title", label: "Title", kind: "text", default: "Reviews" },
    ],
    i18n: { en: { title: "Title" }, bn: { title: "শিরোনাম" } },
    budget: { jsKb: 10, mainThreadMs: 5 },
    ...extra,
  };
}

function schemaManifest(
  version: string,
  propsSchema: unknown[],
): Record<string, unknown> {
  return pluginManifest(version, {
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
        propsSchema,
      },
    ],
  });
}

function pluginZip(
  manifest: Record<string, unknown>,
  extra: { name: string; content: string }[] = [],
): Uint8Array {
  return buildTestZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
    ...extra,
  ]);
}

function installPlugin(
  db: ReturnType<typeof fakeDb>,
  merchant: string,
  bytes: Uint8Array,
  opts: { key?: string; consentScopes?: string[] } = {},
) {
  return installPackage(
    db.asClient(),
    merchant,
    {
      kind: "plugin",
      fileName: "plugin.zip",
      bytes,
      idempotencyKey: opts.key ?? key(),
      consentScopes: opts.consentScopes,
    },
    ACTOR,
  );
}

function ledgerFor(db: ReturnType<typeof fakeDb>, slug = "acme-reviews") {
  return db.rows("marketplace_installs").filter((r) => r.listing_slug === slug);
}

async function project(
  db: ReturnType<typeof fakeDb>,
  manifest: Record<string, unknown>,
) {
  await upsertPlugin(db.asClient() as never, MERCHANT_A, {
    manifest: manifest as never,
    grantedScopes: (manifest.permissions as string[]).slice(),
    actorId: ACTOR,
  });
}

beforeEach(() => {
  setPackageManifestValidator(null);
});

describe("P1 — API + definition compat at install", () => {
  it("admits an exact pin matching the running builder API", async () => {
    const db = pkgDb();
    const res = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0", { api: "3.1.0" })),
    );
    expect(res.alreadyInstalled).toBe(false);
    expect(res.version).toBe("1.0.0");
  });

  it("refuses an exact pin for a different API line, writing nothing", async () => {
    const db = pkgDb();
    expect(
      await codeOf(
        installPlugin(
          db,
          MERCHANT_A,
          pluginZip(pluginManifest("1.0.0", { api: "3.0.0" })),
        ),
      ),
    ).toBe("package.api_incompatible");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
  });

  it("refuses unsatisfiable ranges, writing nothing", async () => {
    const db = pkgDb();
    // The plugin gate passes ranges through (shape-only); the install-time
    // API check refuses them — same `api_incompatible` the stub seam pins.
    expect(
      await codeOf(
        installPlugin(
          db,
          MERCHANT_A,
          pluginZip(pluginManifest("1.0.0", { api: "^99.0.0" })),
        ),
      ),
    ).toBe("package.api_incompatible");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("accepts an additive schema update (safe defaults cover new fields)", async () => {
    const db = pkgDb();
    const v1 = schemaManifest("1.0.0", [
      { key: "title", label: "Title", kind: "text", default: "Hi" },
    ]);
    await installPlugin(db, MERCHANT_A, pluginZip(v1));
    await project(db, v1);
    const v2 = schemaManifest("1.1.0", [
      { key: "title", label: "Title", kind: "text", default: "Hi" },
      { key: "limit", label: "Limit", kind: "number", default: 6 },
    ]);
    const res = await installPlugin(db, MERCHANT_A, pluginZip(v2));
    expect(res.version).toBe("1.1.0");
  });

  it("refuses a breaking schema update, leaving projection + ledger untouched", async () => {
    const db = pkgDb();
    const v1 = schemaManifest("1.0.0", [
      {
        key: "title",
        label: "Title",
        kind: "text",
        required: true,
        default: "Hi",
      },
    ]);
    await installPlugin(db, MERCHANT_A, pluginZip(v1));
    await project(db, v1);
    const beforeLedger = ledgerFor(db).length;
    const beforeAssets = db.rows("theme_assets").length;
    const v2 = schemaManifest("1.1.0", []);
    expect(await codeOf(installPlugin(db, MERCHANT_A, pluginZip(v2)))).toBe(
      "package.incompatible_update",
    );
    // Last-good stands: projection still v1, no new ledger row, no v2 assets.
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    expect(
      installed.find((p) => p.manifest.id === "acme-reviews")?.manifest.version,
    ).toBe("1.0.0");
    expect(ledgerFor(db)).toHaveLength(beforeLedger);
    expect(db.rows("theme_assets")).toHaveLength(beforeAssets);
  });
});

describe("P2 — failure paths preserve last-good", () => {
  it("rollback restores the prior artifact as a new row with an audit trail", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    await installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0")));
    const out = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: key() },
    );
    expect(out.version).toBe("1.0.0");
    expect(out.rollbackOf).toBe(v1.packageId);
    expect(out.artifactId).not.toBeNull();
    // Exactly one live row (the restored one); history append-only.
    const live = ledgerFor(db).filter(
      (r) => r.status === "installed" || r.status === "trial",
    );
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(out.packageId);
    // Audit proves the restore (from → to with the explicit relationship).
    const audits = db
      .rows("theme_audit")
      .filter((a) => a.action === "package.rolled_back");
    expect(audits).toHaveLength(1);
    expect(audits[0]!.after).toMatchObject({ rollback_of: v1.packageId });
  });
});

describe("P3 — adversarial", () => {
  it("refuses a downgrade as bad_version, landing nothing new", async () => {
    const db = pkgDb();
    await installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0")));
    const beforeLedger = ledgerFor(db).length;
    const beforeAssets = db.rows("theme_assets").length;
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.0.0"))),
      ),
    ).toBe("package.bad_version");
    expect(ledgerFor(db)).toHaveLength(beforeLedger);
    expect(db.rows("theme_assets")).toHaveLength(beforeAssets);
  });

  it("refuses downgrades against the projected line even without ledger history", async () => {
    const db = pkgDb();
    // Projection ahead of the pipeline (marketplace/host lane projected
    // 1.2.0 without a pipeline row): a 1.1.0 ZIP is still a downgrade.
    await project(db, pluginManifest("1.2.0"));
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0"))),
      ),
    ).toBe("package.bad_version");
    expect(ledgerFor(db)).toHaveLength(0);
  });

  it("lets terminal rows go: a removed version never pins the floor", async () => {
    const db = pkgDb();
    const v2 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.2.0")),
    );
    // The newer line is uninstalled (revoked/removed): recovering the older
    // line is legitimate, not a downgrade attack.
    db.rows("marketplace_installs").find((r) => r.id === v2.packageId)!.status =
      "removed";
    const res = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.1.0")),
    );
    expect(res.version).toBe("1.1.0");
  });

  it("refuses same-version reinstalls under a fresh key, but replays the committed key", async () => {
    const db = pkgDb();
    const firstKey = key();
    const first = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
      { key: firstKey },
    );
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.0.0"))),
      ),
    ).toBe("package.bad_version");
    const replay = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
      { key: firstKey },
    );
    expect(replay.alreadyInstalled).toBe(true);
    expect(replay.packageId).toBe(first.packageId);
    expect(ledgerFor(db)).toHaveLength(1);
  });

  it("a concurrent double-submit stacks one row and replays the winner (assets intact)", async () => {
    const db = pkgDb({
      unique: [
        {
          table: "marketplace_installs",
          columns: ["merchant_id", "idempotency_key"],
        },
      ],
    });
    const raceKey = key();
    const bytes = pluginZip(pluginManifest("1.0.0"), [
      { name: "locales/en.json", content: "{}" },
    ]);
    const [a, b] = await Promise.all([
      installPlugin(db, MERCHANT_A, bytes, { key: raceKey }),
      installPlugin(db, MERCHANT_A, bytes, { key: raceKey }),
    ]);
    const replayed = [a, b].filter((r) => r.alreadyInstalled);
    const fresh = [a, b].filter((r) => !r.alreadyInstalled);
    expect(fresh).toHaveLength(1);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.packageId).toBe(fresh[0]!.packageId);
    expect(ledgerFor(db)).toHaveLength(1);
    // The winner's assets stand exactly once — the loser removed only its
    // surplus copies, never the shared prefix.
    expect(db.rows("theme_assets")).toHaveLength(1);
  });

  it("refuses rollback onto a suspended line, leaving live rows untouched", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    const v2 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.1.0")),
    );
    await project(db, pluginManifest("1.1.0"));
    db.rows("plugin_state")[0]!.suspended = true;
    const before = ledgerFor(db).map((r) => ({
      id: r.id,
      status: r.status,
    }));
    expect(
      await codeOf(
        rollbackPluginPackage(db.asClient(), MERCHANT_A, v1.packageId, ACTOR, {
          idempotencyKey: key(),
        }),
      ),
    ).toBe("package.rollback_revoked");
    expect(ledgerFor(db).map((r) => ({ id: r.id, status: r.status }))).toEqual(
      before,
    );
    expect(v2.packageId).not.toBe(v1.packageId);
    expect(
      db.rows("theme_audit").filter((a) => a.action === "package.rolled_back"),
    ).toHaveLength(0);
  });

  it("refuses rollback onto a revoked (removed) target without parking siblings", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    await installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0")));
    db.rows("marketplace_installs").find((r) => r.id === v1.packageId)!.status =
      "removed";
    expect(
      await codeOf(
        rollbackPluginPackage(db.asClient(), MERCHANT_A, v1.packageId, ACTOR, {
          idempotencyKey: key(),
        }),
      ),
    ).toBe("package.rollback_revoked");
    // The live v2 row was never parked: refusal parks nothing.
    const live = ledgerFor(db).filter((r) => r.status === "installed");
    expect(live).toHaveLength(1);
    expect(live[0]!.version).toBe("1.1.0");
  });

  it("replays an idempotent rollback instead of stacking rows", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    await installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0")));
    const rollbackKey = key();
    const first = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: rollbackKey },
    );
    const second = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: rollbackKey },
    );
    expect(second.packageId).toBe(first.packageId);
    expect(second.rollbackOf).toBe(v1.packageId);
    expect(ledgerFor(db)).toHaveLength(3);
  });

  it("replays a recorded rollback even after the line is suspended (history, not a new state change)", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    await installPlugin(db, MERCHANT_A, pluginZip(pluginManifest("1.1.0")));
    const rollbackKey = key();
    const first = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: rollbackKey },
    );
    await project(db, pluginManifest("1.0.0"));
    db.rows("plugin_state")[0]!.suspended = true;
    // A fresh rollback is refused while suspended…
    expect(
      await codeOf(
        rollbackPluginPackage(db.asClient(), MERCHANT_A, v1.packageId, ACTOR, {
          idempotencyKey: key(),
        }),
      ),
    ).toBe("package.rollback_revoked");
    // …but the committed key still replays its recorded rollback.
    const replay = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: rollbackKey },
    );
    expect(replay.packageId).toBe(first.packageId);
    expect(ledgerFor(db)).toHaveLength(3);
  });

  it("rejects a rollback key committed for a different target (conflict, never silent replay)", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.0.0")),
    );
    const v2 = await installPlugin(
      db,
      MERCHANT_A,
      pluginZip(pluginManifest("1.1.0")),
    );
    const rollbackKey = key();
    await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      {
        idempotencyKey: rollbackKey,
      },
    );
    expect(
      await codeOf(
        rollbackPluginPackage(db.asClient(), MERCHANT_A, v2.packageId, ACTOR, {
          idempotencyKey: rollbackKey,
        }),
      ),
    ).toBe("package.install_conflict");
  });
});
