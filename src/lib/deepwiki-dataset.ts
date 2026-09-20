/**
 * DeepWiki Knowledge Base & Training Dataset.
 *
 * Contains 105+ verified, authoritative questions & answers covering all 10 core
 * commerce and platform domains in Framique:
 *  1. architecture: Multi-Tenancy, Edge Routing, RLS, Blue/Green, Rate Limiting
 *  2. builder: Visual Page Builder, AST schema, Global Blocks, Custom CSS/JS, Tokens
 *  3. payments: bKash Tokenized, Nagad, Rocket, Upay, SSLCommerz, Shurjopay, COD
 *  4. couriers: SteadFast, Pathao, RedX, Paperfly, Tracking, Webhooks, COD reconciliation
 *  5. catalog: Products, SKU/Variant Matrices, Stock Locks, CSV Imports, Categories
 *  6. orders: State Machine, Invoicing, Fulfillments, Partial Deliveries, Returns
 *  7. seo: JSON-LD Schemas, OpenGraph, Sitemaps, Robots, GSC Indexing
 *  8. security: Staff RBAC, Audit Logging, Anti-Fraud, Key Rotation, Tenant Isolation
 *  9. domains: DNS A/CNAME Records, Automated ACME TLS, Primary Redirects
 * 10. operations: WAL Streaming, Backups, Recovery Rehearsals, Health Metrics
 */

export type DeepWikiCategory =
  | "architecture"
  | "builder"
  | "payments"
  | "couriers"
  | "catalog"
  | "orders"
  | "seo"
  | "security"
  | "domains"
  | "operations";

export type DeepWikiItem = {
  id: string;
  question: string;
  category: DeepWikiCategory;
  tags: string[];
  summary: string;
  answer: string;
  citations: Array<{ title: string; url: string }>;
  verified: boolean;
};

export const DEEPWIKI_CATEGORIES: Array<{
  id: DeepWikiCategory;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: "architecture",
    label: "Architecture & Multi-Tenancy",
    description: "Tenant isolation, Postgres RLS, edge proxying and blue/green rollouts",
    icon: "layers",
  },
  {
    id: "builder",
    label: "Page Builder & AST",
    description: "Visual canvas, JSON AST sections, design tokens and custom CSS/JS",
    icon: "layout",
  },
  {
    id: "payments",
    label: "Payment Gateways",
    description: "bKash, Nagad, SSLCommerz, Shurjopay, Rocket and Cash on Delivery",
    icon: "credit-card",
  },
  {
    id: "couriers",
    label: "Couriers & Logistics",
    description: "SteadFast, Pathao, RedX, Paperfly, parcel tracking and webhooks",
    icon: "truck",
  },
  {
    id: "catalog",
    label: "Catalog & Inventory",
    description: "Product variants, SKU matrices, inventory locks and categories",
    icon: "shopping-bag",
  },
  {
    id: "orders",
    label: "Orders & Fulfillment",
    description: "Order lifecycles, invoices, shipment dispatches and returns",
    icon: "package",
  },
  {
    id: "seo",
    label: "SEO & Search Schemas",
    description: "Structured data, XML sitemaps, OpenGraph and search engine rankings",
    icon: "search",
  },
  {
    id: "security",
    label: "Security & Permissions",
    description: "Staff RBAC, audit logs, anti-fraud rules and credential rotation",
    icon: "shield-check",
  },
  {
    id: "domains",
    label: "Domains & SSL",
    description: "Custom apex/subdomain setup and automated ACME TLS certificates",
    icon: "globe",
  },
  {
    id: "operations",
    label: "Operations & DR",
    description: "Postgres WAL replication, disaster recovery and observability",
    icon: "server",
  },
];

export const DEEPWIKI_DATASET: DeepWikiItem[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ARCHITECTURE & MULTI-TENANCY (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "arch-01-tenant-isolation",
    question: "How does Framique ensure complete tenant data isolation between different merchants?",
    category: "architecture",
    tags: ["tenancy", "rls", "database", "security", "isolation"],
    summary: "Framique enforces tenant isolation at the database layer using PostgreSQL Row Level Security (RLS) on all tenant-owned tables tied to the merchant's authenticated context.",
    answer: `Tenant isolation in Framique is non-negotiable and enforced at the PostgreSQL database layer rather than application software checks alone.

### Key Isolation Mechanisms:
1. **PostgreSQL Row Level Security (RLS)**: Every public database table containing tenant records has an immutable \`merchant_id uuid\` foreign key column with \`ALTER TABLE ... ENABLE ROW LEVEL SECURITY\`.
2. **Session Role Helper**: Policies verify that the authenticated caller holds an active role via the security-definer helper:
   \`\`\`sql
   CREATE POLICY tenant_isolation_policy ON public.orders
     FOR ALL USING (public.has_merchant_role(merchant_id, auth.uid(), 'viewer'));
   \`\`\`
3. **No Client-Trusted Deciders**: Tenancy headers (\`X-Merchant-Id\`) sent by clients are stripped at the OpenResty edge proxy and ingress layer. The server exclusively derives the merchant context from verified GoTrue JWT sessions or cryptographic custom domain routing.
4. **Isolated Storage Buckets**: Uploaded files and media assets are partitioned under tenant-prefixed storage paths (\`/storage/v1/object/public/media/<merchant-id>/...\`).`,
    citations: [
      { title: "System Architecture §1.2", url: "/docs/v1/architecture/tenancy" },
      { title: "Security Specification §29", url: "/docs/v1/security/rls" },
    ],
    verified: true,
  },
  {
    id: "arch-02-edge-routing",
    question: "How does Framique's OpenResty edge proxy route incoming requests to merchant storefronts and the admin console?",
    category: "architecture",
    tags: ["openresty", "edge", "routing", "haproxy", "custom-domains"],
    summary: "OpenResty inspects incoming Host headers, terminates TLS, caches static assets, and proxies requests to TanStack Start Nitro upstream instances.",
    answer: `The Framique edge tier combines OpenResty (Nginx + LuaJIT) and HAProxy for resilient traffic handling:

1. **Host Header Resolution**: When a request arrives at port 443, OpenResty evaluates the \`Host\` header. If the host is \`*.framique.com\`, it routes to the main platform cluster. If it is a custom merchant domain (e.g., \`store.example.com\`), OpenResty queries Redis/Postgres for the registered merchant ID.
2. **Static Asset Caching**: Requests matching \`/assets/*\` and hashed Vite bundles are cached with \`Cache-Control: public, max-age=31536000, immutable\`.
3. **Upstream Health & Canary**: Requests are forwarded to Blue/Green Nitro application processes listening on localhost upstream sockets with active health probes.
4. **Header Normalization**: The edge strips spoofable client headers such as \`X-Merchant-Id\` while setting verified \`X-Forwarded-For\`, \`X-Forwarded-Proto\`, and trace IDs.`,
    citations: [{ title: "Edge Proxy Architecture", url: "/docs/v1/architecture/edge" }],
    verified: true,
  },
  {
    id: "arch-03-blue-green-deployment",
    question: "How does zero-downtime Blue/Green deployment work in Framique?",
    category: "architecture",
    tags: ["deployment", "blue-green", "devops", "zero-downtime", "canary"],
    summary: "Two parallel application environments (Blue & Green) run simultaneously, allowing OpenResty to canary-shift traffic with zero drop in active shoppers.",
    answer: `Framique uses automated Blue/Green deployments managed by Nitro and OpenResty upstream weights:

1. **Parallel Containers**: Port 3000 (Blue) and Port 3001 (Green) run identical production containers.
2. **Preflight Health Checks**: Before traffic shifts, a deployment script triggers \`GET /api/health\` on the inactive target container to verify database pools, Redis connectivity, and template compilation.
3. **Incremental Canary Rollout**: OpenResty shifts weights: 10% -> 50% -> 100% over 60 seconds while monitoring error rates in Prometheus/Loki.
4. **Instant Rollback**: If 5xx error spikes or latency increases exceed 1%, OpenResty immediately snaps weights back to the previous stable release.`,
    citations: [{ title: "Operations Manual §34", url: "/docs/v1/operations/deployment" }],
    verified: true,
  },
  {
    id: "arch-04-rate-limiting-tiers",
    question: "What rate limiting tiers are enforced across Framique APIs and public endpoints?",
    category: "architecture",
    tags: ["rate-limiting", "security", "dos", "redis", "postgres"],
    summary: "Framique implements a 3-tier sliding window rate limiter: Edge, Redis distributed counter, and PostgreSQL fallback.",
    answer: `To prevent credential stuffing, scrapers, and denial-of-service, Framique uses a multi-tier token bucket rate limiter:

| Endpoint Tier | Window | Limit | Target Key |
|---|---|---|---|
| **Public Storefront** | 60s | 300 requests | IP Address |
| **Storefront Checkout** | 60s | 15 requests | IP + Session |
| **Customer Auth / Login** | 300s | 5 attempts | IP + Email |
| **Merchant Admin API** | 60s | 600 requests | Merchant ID |
| **Webhook Ingestion** | 60s | 1,200 requests | Courier/PGW IP |

If Redis is temporarily unavailable, the system automatically falls back to an atomic PostgreSQL table \`rate_limit_buckets\` without dropping requests.`,
    citations: [{ title: "Security Rate Limiting §4.4", url: "/docs/v1/security/rate-limits" }],
    verified: true,
  },
  {
    id: "arch-05-database-money-integer-rule",
    question: "Why does Framique store all currency and prices as integers rather than decimals or floats?",
    category: "architecture",
    tags: ["money", "currency", "database", "bdt", "precision"],
    summary: "All monetary values are stored in minor units (cents/poisha) as integer columns (amount_minor_int) to eliminate IEEE 754 floating-point rounding errors.",
    answer: `In financial commerce software, floating-point arithmetic causes subtle rounding errors that compound across taxes, discounts, and ledger settlements.

### The Framique Money Rule:
- **Integer Minor Units**: Prices and totals are stored as integers in minor units:
  - 100 BDT = \`10000\` minor units.
  - 2,850.50 BDT = \`285050\` minor units.
- **Currency Code Pairing**: Every amount column has an adjacent \`currency_code\` (e.g. \`BDT\`, \`USD\`).
- **Formatting Helper**: \`fmtMinor(285000, 'BDT')\` produces \`৳2,850.00\`.
- **Database Enforcement**: Database check constraints ensure no decimal fractions can be inserted into financial ledger tables.`,
    citations: [{ title: "Commerce Ledger Design §2", url: "/docs/v1/architecture/money" }],
    verified: true,
  },
  {
    id: "arch-06-server-functions-boundary",
    question: "How does Framique's TanStack Start createServerFn boundary protect sensitive operations?",
    category: "architecture",
    tags: ["tanstack-start", "rpc", "security", "server-functions"],
    summary: "All server mutations and queries run through typed createServerFn RPC wrappers with explicit auth middleware, preventing direct database access from the browser.",
    answer: `Framique strictly enforces an RPC boundary between the client React application and the server:

1. **File Separation**: Server code is isolated in \`*.server.ts\` and \`*.functions.ts\` files. Browser bundles never import database drivers or private keys.
2. **Auth & Role Middleware**: Every \`createServerFn\` attaches reusable middleware:
   \`\`\`ts
   export const updateProductFn = createServerFn({ method: "POST" })
     .middleware([requirePermission("products.write")])
     .validator(productSchema)
     .handler(async ({ context, data }) => { ... });
   \`\`\`
3. **Audit Trail Generation**: High-risk actions automatically log append-only audit entries containing actor ID, IP, before state, and after state.`,
    citations: [{ title: "RPC Architecture Guide", url: "/docs/v1/architecture/rpc" }],
    verified: true,
  },
  {
    id: "arch-07-redis-distributed-locking",
    question: "How does Redis distributed locking prevent race conditions during inventory checkout and flash sales?",
    category: "architecture",
    tags: ["redis", "locking", "inventory", "flash-sale", "concurrency"],
    summary: "Framique uses Redis Redlock with automatic TTL expiration to serialize inventory reservation during concurrent checkout requests.",
    answer: `During viral flash sales, multiple shoppers may attempt to purchase the last unit of a product simultaneously.

1. **Lock Acquisition**: When a customer clicks "Place Order", the server attempts to acquire a distributed lock:
   \`\`\`ts
   const lock = await acquireLock(\`inventory:\${variantId}\`, 3000);
   \`\`\`
2. **Atomic Quantity Check**: Within the protected lock section, current stock is read, verified \`>= requested\`, and reserved.
3. **Idempotent Release**: The lock is safely released via a Lua script verifying lock ownership.
4. **Retry & Backoff**: If locked by another worker, requests retry with jitter up to 3 times before returning a user-friendly "Item temporarily in checkout by another customer" message.`,
    citations: [{ title: "Concurrency & Caching Contract", url: "/docs/v1/architecture/locks" }],
    verified: true,
  },
  {
    id: "arch-08-audit-logging-system",
    question: "What is the [A] risk marker and how does append-only audit logging work in Framique?",
    category: "architecture",
    tags: ["audit", "compliance", "security", "ledger", "logging"],
    summary: "[A] denotes high-risk actions (money, credentials, permissions, deletions) requiring immutable append-only audit rows recording actor, before, after, and reason.",
    answer: `In the Framique codebase, any operation marked \`[A]\` represents a critical security or financial boundary.

### Audit Requirements:
- **Immutable Table**: Writes go into \`public.audit_logs\` which has \`REVOKE UPDATE, DELETE ON public.audit_logs FROM public, authenticated;\`.
- **Recorded Payload**:
  - \`actor_id\`: User ID who initiated the action.
  - \`merchant_id\`: Isolated merchant scope.
  - \`action\`: Semantic action name (e.g. \`payments.provider_update\`, \`staff.grant\`).
  - \`before_state\`: JSON snapshot prior to change (passwords and API keys automatically masked).
  - \`after_state\`: JSON snapshot post change.
  - \`ip_address\` and \`user_agent\`.`,
    citations: [{ title: "Audit & Compliance Spec §26", url: "/docs/v1/security/audit" }],
    verified: true,
  },
  {
    id: "arch-09-custom-domain-routing",
    question: "How does Framique map incoming requests from custom merchant domains to the correct store tenant?",
    category: "architecture",
    tags: ["domains", "tenancy", "routing", "custom-host"],
    summary: "Incoming hostnames are looked up against the domains database and cached in memory/Redis; requests render the storefront route with that tenant's configuration.",
    answer: `When a customer visits \`https://shop.artisanbd.com\`:

1. **Edge TLS & Upstream**: OpenResty terminates the SSL connection (using the auto-provisioned Let's Encrypt certificate) and sets \`Host: shop.artisanbd.com\`.
2. **Host Resolution Cache**: The server queries the \`merchant_domains\` table where \`domain = 'shop.artisanbd.com' AND status = 'active'\`. Resulting merchant record is cached for 300 seconds.
3. **Internal Route Delegation**: TanStack Router routes the request through the storefront pipeline (\`routes/store.$slug.index.tsx\`) using the resolved merchant slug without redirecting the browser's URL bar.`,
    citations: [{ title: "Custom Host Route Spec", url: "/docs/v1/storefront/custom-host" }],
    verified: true,
  },
  {
    id: "arch-10-secret-management",
    question: "How are merchant payment secrets and courier API keys protected against leaks?",
    category: "architecture",
    tags: ["secrets", "encryption", "vault", "api-keys"],
    summary: "API keys are encrypted at rest, never sent to the browser, and masked in administrative screens and server logs.",
    answer: `Framique enforces a strict zero-leakage security model for third-party credentials:

1. **Server-Only Boundary**: Secret fields (e.g. \`bkash_app_secret\`, \`steadfast_api_secret\`) are never returned in public or client RPC payloads.
2. **Masked Admin Displays**: In dashboard settings, keys are always masked as \`sk_live_...4829\` or \`••••••••••••\`.
3. **Database Column Encryption**: Secrets are stored using AES-256-GCM symmetric encryption where the master key is held in platform environment variables.
4. **Log Sanitization**: An automatic logger interceptor scans outbound logs and metric tags, redacting strings matching API key patterns or credit card numbers.`,
    citations: [{ title: "Secrets Management & Vault §31", url: "/docs/v1/security/vault" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PAGE BUILDER & AST (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "bld-01-ast-structure",
    question: "What is the structure of the Framique Page Builder Abstract Syntax Tree (AST)?",
    category: "builder",
    tags: ["builder", "ast", "json", "schema", "sections"],
    summary: "The Page Builder AST is a deterministic JSON tree containing metadata, layout settings, and arrays of header, main, and footer sections with typed block schemas.",
    answer: `The Framique Visual Page Builder stores pages as deterministic JSON documents.

### AST Root Schema:
\`\`\`json
{
  "version": 1,
  "title": "Homepage",
  "layout": "default",
  "sections": {
    "header": [ ... ],
    "main": [
      {
        "id": "sec_hero_101",
        "type": "hero_banner",
        "settings": {
          "headline": "Handcrafted Heritage Fashion",
          "subheadline": "Direct from master weavers in Tangail",
          "cta_text": "Shop New Arrivals",
          "cta_url": "/category/panjabi",
          "background_image": "https://...",
          "text_align": "center"
        }
      }
    ],
    "footer": [ ... ]
  },
  "custom_css": "",
  "tokens": { "primary_color": "#8B1E3F" }
}
\`\`\`
Every section contains a unique \`id\`, registered \`type\`, and strongly typed \`settings\` validated against that component's schema.`,
    citations: [{ title: "Page Builder AST Spec", url: "/docs/v1/builder/ast" }],
    verified: true,
  },
  {
    id: "bld-02-supported-widgets",
    question: "Which core sections and widgets are natively supported by the Page Builder?",
    category: "builder",
    tags: ["widgets", "sections", "components", "builder-ui"],
    summary: "Supported sections include hero banners, product grids, category showcases, artisan stories, lookbooks, size guides, testimonials, FAQs, and custom HTML.",
    answer: `Framique includes a curated collection of performance-optimized storefront widgets:

1. **Hero Banner**: Full-width or split hero with title, subtitle, CTA button, and responsive background media.
2. **Featured Products**: Dynamic product slider or grid with live pricing, discount tags, and instant "Add to Cart".
3. **Category Showcase**: Visual circular or card category tiles for easy navigation.
4. **Artisan Story**: Rich media + story layout designed for heritage, craft, and boutique brands.
5. **Lookbook**: Lifestyle image gallery with interactive product tag hotspots.
6. **Size Guide**: Responsive measurement tables with inch/cm unit toggle.
7. **Trust & Security Badges**: Courier and payment trust signals (bKash, Cash on Delivery, SteadFast).
8. **FAQ Accordion**: Structured questions and answers with auto-generated schema markup.`,
    citations: [{ title: "Widget Library Catalog", url: "/docs/v1/builder/widgets" }],
    verified: true,
  },
  {
    id: "bld-03-global-blocks",
    question: "How do Global Blocks work in the Page Builder?",
    category: "builder",
    tags: ["global-blocks", "reusable", "header", "footer", "templates"],
    summary: "Global Blocks allow merchants to design reusable sections (such as announcement bars, headers, and footers) that synchronize across all published storefront pages.",
    answer: `Global Blocks prevent merchants from having to manually duplicate common layout components across pages.

1. **Creating a Global Block**: In the Page Builder, select any section and click "Convert to Global Block". Give it an identifier (e.g. \`global_announcement_bar\`).
2. **Storage**: The block's AST is stored in \`storefront_global_blocks\` under the merchant's ID.
3. **Reference in Pages**: Inside page documents, the section is referenced by its global ID:
   \`\`\`json
   { "type": "global_block_ref", "global_block_id": "global_announcement_bar" }
   \`\`\`
4. **Instant Synchronization**: Editing and publishing the global block in Appearance -> Global Blocks instantly updates every storefront page referencing it.`,
    citations: [{ title: "Global Blocks Guide", url: "/docs/v1/builder/global-blocks" }],
    verified: true,
  },
  {
    id: "bld-04-custom-css-js-sandbox",
    question: "How does Framique safely execute custom CSS and JavaScript on storefront pages?",
    category: "builder",
    tags: ["custom-css", "custom-js", "sandbox", "csp", "styling"],
    summary: "Custom CSS is scoped and validated against CSS parser safety rules, while custom JS runs in deferred sandboxed islands with strict Content Security Policy (CSP).",
    answer: `Merchants frequently require custom CSS stylesheets or tracking pixels (such as Google Tag Manager or Facebook Pixel):

1. **CSS Validation**: Custom CSS entered in Appearance -> Custom CSS is parsed server-side. Dangerous patterns (like \`behavior:\` or external \`@import\` from untrusted origins) are rejected.
2. **Scoping**: CSS variables are injected through the merchant's scoped root selector \`[data-framique-theme="merchant-slug"]\`.
3. **Sandboxed JS Islands**: Merchant JavaScript scripts are loaded via deferred islands with nonced script tags conforming to Framique's Content Security Policy (CSP).
4. **Size Limits**: Custom stylesheets are capped at 50KB to preserve sub-100ms storefront First Contentful Paint (FCP).`,
    citations: [{ title: "Custom Code & CSP Spec", url: "/docs/v1/builder/custom-code" }],
    verified: true,
  },
  {
    id: "bld-05-version-snapshots-rollback",
    question: "How does version history, auto-saving, and rollbacks work in the Page Builder?",
    category: "builder",
    tags: ["versioning", "rollback", "snapshots", "autosave"],
    summary: "Every publish creates an immutable page version snapshot in Postgres, enabling merchants to preview and 1-click restore any previous design.",
    answer: `To eliminate the fear of accidental design breakage, Framique maintains a complete version ledger for every storefront page:

1. **Auto-Save Drafts**: Changes on the canvas are saved to \`storefront_page_drafts\` every 5 seconds without affecting the public storefront.
2. **Publish Snapshot**: When the merchant clicks "Publish", the draft is saved to the active page row and an immutable row is appended to \`storefront_page_versions\` with a timestamp and author ID.
3. **Version Comparison**: The History drawer allows viewing earlier versions with side-by-side AST diffs.
4. **One-Click Rollback**: Clicking "Rollback to Version #4" immediately restores that snapshot's AST to the live storefront.`,
    citations: [{ title: "Page Versioning Spec §4", url: "/docs/v1/builder/versions" }],
    verified: true,
  },
  {
    id: "bld-06-design-tokens-theme-engine",
    question: "How do Design Tokens control colors, typography, and spacing in Framique themes?",
    category: "builder",
    tags: ["tokens", "design-system", "theme", "colors", "typography"],
    summary: "Framique uses CSS custom properties defined in a design token dictionary, allowing instant palette and typography switching across all widgets.",
    answer: `Framique's theme engine uses structured design tokens rather than hardcoded CSS values:

### Core Design Token Categories:
- **Color Tokens**:
  - \`--fq-color-primary\`: Main brand identity color (e.g. Royal Maroon, Emerald Green).
  - \`--fq-color-accent\`: Call to action buttons and highlights.
  - \`--fq-color-surface\`: Background and card surface tones.
- **Typography Tokens**:
  - \`--fq-font-display\`: Brand headline font (e.g. Outfit, Playfair, Hind Siliguri).
  - \`--fq-font-body\`: Highly legible text font (e.g. Inter, Roboto).
- **Radius & Elevation**:
  - \`--fq-radius-card\`: Corner curvature (6px, 10px, or 16px).
  - \`--fq-shadow-elevated\`: Subtle layered micro-shadows.

When a merchant modifies colors in Appearance -> Customize -> Colors, the tokens update globally in real time.`,
    citations: [{ title: "Design Tokens Specification", url: "/docs/v1/builder/tokens" }],
    verified: true,
  },
  {
    id: "bld-07-mobile-responsive-preview",
    question: "How does the Page Builder handle mobile, tablet, and desktop responsive viewports?",
    category: "builder",
    tags: ["responsive", "mobile", "tablet", "preview", "viewport"],
    summary: "The canvas provides instant viewport switching (Desktop 1440px, Tablet 768px, Mobile 375px) with responsive setting overrides for spacing and font sizes.",
    answer: `More than 85% of e-commerce traffic in Bangladesh occurs on mobile devices. The Framique builder is mobile-first:

1. **Viewport Toggles**: The builder top bar features quick toggles:
   - **Desktop**: 100% canvas width (1440px max).
   - **Tablet**: 768px bounded frame.
   - **Mobile**: 375px iPhone/Android portrait frame.
2. **Responsive Properties**: Widget settings (such as columns per row, padding, and font scale) can be configured independently for mobile and desktop.
3. **Touch Friendly**: Tap targets for buttons and navigation links automatically enforce a minimum height of 44px to satisfy WCAG AA accessibility standards.`,
    citations: [{ title: "Responsive Layout Rules", url: "/docs/v1/builder/responsive" }],
    verified: true,
  },
  {
    id: "bld-08-theme-marketplace-lifecycle",
    question: "What is the lifecycle of installing, activating, and previewing themes from the Marketplace?",
    category: "builder",
    tags: ["marketplace", "themes", "activate", "install", "preview"],
    summary: "Marketplace themes can be previewed live, installed into store_themes, and activated to swap storefront templates while preserving merchant catalog data.",
    answer: `Framique's theme lifecycle mirrors the WordPress Appearance -> Themes model:

1. **Theme Directory**: Merchants browse curated themes in Appearance -> Themes -> Add New Theme.
2. **Live Preview**: Clicking "Live Preview" renders the merchant's real catalog products inside an isolated sandboxed iframe running the target theme blueprint.
3. **Installation**: Clicking "Install" creates a new inactive row in \`store_themes\` and records the installation in \`marketplace_installs\`.
4. **Activation**: Clicking "Activate" atomically swaps \`is_active = true\` in the database and updates the active storefront theme ID without mutating product catalogs or customer orders.`,
    citations: [{ title: "Marketplace Theme Lifecycle §3", url: "/docs/v1/marketplace/themes" }],
    verified: true,
  },
  {
    id: "bld-09-custom-header-footer-builder",
    question: "How can merchants build custom headers with sticky navigation and announcements?",
    category: "builder",
    tags: ["header", "navigation", "announcement-bar", "sticky"],
    summary: "The Header Builder supports configurable announcement bars, logo alignment, navigation menu linking, search bars, and sticky scroll behavior.",
    answer: `Storefront headers can be customized directly in the Page Builder under the Header layout section:

- **Announcement Bar**: Configurable multi-message banner with discount ticker, countdown timer, and currency switcher.
- **Logo Placement**: Position brand logos on the left, center, or inline with menu items, with distinct mobile logo upload options.
- **Navigation Menus**: Seamless integration with Appearance -> Menus, supporting multi-level dropdowns and mega-menus.
- **Sticky Header**: Toggle sticky pinning on scroll with background glassmorphism blur and automatic height compression for mobile screens.`,
    citations: [{ title: "Header Builder Guide", url: "/docs/v1/builder/headers" }],
    verified: true,
  },
  {
    id: "bld-10-bilingual-bangla-english-text",
    question: "How does the Page Builder manage bilingual Bangla and English content for Bangladeshi storefronts?",
    category: "builder",
    tags: ["bilingual", "bangla", "i18n", "localization", "fonts"],
    summary: "Text fields in widgets support dual Bangla and English strings with automatic language toggle and native font pairing (e.g. Hind Siliguri).",
    answer: `To maximize conversion across all customer demographics in Bangladesh:

1. **Dual String Fields**: Text settings in Page Builder widgets provide primary English and optional Bangla translation inputs.
2. **Storefront Language Switcher**: Shoppers can toggle between English and বাংলা via a header switch. The page re-renders with the selected locale without full-page reloads.
3. **Bangla Typography Rendering**: Framique automatically applies specialized font styling (\`font-bangla-display\`, \`font-bangla-body\`) with optimized kerning for complex conjunct consonants (যুক্তাক্ষর).`,
    citations: [{ title: "Bilingual Localization Spec", url: "/docs/v1/builder/bilingual" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PAYMENT GATEWAYS (15 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "pay-01-bkash-tokenized-setup",
    question: "How do I configure bKash Tokenized Checkout (PGW) in Framique?",
    category: "payments",
    tags: ["bkash", "payments", "mfs", "pgw", "tokenized"],
    summary: "Go to Admin Settings -> Payments -> bKash, enter your Merchant App Key, App Secret, Username, Password, and set up your Webhook Callback URL.",
    answer: `bKash Tokenized Checkout provides seamless in-app and web payments directly on your storefront.

### Setup Instructions:
1. Navigate to **Dashboard -> Settings -> Payments -> Payment Providers -> bKash**.
2. Retrieve your merchant credentials from the official bKash Merchant Portal:
   - **Merchant Username**
   - **Merchant Password**
   - **App Key**
   - **App Secret**
3. Select **Mode**: Start with **Sandbox** for end-to-end testing, then switch to **Live** once approved by bKash.
4. **Callback URL**: Framique automatically registers \`https://framique.qubickle.com/api/webhooks/payments/bkash\` to handle instant payment authorization and execution.
5. Click **Save & Test Credentials** to verify API handshake.`,
    citations: [{ title: "bKash Tokenized API Integration", url: "/docs/v1/payments/bkash" }],
    verified: true,
  },
  {
    id: "pay-02-nagad-direct-api",
    question: "How do I integrate Nagad Online Payment Gateway?",
    category: "payments",
    tags: ["nagad", "payments", "mfs", "post-office"],
    summary: "Enter your Nagad Merchant ID, Public Key, Private Key, and configure the automated callback URL in Dashboard Payments.",
    answer: `Nagad PGW uses asymmetric public/private key cryptography for secure transaction signing:

1. Open **Dashboard -> Settings -> Payments -> Nagad**.
2. Enter your assigned **Merchant ID** from Nagad onboarding.
3. Paste your **Merchant Private Key** and the **Nagad Public Key** provided in your portal.
4. Set the **Callback URL** in the Nagad merchant dashboard to Framique's webhook endpoint:
   \`\`\`
   https://framique.qubickle.com/api/webhooks/payments/nagad
   \`\`\`
5. Inbound verification cryptographically validates the signature before marking the order as 'Paid'.`,
    citations: [{ title: "Nagad Gateway Guide", url: "/docs/v1/payments/nagad" }],
    verified: true,
  },
  {
    id: "pay-03-sslcommerz-hosted-checkout",
    question: "How do I configure SSLCommerz for card, mobile banking, and internet banking payments?",
    category: "payments",
    tags: ["sslcommerz", "cards", "visa", "mastercard", "payments"],
    summary: "Enter your Store ID and Store Password under SSLCommerz settings; IPN (Instant Payment Notification) automatically handles status updates.",
    answer: `SSLCommerz enables cards (Visa, MasterCard, Amex) and all Bangladeshi MFS options:

1. Navigate to **Dashboard -> Settings -> Payments -> SSLCommerz**.
2. Enter your **Store ID** and **Store Password**.
3. Toggle between **Sandbox (testbox.sslcommerz.com)** and **Live (securepay.sslcommerz.com)**.
4. Framique configures the **IPN (Instant Payment Notification)** endpoint automatically.
5. When a customer completes checkout on SSLCommerz, the IPN validates the transaction amount and currency with the SSLCommerz verification API before crediting the order.`,
    citations: [{ title: "SSLCommerz Setup Guide", url: "/docs/v1/payments/sslcommerz" }],
    verified: true,
  },
  {
    id: "pay-04-shurjopay-integration",
    question: "How do I enable Shurjopay payment gateway on my store?",
    category: "payments",
    tags: ["shurjopay", "payments", "bangladesh", "cards"],
    summary: "Supply your Shurjopay Username, Password, and Merchant Prefix in Payment Settings to enable tokenized debit and credit processing.",
    answer: `Shurjopay provides localized processing for credit/debit cards and mobile banking:

1. Go to **Dashboard -> Settings -> Payments -> Shurjopay**.
2. Enter your **Username**, **Password**, and assigned **Merchant Prefix**.
3. Set the mode to **Sandbox** or **Live**.
4. The system communicates directly with Shurjopay's REST API (\`/api/get_token\` and \`/api/secret-pay\`) to generate secure payment URLs.
5. Webhooks verify transaction order numbers and update the order state machine.`,
    citations: [{ title: "Shurjopay Integration", url: "/docs/v1/payments/shurjopay" }],
    verified: true,
  },
  {
    id: "pay-05-cod-cash-on-delivery",
    question: "How does Cash on Delivery (COD) work and how can I prevent high return rates?",
    category: "payments",
    tags: ["cod", "cash-on-delivery", "fraud", "returns", "courier"],
    summary: "COD allows shoppers to pay upon receipt. Framique offers OTP phone verification and advance partial delivery fee collection to minimize returns.",
    answer: `Cash on Delivery accounts for over 60% of Bangladeshi e-commerce orders, but carries return risks.

### Framique COD Optimization Features:
1. **Enable COD**: Toggle "Cash on Delivery" under **Dashboard -> Settings -> Payments**.
2. **Advance Delivery Charge Collection**: Configure the system to require an advance payment (e.g. ৳120 via bKash) for courier charges while collecting the product balance on delivery.
3. **SMS OTP Phone Verification**: Shoppers must verify their phone number via an automated SMS OTP before a COD order is accepted.
4. **Courier Blacklist Check**: The automated anti-fraud engine queries courier delivery history to flag customers with high historical parcel return rates.`,
    citations: [{ title: "COD Management & Anti-Fraud", url: "/docs/v1/payments/cod" }],
    verified: true,
  },
  {
    id: "pay-06-webhook-verification-security",
    question: "How does Framique securely verify payment gateway webhooks against forgery?",
    category: "payments",
    tags: ["webhooks", "hmac", "security", "signatures", "forgery"],
    summary: "Every incoming payment webhook is validated using HMAC SHA-256 signatures or direct server-to-server transaction query APIs before crediting orders.",
    answer: `To prevent fraudulent actors from forging payment success callbacks:

1. **HMAC Signature Check**: Webhook headers are inspected for cryptographic signatures generated with the shared gateway secret.
2. **Server-to-Server Confirmation**: Rather than blindly trusting the callback payload, Framique initiates a direct back-channel API call (e.g. bKash \`queryPayment\` or SSLCommerz \`validator/api/merchantTransIDvalidationAPI.php\`).
3. **Idempotency Safeguard**: Every transaction ID (\`trxID\`) is stored in an atomic ledger; duplicate webhook emissions are ignored safely.`,
    citations: [{ title: "Webhook Verification Architecture", url: "/docs/v1/security/webhooks" }],
    verified: true,
  },
  {
    id: "pay-07-rocket-upay-mfs",
    question: "Can I accept Dutch-Bangla Rocket and UCB Upay payments on Framique?",
    category: "payments",
    tags: ["rocket", "upay", "mfs", "sslcommerz", "shurjopay"],
    summary: "Yes, Rocket and Upay can be accepted directly or through aggregators like SSLCommerz and Shurjopay with full automated reconciliation.",
    answer: `Merchants can accept DBBL Rocket and Upay via two methods:

- **Aggregator Mode**: When SSLCommerz or Shurjopay is enabled, customers can select Rocket or Upay on the payment modal.
- **Direct Merchant MFS Mode**: Enterprise merchants with direct Rocket PGW agreements can input their Merchant Terminal ID under Payments -> Advanced MFS.`,
    citations: [{ title: "MFS Payment Integrations", url: "/docs/v1/payments/mfs" }],
    verified: true,
  },
  {
    id: "pay-08-automatic-refunds-ledger",
    question: "How are customer refunds initiated and recorded in the financial ledger?",
    category: "payments",
    tags: ["refunds", "ledger", "returns", "accounting"],
    summary: "Refunds can be executed via the payment gateway API directly from the order page, appending an immutable refund entry to the financial ledger.",
    answer: `When a refund is approved in **Dashboard -> Orders -> [Order #] -> Issue Refund**:

1. **Gateway Refund Call**: The server dispatches an automated refund API request to bKash/Nagad/SSLCommerz using the original transaction ID.
2. **Atomic Ledger Debit**: An immutable row is created in \`store_financial_ledger\` with \`amount_minor_int: -total\`, decrementing net revenue.
3. **Stock Restocking**: If physical items were returned, the merchant can check "Restock returned units" to increment available inventory.`,
    citations: [{ title: "Financial Ledger Spec §2", url: "/docs/v1/payments/refunds" }],
    verified: true,
  },
  {
    id: "pay-09-transaction-fees-settlement",
    question: "Does Framique charge any per-transaction fees on merchant payments?",
    category: "payments",
    tags: ["fees", "zero-commission", "pricing", "pricing-policy"],
    summary: "Framique charges 0% transaction commission fees. Merchants only pay their standard payment gateway provider rates.",
    answer: `Unlike other commercial e-commerce platforms that take 1% to 3% of merchant revenue on every transaction:

- **0% Platform Fee**: Framique charges zero commission on sales.
- **Direct Merchant Settlement**: 100% of customer funds flow straight from bKash, Nagad, or banks into the merchant's own accounts.
- **No Escrow Delays**: There are no platform payouts or withdrawal hold periods.`,
    citations: [{ title: "Zero-Fee Commerce Architecture", url: "/docs/v1/payments/zero-fees" }],
    verified: true,
  },
  {
    id: "pay-10-abandoned-checkout-recovery",
    question: "How does Framique recover abandoned checkouts and remind customers to complete payments?",
    category: "payments",
    tags: ["abandoned-cart", "recovery", "sms", "email", "conversion"],
    summary: "Automated SMS and email sequences remind customers within 1 to 24 hours with a direct 1-click link to restore their cart and complete payment.",
    answer: `When a customer fills in their phone number or email but abandons before payment:

1. **Abandoned Checkout Tracking**: The session is recorded in **Dashboard -> Orders -> Abandoned Checkouts**.
2. **Automated Trigger**: If unpaid after 60 minutes, an automated SMS/WhatsApp notification is dispatched:
   \`"Hi Farhan, your cart at Artisan Fashion is waiting! Click here to complete your order with 5% off: https://..."\`
3. **Restoration**: The link restores the exact cart items, variants, and customer details.`,
    citations: [{ title: "Marketing Sequences & Recovery", url: "/docs/v1/marketing/abandoned-carts" }],
    verified: true,
  },
  {
    id: "pay-11-manual-bank-transfer",
    question: "How do I configure Offline Manual Bank Transfer payments?",
    category: "payments",
    tags: ["bank-transfer", "offline-payments", "manual-verify"],
    summary: "Configure bank account details under Payments -> Offline Methods; orders enter 'Pending Verification' until the merchant marks them paid.",
    answer: `For high-ticket purchases (B2B, wholesale, or corporate gifts), merchants can accept direct bank transfers:

1. Go to **Dashboard -> Settings -> Payments -> Offline Methods -> Bank Transfer**.
2. Provide your Bank Name, Account Name, Account Number, Branch, and Routing Number.
3. At checkout, the customer sees payment instructions and inputs their Bank Reference / Deposit Slip number.
4. The order status is set to \`pending_payment\` until verified in the dashboard.`,
    citations: [{ title: "Offline Payment Options", url: "/docs/v1/payments/bank-transfer" }],
    verified: true,
  },
  {
    id: "pay-12-pos-counter-sales",
    question: "Does Framique support Point of Sale (POS) counter sales alongside online payments?",
    category: "payments",
    tags: ["pos", "counter-sales", "retail", "barcode", "offline"],
    summary: "Yes, the POS screen allows cashiers to search products, scan barcodes, accept cash or card, and instantly synchronize online inventory.",
    answer: `Retail stores can run their counter sales through Framique POS:

- **Barcode Scanner Support**: Compatible with USB and Bluetooth handheld barcode scanners.
- **Unified Inventory**: Selling a unit in your physical outlet immediately decrements storefront stock online.
- **Thermal Receipt Printing**: Prints standard 58mm and 80mm ESC/POS thermal receipts.`,
    citations: [{ title: "POS Retail Integration", url: "/docs/v1/pos/overview" }],
    verified: true,
  },
  {
    id: "pay-13-multi-currency-display",
    question: "Can I display prices in USD, EUR, or GBP for international shoppers?",
    category: "payments",
    tags: ["multi-currency", "forex", "international", "usd", "bdt"],
    summary: "Yes, enable multi-currency in Settings -> Currencies; prices convert dynamically while settling in BDT or USD via Stripe / SSLCommerz.",
    answer: `Merchants serving diaspora customers (UK, US, Middle East) can enable multi-currency:

1. Under **Settings -> Store -> Currencies**, enable desired currencies (USD, GBP, EUR, AED).
2. Exchange rates update automatically via daily central bank rates or can be locked manually.
3. Customers can switch currency in the storefront header.`,
    citations: [{ title: "Multi-Currency Spec", url: "/docs/v1/payments/multi-currency" }],
    verified: true,
  },
  {
    id: "pay-14-partial-payment-booking",
    question: "How can I accept partial booking deposits for custom or pre-order clothing items?",
    category: "payments",
    tags: ["pre-order", "booking", "partial-payment", "clothing"],
    summary: "Enable Pre-Order mode on a product to require a partial deposit (e.g. 20%) with the balance due upon delivery dispatch.",
    answer: `For tailored items (such as bespoke Sherwanis or bridal Jamdanis):

1. In the Product editor, toggle **Allow Pre-orders / Custom Tailoring**.
2. Select **Deposit Requirement**: specify a percentage (e.g. 25%) or fixed amount (e.g. ৳1,000).
3. The customer pays the deposit online; Framique schedules a balance collection invoice prior to shipment.`,
    citations: [{ title: "Pre-orders & Tailoring Workflows", url: "/docs/v1/catalog/preorders" }],
    verified: true,
  },
  {
    id: "pay-15-fraud-risk-scoring",
    question: "How does the built-in fraud risk scoring evaluate high-risk orders before fulfillment?",
    category: "payments",
    tags: ["fraud", "risk-score", "security", "cod-guard"],
    summary: "The fraud engine scores orders from 0 to 100 based on IP geolocation, phone history, rapid multiple orders, and courier return histories.",
    answer: `Before dispatching valuable parcels, Framique computes a risk score:

- **Low Risk (0-30)**: Green badge. Standard automated fulfillment.
- **Medium Risk (31-70)**: Yellow badge. Prompts staff to verify the order via a quick phone call.
- **High Risk (71-100)**: Red badge. Flags duplicate orders, VoIP numbers, or customers who previously rejected 3+ COD parcels.`,
    citations: [{ title: "Fraud Detection & Risk Scoring", url: "/docs/v1/security/fraud" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. COURIERS & LOGISTICS (15 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "cr-01-steadfast-integration",
    question: "How do I connect SteadFast Courier for automated 1-click parcel booking and tracking?",
    category: "couriers",
    tags: ["steadfast", "courier", "logistics", "shipping", "bangladesh"],
    summary: "Enter your SteadFast API Key and Secret Key under Settings -> Shipping -> SteadFast, then configure webhook callbacks for live tracking updates.",
    answer: `SteadFast Courier is one of Bangladesh's largest parcel networks covering all 64 districts.

### Integration Steps:
1. Navigate to **Dashboard -> Settings -> Shipping -> SteadFast Courier**.
2. Retrieve your **API Key** and **Secret Key** from the SteadFast Merchant Portal under Settings -> API.
3. Paste both keys into Framique and click **Save & Test Connection**.
4. **Webhook URL**: Copy the Framique webhook endpoint:
   \`\`\`
   https://framique.qubickle.com/api/webhooks/courier/steadfast
   \`\`\`
   Paste it into the Webhook Callback field on SteadFast.
5. In your Orders screen, selecting any processing order displays the **"Book SteadFast Parcel"** button. Clicking it generates an instant Consignment ID, AWB number, and printable shipping label.`,
    citations: [{ title: "SteadFast Courier Documentation", url: "/docs/v1/shipping/steadfast" }],
    verified: true,
  },
  {
    id: "cr-02-pathao-logistics-api",
    question: "How do I configure Pathao Courier and warehouse pickup stores?",
    category: "couriers",
    tags: ["pathao", "logistics", "shipping", "dhaka", "pickup"],
    summary: "Authenticate via Pathao OAuth credentials (Client ID, Secret, Username, Password) and select your designated warehouse pickup store ID.",
    answer: `Pathao Courier integration enables express on-demand and nationwide parcel delivery:

1. Go to **Dashboard -> Settings -> Shipping -> Pathao Logistics**.
2. Enter your **Client ID**, **Client Secret**, **Username**, and **Password**.
3. Framique authenticates against Pathao's OAuth endpoint and fetches your registered pickup stores.
4. Select your **Default Pickup Store Location**.
5. When booking orders, select delivery type (\`Normal\` 48h or \`On Demand\` same-day in Dhaka).`,
    citations: [{ title: "Pathao Logistics Guide", url: "/docs/v1/shipping/pathao" }],
    verified: true,
  },
  {
    id: "cr-03-redx-courier-setup",
    question: "How do I set up RedX Courier delivery in Framique?",
    category: "couriers",
    tags: ["redx", "courier", "logistics", "api-key"],
    summary: "Provide your RedX API Sandbox/Live Token and map your warehouse pickup location to RedX district taxonomy.",
    answer: `RedX provides door-to-door delivery and return handling:

1. Open **Dashboard -> Settings -> Shipping -> RedX**.
2. Enter your **RedX Production API Token**.
3. Configure your pickup warehouse address and postal zone.
4. Parcels booked in the Orders console receive immediate tracking IDs with automatic status webhook synchronization.`,
    citations: [{ title: "RedX Integration Guide", url: "/docs/v1/shipping/redx" }],
    verified: true,
  },
  {
    id: "cr-04-paperfly-courier-setup",
    question: "How do I connect Paperfly for nationwide parcel distribution?",
    category: "couriers",
    tags: ["paperfly", "courier", "logistics", "bangladesh"],
    summary: "Configure Paperfly Username, Password, and Merchant Key to dispatch door-to-door deliveries with real-time tracking.",
    answer: `Paperfly operates extensive coverage into rural and upazila hubs across Bangladesh:

1. Navigate to **Dashboard -> Settings -> Shipping -> Paperfly**.
2. Enter your **Username**, **Password**, and **Merchant Key**.
3. Enable automated manifest generation to bundle daily outgoing packages for courier hand-off.`,
    citations: [{ title: "Paperfly Logistics Guide", url: "/docs/v1/shipping/paperfly" }],
    verified: true,
  },
  {
    id: "cr-05-automated-awb-tracking",
    question: "How do customers track their parcel delivery status in real time?",
    category: "couriers",
    tags: ["tracking", "awb", "order-status", "customer-portal"],
    summary: "Customers receive an SMS with an AWB tracking link; visiting the store tracking page displays live courier checkpoint events.",
    answer: `Framique keeps shoppers informed at every step to prevent unnecessary support tickets:

1. **Automatic Tracking Link**: When an order is booked with a courier, the customer receives an automated SMS:
   \`"Your order #1042 has been shipped via SteadFast. Track here: https://yourstore.com/track/SF1042BD"\`
2. **Live Checkpoints**: The customer tracking page queries real-time courier checkpoints (\`In Transit\`, \`Out for Delivery\`, \`Delivered\`).
3. **Delivery Notification**: Upon delivery, the customer status flips to 'Delivered' and a review request email/SMS is scheduled.`,
    citations: [{ title: "Customer Shipment Tracking Spec", url: "/docs/v1/shipping/tracking" }],
    verified: true,
  },
  {
    id: "cr-06-shipping-rates-zones",
    question: "How do I configure shipping rates for Inside Dhaka (৳60) vs Outside Dhaka (৳120)?",
    category: "couriers",
    tags: ["shipping-zones", "dhaka", "delivery-charge", "rates"],
    summary: "Set up Shipping Zones in Settings -> Shipping -> Zones: create 'Inside Dhaka' with ৳60 and 'Outside Dhaka' with ৳120.",
    answer: `To set standard Bangladeshi shipping rates:

1. Navigate to **Dashboard -> Settings -> Shipping -> Shipping Zones**.
2. **Zone 1 (Inside Dhaka)**:
   - Select District: \`Dhaka City\`.
   - Rate: Flat Rate \`৳60\` (or free over ৳2,000).
   - Estimated Delivery: 24–48 hours.
3. **Zone 2 (Outside Dhaka)**:
   - Select: \`All other 63 districts\`.
   - Rate: Flat Rate \`৳120\` (or weight-based tiered rates).
   - Estimated Delivery: 2–4 business days.
4. At checkout, selecting Dhaka District dynamically adjusts the order delivery fee.`,
    citations: [{ title: "Shipping Zones & Rates Guide", url: "/docs/v1/shipping/zones" }],
    verified: true,
  },
  {
    id: "cr-07-printable-shipping-labels",
    question: "How do I print bulk shipping labels and packaging slips for dispatch?",
    category: "couriers",
    tags: ["shipping-labels", "packing-slips", "barcode", "thermal-printer", "bulk"],
    summary: "Select multiple orders in the Orders table, click 'Print Shipping Labels', and generate thermal-ready 4x6 labels with barcodes and addresses.",
    answer: `To expedite warehouse dispatch:

1. In **Dashboard -> Orders**, check the boxes next to orders marked 'Ready to Ship'.
2. Click **Bulk Actions -> Print Shipping Labels (4x6)**.
3. The print layout generates industry-standard 4x6-inch shipping labels containing:
   - Courier AWB barcode.
   - Customer name, verified phone, and delivery address.
   - Cash on Delivery collection amount in large numerals.
   - Merchant store name and return contact info.`,
    citations: [{ title: "Warehouse Shipping Labels", url: "/docs/v1/shipping/labels" }],
    verified: true,
  },
  {
    id: "cr-08-courier-cod-reconciliation",
    question: "How does Framique reconcile COD payments collected by couriers with bank remittances?",
    category: "couriers",
    tags: ["reconciliation", "cod", "remittance", "accounting", "payouts"],
    summary: "Upload the courier's weekly remittance Excel/CSV statement to automatically match Consignment IDs and verify payouts against collected COD.",
    answer: `Couriers collect cash from customers and remit balances to merchants weekly minus delivery fees:

1. In **Dashboard -> Settings -> Shipping -> COD Reconciliation**, click **Upload Remittance Sheet**.
2. Select your courier (SteadFast, Pathao, RedX) and upload their payout spreadsheet.
3. Framique cross-references each Consignment ID:
   - Confirms the order collected amount matches the merchant's expected total.
   - Deducts the courier delivery and COD commission fees.
   - Flags discrepancies (e.g. under-collection or missing parcels) for dispute.`,
    citations: [{ title: "Courier COD Reconciliation Engine", url: "/docs/v1/shipping/reconciliation" }],
    verified: true,
  },
  {
    id: "cr-09-automated-manifests",
    question: "How do I create an outgoing dispatch manifest when the courier pickup rider arrives?",
    category: "couriers",
    tags: ["manifests", "dispatch", "pickup-rider", "handover"],
    summary: "Generate an official pickup manifest listing all handed-over parcels with barcodes for the courier driver to sign upon collection.",
    answer: `When the courier pickup agent arrives at your warehouse:

1. Go to **Orders -> Outgoing Manifests -> Create New Manifest**.
2. Scan or select the parcels ready for handover.
3. Click **Generate & Sign Manifest**.
4. The manifest creates an auditable record of package custody transfer with total piece count, COD collection value, and signature lines.`,
    citations: [{ title: "Courier Manifest Guide", url: "/docs/v1/shipping/manifests" }],
    verified: true,
  },
  {
    id: "cr-10-return-handling-reverse-logistics",
    question: "How are returned parcels and customer exchanges tracked in the system?",
    category: "couriers",
    tags: ["returns", "rto", "reverse-logistics", "exchange"],
    summary: "Courier return webhooks flip orders to 'Return in Transit'. When received at the warehouse, inventory is restocked and return reasons logged.",
    answer: `When a customer cancels or is unreachable for delivery:

1. The courier webhook transmits a \`returned\` or \`rto_in_transit\` event.
2. The order updates to **Return in Transit**.
3. When the package physically arrives back at the warehouse, staff scan the AWB to mark it **Returned to Origin (RTO)**.
4. Inventory is safely restocked and the reason (e.g. 'Customer refused delivery', 'Wrong size') is recorded for analytics.`,
    citations: [{ title: "Returns & Reverse Logistics", url: "/docs/v1/shipping/returns" }],
    verified: true,
  },
  {
    id: "cr-11-free-shipping-discounts",
    question: "How do I configure Free Shipping rules (e.g. orders over ৳3,000)?",
    category: "couriers",
    tags: ["free-shipping", "discounts", "promotions"],
    summary: "In Shipping Settings, check 'Enable Free Shipping' and define minimum cart subtotal requirements.",
    answer: `To incentivize larger cart sizes:

1. Under **Settings -> Shipping -> Shipping Zones**, edit the desired zone.
2. Check **Enable Free Shipping**.
3. Specify minimum spend (e.g. \`৳3,000\`).
4. At checkout, orders meeting the threshold automatically waive the delivery fee.`,
    citations: [{ title: "Free Shipping Promotions", url: "/docs/v1/marketing/free-shipping" }],
    verified: true,
  },
  {
    id: "cr-12-custom-courier-manual",
    question: "Can I use my own delivery drivers or a local courier not in the default directory?",
    category: "couriers",
    tags: ["custom-courier", "local-riders", "in-house-delivery"],
    summary: "Yes, add a 'Custom Courier' entry with custom tracking URLs to manage in-house delivery drivers.",
    answer: `Merchants employing their own delivery staff can configure in-house dispatch:

1. Go to **Settings -> Shipping -> Custom Couriers**.
2. Add a driver profile (e.g. 'Dhaka In-House Rider').
3. Assign orders to riders with delivery instructions.
4. Riders can mark orders delivered via the mobile admin view.`,
    citations: [{ title: "In-House Fleet Delivery", url: "/docs/v1/shipping/custom-couriers" }],
    verified: true,
  },
  {
    id: "cr-13-fragile-packaging-flag",
    question: "How do I notify couriers that a parcel contains fragile or liquid items?",
    category: "couriers",
    tags: ["fragile", "packaging", "glass", "cosmetics"],
    summary: "Tag products as 'Fragile' to automatically apply high-visibility warnings to shipping labels and courier API payloads.",
    answer: `For fragile items (glass perfume bottles, terracotta decor, or delicate jewelry):

1. Check the **Fragile Item** flag in the Product editor.
2. When booked with SteadFast or Pathao, the API request includes \`is_fragile: 1\`.
3. Shipping labels print with a bold **⚠️ FRAGILE / HANDLE WITH CARE** header.`,
    citations: [{ title: "Special Packaging Tags", url: "/docs/v1/shipping/packaging" }],
    verified: true,
  },
  {
    id: "cr-14-weight-calculation-tiers",
    question: "How are volumetric and tiered weights calculated for shipping charges?",
    category: "couriers",
    tags: ["weight", "volumetric", "shipping-rates", "courier-billing"],
    summary: "Parcels are charged by the greater of actual weight or volumetric weight (L x W x H / 5000); Framique calculates this automatically from product dimensions.",
    answer: `Couriers bill based on actual weight or volumetric size:

- **Volumetric Formula**: \`(Length cm × Width cm × Height cm) / 5000\`.
- **Automatic Calculation**: When products have dimensions specified, Framique computes the combined package volume and selects the appropriate shipping rate tier.`,
    citations: [{ title: "Volumetric Shipping Calculations", url: "/docs/v1/shipping/weight" }],
    verified: true,
  },
  {
    id: "cr-15-sms-dispatch-notifications",
    question: "How do I customize the automated SMS notifications sent during parcel transit?",
    category: "couriers",
    tags: ["sms", "notifications", "branding", "courier-alerts"],
    summary: "Customize SMS templates in Settings -> Notifications with dynamic placeholders like {customer_name}, {order_number}, and {tracking_url}.",
    answer: `Keep your brand top of mind during delivery:

1. Go to **Settings -> Notifications -> SMS Templates**.
2. Edit the **Order Shipped** and **Out for Delivery** templates.
3. Use placeholders:
   \`"Hello {customer_name}, your order #{order_number} from {store_name} is out for delivery with rider Rahim (phone: {rider_phone}). Ready amount: ৳{cod_amount}."\`
4. Supports localized Bangla and English character encoding.`,
    citations: [{ title: "SMS Notification Settings", url: "/docs/v1/marketing/sms" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CATALOG & INVENTORY (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "cat-01-product-variants-matrix",
    question: "How do I create multi-attribute product variants (e.g. Size: S/M/L and Color: Blue/Red)?",
    category: "catalog",
    tags: ["variants", "options", "sku", "matrix", "inventory"],
    summary: "Add option dimensions (Size, Color) in the Product Editor to generate a complete SKU variant matrix with independent pricing, barcodes, and stock levels.",
    answer: `To sell apparel or lifestyle products with multiple configurations:

1. In **Dashboard -> Products -> Add Product**, scroll to the **Variants & Options** section.
2. Click **Add Option** (e.g., Option Name: \`Size\`, Values: \`S, M, L, XL, XXL\`).
3. Click **Add Option** for color (e.g., Option Name: \`Color\`, Values: \`Navy Blue, Maroon, Emerald\`).
4. Framique generates the combination matrix (15 variants).
5. For each variant, assign:
   - Unique SKU (e.g. \`PJ-MAR-L\`)
   - Price & Compare-at Price
   - Inventory quantity
   - Variant-specific image thumbnail`,
    citations: [{ title: "Product Variant Matrix Guide", url: "/docs/v1/catalog/variants" }],
    verified: true,
  },
  {
    id: "cat-02-bulk-csv-import-export",
    question: "How do I import hundreds of products using a CSV or Excel spreadsheet?",
    category: "catalog",
    tags: ["import", "export", "csv", "bulk-upload", "excel"],
    summary: "Download the sample CSV template from Products -> Import, populate title, price, SKU, categories, and image URLs, then upload with automatic schema validation.",
    answer: `To bulk import an existing catalog:

1. Go to **Dashboard -> Products**, click **Import CSV**.
2. Download the **Framique Sample CSV Template**.
3. Fill in the columns:
   - \`Title\`, \`Handle\`, \`Body_HTML\`, \`Category\`
   - \`SKU\`, \`Price_BDT\`, \`Stock_Quantity\`
   - \`Image_URL_1\`, \`Image_URL_2\`
4. Upload your file. The validator pre-checks for duplicate SKUs and missing image links before committing the batch import.`,
    citations: [{ title: "Bulk Product Import Spec", url: "/docs/v1/catalog/import" }],
    verified: true,
  },
  {
    id: "cat-03-stock-reservation-locks",
    question: "How does stock reservation work when multiple shoppers add the same item to cart?",
    category: "catalog",
    tags: ["stock", "reservation", "cart-lock", "overselling"],
    summary: "Stock is reserved for 15 minutes during the checkout step to guarantee availability and prevent overselling during high-traffic drops.",
    answer: `To prevent embarrassing out-of-stock cancellations:

- **Cart Stage**: Adding an item to the shopping cart does not block other shoppers.
- **Checkout Stage**: Proceeding to payment reserves the items for **15 minutes**.
- **Expiration**: If the customer abandons or payment fails, the reservation automatically releases back into available stock.`,
    citations: [{ title: "Inventory Reservation Logic", url: "/docs/v1/catalog/inventory-locks" }],
    verified: true,
  },
  {
    id: "cat-04-hierarchical-categories",
    question: "How do I structure hierarchical categories and collections?",
    category: "catalog",
    tags: ["categories", "subcategories", "collections", "navigation"],
    summary: "Create parent categories (e.g. Men's Fashion) and nest subcategories (e.g. Panjabi, Shirts) to build clean navigation menus and faceted filter URLs.",
    answer: `Organize your catalog for intuitive customer discovery:

1. Navigate to **Dashboard -> Categories**.
2. Click **Add Category** (e.g. \`Women's Wear\`).
3. To create a subcategory, click **Add Category**, name it \`Jamdani Sarees\`, and select \`Women's Wear\` as the **Parent Category**.
4. Categories generate SEO-friendly permalinks (\`/category/womens-wear/jamdani-sarees\`).`,
    citations: [{ title: "Category Taxonomy Spec", url: "/docs/v1/catalog/categories" }],
    verified: true,
  },
  {
    id: "cat-05-low-stock-alerts",
    question: "How do I receive low stock threshold alerts?",
    category: "catalog",
    tags: ["low-stock", "inventory-alerts", "restock"],
    summary: "Set a low stock threshold (e.g. 5 units) on variants to receive automated dashboard warnings and email alerts when stock runs low.",
    answer: `Never lose sales due to unmonitored stock depletion:

1. Under **Dashboard -> Settings -> Notifications**, set the default **Low Stock Threshold** (e.g. 5 units).
2. When inventory dips below this level:
   - A notification badge appears in the Admin top bar.
   - A daily summary email lists all items requiring restocking.
   - The product card on the storefront optionally shows: \`"Only 3 items left in stock!"\`.`,
    citations: [{ title: "Inventory Alerts Guide", url: "/docs/v1/catalog/stock-alerts" }],
    verified: true,
  },
  {
    id: "cat-06-custom-attributes-filters",
    question: "How do I add custom product specifications (Fabric, Weave, Care Instructions)?",
    category: "catalog",
    tags: ["attributes", "specifications", "fabric", "filters"],
    summary: "Add Custom Attributes in the product editor to display structured specification tables and enable faceted storefront sidebar filtering.",
    answer: `For heritage apparel and technical goods:

1. In the Product editor, locate **Specifications & Attributes**.
2. Add custom key/value pairs:
   - \`Fabric\`: 100% Tangail Pure Cotton
   - \`Weave\`: Handloom Jacquard
   - \`Care Instructions\`: Dry Clean Only
3. Attributes automatically render as a clean specification tab on the storefront product page and power faceted sidebar filters.`,
    citations: [{ title: "Custom Attributes Spec", url: "/docs/v1/catalog/attributes" }],
    verified: true,
  },
  {
    id: "cat-07-digital-downloadable-products",
    question: "Can I sell digital downloads, software, or e-books on Framique?",
    category: "catalog",
    tags: ["digital-products", "downloads", "ebooks", "files"],
    summary: "Yes, set product type to 'Digital Asset' and upload files; customers receive time-limited, encrypted download links after verified payment.",
    answer: `Sell PDF guides, sewing patterns, software, or digital photography:

1. Set **Product Type** to \`Digital Download\`.
2. Upload the digital file (PDF, ZIP, MP3) to secure encrypted storage.
3. Upon verified payment, the customer receives an expiring download link with download attempt limits to prevent unauthorized sharing.`,
    citations: [{ title: "Digital Goods Architecture", url: "/docs/v1/catalog/digital" }],
    verified: true,
  },
  {
    id: "cat-08-tiered-wholesale-pricing",
    question: "How do I offer wholesale B2B volume pricing (e.g. Buy 10+ for ৳800)?",
    category: "catalog",
    tags: ["wholesale", "volume-pricing", "b2b", "bulk-discount"],
    summary: "Configure Quantity Break Rules on products to apply automatic tiered percentage or fixed discounts when bulk quantities are added to cart.",
    answer: `Encourage larger corporate and bulk orders:

1. In the Product editor, enable **Volume / Quantity Breaks**.
2. Define tiers:
   - 1–9 units: \`৳1,200\` each.
   - 10–24 units: \`৳1,000\` each (16% off).
   - 25+ units: \`৳850\` each (29% off).
3. The pricing table displays dynamically on the product page.`,
    citations: [{ title: "Volume Pricing Guide", url: "/docs/v1/catalog/wholesale" }],
    verified: true,
  },
  {
    id: "cat-09-gift-cards-vouchers",
    question: "How do I issue digital gift cards and promotional coupon vouchers?",
    category: "catalog",
    tags: ["gift-cards", "coupons", "promotions", "discounts"],
    summary: "Create digital gift cards with unique redeemable codes or promotional discount vouchers with percentage or fixed BDT savings.",
    answer: `Create vouchers in **Dashboard -> Marketing -> Discounts**:

- **Percentage Discount**: \`EIDMUBARAK\` for 15% off orders over ৳2,500.
- **Fixed Amount**: \`WELCOME100\` for ৳100 off initial purchases.
- **Gift Cards**: Issue digital gift card codes redeemable at checkout across multiple transactions until the stored balance is depleted.`,
    citations: [{ title: "Discounts & Vouchers Spec", url: "/docs/v1/marketing/discounts" }],
    verified: true,
  },
  {
    id: "cat-10-product-badges-ribbons",
    question: "How do I add custom merchandising badges like 'Handmade', 'Trending', or 'Bestseller'?",
    category: "catalog",
    tags: ["badges", "merchandising", "ribbons", "labels"],
    summary: "Assign custom product badges in the catalog editor to display visual overlay ribbons on storefront product cards and detail pages.",
    answer: `Enhance visual conversion and highlight product value:

1. Open the Product Editor and locate the **Badges & Labels** field.
2. Select a pre-set badge (\`New Arrival\`, \`Bestseller\`, \`Limited Edition\`) or enter custom text (e.g. \`100% Handmade\`).
3. Choose the badge tone (Brand Primary, Emerald, Amber, or Gold).
4. Badges render with high contrast on product cards and category grids.`,
    citations: [{ title: "Merchandising Badges Spec", url: "/docs/v1/catalog/badges" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ORDERS & FULFILLMENT (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "ord-01-order-state-machine",
    question: "What is the complete order status lifecycle in Framique?",
    category: "orders",
    tags: ["order-status", "state-machine", "lifecycle", "fulfillment"],
    summary: "Orders follow a strict state machine: pending -> processing -> ready_to_ship -> in_transit -> delivered (or cancelled/returned/refunded).",
    answer: `Framique models order progression through an auditable state machine:

\`\`\`
[pending] ── payment success ──> [processing] ── packed ──> [ready_to_ship]
                                                                  │
                                                          courier pickup
                                                                  ▼
[delivered] <── customer receipt ── [out_for_delivery] <── [in_transit]
     │
     └── customer exchange/return ──> [returned] ──> [refunded]
\`\`\`

Every state transition generates an audit entry and dispatches relevant customer notifications.`,
    citations: [{ title: "Order State Machine Spec §3", url: "/docs/v1/orders/state-machine" }],
    verified: true,
  },
  {
    id: "ord-02-invoice-generation-pdf",
    question: "How are tax invoices generated and printed for customers?",
    category: "orders",
    tags: ["invoice", "pdf", "vat", "mushak", "receipt"],
    summary: "Framique automatically generates NBR-compliant tax invoices in PDF format with store branding, VAT registration numbers, and itemized breakdowns.",
    answer: `Under Bangladeshi commercial regulations, merchants must provide formal purchase invoices:

1. In any order view, click **Print Invoice (PDF)**.
2. The generated invoice features:
   - Merchant brand logo, trade license, and BIN/VAT registration number.
   - Order number and barcode.
   - Itemized product table with SKU, unit price, quantity, and VAT breakdown.
   - Customer shipping and billing address.
   - Payment method and courier tracking AWB.`,
    citations: [{ title: "Invoicing & VAT Compliance", url: "/docs/v1/orders/invoicing" }],
    verified: true,
  },
  {
    id: "ord-03-partial-fulfillment",
    question: "Can I partially fulfill an order if some items are in different warehouses?",
    category: "orders",
    tags: ["partial-fulfillment", "split-shipment", "warehouse"],
    summary: "Yes, select specific items to dispatch in Shipment #1 with its own courier AWB, leaving remaining items in processing for Shipment #2.",
    answer: `When fulfilling multi-item orders with split stock:

1. Open the order and click **Create Shipment**.
2. Select the items and quantities available for immediate dispatch.
3. Assign courier tracking for Shipment #1.
4. The order status updates to **Partially Fulfilled**; remaining items can be dispatched in a secondary shipment when ready.`,
    citations: [{ title: "Split Shipments & Multi-Warehouse", url: "/docs/v1/orders/split-shipments" }],
    verified: true,
  },
  {
    id: "ord-04-order-cancellation-rules",
    question: "What happens when an order is cancelled before courier pickup?",
    category: "orders",
    tags: ["cancellation", "refund", "inventory-restock"],
    summary: "Cancelling an order automatically voids pending courier bookings, releases reserved inventory back to stock, and initiates payment refunds if prepaid.",
    answer: `If a customer requests cancellation before dispatch:

1. In **Dashboard -> Orders -> [Order #]**, select **Cancel Order**.
2. Choose the cancellation reason (e.g. 'Customer changed mind', 'Duplicate order').
3. System actions:
   - Re-credits inventory quantity.
   - Cancels the courier parcel booking via API.
   - Dispatches a cancellation confirmation SMS.
   - Initiates an automated refund if paid online.`,
    citations: [{ title: "Order Cancellation Spec", url: "/docs/v1/orders/cancellation" }],
    verified: true,
  },
  {
    id: "ord-05-customer-notes-internal-tags",
    question: "How do staff add private notes and internal tags to orders?",
    category: "orders",
    tags: ["order-notes", "internal-tags", "staff-collaboration"],
    summary: "Add Private Staff Notes and colored order tags (e.g. VIP, Urgent, Call Before Shipping) to coordinate warehouse team actions.",
    answer: `Facilitate seamless team collaboration on orders:

- **Private Staff Notes**: Write internal notes (e.g. \`"Customer requested delivery strictly after 5 PM"\`). These are never visible to the customer.
- **Custom Order Tags**: Assign tags like \`VIP\`, \`Fragile\`, or \`Custom Gift Wrap\` to filter and batch orders in fulfillment views.`,
    citations: [{ title: "Order Collaboration Tools", url: "/docs/v1/orders/notes" }],
    verified: true,
  },
  {
    id: "ord-06-customer-address-editing",
    question: "Can staff update a customer's delivery address after an order is placed?",
    category: "orders",
    tags: ["address-update", "order-modification", "shipping-address"],
    summary: "Yes, delivery addresses can be edited on orders prior to courier parcel booking; updates automatically sync to the courier API.",
    answer: `If a customer calls saying their street number was mistyped:

1. Open the order in **Dashboard -> Orders**.
2. In the Customer Card, click **Edit Shipping Address**.
3. Update the recipient name, phone, district, or address details.
4. If already booked with a courier, Framique prompts you to automatically update the destination with the courier's booking API.`,
    citations: [{ title: "Order Modification Spec", url: "/docs/v1/orders/address-edit" }],
    verified: true,
  },
  {
    id: "ord-07-export-orders-excel",
    question: "How do I export order data to Excel for accounting and bookkeeping?",
    category: "orders",
    tags: ["export", "excel", "accounting", "reports"],
    summary: "Filter orders by date range or status and click 'Export Orders' to download a complete CSV/Excel report with itemized sales data.",
    answer: `Generate comprehensive sales reports for bookkeeping:

1. Go to **Dashboard -> Orders**.
2. Filter by date range (e.g. Last 30 Days) or fulfillment status.
3. Click **Export -> Export as CSV / Excel**.
4. The spreadsheet includes order ID, customer details, gross sales, shipping collected, discounts, net revenue, and payment transaction IDs.`,
    citations: [{ title: "Orders Reporting & Export", url: "/docs/v1/orders/export" }],
    verified: true,
  },
  {
    id: "ord-08-exchange-requests-workflow",
    question: "How are clothing size exchanges handled in the order dashboard?",
    category: "orders",
    tags: ["exchange", "clothing", "size-exchange", "reverse-pickup"],
    summary: "Create an Exchange Order to reserve the new size, dispatch a replacement parcel, and arrange reverse courier pickup of the original unit.",
    answer: `For apparel merchants where size exchanges are common:

1. On the delivered order page, click **Create Exchange**.
2. Select the returned item (e.g. Size M Panjabi) and select the desired replacement (Size L Panjabi).
3. The system creates an associated exchange order, reserves the new inventory, and books a reverse-pickup package with your courier.`,
    citations: [{ title: "Apparel Exchange Workflows", url: "/docs/v1/orders/exchanges" }],
    verified: true,
  },
  {
    id: "ord-09-high-volume-bulk-fulfillment",
    question: "How do I batch-fulfill 500+ orders simultaneously during festive Eid campaigns?",
    category: "orders",
    tags: ["bulk-fulfillment", "eid-campaign", "high-volume", "automation"],
    summary: "Select all pending orders and run 'Bulk Courier Dispatch' to book couriers, generate AWB tracking, and print labels in background batches.",
    answer: `During peak campaign spikes (such as Eid, Pahela Baishakh, or Black Friday):

1. Go to **Dashboard -> Orders -> Processing**.
2. Click **Select All (500 orders)**.
3. Select **Bulk Actions -> Dispatch with SteadFast/Pathao**.
4. A background job processes the bookings via courier APIs with rate-limit protection, printing a master picking list and sequential shipping labels.`,
    citations: [{ title: "High-Volume Fulfillment Spec", url: "/docs/v1/orders/bulk-fulfillment" }],
    verified: true,
  },
  {
    id: "ord-10-customer-purchase-history",
    question: "How can I view a customer's complete lifetime spend and order history?",
    category: "orders",
    tags: ["customer-history", "lifetime-value", "crm", "clv"],
    summary: "Opening any customer profile displays lifetime spend, average order value (AOV), past orders, delivery success rates, and contact history.",
    answer: `Build personalized customer relationships:

- In **Dashboard -> Customers**, search by phone or email.
- The customer profile displays:
  - **Lifetime Value (LTV)**: Total money spent in minor units.
  - **Total Orders & Delivery Rate**: Percentage of completed vs returned orders.
  - **Saved Addresses & Notes**.`,
    citations: [{ title: "Customer CRM Spec", url: "/docs/v1/customers/overview" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. SEO & SEARCH SCHEMAS (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "seo-01-json-ld-structured-data",
    question: "What JSON-LD structured data schemas does Framique inject into storefront pages?",
    category: "seo",
    tags: ["seo", "json-ld", "structured-data", "rich-snippets", "google"],
    summary: "Framique automatically injects Product, Organization, WebSite, BreadcrumbList, and FAQPage JSON-LD schemas for rich Google search snippets.",
    answer: `Framique includes a comprehensive semantic SEO engine:

### Injected Structured Data Schemas:
1. **Product Schema**: Injected on PDPs with name, SKU, images, description, currency (\`BDT\`), availability (\`InStock\`), and merchant rating.
2. **Organization & LocalBusiness**: Includes store brand name, logo, customer service hotline, and address.
3. **BreadcrumbList**: Hierarchical category path for clean Google search SERP breadcrumbs.
4. **FAQPage**: Automatically generates schema from FAQ widgets for expandable Google search results.`,
    citations: [{ title: "SEO Schema Blueprint", url: "/docs/v1/seo/schemas" }],
    verified: true,
  },
  {
    id: "seo-02-xml-sitemaps-robots",
    question: "How does Framique generate XML sitemaps and robots.txt files?",
    category: "seo",
    tags: ["sitemap", "robots.txt", "xml", "crawling", "indexing"],
    summary: "XML sitemaps (sitemap.xml) and robots.txt are dynamically generated and cached, listing all published products, categories, and builder pages.",
    answer: `Search engines require up-to-date sitemaps to discover new products:

- **Sitemap Endpoint**: \`https://yourstore.com/sitemap.xml\` dynamically aggregates all published products, categories, articles, and pages with \`<lastmod>\` timestamps.
- **Image Sitemaps**: Product image URLs are embedded within sitemap nodes to index imagery in Google Image Search.
- **Robots.txt**: Automatically configured to allow search engines while disallowing checkout, cart, and administrative login pages.`,
    citations: [{ title: "Sitemap & Indexing Engine", url: "/docs/v1/seo/sitemaps" }],
    verified: true,
  },
  {
    id: "seo-03-opengraph-social-meta",
    question: "How are OpenGraph and Twitter Card preview images generated for Facebook and WhatsApp sharing?",
    category: "seo",
    tags: ["opengraph", "social-preview", "facebook", "whatsapp", "meta-tags"],
    summary: "Framique generates rich dynamic OpenGraph meta tags with product title, price, and high-resolution thumbnail images for social sharing.",
    answer: `When shoppers share product links on Facebook, WhatsApp, or Messenger:

- \`og:title\`: Optimized product title.
- \`og:description\`: Price in BDT and stock status summary.
- \`og:image\`: High-resolution 1200x630px social card generated with brand overlay.
- \`og:url\`: Canonical storefront URL.`,
    citations: [{ title: "Social Meta Tags Spec", url: "/docs/v1/seo/opengraph" }],
    verified: true,
  },
  {
    id: "seo-04-canonical-urls-duplicates",
    question: "How does Framique prevent duplicate content penalties from filter parameters and pagination?",
    category: "seo",
    tags: ["canonical", "duplicate-content", "pagination", "filters"],
    summary: "Every page emits a strict <link rel='canonical'> tag stripping tracking parameters and pointing faceted search views back to the primary category URL.",
    answer: `Faceted product filtering (e.g. \`?sort=price_asc&size=L\`) can create duplicate URLs:

- **Strict Canonicals**: All filtered category URLs point their canonical link to the root category URL (\`/category/panjabi\`).
- **Clean Permalinks**: Trailing slashes and lowercase handles are normalized automatically at the edge.`,
    citations: [{ title: "Canonical URL Rules", url: "/docs/v1/seo/canonicals" }],
    verified: true,
  },
  {
    id: "seo-05-custom-meta-titles-descriptions",
    question: "How can merchants edit custom SEO titles and meta descriptions for products and pages?",
    category: "seo",
    tags: ["meta-title", "meta-description", "serp-preview"],
    summary: "The SEO panel in product and page editors provides live Google SERP desktop and mobile snippet previews with character count indicators.",
    answer: `Optimize search click-through rates:

1. In any Product or Page editor, scroll to the **Search Engine Optimization (SEO)** card.
2. Edit the **Page Title** (recommended 50–60 characters).
3. Edit the **Meta Description** (recommended 140–160 characters).
4. Review the live Google desktop and mobile snippet preview.`,
    citations: [{ title: "SERP Optimization Guide", url: "/docs/v1/seo/snippets" }],
    verified: true,
  },
  {
    id: "seo-06-google-search-console-verification",
    question: "How do I verify my store on Google Search Console (GSC)?",
    category: "seo",
    tags: ["google-search-console", "gsc", "verification", "webmaster"],
    summary: "Paste your Google Site Verification HTML tag under Settings -> SEO -> Webmaster Tools or verify automatically via DNS TXT records.",
    answer: `Verify your site on Google Search Console:

1. In Google Search Console, select **URL Prefix** or **Domain**.
2. Copy the verification meta tag (\`<meta name="google-site-verification" content="..." />\`).
3. In Framique, navigate to **Dashboard -> Settings -> SEO -> Google Verification**.
4. Paste the verification token and click **Save**. Google verifies ownership instantly.`,
    citations: [{ title: "Google Webmaster Verification", url: "/docs/v1/seo/gsc" }],
    verified: true,
  },
  {
    id: "seo-07-page-speed-core-web-vitals",
    question: "How does Framique optimize Core Web Vitals (LCP, CLS, INP) for search ranking?",
    category: "seo",
    tags: ["core-web-vitals", "page-speed", "lcp", "cls", "performance"],
    summary: "Framique uses Next-gen AVIF/WebP image compression, zero layout shift placeholders, font preloading, and edge caching to achieve 90+ Lighthouse scores.",
    answer: `Google prioritizes fast, responsive e-commerce websites:

- **Largest Contentful Paint (LCP < 1.2s)**: Hero images are preloaded with \`fetchpriority="high"\` and compressed to WebP/AVIF.
- **Cumulative Layout Shift (CLS = 0)**: Media elements have explicit width/height aspect ratios to prevent content jumping.
- **Interaction to Next Paint (INP < 100ms)**: Minimal client-side JavaScript execution via TanStack Start island hydration.`,
    citations: [{ title: "Core Web Vitals Spec", url: "/docs/v1/performance/web-vitals" }],
    verified: true,
  },
  {
    id: "seo-08-blog-content-marketing",
    question: "How does the built-in Blog CMS boost organic search traffic?",
    category: "seo",
    tags: ["blog", "content-marketing", "organic-traffic", "articles"],
    summary: "The built-in Blog engine allows publishing SEO-optimized articles with Article schema markup, category tags, author profiles, and related products.",
    answer: `Attract high-intent search traffic with content marketing:

1. Navigate to **Dashboard -> Content -> Posts**.
2. Author rich articles using the Classic Editor with headings, images, and embedded shoppable product widgets.
3. Every post generates \`Article\` JSON-LD schema, author bylines, and breadcrumbs.`,
    citations: [{ title: "Content Marketing & Blog Spec", url: "/docs/v1/content/blog" }],
    verified: true,
  },
  {
    id: "seo-09-automated-redirects-404",
    question: "How does Framique manage 301 URL redirects when product slugs change?",
    category: "seo",
    tags: ["redirects", "301", "slugs", "broken-links", "404"],
    summary: "Changing a product or page URL handle automatically records an immutable 301 Permanent Redirect to preserve search ranking equity.",
    answer: `Avoid 404 errors when updating product titles:

- When a merchant edits a product slug from \`/products/panjabi-2025\` to \`/products/panjabi-2026\`, the previous URL is automatically saved to \`url_redirects\`.
- Any customer or search crawler visiting the old URL receives an immediate HTTP 301 redirect to the new URL without losing link equity.`,
    citations: [{ title: "URL Redirect Engine", url: "/docs/v1/seo/redirects" }],
    verified: true,
  },
  {
    id: "seo-10-aeo-ai-search-optimization",
    question: "How is Framique optimized for AI search engines like Perplexity, ChatGPT, and Google Gemini?",
    category: "seo",
    tags: ["aeo", "ai-search", "llms.txt", "perplexity", "chatgpt"],
    summary: "Stores automatically emit a standardized /llms.txt and /llms-full.txt file formatting the store catalog for direct AI citations.",
    answer: `Framique pioneers Answer Engine Optimization (AEO):

- **LLMs.txt Endpoint**: Every store serves \`https://yourstore.com/llms.txt\`, providing structured markdown summaries of products, collections, and policies.
- **Citation Readiness**: AI search engines (ChatGPT Search, Perplexity, Gemini) read this file to accurately quote prices and product availability.`,
    citations: [{ title: "AEO & LLMs.txt Spec", url: "/docs/v1/seo/aeo" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. SECURITY & PERMISSIONS (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "sec-01-staff-rbac-roles",
    question: "What staff roles and permissions are available for merchant team members?",
    category: "security",
    tags: ["rbac", "roles", "staff", "permissions", "team"],
    summary: "Framique provides four granular roles: Owner (full control), Admin (store operations), Editor (products & content), and Viewer (read-only audit).",
    answer: `Control team access safely in **Dashboard -> Settings -> Team Members**:

| Role | Catalog & Content | Orders & Customers | Payments & Secrets | Team & Billing |
|---|---|---|---|---|
| **Owner** | Full | Full | Full | Full |
| **Admin** | Full | Full | Read/Configure | Invite Staff |
| **Editor** | Read/Write | View Only | None | None |
| **Viewer** | Read-Only | Read-Only | None | None |

Role capabilities are verified server-side on every RPC request.`,
    citations: [{ title: "Staff RBAC Specification §5", url: "/docs/v1/security/rbac" }],
    verified: true,
  },
  {
    id: "sec-02-api-key-rotation",
    question: "How do I generate and rotate webhook signing secrets and API keys?",
    category: "security",
    tags: ["api-keys", "rotation", "webhooks", "credentials"],
    summary: "Generate scoped API tokens under Settings -> Developers; rotating a key provides an optional 24-hour grace overlap window to prevent downtime.",
    answer: `For integrations with custom ERPs or accounting software:

1. Navigate to **Dashboard -> Settings -> Developers -> API Keys**.
2. Click **Generate New API Key** and assign granular scopes (\`orders:read\`, \`products:write\`).
3. During key rotation, Framique offers a **24-hour transition overlap** during which both old and new keys are accepted.`,
    citations: [{ title: "API Authentication & Rotation", url: "/docs/v1/security/api-keys" }],
    verified: true,
  },
  {
    id: "sec-03-session-security-2fa",
    question: "Does Framique support Two-Factor Authentication (2FA) for merchant logins?",
    category: "security",
    tags: ["2fa", "mfa", "totp", "auth", "security"],
    summary: "Yes, staff accounts support TOTP authenticator apps (Google Authenticator, 1Password) with encrypted recovery codes.",
    answer: `Secure your store management console against password theft:

1. Go to **Dashboard -> Account Settings -> Two-Factor Authentication**.
2. Scan the displayed QR code with your TOTP app (Google Authenticator, Apple Passwords).
3. Enter the 6-digit confirmation code and save your generated recovery backup codes in a secure vault.`,
    citations: [{ title: "MFA Authentication Spec", url: "/docs/v1/security/mfa" }],
    verified: true,
  },
  {
    id: "sec-04-ddos-protection-waf",
    question: "How does Framique protect storefronts against DDoS and scraper bot attacks?",
    category: "security",
    tags: ["waf", "ddos", "cloudflare", "openresty", "bot-defense"],
    summary: "Multi-layered protection combines edge rate limits, IP reputation firewalls, bot challenges, and upstream connection pooling.",
    answer: `Traffic is screened before reaching application servers:

- **Edge IP Filtering**: Requests from known abusive proxy networks or malicious scraper ranges are blocked at the edge proxy.
- **Challenge Mode**: When abnormal request velocity is detected from an IP, an automated cryptographic JS challenge is presented.
- **Isolated Resource Pools**: High-concurrency storefront traffic cannot exhaust database connections used by the merchant admin console.`,
    citations: [{ title: "WAF & Bot Defense Architecture", url: "/docs/v1/security/waf" }],
    verified: true,
  },
  {
    id: "sec-05-customer-pii-redaction",
    question: "How are customer phone numbers, addresses, and emails protected against accidental leaks?",
    category: "security",
    tags: ["pii", "privacy", "redaction", "compliance"],
    summary: "Framique enforces PII redaction algorithms across AI logs, error reporting, and export traces, masking phones and payment identifiers.",
    answer: `Customer privacy is protected under strict zero-leakage policies:

- **AI Log Scrubbing**: Customer phone numbers (\`017XXXXXXXX\`) and emails are replaced with \`[phone redacted]\` and \`[email redacted]\` before entering AI training sets.
- **Log Anonymization**: Server error traces and Prometheus metrics never record raw customer phone numbers or payment card details.`,
    citations: [{ title: "Privacy & Data Protection Spec", url: "/docs/v1/security/privacy" }],
    verified: true,
  },
  {
    id: "sec-06-ip-allowlisting-admin",
    question: "Can I restrict admin dashboard access to specific office IP addresses?",
    category: "security",
    tags: ["ip-allowlist", "network-security", "office-ip"],
    summary: "Yes, enterprise stores can configure an IP Allowlist in Security Settings to block dashboard logins from unauthorized networks.",
    answer: `Protect corporate consoles from remote intrusion:

1. Go to **Settings -> Security -> IP Restrictions**.
2. Add your corporate office static IP addresses or VPN ranges.
3. Once enabled, login attempts from outside allowed IPs are rejected with HTTP 403 Forbidden.`,
    citations: [{ title: "IP Access Restrictions", url: "/docs/v1/security/ip-allowlist" }],
    verified: true,
  },
  {
    id: "sec-07-database-connection-security",
    question: "How are database queries secured against SQL injection?",
    category: "security",
    tags: ["sql-injection", "orm", "postgres", "prepared-statements"],
    summary: "All database queries use parameterized prepared statements through PostgREST and typed Supabase client builders with zero raw string concatenation.",
    answer: `SQL injection vulnerabilities are structurally eliminated:

- **Parameterized Statements**: All queries execute via prepared statements where inputs are bound as separate data parameters.
- **Strict Typing**: TanStack Start validators (Zod schemas) enforce data types before database handlers execute.`,
    citations: [{ title: "Data Layer Security Standards", url: "/docs/v1/security/database" }],
    verified: true,
  },
  {
    id: "sec-08-session-invalidation-logout",
    question: "How can an owner instantly terminate compromised staff sessions?",
    category: "security",
    tags: ["session-kill", "logout", "security-incident"],
    summary: "In Team Settings, owners can click 'Revoke All Sessions' on any staff profile to immediately invalidate their active authentication tokens.",
    answer: `In the event of a lost laptop or departing employee:

1. In **Dashboard -> Settings -> Team Members**, select the user profile.
2. Click **Revoke All Sessions**.
3. All active JWT tokens and browser refresh sessions are terminated immediately.`,
    citations: [{ title: "Session Lifecycle Management", url: "/docs/v1/security/sessions" }],
    verified: true,
  },
  {
    id: "sec-09-gdpr-data-deletion",
    question: "How does Framique handle customer data export and right-to-be-forgotten requests?",
    category: "security",
    tags: ["gdpr", "data-export", "right-to-be-forgotten", "privacy"],
    summary: "Generate complete customer personal data ZIP archives or execute cryptographic erasure of PII while preserving legal financial tax ledgers.",
    answer: `Comply with data protection regulations:

- **Export Data**: Click "Export Customer Data" in the customer profile to download an auditable JSON bundle of orders, addresses, and communications.
- **Forget Customer**: Executes cryptographic erasure of personal identifiable info while retaining anonymized order totals required for national tax audits.`,
    citations: [{ title: "Data Subject Rights Spec", url: "/docs/v1/security/gdpr" }],
    verified: true,
  },
  {
    id: "sec-10-supply-chain-bun-guard",
    question: "How does the Bun supply-chain guard protect the platform from malicious npm packages?",
    category: "security",
    tags: ["supply-chain", "bun", "security-guard", "packages"],
    summary: "bunfig.toml enforces a 24-hour minimum package release age policy, preventing zero-day supply-chain attacks from freshly published npm packages.",
    answer: `Supply-chain security is enforced at package installation:

- **24-Hour Age Policy**: Bun automatically rejects packages published within the last 24 hours.
- **Malware Defense**: Prevents compromised npm package versions from being installed before security scanners detect them.`,
    citations: [{ title: "Supply-Chain Guard Spec", url: "/docs/v1/security/supply-chain" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. DOMAINS & SSL (5 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "dom-01-custom-domain-setup",
    question: "How do I connect my own custom domain (e.g. yourbrand.com) to my Framique store?",
    category: "domains",
    tags: ["domains", "dns", "cname", "a-record", "custom-domain"],
    summary: "Add your domain in Settings -> Domains, then create an A record pointing to Framique's ingress IP (or CNAME for subdomains) at your registrar.",
    answer: `Connect your custom apex or subdomain:

### Step-by-Step DNS Configuration:
1. Navigate to **Dashboard -> Settings -> Domains -> Connect Domain**.
2. Enter your domain name (e.g. \`yourbrand.com\`).
3. Log in to your domain registrar (Namecheap, GoDaddy, Cloudflare, BTCL):
   - **For Apex Domain (\`yourbrand.com\`)**:
     - Type: \`A Record\`
     - Host: \`@\`
     - Value: \`159.65.138.164\` (Framique Ingress IP)
   - **For Subdomain (\`shop.yourbrand.com\`)**:
     - Type: \`CNAME Record\`
     - Host: \`shop\`
     - Value: \`ingress.framique.com\`
4. Return to Framique and click **Verify DNS Records**.`,
    citations: [{ title: "Custom Domain Connection Guide", url: "/docs/v1/domains/setup" }],
    verified: true,
  },
  {
    id: "dom-02-automated-ssl-tls",
    question: "How does automated SSL/TLS certificate issuance and renewal work?",
    category: "domains",
    tags: ["ssl", "tls", "https", "acme", "letsencrypt"],
    summary: "Framique automatically provisions and renews free Let's Encrypt TLS certificates via ACME HTTP-01 challenges within 60 seconds of DNS verification.",
    answer: `Every store receives automatic, bank-grade encryption:

1. **Automated ACME Challenge**: Once DNS points to Framique, the edge proxy responds to Let's Encrypt's HTTP-01 verification challenge.
2. **Certificate Issuance**: High-assurance TLS 1.3 certificates are issued and installed in memory.
3. **Automatic 60-Day Renewal**: Certificates are monitored and renewed automatically 30 days prior to expiry with zero manual intervention.`,
    citations: [{ title: "Automated TLS Architecture", url: "/docs/v1/domains/ssl" }],
    verified: true,
  },
  {
    id: "dom-03-primary-domain-redirect",
    question: "How do I redirect www to non-www (or vice versa) to avoid SEO splitting?",
    category: "domains",
    tags: ["redirects", "www", "canonical-domain", "seo"],
    summary: "Select your preferred primary domain in Settings -> Domains; Framique automatically issues permanent 301 redirects for all other aliases.",
    answer: `Prevent search engines from indexing two separate versions of your site:

1. In **Dashboard -> Settings -> Domains**, click the three dots next to your preferred domain.
2. Select **Set as Primary Domain**.
3. Traffic arriving at secondary aliases (e.g. \`www.yourbrand.com\` or \`yourbrand.framique.com\`) is automatically redirected with an HTTP 301 Permanent Redirect.`,
    citations: [{ title: "Primary Domain Routing Spec", url: "/docs/v1/domains/primary" }],
    verified: true,
  },
  {
    id: "dom-04-dns-troubleshooting",
    question: "Why does my domain say 'Verification Pending' or 'DNS Not Propagated'?",
    category: "domains",
    tags: ["dns-propagation", "troubleshooting", "ttl"],
    summary: "DNS propagation can take from 5 minutes up to 24 hours depending on registrar TTL settings; verify your records match using DNS lookup tools.",
    answer: `If your domain is not verifying immediately:

1. **Check TTL**: If your previous DNS records had a high TTL (e.g. 86400s), local resolvers may cache old IP addresses.
2. **Verify Records**: Use public DNS lookup tools (like \`dig +short yourbrand.com\` or \`dnschecker.org\`) to verify that all global nodes resolve to Framique's IP.
3. **Cloudflare Proxy Warning**: If using Cloudflare DNS, set the Proxy status to **DNS Only (Grey Cloud)** during initial verification.`,
    citations: [{ title: "DNS Troubleshooting Guide", url: "/docs/v1/domains/troubleshooting" }],
    verified: true,
  },
  {
    id: "dom-05-custom-email-mx-records",
    question: "Can I use Google Workspace, Zoho, or Microsoft 365 for business email with my domain?",
    category: "domains",
    tags: ["email", "mx-records", "google-workspace", "zoho"],
    summary: "Yes, Framique only requires an A or CNAME record for web traffic; your MX, SPF, and DKIM email records remain managed at your DNS registrar.",
    answer: `Connecting your domain to Framique does not interfere with your business email:

- Keep your DNS hosted at your registrar (or Cloudflare).
- Point only web records (\`@\` or \`shop\`) to Framique.
- Leave MX, TXT (SPF), and CNAME (DKIM) records pointing to Google Workspace, Zoho Mail, or Microsoft 365.`,
    citations: [{ title: "Business Email Coexistence Guide", url: "/docs/v1/domains/email" }],
    verified: true,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. OPERATIONS & DISASTER RECOVERY (10 items)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "ops-01-continuous-wal-streaming",
    question: "How does continuous PostgreSQL WAL archiving achieve an RPO under 10 seconds?",
    category: "operations",
    tags: ["wal", "backup", "rpo", "disaster-recovery", "postgres"],
    summary: "Write-Ahead Logs (WAL) are streamed continuously to isolated off-site storage, guaranteeing a Recovery Point Objective (RPO) of less than 10 seconds.",
    answer: `To eliminate the risk of transaction data loss:

1. **Continuous WAL Archiving**: PostgreSQL streams Write-Ahead Log segments immediately as transactions commit.
2. **Sub-10s Lag Probe**: An automated systemd timer checks replication lag every hour, raising alerts if lag exceeds 30 seconds.
3. **Point-in-Time Recovery (PITR)**: Enables rolling back the database to any specific second in time in the event of human error or catastrophic disk corruption.`,
    citations: [{ title: "Backup & Disaster Recovery Manual §B1", url: "/docs/v1/operations/backups" }],
    verified: true,
  },
  {
    id: "ops-02-daily-backup-integrity",
    question: "How are automated daily database backups verified for integrity?",
    category: "operations",
    tags: ["backups", "pg-dump", "sha256", "integrity"],
    summary: "Automated nightly pg_dump snapshots are cryptographically hashed with SHA-256 and verified against corruption before off-site replication.",
    answer: `Automated backup execution schedule:

- **Nightly Snapshots (02:30 UTC)**: \`backup.sh\` generates a compressed binary PostgreSQL dump.
- **Cryptographic Verification**: \`integrity-verify.sh\` validates SHA-256 checksums and tests archive decodability.
- **Weekly Base Backups (Sunday 03:30 UTC)**: \`pgbasebackup.sh\` creates a full filesystem-level base cluster backup.`,
    citations: [{ title: "Backup Operations Guide §B2", url: "/docs/v1/operations/integrity" }],
    verified: true,
  },
  {
    id: "ops-03-recovery-rehearsal-rto",
    question: "How does Framique rehearse disaster recovery to guarantee a Recovery Time Objective (RTO) under 60 seconds?",
    category: "operations",
    tags: ["rehearsal", "rto", "dr-test", "sandbox-restore"],
    summary: "Automated weekly rehearsals spin up isolated scratch database containers, execute complete restores, and assert row integrity with an RTO of 10-15s.",
    answer: `Untested backups are not true backups. Framique enforces automated recovery rehearsals:

1. **Isolated Scratch PG**: \`rehearse.sh\` starts an isolated ephemeral PostgreSQL instance (\`--network none\`).
2. **Live Restore Execution**: Restores the latest verified snapshot dump.
3. **Integrity Assertions**: Runs queries verifying table counts, merchant isolation, and financial ledger consistency.
4. **Audit Logging**: Logs proven RTO (typically 10–15 seconds) into \`rehearsals.jsonl\`.`,
    citations: [{ title: "Disaster Recovery Rehearsal Spec §B3", url: "/docs/v1/operations/rehearsal" }],
    verified: true,
  },
  {
    id: "ops-04-prometheus-grafana-metrics",
    question: "What real-time metrics and system alerts are monitored in Framique?",
    category: "operations",
    tags: ["monitoring", "prometheus", "grafana", "observability", "metrics"],
    summary: "Self-hosted Prometheus monitors HTTP request latency, error rates (5xx), active database connections, queue depths, and memory utilization.",
    answer: `24/7 observability across infrastructure tiers:

- **Request Rate & Latency**: p50, p95, and p99 response times measured per merchant storefront.
- **Error Rates**: Real-time alerts if 5xx HTTP responses exceed 0.5% over a 5-minute window.
- **Database Connection Pool**: Tracks active pool utilization on pgBouncer.
- **Background Jobs Queue**: Monitors job processing latency and failed retry queues.`,
    citations: [{ title: "Observability Architecture §27", url: "/docs/v1/operations/monitoring" }],
    verified: true,
  },
  {
    id: "ops-05-circuit-breaker-fallback",
    question: "How do automated circuit breakers protect the platform when external services fail?",
    category: "operations",
    tags: ["circuit-breaker", "resilience", "high-availability", "fallbacks"],
    summary: "Circuit breakers track failure rates on external courier and payment APIs; if an upstream fails, calls fail-fast with graceful fallback modes.",
    answer: `Third-party services in emerging markets occasionally suffer outages:

1. **Failure Threshold**: If an external API (e.g. courier tracking) times out 5 consecutive times, the circuit breaker opens for 60 seconds.
2. **Fail-Fast Defense**: Subsequent requests bypass network timeouts immediately.
3. **Customer Fallback**: Storefronts display cached information or gracefully offer alternate options (e.g. falling back to SMS alerts).
4. **Half-Open Probe**: Periodically sends a single probe request to detect service recovery automatically.`,
    citations: [{ title: "System Circuit Breakers §18", url: "/docs/v1/operations/circuit-breakers" }],
    verified: true,
  },
  {
    id: "ops-06-loki-centralized-logging",
    question: "How are server logs aggregated and searched in production?",
    category: "operations",
    tags: ["loki", "logging", "grafana", "audit-search"],
    summary: "Structured JSON logs from all edge, app, and database processes stream into Grafana Loki for centralized, searchable forensic analysis.",
    answer: `Fast incident investigation without logging into production servers:

- **Structured JSON Logs**: All application events log timestamp, log level, merchant ID, trace ID, and duration.
- **LogQL Search**: Engineers search logs in Grafana using LogQL:
  \`\`\`
  {service="framique-app"} |= "error" | json | latencyMs > 1000
  \`\`\`
- **Zero Disk Full Crashes**: Automated log rotation prunes container output files older than 14 days.`,
    citations: [{ title: "Logging & Telemetry Architecture", url: "/docs/v1/operations/logging" }],
    verified: true,
  },
  {
    id: "ops-07-redis-cache-eviction",
    question: "What cache eviction policies are enforced on Redis application caches?",
    category: "operations",
    tags: ["redis", "caching", "cache-eviction", "performance"],
    summary: "Redis caches use explicit TTL expiration and LRU (Least Recently Used) eviction to ensure fast sub-millisecond memory queries.",
    answer: `Preventing cache memory exhaustion:

- **Explicit TTLs**: Catalog and theme caches are set with 30-to-300-second TTLs.
- **Event Invalidation**: Mutating products or themes immediately dispatches cache purge events.
- **LRU Eviction**: In extreme spikes, Redis evicts the least recently accessed keys (\`volatile-lru\`) without disrupting active database transactions.`,
    citations: [{ title: "Cache Discipline Specification", url: "/docs/v1/architecture/caching" }],
    verified: true,
  },
  {
    id: "ops-08-incident-quarantine-lockdown",
    question: "What happens during an emergency security quarantine or merchant lockdown?",
    category: "operations",
    tags: ["quarantine", "lockdown", "security-incident", "incident-response"],
    summary: "Platform administrators can place compromised stores into read-only quarantine, immediately halting checkout and external webhook dispatch.",
    answer: `In the event of detected malicious activity:

1. An administrator can trigger \`quarantineMerchant(merchantId)\`.
2. The store is switched to read-only maintenance mode.
3. Outbound API keys and webhooks are suspended to prevent unauthorized fund movements.
4. Active staff sessions are invalidated pending security audit.`,
    citations: [{ title: "Incident Response Manual §21", url: "/docs/v1/operations/quarantine" }],
    verified: true,
  },
  {
    id: "ops-09-automated-db-schema-migrations",
    question: "How are database schema migrations applied safely without breaking live traffic?",
    category: "operations",
    tags: ["migrations", "database", "schema", "zero-downtime"],
    summary: "Migrations follow expand-and-contract patterns with backward-compatible columns, applied through an automated transactional runner.",
    answer: `Zero-downtime schema migrations:

- **Expand Phase**: New columns are added as nullable or with safe defaults.
- **Application Deploy**: Updated code starts writing to both old and new columns.
- **Contract Phase**: Deprecated legacy columns are safely dropped after full deployment.
- **Check Fingerprint**: \`schema:check\` validates that local migration files match the live production schema fingerprint before deployment.`,
    citations: [{ title: "Database Migration Guide", url: "/docs/v1/database/migrations" }],
    verified: true,
  },
  {
    id: "ops-10-self-hosted-cloud-sovereignty",
    question: "Why is Framique self-hosted on sovereign infrastructure rather than closed third-party cloud lock-in?",
    category: "operations",
    tags: ["cloud-sovereignty", "self-hosted", "data-ownership", "no-lockin"],
    summary: "Framique provides complete data sovereignty with zero vendor lock-in, running standard open technologies (Postgres, Redis, OpenResty, Bun) on dedicated hardware.",
    answer: `Merchants own their business data completely:

- **No Vendor Lock-in**: Full open-source stack (PostgreSQL, Bun, Redis, OpenResty).
- **Local Data Residence**: Database and media storage can reside within regional borders satisfying national data compliance laws.
- **Cost Efficiency**: No arbitrary API seat fees, tier penalties, or bandwidth markups.`,
    citations: [{ title: "Framique Platform Manifesto", url: "/docs/v1/manifesto" }],
    verified: true,
  },
];
