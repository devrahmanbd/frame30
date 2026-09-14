/**
 * FX conversion boundary. Only the USD pilot crosses it, and only here.
 *
 * Rules enforced by this module:
 *  - conversion always reads a stored snapshot (`fx_rates`), never a live quote
 *    at charge time, so a charge can be reproduced from the ledger;
 *  - the snapshot id + rate travel with the converted amount for audit;
 *  - rates are integer parts-per-million, so no float ever touches money;
 *  - a store that is not on the USD pilot cannot convert at all.
 */
import { cached } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { type CurrencyCode, type Money, isCurrency, money } from "./money";

export type FxSnapshot = {
  id: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  ratePpm: number;
  source: string;
  effectiveAt: string;
};

export type Converted = {
  from: Money;
  to: Money;
  snapshot: FxSnapshot;
};

export class FxError extends Error {
  constructor(readonly code: "fx.no_snapshot" | "fx.not_piloted" | "fx.same_currency") {
    super(code);
    this.name = "FxError";
  }
}

type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: unknown,
      ) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      };
    };
  };
};

/** Latest snapshot for a pair. Cached for a minute: rates are snapshots, not ticks. */
export async function latestSnapshot(
  client: unknown,
  base: CurrencyCode,
  quote: CurrencyCode,
): Promise<FxSnapshot> {
  if (base === quote) throw new FxError("fx.same_currency");
  return cached(`fx:${base}:${quote}`, 60, async () =>
    withSpan(
      "fx.snapshot",
      async () => {
        const { data, error } = await (client as Db)
          .from("fx_rates")
          .select("id, base_currency, quote_currency, rate_ppm, source, effective_at")
          .eq("base_currency", base)
          .eq("quote_currency", quote)
          .order("effective_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) {
          incr("framique_fx_total", { outcome: "no_snapshot" });
          log("error", "fx.no_snapshot", { base, quote });
          throw new FxError("fx.no_snapshot");
        }
        const row = data as {
          id: string;
          base_currency: string;
          quote_currency: string;
          rate_ppm: number | string;
          source: string;
          effective_at: string;
        };
        incr("framique_fx_total", { outcome: "ok" });
        return {
          id: row.id,
          base: isCurrency(row.base_currency) ? row.base_currency : "BDT",
          quote: isCurrency(row.quote_currency) ? row.quote_currency : "USD",
          ratePpm: Number(row.rate_ppm),
          source: row.source,
          effectiveAt: row.effective_at,
        } satisfies FxSnapshot;
      },
      { base, quote },
    ),
  );
}

/** Pure, testable core: integer ppm maths with half-up rounding. */
export function convertWithSnapshot(amount: Money, snapshot: FxSnapshot): Money {
  if (amount.currency !== snapshot.base) throw new FxError("fx.no_snapshot");
  const converted = Math.floor((amount.minor * snapshot.ratePpm) / 1_000_000 + 0.5);
  return money(converted, snapshot.quote);
}

/**
 * The only sanctioned conversion path. `pilotEnabled` comes from the store's
 * USD-pilot gate; without it the call throws rather than quietly converting.
 */
export async function convert(
  client: unknown,
  amount: Money,
  target: CurrencyCode,
  opts: { pilotEnabled: boolean },
): Promise<Converted> {
  if (!opts.pilotEnabled) {
    incr("framique_fx_total", { outcome: "not_piloted" });
    throw new FxError("fx.not_piloted");
  }
  const snapshot = await latestSnapshot(client, amount.currency, target);
  return { from: amount, to: convertWithSnapshot(amount, snapshot), snapshot };
}
