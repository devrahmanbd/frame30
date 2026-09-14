import { describe, expect, it } from "vitest";
import {
  backupHealth,
  canTransition,
  dlqSeverity,
  dlqSummary,
  overallStatus,
  scrubPayload,
  scrubText,
} from "./ops";

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();

describe("pii scrubbing", () => {
  it("masks emails, phones and tokens in free text", () => {
    const out = scrubText("contact rafi@example.com on 01712345678 with eyJabcdefgh.ijklmnopq");
    expect(out).not.toMatch(/example\.com/);
    expect(out).not.toMatch(/01712345678/);
    expect(out).not.toMatch(/eyJabcdefgh/);
  });

  it("drops sensitive keys and recurses", () => {
    const out = scrubPayload({ email: "a@b.com", nested: { note: "call 01812345678" }, n: 5 }) as Record<string, unknown>;
    expect(out["email"]).toBe("[redacted]");
    expect(JSON.stringify(out["nested"])).not.toMatch(/01812345678/);
    expect(out["n"]).toBe(5);
  });

  it("never throws on odd input", () => {
    expect(() => scrubPayload(null)).not.toThrow();
    expect(scrubPayload(undefined)).toBeUndefined();
  });
});

describe("dead-letter triage", () => {
  it("escalates by age and attempts", () => {
    expect(dlqSeverity(iso(5), 0)).toBe("fresh");
    expect(dlqSeverity(iso(60), 0)).toBe("aging");
    expect(dlqSeverity(iso(400), 0)).toBe("stale");
    expect(dlqSeverity(iso(2000), 0)).toBe("critical");
    expect(dlqSeverity(iso(5), 5)).toBe("critical");
  });

  it("summarises by severity and source", () => {
    const s = dlqSummary([
      { id: "1", source: "payments", provider: "bkash", merchantId: null, merchantName: null, reason: null, status: "dead_letter", attempts: 0, receivedAt: iso(5) },
      { id: "2", source: "courier", provider: "pathao", merchantId: null, merchantName: null, reason: null, status: "dead_letter", attempts: 9, receivedAt: iso(10) },
    ]);
    expect(s.total).toBe(2);
    expect(s.bySeverity.critical).toBe(1);
    expect(s.bySource["courier"]).toBe(1);
  });
});

describe("incident lifecycle", () => {
  it("is forward-only and closes at resolved", () => {
    expect(canTransition("investigating", "identified")).toBe(true);
    expect(canTransition("identified", "investigating")).toBe(false);
    expect(canTransition("resolved", "monitoring")).toBe(false);
  });

  it("rolls status up to the worst component", () => {
    expect(overallStatus(["operational", "degraded", "major_outage"])).toBe("major_outage");
    expect(overallStatus(["operational", "operational"])).toBe("operational");
    expect(overallStatus([])).toBe("operational");
  });
});

describe("backup health", () => {
  it("flags stale backups and unverified drills", () => {
    const now = Date.now();
    const h = backupHealth(
      [
        { id: "a", kind: "backup", status: "passed", startedAt: new Date(now - 2 * 3600_000).toISOString(), finishedAt: null, rowsVerified: 0 },
        { id: "b", kind: "restore_drill", status: "passed", startedAt: new Date(now - 60 * 24 * 3600_000).toISOString(), finishedAt: null, rowsVerified: 100 },
      ],
      now,
    );
    expect(h.backupOk).toBe(true);
    expect(h.drillOk).toBe(false);
  });

  it("treats a missing backup as a breach", () => {
    const h = backupHealth([]);
    expect(h.backupOk).toBe(false);
    expect(h.drillOk).toBe(false);
  });
});
