import { describe, expect, it } from "vitest";
import {
  COMMON_TIMEZONES,
  DEFAULT_MERCHANT_TIMEZONE,
  DEFAULT_PLATFORM_TIMEZONE,
  detectBrowserTimezone,
  formatDateOnly,
  formatDateTime,
  formatInTimezone,
  getStoredCustomerTimezone,
  isValidTimezone,
  resolveStorefrontTimezone,
  sanitizeTimezone,
  setStoredCustomerTimezone,
} from "./timezone";

describe("Timezone Engine", () => {
  it("includes Bangladesh Asia/Dhaka and UTC in common timezones", () => {
    expect(DEFAULT_PLATFORM_TIMEZONE).toBe("Asia/Dhaka");
    expect(DEFAULT_MERCHANT_TIMEZONE).toBe("Asia/Dhaka");
    expect(COMMON_TIMEZONES.some((tz) => tz.value === "Asia/Dhaka")).toBe(true);
    expect(COMMON_TIMEZONES.some((tz) => tz.value === "UTC")).toBe(true);
  });

  it("validates valid IANA timezones and rejects invalid names", () => {
    expect(isValidTimezone("Asia/Dhaka")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Invalid/City")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });

  it("sanitizes invalid timezones to fallback", () => {
    expect(sanitizeTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(sanitizeTimezone("Not/Real", "UTC")).toBe("UTC");
    expect(sanitizeTimezone(undefined)).toBe("Asia/Dhaka");
  });

  describe("Storefront Customer Timezone Policy", () => {
    it("strictly enforces store timezone when allowCustomerTimezone is false", () => {
      const resolved = resolveStorefrontTimezone(
        "Asia/Dhaka",
        false,
        "America/New_York",
      );
      expect(resolved).toBe("Asia/Dhaka");
    });

    it("honors customer timezone when allowCustomerTimezone is true", () => {
      const resolved = resolveStorefrontTimezone(
        "Asia/Dhaka",
        true,
        "America/New_York",
      );
      expect(resolved).toBe("America/New_York");
    });

    it("falls back to store timezone if customer timezone is invalid or absent", () => {
      const resolved = resolveStorefrontTimezone(
        "Asia/Dubai",
        true,
        "gibberish_tz",
      );
      // Outside browser window, should fallback to store timezone
      expect(resolved).toBe("Asia/Dubai");
    });
  });

  describe("Timezone Date Formatting", () => {
    const timestamp = "2026-09-18T06:00:00.000Z"; // 12:00 PM in Dhaka (UTC+6)

    it("formats timestamp in Asia/Dhaka correctly", () => {
      const formatted = formatInTimezone(timestamp, "Asia/Dhaka", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      expect(formatted).toContain("12:00");
    });

    it("formats timestamp in UTC correctly", () => {
      const formatted = formatInTimezone(timestamp, "UTC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      expect(formatted).toContain("06:00");
    });

    it("formats date only without drift", () => {
      const dateStr = formatDateOnly(timestamp, "Asia/Dhaka");
      expect(dateStr).toContain("Sep 18, 2026");
    });

    it("handles invalid dates gracefully", () => {
      expect(formatDateTime("invalid-date")).toBe("—");
    });
  });

  describe("Customer Timezone Storage & Browser Detection", () => {
    it("returns default fallback when browser environment is not initialized", () => {
      const detected = detectBrowserTimezone();
      expect(isValidTimezone(detected)).toBe(true);
    });

    it("handles getStoredCustomerTimezone gracefully in Node environment", () => {
      expect(getStoredCustomerTimezone()).toBeNull();
    });

    it("handles setStoredCustomerTimezone gracefully in Node environment without throwing", () => {
      expect(() => setStoredCustomerTimezone("Asia/Tokyo")).not.toThrow();
    });
  });
});
