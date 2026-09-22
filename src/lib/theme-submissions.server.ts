import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isApprovedDeveloper } from "./theme-developers.server";
import { validateThemePackage } from "./theme-package";

type Client = SupabaseClient<Database>;

export type SubmissionStatus = "pending" | "approved" | "rejected";

export async function submitThemePackage(
  db: Client,
  merchantId: string,
  pkg: unknown,
): Promise<{ id: string }> {
  if (!(await isApprovedDeveloper(db, merchantId))) {
    throw new Error("not an approved developer");
  }
  const checked = validateThemePackage(pkg);
  if (!checked.ok) throw new Error(checked.errors[0] ?? "Package invalid");
  const { data, error } = await (db as SupabaseClient)
    .from("theme_submissions")
    .insert({ merchant_id: merchantId, package: pkg, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function decideThemeSubmission(
  db: Client,
  id: string,
  approve: boolean,
  note?: string,
): Promise<{ status: SubmissionStatus }> {
  const client = db as SupabaseClient;
  const { data: row, error: readError } = await client
    .from("theme_submissions")
    .select("id, merchant_id, package, status")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("submission not found");
  const current = row as { status: string; package: unknown };
  if (current.status !== "pending") {
    throw new Error("submission already decided");
  }
  const status: SubmissionStatus = approve ? "approved" : "rejected";
  const { error: writeError } = await client
    .from("theme_submissions")
    .update({
      status,
      reviewer_note: note ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (writeError) throw writeError;
  if (approve) {
    // Re-validate the stored payload: the validator may have tightened
    // since submission, and only a clean package may enter the serving path.
    const checked = validateThemePackage(current.package);
    if (!checked.ok) throw new Error(checked.errors[0] ?? "Package invalid");
    const preset = checked.preset;
    // Row shape mirrors public.theme_registry, the serving path read by
    // listRegistry and installed by installRegistryTheme (themes.server.ts).
    const { error: publishError } = await client.from("theme_registry").upsert(
      {
        key: preset.key,
        name_en: preset.nameEn,
        name_bn: preset.nameBn,
        summary_en: preset.summaryEn,
        summary_bn: preset.summaryBn,
        category: preset.category,
        version: preset.version,
        preset: { tokens: preset.tokens, templates: preset.templates },
        active: true,
        sort_order: preset.sortOrder,
      },
      { onConflict: "key" },
    );
    if (publishError) throw publishError;
  }
  return { status };
}
