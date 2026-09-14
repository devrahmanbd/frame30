/**
 * OAuth 2.1 token lifecycle — [A5]/[A6] failure suite.
 *
 * The headline case is refresh-token reuse: presenting a rotated token means
 * the pair leaked, so the whole family must burn, the counter must fire (it is
 * what pages security) and an audit row must be written.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any, db: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return rec.db;
  },
}));

const { refreshToken, revokeToken, sha256Hex, OAuthError } = await import("./oauth.server");

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const CLIENT_ROW = "client-row-1";
const FAMILY = "fam-1";

async function seed(tokenOverrides: Record<string, unknown> = {}): Promise<{ db: FakeDb; refresh: string }> {
  const refresh = "frmrt_test_refresh_token";
  const db = fakeDb({
    tables: {
      oauth_clients: [
        {
          id: CLIENT_ROW,
          merchant_id: MERCHANT,
          client_id: "app_public",
          client_type: "public",
          client_secret_hash: null,
          status: "active",
          scopes: ["orders.read", "products.read"],
        },
        {
          id: "client-row-2",
          merchant_id: MERCHANT,
          client_id: "app_disabled",
          client_type: "public",
          client_secret_hash: null,
          status: "revoked",
          scopes: ["orders.read"],
        },
      ],
      oauth_tokens: [
        {
          id: "tok-1",
          merchant_id: MERCHANT,
          client_row_id: CLIENT_ROW,
          user_id: "user-1",
          family_id: FAMILY,
          scopes: ["orders.read", "products.read"],
          access_hash: await sha256Hex("frmat_access"),
          refresh_hash: await sha256Hex(refresh),
          refresh_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          rotated_at: null,
          revoked_at: null,
          ...tokenOverrides,
        },
        {
          id: "tok-sibling",
          merchant_id: MERCHANT,
          client_row_id: CLIENT_ROW,
          user_id: "user-1",
          family_id: FAMILY,
          scopes: ["orders.read"],
          access_hash: "sibling-access",
          refresh_hash: "sibling-refresh",
          refresh_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          rotated_at: null,
          revoked_at: null,
        },
      ],
      api_key_events: [],
    },
  });
  rec.db = db;
  return { db, refresh };
}

beforeEach(() => recorder.reset());

describe("refreshToken", () => {
  it("rotates a live refresh token and marks the old one rotated", async () => {
    const { db, refresh } = await seed();
    const pair = await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh });

    expect(pair.access_token).toMatch(/^frmat_/);
    expect(pair.refresh_token).toMatch(/^frmrt_/);
    expect(pair.refresh_token).not.toBe(refresh);
    const old = db.rows("oauth_tokens").find((r) => r["id"] === "tok-1")!;
    expect(old["rotated_at"]).toBeTruthy();
    expect(recorder.of("framique_oauth_token_total", ["action", "rotated"])).toHaveLength(1);
  });

  it("keeps the rotated pair in the same family", async () => {
    const { db, refresh } = await seed();
    await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh });
    const minted = db.callsOf("insert").find((c) => c.table === "oauth_tokens")!;
    expect(minted.rows[0]!["family_id"]).toBe(FAMILY);
    expect(minted.rows[0]!["rotated_from"]).toBe("tok-1");
  });

  it("denies reuse of a rotated refresh token and burns the family (deny)", async () => {
    const { db, refresh } = await seed({ rotated_at: new Date().toISOString() });

    const err = await refreshToken({
      clientId: "app_public",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(OAuthError);
    expect(err.code).toBe("invalid_grant");
    expect(err.detail).toBe("refresh_reuse");

    // Every unrevoked token in the family is now revoked — including the sibling.
    for (const row of db.rows("oauth_tokens")) {
      expect(row["revoked_at"]).toBeTruthy();
      expect(row["revoke_reason"]).toBe("refresh_reuse");
    }
  });

  it("fires the reuse counter that pages security (audit)", async () => {
    const { refresh } = await seed({ rotated_at: new Date().toISOString() });
    await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh }).catch(
      () => null,
    );
    expect(recorder.of("framique_oauth_token_total", ["action", "reuse_detected"])).toHaveLength(1);
    expect(recorder.logs.some((l) => l.event === "oauth.refresh_reuse")).toBe(true);
  });

  it("writes an audit row naming the reuse (audit)", async () => {
    const { db, refresh } = await seed({ rotated_at: new Date().toISOString() });
    await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh }).catch(
      () => null,
    );
    const events = db.rows("api_key_events");
    expect(events).toHaveLength(1);
    expect(events[0]!["action"]).toBe("oauth.token.revoked");
    expect(events[0]!["payload"]).toEqual({ reason: "refresh_reuse" });
    expect(events[0]!["merchant_id"]).toBe(MERCHANT);
  });

  it("mints nothing on a reuse attempt (replay must not issue credentials)", async () => {
    const { db, refresh } = await seed({ rotated_at: new Date().toISOString() });
    await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh }).catch(
      () => null,
    );
    expect(db.callsOf("insert").filter((c) => c.table === "oauth_tokens")).toHaveLength(0);
  });

  it("denies an already revoked token the same way", async () => {
    const { refresh } = await seed({ revoked_at: new Date().toISOString() });
    const err = await refreshToken({
      clientId: "app_public",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);
    expect(err.detail).toBe("refresh_reuse");
  });

  it("denies an expired refresh token without burning the family", async () => {
    const { db, refresh } = await seed({
      refresh_expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const err = await refreshToken({
      clientId: "app_public",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);
    expect(err.detail).toBe("expired");
    expect(db.rows("oauth_tokens").every((r) => !r["revoked_at"])).toBe(true);
  });

  it("denies a disabled client before looking at the token", async () => {
    const { refresh } = await seed();
    const err = await refreshToken({
      clientId: "app_disabled",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);
    expect(err.code).toBe("client_disabled");
    expect(err.status).toBe(403);
  });

  it("denies an unknown client", async () => {
    const { refresh } = await seed();
    const err = await refreshToken({
      clientId: "does_not_exist",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);
    expect(err.code).toBe("invalid_client");
    expect(err.status).toBe(401);
  });

  it("denies a token belonging to a different client row", async () => {
    const { db, refresh } = await seed();
    db.rows("oauth_tokens").find((r) => r["id"] === "tok-1")!["client_row_id"] = "someone-else";
    const err = await refreshToken({
      clientId: "app_public",
      clientSecret: null,
      refreshToken: refresh,
    }).catch((e) => e);
    expect(err.code).toBe("invalid_grant");
  });
});

describe("revokeToken", () => {
  it("answers ok for an unknown token so probes learn nothing", async () => {
    await seed();
    await expect(revokeToken("frmrt_not_a_real_token")).resolves.toEqual({ ok: true });
  });
});

describe("token storage", () => {
  it("stores only hashes — a table dump cannot be replayed", async () => {
    const { db, refresh } = await seed();
    await refreshToken({ clientId: "app_public", clientSecret: null, refreshToken: refresh });
    const stored = JSON.stringify(db.rows("oauth_tokens"));
    expect(stored).not.toContain(refresh);
    expect(stored).not.toMatch(/frmrt_[a-f0-9]{64}/);
  });
});
