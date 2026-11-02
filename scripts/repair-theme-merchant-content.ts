#!/usr/bin/env bun
/**
 * Repair Theme Merchant Content
 *
 * Scans active themes for merchants and re-publishes adapted templates:
 * - Substitutes Songoskriti / সংস্কৃতি brand names with merchant name
 * - Strips unconfigured care@songoskriti.com or phone numbers
 * - Strips sample disclaimer copy on product templates
 * - Creates a new published theme_versions row (v+1)
 * - Updates store_themes.published_version_id and theme_drafts
 * - Triggers purgeStorefront for zero-downtime cache invalidation
 *
 * Usage:
 *   bun scripts/repair-theme-merchant-content.ts [merchant-slug] [--all]
 *
 * Examples:
 *   bun scripts/repair-theme-merchant-content.ts flame-fashion-bd
 *   bun scripts/repair-theme-merchant-content.ts --all
 */
import { createClient } from "@supabase/supabase-js";
import { adaptThemeTemplatesForMerchant } from "../src/lib/themes/merchant-adapt";
import type { ThemeTemplates } from "../src/lib/builder-ast";

const [targetArg, ...flags] = process.argv.slice(2);
const runAll = targetArg === "--all" || flags.includes("--all");
const targetSlug = targetArg && !targetArg.startsWith("--") ? targetArg : (!runAll ? "flame-fashion-bd" : null);

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(2);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = db.from("merchants").select("id, slug, name");
if (!runAll && targetSlug) {
  query = query.eq("slug", targetSlug);
}

const { data: merchants, error: merchantsErr } = await query;
if (merchantsErr || !merchants || merchants.length === 0) {
  console.error("No matching merchants found:", merchantsErr);
  process.exit(1);
}

console.log(`Checking ${merchants.length} merchant(s)...`);

for (const merchant of merchants) {
  const { data: activeTheme, error: themeErr } = await db
    .from("store_themes")
    .select("id, name, published_version_id, source_listing_slug")
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .maybeSingle();

  if (themeErr || !activeTheme) {
    console.log(`[${merchant.slug}] No active theme found, skipping.`);
    continue;
  }

  const { data: settings } = await db
    .from("merchant_settings")
    .select("support_email, support_phone")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  // Load current published version
  let currentVersion: any = null;
  if (activeTheme.published_version_id) {
    const { data: v } = await db
      .from("theme_versions")
      .select("*")
      .eq("id", activeTheme.published_version_id)
      .maybeSingle();
    currentVersion = v;
  }

  if (!currentVersion) {
    const { data: v } = await db
      .from("theme_versions")
      .select("*")
      .eq("theme_id", activeTheme.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    currentVersion = v;
  }

  if (!currentVersion || !currentVersion.templates) {
    console.log(`[${merchant.slug}] No version templates found for theme ${activeTheme.id}, skipping.`);
    continue;
  }

  const currentTemplates = currentVersion.templates as ThemeTemplates;
  const adaptedTemplates = adaptThemeTemplatesForMerchant(currentTemplates, {
    name: merchant.name,
    supportEmail: settings?.support_email,
    supportPhone: settings?.support_phone,
  });

  const nextVersionNum = (currentVersion.version || 1) + 1;
  const now = new Date().toISOString();

  console.log(`[${merchant.slug}] Publishing adapted version v${nextVersionNum} for theme '${activeTheme.name}' (${activeTheme.id})...`);

  // Insert new published theme_version
  const { data: newVersion, error: insertErr } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchant.id,
      theme_id: activeTheme.id,
      version: nextVersionNum,
      status: "published",
      published_at: now,
      label: `Repaired merchant content (v${nextVersionNum})`,
      templates: adaptedTemplates as never,
      tokens: currentVersion.tokens as never,
      source_registry_key: currentVersion.source_registry_key,
      source_registry_version: currentVersion.source_registry_version,
      created_by: null,
    })
    .select("id")
    .single();

  if (insertErr || !newVersion) {
    console.error(`[${merchant.slug}] Failed to insert theme_version:`, insertErr);
    continue;
  }

  // Update store_themes.published_version_id
  const { error: updateThemeErr } = await db
    .from("store_themes")
    .update({ published_version_id: newVersion.id })
    .eq("id", activeTheme.id);

  if (updateThemeErr) {
    console.error(`[${merchant.slug}] Failed to update store_themes:`, updateThemeErr);
  }

  // Update theme_drafts
  const { error: draftErr } = await db
    .from("theme_drafts")
    .update({
      templates: adaptedTemplates as never,
      updated_at: now,
    })
    .eq("theme_id", activeTheme.id);

  if (draftErr) {
    console.warn(`[${merchant.slug}] Note: draft update returned:`, draftErr.message);
  }

  // Invalidate storefront cache
  try {
    const { purgeStorefront } = await import("../src/lib/themes.server");
    await purgeStorefront("publish", merchant.id);
    console.log(`[${merchant.slug}] Storefront cache purged.`);
  } catch (purgeErr) {
    console.warn(`[${merchant.slug}] Cache purge skipped or failed:`, purgeErr);
  }

  console.log(`[${merchant.slug}] Successfully published adapted version v${nextVersionNum}!`);
}

console.log("Done.");
