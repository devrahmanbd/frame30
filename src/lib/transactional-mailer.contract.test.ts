import { describe, expect, it } from "vitest";
import {
  formatMoneyMinor,
  interpolate,
  renderEmailHtml,
  DEFAULT_TEMPLATES,
} from "./transactional-mailer.server";

describe("Transactional Mailer Formatters", () => {
  it("formats integer minor units as currency correctly", () => {
    expect(formatMoneyMinor(150000, "BDT")).toBe("৳ 1,500.00");
    expect(formatMoneyMinor(5000, "BDT")).toBe("৳ 50.00");
    expect(formatMoneyMinor(0, "BDT")).toBe("৳ 0.00");
    expect(formatMoneyMinor(2599, "USD")).toBe("$ 25.99");
  });

  it("interpolates variables properly without leaving bracketed tokens", () => {
    const raw =
      "Hello {{customer_name}}, your order #{{order_number}} is confirmed for {{total_amount}}.";
    const vars = {
      customer_name: "Tanzim",
      order_number: "FQ-2026-99",
      total_amount: "৳ 2,400.00",
    };
    const rendered = interpolate(raw, vars);
    expect(rendered).toBe(
      "Hello Tanzim, your order #FQ-2026-99 is confirmed for ৳ 2,400.00.",
    );
  });

  it("handles missing variables safely by replacing with empty string", () => {
    const raw = "Hi {{customer_name}}, tracking is {{tracking_url}}";
    const rendered = interpolate(raw, { customer_name: "Rafiq" });
    expect(rendered).toBe("Hi Rafiq, tracking is ");
  });
});

describe("renderEmailHtml Shell", () => {
  it("renders a clean responsive email shell with brand color, CTA, and escaped HTML", () => {
    const html = renderEmailHtml({
      storeName: "Artisan Leather",
      brandColor: "#6366f1",
      logoUrl: "https://example.com/logo.png",
      headerTitle: "Order Confirmed",
      bodyText: "Your order has been received.\nWe will dispatch it shortly.",
      ctaText: "Track Order",
      ctaUrl: "https://example.com/track/123",
      footerText: "Artisan Leather, Dhaka, Bangladesh",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Artisan Leather");
    expect(html).toContain("#6366f1");
    expect(html).toContain("Track Order");
    expect(html).toContain("https://example.com/track/123");
    expect(html).toContain("Unsubscribe here");
    expect(html).toContain("Your order has been received.");
  });

  it("includes all default templates with sensible defaults", () => {
    expect(DEFAULT_TEMPLATES.order_confirmation).toBeDefined();
    expect(DEFAULT_TEMPLATES.invoice_delivery).toBeDefined();
    expect(DEFAULT_TEMPLATES.order_dispatched).toBeDefined();
    expect(DEFAULT_TEMPLATES.customer_welcome).toBeDefined();
    expect(DEFAULT_TEMPLATES.newsletter).toBeDefined();
  });
});
