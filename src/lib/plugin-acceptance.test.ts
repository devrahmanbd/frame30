/**
 * R2-8 acceptance matrix — deny / replay / audit for Plugin Phase 2.
 *
 * Index (each row = at least one test HERE or in the named suite):
 * - Step 1 adapter completeness ........... scope-adapter.test.ts (suite green)
 * - Step 2 hook→scope gate matrix ......... THIS FILE (4 hooks × full/missing)
 * - Step 3 signed egress + verify-side .... THIS FILE (outbound always signed
 *                                           when secret set; verify rejects
 *                                           missing/stale; ingress = Phase 4)
 * - Step 4 idempotent double-delivery ..... THIS FILE (deliveryId + dedupe)
 * - Step 5 cross-merchant deny ............ THIS FILE
 * - Step 6 audit assertions ............... THIS FILE (five-action flow) +
 *                                           plugins-consent / lifecycle / purge
 * - Step 7 suspend/resume matrix .......... THIS FILE (pure table) + lifecycle
 * - Step 8 purge idempotency .............. plugin-purge.test.ts (audit-once)
 * - Step 9 emission fire/no-throw ......... plugin-emission.test.ts
 * - Step 10 full gate suite ............... report (typecheck/test/contracts/
 *                                           schema:check/lint)
 * - PROD GATE (Task 5 review): callbacks went silently unsigned when
 *   PLUGIN_HOOK_SECRET was unset — fixed by the loud-missing-secret guard
 *   (warn + unsigned metric always; throw outside tests). THIS FILE asserts
 *   both halves.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import type { InstalledPlugin, ServerHook } from "./plugin-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

// Queue holder: the mocked enqueueJob delegates to the REAL implementation
// against the per-test fakeDb, so idempotency semantics are tested for real.
const queueDb = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./job-queue.server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    enqueueJob: (input: unknown) =>
      (actual["enqueueJob"] as (i: unknown, c?: unknown) => Promise<unknown>)(
        input,
        queueDb.db,
      ),
  };
});

const { parseManifest, defaultSettings } = await import("./plugin-manifest");
const { HOOK_SCOPE } = await import("./scope-adapter");
const { resetBreakers, runHook, deliverQueuedHook } =
  await import("./plugin-hooks.server");
const { verifySignature } = await import("./webhook-signing");
const { suspendPlugin, resumePlugin, purgePluginJob } =
  await import("./plugin-lifecycle.server");
const { upsertPlugin } = await import("./plugins.server");
const { uninstallWidgetInstall } = await import("./marketplace-install.server");
const { enqueueJob } = await import("./job-queue.server");

const MERCHANT = "m1";
const OTHER_MERCHANT = "m2";
const PLUGIN = "loyalty-lite";
const INSTALL = "install-1";
const ACTOR = "u1";

const HOOKS = [
  "cart.calculate",
  "checkout.validate",
  "order.created",
  "product.saved",
] as const satisfies readonly ServerHook[];

beforeEach(() => {
  recorder.reset();
  queueDb.db = fakeDb({ tables: {} }).asClient();
});

afterEach(() => {
  resetBreakers();
  vi.unstubAllGlobals();
  delete process.env.PLUGIN_HOOK_SECRET;
});

function subscriber(
  hook: ServerHook,
  grantedScopes: readonly string[],
): InstalledPlugin {
  const verdict = parseManifest({
    id: "r2-8-probe",
    name: "R2-8 Probe",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: [...HOOK_SCOPE[hook]],
    widgets: [],
    hooks: [hook],
    hooksUrl: "https://apps.example.com/hooks",
    settings: [],
    i18n: { en: {}, bn: {} },
  });
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: "install-r28",
    manifest: verdict.manifest,
    grantedScopes: [...grantedScopes],
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
  };
}

function stubFetchOk() {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function auditCount(
  db: ReturnType<typeof fakeDb>,
  action: string,
): Promise<number> {
  const { data } = await db
    .from("activity_log")
    .select("*")
    .eq("action", action);
  return ((data ?? []) as unknown[]).length;
}

describe("R2-8 step 2 — hook→scope gate matrix (full grant → delivered)", () => {
  it.each(HOOKS)(
    "%s with every required scope delivers (fetch POSTs)",
    async (hook) => {
      const fetchMock = stubFetchOk();
      const out = await runHook([subscriber(hook, HOOK_SCOPE[hook])], hook, {
        merchantId: MERCHANT,
      });
      expect(out).toHaveLength(1);
      expect(out[0].status).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

describe("R2-8 step 2 — hook→scope gate matrix (missing one scope → deny)", () => {
  it.each(HOOKS)(
    "%s missing any single scope → skipped:scope, zero fetch",
    async (hook) => {
      const required = [...HOOK_SCOPE[hook]];
      expect(required.length).toBeGreaterThan(0);
      for (const dropped of required) {
        resetBreakers();
        const fetchMock = stubFetchOk();
        fetchMock.mockClear();
        const granted = required.filter((s) => s !== dropped);
        const out = await runHook([subscriber(hook, granted)], hook, {
          merchantId: MERCHANT,
        });
        expect(out).toHaveLength(1);
        expect(out[0].status).toBe("skipped:scope");
        expect(fetchMock).not.toHaveBeenCalled();
      }
    },
  );
});

describe("R2-8 step 3 — signed egress + verify-side", () => {
  it("outbound live delivery ALWAYS attaches framique-signature when the secret is set", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    process.env.PLUGIN_HOOK_SECRET = "test-secret";
    const out = await runHook(
      [subscriber("order.created", HOOK_SCOPE["order.created"])],
      "order.created",
      { id: "o1" },
    );
    expect(out[0].status).toBe("ok");
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    await expect(
      verifySignature({
        header: headers["framique-signature"],
        body: seen?.body as string,
        secrets: ["test-secret"],
      }),
    ).resolves.toBe(true);
  });

  it("queued retry delivery is signed too", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    process.env.PLUGIN_HOOK_SECRET = "test-secret";
    const body = JSON.stringify({
      hook: "order.created",
      payload: { id: "o1" },
      settings: {},
    });
    const res = await deliverQueuedHook({
      pluginId: PLUGIN,
      installId: INSTALL,
      hook: "order.created",
      body,
      hooksUrl: "https://apps.example.com/hooks",
      deliveryId: "hook:loyalty-lite:order.created:abc123",
    });
    expect(res).toEqual({ ok: true, installId: INSTALL });
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it("verify-side refuses missing and stale headers (ingress contract for Phase 4)", async () => {
    const ts = 1_800_000_000;
    const body = JSON.stringify({ hook: "order.created" });
    const { computeSignature, signatureHeader } =
      await import("./webhook-signing");
    const fresh = signatureHeader(ts, [
      await computeSignature("s3cret", ts, body),
    ]);
    await expect(
      verifySignature({
        header: fresh,
        body,
        secrets: ["s3cret"],
        nowSeconds: ts + 10,
      }),
    ).resolves.toBe(true);
    // NOTE: `header` is typed non-nullable; a missing header arrives as "".
    // Both "" and garbage fail closed (false, never throw on strings).
    await expect(
      verifySignature({
        header: "",
        body,
        secrets: ["s3cret"],
        nowSeconds: ts,
      }),
    ).resolves.toBe(false);
    await expect(
      verifySignature({
        header: "t=abc,v1=zzz",
        body,
        secrets: ["s3cret"],
        nowSeconds: ts,
      }),
    ).resolves.toBe(false);
    await expect(
      verifySignature({
        header: fresh,
        body,
        secrets: ["s3cret"],
        nowSeconds: ts + 4000,
      }),
    ).resolves.toBe(false);
  });

  it("missing secret is LOUD in test env: warn + unsigned metric, still delivers unsigned", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    delete process.env.PLUGIN_HOOK_SECRET;
    const out = await runHook(
      [subscriber("order.created", HOOK_SCOPE["order.created"])],
      "order.created",
      { id: "o1" },
    );
    expect(out[0].status).toBe("ok");
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toBeUndefined();
    // Delivery still carries vendor dedupe identity even unsigned.
    expect(headers["x-framique-delivery"]).toMatch(
      /^hook:r2-8-probe:order\.created:[0-9a-f]+$/,
    );
    expect(
      recorder.logs.some(
        (l) => l.level === "warn" && l.event === "plugin.hook.unsigned_secret",
      ),
    ).toBe(true);
    expect(
      recorder.of("framique_plugin_hook_total", ["status", "unsigned"]),
    ).toHaveLength(1);
  });

  it("missing secret fails closed outside tests: throws, never delivers", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.PLUGIN_HOOK_SECRET;
    const prevNode = process.env.NODE_ENV;
    const prevVitest = process.env.VITEST;
    process.env.NODE_ENV = "production";
    delete process.env.VITEST;
    try {
      await expect(
        runHook(
          [subscriber("order.created", HOOK_SCOPE["order.created"])],
          "order.created",
          { id: "o1" },
        ),
      ).rejects.toThrow(/plugin_hook_secret_missing/);
      expect(fetchMock).not.toHaveBeenCalled();
      // Fail-closed path is loud too: warn + unsigned metric before the throw.
      expect(
        recorder.logs.some(
          (l) =>
            l.level === "warn" && l.event === "plugin.hook.unsigned_secret",
        ),
      ).toBe(true);
      expect(
        recorder.of("framique_plugin_hook_total", ["status", "unsigned"]),
      ).toHaveLength(1);
      await expect(
        deliverQueuedHook({
          pluginId: PLUGIN,
          installId: INSTALL,
          hook: "order.created",
          body: "{}",
          hooksUrl: "https://apps.example.com/hooks",
        }),
      ).rejects.toThrow(/plugin_hook_secret_missing/);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = prevVitest;
    }
  });
});

describe("R2-8 step 4 — idempotent double-delivery (replay)", () => {
  it("failed live attempt queues deliveryId = idempotency key", async () => {
    const db = fakeDb({ tables: { job_queue: [] } });
    queueDb.db = db.asClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const out = await runHook(
      [subscriber("order.created", HOOK_SCOPE["order.created"])],
      "order.created",
      { id: "replay-1" },
    );
    expect(out[0].status).toBe("queued");
    const jobs = db.rows("job_queue");
    expect(jobs).toHaveLength(1);
    const row = jobs[0] as Record<string, unknown>;
    const payload = row["payload"] as Record<string, unknown>;
    expect(row["idempotency_key"]).toMatch(
      /^hook:r2-8-probe:order\.created:[0-9a-f]+$/,
    );
    expect(payload["deliveryId"]).toBe(row["idempotency_key"]);
  });

  it("enqueueing the same hook key twice → one row, duplicate:true", async () => {
    const db = fakeDb({ tables: { job_queue: [] } });
    queueDb.db = db.asClient();
    const key = "hook:loyalty-lite:order.created:deadbeef";
    const first = await enqueueJob(
      {
        queue: "plugins",
        name: "plugin.hook.deliver",
        payload: { pluginId: PLUGIN, deliveryId: key },
        merchantId: null,
        idempotencyKey: key,
      },
      db.asClient() as never,
    );
    const second = await enqueueJob(
      {
        queue: "plugins",
        name: "plugin.hook.deliver",
        payload: { pluginId: PLUGIN, deliveryId: key },
        merchantId: null,
        idempotencyKey: key,
      },
      db.asClient() as never,
    );
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true });
    expect(db.rows("job_queue")).toHaveLength(1);
  });

  it("double deliverQueuedHook re-POSTs with the IDENTICAL vendor dedupe header (at-least-once)", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(init);
        return new Response("{}", { status: 200 });
      }),
    );
    const payload = {
      pluginId: PLUGIN,
      installId: INSTALL,
      hook: "order.created",
      body: JSON.stringify({
        hook: "order.created",
        payload: { id: "r" },
        settings: {},
      }),
      hooksUrl: "https://apps.example.com/hooks",
      deliveryId: "hook:loyalty-lite:order.created:cafef00d",
    };
    await expect(deliverQueuedHook(payload)).resolves.toMatchObject({
      ok: true,
    });
    await expect(deliverQueuedHook(payload)).resolves.toMatchObject({
      ok: true,
    });
    expect(seen).toHaveLength(2);
    const h = seen.map(
      (s) => (s.headers as Record<string, string>)["x-framique-delivery"],
    );
    expect(h[0]).toBe("hook:loyalty-lite:order.created:cafef00d");
    expect(h[1]).toBe(h[0]);
  });
});

describe("R2-8 step 5 — cross-merchant deny", () => {
  function merchantDb() {
    return fakeDb({
      tables: {
        plugin_state: [
          {
            id: "install-1",
            merchant_id: MERCHANT,
            plugin_id: PLUGIN,
            manifest: { id: PLUGIN },
            scopes: ["read_shop"],
            settings: {},
            enabled: true,
            suspended: false,
            suspended_reason: null,
            suspended_at: null,
          },
        ],
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: PLUGIN,
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        job_queue: [],
        activity_log: [],
      },
    });
  }

  it("suspend/resume with another merchant's id fail closed (plugin_not_installed)", async () => {
    const db = merchantDb();
    await expect(
      suspendPlugin(
        db.asClient() as never,
        OTHER_MERCHANT,
        PLUGIN,
        "operator",
        ACTOR,
      ),
    ).rejects.toThrow(/plugin_not_installed/);
    await expect(
      resumePlugin(db.asClient() as never, OTHER_MERCHANT, PLUGIN, ACTOR),
    ).rejects.toThrow(/plugin_not_installed/);
    // Owner row untouched, nothing audited.
    expect(db.rows("plugin_state")).toHaveLength(1);
    expect(await auditCount(db, "plugin.suspended")).toBe(0);
    expect(await auditCount(db, "plugin.resumed")).toBe(0);
  });

  it("purge with another merchant's id is a no-op: no rows, no audit", async () => {
    const db = merchantDb();
    const out = (await purgePluginJob(db.asClient() as never, {
      merchantId: OTHER_MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: ACTOR,
    })) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, purged: false });
    expect(db.rows("plugin_state")).toHaveLength(1);
    expect(await auditCount(db, "plugin.purged")).toBe(0);
  });
});

describe("R2-8 step 6 — audit assertions (one row per machine action)", () => {
  it("grant → suspend → resume → uninstall → purge writes exactly one audit each", async () => {
    const db = fakeDb({
      tables: {
        plugin_state: [],
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: PLUGIN,
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        job_queue: [],
        activity_log: [],
      },
    });
    queueDb.db = db.asClient();

    await upsertPlugin(db.asClient() as never, MERCHANT, {
      manifest: {
        id: PLUGIN,
        name: "Loyalty Lite",
        version: "1.2.0",
        api: "^3.0.0",
        permissions: ["read_shop", "render_storefront"],
        widgets: [],
        hooks: [],
        settings: [],
        i18n: { en: {}, bn: {} },
      },
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    await suspendPlugin(
      db.asClient() as never,
      MERCHANT,
      PLUGIN,
      "operator",
      ACTOR,
    );
    await resumePlugin(db.asClient() as never, MERCHANT, PLUGIN, ACTOR);
    await uninstallWidgetInstall(
      db.asClient() as never,
      MERCHANT,
      INSTALL,
      ACTOR,
    );
    await purgePluginJob(db.asClient() as never, {
      merchantId: MERCHANT,
      pluginId: PLUGIN,
      installId: INSTALL,
      actorId: ACTOR,
    });

    for (const action of [
      "plugin.scopes_granted",
      "plugin.suspended",
      "plugin.resumed",
      "plugin.uninstalling",
      "plugin.purged",
    ]) {
      expect(await auditCount(db, action)).toBe(1);
    }
  });
});

describe("R2-8 step 7 — suspend/resume transition matrix (pure guard)", () => {
  it("allows active→suspend, suspended→suspend (idempotent), suspended→resume; forbids active→resume", async () => {
    const { assertTransition } = await import("./plugin-lifecycle.server");
    expect(() => assertTransition(false, "suspend")).not.toThrow();
    expect(() => assertTransition(true, "suspend")).not.toThrow();
    expect(() => assertTransition(true, "resume")).not.toThrow();
    expect(() => assertTransition(false, "resume")).toThrow(
      /plugin_invalid_transition:active->resume/,
    );
  });
});
