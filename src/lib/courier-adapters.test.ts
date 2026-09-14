import { describe, expect, it } from "vitest";
import {
  CARRIER_PROFILES,
  adapterFor,
  normalizeStatusWord,
  resetBreakers,
} from "./courier-adapters.server";

describe("carrier coverage", () => {
  it("ships every contracted Bangladeshi carrier", () => {
    const codes = CARRIER_PROFILES.map((c) => c.code).sort();
    expect(codes).toEqual(
      ["ecourier", "paperfly", "pathao", "redx", "steadfast", "sundarban"].sort(),
    );
  });

  it("gives every carrier a working adapter", () => {
    resetBreakers();
    for (const profile of CARRIER_PROFILES) {
      expect(typeof adapterFor(profile.code).parseEvent).toBe("function");
    }
  });
});

describe("standardised tracking vocabulary", () => {
  it("maps carrier words onto the platform ladder", () => {
    expect(normalizeStatusWord("pickup requested")).toBe("pickup_scheduled");
    expect(normalizeStatusWord("On-The-Way")).toBe("in_transit");
    expect(normalizeStatusWord("OFD")).toBe("out_for_delivery");
    expect(normalizeStatusWord("delivery_done")).toBe("delivered");
    expect(normalizeStatusWord("RTO")).toBe("returned");
  });

  it("treats COD collection as a delivered milestone", () => {
    expect(normalizeStatusWord("cod_collected")).toBe("delivered");
  });

  it("never guesses an unknown word", () => {
    expect(normalizeStatusWord("teleported")).toBeNull();
    expect(normalizeStatusWord(42)).toBeNull();
    expect(normalizeStatusWord(undefined)).toBeNull();
  });
});
