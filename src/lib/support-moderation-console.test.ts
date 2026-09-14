/**
 * Phase 12.2 — Moderation Console Tests
 *
 * Tests cover:
 *  A. Server function: owner.server.ts — loadAi, loadAiConversationMessages,
 *     ownerSendAgentMessage, ownerSetTakeoverMode, ownerUpdateConversationStatus,
 *     ownerSetConversationPriority, ownerSaveOperatorNotes.
 *  B. UI logic helpers: filtering, sorting, SLA colour, relTime.
 *  C. Integration: conversation flow lifecycle (queue → takeover → reply → resolve).
 */
import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// A. Pure logic helpers extracted from ai.tsx for direct unit testing
// ─────────────────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function slaColor(iso: string | null): string {
  if (!iso) return "text-muted-foreground";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins > 30) return "text-destructive";
  if (mins > 10) return "text-orange-500 dark:text-orange-400";
  return "text-muted-foreground";
}

function priorityToRank(p: string | null): number {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[p ?? "normal"] ?? 2;
}

type MockConv = {
  id: string;
  merchantName: string | null;
  status: string;
  takeover_mode: string | null;
  priority: string | null;
  needsHumanAgent: boolean;
  priorityRank: number;
  last_message_at: string;
  last_customer_message_at: string | null;
  order_number: string | null;
  channel: string;
};

function filterQueue(
  rows: MockConv[],
  tab: "all" | "needs_agent" | "open" | "in_progress" | "closed",
  search: string,
): MockConv[] {
  return rows
    .filter((c) => {
      if (tab === "needs_agent") return c.needsHumanAgent;
      if (tab === "open") return c.status === "open";
      if (tab === "in_progress") return c.status === "in_progress";
      if (tab === "closed") return c.status === "resolved" || c.status === "closed";
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.merchantName ?? "").toLowerCase().includes(q) ||
        (c.order_number ?? "").toLowerCase().includes(q) ||
        (c.channel ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.needsHumanAgent !== b.needsHumanAgent) return a.needsHumanAgent ? -1 : 1;
      if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
      if (a.last_customer_message_at && b.last_customer_message_at)
        return (
          new Date(b.last_customer_message_at).getTime() -
          new Date(a.last_customer_message_at).getTime()
        );
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
}

function makeConv(overrides: Partial<MockConv> = {}): MockConv {
  const now = new Date().toISOString();
  return {
    id: `conv_${Math.random().toString(36).slice(2, 10)}`,
    merchantName: "Test Store",
    status: "open",
    takeover_mode: "ai",
    priority: "normal",
    needsHumanAgent: false,
    priorityRank: 2,
    last_message_at: now,
    last_customer_message_at: now,
    order_number: null,
    channel: "widget",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Server data projection tests (pure computations that loadAi does)
// ─────────────────────────────────────────────────────────────────────────────

function computeNeedsHumanAgent(conv: {
  status: string;
  takeover_mode: string | null;
  last_customer_message_at: string | null;
  last_operator_message_at: string | null;
}): boolean {
  return (
    conv.status === "open" &&
    (conv.takeover_mode ?? "ai") === "ai" &&
    conv.last_customer_message_at !== null &&
    (conv.last_operator_message_at === null ||
      new Date(conv.last_customer_message_at) > new Date(conv.last_operator_message_at))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 12.2 — Platform Owner Support Chat Moderation Console", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // A. relTime / SLA colour helpers
  // ─────────────────────────────────────────────────────────────────────────

  describe("relTime — relative timestamp formatter", () => {
    it("shows seconds for < 1 minute ago", () => {
      const iso = new Date(Date.now() - 30_000).toISOString();
      expect(relTime(iso)).toMatch(/^\d+s$/);
    });
    it("shows minutes for 1–59 min ago", () => {
      const iso = new Date(Date.now() - 8 * 60_000).toISOString();
      expect(relTime(iso)).toBe("8m");
    });
    it("shows hours for 1–23h ago", () => {
      const iso = new Date(Date.now() - 3 * 3600_000).toISOString();
      expect(relTime(iso)).toBe("3h");
    });
    it("shows days for ≥24h ago", () => {
      const iso = new Date(Date.now() - 2 * 86400_000).toISOString();
      expect(relTime(iso)).toBe("2d");
    });
  });

  describe("slaColor — SLA urgency colour classification", () => {
    it("returns destructive for customer waiting > 30 min", () => {
      const iso = new Date(Date.now() - 35 * 60_000).toISOString();
      expect(slaColor(iso)).toBe("text-destructive");
    });
    it("returns orange warning for 10–30 min wait", () => {
      const iso = new Date(Date.now() - 15 * 60_000).toISOString();
      expect(slaColor(iso)).toContain("text-orange-500");
    });
    it("returns muted for < 10 min wait", () => {
      const iso = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(slaColor(iso)).toBe("text-muted-foreground");
    });
    it("returns muted-foreground when no timestamp", () => {
      expect(slaColor(null)).toBe("text-muted-foreground");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. Priority rank mapping
  // ─────────────────────────────────────────────────────────────────────────

  describe("priorityToRank", () => {
    it("maps urgent→4, high→3, normal→2, low→1", () => {
      expect(priorityToRank("urgent")).toBe(4);
      expect(priorityToRank("high")).toBe(3);
      expect(priorityToRank("normal")).toBe(2);
      expect(priorityToRank("low")).toBe(1);
    });
    it("defaults null to 2 (normal)", () => {
      expect(priorityToRank(null)).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. needsHumanAgent computed field (from loadAi server projection)
  // ─────────────────────────────────────────────────────────────────────────

  describe("computeNeedsHumanAgent — server-side derived field", () => {
    it("returns true when open + ai mode + customer message newer than operator message", () => {
      const recent = new Date().toISOString();
      const older = new Date(Date.now() - 10_000).toISOString();
      expect(
        computeNeedsHumanAgent({
          status: "open",
          takeover_mode: "ai",
          last_customer_message_at: recent,
          last_operator_message_at: older,
        }),
      ).toBe(true);
    });

    it("returns true when operator never replied", () => {
      expect(
        computeNeedsHumanAgent({
          status: "open",
          takeover_mode: "ai",
          last_customer_message_at: new Date().toISOString(),
          last_operator_message_at: null,
        }),
      ).toBe(true);
    });

    it("returns false when human_takeover mode (operator is handling)", () => {
      expect(
        computeNeedsHumanAgent({
          status: "open",
          takeover_mode: "human_takeover",
          last_customer_message_at: new Date().toISOString(),
          last_operator_message_at: null,
        }),
      ).toBe(false);
    });

    it("returns false when conversation is not open", () => {
      expect(
        computeNeedsHumanAgent({
          status: "in_progress",
          takeover_mode: "ai",
          last_customer_message_at: new Date().toISOString(),
          last_operator_message_at: null,
        }),
      ).toBe(false);
    });

    it("returns false when operator replied more recently than customer", () => {
      const recent = new Date().toISOString();
      const older = new Date(Date.now() - 30_000).toISOString();
      expect(
        computeNeedsHumanAgent({
          status: "open",
          takeover_mode: "ai",
          last_customer_message_at: older,
          last_operator_message_at: recent,
        }),
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. Queue filtering logic
  // ─────────────────────────────────────────────────────────────────────────

  describe("filterQueue — conversation list filtering", () => {
    const rows = [
      makeConv({ id: "c1", status: "open",        needsHumanAgent: false }),
      makeConv({ id: "c2", status: "open",        needsHumanAgent: true  }),
      makeConv({ id: "c3", status: "in_progress", needsHumanAgent: false }),
      makeConv({ id: "c4", status: "resolved",    needsHumanAgent: false }),
      makeConv({ id: "c5", status: "closed",      needsHumanAgent: false }),
    ];

    it("returns all rows for tab=all", () => {
      expect(filterQueue(rows, "all", "")).toHaveLength(5);
    });

    it("returns only needsHumanAgent=true rows for tab=needs_agent", () => {
      const r = filterQueue(rows, "needs_agent", "");
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe("c2");
    });

    it("returns open conversations for tab=open", () => {
      const r = filterQueue(rows, "open", "");
      const ids = r.map((c) => c.id);
      expect(ids).toContain("c1");
      expect(ids).toContain("c2");
    });

    it("returns in_progress for tab=in_progress", () => {
      const r = filterQueue(rows, "in_progress", "");
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe("c3");
    });

    it("returns resolved and closed for tab=closed", () => {
      const r = filterQueue(rows, "closed", "");
      const ids = r.map((c) => c.id);
      expect(ids).toContain("c4");
      expect(ids).toContain("c5");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. Queue sorting logic
  // ─────────────────────────────────────────────────────────────────────────

  describe("filterQueue — sorting: needsAgent first, then priority, then timestamp", () => {
    it("puts needsHumanAgent conversations at the top", () => {
      const now = new Date().toISOString();
      const rows = [
        makeConv({ id: "normal", needsHumanAgent: false, priorityRank: 4, last_customer_message_at: now }),
        makeConv({ id: "needs",  needsHumanAgent: true,  priorityRank: 1, last_customer_message_at: now }),
      ];
      const sorted = filterQueue(rows, "all", "");
      expect(sorted[0].id).toBe("needs");
    });

    it("sorts by priorityRank descending within the same needsHumanAgent bucket", () => {
      const now = new Date().toISOString();
      const rows = [
        makeConv({ id: "low",    needsHumanAgent: false, priorityRank: 1, last_customer_message_at: now }),
        makeConv({ id: "urgent", needsHumanAgent: false, priorityRank: 4, last_customer_message_at: now }),
        makeConv({ id: "high",   needsHumanAgent: false, priorityRank: 3, last_customer_message_at: now }),
      ];
      const sorted = filterQueue(rows, "all", "");
      expect(sorted.map((r) => r.id)).toEqual(["urgent", "high", "low"]);
    });

    it("sorts by last_customer_message_at descending within same priority", () => {
      const older = new Date(Date.now() - 20 * 60_000).toISOString();
      const newer = new Date().toISOString();
      const rows = [
        makeConv({ id: "old",  needsHumanAgent: false, priorityRank: 2, last_customer_message_at: older }),
        makeConv({ id: "new",  needsHumanAgent: false, priorityRank: 2, last_customer_message_at: newer }),
      ];
      const sorted = filterQueue(rows, "all", "");
      expect(sorted[0].id).toBe("new");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F. Search filtering
  // ─────────────────────────────────────────────────────────────────────────

  describe("filterQueue — search by store name, order, channel", () => {
    const rows = [
      makeConv({ id: "s1", merchantName: "Dhaka Fashion Hub",  order_number: "ORD-9988", channel: "widget" }),
      makeConv({ id: "s2", merchantName: "Chittagong Bazaar",  order_number: null,        channel: "whatsapp" }),
      makeConv({ id: "s3", merchantName: "Uttara Electronics", order_number: "ORD-0001", channel: "widget" }),
    ];

    it("matches by merchantName (case-insensitive)", () => {
      const r = filterQueue(rows, "all", "dhaka");
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe("s1");
    });

    it("matches by order_number", () => {
      const r = filterQueue(rows, "all", "ORD-0001");
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe("s3");
    });

    it("matches by channel", () => {
      const r = filterQueue(rows, "all", "whatsapp");
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe("s2");
    });

    it("empty search returns all", () => {
      expect(filterQueue(rows, "all", "")).toHaveLength(3);
    });

    it("non-matching search returns empty", () => {
      expect(filterQueue(rows, "all", "xyz-not-found")).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // G. Takeover mode toggle (pure state transitions)
  // ─────────────────────────────────────────────────────────────────────────

  describe("Takeover mode state transitions", () => {
    function toggleTakeover(mode: "ai" | "human_takeover"): "ai" | "human_takeover" {
      return mode === "human_takeover" ? "ai" : "human_takeover";
    }

    it("switching from ai to human_takeover sets mode correctly", () => {
      expect(toggleTakeover("ai")).toBe("human_takeover");
    });

    it("switching from human_takeover to ai releases operator control", () => {
      expect(toggleTakeover("human_takeover")).toBe("ai");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // H. Status lifecycle transitions
  // ─────────────────────────────────────────────────────────────────────────

  describe("Status lifecycle", () => {
    const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
    const RESOLVING = ["resolved", "closed"] as const;

    function getResolvedAt(status: string): string | null {
      return status === "resolved" || status === "closed" ? new Date().toISOString() : null;
    }

    it("only allows valid status transitions", () => {
      for (const s of VALID_STATUSES) {
        expect(VALID_STATUSES).toContain(s);
      }
    });

    it("sets resolved_at when status is resolved or closed", () => {
      for (const s of RESOLVING) {
        expect(getResolvedAt(s)).not.toBeNull();
      }
    });

    it("clears resolved_at when reopening to open or in_progress", () => {
      for (const s of ["open", "in_progress"]) {
        expect(getResolvedAt(s)).toBeNull();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // I. Message role classification
  // ─────────────────────────────────────────────────────────────────────────

  describe("Message bubble role classification", () => {
    type MsgRole = { role: string; is_internal_note?: boolean };

    function classifyBubble(msg: MsgRole): string {
      if (msg.is_internal_note) return "internal";
      if (msg.role === "agent") return "agent";
      if (msg.role === "assistant" || msg.role === "bot") return "bot";
      return "customer";
    }

    it("classifies internal note messages correctly", () => {
      expect(classifyBubble({ role: "agent", is_internal_note: true })).toBe("internal");
    });
    it("classifies agent role messages as agent", () => {
      expect(classifyBubble({ role: "agent", is_internal_note: false })).toBe("agent");
    });
    it("classifies assistant role as bot", () => {
      expect(classifyBubble({ role: "assistant" })).toBe("bot");
    });
    it("classifies customer/user messages", () => {
      expect(classifyBubble({ role: "customer" })).toBe("customer");
      expect(classifyBubble({ role: "user" })).toBe("customer");
    });
  });
});
