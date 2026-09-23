import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export async function isApprovedDeveloper(
  db: Client,
  merchantId: string,
): Promise<boolean> {
  const { data } = await (db as SupabaseClient).from("theme_developers")
    .select("merchant_id")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data !== null;
}
