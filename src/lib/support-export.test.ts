import { describe, expect, it } from "vitest";
import { exportConversationTranscript } from "./support-export";

describe("Omnichannel Support Transcript Export Engine", () => {
  const mockConv = {
    id: "991e4e20-3b2d-42bc-9d0b-980b1e428df1",
    merchant_id: "m-001",
    channel: "whatsapp",
    status: "resolved",
    priority: "high",
    takeover_mode: "human_takeover",
    order_number: "ORD-9912",
    created_at: "2026-09-10T09:00:00Z",
    resolved_at: "2026-09-10T09:45:00Z",
    operator_notes: "Customer was satisfied with the refund timeline.",
  };

  const mockMessages = [
    {
      id: "msg-101",
      role: "user",
      body: "Hello, my phone is +8801712345678 and email is test@customer.com. I want to cancel order.",
      created_at: "2026-09-10T09:00:00Z",
    },
    {
      id: "msg-102",
      role: "agent",
      body: "Flagged for manual fraud inspection.",
      created_at: "2026-09-10T09:05:00Z",
      is_internal_note: true,
      sent_by_operator_id: "op-1",
    },
    {
      id: "msg-103",
      role: "agent",
      body: "We have processed your cancellation request.",
      created_at: "2026-09-10T09:15:00Z",
      sent_by_operator_id: "op-1",
    },
  ];

  it("exports formatted Markdown transcript with metadata header", () => {
    const res = exportConversationTranscript(mockConv, mockMessages, "markdown", {
      redactPii: false,
      includeInternalNotes: true,
    });

    expect(res.contentType).toBe("text/markdown; charset=utf-8");
    expect(res.filename).toContain("transcript-991e4e20-3b2d-42bc-9d0b-980b1e428df1.md");
    expect(res.content).toContain("# Support Conversation Transcript");
    expect(res.content).toContain("**Channel:** whatsapp");
    expect(res.content).toContain("**Priority:** high");
    expect(res.content).toContain("🔒 **Internal Staff Note**");
    expect(res.content).toContain("test@customer.com");
  });

  it("exports JSONL transcript with JSON records per line", () => {
    const res = exportConversationTranscript(mockConv, mockMessages, "jsonl", {
      redactPii: false,
      includeInternalNotes: true,
    });

    expect(res.contentType).toBe("application/x-ndjson; charset=utf-8");
    expect(res.filename.endsWith(".jsonl")).toBe(true);

    const lines = res.content.trim().split("\n");
    expect(lines.length).toBe(3);

    const first = JSON.parse(lines[0]);
    expect(first.role).toBe("customer");
    expect(first.body).toContain("test@customer.com");

    const second = JSON.parse(lines[1]);
    expect(second.isInternalNote).toBe(true);
    expect(second.role).toBe("operator");
  });

  it("exports RFC 4180 compliant CSV transcript", () => {
    const res = exportConversationTranscript(mockConv, mockMessages, "csv", {
      redactPii: false,
      includeInternalNotes: true,
    });

    expect(res.contentType).toBe("text/csv; charset=utf-8");
    expect(res.filename.endsWith(".csv")).toBe(true);

    const lines = res.content.trim().split("\n");
    expect(lines.length).toBe(4); // 1 header + 3 rows
    expect(lines[0]).toBe("message_id,timestamp,role,is_internal_note,sender_id,body");
    expect(lines[1]).toContain("msg-101");
  });

  it("redacts sensitive PII (emails and phone numbers) when requested", () => {
    const res = exportConversationTranscript(mockConv, mockMessages, "markdown", {
      redactPii: true,
      includeInternalNotes: true,
    });

    expect(res.content).not.toContain("test@customer.com");
    expect(res.content).toContain("[email redacted]");
    expect(res.content).toContain("[phone redacted]");
  });

  it("filters out internal notes when includeInternalNotes is false", () => {
    const res = exportConversationTranscript(mockConv, mockMessages, "markdown", {
      includeInternalNotes: false,
    });

    expect(res.content).not.toContain("Flagged for manual fraud inspection");
    expect(res.content).toContain("We have processed your cancellation request");
  });
});
