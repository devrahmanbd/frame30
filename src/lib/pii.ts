/**
 * §5 — PII minimisation.
 *
 * Support-tier roles see masked contact details; the full value is released
 * only to a holder of `customers.unmask`, and that release is itself an
 * audited action (see `unmaskAudited` in `hardening.server.ts`).
 *
 * Pure module: the same helpers run on the server (to strip before sending)
 * and in the console (to render the mask consistently).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "•••";
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(3, user.length - 1))}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return "•••••";
  return `${digits.slice(0, 3)}••••${digits.slice(-3)}`;
}

export function maskAddress(line: string | null | undefined): string {
  if (!line) return "";
  const parts = line.split(",");
  return parts.length > 1 ? `••• ${parts[parts.length - 1]!.trim()}` : "•••";
}

export function maskName(name: string | null | undefined): string {
  if (!name) return "";
  const [first = ""] = name.trim().split(/\s+/);
  return first ? `${first} •••` : "•••";
}

/** Field names treated as PII wherever they appear in a console payload. */
export const PII_FIELDS = {
  email: maskEmail,
  customer_email: maskEmail,
  phone: maskPhone,
  customer_phone: maskPhone,
  msisdn: maskPhone,
  address_line: maskAddress,
  customer_name: maskName,
} as const;

export type PiiField = keyof typeof PII_FIELDS;

/**
 * Returns a copy of `row` with every known PII field masked unless the caller
 * holds the unmask grant. Unknown fields pass through untouched — this is a
 * minimiser, not an allow-list; the allow-list is the `select` list.
 */
export function minimisePii<T extends Record<string, unknown>>(
  row: T,
  options: { canUnmask: boolean },
): T {
  if (options.canUnmask) return row;
  const out: Record<string, unknown> = { ...row };
  for (const [field, mask] of Object.entries(PII_FIELDS)) {
    const value = out[field];
    if (typeof value === "string") out[field] = mask(value);
  }
  return out as T;
}

export function minimisePiiRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  options: { canUnmask: boolean },
): T[] {
  return rows.map((row) => minimisePii(row, options));
}
