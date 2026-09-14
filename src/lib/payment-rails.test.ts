import { describe, expect, it } from "vitest";
import {
  ONLINE_METHOD_KEYS,
  PAYMENT_METHOD_CATALOG,
  PAYMENT_METHOD_KEYS,
  assertMethodAllowed,
  availableMethods,
  credentialKeyToMethod,
  groupMethods,
  isPaymentMethodKey,
  methodLabel,
} from "./payment-rails";
import { PROVIDER_CATALOG, PROVIDER_KEYS } from "./provider-gate";
import { Constants } from "@/integrations/supabase/types";

// The catalogue is the storefront's authority on what may be charged, so the
// tests here are mostly deny cases: a rail that leaks through as "available"
// takes an order the merchant cannot capture.
describe("payment rail catalogue", () => {
  it("covers every Bangladesh rail layer, not just bKash", () => {
    const layers = new Set(PAYMENT_METHOD_KEYS.map((k) => PAYMENT_METHOD_CATALOG[k].layer));
    expect([...layers].sort()).toEqual(["aggregator", "bank", "card", "cod", "mfs"]);
    const mfs = PAYMENT_METHOD_KEYS.filter((k) => PAYMENT_METHOD_CATALOG[k].layer === "mfs");
    expect(mfs).toEqual(["bkash", "nagad", "rocket", "upay", "tap", "mcash", "surecash"]);
    const aggregators = PAYMENT_METHOD_KEYS.filter(
      (k) => PAYMENT_METHOD_CATALOG[k].layer === "aggregator",
    );
    expect(aggregators).toEqual(["sslcommerz", "aamarpay", "shurjopay", "portwallet", "piprapay"]);
  });

  it("every method has a Bangla label distinct from the English one", () => {
    for (const key of PAYMENT_METHOD_KEYS) {
      const s = PAYMENT_METHOD_CATALOG[key];
      expect(s.labelBn.length).toBeGreaterThan(0);
      expect(s.labelBn).not.toEqual(s.label);
      expect(methodLabel(key, "bn")).toBe(s.labelBn);
      expect(methodLabel(key, "en")).toBe(s.label);
    }
  });

  it("stays in step with the database payment_method enum", () => {
    const enums = Constants.public.Enums as Record<string, readonly string[] | undefined>;
    const dbEnum = enums["payment_method"];
    // The generated snapshot may predate the enum; only assert when it is there.
    if (!dbEnum) return;
    expect([...PAYMENT_METHOD_KEYS].sort()).toEqual([...dbEnum].sort());
  });

  it("every online method maps to a provider that can be signed off", () => {
    for (const key of ONLINE_METHOD_KEYS) {
      const credentialKey = PAYMENT_METHOD_CATALOG[key].credentialKey;
      expect(credentialKey).not.toBeNull();
      expect(PROVIDER_KEYS).toContain(credentialKey as (typeof PROVIDER_KEYS)[number]);
      expect(PROVIDER_CATALOG[credentialKey as (typeof PROVIDER_KEYS)[number]].secretFields.length)
        .toBeGreaterThan(0);
    }
  });

  it("aggregators demand PCI attestation on top of the MFS evidence", () => {
    for (const key of ["sslcommerz", "aamarpay", "shurjopay", "portwallet"] as const) {
      const spec = PROVIDER_CATALOG[key];
      expect(spec.rail).toBe("aggregator");
      expect(spec.requires).toContain("pci_saq_attested");
      expect(spec.requires).toContain("bank_account_verified");
      expect(spec.requires).toContain("kyc_approved");
    }
  });

  it("maps the card acquiring credential onto the shopper-facing card method", () => {
    expect(credentialKeyToMethod("card_acquiring")).toBe("card");
    expect(credentialKeyToMethod("sslcommerz")).toBe("sslcommerz");
  });

  it("does not promise refunds on a rail that cannot reverse a capture", () => {
    expect(PAYMENT_METHOD_CATALOG.surecash.supportsRefund).toBe(false);
    expect(PAYMENT_METHOD_CATALOG.cod.supportsRefund).toBe(false);
    expect(PAYMENT_METHOD_CATALOG.bkash.supportsRefund).toBe(true);
  });
});

describe("availability gate", () => {
  const all = { codEnabled: true, onlineEnabled: true, configured: [...ONLINE_METHOD_KEYS] };

  it("offers only rails the merchant has actually contracted", () => {
    const offered = availableMethods({
      codEnabled: true,
      onlineEnabled: true,
      configured: ["bkash", "sslcommerz"],
    });
    expect(offered).toEqual(["cod", "bkash", "sslcommerz"]);
  });

  // Deny: no credentials at all must not silently fall back to every wallet.
  it("denies every online rail when nothing is configured", () => {
    const offered = availableMethods({ codEnabled: true, onlineEnabled: true, configured: [] });
    expect(offered).toEqual(["cod"]);
    expect(assertMethodAllowed("bkash", { codEnabled: true, onlineEnabled: true, configured: [] }))
      .toEqual({ ok: false, reason: "payment.rail_unavailable" });
  });

  // Deny: the merchant-level online switch overrides a live credential.
  it("denies online rails when the merchant has switched online payment off", () => {
    const av = { codEnabled: true, onlineEnabled: false, configured: ["bkash"] };
    expect(availableMethods(av)).toEqual(["cod"]);
    expect(assertMethodAllowed("bkash", av).ok).toBe(false);
  });

  it("denies cash on delivery when the merchant has switched it off", () => {
    const av = { codEnabled: false, onlineEnabled: true, configured: ["nagad"] };
    expect(assertMethodAllowed("cod", av)).toEqual({ ok: false, reason: "payment.cod_unavailable" });
    expect(assertMethodAllowed("nagad", av).ok).toBe(true);
  });

  // Deny: an unknown string must never be treated as chargeable.
  it("denies a method that is not in the catalogue", () => {
    expect(assertMethodAllowed("dbbl_nexus", all)).toEqual({
      ok: false,
      reason: "payment.unsupported_provider",
    });
    expect(isPaymentMethodKey("dbbl_nexus")).toBe(false);
  });

  // Replay: the same availability input always yields the same offer set.
  it("is deterministic across repeated evaluation", () => {
    const av = { codEnabled: true, onlineEnabled: true, configured: ["upay", "shurjopay"] };
    expect(availableMethods(av)).toEqual(availableMethods(av));
    expect(availableMethods(av)).toEqual(["cod", "upay", "shurjopay"]);
  });

  it("groups the picker with aggregators last", () => {
    const groups = groupMethods(availableMethods(all));
    expect(groups.map((g) => g.layer)).toEqual(["cod", "mfs", "bank", "card", "aggregator"]);
    expect(groups.at(-1)?.methods).toContain("sslcommerz");
  });
});
