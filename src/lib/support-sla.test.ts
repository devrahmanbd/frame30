import { describe, expect, it } from "vitest";
import {
  SLA_TIERS,
  buildAuditTrail,
  computeSlaMetrics,
  formatDuration,
} from "./support-sla";

describe("Support SLA Metrics & Audit Engine", () => {
  it("formats millisecond durations correctly", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(45000)).toBe("45s");
    expect(formatDuration(180000)).toBe("3m");
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(3660000)).toBe("1h 1m");
    expect(formatDuration(86400000)).toBe("1d");
    expect(formatDuration(90000000)).toBe("1d 1h");
  });

  it("computes met SLA when operator responds within target window", () => {
    const createdAt = new Date("2026-09-10T10:00:00Z").toISOString();
    const operatorReplyAt = new Date("2026-09-10T10:08:00Z").toISOString(); // 8 mins later (urgent target is 15 mins)

    const metrics = computeSlaMetrics({
      priority: "urgent",
      createdAt,
      lastOperatorMessageAt: operatorReplyAt,
      status: "in_progress",
    });

    expect(metrics.priority).toBe("urgent");
    expect(metrics.firstResponseMinutes).toBe(8);
    expect(metrics.firstResponseBreached).toBe(false);
    expect(metrics.slaStatus).toBe("met");
    expect(metrics.formattedTtfr).toBe("8m");
  });

  it("detects breached SLA when first response exceeds tier limit", () => {
    const createdAt = new Date("2026-09-10T10:00:00Z").toISOString();
    const operatorReplyAt = new Date("2026-09-10T10:25:00Z").toISOString(); // 25 mins later (urgent limit is 15 mins)

    const metrics = computeSlaMetrics({
      priority: "urgent",
      createdAt,
      lastOperatorMessageAt: operatorReplyAt,
      status: "in_progress",
    });

    expect(metrics.firstResponseMinutes).toBe(25);
    expect(metrics.firstResponseBreached).toBe(true);
    expect(metrics.slaStatus).toBe("breached");
  });

  it("identifies at_risk conversations nearing breach threshold", () => {
    const createdAt = new Date("2026-09-10T10:00:00Z").toISOString();
    // Urgent tier max is 15 min. At 13 mins with no reply, remaining is < 25% (2m / 15m = 13.3%)
    const now = new Date("2026-09-10T10:13:00Z").getTime();

    const metrics = computeSlaMetrics({
      priority: "urgent",
      createdAt,
      status: "open",
      now,
    });

    expect(metrics.slaStatus).toBe("at_risk");
    expect(metrics.firstResponseBreached).toBe(false);
  });

  it("builds a complete chronological audit trail from conversation and message records", () => {
    const conversation = {
      id: "conv-1234",
      createdAt: "2026-09-10T10:00:00Z",
      status: "resolved",
      resolvedAt: "2026-09-10T10:45:00Z",
      priority: "high",
      takeoverMode: "human_takeover",
    };

    const messages = [
      {
        id: "msg-1",
        role: "user",
        body: "Where is my parcel #ORD-441?",
        createdAt: "2026-09-10T10:00:00Z",
      },
      {
        id: "msg-2",
        role: "bot",
        body: "Let me look up your tracking number.",
        createdAt: "2026-09-10T10:00:15Z",
      },
      {
        id: "msg-3",
        role: "agent",
        body: "Checking with Pathao courier now.",
        createdAt: "2026-09-10T10:05:00Z",
        sentByOperatorId: "op-1",
        isInternalNote: true,
      },
      {
        id: "msg-4",
        role: "agent",
        body: "Your package is out for delivery today!",
        createdAt: "2026-09-10T10:15:00Z",
        sentByOperatorId: "op-1",
        isInternalNote: false,
      },
    ];

    const trail = buildAuditTrail(conversation, messages);

    expect(trail.length).toBe(6); // created + 4 messages + resolved
    expect(trail[0].type).toBe("created");
    expect(trail[1].type).toBe("customer_message");
    expect(trail[2].type).toBe("ai_reply");
    expect(trail[3].type).toBe("internal_note");
    expect(trail[4].type).toBe("operator_message");
    expect(trail[5].type).toBe("resolved");

    // All events should have timestamp and bilingual description
    for (const event of trail) {
      expect(event.timestamp).toBeDefined();
      expect(event.description.length).toBeGreaterThan(0);
      expect(event.descriptionBn.length).toBeGreaterThan(0);
    }
  });
});
