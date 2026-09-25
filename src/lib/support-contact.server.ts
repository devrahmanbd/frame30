import { ORG_NAP } from "./nap";
import { BD_PHONE_REGEX, normaliseBdPhone } from "./support-callbacks.server";

export type VerifiedContact = {
  phone: string | null;
  whatsapp: string | null;
  email: string;
  hours: string;
  hoursBn: string;
  source: "org_nap" | "merchant_verified";
};

export function isVerifiedBdPhone(raw?: string | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Accept 01XXXXXXXXX, +8801XXXXXXXXX, 8801XXXXXXXXX
  if (!BD_PHONE_REGEX.test(trimmed)) {
    // Try normalised form
    try {
      const n = normaliseBdPhone(trimmed);
      return BD_PHONE_REGEX.test(n) || /^\+8801[3-9]\d{8}$/.test(n);
    } catch {
      return false;
    }
  }
  return true;
}

export function shouldShowSupportPhone(raw?: string | null): boolean {
  return isVerifiedBdPhone(raw);
}

function toE164(raw: string): string {
  try {
    return normaliseBdPhone(raw.trim());
  } catch {
    return raw.trim();
  }
}

/**
 * Single source of truth for user-visible contact details.
 * - Defaults to ORG_NAP (canonical).
 * - Merchant phone is used ONLY when it passes BD verification.
 * - Unverified merchant phone is hidden (null), never rendered as tel: link.
 * - Never returns scattered demo fakes (+880 9612-345678 / +880 1700-000000).
 */
export function getVerifiedContact(opts?: {
  supportPhone?: string | null;
  supportEmail?: string | null;
}): VerifiedContact {
  const rawPhone = opts?.supportPhone?.trim() || "";
  const rawEmail = opts?.supportEmail?.trim() || "";
  const verified = isVerifiedBdPhone(rawPhone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(rawEmail);

  if (verified) {
    return {
      phone: toE164(rawPhone),
      whatsapp: toE164(rawPhone),
      email: emailOk ? rawEmail : ORG_NAP.supportEmail,
      hours: ORG_NAP.hours,
      hoursBn: "সকাল ৯:০০ – রাত ১০:০০ BST",
      source: "merchant_verified",
    };
  }
  return {
    phone: null,
    whatsapp: null,
    email: emailOk ? rawEmail : ORG_NAP.supportEmail,
    hours: ORG_NAP.hours,
    hoursBn: "সকাল ৯:০০ – রাত ১০:০০ BST",
    source: "org_nap",
  };
}
