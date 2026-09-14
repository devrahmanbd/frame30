/**
 * Money engine desk (BUILD.md §1.3).
 *
 * Platform-admin view of the invariants that would otherwise fail silently:
 * float-typed money columns, missing append-only triggers, seller+platform
 * splits that no longer sum to gross, the legal-year VAT coverage, and the FX
 * snapshots that back the USD pilot.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached } from "./cache.server";
import { withSpan, metricsSnapshot } from "./observability.server";
import { requirePlatformAdmin } from "./platform.server";
import { legalYear } from "./vat.server";

type Client = SupabaseClient<Database>;
type Loose = {
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};
const loose = (db: Client) => db as unknown as Loose;

export type Conformance = {
  float_money_columns: string[];
  missing_append_only_triggers: string[];
  split_mismatch_rows: number;
  currency_mismatch_rows: number;
  ledger_rows: number;
};

export type VatCoverage = {
  country_code: string;
  category: string;
  rate_basis_points: number;
  effective_year: number;
};

export type FxRow = {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate_ppm: number | string;
  source: string;
  effective_at: string;
};

export async function loadMoneyDesk(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  return withSpan("money.desk", async () => {
    const [conformance, vat, fx] = await Promise.all([
      cached("money:conformance", 30, async () => {
        const { data } = await loose(db).rpc("money_conformance", {});
        return (data ?? null) as Conformance | null;
      }),
      loose(db).from("vat_rates").select("*").order("effective_year", { ascending: false }),
      loose(db).from("fx_rates").select("*").order("effective_at", { ascending: false }),
    ]);

    const vatRows = ((vat.data ?? []) as VatCoverage[]).slice(0, 50);
    const year = legalYear();
    const currentYearCovered = vatRows.some(
      (r) => r.country_code === "BD" && r.category === "standard" && r.effective_year <= year,
    );

    const report = conformance ?? {
      float_money_columns: [],
      missing_append_only_triggers: [],
      split_mismatch_rows: 0,
      currency_mismatch_rows: 0,
      ledger_rows: 0,
    };

    const breaches =
      report.float_money_columns.length +
      report.missing_append_only_triggers.length +
      report.split_mismatch_rows +
      report.currency_mismatch_rows +
      (currentYearCovered ? 0 : 1);

    return {
      conformance: report,
      vat: { rows: vatRows, year, currentYearCovered },
      fx: ((fx.data ?? []) as FxRow[]).slice(0, 25).map((r) => ({
        ...r,
        rate: Number(r.rate_ppm) / 1_000_000,
      })),
      breaches,
      metrics: Object.entries(metricsSnapshot().counters)
        .filter(([k]) => /vat|fx|ledger/.test(k))
        .map(([name, value]) => ({ name, value: Number(value) })),
    };
  });
}
