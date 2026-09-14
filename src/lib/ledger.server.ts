/**
 * Append-only money ledger writer.
 *
 * Every money movement goes through `postLedgerEntry`. The database enforces the
 * hard invariants (rows immutable, single tenant currency, seller + platform ==
 * gross); this module enforces the *call-site* invariants: an idempotency key is
 * mandatory, a duplicate key is a no-op rather than a second movement, and a
 * correction is a compensating entry — never an edit.
 */
import { type Money, add, money, sub } from "./money";
import { incr, log, withSpan } from "./observability.server";

export type LedgerSource =
  | "order.captured"
  | "order.refunded"
  | "cod.collected"
  | "payout.sent"
  | "market.theme.installed"
  | "market.widget.installed"
  | "adjustment.correction";

export type LedgerDirection = "credit" | "debit";

export type LedgerEntryInput = {
  merchantId: string;
  counterpartyMerchantId?: string | null;
  source: LedgerSource;
  referenceId?: string | null;
  direction: LedgerDirection;
  gross: Money;
  /** Split of gross. Defaults to the whole amount to the seller. */
  platformFee?: Money;
  idempotencyKey: string;
  memo?: string;
};

export type LedgerPostResult = {
  id: string | null;
  /** true when the idempotency key had already been posted. */
  replayed: boolean;
};

export class LedgerError extends Error {
  constructor(
    readonly code:
      | "ledger.missing_idempotency_key"
      | "ledger.split_exceeds_gross"
      | "ledger.write_failed",
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "LedgerError";
  }
}

type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: unknown,
      ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
    insert: (row: Record<string, unknown>) => {
      select: (c: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
  };
};

export async function postLedgerEntry(
  client: unknown,
  input: LedgerEntryInput,
): Promise<LedgerPostResult> {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    throw new LedgerError("ledger.missing_idempotency_key", input.source);
  }
  const platform = input.platformFee ?? money(0, input.gross.currency);
  if (platform.minor < 0 || platform.minor > input.gross.minor) {
    throw new LedgerError("ledger.split_exceeds_gross", input.source);
  }
  const seller = sub(input.gross, platform);
  const db = client as Db;

  return withSpan(
    "ledger.post",
    async () => {
      const existing = await db
        .from("wallet_ledger_entries")
        .select("id")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if ((existing.data as { id: string } | null)?.id) {
        incr("framique_ledger_total", { source: input.source, outcome: "replayed" });
        return { id: (existing.data as { id: string }).id, replayed: true };
      }

      const { data, error } = await db
        .from("wallet_ledger_entries")
        .insert({
          merchant_id: input.merchantId,
          counterparty_merchant_id: input.counterpartyMerchantId ?? null,
          source: input.source,
          reference_id: input.referenceId ?? null,
          direction: input.direction,
          currency_code: input.gross.currency,
          gross_minor_int: input.gross.minor,
          seller_minor_int: seller.minor,
          platform_minor_int: platform.minor,
          idempotency_key: input.idempotencyKey,
          memo: input.memo ?? null,
        })
        .select("id")
        .single();

      if (error) {
        // A racing writer with the same key lost the insert: treat as replay.
        const msg = (error as { message?: string }).message ?? "";
        if (msg.includes("duplicate key")) {
          incr("framique_ledger_total", { source: input.source, outcome: "replayed" });
          return { id: null, replayed: true };
        }
        incr("framique_ledger_total", { source: input.source, outcome: "failed" });
        log("error", "ledger.write_failed", { source: input.source, message: msg });
        throw new LedgerError("ledger.write_failed", msg);
      }

      incr("framique_ledger_total", { source: input.source, outcome: "posted" });
      return { id: (data as { id: string }).id, replayed: false };
    },
    { source: input.source, direction: input.direction },
  );
}

/**
 * Correction path. The original row stays untouched; a mirrored entry in the
 * opposite direction cancels it, and the memo carries the reason.
 */
export async function postCorrection(
  client: unknown,
  original: {
    merchantId: string;
    referenceId?: string | null;
    direction: LedgerDirection;
    gross: Money;
    platformFee?: Money;
  },
  reason: string,
  idempotencyKey: string,
) {
  return postLedgerEntry(client, {
    merchantId: original.merchantId,
    source: "adjustment.correction",
    referenceId: original.referenceId ?? null,
    direction: original.direction === "credit" ? "debit" : "credit",
    gross: original.gross,
    ...(original.platformFee ? { platformFee: original.platformFee } : {}),
    idempotencyKey,
    memo: `correction: ${reason}`.slice(0, 200),
  });
}

/** Net position from a set of rows — credits minus debits, currency-safe. */
export function ledgerBalance(
  rows: { direction: string; seller_minor_int: number | string; currency_code: string }[],
  currency = "BDT",
) {
  return rows.reduce((acc, r) => {
    const amount = money(Number(r.seller_minor_int), r.currency_code);
    return r.direction === "credit" ? add(acc, amount) : sub(acc, amount);
  }, money(0, currency));
}
