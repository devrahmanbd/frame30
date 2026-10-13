/**
 * Fraud Shield — fourth official plugin (source-backed, free).
 *
 * RED phase (TDD): this suite is written before `src/lib/fraud-shield.ts`
 * exists. It drives the manifest ONLY through the real gates
 * (`parseManifest` / `gateExportManifest` / `validateBundle` /
 * `pkg1PluginValidator` / layout round-trip — never a reimplementation),
 * the registry (`OFFICIAL_PLUGIN_KEYS`, `officialPluginSource`,
 * `listOfficialPluginCatalog`, fingerprint, source-backed install), and a
 * unit matrix over the pure scorer (each signal fires / stays silent,
 * combined scores, review-vs-allow boundaries, cancel-never).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
type Recorder = ReturnType<typeof metricRecorder>;
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

import {
  gateExportManifest,
  exportPluginManifestZip,
  pkg1PluginValidator,
} from "./plugin-package";
import {
  parseManifest,
  satisfiesApiRange,
  BUILDER_API_VERSION,
  PLUGIN_BUDGET,
} from "./plugin-manifest";
import { validateBundle } from "./marketplace-scopes";
import {
  parseZip,
  extractPackageFiles,
  validatePackageLayout,
} from "./package-zip";
import {
  OFFICIAL_PLUGIN_KEYS,
  getOfficialPlugin,
  isOfficialPluginKey,
  officialPluginPinFor,
  officialPluginSource,
} from "./official-plugins";
import {
  installOfficialPlugin,
  listOfficialPluginCatalog,
  officialPluginFingerprint,
} from "./official-plugins.server";
import {
  FRAUD_SHIELD_MANIFEST,
  FRAUD_SHIELD_META,
  defaultFraudShieldParams,
  markOrderFlagged,
  resolveFraudShieldParams,
  scoreFraudShieldOrder,
  type FraudShieldOrderInput,
} from "./fraud-shield";

beforeEach(() => recorder.reset());

const T0 = "2026-10-01T10:00:00.000Z";
const minutesBefore = (n: number) =>
  new Date(Date.parse(T0) - n * 60_000).toISOString();

function cleanOrder(
  extra: Partial<FraudShieldOrderInput> = {},
): FraudShieldOrderInput {
  return {
    phone: "8801711111111",
    ip: "203.0.113.7",
    deviceId: "device-clean-1",
    paymentMethod: "bkash",
    amountMinorInt: 150_000,
    createdAt: T0,
    address: { division: "Dhaka", district: "Dhaka", thana: "Mirpur" },
    failedPayments: 0,
    previousOrderCount: 4,
    history: [],
    ...extra,
  };
}

/* ------------------------------------------------- manifest gates (real) */

describe("fraud-shield manifest passes the real gates", () => {
  it("parseManifest accepts it with zero errors and zero warnings", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    expect(verdict.warnings).toEqual([]);
    expect(verdict.manifest.id).toBe("fraud-shield");
    expect(verdict.manifest.version).toBe("1.0.0");
  });

  it("is versioned and builder-API compatible", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    expect(verdict.manifest.api).toBe("^3.0.0");
    expect(satisfiesApiRange(verdict.manifest.api, BUILDER_API_VERSION)).toBe(
      true,
    );
  });

  it("permissions are read-only detector scopes — no write, no PII, no secrets", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    // order-read (the order.created hook gate demands read_orders) +
    // read-only storefront data. Sorted (gate-normalized) order.
    expect(verdict.manifest.permissions).toEqual(["read_orders", "read_shop"]);
    for (const scope of verdict.manifest.permissions) {
      expect(scope).not.toMatch(/^write_/);
    }
    expect(verdict.manifest.permissions).not.toContain("read_customers");
    expect(verdict.manifest.permissions).not.toContain("render_storefront");
    expect(verdict.manifest.permissions).not.toContain("replace_menus");
  });

  it("declares no hooks and no widgets — pure in-repo scorer, no egress", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    // SERVER_HOOKS has no order.flagged (inventing it fails the gate) and
    // any hooks[] entry mandates a public-https hooksUrl egress target, so
    // the order.created / order.flagged surface lives as pure handlers.
    expect(verdict.manifest.hooks).toEqual([]);
    expect(verdict.manifest.widgets).toEqual([]);
    expect(verdict.manifest.hooksUrl).toBeUndefined();
  });

  it("ships typed settings with full EN+BN copy", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    expect(verdict.manifest.settings.length).toBeGreaterThanOrEqual(5);
    for (const key of Object.keys(verdict.manifest.i18n.en)) {
      expect(verdict.manifest.i18n.bn[key]).toBeTruthy();
    }
    expect(Object.keys(verdict.manifest.i18n.bn).length).toBeGreaterThan(0);
  });

  it("stays within the per-plugin resource budget", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    expect(verdict.manifest.budget.jsKb).toBeLessThanOrEqual(
      PLUGIN_BUDGET.jsKb,
    );
    expect(verdict.manifest.budget.mainThreadMs).toBeLessThanOrEqual(
      PLUGIN_BUDGET.mainThreadMs,
    );
  });

  it("gateExportManifest + validateBundle + validator seam + ZIP round-trip", () => {
    const gated = gateExportManifest(FRAUD_SHIELD_MANIFEST);
    expect(gated.id).toBe("fraud-shield");
    expect(validateBundle(gated, gated.permissions).ok).toBe(true);
    const seam = pkg1PluginValidator(FRAUD_SHIELD_MANIFEST, "plugin");
    expect(seam.ok).toBe(true);
    if (seam.ok) expect(seam.manifest.slug).toBe("fraud-shield");
    const bytes = exportPluginManifestZip(FRAUD_SHIELD_MANIFEST);
    const layout = validatePackageLayout(
      extractPackageFiles(bytes, parseZip(bytes)),
      "plugin",
    );
    expect(parseManifest(layout.manifest).ok).toBe(true);
  });

  it("scorer defaults mirror the manifest settings defaults (no drift)", () => {
    const verdict = parseManifest(FRAUD_SHIELD_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fraud-shield manifest rejected");
    const fromManifest = Object.fromEntries(
      verdict.manifest.settings.map((s) => [s.key, s.default]),
    );
    const params = defaultFraudShieldParams();
    expect(fromManifest["velocity_window_minutes"]).toBe(
      params.velocityWindowMinutes,
    );
    expect(fromManifest["velocity_max_orders"]).toBe(params.velocityMaxOrders);
    expect(fromManifest["cod_max_minor_int"]).toBe(params.codMaxMinorInt);
    expect(fromManifest["high_value_minor_int"]).toBe(params.highValueMinorInt);
    expect(fromManifest["failed_payments_max"]).toBe(params.failedPaymentsMax);
    expect(fromManifest["review_threshold"]).toBe(params.reviewThreshold);
  });
});

/* ------------------------------------------------- registry + install */

describe("fraud-shield registry + source-backed install", () => {
  it("is listed as an official key with Framique provenance", () => {
    expect(OFFICIAL_PLUGIN_KEYS).toContain("fraud-shield");
    expect(isOfficialPluginKey("fraud-shield")).toBe(true);
    expect(officialPluginPinFor("fraud-shield")).toBe("official:fraud-shield");
    const source = officialPluginSource("fraud-shield")!;
    expect(source.key).toBe("fraud-shield");
    expect(source.author).toBe("Framique");
    expect(source.category).toBe("security");
    expect((source.manifest as { id: string }).id).toBe("fraud-shield");
    expect(getOfficialPlugin("fraud-shield")!.key).toBe("fraud-shield");
  });

  it("carries merchant-facing EN+BN copy like the other builtins", () => {
    expect(FRAUD_SHIELD_META.nameEn).toBeTruthy();
    expect(FRAUD_SHIELD_META.nameBn).toBeTruthy();
    expect(FRAUD_SHIELD_META.nameBn).not.toBe(FRAUD_SHIELD_META.nameEn);
    expect(FRAUD_SHIELD_META.summaryEn).toBeTruthy();
    expect(FRAUD_SHIELD_META.summaryBn).toBeTruthy();
    expect(FRAUD_SHIELD_META.summaryBn).not.toBe(FRAUD_SHIELD_META.summaryEn);
    const source = officialPluginSource("fraud-shield")!;
    expect(source.nameEn).toBe(FRAUD_SHIELD_META.nameEn);
    expect(source.nameBn).toBe(FRAUD_SHIELD_META.nameBn);
  });

  it("source fingerprint is stable and 64-hex", () => {
    const source = officialPluginSource("fraud-shield")!;
    const a = officialPluginFingerprint(source.manifest);
    const b = officialPluginFingerprint(source.manifest);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    // Construction-order independent (stable serialization).
    const shuffled = Object.fromEntries(
      Object.entries(source.manifest as Record<string, unknown>).reverse(),
    );
    expect(officialPluginFingerprint(shuffled)).toBe(a);
  });

  it("appears in the official catalogue with a fingerprint ref, no bytes", async () => {
    const entries = await listOfficialPluginCatalog();
    const found = entries.find((e) => e.row.key === "fraud-shield")!;
    expect(found).toBeTruthy();
    expect(found.row.provenance).toBe("official");
    expect(found.row.artifact.pinned).toBe("official:fraud-shield");
    expect(found.row.artifact.checksum).toBe(
      officialPluginFingerprint(officialPluginSource("fraud-shield")!.manifest),
    );
    expect(found).not.toHaveProperty("bytes");
    expect(() => JSON.parse(JSON.stringify(found.row))).not.toThrow();
  });

  it("installs from source: ledger pin + host row + audit, zero asset rows", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [],
        theme_audit: [],
        plugin_state: [],
        plugin_kill_switch: [],
        activity_log: [],
      },
    });
    const merchant = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const out = await installOfficialPlugin(
      db.asClient(),
      merchant,
      "fraud-shield",
      "99999999-9999-4999-8999-999999999999",
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(out.version).toBe("1.0.0");
    expect(out.artifactId).toMatch(/^[a-f0-9]{64}$/);
    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "widget",
      listing_slug: "fraud-shield",
      status: "installed",
      artifact_checksum: out.artifactId,
      artifact_pinned: "official:fraud-shield",
      idempotency_key: `official:${merchant}:fraud-shield`,
    });
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(
      db.rows("theme_audit").filter((r) => r.action === "package.installed"),
    ).toHaveLength(1);
    const projected = db.rows("plugin_state");
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ plugin_id: "fraud-shield" });
    // Replay is idempotent.
    const second = await installOfficialPlugin(
      db.asClient(),
      merchant,
      "fraud-shield",
    );
    expect(second.alreadyInstalled).toBe(true);
    expect(second.packageId).toBe(out.packageId);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

/* ------------------------------------------------- scorer matrix */

describe("fraud-shield scorer (order.created entry)", () => {
  it("a clean order scores 0 with no reasons and is allowed", () => {
    const out = scoreFraudShieldOrder(cleanOrder());
    expect(out).toEqual({ score: 0, reasons: [], action: "allow" });
  });

  it("velocity: repeated orders from the same phone inside the window fire", () => {
    const history = [10, 20, 30].map((m) => ({
      phone: "8801711111111",
      createdAt: minutesBefore(m),
    }));
    const out = scoreFraudShieldOrder(cleanOrder({ history }));
    const velocity = out.reasons.find(
      (r) => r.signal === "fraud.signal.velocity",
    )!;
    expect(velocity).toBeTruthy();
    expect(velocity.observed).toBe(3);
    expect(velocity.detail).toBe("3 orders in the last hour");
    expect(out.action).toBe("review");
  });

  it("velocity: below the limit, stale, or unrelated identities stay silent", () => {
    const params = defaultFraudShieldParams();
    // Only 2 recent — below the default limit of 3.
    const below = scoreFraudShieldOrder(
      cleanOrder({
        history: [10, 20].map((m) => ({
          phone: "8801711111111",
          createdAt: minutesBefore(m),
        })),
      }),
      params,
    );
    expect(
      below.reasons.some((r) => r.signal === "fraud.signal.velocity"),
    ).toBe(false);
    // 3 orders but outside the 60-minute window.
    const stale = scoreFraudShieldOrder(
      cleanOrder({
        history: [70, 80, 90].map((m) => ({
          phone: "8801711111111",
          createdAt: minutesBefore(m),
        })),
      }),
      params,
    );
    expect(
      stale.reasons.some((r) => r.signal === "fraud.signal.velocity"),
    ).toBe(false);
    // 3 recent orders from a stranger phone/IP/device.
    const stranger = scoreFraudShieldOrder(
      cleanOrder({
        history: [10, 20, 30].map((m) => ({
          phone: "8801799999999",
          ip: "198.51.100.9",
          deviceId: "device-stranger",
          createdAt: minutesBefore(m),
        })),
      }),
      params,
    );
    expect(stranger).toEqual({ score: 0, reasons: [], action: "allow" });
  });

  it("velocity: matches on shared IP or shared device alone", () => {
    const byIp = scoreFraudShieldOrder(
      cleanOrder({
        phone: "8801700000001",
        deviceId: "device-other",
        history: [5, 15, 25].map((m) => ({
          phone: "8801700000002",
          ip: "203.0.113.7",
          deviceId: "device-elsewhere",
          createdAt: minutesBefore(m),
        })),
      }),
    );
    expect(byIp.reasons.some((r) => r.signal === "fraud.signal.velocity")).toBe(
      true,
    );
    const byDevice = scoreFraudShieldOrder(
      cleanOrder({
        phone: "8801700000001",
        ip: "192.0.2.1",
        history: [5, 15, 25].map((m) => ({
          phone: "8801700000003",
          ip: "192.0.2.2",
          deviceId: "device-clean-1",
          createdAt: minutesBefore(m),
        })),
      }),
    );
    expect(
      byDevice.reasons.some((r) => r.signal === "fraud.signal.velocity"),
    ).toBe(true);
  });

  it("velocity: the window is configurable", () => {
    const history = [30, 40, 50].map((m) => ({
      phone: "8801711111111",
      createdAt: minutesBefore(m),
    }));
    const narrow = scoreFraudShieldOrder(
      cleanOrder({ history }),
      resolveFraudShieldParams({
        velocityWindowMinutes: 10,
        velocityMaxOrders: 3,
      }),
    );
    expect(
      narrow.reasons.some((r) => r.signal === "fraud.signal.velocity"),
    ).toBe(false);
    const wide = scoreFraudShieldOrder(
      cleanOrder({ history }),
      resolveFraudShieldParams({
        velocityWindowMinutes: 60,
        velocityMaxOrders: 3,
      }),
    );
    expect(wide.reasons.some((r) => r.signal === "fraud.signal.velocity")).toBe(
      true,
    );
  });

  it("COD over limit fires only for COD above the ceiling", () => {
    const over = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "cod",
        amountMinorInt: 2_000_001,
        previousOrderCount: 4,
      }),
    );
    const signal = over.reasons.find(
      (r) => r.signal === "fraud.signal.cod_over_limit",
    )!;
    expect(signal).toBeTruthy();
    expect(signal.detail).toBe("Above the COD limit");
    expect(over.action).toBe("review");
    // Exactly at the ceiling is allowed.
    const atLimit = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "cod",
        amountMinorInt: 2_000_000,
        previousOrderCount: 4,
      }),
    );
    expect(
      atLimit.reasons.some((r) => r.signal === "fraud.signal.cod_over_limit"),
    ).toBe(false);
    // A large prepaid order is not a COD signal.
    const prepaid = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "bkash",
        amountMinorInt: 9_000_000,
        previousOrderCount: 4,
      }),
    );
    expect(
      prepaid.reasons.some((r) => r.signal === "fraud.signal.cod_over_limit"),
    ).toBe(false);
  });

  it("new-customer high-value fires only for first orders at/above the bar", () => {
    const fired = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "bkash",
        amountMinorInt: 5_000_000,
        previousOrderCount: 0,
      }),
    );
    expect(
      fired.reasons.some(
        (r) => r.signal === "fraud.signal.new_customer_high_value",
      ),
    ).toBe(true);
    expect(fired.action).toBe("review");
    // A returning customer with the same basket stays silent on this signal.
    const returning = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "bkash",
        amountMinorInt: 5_000_000,
        previousOrderCount: 2,
      }),
    );
    expect(returning).toEqual({ score: 0, reasons: [], action: "allow" });
    // A new customer with a small basket stays silent too.
    const small = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "bkash",
        amountMinorInt: 499_999,
        previousOrderCount: 0,
      }),
    );
    expect(
      small.reasons.some(
        (r) => r.signal === "fraud.signal.new_customer_high_value",
      ),
    ).toBe(false);
  });

  it("address quality requires structured division → district → thana", () => {
    // Complete address: silent.
    expect(
      scoreFraudShieldOrder(cleanOrder()).reasons.some(
        (r) => r.signal === "fraud.signal.address_quality",
      ),
    ).toBe(false);
    // Missing thana: fires and names the gap.
    const missing = scoreFraudShieldOrder(
      cleanOrder({
        address: { division: "Dhaka", district: "Dhaka", thana: "" },
      }),
    );
    const signal = missing.reasons.find(
      (r) => r.signal === "fraud.signal.address_quality",
    )!;
    expect(signal).toBeTruthy();
    expect(signal.detail).toContain("thana");
    // Weak evidence alone stays below the review bar but keeps its reason.
    expect(missing.score).toBeLessThan(
      defaultFraudShieldParams().reviewThreshold,
    );
    expect(missing.action).toBe("allow");
    expect(missing.reasons).toHaveLength(1);
    // No address at all: fires.
    const absent = scoreFraudShieldOrder(cleanOrder({ address: null }));
    expect(
      absent.reasons.some((r) => r.signal === "fraud.signal.address_quality"),
    ).toBe(true);
  });

  it("repeated failed payments fire at the limit with card-testing copy", () => {
    const fired = scoreFraudShieldOrder(cleanOrder({ failedPayments: 3 }));
    const signal = fired.reasons.find(
      (r) => r.signal === "fraud.signal.card_testing",
    )!;
    expect(signal).toBeTruthy();
    expect(signal.detail).toBe("3 failed payments");
    expect(fired.action).toBe("review");
    const below = scoreFraudShieldOrder(cleanOrder({ failedPayments: 2 }));
    expect(
      below.reasons.some((r) => r.signal === "fraud.signal.card_testing"),
    ).toBe(false);
  });

  it("combined signals add up and cap at 100", () => {
    const everything = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "cod",
        amountMinorInt: 9_000_000,
        previousOrderCount: 0,
        failedPayments: 5,
        address: null,
        history: [5, 10, 15].map((m) => ({
          phone: "8801711111111",
          createdAt: minutesBefore(m),
        })),
      }),
    );
    expect(everything.reasons).toHaveLength(5);
    // 40 + 45 + 35 + 30 + 20 = 170 → capped.
    expect(everything.score).toBe(100);
    expect(everything.action).toBe("review");
    const pair = scoreFraudShieldOrder(
      cleanOrder({
        paymentMethod: "cod",
        amountMinorInt: 2_000_001,
        previousOrderCount: 4,
        history: [5, 10, 15].map((m) => ({
          phone: "8801711111111",
          createdAt: minutesBefore(m),
        })),
      }),
    );
    // velocity (40) + COD over limit (30).
    expect(pair.score).toBe(70);
    expect(pair.action).toBe("review");
  });

  it("review-vs-allow boundary follows the configured threshold", () => {
    const order = cleanOrder({
      paymentMethod: "cod",
      amountMinorInt: 2_000_001,
      previousOrderCount: 4,
    });
    const base = scoreFraudShieldOrder(order);
    expect(base.score).toBe(30);
    // At the bar → held for review; one point higher → allowed.
    expect(
      scoreFraudShieldOrder(
        order,
        resolveFraudShieldParams({ reviewThreshold: 30 }),
      ).action,
    ).toBe("review");
    expect(
      scoreFraudShieldOrder(
        order,
        resolveFraudShieldParams({ reviewThreshold: 31 }),
      ).action,
    ).toBe("allow");
  });

  it("the scorer NEVER returns a silent cancel — worst case is review-hold", () => {
    const inputs: FraudShieldOrderInput[] = [
      cleanOrder(),
      cleanOrder({ phone: "", ip: "", deviceId: "" }),
      cleanOrder({
        paymentMethod: "cod",
        amountMinorInt: Number.MAX_SAFE_INTEGER,
        previousOrderCount: 0,
        failedPayments: 99,
        address: null,
        history: [1, 2, 3, 4, 5].map((m) => ({
          phone: "8801711111111",
          ip: "203.0.113.7",
          deviceId: "device-clean-1",
          createdAt: minutesBefore(m),
        })),
      }),
      cleanOrder({ createdAt: "not-a-date", amountMinorInt: NaN }),
    ];
    for (const input of inputs) {
      const out = scoreFraudShieldOrder(input);
      expect(out.action === "allow" || out.action === "review").toBe(true);
      expect(out.action).not.toBe("cancel");
      expect(out.action).not.toBe("block");
      expect(out.score).toBeGreaterThanOrEqual(0);
      expect(out.score).toBeLessThanOrEqual(100);
    }
    // Deterministic: same input, same output, no I/O inside the scorer.
    const a = scoreFraudShieldOrder(inputs[2]);
    const b = scoreFraudShieldOrder(inputs[2]);
    expect(a).toEqual(b);
  });

  it("resolveFraudShieldParams falls back per-field on bad input", () => {
    const defaults = defaultFraudShieldParams();
    expect(resolveFraudShieldParams()).toEqual(defaults);
    expect(
      resolveFraudShieldParams({
        velocityMaxOrders: 2,
        reviewThreshold: Number.NaN,
      }).velocityMaxOrders,
    ).toBe(2);
    expect(
      resolveFraudShieldParams({
        velocityMaxOrders: 2,
        reviewThreshold: Number.NaN,
      }).reviewThreshold,
    ).toBe(defaults.reviewThreshold);
  });
});

/* ------------------------------------------------- order.flagged marker */

describe("fraud-shield order.flagged review-hold marker", () => {
  it("a review assessment becomes a hold marker the caller can persist", () => {
    const assessment = scoreFraudShieldOrder(cleanOrder({ failedPayments: 4 }));
    expect(assessment.action).toBe("review");
    const marker = markOrderFlagged(
      { orderId: "order-1", orderNumber: "ORD-1" },
      assessment,
      "2026-10-01T10:05:00.000Z",
    );
    expect(marker).toMatchObject({
      held: true,
      orderId: "order-1",
      orderNumber: "ORD-1",
      action: "review",
      score: assessment.score,
      flaggedAt: "2026-10-01T10:05:00.000Z",
    });
    expect(marker.reasons).toEqual(assessment.reasons);
    expect(marker.action).not.toBe("cancel");
  });

  it("an allow assessment produces no hold — and still never a cancel", () => {
    const assessment = scoreFraudShieldOrder(cleanOrder());
    const marker = markOrderFlagged(
      { orderId: "order-2", orderNumber: "ORD-2" },
      assessment,
      "2026-10-01T10:05:00.000Z",
    );
    expect(marker.held).toBe(false);
    expect(marker.action).toBe("allow");
    expect(marker.action).not.toBe("cancel");
  });
});
