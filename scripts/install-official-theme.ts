#!/usr/bin/env bun
/**
 * Install (and optionally activate) an official theme for one merchant through
 * the SAME server path the dashboard uses:
 *
 *   installOfficialTheme → store_themes + published v1 + draft + ledger + audit
 *   activateTheme        → the single active pointer + published_version_id
 *
 * This is an ADMIN, server-side action, so it authenticates with the service
 * role key from the environment (`.env` is loaded by Bun). Nothing here is a
 * new install mechanism: a one-off script only because there is no CLI for the
 * dashboard's Themes screen.
 *
 * Usage:
 *   bun scripts/install-official-theme.ts <merchant-slug> [theme-key] [--activate]
 *
 * Examples:
 *   bun scripts/install-official-theme.ts test songoskriti
 *   bun scripts/install-official-theme.ts flame-fashion-bd songoskriti --activate
 *
 * Rollback (returns the merchant to its previous look): delete the rows this
 * run created for that merchant — `store_themes` (cascades its versions and
 * drafts) and the `marketplace_installs` ledger row keyed
 * `official:<merchantId>:<key>`. Activation on a merchant that had another
 * active theme should be undone by re-activating the previous row.
 */
import { createClient } from "@supabase/supabase-js";
import {
  activateTheme,
  installOfficialTheme,
} from "../src/lib/themes/appearance.server";

const [slug, keyArg, ...flags] = process.argv.slice(2);
const key = keyArg && !keyArg.startsWith("--") ? keyArg : "songoskriti";
const activate = flags.includes("--activate") || keyArg === "--activate";

if (!slug) {
  console.error(
    "usage: bun scripts/install-official-theme.ts <merchant-slug> [theme-key] [--activate]",
  );
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(2);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: merchant, error: merchantError } = await db
  .from("merchants")
  .select("id, slug, name")
  .eq("slug", slug)
  .maybeSingle();
if (merchantError) {
  console.error("merchant lookup failed:", merchantError.message);
  process.exit(1);
}
if (!merchant) {
  console.error(`no merchant with slug ${slug}`);
  process.exit(1);
}

const merchantId = (merchant as { id: string }).id;
console.log(
  `merchant ${slug} (${merchantId}) — installing official:${key}` +
    (activate ? " then activating" : " (not activating)"),
);

const out = await installOfficialTheme(db as never, merchantId, key);
console.log(
  out.alreadyInstalled
    ? `already installed: store_themes ${out.id} (no writes)`
    : `installed: store_themes ${out.id}`,
);

if (activate) {
  await activateTheme(db as never, merchantId, out.id);
  console.log(`activated: store_themes ${out.id} is now the live theme`);
}

const { data: verify } = await db
  .from("store_themes")
  .select("id, name, is_active, published_version_id")
  .eq("merchant_id", merchantId)
  .order("updated_at", { ascending: false })
  .limit(5);
console.log("store_themes:", JSON.stringify(verify, null, 2));
