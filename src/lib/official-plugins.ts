/**
 * K1 — official plugin catalogue, pure layer.
 *
 * Theme-side parity (`OFFICIAL_THEME_KEYS` in `src/lib/themes/appearance.ts`):
 * the plugin catalogue names its official entries explicitly instead of
 * treating every builtin as official-by-convention. Exactly three entries —
 * Reviews, Analytics, WhatsApp Orders — each a catalogue row pointing at an
 * internally-built artifact (the exact ZIP `installPackage` installs; only
 * the serializable ref — checksum + version + fileName + `official:<key>`
 * pin — ever leaves the server, never the bytes, so there is nothing to
 * download).
 *
 * Source verification (K1 context step): no dedicated Reviews / Analytics /
 * WhatsApp-Orders plugin sources exist anywhere in the repo — the only
 * official plugin sources are the six `BUILTIN_PLUGINS` manifests in
 * `src/lib/builtin-plugins.ts`. Per the brief fallback the entries below are
 * therefore backed by builtin-plugins manifest data:
 * - Reviews ......... `product-reviews` (Verified Product Reviews)
 * - Analytics ....... authored `store-analytics` manifest data in this file
 *                     (no analytics builtin exists; the data is validated by
 *                     the same `parseManifest` + `validateBundle` gates the
 *                     install pipeline runs, so it can never describe a plugin
 *                     the pipeline would refuse)
 * - WhatsApp Orders . `whatsapp-chat` (WhatsApp Quick Chat — the WhatsApp
 *                     channel entry, whose summary covers order inquiries)
 *
 * No Supabase, no React — tests drive this file directly, and
 * `official-plugins.server.ts` builds the install bytes from these sources.
 */

import { getBuiltinPlugin } from "./builtin-plugins";

/* ------------------------------------------------- official keys (K1) */

/**
 * Framique-built plugins. Exactly these three — any other catalogue key
 * (including the remaining builtins) is community, never official.
 */
export const OFFICIAL_PLUGIN_KEYS = [
  "product-reviews",
  "store-analytics",
  "whatsapp-chat",
] as const;

export type OfficialPluginKey = (typeof OFFICIAL_PLUGIN_KEYS)[number];

export type PluginProvenance = "official" | "community";

/** Ledger/catalogue pin for an official artifact: `official:<key>`. */
export const OFFICIAL_PLUGIN_PIN_PREFIX = "official:";

export function officialPluginPinFor(key: string): string {
  return `${OFFICIAL_PLUGIN_PIN_PREFIX}${key}`;
}

/** True for the three official keys only — any other key is never official. */
export function isOfficialPluginKey(key: string): key is OfficialPluginKey {
  return (OFFICIAL_PLUGIN_KEYS as readonly string[]).includes(key);
}

/**
 * Serializable artifact identity surfaced on official catalogue entries.
 * Mirrors the theme `OfficialArtifactRef` contract: checksum of the exact
 * ZIP the pipeline installs, the manifest version pinned inside it, the
 * archive name handed to `installPackage`, and the `official:<key>` pin.
 * The bytes themselves stay server-side (exporter-owned, never exposed).
 */
export type OfficialPluginArtifactRef = {
  checksum: string;
  version: string;
  fileName: string;
  pinned: string;
};

export function officialPluginArtifactRef(
  key: OfficialPluginKey,
  version: string,
  checksum: string,
): OfficialPluginArtifactRef {
  return {
    checksum,
    version,
    fileName: `${key}.zip`,
    pinned: officialPluginPinFor(key),
  };
}

/* ------------------------------------------------- analytics source data
 *
 * No analytics builtin exists (verified: `builtin-plugins.ts` ships
 * whatsapp-chat, loyalty-lite, product-reviews, order-tracker, social-proof
 * and ad-shield only), so the Analytics catalogue entry carries its manifest
 * data here. Field-for-field inside the gates the pipeline runs:
 * lowercase-hyphen id, semver version, api range, known scopes only (widgets
 * present ⇒ `render_storefront` required), valid slots, a Class-A entry with
 * no dynamic code, typed settings, en+bn dictionaries, budget within
 * `PLUGIN_BUDGET`. The exporter gate (`gateExportManifest`) and the pipeline
 * validator (`pkg1PluginValidator`) both re-run `parseManifest` +
 * `validateBundle` over this object, so drift fails closed at build time.
 */

export const STORE_ANALYTICS_MANIFEST = {
  id: "store-analytics",
  name: "Store Analytics",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["read_orders", "read_shop", "render_storefront", "write_analytics"],
  widgets: [
    {
      key: "sales_overview",
      label: "Sales Overview",
      slots: ["main"],
      entry: "framique.mount(document.createElement('div'))",
      height: 300,
    },
  ],
  hooks: [],
  settings: [
    {
      key: "range_days",
      label: "Default date range (days)",
      kind: "number",
      min: 7,
      max: 90,
      default: 30,
    },
    {
      key: "show_orders",
      label: "Show order counts on the overview",
      kind: "boolean",
      default: true,
    },
  ],
  i18n: {
    en: {
      range_days: "Default date range (days)",
      show_orders: "Show order counts",
    },
    bn: {
      range_days: "ডিফল্ট তারিখের পরিসর (দিন)",
      show_orders: "অর্ডার সংখ্যা প্রদর্শন",
    },
  },
  budget: { jsKb: 40, mainThreadMs: 20 },
};

const STORE_ANALYTICS_META = {
  nameEn: "Store Analytics",
  nameBn: "স্টোর অ্যানালিটিক্স",
  summaryEn:
    "Sales, orders and traffic overview for your storefront, computed from your own shop data.",
  summaryBn:
    "আপনার স্টোরের বিক্রি, অর্ডার ও ট্রাফিক ওভারভিউ — নিজের শপ ডেটা থেকে।",
  category: "analytics",
} as const;

/* ------------------------------------------------- source resolution */

export type OfficialPluginSource = {
  key: OfficialPluginKey;
  /** Backing manifest data (builtin manifest, or the authored analytics one). */
  manifest: unknown;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  author: string;
};

/**
 * Backing source for an official key, or null for anything unofficial (or a
 * builtin that went missing — a catalogue entry must never render without
 * installable bytes behind it).
 */
export function officialPluginSource(
  key: string,
): OfficialPluginSource | null {
  if (!isOfficialPluginKey(key)) return null;
  if (key === "store-analytics") {
    return {
      key,
      manifest: STORE_ANALYTICS_MANIFEST,
      ...STORE_ANALYTICS_META,
      author: "Framique",
    };
  }
  const found = getBuiltinPlugin(key);
  if (!found) return null;
  return {
    key,
    manifest: found.manifest,
    nameEn: found.manifest.name,
    nameBn: found.manifest.name,
    summaryEn: found.summaryEn,
    summaryBn: found.summaryBn,
    category: found.category,
    author: found.author,
  };
}

/**
 * First-party registration for an official key: source manifest + display
 * metadata, built from in-repo source. Carries NO install bytes — custom
 * merchant ZIPs keep the `installPackage` pipeline exclusively, and the
 * server builds official install material from this source at install time
 * (never a checked-in or downloadable archive).
 */
export function getOfficialPlugin(
  key: string,
): OfficialPluginSource | null {
  return officialPluginSource(key);
}

/* ------------------------------------------------- catalogue row shape */

/**
 * Client-safe official catalogue row: display metadata plus the artifact ref.
 * The install bytes behind `artifact` stay server-side (see
 * `official-plugins.server.ts`); clients pin/verify by checksum, never fetch.
 */
export type OfficialPluginCatalogRow = {
  key: string;
  name: string;
  summary: string;
  author: string;
  category: string;
  version: string;
  /** Always `official` — community rows come from the registry listings. */
  provenance: PluginProvenance;
  artifact: OfficialPluginArtifactRef;
};

export function officialPluginRow(
  source: OfficialPluginSource,
  version: string,
  checksum: string,
): OfficialPluginCatalogRow {
  return {
    key: source.key,
    name: source.nameEn,
    summary: source.summaryEn,
    author: source.author,
    category: source.category,
    version,
    provenance: "official",
    artifact: officialPluginArtifactRef(source.key, version, checksum),
  };
}
