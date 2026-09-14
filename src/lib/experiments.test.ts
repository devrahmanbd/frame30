/**
 * Experiments — [A] assignment stability.
 *
 * The guarantee is that a subject's variant is decided by the database once and
 * never re-randomised client-side, and that a failing experiment degrades to
 * the control path rather than taking a storefront down.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { metricRecorder } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any, rpc: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./pricing.server", () => ({
  publicClient: () => ({ rpc: (fn: string, args: any) => rec.rpc(fn, args) }),
}));

const { assignVariant, recordConversion, CONTROL } = await import("./experiments.server");

const MERCHANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => recorder.reset());

describe("assignVariant", () => {
  it("returns the stored assignment and counts the outcome (audit)", async () => {
    rec.rpc = async () => ({
      data: { variant: "b", variant_id: "var-b", is_control: false, reason: "assigned" },
      error: null,
    });
    const result = await assignVariant(MERCHANT, "checkout_cta", "subject-1");
    expect(result.variant).toBe("b");
    expect(recorder.of("framique_experiment_assign_total", ["outcome", "assigned"])).toHaveLength(1);
  });

  it("is stable: repeated calls for one subject never re-randomise (replay)", async () => {
    // The DB persists the assignment; the server only reads it back. Even
    // across many calls the subject must see one variant.
    const assignments = new Map<string, string>();
    rec.rpc = async (_fn: string, args: any) => {
      const key = `${args._key}:${args._subject_key}`;
      if (!assignments.has(key)) assignments.set(key, assignments.size % 2 ? "b" : "a");
      return { data: { variant: assignments.get(key), reason: "assigned" }, error: null };
    };

    const seen = new Set<string | null>();
    for (let i = 0; i < 25; i += 1) {
      seen.add((await assignVariant(MERCHANT, "checkout_cta", "subject-1")).variant);
    }
    expect(seen.size).toBe(1);
  });

  it("passes the subject key through untouched so assignment cannot be spoofed by casing", async () => {
    const calls: any[] = [];
    rec.rpc = async (_fn: string, args: any) => {
      calls.push(args);
      return { data: { variant: "a", reason: "assigned" }, error: null };
    };
    await assignVariant(MERCHANT, "checkout_cta", "Subject-1");
    expect(calls[0]._subject_key).toBe("Subject-1");
    expect(calls[0]._merchant_id).toBe(MERCHANT);
  });

  it("degrades to the control path when the database errors (deny, never throws)", async () => {
    rec.rpc = async () => ({ data: null, error: { message: "boom" } });
    const result = await assignVariant(MERCHANT, "checkout_cta", "subject-1");
    expect(result).toEqual({ variant: null, reason: "unavailable" });
    expect(recorder.of("framique_experiment_assign_total", ["outcome", "unavailable"])).toHaveLength(1);
    expect(recorder.logs.some((l) => l.event === "experiment.assign_failed")).toBe(true);
  });

  it("treats a missing experiment as control rather than an error", async () => {
    rec.rpc = async () => ({ data: null, error: null });
    const result = await assignVariant(MERCHANT, "unknown_key", "subject-1");
    expect(result).toEqual(CONTROL);
  });
});

describe("recordConversion", () => {
  it("truncates the value to non-negative integer minor units (money guard)", async () => {
    const calls: any[] = [];
    rec.rpc = async (_fn: string, args: any) => {
      calls.push(args);
      return { data: true, error: null };
    };
    await recordConversion(MERCHANT, "checkout_cta", "subject-1", "purchase", 1999.7);
    await recordConversion(MERCHANT, "checkout_cta", "subject-1", "purchase", -50);
    expect(calls[0]._value_minor).toBe(1999);
    expect(calls[1]._value_minor).toBe(0);
  });

  it("returns false and counts a failure instead of throwing (deny)", async () => {
    rec.rpc = async () => ({ data: null, error: { message: "no assignment" } });
    const ok = await recordConversion(MERCHANT, "checkout_cta", "ghost", "purchase", 100);
    expect(ok).toBe(false);
    expect(recorder.of("framique_experiment_conversion_total", ["metric", "failed"])).toHaveLength(1);
  });
});
