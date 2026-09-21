/**
 * Permalink settings store (D2, WP parity).
 *
 * Lives in `merchant_settings.setup_steps.permalinks` (same partial-upsert
 * pattern as `homepage_page_id`) — no DDL. Validated against the pure
 * builder in `./permalinks`; unknown shapes fall back to postname.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DEFAULT_PERMALINK_STRUCTURE,
  type PermalinkStructure,
} from "./permalinks";

type Client = SupabaseClient<Database>;
type Loose = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const loose = (db: Client) => db as unknown as Loose;

const VALID_KINDS = new Set([
  "plain",
  "day-name",
  "month-name",
  "numeric",
  "postname",
  "custom",
]);

export function sanitizePermalinkStructure(
  input: unknown,
): PermalinkStructure {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const kind =
    typeof raw.kind === "string" && VALID_KINDS.has(raw.kind)
      ? (raw.kind as PermalinkStructure["kind"])
      : DEFAULT_PERMALINK_STRUCTURE.kind;
  const custom =
    typeof raw.custom === "string" && raw.custom.length > 0
      ? raw.custom.slice(0, 200)
      : undefined;
  const categoryBase =
    typeof raw.categoryBase === "string"
      ? raw.categoryBase.slice(0, 60)
      : undefined;
  const tagBase =
    typeof raw.tagBase === "string" ? raw.tagBase.slice(0, 60) : undefined;
  const out: PermalinkStructure = { kind };
  if (kind === "custom") out.custom = custom ?? "/%postname%/";
  else if (custom) out.custom = custom;
  if (categoryBase) out.categoryBase = categoryBase;
  if (tagBase) out.tagBase = tagBase;
  return out;
}

export async function getPermalinkStructure(
  db: Client,
  merchantId: string,
): Promise<PermalinkStructure> {
  const { data } = await loose(db)
    .from("merchant_settings")
    .select("setup_steps")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const steps =
    data?.setup_steps && typeof data.setup_steps === "object"
      ? (data.setup_steps as Record<string, unknown>)
      : {};
  return sanitizePermalinkStructure(steps["permalinks"]);
}

export async function setPermalinkStructure(
  db: Client,
  merchantId: string,
  structure: unknown,
): Promise<PermalinkStructure> {
  const clean = sanitizePermalinkStructure(structure);
  const { data: settings } = await loose(db)
    .from("merchant_settings")
    .select("setup_steps")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const current =
    settings?.setup_steps && typeof settings.setup_steps === "object"
      ? (settings.setup_steps as Record<string, unknown>)
      : {};
  const { error } = await loose(db)
    .from("merchant_settings")
    .upsert(
      {
        merchant_id: merchantId,
        setup_steps: { ...current, permalinks: clean },
      },
      { onConflict: "merchant_id" },
    );
  if (error) throw new Error(error.message);
  return clean;
}
