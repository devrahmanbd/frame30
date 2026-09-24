/**
 * Official verified plugins and widgets bridged into the marketplace catalog.
 *
 * These plugins are maintained by the platform, guaranteed to be compatible
 * with the builder AST line, and installable on-demand like in Shopify or
 * WordPress without requiring manual DB seeding.
 */
import type { PluginManifest } from "./plugin-manifest";
import type { Kind } from "./marketplace.server";

/**
 * Synthetic listing ids for official built-ins (never touch the ledger).
 * Lives here — not in marketplace.server — so the catalog import graph
 * stays acyclic (marketplace.server imports this module for the mappers).
 */
export const BUILTIN_PREFIX = "preset:";

export type BuiltinPluginDef = {
  manifest: PluginManifest;
  category: string;
  summaryEn: string;
  summaryBn: string;
  author: string;
};

export const BUILTIN_PLUGINS: readonly BuiltinPluginDef[] = [
  {
    category: "support",
    author: "Framique",
    summaryEn:
      "Direct WhatsApp chat bubble on your storefront for instant customer messaging and order inquiries.",
    summaryBn:
      "স্টোরফ্রন্টে সরাসরি হোয়াটসঅ্যাপ চ্যাট বাবল — তাৎক্ষণিক গ্রাহক যোগাযোগ ও অর্ডার তথ্যের জন্য।",
    manifest: {
      id: "whatsapp-chat",
      name: "WhatsApp Quick Chat",
      version: "1.2.3",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "chat_bubble",
          label: "WhatsApp Chat Bubble",
          slots: ["footer"],
          floating: true,
          entry: `(function () {
  var CSS = "@keyframes waPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}"
    + "@keyframes waPulse{0%{box-shadow:0 4px 14px rgba(0,0,0,.25),0 0 0 0 rgba(37,211,102,.55)}70%{box-shadow:0 4px 14px rgba(0,0,0,.25),0 0 0 9px rgba(37,211,102,0)}100%{box-shadow:0 4px 14px rgba(0,0,0,.25),0 0 0 0 rgba(37,211,102,0)}}"
    + "@keyframes waBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"
    + "@keyframes waJump{0%,100%{transform:translateY(0) scale(1)}30%{transform:translateY(-6px) scale(1.03)}55%{transform:translateY(0) scale(.98)}75%{transform:scale(1)}}";
  function mount(s) {
    var phone = String(s.phone_number || "").replace(/[^0-9]/g, "");
    if (!phone) return;
    var greet = String(s.greeting_message || "Hello!");
    var anim = String(s.animation || "pulse");
    var reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
    try {
      var st = document.createElement("style");
      st.textContent = CSS;
      document.head.appendChild(st);
    } catch (e) {}
    var a = document.createElement("a");
    a.setAttribute("href", "https://wa.me/" + phone + "?text=" + encodeURIComponent(greet));
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    a.setAttribute("aria-label", "Chat on WhatsApp");
    a.style.width = "56px";
    a.style.height = "56px";
    a.style.margin = "8px";
    a.style.borderRadius = "50%";
    a.style.background = "transparent";
    a.style.display = "flex";
    a.style.alignItems = "center";
    a.style.justifyContent = "center";
    a.style.filter = "drop-shadow(0 4px 14px rgba(0,0,0,.25))";
    var mode = (reduce || anim === "off") ? "" : anim;
    a.style.animation = mode === "bounce" ? "waPop .45s ease-out,waBounce 2.2s ease-in-out .5s infinite"
      : mode === "jump" ? "waPop .45s ease-out,waJump 2.6s ease-in-out .5s infinite"
      : mode === "pulse" ? "waPop .45s ease-out,waPulse 2.2s ease-out .6s infinite"
      : "waPop .35s ease-out";
    a.innerHTML = '<svg width="56" height="56" viewBox="0 0 512 512" fill="none" aria-hidden="true"><path fill="#b3b3b3" d="m143.8 431.2l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c0-56.1-21.8-108.8-61.4-148.4c-39.3-39.5-92.7-61.7-148.4-61.5c-115.8 0-209.9 94.1-210 209.8c-.1 39.5 11.1 78.2 32.1 111.7l5 7.9L64.4 452zM3.7 512l35.8-130.8C17.5 342.9 5.8 299.5 5.9 255C5.9 115.8 119.2 2.6 258.4 2.6c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6c-.1 139.2-113.3 252.4-252.5 252.4h-.1c-42.3 0-83.8-10.6-120.7-30.7z"></path><path fill="#fff" d="M1.1 509.4L37 378.6C14.8 340.2 3.2 296.7 3.3 252.4C3.3 113.2 116.6 0 255.8 0c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6C508.2 391.8 394.9 505 255.8 505h-.1c-42.3 0-83.8-10.6-120.7-30.7z"></path><linearGradient id="waBubbleGrad" x1="254.658" x2="256.786" y1="345.363" y2="704.074" gradientTransform="translate(0 -277.552)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#57d163"></stop><stop offset="1" stop-color="#23b33a"></stop></linearGradient><path fill="url(#waBubbleGrad)" d="M255.8 42.6c-115.8 0-209.9 94.1-210 209.8c0 39.5 11.2 78.2 32.2 111.7l5 7.9l-21.2 77.4l79.4-20.8l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c.2-55.7-21.9-109.1-61.4-148.4c-39.3-39.4-92.8-61.6-148.5-61.5"></path><path fill="#fff" fill-rule="evenodd" d="M192.7 146.9c-4.7-10.5-9.7-10.7-14.2-10.9l-12.1-.1c-4.2 0-11 1.6-16.8 7.9s-22.1 21.6-22.1 52.6s22.6 61 25.8 65.2s43.6 69.9 107.8 95.2c53.3 21 64.1 16.8 75.7 15.8c11.6-1.1 37.3-15.3 42.6-30s5.3-27.4 3.7-30s-5.8-4.2-12.1-7.4s-37.3-18.4-43.1-20.5s-10-3.2-14.2 3.2c-4.2 6.3-16.3 20.5-20 24.7s-7.4 4.7-13.7 1.6c-6.3-3.2-26.6-9.8-50.7-31.3c-18.8-16.7-31.4-37.4-35.1-43.7s-.4-9.7 2.8-12.9c2.8-2.8 6.3-7.4 9.5-11.1s4.2-6.3 6.3-10.5s1.1-7.9-.5-11.1c-1.8-3-14-34.2-19.6-46.7"></path></svg>';
    framique.mount(a);
  }
  try {
    framique.call("plugin.settings", {}).then(function (s) { mount(s || {}); }, function () {});
  } catch (e) {}
})();`,
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
        {
          key: "animation",
          label: "Bubble Animation",
          kind: "select",
          options: [
            { value: "pulse", label: "Pulse ring (default)" },
            { value: "bounce", label: "Gentle bounce" },
            { value: "jump", label: "Attention jump" },
            { value: "off", label: "Off (entrance pop only)" },
          ],
          default: "pulse",
        },
      ],
      i18n: {
        en: {
          phone_number: "WhatsApp Phone Number",
          greeting_message: "Default Greeting Message",
          button_position: "Bubble Position",
          animation: "Bubble Animation",
        },
        bn: {
          phone_number: "হোয়াটসঅ্যাপ ফোন নম্বর",
          greeting_message: "স্বাগত বার্তা",
          button_position: "বাবল অবস্থান",
          animation: "বাবল অ্যানিমেশন",
        },
      },
      budget: { jsKb: 35, mainThreadMs: 15 },
    },
  },
  {
    category: "marketing",
    author: "Framique",
    summaryEn:
      "Points, badges and rewards program to boost repeat purchases and customer retention.",
    summaryBn:
      "ক্রেতাদের পয়েন্ট ও রিওয়ার্ড প্রোগ্রাম — পুনরাবৃত্ত অর্ডার বৃদ্ধির জন্য।",
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
        bn: {
          tier: "টিয়ার",
          rate: "প্রতি ১০০ টাকায় পয়েন্ট",
          show_badge: "ব্যাজ প্রদর্শন",
        },
      },
      budget: { jsKb: 45, mainThreadMs: 20 },
    },
  },
  {
    category: "social",
    author: "Framique",
    summaryEn:
      "Verified buyer reviews, customer photos and 5-star ratings displayed beautifully on product pages.",
    summaryBn:
      "যাচাইকৃত ক্রেতা রিভিউ, ছবি ও রেটিং প্রোডাক্ট পেজে সুন্দরভাবে প্রদর্শনের প্লাগইন।",
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
        en: {
          auto_approve: "Auto-approve high ratings",
          require_photo: "Require photo",
          reviews_per_page: "Reviews per page",
        },
        bn: {
          auto_approve: "উচ্চ রেটিং স্বয়ংক্রিয় প্রকাশ",
          require_photo: "ছবি আবশ্যক",
          reviews_per_page: "প্রতি পেজে রিভিউ সংখ্যা",
        },
      },
      budget: { jsKb: 60, mainThreadMs: 30 },
    },
  },
  {
    category: "fulfillment",
    author: "Framique",
    summaryEn:
      "Real-time delivery status checker for Steadfast, Pathao, RedX and Paperfly parcel deliveries.",
    summaryBn:
      "স্টেডফাস্ট, পাঠাও ও রেডএক্স পার্সেল ট্র্যাকিং উইজেট — ক্রেতা ফোন নম্বর দিয়ে স্ট্যাটাস দেখতে পারে।",
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
        en: {
          support_phone: "Support phone",
          show_courier_name: "Show courier name",
        },
        bn: {
          support_phone: "সাপোর্ট নম্বর",
          show_courier_name: "কুরিয়ারের নাম প্রদর্শন",
        },
      },
      budget: { jsKb: 40, mainThreadMs: 20 },
    },
  },
  {
    category: "conversion",
    author: "Framique",
    summaryEn:
      "Real-time sales alerts and recent purchase popups to create urgency and social proof.",
    summaryBn:
      "সাম্প্রতিক অর্ডার নোটিফিকেশন — ক্রেতার আস্থার সাথে সেলস কনভার্সন বৃদ্ধির জন্য।",
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
          label:
            "Display customer district / city (e.g. Someone in Sylhet bought...)",
          kind: "boolean",
          default: true,
        },
      ],
      i18n: {
        en: {
          display_interval_sec: "Popup interval (seconds)",
          show_city: "Show customer city",
        },
        bn: {
          display_interval_sec: "পপআপ বিরতি (সেকেন্ড)",
          show_city: "ক্রেতার জেলা প্রদর্শন",
        },
      },
      budget: { jsKb: 30, mainThreadMs: 15 },
    },
  },
  {
    category: "security",
    author: "Framique",
    summaryEn:
      "Detect and block invalid bot clicks and scraper traffic from wasting your marketing ad spend.",
    summaryBn:
      "বিজ্ঞাপন বাজেট সুরক্ষা — বট ক্লিক ও স্ক্র্যাপার শনাক্ত করে নষ্ট হওয়া বাজেট রক্ষা করুন।",
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
        en: {
          aggressive_mode: "Aggressive mode",
          log_blocked_ips: "Log blocked attempts",
        },
        bn: {
          aggressive_mode: "কঠোর সুরক্ষা মোড",
          log_blocked_ips: "ব্লক করা ক্লিক লগ রাখুন",
        },
      },
      budget: { jsKb: 25, mainThreadMs: 10 },
    },
  },
];

export function getBuiltinPlugin(
  pluginId: string,
): BuiltinPluginDef | undefined {
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
    // Null on the wire (TanStack server fns must return serializable
    // data): the install path re-reads the manifest via getBuiltinPlugin.
    manifest: null,
    version_history: [] as string[],
    // Honest zeros: these shipped today with no installs and no reviews.
    // Counts and ratings accumulate from real marketplace_installs rows.
    install_count: 0,
    rating_sum: 0,
    rating_count: 0,
    created_at: new Date(0).toISOString(),
    kind: "widget" as const,
    compatible: true,
    rating: null as number | null,
    mine: false,
    builtin: true as const,
  }));
}
