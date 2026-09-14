/**
 * Content module for `/builder` — the storefront theme/section builder page.
 *
 * Pure data, no React/JSX. The route file (`src/routes/builder.tsx`) is the
 * only consumer; this separation keeps the copy deck's exact wording under
 * version control as typed data rather than scattered JSX literals, and lets
 * `builder.tsx` pass the same FAQ array to both `<FaqBand>` and
 * `buildGraph({ faq })` so the rendered text and the FAQPage JSON-LD can never
 * drift apart.
 *
 * Source of truth: docs/05-marketing/copy/04-builder.md. Every string here is
 * copied verbatim (or trivially wrapped) from that deck — nothing invented,
 * no metrics that aren't already stated as worked-example assumptions in the
 * deck itself (and those are labelled as illustrations, never as measured
 * facts, exactly as the deck insists).
 */

export type Bilingual = { en: string; bn?: string };

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: "Visual builder · versioned",
  title: "Design the storefront. Don't fight the theme.",
  titleBn: "স্টোরফ্রন্ট ডিজাইন করুন। থিমের সাথে লড়াই নয়।",
  sub: "Drag sections, edit tokens, ship a version — with instant rollback.",
  subBn: "সেকশন টেনে আনুন, টোকেন এডিট করুন, একটি ভার্সন পাবলিশ করুন — সাথে সাথে রোলব্যাকের সুযোগসহ।",
  primaryCta: "Open a live demo",
  altCta: "See a store built with it",
};

/* -------------------------------------------------------------------------- */
/* Canvas mock — glass browser frame                                          */
/* -------------------------------------------------------------------------- */

export const canvasMock = {
  title: "The editor renders exactly what the storefront serves",
  caption: "The same renderer draws the editor and the live store, so preview is not an approximation.",
  captionBn: "এডিটর ও লাইভ স্টোর একই রেন্ডারার ব্যবহার করে, তাই প্রিভিউ কোনো অনুমান নয়।",
  body:
    "Most page builders run a simplified preview renderer that diverges from production CSS, web fonts, and JS at the margins — the classic \"it looked right in the editor\" complaint. Framique's editor iframe loads the identical theme bundle the storefront serves, so what you see in the canvas is pixel-identical to what a shopper on a Grameenphone 4G connection in Bogura sees.",
  rail: ["Hero section", "Product grid", "Announcement bar", "Testimonial strip"],
  tokens: ["Primary colour", "Accent colour", "Corner radius", "Type scale"],
};

/* -------------------------------------------------------------------------- */
/* Section 3 — section-based editing model (Z rows)                          */
/* -------------------------------------------------------------------------- */

export const editingRows = [
  {
    id: "sections",
    direction: "left" as const,
    eyebrow: "Sections, not HTML",
    title: "Sections, not a page of HTML.",
    body: "Add a hero, a product grid, a testimonial strip, a Bangla-only announcement bar. Each section carries its own settings, its own Bangla copy, and its own visibility rules (device, audience segment, date window, A/B arm). Sections are drag-reordered on the rail; there is no way to \"break the layout\" by nesting divs incorrectly, because there are no divs to nest.",
    proof: "Per-section visibility by audience or experiment.",
  },
  {
    id: "tokens",
    direction: "right" as const,
    eyebrow: "Tokens, not scattered CSS",
    title: "Tokens, not scattered CSS.",
    body: "Colour, radius, type scale, and spacing live in one panel. Change the accent colour once and every button, badge, and link across every section updates together — no hunting through forty section-level colour pickers left over from a theme you customised eighteen months ago.",
    proof: "One token, every section.",
  },
  {
    id: "versions",
    direction: "left" as const,
    eyebrow: "Versions, not fear",
    title: "Versions, not fear.",
    body: "Every publish is a version with an author and a timestamp. Compare two versions side by side, restore an older one, or roll back mid-campaign without opening a support ticket.",
    proof: "Rollback is one click, not a restore ticket.",
  },
  {
    id: "sandboxed-code",
    direction: "right" as const,
    eyebrow: "Custom code with a seatbelt",
    title: "Custom code with a seatbelt.",
    body: "Drop in HTML, a tracking pixel, or a third-party widget and it renders inside an isolated frame that cannot reach the DOM outside itself, so a broken script degrades gracefully instead of white-screening checkout.",
    proof: "Sandboxed widgets, isolated failures.",
  },
];

/* -------------------------------------------------------------------------- */
/* Section 4 — publish lifecycle table                                       */
/* -------------------------------------------------------------------------- */

export const lifecycle = {
  title: "Drafts, autosave, versioning, rollback, scheduled publish",
  intro:
    "Every keystroke in the builder writes to a draft, autosaved roughly every few seconds to a working copy that never touches the live store. Nothing you type in the canvas is visible to a shopper until you explicitly publish. This separation — draft vs. live — is the single most important safety property of the editing model.",
  worked:
    "Versions are numbered and immutable: version 14 always means exactly the sections, copy, and tokens it meant the day it went live, even after you publish version 15. If a Friday evening Eid promotion converts poorly, you can compare version 14 against version 13 side by side and roll back to 13 in one click, without a developer or a support ticket.",
  scheduled:
    "Scheduled publish decouples \"when I finish the work\" from \"when the shopper sees it.\" A merchant working on a Ramadan sale page on a Tuesday night can queue it to go live at midnight, with zero manual action required at that hour.",
  rows: [
    { stage: "Draft", happens: "Autosaved continuously as you edit", who: "Only you, in the builder", reversible: "N/A — it is not shipped" },
    { stage: "Preview link", happens: "Shareable URL renders the draft outside the editor", who: "Anyone with the link", reversible: "Yes, expires or is revoked anytime" },
    { stage: "Scheduled publish", happens: "Draft is queued for a future timestamp", who: "No one, until the clock hits", reversible: "Yes, cancel before the scheduled time" },
    { stage: "Published (live version)", happens: "Draft becomes the numbered live version", who: "All storefront visitors", reversible: "Roll back to any prior version, one click" },
    { stage: "Rolled back", happens: "An earlier version is restored as current", who: "All storefront visitors", reversible: "Yes, roll forward again if needed" },
  ],
};

/* -------------------------------------------------------------------------- */
/* Section 5 — five official themes                                         */
/* -------------------------------------------------------------------------- */

export const themes = [
  {
    id: "classic",
    name: "Classic",
    body: "Generous whitespace, a traditional top-nav-plus-mega-menu structure, and a product grid that privileges photography over badges. The safest default for a first store — smallest section library, easiest to hand to a small team.",
    fit: "Moderate catalogue, strong photography",
  },
  {
    id: "modern",
    name: "Modern",
    body: "Sharper visual rhythm, tighter type, a more editorial feel — closer to a D2C brand site than a marketplace stall. Rewards a merchant with a consistent visual identity and fewer, better products.",
    fit: "Small high-margin catalogue, strong brand identity",
  },
  {
    id: "landing",
    name: "Landing",
    body: "Not a general storefront theme — a single-product or single-campaign theme built around one long-scrolling persuasive page, with testimonial strips, FAQ, and a sticky buy bar.",
    fit: "One hero product or campaign launch",
  },
  {
    id: "supershop",
    name: "Supershop",
    body: "The highest-density theme for catalogues in the hundreds-to-thousands of SKUs. Front-loads filters, category rails, and a dense grid; assumes the shopper arrives with a specific product in mind.",
    fit: "Hundreds to thousands of SKUs, filter-driven browsing",
  },
  {
    id: "b2b",
    name: "B2B",
    body: "Serves merchants who sell to other businesses. Tiered pricing tables, minimum order quantity fields, a request-a-quote flow, and account-gated pricing.",
    fit: "Wholesale, quote-based, or account-gated pricing",
  },
];

export const themeDecisionTable = {
  caption: "Theme-choice decision table",
  rows: [
    { situation: "First store, moderate catalogue, strong photography", theme: "Classic", because: "Safest default, smallest section library, image-forward" },
    { situation: "Small high-margin catalogue, strong brand identity", theme: "Modern", because: "Editorial layout rewards fewer, better products" },
    { situation: "One hero product or campaign launch", theme: "Landing", because: "Single-purchase-decision page, not a catalogue" },
    { situation: "Hundreds to thousands of SKUs, filter-driven browsing", theme: "Supershop", because: "Density and filters over inspiration" },
    { situation: "Wholesale, quote-based, or account-gated pricing", theme: "B2B", because: "Tiered pricing and MOQ built in, not bolted on" },
    { situation: "Unsure, catalogue will grow past 50 SKUs in a year", theme: "Classic → migrate later", because: "Cleanest section model to extend" },
  ],
};

/* -------------------------------------------------------------------------- */
/* Section 6 — design tokens                                                 */
/* -------------------------------------------------------------------------- */

export const tokensBand = {
  title: "Design tokens and brand consistency",
  body:
    "A token panel holds four families: colour (primary, accent, surface, text), radius (from sharp to fully rounded), type scale (a ratio-based ladder from caption to display), and spacing (a fixed step scale, not freeform pixel entry). Every section in every theme reads from these tokens rather than hard-coding its own values, so a brand refresh is a five-field edit, not a section-by-section rebuild.",
  worked:
    "A merchant rebranding from a teal to a maroon accent for Pohela Boishakh changes one colour token. That single change updates the \"Add to cart\" button, the sale badge, the active nav underline, and the checkout progress bar simultaneously — four surfaces, one edit, zero risk of shipping a mismatched button colour on launch day.",
  note: "Token changes are draft-scoped like everything else: preview a full rebrand before publishing it, compare it against the live version, discard it without consequence if it doesn't work.",
};

/* -------------------------------------------------------------------------- */
/* Section 7 — bilingual catalogue                                          */
/* -------------------------------------------------------------------------- */

export const bilingualCatalogue = {
  title: "Bangla + English from one catalogue",
  titleBn: "একই ক্যাটালগ থেকে বাংলা ও ইংরেজি",
  body:
    "Every product, section, and piece of storefront copy in Framique has one Bangla field and one English field living on the same record — not two parallel catalogues that must be kept in sync by hand. A shopper's browser or a manual language switch decides which one renders; the merchant edits both from the same product screen.",
  bodyBn:
    "Framique-এর প্রতিটি পণ্য, সেকশন ও স্টোরফ্রন্ট কপির একটি বাংলা ও একটি ইংরেজি ফিল্ড একই রেকর্ডে থাকে — হাতে সিঙ্ক রাখা দুটি আলাদা ক্যাটালগ নয়।",
  commercial:
    "A large share of Bangladeshi online shoppers convert better against Bangla product names, sizes, and care instructions even when they can read English, because purchase-stage cognitive load is lower in the first language. A storefront that only offers English at checkout reintroduces exactly the friction the bilingual catalogue was meant to remove.",
  typography:
    "Any token applied to a lang=\"bn\" subtree drops letter-spacing to 0 (Bengali conjuncts and matras clip under Latin negative tracking), and Bangla display text keeps a minimum 1.35 line-height box — enforced by the renderer, not left to merchant discipline.",
};

/* -------------------------------------------------------------------------- */
/* Section 8 & 9 — fonts and custom code                                    */
/* -------------------------------------------------------------------------- */

export const fontsAndCode = {
  fontsTitle: "Custom fonts — licence attestation and weight budget",
  fontsBody:
    "Uploading a custom font requires an explicit licence attestation: the merchant confirms they hold a web-embedding licence for the exact weights being uploaded, logged with a timestamp against the account. Framique does not verify licence terms with the foundry — this is a legal attestation step, not a rights-management product.",
  fontsBudget:
    "The font-weight budget exists for a performance reason: each additional weight of a custom font is a separate network request and a separate render-blocking asset on first paint. The builder enforces a soft ceiling of two weights per custom font family and flags a warning if a merchant tries to load more.",
  fontsWorked:
    "A merchant uploads a five-weight custom Bangla-Latin pairing. The builder warns that only two weights are budgeted; the merchant keeps Regular and SemiBold and defers the rest. Measured effect: roughly 90–140 KB of font payload removed from the critical rendering path — often the difference between meeting and missing the 2.0s LCP target.",
  codeTitle: "Custom code — sandboxing and secret scanning",
  codeBody:
    "The custom code section accepts HTML, CSS, and script snippets — a live chat widget, a tracking pixel, a small interactive embed — and renders them inside an isolated iframe with no access to the parent page's DOM, cookies, or checkout state. If the embedded script throws an error or hangs, the failure is contained to that one section; the rest of the storefront, including checkout, keeps functioning.",
  codeScanning:
    "Before any custom code snippet is saved, it passes through secret scanning: a pattern check for API keys, access tokens, and credential-shaped strings a merchant might have pasted in by accident. A match blocks the save and shows exactly which line triggered it, so the credential can be removed before it is ever published to a public HTML source.",
};

/* -------------------------------------------------------------------------- */
/* Section 10 — performance budgets (MatrixTable)                           */
/* -------------------------------------------------------------------------- */

export const perfBand = {
  title: "Performance budgets — why LCP matters for BDT conversion",
  intro:
    "Largest Contentful Paint (LCP) is the performance metric most correlated with whether a Bangladeshi mobile shopper stays on a product page long enough to scroll to \"Add to cart.\" A large share of retail traffic in Bangladesh arrives over 3G/4G mobile data with variable latency, and every additional second of blank-screen wait is a second of attention and mobile data spent on nothing.",
  worked:
    "Worked example (stated assumptions, not a measured claim): 10,000 monthly mobile sessions, converting at 2.0% (200 orders) at a fast load time. An unbudgeted 900 KB hero image (versus the 90 KB ceiling) adds roughly 2.5s to LCP. At a commonly cited 7%-per-second conversion drop, that implies conversion falling to roughly 1.65% (165 orders) — 35 fewer orders. At an assumed average order value of 1,200 BDT, that is approximately 42,000 BDT of assumed monthly revenue attributable to one unbudgeted hero image. The arithmetic is the point, not the exact numbers.",
  enforcement:
    "The builder enforces the budgets at publish time: an oversized hero image is flagged with its actual file size and the ceiling it exceeds, and the merchant is offered an automatic compressed version before the version can go live.",
  caption: "Framique's stated performance budgets for any published storefront",
  columns: [{ id: "budget", label: "Budget", highlight: true }],
  rows: [
    { id: "hero", label: "Hero LCP asset", budget: "≤ 90 KB" },
    { id: "image", label: "Any other image", budget: "≤ 140 KB" },
    { id: "lcp", label: "LCP target (mid-tier Android / 4G)", budget: "≤ 2.0 seconds" },
    { id: "motion", label: "Motion", budget: "Transform / opacity only" },
    { id: "reduced-motion", label: "prefers-reduced-motion", budget: "Full fallback on every animated element" },
  ],
};

/* -------------------------------------------------------------------------- */
/* Section 11 — 15-item product page checklist                              */
/* -------------------------------------------------------------------------- */

export const productPageChecklist = [
  "Product title in Bangla, with the English name in parentheses if it aids search",
  "Price shown in BDT with the Taka symbol, never a bare number",
  "At least one image showing scale or the product in a hand/on a body",
  "Discount badge only if the original price is genuinely shown struck through nearby",
  "Stock status stated plainly (\"In stock\", \"Only 4 left\", \"Restocking [date]\")",
  "Delivery estimate by area (inside Dhaka vs. outside Dhaka)",
  "COD availability stated explicitly",
  "bKash/Nagad/Rocket/Upay logos shown near the price, not buried at checkout",
  "Return/exchange policy in one sentence, in Bangla, linked to the full policy",
  "Size or variant guidance specific to the product category",
  "At least one section addressing a common pre-purchase doubt (durability, authenticity, warranty)",
  "A visible, sticky \"Add to cart\" / \"Order now\" action that survives scroll on mobile",
  "Related or complementary products below the fold, not above it",
  "Contact channel visible (WhatsApp, phone, Messenger)",
  "Page weight within budget — none of the above matters if the page has not finished loading",
];

/* -------------------------------------------------------------------------- */
/* Section 12 — first hour walkthrough                                      */
/* -------------------------------------------------------------------------- */

export const firstHour = [
  { time: "0–5 min", title: "Pick a theme", body: "Use the decision table above. If genuinely unsure and your catalogue will likely grow, start with Classic." },
  { time: "5–15 min", title: "Set your four core tokens", body: "Primary colour, accent colour, corner radius, and base font. Everything downstream inherits these; do this before touching any section." },
  { time: "15–20 min", title: "Edit the hero section", body: "Replace the placeholder headline and image with your own; enter both the Bangla and English fields, not just one." },
  { time: "20–30 min", title: "Add your first product grid", body: "Connect it to your catalogue. Confirm price displays in BDT and that stock status is visible." },
  { time: "30–35 min", title: "Add a delivery/COD/payment trust section", body: "Place it directly below the hero or product grid — see checklist items 6–8." },
  { time: "35–45 min", title: "Preview on your own phone", body: "Use the shareable link, on mobile data if possible, not just on the office Wi-Fi." },
  { time: "45–50 min", title: "Check the performance panel", body: "Address any flagged oversized image before publishing." },
  { time: "50–55 min", title: "Publish as version 1", body: "Or schedule it for a specific launch time." },
  { time: "55–60 min", title: "Bookmark the version history panel", body: "You now know how to roll back if anything about the next change goes wrong." },
];

/* -------------------------------------------------------------------------- */
/* Section 13 — comparison matrix                                           */
/* -------------------------------------------------------------------------- */

export const comparison = {
  caption: "Framique builder compared with generic page builders",
  columns: [
    { id: "generic", label: "Generic page builder" },
    { id: "framique", label: "Framique builder", highlight: true },
  ],
  rows: [
    { id: "preview", label: "Preview fidelity", generic: "Simplified preview renderer, can diverge from production", framique: "Same renderer for editor and live store" },
    { id: "bangla", label: "Bangla support", generic: "Often a bolted-on translation plugin", framique: "One catalogue, native Bangla + English fields, script-aware typography" },
    { id: "payments", label: "Payment context", generic: "Generic card/PayPal assumptions", framique: "bKash/Nagad/Rocket/Upay/card/COD built into theme sections" },
    { id: "versioning", label: "Versioning", generic: "Usually undo history within a session only", framique: "Numbered, immutable, author-stamped versions with one-click rollback" },
    { id: "scheduled", label: "Scheduled publish", generic: "Rare or third-party plugin", framique: "Native, queue a draft for a future timestamp" },
    { id: "fonts", label: "Font governance", generic: "Unlimited weights, no licence step", framique: "Licence attestation + two-weight budget enforced at upload" },
    { id: "code", label: "Custom code safety", generic: "Inline script, can break the whole page", framique: "Sandboxed iframe, isolated failure" },
    { id: "secrets", label: "Secret exposure risk", generic: "Unchecked", framique: "Secret scanning blocks save on credential-shaped strings" },
    { id: "perf", label: "Performance enforcement", generic: "Advisory at best", framique: "Hard budgets enforced at publish time, with auto-compression offered" },
    { id: "themes", label: "Themes offered", generic: "Often hundreds of undifferentiated templates", framique: "Five official themes, each purpose-built for a distinct merchandising situation" },
  ],
  note: "A marketplace of hundreds of templates optimises for browsing variety, not merchandising fit. Five themes, each mapped to a specific business situation, is a smaller but more honest promise.",
};

/* -------------------------------------------------------------------------- */
/* Section 14 — accessibility                                               */
/* -------------------------------------------------------------------------- */

export const accessibility = {
  title: "Accessibility",
  body:
    "The builder itself and every published storefront share the same accessibility baseline. Body text clears 7:1 contrast; any gradient spotlight card carrying text uses a minimum 4.5:1 against its darkest gradient stop. Focus states use a visible ring on every interactive element, including inside the token panel and section rail — a focused button also gets a visible outline shift, never colour alone. Motion is transform/opacity only and fully collapses under prefers-reduced-motion. Drag-and-drop section reordering has a keyboard-operable equivalent (move-up/move-down buttons revealed on focus). Bangla text accessibility is structural: minimum 1.35 line-height on Bangla display type prevents matra clipping, and lang=\"bn\" is set at the subtree level so screen readers switch pronunciation correctly mid-page.",
};

/* -------------------------------------------------------------------------- */
/* Section 15 — FAQ (10 entries, verbatim, shared with JSON-LD)             */
/* -------------------------------------------------------------------------- */

export const faq: { id: string; question: string; answer: string }[] = [
  {
    id: "developer",
    question: "Do I need a developer to use the builder?",
    answer:
      "No. All fifteen checklist items and every theme are configurable through the section and token panels alone. Custom code and custom fonts are optional, developer-adjacent features for merchants who want them, not requirements.",
  },
  {
    id: "switch-themes",
    question: "Can I switch themes after I've already built sections?",
    answer:
      "Yes, but section content does not automatically remap to a different theme's layout assumptions — expect to re-check each section after a theme switch, which is why the decision table is worth reading before starting.",
  },
  {
    id: "draft-vs-published",
    question: "What exactly gets saved in a draft versus a published version?",
    answer:
      "Every edit autosaves to a draft immediately. Nothing in the draft is visible to shoppers until you explicitly publish or it reaches a scheduled publish time; publishing turns the current draft into a new, numbered, immutable version.",
  },
  {
    id: "rollback-depth",
    question: "How far back can I roll back?",
    answer:
      "To any prior published version, not just the immediately preceding one — version history is not limited to a single undo step.",
  },
  {
    id: "preview-link",
    question: "Can I preview a draft before anyone else sees it?",
    answer:
      "Yes, via a shareable preview link that renders the draft outside the editor, revocable at any time and never indexed.",
  },
  {
    id: "font-licence",
    question: "What happens if my custom font upload doesn't include a licence I actually hold?",
    answer:
      "The builder does not verify licence terms with the foundry; the attestation is a legal confirmation logged against your account, and responsibility for accuracy sits with the merchant.",
  },
  {
    id: "font-weight-limit",
    question: "Why does the builder limit me to two weights per custom font?",
    answer:
      "Each additional weight is a separate render-blocking network request; two weights (regular + bold/medium) cover the vast majority of storefront typography needs without meaningfully harming LCP.",
  },
  {
    id: "secret-in-code",
    question: "What happens if my custom code snippet contains an API key by accident?",
    answer:
      "The save is blocked and the exact triggering line is shown before anything is published; nothing with a credential-shaped string reaches the live storefront through this path.",
  },
  {
    id: "one-catalogue",
    question: "Does the Bangla and English catalogue require maintaining two separate product lists?",
    answer: "No — one product record holds both language fields; there is no second catalogue to keep in sync.",
  },
  {
    id: "oversized-hero",
    question: "What happens if I publish an oversized hero image?",
    answer:
      "The builder flags it at publish time with its actual file size against the 90 KB budget and offers an automatically compressed version before you can proceed.",
  },
];

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                  */
/* -------------------------------------------------------------------------- */

export const cta = {
  title: "Build the first section in ten minutes.",
  titleBn: "দশ মিনিটে প্রথম সেকশন তৈরি করুন।",
  primaryCta: "Open a live demo",
  altCta: "Read the builder docs",
};
