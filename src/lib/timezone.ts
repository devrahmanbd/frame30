/**
 * Universal Timezone Management (Platform Owner, Merchant & Storefront Shoppers).
 *
 * Policy:
 * 1. Platform Owner: Configured in /root/settings (`platform_timezone`), controls root audit logs, metrics and sovereign reports.
 * 2. Merchant: Configured in /dashboard/settings (`timezone`), controls order timelines, inventory logs, discounts and business reports.
 * 3. Storefront Shoppers/Users: Merchant controls `allow_customer_timezone` via store settings & theme builder.
 *    - If allowed: shoppers can view timestamps in their local device timezone or pick from switcher.
 *    - If disallowed: storefront timestamps strictly adhere to the merchant's store timezone.
 */

import { useState, useEffect, useCallback } from "react";

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
  region: string;
}

export const COMMON_TIMEZONES: readonly TimezoneOption[] = [
  // South Asia
  {
    value: "Asia/Dhaka",
    label: "Dhaka (Bangladesh Standard Time)",
    offset: "UTC+06:00",
    region: "South Asia",
  },
  {
    value: "Asia/Kolkata",
    label: "Kolkata, Mumbai, New Delhi (IST)",
    offset: "UTC+05:30",
    region: "South Asia",
  },
  {
    value: "Asia/Karachi",
    label: "Karachi, Islamabad (PKT)",
    offset: "UTC+05:00",
    region: "South Asia",
  },
  {
    value: "Asia/Colombo",
    label: "Colombo (Sri Lanka Standard Time)",
    offset: "UTC+05:30",
    region: "South Asia",
  },
  {
    value: "Asia/Kathmandu",
    label: "Kathmandu (Nepal Time)",
    offset: "UTC+05:45",
    region: "South Asia",
  },

  // Middle East & Gulf
  {
    value: "Asia/Dubai",
    label: "Dubai, Abu Dhabi (Gulf Standard Time)",
    offset: "UTC+04:00",
    region: "Middle East",
  },
  {
    value: "Asia/Riyadh",
    label: "Riyadh, Jeddah (Arabia Standard Time)",
    offset: "UTC+03:00",
    region: "Middle East",
  },
  {
    value: "Asia/Qatar",
    label: "Doha (Qatar Time)",
    offset: "UTC+03:00",
    region: "Middle East",
  },

  // Southeast & East Asia
  {
    value: "Asia/Singapore",
    label: "Singapore (Singapore Standard Time)",
    offset: "UTC+08:00",
    region: "Asia Pacific",
  },
  {
    value: "Asia/Kuala_Lumpur",
    label: "Kuala Lumpur (Malaysia Time)",
    offset: "UTC+08:00",
    region: "Asia Pacific",
  },
  {
    value: "Asia/Bangkok",
    label: "Bangkok, Hanoi, Jakarta (Indochina Time)",
    offset: "UTC+07:00",
    region: "Asia Pacific",
  },
  {
    value: "Asia/Hong_Kong",
    label: "Hong Kong (HKT)",
    offset: "UTC+08:00",
    region: "Asia Pacific",
  },
  {
    value: "Asia/Tokyo",
    label: "Tokyo, Osaka (Japan Standard Time)",
    offset: "UTC+09:00",
    region: "Asia Pacific",
  },
  {
    value: "Asia/Seoul",
    label: "Seoul (Korea Standard Time)",
    offset: "UTC+09:00",
    region: "Asia Pacific",
  },
  {
    value: "Australia/Sydney",
    label: "Sydney, Melbourne (AEST)",
    offset: "UTC+10:00",
    region: "Oceania",
  },

  // Europe & Africa
  {
    value: "UTC",
    label: "UTC (Universal Coordinated Time)",
    offset: "UTC+00:00",
    region: "Universal",
  },
  {
    value: "Europe/London",
    label: "London, Dublin (GMT / BST)",
    offset: "UTC+00:00",
    region: "Europe",
  },
  {
    value: "Europe/Berlin",
    label: "Berlin, Paris, Amsterdam, Rome (CET)",
    offset: "UTC+01:00",
    region: "Europe",
  },
  {
    value: "Europe/Istanbul",
    label: "Istanbul (Turkey Time)",
    offset: "UTC+03:00",
    region: "Europe",
  },
  {
    value: "Africa/Cairo",
    label: "Cairo (Eastern European Time)",
    offset: "UTC+02:00",
    region: "Africa",
  },
  {
    value: "Africa/Johannesburg",
    label: "Johannesburg (South Africa Time)",
    offset: "UTC+02:00",
    region: "Africa",
  },

  // Americas
  {
    value: "America/New_York",
    label: "New York, Toronto, Miami (Eastern Time)",
    offset: "UTC-05:00",
    region: "Americas",
  },
  {
    value: "America/Chicago",
    label: "Chicago, Dallas (Central Time)",
    offset: "UTC-06:00",
    region: "Americas",
  },
  {
    value: "America/Denver",
    label: "Denver, Phoenix (Mountain Time)",
    offset: "UTC-07:00",
    region: "Americas",
  },
  {
    value: "America/Los_Angeles",
    label: "Los Angeles, Vancouver (Pacific Time)",
    offset: "UTC-08:00",
    region: "Americas",
  },
  {
    value: "America/Sao_Paulo",
    label: "São Paulo, Rio de Janeiro (BRT)",
    offset: "UTC-03:00",
    region: "Americas",
  },
] as const;

export const DEFAULT_PLATFORM_TIMEZONE = "Asia/Dhaka";
export const DEFAULT_MERCHANT_TIMEZONE = "Asia/Dhaka";

/** Check whether a given string is a valid IANA timezone */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Sanitize and safely resolve a timezone string, falling back to default */
export function sanitizeTimezone(
  tz: unknown,
  fallback = DEFAULT_MERCHANT_TIMEZONE,
): string {
  if (isValidTimezone(tz)) return tz.trim();
  return fallback;
}

/**
 * Resolves the effective timezone for a storefront visitor.
 * If the merchant disallows customer timezone selection, strictly enforce store timezone.
 */
export function resolveStorefrontTimezone(
  storeTimezone: string | null | undefined,
  allowCustomerTimezone: boolean,
  customerTimezone?: string | null,
): string {
  const baseStoreTz = sanitizeTimezone(
    storeTimezone,
    DEFAULT_MERCHANT_TIMEZONE,
  );
  if (!allowCustomerTimezone) {
    return baseStoreTz;
  }

  // Customer override takes precedence if allowed
  if (customerTimezone && isValidTimezone(customerTimezone)) {
    return customerTimezone.trim();
  }

  // Fallback to browser's detected timezone if available in browser environment
  if (typeof window !== "undefined" && typeof Intl !== "undefined") {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (isValidTimezone(browserTz)) return browserTz;
    } catch {
      // ignore
    }
  }

  return baseStoreTz;
}

/** Formats a timestamp in a given timezone */
export function formatInTimezone(
  date: Date | string | number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  locale = "en-US",
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  const safeTz = sanitizeTimezone(timeZone, DEFAULT_MERCHANT_TIMEZONE);
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: safeTz,
    }).format(d);
  } catch {
    return d.toLocaleString(locale);
  }
}

/** Formats a date with short time in the selected timezone */
export function formatDateTime(
  date: Date | string | number,
  timeZone?: string,
  locale = "en-US",
): string {
  return formatInTimezone(
    date,
    timeZone ?? DEFAULT_MERCHANT_TIMEZONE,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    locale,
  );
}

/** Formats date only (no time) in the selected timezone */
export function formatDateOnly(
  date: Date | string | number,
  timeZone?: string,
  locale = "en-US",
): string {
  return formatInTimezone(
    date,
    timeZone ?? DEFAULT_MERCHANT_TIMEZONE,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
    locale,
  );
}

/** Formats time only (hours:minutes) in the selected timezone */
export function formatTimeOnly(
  date: Date | string | number,
  timeZone?: string,
  locale = "en-US",
): string {
  return formatInTimezone(
    date,
    timeZone ?? DEFAULT_MERCHANT_TIMEZONE,
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
    locale,
  );
}

export const CUSTOMER_TIMEZONE_STORAGE_KEY = "fq_customer_tz";

/** Returns detected browser timezone or fallback */
export function detectBrowserTimezone(): string {
  if (typeof window !== "undefined" && typeof Intl !== "undefined") {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (isValidTimezone(tz)) return tz;
    } catch {
      // ignore
    }
  }
  return DEFAULT_MERCHANT_TIMEZONE;
}

/** Retrieve customer's saved timezone from localStorage */
export function getStoredCustomerTimezone(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const stored = window.localStorage.getItem(CUSTOMER_TIMEZONE_STORAGE_KEY);
    if (stored && isValidTimezone(stored)) return stored;
  } catch {
    // ignore
  }
  return null;
}

/** Persist customer's timezone selection and notify all listeners */
export function setStoredCustomerTimezone(tz: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (isValidTimezone(tz)) {
      window.localStorage.setItem(CUSTOMER_TIMEZONE_STORAGE_KEY, tz);
      window.dispatchEvent(
        new CustomEvent("fq_timezone_change", { detail: { timezone: tz } }),
      );
    }
  } catch {
    // ignore
  }
}

/**
 * React hook for storefront shoppers/users to resolve and optionally pick their timezone.
 * If allowCustomerTimezone is false, strictly locks to the merchant's storeTimezone.
 */
export function useCustomerTimezone(
  storeTimezone: string = DEFAULT_MERCHANT_TIMEZONE,
  allowCustomerTimezone = false,
) {
  const [selectedTz, setSelectedTz] = useState<string | null>(() =>
    getStoredCustomerTimezone(),
  );

  useEffect(() => {
    const handleSync = () => {
      setSelectedTz(getStoredCustomerTimezone());
    };
    window.addEventListener("fq_timezone_change", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("fq_timezone_change", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const effectiveTimezone = resolveStorefrontTimezone(
    storeTimezone,
    allowCustomerTimezone,
    selectedTz,
  );

  const setTimezone = useCallback(
    (tz: string) => {
      if (!allowCustomerTimezone) return;
      setStoredCustomerTimezone(tz);
      setSelectedTz(tz);
    },
    [allowCustomerTimezone],
  );

  const resetToStoreDefault = useCallback(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(CUSTOMER_TIMEZONE_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("fq_timezone_change"));
    }
    setSelectedTz(null);
  }, []);

  return {
    effectiveTimezone,
    isCustomizable: allowCustomerTimezone,
    customerTimezone: selectedTz,
    setTimezone,
    resetToStoreDefault,
    formatDateTime: (date: Date | string | number, locale = "en-US") =>
      formatDateTime(date, effectiveTimezone, locale),
    formatDateOnly: (date: Date | string | number, locale = "en-US") =>
      formatDateOnly(date, effectiveTimezone, locale),
    formatTimeOnly: (date: Date | string | number, locale = "en-US") =>
      formatTimeOnly(date, effectiveTimezone, locale),
  };
}
