/**
 * VAT rate loading. The rate is resolved by the database (`vat_resolve`) from
 * the legal-year table, cached briefly per (country, category, year), and every
 * unresolved lookup is counted so a missing legal year is visible on the desk
 * instead of silently pricing at 0%.
 */
import { cached } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import type { VatRate } from "./vat";

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export function legalYear(at: Date = new Date()) {
  // BD fiscal/VAT regimes are published per calendar year of effect.
  return at.getUTCFullYear();
}

export async function resolveVatRate(
  client: unknown,
  opts: { country?: string; category?: string; year?: number } = {},
): Promise<VatRate> {
  const country = (opts.country ?? "BD").toUpperCase();
  const category = opts.category ?? "standard";
  const year = opts.year ?? legalYear();

  return cached(`vat:${country}:${category}:${year}`, 300, async () =>
    withSpan(
      "vat.resolve",
      async () => {
        const { data, error } = await (client as Rpc).rpc("vat_resolve", {
          _country: country,
          _category: category,
          _year: year,
        });
        if (error || !data) {
          // Fail closed on presentation, not on price: 0% would under-collect,
          // so surface the outage loudly and let the caller decide.
          incr("framique_vat_total", { outcome: "unavailable" });
          log("error", "vat.unavailable", { country, category, year });
          throw new Error("vat.unavailable");
        }
        const row = data as {
          country_code: string;
          category: string;
          rate_basis_points: number;
          effective_year: number;
          resolved: boolean;
        };
        incr("framique_vat_total", { outcome: row.resolved ? "resolved" : "missing_year" });
        if (!row.resolved) log("warn", "vat.missing_legal_year", { country, category, year });
        return {
          countryCode: row.country_code,
          category: row.category,
          rateBasisPoints: row.rate_basis_points,
          effectiveYear: row.effective_year,
          resolved: row.resolved,
        } satisfies VatRate;
      },
      { country, category },
    ),
  );
}
