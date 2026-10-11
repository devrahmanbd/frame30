/**
 * Bridge flood guard — TDD: a malicious frame must not be able to flood the
 * host with async work + setState per message (DoS), nor reuse a client-chosen
 * `id` to clobber in-flight replies. Pure state machine so it is unit-testable
 * under node (no jsdom); the `WidgetSandbox` host handler delegates to it.
 */
import { describe, expect, it } from "vitest";
import {
  BRIDGE_MAX_MESSAGES,
  BRIDGE_WINDOW_MS,
  checkFloodGuard,
  createFloodGuard,
  resetFloodGuard,
} from "./bridge-flood-guard";

describe("bridge flood guard", () => {
  it("allows up to 30 messages per rolling 10s window", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      expect(checkFloodGuard(g, `id-${i}`, 0)).toEqual({ ok: true });
    }
    expect(checkFloodGuard(g, "id-30", 0)).toEqual({
      ok: false,
      error: "sandbox.rate_limited",
    });
  });

  it("slides the window: old timestamps stop counting after 10s", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      expect(checkFloodGuard(g, `id-${i}`, 0).ok).toBe(true);
    }
    // At exactly the window edge the burst has aged out.
    expect(checkFloodGuard(g, "fresh", BRIDGE_WINDOW_MS)).toEqual({
      ok: true,
    });
  });

  it("rejects duplicate ids within the frame lifetime", () => {
    const g = createFloodGuard();
    expect(checkFloodGuard(g, "7", 0)).toEqual({ ok: true });
    expect(checkFloodGuard(g, "7", 1)).toEqual({
      ok: false,
      error: "sandbox.duplicate_id",
    });
  });

  it("does not spend rate budget on duplicates", () => {
    const g = createFloodGuard();
    expect(checkFloodGuard(g, "dup", 0).ok).toBe(true);
    for (let i = 0; i < 10; i++) {
      expect(checkFloodGuard(g, "dup", i + 1)).toEqual({
        ok: false,
        error: "sandbox.duplicate_id",
      });
    }
    // Only one slot consumed despite 11 arrivals sharing one id.
    for (let i = 0; i < BRIDGE_MAX_MESSAGES - 1; i++) {
      expect(checkFloodGuard(g, `other-${i}`, 20).ok).toBe(true);
    }
    expect(checkFloodGuard(g, "last", 20)).toEqual({
      ok: false,
      error: "sandbox.rate_limited",
    });
  });

  it("resets both ids and window on frame identity change", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      checkFloodGuard(g, `id-${i}`, 0);
    }
    expect(checkFloodGuard(g, "blocked", 0).ok).toBe(false);
    resetFloodGuard(g);
    expect(checkFloodGuard(g, "id-0", 0)).toEqual({ ok: true });
  });
});
