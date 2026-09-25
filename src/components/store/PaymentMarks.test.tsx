/**
 * Payment-mark badges — TDD: known brands render their SVG artwork keyed by
 * normalized mark text; unknown marks (e.g. "Cash on Delivery") fall back to
 * the legacy text chip so no payment method ever renders blank.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentMark, matchPaymentMark } from "./PaymentMarks";

describe("matchPaymentMark", () => {
  it("normalizes case, spaces and punctuation", () => {
    expect(matchPaymentMark("bKash")).toBe("bkash");
    expect(matchPaymentMark("  NAGAD ")).toBe("nagad");
    expect(matchPaymentMark("Rocket")).toBe("rocket");
    expect(matchPaymentMark("Visa")).toBe("visa");
    expect(matchPaymentMark("Mastercard")).toBe("mastercard");
    expect(matchPaymentMark("Master Card")).toBe("mastercard");
  });

  it("returns null for text-only marks", () => {
    expect(matchPaymentMark("Cash on Delivery")).toBeNull();
    expect(matchPaymentMark("Upay")).toBeNull();
    expect(matchPaymentMark("")).toBeNull();
  });
});

describe("PaymentMark", () => {
  it("renders brand artwork for known marks", () => {
    for (const mark of ["bKash", "Nagad", "Rocket", "Visa", "Mastercard"]) {
      const html = renderToStaticMarkup(createElement(PaymentMark, { mark }));
      expect(html).toContain("<svg");
      expect(html).toContain('viewBox="');
    }
  });

  it("falls back to a text chip for unknown marks", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentMark, { mark: "Cash on Delivery" }),
    );
    expect(html).not.toContain("<svg");
    expect(html).toContain("Cash on Delivery");
  });

  it("labels artwork accessibly", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentMark, { mark: "bKash" }),
    );
    expect(html).toContain('aria-label="bKash"');
  });
});
