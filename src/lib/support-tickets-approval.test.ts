/**
 * TODO-7 — pending_approval state + operator confirm path.
 *
 * Sensitive side-effects (refunds, high-sensitivity PII disclosure) must not
 * fire autonomously: they land in `pending_approval` and wait for an operator
 * decision. The plain auto-ticket flow keeps opening tickets directly.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  approvalAdvisory,
  confirmPendingTicket,
  createTicket,
  needsApprovalReview,
  TicketError,
} from "./support-tickets.server";
import { resetRateLimitCircuitBreaker } from "./rate-limit.server";
import { fakeDb } from "./__fixtures__/fake-db";

const MERCHANT = "11111111-1111-4111-8111-111111111111";
const TICKET = "22222222-2222-4222-8222-222222222222";

function ticketDb(status: string) {
  resetRateLimitCircuitBreaker();
  return fakeDb({
    tables: {
      support_tickets: [
        {
          id: TICKET,
          merchant_id: MERCHANT,
          status,
          priority: "high",
          order_number: "ORD-1002",
        },
      ],
      support_ticket_events: [],
    },
  });
}

describe("needsApprovalReview — sensitive side-effect screen", () => {
  it("flags English refund intent", () => {
    const r = needsApprovalReview({
      subject: "I want a refund for order #1002",
      body: "Please process it fast",
    });
    expect(r.required).toBe(true);
    expect(r.signals).toContain("refund_intent");
  });

  it("flags Bengali refund intent", () => {
    const r = needsApprovalReview({
      subject: "রিফান্ড চাই",
      body: "অর্ডার #1002 এর টাকা ফেরত দিন",
    });
    expect(r.required).toBe(true);
    expect(r.signals).toContain("refund_intent");
  });

  it("flags chargeback / dispute / reimburse wording", () => {
    for (const subject of [
      "I will do a chargeback",
      "Opening a dispute with my bank",
      "Please reimburse my bKash",
    ]) {
      expect(needsApprovalReview({ subject }).required).toBe(true);
    }
  });

  it("flags high-sensitivity PII disclosure (NID / card / PIN / passport)", () => {
    expect(
      needsApprovalReview({ body: "My NID is 1234567890123, see attached." })
        .required,
    ).toBe(true);
    expect(
      needsApprovalReview({ body: "Card 4111111111111111 expired last week." })
        .required,
    ).toBe(true);
    expect(
      needsApprovalReview({ body: "bKash PIN 54321 for verification." })
        .required,
    ).toBe(true);
    expect(
      needsApprovalReview({ body: "Passport AB1234567 attached." }).signals,
    ).toContain("sensitive_pii");
  });

  it("does NOT flag plain requests or ordinary contact info", () => {
    expect(
      needsApprovalReview({
        subject: "Where is my order?",
        body: "Order ORD-55 placed yesterday, no update yet.",
      }).required,
    ).toBe(false);
    // Phone / email alone are normal ticket content, not a disclosure.
    expect(
      needsApprovalReview({ body: "Call me back on 01712345678 please." })
        .required,
    ).toBe(false);
    expect(
      needsApprovalReview({ body: "My email is ayesha@example.com." }).required,
    ).toBe(false);
  });
});

describe("createTicket — approval-aware creation", () => {
  it("still opens plain tickets directly (existing auto flow)", async () => {
    const t = await createTicket({
      merchantId: MERCHANT,
      subject: "Where is my order?",
      body: "No update yet.",
    });
    expect(t.status).toBe("open");
  });

  it("holds sensitive tickets in pending_approval", async () => {
    const t = await createTicket({
      merchantId: MERCHANT,
      subject: "Refund for order #1002",
      body: "Please refund my order.",
      priority: "high",
      requiresApproval: true,
      reason: "support.sensitive_side_effect_review",
    });
    expect(t.status).toBe("pending_approval");
    expect(t.priority).toBe("high");
  });

  it("caps subject / body lengths even on the approval path", async () => {
    const t = await createTicket({
      merchantId: MERCHANT,
      subject: "x".repeat(500),
      body: "y".repeat(9000),
      requiresApproval: true,
    });
    expect(t.status).toBe("pending_approval");
    expect(t.subject.length).toBeLessThanOrEqual(180);
  });
});

describe("confirmPendingTicket — operator confirm path", () => {
  it("approve moves pending_approval → open with an audit row", async () => {
    const db = ticketDb("pending_approval");
    const res = await confirmPendingTicket(db.asClient(), MERCHANT, "op_1", {
      ticketId: TICKET,
      decision: "approve",
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("open");
    expect(res.previousStatus).toBe("pending_approval");

    const ticket = db.rows("support_tickets")[0];
    expect(ticket.status).toBe("open");

    const events = db.rows("support_ticket_events");
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("approved");
    expect(events[0].before).toEqual({ status: "pending_approval" });
    expect(events[0].after).toEqual({ status: "open" });
    expect(events[0].actor_id).toBe("op_1");
    expect(events[0].reason).toBe("support.operator_confirm");
  });

  it("reject moves pending_approval → closed with a note", async () => {
    const db = ticketDb("pending_approval");
    const res = await confirmPendingTicket(db.asClient(), MERCHANT, "op_2", {
      ticketId: TICKET,
      decision: "reject",
      note: "Duplicate of T-41.",
    });
    expect(res.status).toBe("closed");
    expect(db.rows("support_ticket_events")[0].action).toBe("rejected");
    expect(db.rows("support_ticket_events")[0].reason).toBe(
      "Duplicate of T-41.",
    );
  });

  it("refuses tickets from another merchant (tenant isolation)", async () => {
    const db = ticketDb("pending_approval");
    await expect(
      confirmPendingTicket(db.asClient(), "other-merchant", "op_1", {
        ticketId: TICKET,
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "ticket_not_found" });
    expect(db.rows("support_tickets")[0].status).toBe("pending_approval");
  });

  it("refuses tickets that are not awaiting approval (no bypass / double-apply)", async () => {
    for (const status of ["open", "pending", "resolved", "closed"]) {
      const db = ticketDb(status);
      await expect(
        confirmPendingTicket(db.asClient(), MERCHANT, "op_1", {
          ticketId: TICKET,
          decision: "approve",
        }),
      ).rejects.toMatchObject({ code: "ticket_not_pending_approval" });
      expect(db.rows("support_tickets")[0].status).toBe(status);
      expect(db.rows("support_ticket_events")).toHaveLength(0);
    }
  });

  it("rejects unknown tickets", async () => {
    const db = ticketDb("pending_approval");
    const err = await confirmPendingTicket(db.asClient(), MERCHANT, "op_1", {
      ticketId: "33333333-3333-4333-8333-333333333333",
      decision: "approve",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TicketError);
    expect(err.code).toBe("ticket_not_found");
  });
});

describe("approvalAdvisory — shared guardrail refund copy", () => {
  it("renders the advisory EN template with ticket + order refs", async () => {
    const { ADVISORY_REFUND_TEMPLATE_EN } = await import(
      "./support-guardrails"
    );
    const out = approvalAdvisory("#TKT-ABC123", "1002", "en");
    expect(out).toBe(
      ADVISORY_REFUND_TEMPLATE_EN.split("{{ticketId}}").join("#TKT-ABC123")
        .split("{{orderNumber}}")
        .join("1002"),
    );
    expect(out).toContain("no refund has been issued yet");
  });

  it("renders the advisory BN template", async () => {
    const out = approvalAdvisory("#TKT-ABC123", "1002", "bn");
    expect(out).toContain("#TKT-ABC123");
    expect(out).toContain("1002");
    expect(out).not.toContain("{{");
  });
});
