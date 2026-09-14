import { describe, expect, it } from "vitest";
import {
  BACKUP_MANIFEST,
  buildSnapshot,
  checksumCounts,
  drillDue,
  drillNotes,
  evaluateDrill,
  nextDrillAt,
  totalRows,
} from "./backup-drill";

const full = () => BACKUP_MANIFEST.map((table, i) => ({ table, rows: (i + 1) * 10 }));
const snap = (counts = full(), at = "2026-01-01T00:00:00.000Z") => buildSnapshot("platform", counts, at);

describe("checksumCounts", () => {
  it("is order-independent and stable", () => {
    const a = checksumCounts([
      { table: "orders", rows: 4 },
      { table: "payments", rows: 9 },
    ]);
    const b = checksumCounts([
      { table: "payments", rows: 9 },
      { table: "orders", rows: 4 },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes when a single row count changes", () => {
    const a = checksumCounts([{ table: "orders", rows: 4 }]);
    const b = checksumCounts([{ table: "orders", rows: 5 }]);
    expect(a).not.toBe(b);
  });
});

describe("buildSnapshot", () => {
  it("normalises negatives and fractions, and totals rows", () => {
    const s = snap([
      { table: "orders", rows: -3 },
      { table: "payments", rows: 2.7 },
    ]);
    expect(s.counts).toEqual([
      { table: "orders", rows: 0 },
      { table: "payments", rows: 2 },
    ]);
    expect(totalRows(s)).toBe(2);
  });
});

describe("evaluateDrill — happy path", () => {
  it("passes an identical read-back with every check green", () => {
    const before = snap();
    const verdict = evaluateDrill(before, snap(full(), "2026-01-01T00:05:00.000Z"));
    expect(verdict.status).toBe("passed");
    expect(verdict.failures).toEqual([]);
    expect(verdict.rowsVerified).toBe(totalRows(before));
    expect(verdict.checks.every((c) => c.ok)).toBe(true);
  });

  it("tolerates small in-flight growth without failing", () => {
    const before = snap();
    const grown = full().map((c) => ({ ...c, rows: c.rows + 1 }));
    const verdict = evaluateDrill(before, snap(grown), { driftTolerance: 0.5 });
    expect(verdict.status).toBe("passed");
  });
});

describe("evaluateDrill — deny cases", () => {
  it("fails when a manifest table was never captured", () => {
    const partial = full().slice(0, 5);
    const verdict = evaluateDrill(snap(partial), snap(partial));
    expect(verdict.status).toBe("failed");
    expect(verdict.failures).toContain("manifest_coverage");
    expect(verdict.checks.find((c) => c.name === "manifest_coverage")?.detail).toContain("missing:");
  });

  it("fails on row loss even when the rest of the artifact is intact", () => {
    const after = full().map((c) => (c.table === "orders" ? { ...c, rows: c.rows - 1 } : c));
    const verdict = evaluateDrill(snap(), snap(after));
    expect(verdict.status).toBe("failed");
    expect(verdict.failures).toContain("row_counts");
    expect(verdict.checks.find((c) => c.name === "row_counts")?.detail).toContain("orders");
  });

  it("fails when a table disappears entirely after restore", () => {
    const after = full().filter((c) => c.table !== "payments");
    const verdict = evaluateDrill(snap(), snap(after));
    expect(verdict.status).toBe("failed");
    expect(verdict.failures).toContain("row_counts");
  });

  it("never passes an empty artifact", () => {
    const empty = BACKUP_MANIFEST.map((table) => ({ table, rows: 0 }));
    const verdict = evaluateDrill(snap(empty), snap(empty));
    expect(verdict.status).toBe("failed");
    expect(verdict.failures).toContain("rows_verified");
  });

  it("flags checksum drift as a warning, not a silent pass", () => {
    const after = full().map((c) => ({ ...c, rows: c.rows + 1 }));
    const verdict = evaluateDrill(snap(), snap(after), { driftTolerance: 1 });
    expect(verdict.status).toBe("passed");
    expect(verdict.checks.find((c) => c.name === "checksum")?.ok).toBe(false);
  });
});

describe("evaluateDrill — replay", () => {
  it("is deterministic: replaying the same pair yields the same verdict", () => {
    const before = snap();
    const after = snap(full().map((c) => (c.table === "refunds" ? { ...c, rows: 0 } : c)));
    const first = evaluateDrill(before, after);
    const second = evaluateDrill(before, after);
    expect(second).toEqual(first);
    expect(first.status).toBe("failed");
  });
});

describe("cadence", () => {
  const now = new Date("2026-01-02T00:00:00.000Z");

  it("is due when no drill ever passed or the timestamp is unusable", () => {
    expect(drillDue(null, now)).toBe(true);
    expect(drillDue("not-a-date", now)).toBe(true);
  });

  it("is due once the interval has elapsed and not before", () => {
    expect(drillDue("2026-01-01T00:00:00.000Z", now, 24)).toBe(true);
    expect(drillDue("2026-01-01T12:00:00.000Z", now, 24)).toBe(false);
  });

  it("reports the next due time", () => {
    expect(nextDrillAt("2026-01-01T00:00:00.000Z", 24)).toBe("2026-01-02T00:00:00.000Z");
    expect(nextDrillAt(null)).toBeNull();
  });
});

describe("audit trail", () => {
  it("renders every check into the ledger note, bounded and PII-free", () => {
    const verdict = evaluateDrill(snap(), snap(full().filter((c) => c.table !== "orders")));
    const notes = drillNotes(verdict);
    for (const check of verdict.checks) expect(notes).toContain(check.name);
    expect(notes).toContain("FAIL row_counts");
    expect(notes.length).toBeLessThanOrEqual(900);
  });
});
