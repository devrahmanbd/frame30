/**
 * Frame30 item 13 (extension versioning + recovery) — Pass 2: failure paths.
 *
 * Proves the recovery doctrine for unavailable widgets, failed updates and
 * revoked packages: content preserved, explicit recoverable state, NEVER a
 * silent substitution or an unapproved execution.
 */
import { describe, expect, it } from "vitest";
import {
  checkPinnedVersionTruth,
  migrateExtensionProps,
  resolveExtensionRecovery,
  type ExtensionRecoveryReason,
} from "./plugin-package";

const REASONS: ExtensionRecoveryReason[] = [
  "unknown",
  "disabled",
  "suspended",
  "incompatible",
  "uninstalled",
  "revoked",
  "update_failed",
];

describe("resolveExtensionRecovery", () => {
  it("maps every failure reason to an explicit placeholder (never a live widget)", () => {
    for (const reason of REASONS) {
      const state = resolveExtensionRecovery({
        widgetId: "plugin:acme/reviews",
        reason,
        preservedData: { title: "Kept" },
      });
      expect(state.status).toBe("placeholder");
      expect(state.widgetId).toBe("plugin:acme/reviews");
      expect(state.reason).toBe(reason);
      expect(state.message.length).toBeGreaterThan(0);
    }
  });

  it("never substitutes a different widget and never authorises execution", () => {
    for (const reason of REASONS) {
      const state = resolveExtensionRecovery({
        widgetId: "plugin:acme/reviews",
        reason,
        preservedData: { title: "Kept" },
        lastGoodVersion: "1.0.0",
      });
      expect(state.substituteWidget).toBeNull();
      expect(state.executeAllowed).toBe(false);
    }
  });

  it("preserves authored data by value (a cloned snapshot, not a live ref)", () => {
    const authored = { title: "Kept", nested: { limit: 3 } };
    const state = resolveExtensionRecovery({
      widgetId: "plugin:acme/reviews",
      reason: "uninstalled",
      preservedData: authored,
    });
    expect(state.preservedData).toEqual(authored);
    authored.nested.limit = 999;
    expect((state.preservedData.nested as { limit: number }).limit).toBe(3);
  });

  it("defaults hostile/missing data to an empty snapshot (never a crash)", () => {
    const state = resolveExtensionRecovery({
      widgetId: "plugin:acme/reviews",
      reason: "revoked",
      preservedData: "not-an-object",
    });
    expect(state.preservedData).toEqual({});
  });

  it("offers rollback only where the previous line is still approved", () => {
    const failed = resolveExtensionRecovery({
      widgetId: "plugin:acme/reviews",
      reason: "update_failed",
      lastGoodVersion: "1.0.0",
    });
    expect(failed.canRollbackTo).toBe("1.0.0");

    // Revoked/suspended must never roll back INTO the revoked line.
    for (const reason of ["revoked", "suspended", "uninstalled"] as const) {
      const state = resolveExtensionRecovery({
        widgetId: "plugin:acme/reviews",
        reason,
        lastGoodVersion: "1.0.0",
      });
      expect(state.canRollbackTo).toBeNull();
    }
  });

  it("retries only transient causes (unknown, failed update)", () => {
    expect(
      resolveExtensionRecovery({
        widgetId: "w",
        reason: "update_failed",
      }).canRetry,
    ).toBe(true);
    expect(
      resolveExtensionRecovery({ widgetId: "w", reason: "unknown" }).canRetry,
    ).toBe(true);
    for (const reason of [
      "revoked",
      "suspended",
      "uninstalled",
      "disabled",
      "incompatible",
    ] as const) {
      expect(resolveExtensionRecovery({ widgetId: "w", reason }).canRetry).toBe(
        false,
      );
    }
  });

  it("coerces hostile reasons/ids to explicit unknowns (total function)", () => {
    const state = resolveExtensionRecovery({
      widgetId: "",
      reason: "evil" as ExtensionRecoveryReason,
    });
    expect(state.reason).toBe("unknown");
    expect(state.status).toBe("placeholder");
    expect(state.substituteWidget).toBeNull();
  });
});

describe("checkPinnedVersionTruth", () => {
  it("accepts matching artifact and pinned versions", () => {
    expect(
      checkPinnedVersionTruth({
        artifactVersion: "1.1.0",
        pinnedVersion: "1.1.0",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts legacy rows with no pinned version", () => {
    expect(
      checkPinnedVersionTruth({
        artifactVersion: "1.1.0",
        pinnedVersion: null,
      }),
    ).toEqual({ ok: true });
  });

  it("flags a pinned/artifact mismatch as a version lie", () => {
    const verdict = checkPinnedVersionTruth({
      artifactVersion: "9.9.9",
      pinnedVersion: "1.1.0",
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("version_lie");
  });
});

describe("migrateExtensionProps (failure-path preservation)", () => {
  it("keeps raw authored values recoverable alongside the cleaned props", () => {
    const schema = [
      { key: "title", label: "Title", kind: "text", default: "Hi" },
    ];
    const stored = { title: "Kept", vanished: "still-here-in-spirit" };
    const out = migrateExtensionProps(schema, schema, stored);
    // Unknown keys are stripped from render props but named in `dropped`,
    // so the caller can keep the raw authored JSON for recovery.
    expect(out.props.title).toBe("Kept");
    expect(out.dropped).toContain("vanished");
  });
});
