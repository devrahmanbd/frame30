/**
 * TODO-7 — SLA maths + audit-trail contracts stay intact.
 *
 * Locks the pure contracts the ticket desk depends on: default policies,
 * deadline derivation (frozen at creation), breach/at-risk transitions, P50
 * summaries (now counting `pending_approval` as open work), live moderation
 * metrics, and the sorted bilingual audit trail.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLA,
  buildAuditTrail,
  computeSlaMetrics,
  dueDates,
  formatDuration,
  policyFor,
  slaState,
  summarise,
  type TicketLike,
} from "./support-sla";

function ticket(overrides: Partial<TicketLike> = {}): TicketLike {
  return {
    status: "open",
    priority: "normal",
    first_response_at: null,
    resolved_at: null,
    first_response_due_at: "2026-09-01T11:00:00.000Z",
    resolution_due_at: "2026-09-02T10:00:00.000Z",
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("policyFor / dueDates — frozen-at-creation deadlines", () => {
  it("falls back to defaults per priority", () => {
    expect(policyFor("urgent", [])).toEqual(DEFAULT_SLA.urgent);
    expect(policyFor("low", [])).toEqual(DEFAULT_SLA.low);
  });

  it("prefers the merchant policy row when present", () => {
    expect(
      policyFor("normal", [
        { priority: "normal", first_response_minutes: 10, resolution_minutes: 60 },
      ]),
    ).toEqual({ first: 10, resolution: 60 });
  });

  it("derives ISO deadlines by adding minutes", () => {
    const from = new Date("2026-09-01T10:00:00.000Z");
    const d = dueDates("urgent", [], from);
    expect(d.firstResponseDueAt).toBe("2026-09-01T10:15:00.000Z");
    expect(d.resolutionDueAt).toBe("2026-09-01T14:00:00.000Z");
  });
});

describe("slaState — breach / at-risk transitions", () => {
  const now = new Date("2026-09-01T10:30:00.000Z").getTime();

  it("met while the window is wide open", () => {
    expect(slaState(ticket(), now)).toBe("met");
  });

  it("at_risk inside the final 20% of the window", () => {
    // 60-min window, 6 minutes left → 10% remaining.
    const t = ticket({ first_response_due_at: "2026-09-01T10:36:00.000Z" });
    expect(slaState(t, now)).toBe("at_risk");
  });

  it("breached past the deadline", () => {
    const t = ticket({ first_response_due_at: "2026-09-01T10:20:00.000Z" });
    expect(slaState(t, now)).toBe("breached");
  });

  it("closed for resolved / closed tickets regardless of clocks", () => {
    expect(slaState(ticket({ status: "resolved" }), now)).toBe("closed");
    expect(slaState(ticket({ status: "closed" }), now)).toBe("closed");
  });

  it("pending_approval still runs the SLA clock (unactioned work)", () => {
    expect(slaState(ticket({ status: "pending_approval" }), now)).toBe("met");
    expect(
      slaState(
        ticket({
          status: "pending_approval",
          first_response_due_at: "2026-09-01T10:20:00.000Z",
        }),
        now,
      ),
    ).toBe("breached");
  });
});

describe("summarise — desk counts and P50s", () => {
  it("counts open + pending + pending_approval as open work", () => {
    const s = summarise([
      ticket({ status: "open" }),
      ticket({ status: "pending" }),
      ticket({ status: "pending_approval" }),
      ticket({ status: "resolved" }),
    ]);
    expect(s.open).toBe(3);
  });

  it("computes breach / at-risk buckets and P50s", () => {
    const now = new Date("2026-09-01T12:00:00.000Z").getTime();
    const s = summarise(
      [
        ticket({ first_response_due_at: "2026-09-01T10:20:00.000Z" }),
        ticket({ first_response_due_at: "2026-09-01T12:02:00.000Z" }),
        ticket({
          status: "resolved",
          first_response_at: "2026-09-01T10:30:00.000Z",
          resolved_at: "2026-09-01T11:00:00.000Z",
        }),
      ],
      now,
    );
    expect(s.breached).toBe(1);
    expect(s.atRisk).toBe(1);
    expect(s.firstResponseP50Minutes).toBe(30);
    expect(s.resolutionP50Minutes).toBe(60);
  });

  it("returns null P50s when nothing is answered yet", () => {
    const s = summarise([ticket()]);
    expect(s.firstResponseP50Minutes).toBeNull();
    expect(s.resolutionP50Minutes).toBeNull();
  });
});

describe("computeSlaMetrics — live moderation thresholds", () => {
  it("pending before the first response, breached after the tier limit", () => {
    const base = {
      priority: "normal",
      createdAt: "2026-09-01T10:00:00.000Z",
      now: new Date("2026-09-01T10:10:00.000Z").getTime(),
    };
    expect(computeSlaMetrics(base).slaStatus).toBe("pending");
    expect(
      computeSlaMetrics({ ...base, now: new Date("2026-09-01T12:30:00.000Z").getTime() })
        .slaStatus,
    ).toBe("breached");
  });

  it("measures TTFR once the operator replies", () => {
    const m = computeSlaMetrics({
      priority: "urgent",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastOperatorMessageAt: "2026-09-01T10:05:00.000Z",
      now: new Date("2026-09-01T10:06:00.000Z").getTime(),
    });
    expect(m.firstResponseMinutes).toBe(5);
    expect(m.firstResponseBreached).toBe(false);
    expect(m.formattedTtfr).toBe("5m");
  });
});

describe("formatDuration + buildAuditTrail — audit contract", () => {
  it("formats compact durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(4 * 60_000)).toBe("4m");
    expect(formatDuration(75 * 60_000)).toBe("1h 15m");
  });

  it("emits a sorted bilingual trail with stable ids", () => {
    const events = buildAuditTrail(
      {
        id: "c1",
        status: "open",
        createdAt: "2026-09-01T10:00:00Z",
        resolvedAt: "2026-09-01T11:00:00Z",
      },
      [
        {
          id: "m2",
          role: "bot",
          body: "Hello!",
          created_at: "2026-09-01T10:05:00Z",
        },
        {
          id: "m1",
          role: "user",
          body: "Hi",
          created_at: "2026-09-01T10:01:00Z",
        },
      ],
    );
    expect(events.map((e) => e.type)).toEqual([
      "created",
      "customer_message",
      "ai_reply",
      "resolved",
    ]);
    for (const e of events) {
      expect(e.id).toBeTruthy();
      expect(e.description).toBeTruthy();
      expect(e.descriptionBn).toBeTruthy();
      expect(e.timestamp).toBeTruthy();
    }
    const times = events.map((e) => new Date(e.timestamp).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
