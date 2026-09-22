/**
 * Phase 2 R2-6 — purge machine: uninstalling → queued purge → purged.
 *
 * Load-bearing properties (purge is destructive): the purge handler is
 * idempotent (reruns are silent no-op successes) and `plugin.purged` audits
 * exactly once across any number of runs.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted<{
  holder: { observability: Record<string, unknown> } | null;
}>(() => ({ holder: null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { uninstallWidgetInstall } = await import("./marketplace-install.server");
const { purgePluginJob } = await import("./plugin-lifecycle.server");

const MERCHANT = "m1";
const PLUGIN = "loyalty-lite";
const INSTALL = "install-1";

function purgeDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: INSTALL,
          kind: "widget",
          listing_slug: PLUGIN,
          status: "installed",
          merchant_id: MERCHANT,
        },
      ],
      plugin_state: [
        {
          id: "p-1",
          merchant_id: MERCHANT,
          plugin_id: PLUGIN,
          enabled: true,
        },
      ],
      job_queue: [],
      activity_log: [],
    },
  });
}

async function auditRows(db: ReturnType<typeof fakeDb>, action: string) {
  const { data } = await db
    .from("activity_log")
    .select("*")
    .eq("action", action);
  return (data ?? []) as Record<string, unknown>[];
}

async function ledgerStatus(db: ReturnType<typeof fakeDb>) {
  const { data: row } = await db
    .from("marketplace_installs")
    .select("status")
    .eq("id", INSTALL)
    .maybeSingle();
  return (row as { status: string } | null)?.status;
}

beforeEach(() => recorder.reset());

describe("purge machine (R2-6)", () => {
  it("uninstall enqueues purge and marks ledger uninstalling", async () => {
    const db = purgeDb();
    const out = (await uninstallWidgetInstall(
      db.asClient(),
      MERCHANT,
      INSTALL,
      "u1",
    )) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, purging: true });

    expect(await ledgerStatus(db)).toBe("uninstalling");

    // plugin_state is retained for the purge job — never deleted inline.
    expect(db.rows("plugin_state")).toHaveLength(1);

    // Exactly one purge job with the verbatim idempotency key.
    const jobs = db.rows("job_queue");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      queue: "plugins",
      name: "plugin.purge",
      idempotency_key: `purge:${MERCHANT}:${INSTALL}`,
    });
    expect((jobs[0].payload as Record<string, unknown>).pluginId).toBe(PLUGIN);

    // Transitional audit now; terminal audit only after the handler runs.
    expect(await auditRows(db, "plugin.uninstalling")).toHaveLength(1);
    expect(await auditRows(db, "plugin.purged")).toHaveLength(0);
  });

  it("repeat uninstall does not duplicate the purge job", async () => {
    const db = purgeDb();
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "u1");
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "u1");
    expect(db.rows("job_queue")).toHaveLength(1);
    expect(await ledgerStatus(db)).toBe("uninstalling");
  });

  it("purge handler deletes state + marks purged; rerun is a silent no-op, audit exactly once", async () => {
    const db = purgeDb();
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "u1");

    const first = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: "u1",
    })) as unknown as Record<string, unknown>;
    expect(first).toMatchObject({ ok: true, purged: true });
    expect(db.rows("plugin_state")).toHaveLength(0);
    expect(await ledgerStatus(db)).toBe("purged");

    const second = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: "u1",
    })) as unknown as Record<string, unknown>;
    expect(second).toMatchObject({ ok: true, purged: false });
    expect(await ledgerStatus(db)).toBe("purged");
    expect(db.rows("plugin_state")).toHaveLength(0);

    // Audit-once: exactly one terminal audit across both runs.
    const purged = await auditRows(db, "plugin.purged");
    expect(purged).toHaveLength(1);
    expect(purged[0]).toMatchObject({
      merchant_id: MERCHANT,
      action: "plugin.purged",
      resource_type: "plugin",
    });
  });

  it("purge drains undelivered rows for the plugin but leaves other work", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: PLUGIN,
            status: "uninstalling",
            merchant_id: MERCHANT,
          },
        ],
        plugin_state: [],
        job_queue: [
          {
            id: "j-own",
            queue: "plugins",
            name: "plugin.hook.deliver",
            state: "queued",
            payload: { pluginId: PLUGIN },
            merchant_id: MERCHANT,
          },
          {
            id: "j-other-plugin",
            queue: "plugins",
            name: "plugin.hook.deliver",
            state: "queued",
            payload: { pluginId: "other-plugin" },
            merchant_id: MERCHANT,
          },
          {
            id: "j-other-queue",
            queue: "payments",
            name: "charge",
            state: "queued",
            payload: { pluginId: PLUGIN },
            merchant_id: MERCHANT,
          },
        ],
        activity_log: [],
      },
    });

    const out = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
    })) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, purged: true });

    const remaining = db
      .rows("job_queue")
      .map((r) => r.id)
      .sort();
    expect(remaining).toEqual(["j-other-plugin", "j-other-queue"]);
    expect(await ledgerStatus(db)).toBe("purged");
  });

  it("purge of an unknown install is a no-op success with no audit", async () => {
    const db = purgeDb();
    const out = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: "ghost",
      installId: "nope",
    })) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, purged: false });
    expect(await auditRows(db, "plugin.purged")).toHaveLength(0);
    // Nothing destroyed: state and ledger untouched.
    expect(db.rows("plugin_state")).toHaveLength(1);
  });

  it("purge against a non-allowlisted status (paused) is a no-op; uninstalling still converges", async () => {
    const pausedDb = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: PLUGIN,
            status: "paused",
            merchant_id: MERCHANT,
          },
        ],
        plugin_state: [
          {
            id: "p-1",
            merchant_id: MERCHANT,
            plugin_id: PLUGIN,
            enabled: true,
          },
        ],
        job_queue: [],
        activity_log: [],
      },
    });
    const blocked = (await purgePluginJob(pausedDb.asClient(), {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: "u1",
    })) as unknown as Record<string, unknown>;
    expect(blocked).toMatchObject({ ok: true, purged: false });
    // No transition, no terminal audit, nothing destroyed.
    const { data: pausedRow } = await pausedDb
      .from("marketplace_installs")
      .select("status")
      .eq("id", INSTALL)
      .maybeSingle();
    expect((pausedRow as { status: string }).status).toBe("paused");
    expect(await auditRows(pausedDb, "plugin.purged")).toHaveLength(0);
    expect(pausedDb.rows("plugin_state")).toHaveLength(1);

    // Allowlisted `uninstalling` still converges to `purged` with one audit.
    const db = purgeDb();
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "u1");
    const out = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: "u1",
    })) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, purged: true });
    expect(await ledgerStatus(db)).toBe("purged");
    expect(await auditRows(db, "plugin.purged")).toHaveLength(1);
  });
});
