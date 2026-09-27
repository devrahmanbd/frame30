/**
 * TODO-7 — channel HMAC + idempotency proof.
 *
 * Providers retry aggressively and duplicate freely: every payload is verified
 * with a constant-time HMAC *before* the idempotency slot is consumed, and
 * replays collapse to `duplicate` via the unique
 * `(merchant, channel, external_event_id)` contract.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  ingestChannelEvent,
  verifySignature,
  type ChannelIntake,
} from "./support-channels.server";

const holder = vi.hoisted(() => ({ admin: null as unknown as FakeAdmin }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) =>
      (holder.admin as FakeAdmin).from(args[0] as string),
  },
}));
// Inline allow-all double (top-level imports are not visible in factories).
vi.mock("./rate-limit.server", () => ({
  enforceRateLimit: vi.fn(async () => ({
    allowed: true,
    hits: 1,
    limit: 100,
    remaining: 99,
    reset_at: new Date(Date.now() + 60_000).toISOString(),
  })),
  rateLimit: vi.fn(async () => ({
    allowed: true,
    hits: 1,
    limit: 100,
    remaining: 99,
    reset_at: new Date(Date.now() + 60_000).toISOString(),
  })),
  rateLimitHeaders: () => ({}),
  RateLimitError: class RateLimitError extends Error {},
  BUCKETS: {},
}));
vi.mock("./support-agent.server", () => ({
  askSupport: vi.fn(async () => ({ reply: "Agent reply here" })),
}));

type Row = Record<string, unknown>;

type FakeAdmin = {
  from: (table: string) => unknown;
  seen: Set<string>;
  events: Row[];
  updates: Array<{ table: string; patch: Row }>;
  agentCalls: number;
};

function makeAdmin(opts: {
  channel?: Row | null;
  merchant?: Row | null;
  preSeen?: string[];
}): FakeAdmin {
  const seen = new Set<string>(opts.preSeen ?? []);
  const events: Row[] = [];
  const updates: Array<{ table: string; patch: Row }> = [];
  const admin: FakeAdmin = {
    seen,
    events,
    updates,
    agentCalls: 0,
    from: (table: string) => {
      if (table === "ai_channels") {
        return {
          select: () => ({
            eq: (c1: string, v1: unknown) => ({
              eq: (c2: string, v2: unknown) => ({
                maybeSingle: async () => {
                  const row = opts.channel ?? null;
                  const ok =
                    row !== null &&
                    (row as Row)[c1] === v1 &&
                    (row as Row)[c2] === v2;
                  return { data: ok ? row : null, error: null };
                },
              }),
            }),
          }),
          update: (patch: Row) => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              then: (resolve: (v: unknown) => unknown) => {
                updates.push({ table, patch });
                return resolve({ error: null, data: null });
              },
            };
            return chain;
          },
        };
      }
      if (table === "ai_channel_events") {
        return {
          insert: async (row: Row) => {
            events.push(row);
            if (seen.has(row["external_event_id"] as string)) {
              // Simulates the unique-index violation on replay.
              return { error: { message: "duplicate key" }, data: null };
            }
            seen.add(row["external_event_id"] as string);
            return { error: null, data: row };
          },
          update: (patch: Row) => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              then: (resolve: (v: unknown) => unknown) => {
                updates.push({ table, patch });
                return resolve({ error: null, data: null });
              },
            };
            return chain;
          },
        };
      }
      if (table === "merchants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.merchant ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return admin;
}

const CHANNEL_ROW = {
  id: "ch_1",
  merchant_id: "m_1",
  enabled: true,
  secret_hash: "x",
  channel: "whatsapp",
  external_id: "phone-id-1",
};

const SECRET = "test-shared-secret-123";
const RAW = JSON.stringify({ hello: "world", n: 1 });
const GOOD_SIG = `sha256=${createHmac("sha256", SECRET).update(RAW).digest("hex")}`;

function intake(overrides: Partial<ChannelIntake> = {}): ChannelIntake {
  return {
    channel: "whatsapp",
    externalId: "phone-id-1",
    eventId: "evt_1",
    text: "Where is my order?",
    from: "+8801712345678",
    rawBody: RAW,
    signature: GOOD_SIG,
    secret: SECRET,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifySignature — constant-time HMAC", () => {
  it("accepts a correct sha256= signature", async () => {
    expect(await verifySignature(SECRET, RAW, GOOD_SIG)).toBe(true);
  });

  it("accepts bare and upper-case hex variants", async () => {
    const bare = GOOD_SIG.replace(/^sha256=/, "");
    expect(await verifySignature(SECRET, RAW, bare)).toBe(true);
    expect(await verifySignature(SECRET, RAW, bare.toUpperCase())).toBe(true);
  });

  it("rejects wrong secrets, tampered bodies and garbage", async () => {
    expect(await verifySignature("wrong-secret", RAW, GOOD_SIG)).toBe(false);
    expect(await verifySignature(SECRET, `${RAW} `, GOOD_SIG)).toBe(false);
    expect(await verifySignature(SECRET, RAW, "sha256=deadbeef")).toBe(false);
    expect(await verifySignature(SECRET, RAW, "")).toBe(false);
  });
});

describe("ingestChannelEvent — HMAC + idempotency", () => {
  it("processes a signed event and returns the agent reply", async () => {
    holder.admin = makeAdmin({
      channel: { ...CHANNEL_ROW },
      merchant: { slug: "test-store" },
    });
    const res = await ingestChannelEvent(intake());
    expect(res.outcome).toBe("processed");
    expect(res.reply).toBe("Agent reply here");
    expect(holder.admin.events).toHaveLength(1);
    // Raw payloads are never stored — only a digest.
    expect(holder.admin.events[0]).not.toHaveProperty("rawBody");
    expect(holder.admin.events[0]).toHaveProperty("payload_digest");
    expect(
      holder.admin.updates.some(
        (u) => u.table === "ai_channel_events" && u.patch.status === "processed",
      ),
    ).toBe(true);
  });

  it("collapses a provider replay to duplicate without re-running the agent", async () => {
    holder.admin = makeAdmin({
      channel: { ...CHANNEL_ROW },
      merchant: { slug: "test-store" },
    });
    const { askSupport } = await import("./support-agent.server");
    expect((await ingestChannelEvent(intake())).outcome).toBe("processed");
    expect((await ingestChannelEvent(intake())).outcome).toBe("duplicate");
    expect(vi.mocked(askSupport)).toHaveBeenCalledTimes(1);
  });

  it("rejects bad signatures WITHOUT consuming the idempotency slot", async () => {
    holder.admin = makeAdmin({
      channel: { ...CHANNEL_ROW },
      merchant: { slug: "test-store" },
    });
    const bad = await ingestChannelEvent(
      intake({ signature: "sha256=deadbeef" }),
    );
    expect(bad.outcome).toBe("rejected");
    expect(holder.admin.events).toHaveLength(0);

    // The legitimate retry that follows must still process.
    const good = await ingestChannelEvent(intake());
    expect(good.outcome).toBe("processed");
  });

  it("processes unsigned intake when no secret is configured", async () => {
    holder.admin = makeAdmin({
      channel: { ...CHANNEL_ROW },
      merchant: { slug: "test-store" },
    });
    const res = await ingestChannelEvent(
      intake({ signature: null, secret: null }),
    );
    expect(res.outcome).toBe("processed");
  });

  it("marks disabled channels without calling the agent", async () => {
    holder.admin = makeAdmin({
      channel: { ...CHANNEL_ROW, enabled: false },
      merchant: { slug: "test-store" },
    });
    const { askSupport } = await import("./support-agent.server");
    const res = await ingestChannelEvent(intake());
    expect(res.outcome).toBe("disabled");
    expect(vi.mocked(askSupport)).not.toHaveBeenCalled();
  });

  it("answers unknown_channel for unregistered senders", async () => {
    holder.admin = makeAdmin({ channel: null });
    const res = await ingestChannelEvent(intake());
    expect(res.outcome).toBe("unknown_channel");
    expect(holder.admin.events).toHaveLength(0);
  });
});
