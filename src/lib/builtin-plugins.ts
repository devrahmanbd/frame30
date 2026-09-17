/**
 * Official verified plugins and widgets bridged into the marketplace catalog.
 *
 * These plugins are maintained by the platform, guaranteed to be compatible
 * with the builder AST line, and installable on-demand like in Shopify or
 * WordPress without requiring manual DB seeding.
 */
import type { PluginManifest } from "./plugin-manifest";
import { BUILTIN_PREFIX, type Kind } from "./marketplace.server";

export type BuiltinPluginDef = {
  manifest: PluginManifest;
  category: string;
  summaryEn: string;
  summaryBn: string;
  author: string;
  installCount: number;
  rating: number;
};

export const BUILTIN_PLUGINS: readonly BuiltinPluginDef[] = [
  {
    category: "support",
    author: "Framique",
    summaryEn: "Direct WhatsApp chat bubble on your storefront for instant customer messaging and order inquiries.",
    summaryBn: "স্টোরফ্রন্টে সরাসরি হোয়াটসঅ্যাপ চ্যাট বাবল — তাৎক্ষণিক গ্রাহক যোগাযোগ ও অর্ডার তথ্যের জন্য।",
    installCount: 1420,
    rating: 4.9,
    manifest: {
      id: "whatsapp-chat",
      name: "WhatsApp Quick Chat",
      version: "1.1.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "chat_bubble",
          label: "WhatsApp Chat Bubble",
          slots: ["footer"],
          entry: "framique.mount(document.createElement('div'))",
          height: 80,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "phone_number",
          label: "WhatsApp Phone Number (with country code e.g. 88017...)",
          kind: "text",
          default: "8801700000000",
        },
        {
          key: "greeting_message",
          label: "Default Greeting Message",
          kind: "text",
          default: "Hello! I am interested in your products.",
        },
        {
          key: "button_position",
          label: "Bubble Position",
          kind: "select",
          options: [
            { value: "bottom-right", label: "Bottom Right" },
            { value: "bottom-left", label: "Bottom Left" },
          ],
          default: "bottom-right",
        },
      ],
      i18n: {
        en: {
          phone_number: "WhatsApp Phone Number",
          greeting_message: "Default Greeting Message",
          button_position: "Bubble Position",
        },
        bn: {
          phone_number: "হোয়াটসঅ্যাপ ফোন নম্বর",
          greeting_message: "স্বাগত বার্তা",
          button_position: "বাবল অবস্থান",
        },
      },
      budget: { jsKb: 35, mainThreadMs: 15 },
    },
  },
  {
    category: "marketing",
    author: "Framique",
    summaryEn: "Points, badges and rewards program to boost repeat purchases and customer retention.",
    summaryBn: "ক্রেতাদের পয়েন্ট ও রিওয়ার্ড প্রোগ্রাম — পুনরাবৃত্ত অর্ডার বৃদ্ধির জন্য।",
    installCount: 980,
    rating: 4.8,
    manifest: {
      id: "loyalty-lite",
      name: "Loyalty Lite",
      version: "1.2.0",
      api: "^3.0.0",
      permissions: ["read_shop", "render_storefront"],
      widgets: [
        {
          key: "points_bar",
          label: "Shopper Points Bar",
          slots: ["main", "header"],
          entry: "framique.mount(document.createElement('div'))",
          height: 120,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "tier",
          label: "Default Membership Tier",
          kind: "select",
          options: [
            { value: "gold", label: "Gold Club" },
            { value: "silver", label: "Silver Club" },
            { value: "standard", label: "Standard Shopper" },
          ],
          default: "silver",
        },
        {
          key: "rate",
          label: "Points awarded per ৳100 spend",
          kind: "number",
          min: 1,
          max: 50,
          default: 5,
        },
        {
          key: "show_badge",
          label: "Display member tier badge on customer header",
          kind: "boolean",
          default: true,
        },
      ],
      i18n: {
        en: { tier: "Tier", rate: "Points per ৳100", show_badge: "Show badge" },
        bn: { tier: "টিয়ার", rate: "প্রতি ১০০ টাকায় পয়েন্ট", show_badge: "ব্যাজ প্রদর্শন" },
      },
      budget: { jsKb: 45, mainThreadMs: 20 },
    },
  },
  {
    category: "social",
    author: "Framique",
    summaryEn: "Verified buyer reviews, customer photos and 5-star ratings displayed beautifully on product pages.",
    summaryBn: "যাচাইকৃত ক্রেতা রিভিউ, ছবি ও রেটিং প্রোডাক্ট পেজে সুন্দরভাবে প্রদর্শনের প্লাগইন।",
    installCount: 2150,
    rating: 4.9,
    manifest: {
      id: "product-reviews",
      name: "Verified Product Reviews",
      version: "2.1.0",
      api: "^3.0.0",
      permissions: ["read_shop", "render_storefront"],
      widgets: [
        {
          key: "reviews_carousel",
          label: "Reviews Carousel",
          slots: ["main"],
          entry: "framique.mount(document.createElement('div'))",
          height: 300,
        },
        {
          key: "rating_badge",
          label: "Star Rating Badge",
          slots: ["main", "header"],
          entry: "framique.mount(document.createElement('div'))",
          height: 40,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "auto_approve",
          label: "Automatically publish 4 and 5 star reviews",
          kind: "boolean",
          default: true,
        },
        {
          key: "require_photo",
          label: "Only accept reviews containing product photos",
          kind: "boolean",
          default: false,
        },
        {
          key: "reviews_per_page",
          label: "Reviews displayed per page",
          kind: "number",
          min: 3,
          max: 20,
          default: 6,
        },
      ],
      i18n: {
        en: { auto_approve: "Auto-approve high ratings", require_photo: "Require photo", reviews_per_page: "Reviews per page" },
        bn: { auto_approve: "উচ্চ রেটিং স্বয়ংক্রিয় প্রকাশ", require_photo: "ছবি আবশ্যক", reviews_per_page: "প্রতি পেজে রিভিউ সংখ্যা" },
      },
      budget: { jsKb: 60, mainThreadMs: 30 },
    },
  },
  {
    category: "fulfillment",
    author: "Framique",
    summaryEn: "Real-time delivery status checker for Steadfast, Pathao, RedX and Paperfly parcel deliveries.",
    summaryBn: "স্টেডফাস্ট, পাঠাও ও রেডএক্স পার্সেল ট্র্যাকিং উইজেট — ক্রেতা ফোন নম্বর দিয়ে স্ট্যাটাস দেখতে পারে।",
    installCount: 1840,
    rating: 4.7,
    manifest: {
      id: "order-tracker",
      name: "Live Courier & Order Tracker",
      version: "1.3.0",
      api: "^3.0.0",
      permissions: ["read_shop", "render_storefront"],
      widgets: [
        {
          key: "track_input",
          label: "Order Tracking Search Bar",
          slots: ["main", "footer"],
          entry: "framique.mount(document.createElement('div'))",
          height: 140,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "support_phone",
          label: "Helpline phone number shown on delay",
          kind: "text",
          default: "01700000000",
        },
        {
          key: "show_courier_name",
          label: "Show courier partner name in timeline",
          kind: "boolean",
          default: true,
        },
      ],
      i18n: {
        en: { support_phone: "Support phone", show_courier_name: "Show courier name" },
        bn: { support_phone: "সাপোর্ট নম্বর", show_courier_name: "কুরিয়ারের নাম প্রদর্শন" },
      },
      budget: { jsKb: 40, mainThreadMs: 20 },
    },
  },
  {
    category: "conversion",
    author: "Framique",
    summaryEn: "Real-time sales alerts and recent purchase popups to create urgency and social proof.",
    summaryBn: "সাম্প্রতিক অর্ডার নোটিফিকেশন — ক্রেতার আস্থার সাথে সেলস কনভার্সন বৃদ্ধির জন্য।",
    installCount: 3100,
    rating: 4.8,
    manifest: {
      id: "social-proof",
      name: "Social Proof Popups",
      version: "1.0.4",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "recent_sales_pill",
          label: "Recent Sales Alert Pill",
          slots: ["footer"],
          entry: "framique.mount(document.createElement('div'))",
          height: 60,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "display_interval_sec",
          label: "Seconds between popup notifications",
          kind: "number",
          min: 5,
          max: 60,
          default: 12,
        },
        {
          key: "show_city",
          label: "Display customer district / city (e.g. Someone in Sylhet bought...)",
          kind: "boolean",
          default: true,
        },
      ],
      i18n: {
        en: { display_interval_sec: "Popup interval (seconds)", show_city: "Show customer city" },
        bn: { display_interval_sec: "পপআপ বিরতি (সেকেন্ড)", show_city: "ক্রেতার জেলা প্রদর্শন" },
      },
      budget: { jsKb: 30, mainThreadMs: 15 },
    },
  },
  {
    category: "security",
    author: "Framique",
    summaryEn: "Detect and block invalid bot clicks and scraper traffic from wasting your marketing ad spend.",
    summaryBn: "বিজ্ঞাপন বাজেট সুরক্ষা — বট ক্লিক ও স্ক্র্যাপার শনাক্ত করে নষ্ট হওয়া বাজেট রক্ষা করুন।",
    installCount: 820,
    rating: 4.9,
    manifest: {
      id: "ad-shield",
      name: "Ad Defense & Click Fraud Shield",
      version: "1.0.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "bot_detector",
          label: "Bot Click Shield Sensor",
          slots: ["footer"],
          entry: "framique.mount(document.createElement('div'))",
          height: 0,
        },
      ],
      hooks: [],
      settings: [
        {
          key: "aggressive_mode",
          label: "Aggressive block on repeat suspicious IPs",
          kind: "boolean",
          default: false,
        },
        {
          key: "log_blocked_ips",
          label: "Keep audit logs of blocked click attempts",
          kind: "boolean",
          default: true,
        },
      ],
      i18n: {
        en: { aggressive_mode: "Aggressive mode", log_blocked_ips: "Log blocked attempts" },
        bn: { aggressive_mode: "কঠোর সুরক্ষা মোড", log_blocked_ips: "ব্লক করা ক্লিক লগ রাখুন" },
      },
      budget: { jsKb: 25, mainThreadMs: 10 },
    },
  },
];

export function getBuiltinPlugin(pluginId: string): BuiltinPluginDef | undefined {
  return BUILTIN_PLUGINS.find((p) => p.manifest.id === pluginId);
}

/**
 * Built-in plugins as synthetic marketplace widget entries.
 */
export function builtinWidgets() {
  return BUILTIN_PLUGINS.map((p) => ({
    id: `${BUILTIN_PREFIX}${p.manifest.id}`,
    seller_merchant_id: null as string | null,
    name: p.manifest.name,
    slug: p.manifest.id,
    description: p.summaryEn,
    vendor_name: p.author,
    thumbnail_url: null as string | null,
    category: p.category,
    version: p.manifest.version,
    compatible_versions: [] as string[],
    price_minor_int: 0,
    currency_code: "BDT",
    trial_allowed: false,
    status: "active",
    manifest: p.manifest as unknown,
    version_history: [] as string[],
    install_count: p.installCount,
    rating_sum: p.rating * p.installCount,
    rating_count: p.installCount,
    created_at: new Date(0).toISOString(),
    kind: "widget" as const,
    compatible: true,
    rating: p.rating,
    mine: false,
    builtin: true as const,
  }));
}
