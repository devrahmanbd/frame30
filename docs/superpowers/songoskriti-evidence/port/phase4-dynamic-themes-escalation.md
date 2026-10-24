# Phase 4 — Dynamic themes, Task 1: the composable parts contract and the account's placeable panels (escalation bundle)

**Branch:** `frame30` · **Base commit:** `109e2d3d` · **Recorded:** 2026-10-22
**Plan:** `docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md` (Task 1)
**Task brief:** `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/task-1-brief.md`
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence)
**Owner's ruling in force:** Decision Gate **G1** — port spec §7 is relaxed for this programme for the twelve named existing files below. **G2** (the storefront's `facet_sidebar` grant) and **G3** (the absent-template state) are later tasks and are untouched here.

This record is the port spec §9 escalation for Task 1's change: *"the commerce and account widgets are monolithic catalogue entries whose interior structure is hardcoded in the renderer, so the AST can place them but cannot describe their insides"*. It is written **before** any escalated file is edited, and it is committed in the same commit as the change it escalates. It is **append-only**: every section below is an append; nothing already written is rewritten.

**Base commit.** The base commit of this task is **`109e2d3d`** — the tip of `frame30`, of `origin/frame30` and of `origin/main`. At the moment of recording the working tree carries only the three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/`; none of them is staged or committed by this task. The plan document itself is untracked at the base commit and is committed by no task in this programme.

---

## (a) The finding

### (a.1) What the change is

**One generic ordered-parts contract.** A new module `src/lib/widget-parts.ts` declares the **closed** part vocabulary per widget type, parses the platform's existing comma-separated-list convention into an ordered list of part keys, and resolves the effective order (the author's list when it is valid, the widget's **default** order otherwise). Six catalogue rows grow a `parts` field; three of them also grow a `layout` field (`row` | `card`). The renderers in `src/components/builder/cart.tsx` and `src/components/builder/account.tsx` render their parts **in the order `partOrder` returns**, and a part the author dropped does not render.

**Four new route-owned account panels.** A new module `src/components/store/AccountDashboardContext.tsx` owns the account surface's state; a new module `src/components/store/account-widgets.tsx` holds the four panel renderers (`account_nav`, `account_overview`, `account_orders`, `account_details`), each reading the provider and **nothing else**; four new catalogue rows carry `templates: ["account"]` and `heading: false`; and `src/components/store/AccountDashboard.tsx` becomes the provider's **default composition** — the same four panels in today's order.

### (a.2) The measured blast radius of the catalogue growth

The plan's step 1.4 grows the `SectionType` union by four members and adds four rows to the catalogue. That growth is **not** confined to `src/lib/builder-ast.ts`: the platform carries **six** totality contracts that a new member and a new row reach, and every one of them was measured, not assumed.

| # | the contract | where | what it forces |
| --- | --- | --- | --- |
| 1 | `WIDGET_HELP: Record<SectionType, BiText>` — compile-total | `src/lib/widget-help.ts:18` | four bilingual help entries, or `tsgo --noEmit` fails |
| 2 | `WIDGET_COMPONENTS: Record<SectionType, WidgetComponent>` — compile-total | `src/components/builder/widgets.tsx:1666` | four renderers (**granted**: the file is on G1's list) |
| 3 | the studio twin-parity contract — *"every BASE_CATALOG entry in `builder-ast` (SECTION_CATALOG) must resolve here in WIDGET_BY_KEY so it stays editable in the studio"* | `src/lib/studio/catalog.ts:1594-1602`, pinned by `src/lib/studio/catalog.test.ts:844-852` | four studio twins |
| 4 | the generated-defaults equality — *"every catalog-shared widget the studio did not intentionally diverge carries the SECTION_CATALOG defaults verbatim"* | `src/lib/studio/catalog-dedup.test.ts:101-106` | the twins' defaults must deep-equal the catalogue's |
| 5 | the catalogue-count pin — *"Catalog grows as widget packs land … this pins the count so silent additions/removals fail loudly"* | `src/lib/builder-ast-extension.test.ts:70`, `src/lib/widget-e2e-workflow.test.ts:280`, `src/lib/widget-metadata.test.ts:39` | the count moves 157 → 161 |
| 6 | the shared-surface pin — *"covers the full shared surface (155 keys)"* | `src/lib/studio/catalog-dedup.test.ts:93-95` | the count moves 155 → 159 |

The plan's A9 anticipated that *"the `SectionType` union grows, which is a **compile-time** change only"* — **reality differs**: the union's growth is compile-time **and** catalogue-time, and the catalogue's growth is pinned by four existing suites and one studio catalogue. The tree itself already says so, in the extension node's own comment (`src/lib/builder-ast.ts:6794-6804`): *"The core `SectionType` union stays closed (total maps such as `WIDGET_HELP` and the `SECTION_CATALOG.length` / studio-twin-parity pins forbid a new member)"* — the extension exists **because** of exactly these six contracts.

**The choice.** The extension precedent (a runtime type registered in the `CATALOG` map only, never in `SECTION_CATALOG`) would have avoided contracts 3-6 entirely — but it would also have kept the four new panels out of `WIDGET_REGISTRY` (derived from `SECTION_CATALOG`), out of the studio catalogue and out of the **theme-package manifest gate** (`WIDGET_SET = new Set(WIDGET_TYPES)`, `src/lib/theme-package.ts:187`; a package that declares `supportedWidgets: ["account_nav"]` would be rejected with `supportedWidgets`). The plan's A9 states the intent plainly: *"the manifest gate already accepts any catalogue entry"*. The four panels are therefore **first-class catalogue rows**, and contracts 1-6 are honoured.

### (a.3) The files this task touches

**NEW files — §7-allowed, no relaxation needed** (*"a NEW file needs no relaxation"*, `phase3-archive-key-escalation.md:33`):

| file | what it is |
| --- | --- |
| `src/lib/widget-parts.ts` | the ONE generic parts contract: the closed vocabulary, the parser, the effective-order resolver |
| `src/lib/widget-parts.test.ts` | its contract suite (the closed vocabulary, the round trip, the default-order fallback, the byte-identical backward compatibility) |
| `src/components/store/AccountDashboardContext.tsx` | the provider that owns the account's state |
| `src/components/store/account-widgets.tsx` | the four panel renderers |
| `src/components/store/account-widgets.test.tsx` | the panel suite (each panel renders from the provider; no provider renders nothing; no panel fetches) |

**EXISTING files — §7-prohibited, relaxed:**

| file | on G1's list? | the edit |
| --- | --- | --- |
| `src/lib/builder-ast.ts` | **yes** | the `SectionType` union (+4 members), the four new catalogue rows, the `parts` / `layout` fields on the six existing rows |
| `src/components/builder/widgets.tsx` | **yes** | the closed `WIDGET_COMPONENTS` map (the four new renderers) |
| `src/components/builder/cart.tsx` | **yes** | the part order in `CartLines`, `CartSummary`, `CheckoutSteps` and `PaymentMethods` |
| `src/components/builder/account.tsx` | **yes** | the part order in `OrdersList` and `ProfileCard` |
| `src/components/store/AccountDashboard.tsx` | **yes** | the dashboard becomes the provider's default composition |
| `src/lib/widget-help.ts` | **no — required by contract 1** | four bilingual help entries for the new types |
| `src/lib/studio/catalog.ts` | **no — required by contract 3** | four studio twins |
| `src/lib/builder-ast-extension.test.ts` | **no — required by contract 5** | the catalogue-count pin |
| `src/lib/widget-e2e-workflow.test.ts` | **no — required by contract 5** | the catalogue-count pin |
| `src/lib/widget-metadata.test.ts` | **no — required by contract 5** | the catalogue-count pin |
| `src/lib/studio/catalog-dedup.test.ts` | **no — required by contract 6** | the shared-surface pin |

**The six files outside G1's list are escalated here as an ADDITION to the owner's ruling, and they need the owner's ratification.** They are forced by the platform's own totality contracts (a) and each one is mechanical: four help strings, four studio twins, four count pins. None of them weakens a test — each count pin keeps its property (*"no silent addition or removal"*) at the new size and, where the file allows it, **gains** an assertion (see §(c)).

**The seven G1 files this task does NOT touch** (`src/components/store/ThemeChrome.tsx`, `src/routes/store.$slug.account.tsx`, `src/routes/store.$slug.search.tsx`, `src/routes/store.$slug.checkout.tsx`, `src/routes/_authenticated/dashboard/builder.tsx`, `src/lib/preview-parity.contract.test.ts`, `src/components/store/songoskriti-preview-compositions.test.tsx`) belong to Tasks 2 and 3 and are untouched by Task 1.

### (a.4) The compatibility rule this task must not break

> *A change is compatible when a stored AST written before it renders byte-identically after it.* (plan A9)

The parts prop is **optional** and its **default is today's order**, so an AST written before the prop existed renders exactly as it did. The proof is measured, not claimed: the markup of the six parts-aware widgets and of the account dashboard was captured **before** the first edit and captured again **after** the last, and the two captures are compared byte for byte (§(d)).

---

## (b) The NEW files — no diff (a NEW file needs no relaxation)

Listed in (a.3) above. They are additions to the tree, not edits to §7-prohibited files.

---

## (c) The exact old → new diffs

Each §(c) block is appended **before** the file it names is edited. The applied diffs are re-stated in §(d) as committed.

### (c.1) `src/lib/builder-ast.ts` — the union, the four rows, the `parts` / `layout` fields

*(appended below, before the edit)*

---

**The edit.** Four `SectionType` members, four catalogue rows, and the `parts` / `layout` fields on six existing rows. The `parts` field is the platform's **existing** comma-separated-list convention (`text` — the same field kind `category_header.subnav` and `payment_icons.marks` use), so **no new inspector field kind** and **no change** to `src/components/builder/SchemaControls.tsx`. The `layout` field is a `select` with exactly two options (`row`, `card`).

**The defaults are today's order.** Each row's `parts` default is the widget's current part order, byte for byte, so a stored AST written before this change (which carries no `parts` key) resolves to that default through `parseSection`'s `entry.defaults[field.key]` fallback and renders exactly as it did.

```diff
--- a/src/lib/builder-ast.ts
+++ b/src/lib/builder-ast.ts
@@ the SectionType union, after "| \"profile_card\""
+  // Frame30 — the account's placeable panels. The account's contents become
+  // the theme's to place: four route-owned panels the theme may drop into its
+  // own body. Their renderers live in
+  // `src/components/store/account-widgets.tsx` and read the account provider
+  // and nothing else.
+  | "account_nav"
+  | "account_overview"
+  | "account_orders"
+  | "account_details"

@@ the field helpers, after `const menu = …`
+const select = (
+  key: string,
+  label: string,
+  options: { value: string; label: string }[],
+): Field => ({ key, label, kind: "select", panel: "layout", options });

@@ the `cart_lines` row (:2923)
     defaults: {
       heading: "Your items",
       removeLabel: "Remove",
       emptyText: "Your cart is empty.",
+      parts: "title,variant,unitPrice,quantity,lineTotal,remove",
+      layout: "row",
     },
     fields: [
       text("heading", "Heading"),
       text("removeLabel", "Remove label", 40),
       text("emptyText", "Empty text", 120),
+      text("parts", "Part order (comma separated)", 200),
+      select("layout", "Row layout", [
+        { value: "row", label: "Row" },
+        { value: "card", label: "Card" },
+      ]),
     ],

@@ the `cart_summary` row (:1641)
       showCoupon: true,
       showCta: true,
       showFreeShipping: true,
+      parts: "subtotal,discount,shipping,cod,vat,total",
     },
@@ the `cart_summary` fields
       bool("showFreeShipping", "Show free shipping progress"),
+      text("parts", "Part order (comma separated)", 200),
     ],

@@ the `payment_methods` row (:2996)
     defaults: {
       heading: "Payment method",
       note: "",
       emptyText: "No payment method is available right now.",
+      parts: "legend,groups,options,note",
+      layout: "row",
     },
     fields: [
       text("heading", "Heading"),
       area("note", "Note", 200),
       text("emptyText", "Empty text", 120),
+      text("parts", "Part order (comma separated)", 200),
+      select("layout", "Row layout", [
+        { value: "row", label: "Row" },
+        { value: "card", label: "Card" },
+      ]),
     ],

@@ the `checkout_steps` row (:2972)
       step4: "Confirmation",
       activeStep: 1,
+      parts: "labels,active,links",
     },
@@ the `checkout_steps` fields
       num("activeStep", "Active step (1-4)"),
+      text("parts", "Part order (comma separated)", 200),
     ],

@@ the `orders_list` row (:5031)
-    defaults: { heading: "Your orders", emptyText: "No orders yet." },
+    defaults: {
+      heading: "Your orders",
+      emptyText: "No orders yet.",
+      parts: "number,date,status,total",
+      layout: "row",
+    },
     fields: [
       { key: "heading", label: "Heading", kind: "bitext", panel: "content" },
       {
         key: "emptyText",
         label: "Empty text",
         kind: "bitext",
         panel: "content",
       },
+      text("parts", "Part order (comma separated)", 200),
+      select("layout", "Row layout", [
+        { value: "row", label: "Row" },
+        { value: "card", label: "Card" },
+      ]),
     ],

@@ the `profile_card` row (:5049)
-    defaults: { heading: "Your profile" },
+    defaults: {
+      heading: "Your profile",
+      parts: "avatar,name,email,phone",
+    },
     fields: [
       { key: "heading", label: "Heading", kind: "bitext", panel: "content" },
+      text("parts", "Part order (comma separated)", 200),
     ],

@@ after the `profile_card` row — the FOUR NEW rows
+  {
+    // Frame30 — the account's placeable panels. Route-owned data (the
+    // session-scoped `customer_overview` payload) that a theme may place in
+    // its own body. The renderers live in
+    // `src/components/store/account-widgets.tsx`; they read the account
+    // provider and nothing else, so a panel can never reach another
+    // shopper's rows.
+    type: "account_nav",
+    label: "Account navigation",
+    group: "context",
+    slots: ["main"],
+    heading: false,
+    templates: ["account"],
+    defaults: {},
+    fields: [],
+  },
+  {
+    type: "account_overview",
+    label: "Account overview",
+    group: "context",
+    slots: ["main"],
+    heading: false,
+    templates: ["account"],
+    defaults: {},
+    fields: [],
+  },
+  {
+    type: "account_orders",
+    label: "Account orders",
+    group: "context",
+    slots: ["main"],
+    heading: false,
+    templates: ["account"],
+    defaults: {},
+    fields: [],
+  },
+  {
+    type: "account_details",
+    label: "Account details",
+    group: "context",
+    slots: ["main"],
+    heading: false,
+    templates: ["account"],
+    defaults: {},
+    fields: [],
+  },
```

**Why `templates: ["account"]`.** A row with a `templates:` allowlist is a **context widget**: `SectionRenderer` renders the host's granted slot for it and renders nothing at all when the host grants none (`src/components/builder/SectionRenderer.tsx:814-834`). The account panels are exactly that — the route owns their data, the theme owns where they sit. `heading: false` keeps them from claiming the page's single primary heading, which the dashboard's own `<h1>` already owns.

---

### (c.2) The four renderer files — the part order and the account's composition

**`src/components/builder/cart.tsx`** — the part order in `CartLines`, `CartSummary`, `CheckoutSteps` and `PaymentMethods`. **The values are unchanged**: they still come from the server (`ctx.money` over the quote's minor units). **The default order is today's order**, so a theme with no `parts` prop renders byte-identically — measured in §(d).

**`src/components/builder/account.tsx`** — the part order in `OrdersList` and `ProfileCard`, the same rule.

**`src/components/builder/widgets.tsx`** — the closed `WIDGET_COMPONENTS` map gains the four account panels. The compiler named this site before the edit: *"Type 'Record<SectionType, WidgetComponent>' is missing the following properties from type 'Record<SectionType, WidgetComponent>': account_nav, account_overview, account_orders, account_details"* — the blast-radius work the plan predicted, done by the compiler.

**`src/components/store/AccountDashboard.tsx`** — the dashboard becomes the provider's **default composition**: the same four panels, in today's order, and the provider's state wins over the props when the route mounts it. The six states, the ARIA tabs pattern and the rendered markup are unchanged — measured in §(d).

diff --git a/src/components/builder/account.tsx b/src/components/builder/account.tsx
index 9bd2d74a..b00bdbab 100644
--- a/src/components/builder/account.tsx
+++ b/src/components/builder/account.tsx
@@ -15,12 +15,24 @@
  * Server-safe: no `window`, no `localStorage`, no subscriptions at render, so
  * these render identically in SSR, the studio canvas and static markup.
  */
+import type { ReactNode } from "react";
+import type { WidgetRow } from "@/lib/widget-data";
 import type { WidgetComponent, WidgetCtx } from "./widgets";
+import { partOrder } from "@/lib/widget-parts";
 
 function t(locale: string, en: string, bn: string) {
   return locale === "bn" ? bn : en;
 }
 
+/**
+ * The widget's row layout. `row` is today's layout — the default — and `card`
+ * is the same parts stacked inside one bordered card. The choice is a class,
+ * not a second renderer, so the parts stay the parts.
+ */
+function layoutOf(ctx: WidgetCtx): "row" | "card" {
+  return ctx.str("layout") === "card" ? "card" : "row";
+}
+
 /** Signed-out state: prompt + link to the platform sign-in page. */
 function SignInPrompt({ ctx, body }: { ctx: WidgetCtx; body: string }) {
   const { str, Heading, locale } = ctx;
@@ -62,13 +74,114 @@ function formatOrderDate(date: string | undefined, locale: string): string {
   return new Date(time).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB");
 }
 
+/**
+ * The order row's number and date share ONE block today (the order number
+ * with its date under it), so the group stays together when a theme reorders
+ * the row — and the group's position is the position of its FIRST part.
+ */
+const ORDER_TEXT_PARTS = ["number", "date"] as const;
+
+/**
+ * One order row, drawn as its parts.
+ *
+ * **The order is the author's.** `partOrder` returns the widget's effective
+ * part order — the theme's list when it is valid, today's order otherwise —
+ * and a part the theme dropped is simply not drawn. **The values are the
+ * server's**: the order number, its date, its status and its total all come
+ * from the shopper's own session-scoped payload.
+ */
+function OrderRow({
+  ctx,
+  row,
+}: {
+  ctx: WidgetCtx;
+  row: WidgetRow;
+}) {
+  const { str, locale, money } = ctx;
+  const order = partOrder(str("parts"), "orders_list");
+  const textParts = order.filter((part) =>
+    (ORDER_TEXT_PARTS as readonly string[]).includes(part),
+  );
+  const children: ReactNode[] = [];
+  let textGroupDrawn = false;
+  order.forEach((part) => {
+    if ((ORDER_TEXT_PARTS as readonly string[]).includes(part)) {
+      if (textGroupDrawn) return;
+      textGroupDrawn = true;
+      children.push(
+        <span key="order-text" className="min-w-0">
+          {textParts.map((text) => {
+            if (text === "number") {
+              return (
+                <span
+                  key="number"
+                  className="block text-[14px] font-bold text-foreground tabular-nums"
+                >
+                  {row.title}
+                </span>
+              );
+            }
+            const day = formatOrderDate(row.date, locale);
+            if (!day) return null;
+            return (
+              <time
+                key="date"
+                dateTime={row.date}
+                className="mt-1 block text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums"
+              >
+                {day}
+              </time>
+            );
+          })}
+        </span>,
+      );
+      return;
+    }
+    if (part === "status") {
+      if (!row.subtitle) return;
+      children.push(
+        <span
+          key="status"
+          className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full"
+        >
+          {row.subtitle}
+        </span>,
+      );
+      return;
+    }
+    if (part === "total") {
+      if (typeof row.priceMinor !== "number") return;
+      children.push(
+        <span
+          key="total"
+          className="text-[14px] font-semibold text-foreground tracking-wide tabular-nums"
+        >
+          {money(row.priceMinor, row.currency)}
+        </span>,
+      );
+    }
+  });
... (the patch continues; the full diff is committed with this record)

```diff
diff --git a/src/components/builder/account.tsx b/src/components/builder/account.tsx
index 9bd2d74a..b00bdbab 100644
--- a/src/components/builder/account.tsx
+++ b/src/components/builder/account.tsx
@@ -15,12 +15,24 @@
  * Server-safe: no `window`, no `localStorage`, no subscriptions at render, so
  * these render identically in SSR, the studio canvas and static markup.
  */
+import type { ReactNode } from "react";
+import type { WidgetRow } from "@/lib/widget-data";
 import type { WidgetComponent, WidgetCtx } from "./widgets";
+import { partOrder } from "@/lib/widget-parts";
 
 function t(locale: string, en: string, bn: string) {
   return locale === "bn" ? bn : en;
 }
 
+/**
+ * The widget's row layout. `row` is today's layout — the default — and `card`
+ * is the same parts stacked inside one bordered card. The choice is a class,
+ * not a second renderer, so the parts stay the parts.
+ */
+function layoutOf(ctx: WidgetCtx): "row" | "card" {
+  return ctx.str("layout") === "card" ? "card" : "row";
+}
+
 /** Signed-out state: prompt + link to the platform sign-in page. */
 function SignInPrompt({ ctx, body }: { ctx: WidgetCtx; body: string }) {
   const { str, Heading, locale } = ctx;
@@ -62,13 +74,114 @@ function formatOrderDate(date: string | undefined, locale: string): string {
   return new Date(time).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB");
 }
 
+/**
+ * The order row's number and date share ONE block today (the order number
+ * with its date under it), so the group stays together when a theme reorders
+ * the row — and the group's position is the position of its FIRST part.
+ */
+const ORDER_TEXT_PARTS = ["number", "date"] as const;
+
+/**
+ * One order row, drawn as its parts.
+ *
+ * **The order is the author's.** `partOrder` returns the widget's effective
+ * part order — the theme's list when it is valid, today's order otherwise —
+ * and a part the theme dropped is simply not drawn. **The values are the
+ * server's**: the order number, its date, its status and its total all come
+ * from the shopper's own session-scoped payload.
+ */
+function OrderRow({
+  ctx,
+  row,
+}: {
+  ctx: WidgetCtx;
+  row: WidgetRow;
+}) {
+  const { str, locale, money } = ctx;
+  const order = partOrder(str("parts"), "orders_list");
+  const textParts = order.filter((part) =>
+    (ORDER_TEXT_PARTS as readonly string[]).includes(part),
+  );
+  const children: ReactNode[] = [];
+  let textGroupDrawn = false;
+  order.forEach((part) => {
+    if ((ORDER_TEXT_PARTS as readonly string[]).includes(part)) {
+      if (textGroupDrawn) return;
+      textGroupDrawn = true;
+      children.push(
+        <span key="order-text" className="min-w-0">
+          {textParts.map((text) => {
+            if (text === "number") {
+              return (
+                <span
+                  key="number"
+                  className="block text-[14px] font-bold text-foreground tabular-nums"
+                >
+                  {row.title}
+                </span>
+              );
+            }
+            const day = formatOrderDate(row.date, locale);
+            if (!day) return null;
+            return (
+              <time
+                key="date"
+                dateTime={row.date}
+                className="mt-1 block text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums"
+              >
+                {day}
+              </time>
+            );
+          })}
+        </span>,
+      );
+      return;
+    }
+    if (part === "status") {
+      if (!row.subtitle) return;
+      children.push(
+        <span
+          key="status"
+          className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full"
+        >
+          {row.subtitle}
+        </span>,
+      );
+      return;
+    }
+    if (part === "total") {
+      if (typeof row.priceMinor !== "number") return;
+      children.push(
+        <span
+          key="total"
+          className="text-[14px] font-semibold text-foreground tracking-wide tabular-nums"
+        >
+          {money(row.priceMinor, row.currency)}
+        </span>,
+      );
+    }
+  });
+  const layout = layoutOf(ctx);
+  return (
+    <li
+      className={
+        layout === "card"
+          ? "flex flex-col items-start gap-3 border border-border/60 p-4"
+          : "flex flex-wrap items-center justify-between gap-4 py-6"
+      }
+    >
+      {children}
+    </li>
+  );
+}
+
 /**
  * The shopper's order history. Dataless (signed-out) renders the sign-in
  * prompt; an empty row set (signed in, nothing bought) renders the empty
  * state; otherwise one row per order with the server-priced total.
  */
 export const OrdersList: WidgetComponent = (ctx) => {
-  const { str, Heading, locale, data, money, int } = ctx;
+  const { str, Heading, locale, data, int } = ctx;
   if (data?.pending) return <ListSkeleton />;
   const rows = data?.rows?.slice(0, int("limit", 5, 1, 20));
   if (rows === undefined) {
@@ -100,43 +213,27 @@ export const OrdersList: WidgetComponent = (ctx) => {
       </Heading>
       <ul className="divide-y divide-border/60">
         {rows.map((row) => (
-          <li
-            key={row.id}
-            className="flex flex-wrap items-center justify-between gap-4 py-6"
-          >
-            <span className="min-w-0">
-              <span className="block text-[14px] font-bold text-foreground tabular-nums">
-                {row.title}
-              </span>
-              {formatOrderDate(row.date, locale) && (
-                <time
-                  dateTime={row.date}
-                  className="mt-1 block text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums"
-                >
-                  {formatOrderDate(row.date, locale)}
-                </time>
-              )}
-            </span>
-            {row.subtitle && (
-              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
-                {row.subtitle}
-              </span>
-            )}
-            {typeof row.priceMinor === "number" && (
-              <span className="text-[14px] font-semibold text-foreground tracking-wide tabular-nums">
-                {money(row.priceMinor, row.currency)}
-              </span>
-            )}
-          </li>
+          <OrderRow key={row.id} ctx={ctx} row={row} />
         ))}
       </ul>
     </section>
   );
 };
 
+/**
+ * The profile card's text parts — the name, the email and the phone. They
+ * share ONE block today (the name with the email and the phone under it), so
+ * the group stays together when a theme reorders the card.
+ */
+const PROFILE_TEXT_PARTS = ["name", "email", "phone"] as const;
+
 /**
  * The shopper's details card. Dataless renders the sign-in prompt (never an
  * empty card, never a crash); otherwise name, email and phone from the row.
+ *
+ * **The order is the author's** — the card's parts are drawn in the order
+ * `partOrder` returns, and a part the theme dropped is not drawn. **The
+ * values are the server's**: they come from the shopper's own row.
  */
 export const ProfileCard: WidgetComponent = (ctx) => {
   const { str, Heading, data } = ctx;
@@ -152,34 +249,72 @@ export const ProfileCard: WidgetComponent = (ctx) => {
   }
   const heading =
     str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল");
-  // (Repair 2026-09-24: a parallel edit dropped the `return (` leaving a
-  // dangling JSX block that broke the production build. Restored verbatim —
-  // ProfileCard with row data returns the details section.)
-  return (
-    <section className="border border-border/60 p-6 bg-transparent">
-      <div className="flex items-start gap-4">
+  const order = partOrder(str("parts"), "profile_card");
+  const textParts = order.filter((part) =>
+    (PROFILE_TEXT_PARTS as readonly string[]).includes(part),
+  );
+  const children: ReactNode[] = [];
+  let textGroupDrawn = false;
+  order.forEach((part) => {
+    if ((PROFILE_TEXT_PARTS as readonly string[]).includes(part)) {
+      if (textGroupDrawn) return;
+      textGroupDrawn = true;
+      children.push(
+        <div key="profile-text" className="min-w-0 pt-1">
+          {textParts.map((text) => {
+            if (text === "name") {
+              return (
+                <Heading
+                  key="name"
+                  className="truncate text-[13.5px] font-bold text-foreground"
+                >
+                  {row.title || heading}
+                </Heading>
+              );
+            }
+            if (text === "email") {
+              if (!row.subtitle) return null;
+              return (
+                <p
+                  key="email"
+                  className="mt-1 truncate text-[13px] text-muted-foreground"
+                >
+                  {row.subtitle}
+                </p>
+              );
+            }
+            if (!row.body) return null;
+            return (
+              <p
+                key="phone"
+                className="mt-2 text-[13px] font-medium tracking-wide tabular-nums text-foreground/80"
+              >
+                {row.body}
+              </p>
+            );
+          })}
+        </div>,
+      );
+      return;
+    }
+    if (part === "avatar") {
+      children.push(
         <span
+          key="avatar"
           aria-hidden="true"
           className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[16px] font-bold text-foreground"
         >
           {(row.title || "?").trim().charAt(0).toUpperCase()}
-        </span>
-        <div className="min-w-0 pt-1">
-          <Heading className="truncate text-[13.5px] font-bold text-foreground">
-            {row.title || heading}
-          </Heading>
-          {row.subtitle && (
-            <p className="mt-1 truncate text-[13px] text-muted-foreground">
-              {row.subtitle}
-            </p>
-          )}
-          {row.body && (
-            <p className="mt-2 text-[13px] font-medium tracking-wide tabular-nums text-foreground/80">
-              {row.body}
-            </p>
-          )}
-        </div>
-      </div>
+        </span>,
+      );
+    }
+  });
+  // (Repair 2026-09-24: a parallel edit dropped the `return (` leaving a
+  // dangling JSX block that broke the production build. Restored verbatim —
+  // ProfileCard with row data returns the details section.)
+  return (
+    <section className="border border-border/60 p-6 bg-transparent">
+      <div className="flex items-start gap-4">{children}</div>
     </section>
   );
 };
diff --git a/src/components/builder/cart.tsx b/src/components/builder/cart.tsx
index d9e8d4bc..4e8cbc55 100644
--- a/src/components/builder/cart.tsx
+++ b/src/components/builder/cart.tsx
@@ -9,7 +9,7 @@
  *
  * No theme module is imported: colour, radius and shadow come from tokens.
  */
-import { useCallback, useState } from "react";
+import { useCallback, useState, type ReactNode } from "react";
 import { useRouterState } from "@tanstack/react-router";
 import { isCustomHostPath } from "@/lib/storefront-url";
 import type { SectionType } from "@/lib/builder-ast";
@@ -20,6 +20,7 @@ import {
   type MethodLayer,
   type PaymentMethodKey,
 } from "@/lib/payment-rails";
+import { partOrder } from "@/lib/widget-parts";
 import type { WidgetComponent, WidgetCtx } from "./widgets";
 import {
   useCartContext,
@@ -34,6 +35,15 @@ function t(locale: string, en: string, bn: string) {
   return locale === "bn" ? bn : en;
 }
 
+/**
+ * The widget's row layout. `row` is today's layout — the default — and `card`
+ * is the same parts stacked inside one bordered card. The choice is a class,
+ * not a second renderer, so the parts stay the parts.
+ */
+function layoutOf(ctx: WidgetCtx): "row" | "card" {
+  return ctx.str("layout") === "card" ? "card" : "row";
+}
+
 function LineSkeleton() {
   return (
     <div className="space-y-3" aria-hidden="true">
@@ -65,6 +75,149 @@ function SummarySkeleton() {
 
 /* ------------------------------------------------------------- cart_lines */
 
+/**
+ * The line row's text parts. They share ONE flex child today (the product's
+ * name, its variant and its unit price sit in the same block), so the group
+ * stays together when a theme reorders the row — and the group's position in
+ * the row is the position of its FIRST part.
+ */
+const LINE_TEXT_PARTS = ["title", "variant", "unitPrice"] as const;
+
+/**
+ * One cart line, drawn as its parts.
+ *
+ * **The order is the author's.** `partOrder` returns the widget's effective
+ * part order — the theme's list when it is valid, today's order otherwise — and
+ * a part the theme dropped is simply not drawn. **The values are the
+ * server's**: the title, the variant, the unit price, the line total and the
+ * quantity all come from the quote.
+ */
+function LineRow({
+  ctx,
+  line,
+  compact = false,
+}: {
+  ctx: WidgetCtx;
+  line: {
+    variantId: string;
+    productTitle: string;
+    variantName: string;
+    unitPriceMinor: number;
+    quantity: number;
+    lineTotalMinor: number;
+    stock: number;
+  };
+  compact?: boolean;
+}) {
+  const { str, locale, money } = ctx;
+  const cart = useCartContext();
+  const order = partOrder(str("parts"), "cart_lines");
+  const textParts = order.filter((part) =>
+    (LINE_TEXT_PARTS as readonly string[]).includes(part),
+  );
+  const children: ReactNode[] = [];
+  let textGroupDrawn = false;
+  order.forEach((part) => {
+    if ((LINE_TEXT_PARTS as readonly string[]).includes(part)) {
+      // The text parts share one flex child; it is drawn once, at the
+      // position of the first of them.
+      if (textGroupDrawn) return;
+      textGroupDrawn = true;
+      children.push(
+        <div key="line-text" className="min-w-0 flex-1 basis-40">
+          {textParts.map((text) => {
+            if (text === "title") {
+              return (
+                <p
+                  key="title"
+                  className="break-words text-[13.5px] font-medium leading-relaxed"
+                >
+                  {line.productTitle}
+                </p>
+              );
+            }
+            if (text === "variant") {
+              if (!line.variantName) return null;
+              return (
+                <p
+                  key="variant"
+                  className="mt-0.5 text-[12px] font-medium tracking-wide text-muted-foreground"
+                >
+                  {line.variantName}
+                </p>
+              );
+            }
+            return (
+              <p
+                key="unitPrice"
+                className="mt-2 text-[13.5px] font-semibold tracking-wide tabular-nums text-foreground"
+              >
+                {money(line.unitPriceMinor)}
+              </p>
+            );
+          })}
+        </div>,
+      );
+      return;
+    }
+    if (part === "quantity") {
+      children.push(
+        <QtyStepper
+          key="quantity"
+          value={line.quantity}
+          max={line.stock}
+          label={t(
+            locale,
+            `Quantity for ${line.productTitle}`,
+            `${line.productTitle} এর পরিমাণ`,
+          )}
+          locale={locale}
+          disabled={!cart.live}
+          onChange={(next) => cart.setQuantity(line.variantId, next)}
+        />,
+      );
+      return;
+    }
+    if (part === "lineTotal") {
+      children.push(
+        <p
+          key="lineTotal"
+          className="w-24 shrink-0 text-right text-[13.5px] font-semibold tracking-wide tabular-nums"
+        >
+          {money(line.lineTotalMinor)}
+        </p>,
+      );
+      return;
+    }
+    if (part === "remove" && !compact) {
+      children.push(
+        <button
+          key="remove"
+          type="button"
+          onClick={() => cart.remove(line.variantId)}
+          disabled={!cart.live}
+          className="inline-flex min-h-11 items-center px-4 py-2 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors"
+        >
+          {str("removeLabel") || t(locale, "Remove", "সরান")}
+          <span className="sr-only"> {line.productTitle}</span>
+        </button>,
+      );
+    }
+  });
+  const layout = layoutOf(ctx);
+  return (
+    <li
+      className={
+        layout === "card"
+          ? "flex flex-col items-stretch gap-3 border border-border/60 p-4"
+          : "flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
+      }
+    >
+      {children}
+    </li>
+  );
+}
+
 function LineList({
   ctx,
   compact = false,
@@ -72,7 +225,7 @@ function LineList({
   ctx: WidgetCtx;
   compact?: boolean;
 }) {
-  const { str, locale, money, storeSlug } = ctx;
+  const { str, locale, storeSlug } = ctx;
   const cart = useCartContext();
   const { location } = useRouterState();
   const base = storeBase(storeSlug, location.pathname);
@@ -151,50 +304,7 @@ function LineList({
         aria-busy={cart.pending || undefined}
       >
         {rows.map((line) => (
-          <li
-            key={line.variantId}
-            className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
-          >
-            <div className="min-w-0 flex-1 basis-40">
-              <p className="break-words text-[13.5px] font-medium leading-relaxed">
-                {line.productTitle}
-              </p>
-              {line.variantName && (
-                <p className="mt-0.5 text-[12px] font-medium tracking-wide text-muted-foreground">
-                  {line.variantName}
-                </p>
-              )}
-              <p className="mt-2 text-[13.5px] font-semibold tracking-wide tabular-nums text-foreground">
-                {money(line.unitPriceMinor)}
-              </p>
-            </div>
-            <QtyStepper
-              value={line.quantity}
-              max={line.stock}
-              label={t(
-                locale,
-                `Quantity for ${line.productTitle}`,
-                `${line.productTitle} এর পরিমাণ`,
-              )}
-              locale={locale}
-              disabled={!cart.live}
-              onChange={(next) => cart.setQuantity(line.variantId, next)}
-            />
-            <p className="w-24 shrink-0 text-right text-[13.5px] font-semibold tracking-wide tabular-nums">
-              {money(line.lineTotalMinor)}
-            </p>
-            {!compact && (
-              <button
-                type="button"
-                onClick={() => cart.remove(line.variantId)}
-                disabled={!cart.live}
-                className="inline-flex min-h-11 items-center px-4 py-2 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors"
-              >
-                {str("removeLabel") || t(locale, "Remove", "সরান")}
-                <span className="sr-only"> {line.productTitle}</span>
-              </button>
-            )}
-          </li>
+          <LineRow key={line.variantId} ctx={ctx} line={line} compact={compact} />
         ))}
       </ul>
     </>
@@ -339,42 +449,68 @@ function SummaryBody({ ctx }: { ctx: WidgetCtx }) {
         <FreeShippingBar ctx={ctx} totals={totals} />
       )}
       <dl className="m-0 space-y-2">
-        <SummaryRow
-          label={str("subtotalLabel") || t(locale, "Subtotal", "সাবটোটাল")}
-          value={money(totals.subtotalMinor)}
-        />
-        {totals.discountMinor > 0 && (
-          <SummaryRow
-            label={str("discountLabel") || t(locale, "Discount", "ছাড়")}
-            value={money(totals.discountMinor)}
-          />
-        )}
-        <SummaryRow
-          label={str("shippingLabel") || t(locale, "Delivery", "ডেলিভারি")}
-          value={money(totals.shippingMinor)}
-        />
-        {totals.codSurchargeMinor > 0 && (
-          <SummaryRow
-            label={
-              str("codLabel") ||
-              t(locale, "Cash on delivery fee", "ক্যাশ অন ডেলিভারি ফি")
-            }
-            value={money(totals.codSurchargeMinor)}
-          />
-        )}
-        {totals.vatMinor > 0 && (
-          <SummaryRow
-            label={str("vatLabel") || t(locale, "VAT", "ভ্যাট")}
-            value={money(totals.vatMinor)}
-          />
-        )}
-        <div className="border-t border-border/60 pt-4 mt-2">
-          <SummaryRow
-            label={str("totalLabel") || t(locale, "Total", "সর্বমোট")}
-            value={money(totals.totalMinor)}
-            strong
-          />
-        </div>
+        {partOrder(str("parts"), "cart_summary").map((part) => {
+          if (part === "subtotal") {
+            return (
+              <SummaryRow
+                key="subtotal"
+                label={str("subtotalLabel") || t(locale, "Subtotal", "সাবটোটাল")}
+                value={money(totals.subtotalMinor)}
+              />
+            );
+          }
+          if (part === "discount") {
+            if (totals.discountMinor <= 0) return null;
+            return (
+              <SummaryRow
+                key="discount"
+                label={str("discountLabel") || t(locale, "Discount", "ছাড়")}
+                value={money(totals.discountMinor)}
+              />
+            );
+          }
+          if (part === "shipping") {
+            return (
+              <SummaryRow
+                key="shipping"
+                label={str("shippingLabel") || t(locale, "Delivery", "ডেলিভারি")}
+                value={money(totals.shippingMinor)}
+              />
+            );
+          }
+          if (part === "cod") {
+            if (totals.codSurchargeMinor <= 0) return null;
+            return (
+              <SummaryRow
+                key="cod"
+                label={
+                  str("codLabel") ||
+                  t(locale, "Cash on delivery fee", "ক্যাশ অন ডেলিভারি ফি")
+                }
+                value={money(totals.codSurchargeMinor)}
+              />
+            );
+          }
+          if (part === "vat") {
+            if (totals.vatMinor <= 0) return null;
+            return (
+              <SummaryRow
+                key="vat"
+                label={str("vatLabel") || t(locale, "VAT", "ভ্যাট")}
+                value={money(totals.vatMinor)}
+              />
+            );
+          }
+          return (
+            <div key="total" className="border-t border-border/60 pt-4 mt-2">
+              <SummaryRow
+                label={str("totalLabel") || t(locale, "Total", "সর্বমোট")}
+                value={money(totals.totalMinor)}
+                strong
+              />
+            </div>
+          );
+        })}
       </dl>
       {/* Screen-reader announcement for the server total on every re-quote. */}
       <p className="sr-only" aria-live="polite" aria-atomic="true">
@@ -508,27 +644,41 @@ const CheckoutSteps: WidgetComponent = (ctx) => {
   const { str, int, locale, storeSlug } = ctx;
   const { location } = useRouterState();
   const base = storeBase(storeSlug, location.pathname);
+  /**
+   * The trail's parts. `labels` draws the step names, `links` draws the
+   * back-links to the completed steps, and `active` marks where the shopper
+   * is. A trail with no active step has no completed steps — and therefore
+   * no back-links either: the links belong to the steps that are done.
+   */
+  const order = partOrder(str("parts"), "checkout_steps");
+  const wantsLabels = order.includes("labels");
+  const wantsLinks = order.includes("links");
+  const wantsActive = order.includes("active");
   const steps: TrailStep[] = [
     {
       key: "cart",
-      label: str("step1") || t(locale, "Cart", "কার্ট"),
-      href: `${base}/cart`,
+      label: wantsLabels ? str("step1") || t(locale, "Cart", "কার্ট") : "",
+      href: wantsLinks ? `${base}/cart` : undefined,
     },
     {
       key: "details",
-      label: str("step2") || t(locale, "Details", "তথ্য"),
-      href: `${base}/checkout`,
+      label: wantsLabels ? str("step2") || t(locale, "Details", "তথ্য") : "",
+      href: wantsLinks ? `${base}/checkout` : undefined,
+    },
+    {
+      key: "payment",
+      label: wantsLabels ? str("step3") || t(locale, "Payment", "পেমেন্ট") : "",
     },
-    { key: "payment", label: str("step3") || t(locale, "Payment", "পেমেন্ট") },
     {
       key: "confirm",
-      label: str("step4") || t(locale, "Confirmation", "নিশ্চিতকরণ"),
+      label: wantsLabels
+        ? str("step4") || t(locale, "Confirmation", "নিশ্চিতকরণ")
+        : "",
     },
   ];
-  const active = Math.min(
-    steps.length - 1,
-    Math.max(0, int("activeStep", 1, 1, 4) - 1),
-  );
+  const active = wantsActive
+    ? Math.min(steps.length - 1, Math.max(0, int("activeStep", 1, 1, 4) - 1))
+    : -1;
   return (
     <nav
       aria-label={
@@ -571,6 +721,18 @@ const PaymentMethods: WidgetComponent = (ctx) => {
     ),
   );
   const lang = locale === "bn" ? "bn" : "en";
+  /**
+   * The rail's parts. `legend` is the fieldset's caption (it stays the
+   * fieldset's first child — an HTML requirement), `groups` are the rail
+   * groups, `options` are the rails themselves, and `note` is the note under
+   * them. A theme that drops `groups` flattens the rails; a theme that drops
+   * `options` keeps the group names alone.
+   */
+  const order = partOrder(str("parts"), "payment_methods");
+  const wants = (part: string): boolean => order.includes(part);
+  const layout = layoutOf(ctx);
+  const railsClass =
+    layout === "card" ? "grid gap-2 sm:grid-cols-2" : "space-y-2";
 
   if (cart.methods.length === 0) {
     return (
@@ -585,47 +747,70 @@ const PaymentMethods: WidgetComponent = (ctx) => {
     );
   }
 
+  const railOption = (key: PaymentMethodKey) => (
+    <label
+      key={key}
+      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-fq-md border border-border px-3 py-2 text-sm"
+    >
+      <input
+        type="radio"
+        name="fq-payment-method"
+        value={key}
+        checked={cart.method === key}
+        onChange={() => cart.setMethod(key)}
+        className="h-4 w-4"
+      />
+      <span className="min-w-0 break-words">{methodLabel(key, lang)}</span>
+    </label>
+  );
+
+  const groupBlocks = METHOD_GROUP_ORDER.map((group) => {
+    const keys = byLayer.get(group) ?? [];
+    if (keys.length === 0) return null;
+    return (
+      <div key={group} className="mt-3">
+        <p className="mb-1 text-xs fq-caps text-muted-foreground">
+          {GROUP_LABEL[group]![lang]}
+        </p>
+        {wants("options") ? (
+          <div className={railsClass}>{keys.map(railOption)}</div>
+        ) : null}
+      </div>
+    );
+  });
+
+  const flatRails = (
+    <div className={`mt-3 ${railsClass}`}>
+      {METHOD_GROUP_ORDER.flatMap((group) => byLayer.get(group) ?? []).map(
+        railOption,
+      )}
+    </div>
+  );
+
   return (
     <fieldset className="rounded-fq-lg border border-border bg-card p-4">
-      <legend className="px-1 text-sm font-semibold">
-        <Heading className="text-base font-semibold">
-          {str("heading") || t(locale, "Payment method", "পেমেন্ট পদ্ধতি")}
-        </Heading>
-      </legend>
-      {METHOD_GROUP_ORDER.map((group) => {
-        const keys = byLayer.get(group) ?? [];
-        if (keys.length === 0) return null;
-        return (
-          <div key={group} className="mt-3">
-            <p className="mb-1 text-xs fq-caps text-muted-foreground">
-              {GROUP_LABEL[group]![lang]}
-            </p>
-            <div className="space-y-2">
-              {keys.map((key) => (
-                <label
-                  key={key}
-                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-fq-md border border-border px-3 py-2 text-sm"
-                >
-                  <input
-                    type="radio"
-                    name="fq-payment-method"
-                    value={key}
-                    checked={cart.method === key}
-                    onChange={() => cart.setMethod(key)}
-                    className="h-4 w-4"
-                  />
-                  <span className="min-w-0 break-words">
-                    {methodLabel(key, lang)}
-                  </span>
-                </label>
-              ))}
-            </div>
-          </div>
-        );
-      })}
-      {str("note") && (
-        <p className="mt-3 text-xs text-muted-foreground">{str("note")}</p>
+      {wants("legend") && (
+        <legend className="px-1 text-sm font-semibold">
+          <Heading className="text-base font-semibold">
+            {str("heading") || t(locale, "Payment method", "পেমেন্ট পদ্ধতি")}
+          </Heading>
+        </legend>
       )}
+      {order
+        .filter((part) => part !== "legend")
+        .map((part) => {
+          if (part === "groups") return groupBlocks;
+          if (part === "options") return wants("groups") ? null : flatRails;
+          if (part === "note") {
+            if (!str("note")) return null;
+            return (
+              <p key="note" className="mt-3 text-xs text-muted-foreground">
+                {str("note")}
+              </p>
+            );
+          }
+          return null;
+        })}
     </fieldset>
   );
 };
diff --git a/src/components/builder/widgets.tsx b/src/components/builder/widgets.tsx
index 7b805e0f..3030d8c2 100644
--- a/src/components/builder/widgets.tsx
+++ b/src/components/builder/widgets.tsx
@@ -32,6 +32,12 @@ import { PDP_WIDGETS } from "./pdp";
 import { COLLECTION_WIDGETS } from "./collection";
 import { CART_WIDGETS } from "./cart";
 import { ACCOUNT_WIDGETS } from "./account";
+import {
+  AccountNav,
+  AccountOverview,
+  AccountOrders,
+  AccountDetails,
+} from "@/components/store/account-widgets";
 import { MERCH_WIDGETS, cardVariantOf } from "./merch";
 import { APPAREL_WIDGETS } from "./apparel";
 import { BEAUTY_WIDGETS } from "./beauty";
@@ -1666,4 +1672,13 @@ export const GENERIC_WIDGETS: Partial<Record<SectionType, WidgetComponent>> = {
 export const WIDGET_COMPONENTS: Record<SectionType, WidgetComponent> = {
   ...(GENERIC_WIDGETS as Record<SectionType, WidgetComponent>),
   ...SONGOSKRITI_WIDGETS,
+  // Frame30 — the account's placeable panels. Their renderers live in the
+  // storefront's account module because the panels ARE the account surface:
+  // they read the account provider (the route's own session-scoped state)
+  // and nothing else. With no provider they render nothing — they fail
+  // closed, they never fetch.
+  account_nav: AccountNav,
+  account_overview: AccountOverview,
+  account_orders: AccountOrders,
+  account_details: AccountDetails,
 };
diff --git a/src/components/store/AccountDashboard.tsx b/src/components/store/AccountDashboard.tsx
index c3320d4f..7867f1f4 100644
--- a/src/components/store/AccountDashboard.tsx
+++ b/src/components/store/AccountDashboard.tsx
@@ -20,32 +20,37 @@
  * serves no per-tab routes — the tabs are search values on ONE route — so
  * there is no such path to link to here.
  *
+ * **The provider contract.** When the route mounts the account provider (it
+ * does so ABOVE `ThemeChrome`), this dashboard reads its state from the
+ * provider — the SAME state a panel the theme places in its own body reads.
+ * Without a provider the dashboard falls back to its props, which is what the
+ * studio and the tests use.
+ *
  * **The layout contract.** The breakpoints are the platform's (`sm` 640,
  * `md` 768, `lg` 1024, `xl` 1280 — `src/lib/responsive.ts:11-18`), used
  * through Tailwind's own prefixes. No hand-rolled width variants appear in
  * this file, so the storefront can never drift from the studio's device
  * frames.
  */
-import { Link, useNavigate } from "@tanstack/react-router";
+import { useNavigate } from "@tanstack/react-router";
 import { useEffect, useRef, useState, type ReactNode } from "react";
-import {
-  Heart,
-  MapPin,
-  Package,
-  ShieldCheck,
-  Trash2,
-  User,
-} from "@/components/icons/tabler";
 import { useLang } from "@/lib/i18n";
-import { fmtMinor } from "@/lib/money";
 import type { AccountTab } from "@/lib/account-tab";
-import type { AccountStatus } from "@/lib/account-status";
-import type {
-  AccountOverview,
-  ConsentChannel,
-  ConsentPurpose,
-} from "@/lib/accounts.server";
+import type { AccountOverview } from "@/lib/accounts.server";
 import { mapOrdersToRows } from "./account-slots";
+import {
+  AccountDetailsPanel,
+  AccountNavPanel,
+  AccountOrdersPanel,
+  AccountOverviewPanel,
+} from "./account-widgets";
+import {
+  useAccountDashboardState,
+  type AccountDashboardStatus,
+  type AccountOrderDetail,
+  type AccountAddressValues,
+  type AccountPanelType,
+} from "./AccountDashboardContext";
 
 /**
  * The route's own state — the six states the account surface distinguishes.
@@ -53,55 +58,13 @@ import { mapOrdersToRows } from "./account-slots";
  * The DECISION lives in the pure mapping (`src/lib/account-status.ts`); this
  * is the name the dashboard's prop carries.
  */
-export type AccountDashboardStatus = AccountStatus;
+export type { AccountDashboardStatus, AccountOrderDetail, AccountAddressValues };
 
 /**
- * ONE of the shopper's own orders, in full — the session-scoped detail the
- * `customer_order_detail` RPC returns (`ownOrderDetail`,
- * `src/lib/accounts.server.ts:430-464`).
- *
- * It is declared here rather than imported because the server module is
- * §7-prohibited for this batch: the shape is the RPC's, and the route's
- * `useServerFn(accountOrderFn)` return is checked against it by the
- * compiler, so the two cannot drift.
+ * The disclosed order — re-exported from the panels module, which owns the
+ * order rows and their disclosure.
  */
-export type AccountOrderDetail = {
-  order: {
-    id: string;
-    order_number: string;
-    status: string;
-    payment_method: string;
-    currency_code: string;
-    subtotal_minor_int: number;
-    shipping_minor_int: number;
-    discount_minor_int: number;
-    cod_surcharge_minor_int: number;
-    vat_minor_int: number;
-    total_minor_int: number;
-    city: string;
-    created_at: string;
-  };
-  items: {
-    title: string;
-    variant_name: string;
-    quantity: number;
-    unit_minor: number;
-    line_minor: number;
-  }[];
-};
-
-export type AccountAddressValues = {
-  label: string;
-  fullName: string;
-  phone: string;
-  line1: string;
-  line2: string;
-  city: string;
-  district: string;
-  postcode: string;
-  isDefault: boolean;
-  addressType: "shipping" | "billing";
-};
+export { OrderDetail } from "./account-widgets";
 
 export type AccountDashboardProps = {
   /** The store's slug — every link is a real route on this store. */
@@ -150,8 +113,8 @@ export type AccountDashboardProps = {
     phone: string;
   }) => void;
   onSetConsent?: (consent: {
-    channel: ConsentChannel;
-    purpose: ConsentPurpose;
+    channel: "email" | "sms";
+    purpose: "marketing" | "cart_recovery" | "stock_alerts";
     granted: boolean;
   }) => void;
   onToggleWishlist?: (variantId: string) => void;
@@ -163,82 +126,61 @@ export type AccountDashboardProps = {
   };
 };
 
-/**
- * The five destinations — the `ACCOUNT_TABS` union, one entry each, with the
- * icon and the label the nav renders. The list is written out (rather than
- * derived) so the icon and the bilingual label live beside the tab value.
- */
-const ACCOUNT_TAB_ITEMS: readonly {
-  tab: AccountTab;
-  en: string;
-  bn: string;
-  icon: "package" | "map" | "heart" | "user" | "shield";
-}[] = [
-  { tab: "orders", en: "Orders", bn: "অর্ডার", icon: "package" },
-  { tab: "addresses", en: "Addresses", bn: "ঠিকানা", icon: "map" },
-  { tab: "wishlist", en: "Wishlist", bn: "উইশলিস্ট", icon: "heart" },
-  { tab: "profile", en: "Profile", bn: "প্রোফাইল", icon: "user" },
-  { tab: "privacy", en: "Privacy", bn: "গোপনীয়তা", icon: "shield" },
-];
-
-function TabIcon({
-  icon,
-}: {
-  icon: (typeof ACCOUNT_TAB_ITEMS)[number]["icon"];
-}) {
-  const cls = "size-4 shrink-0";
-  if (icon === "package") return <Package className={cls} aria-hidden />;
-  if (icon === "map") return <MapPin className={cls} aria-hidden />;
-  if (icon === "heart") return <Heart className={cls} aria-hidden />;
-  if (icon === "user") return <User className={cls} aria-hidden />;
-  return <ShieldCheck className={cls} aria-hidden />;
-}
-
-/** The consent switches the platform offers — the same four the route owned. */
-const CONSENTS: readonly {
-  channel: ConsentChannel;
-  purpose: ConsentPurpose;
-}[] = [
-  { channel: "email", purpose: "marketing" },
-  { channel: "sms", purpose: "marketing" },
-  { channel: "email", purpose: "cart_recovery" },
-  { channel: "email", purpose: "stock_alerts" },
-];
-
-function formatDay(value: string | undefined, lang: string): string {
-  if (!value) return "";
-  const time = Date.parse(value);
-  if (Number.isNaN(time)) return "";
-  return new Date(time).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB");
-}
-
 /**
  * The account surface.
  *
  * The six states are DISTINCT and each one is reachable: signed out, loading,
  * failed, signed in with orders, signed in without orders.
  */
-export function AccountDashboard({
-  slug,
-  overview,
-  status,
-  tab,
-  onTabChange,
-  profileSlot,
-  currency,
-  onLoadOrder,
-  orderDetail,
-  orderDetailPending,
-  orderDetailError,
-  onSaveAddress,
-  onDeleteAddress,
-  onSaveProfile,
-  onSetConsent,
-  onToggleWishlist,
-  busy,
-}: AccountDashboardProps) {
-  const { t, lang } = useLang();
-  const navigate = useNavigate();
+export function AccountDashboard(props: AccountDashboardProps) {
+  const { t } = useLang();
+  const state = useAccountDashboardState();
+
+  /**
+   * The provider wins when it is mounted: the dashboard's own copy of a panel
+   * and the panel the theme places in its body must read ONE state — the same
+   * tab, the same open order, the same write callbacks. Without a provider
+   * the dashboard falls back to its props (the studio, the tests).
+   */
+  const slug = state ? state.slug : props.slug;
+  const overview = state ? state.overview : props.overview;
+  const status = state ? state.status : props.status;
+  const tab = state ? state.tab : props.tab;
+  const currency = state ? state.currency : props.currency;
+  const orderDetail = state ? state.orderDetail : props.orderDetail;
+  const orderDetailPending = state
+    ? state.orderDetailPending
+    : props.orderDetailPending;
+  const orderDetailError = state
+    ? state.orderDetailError
+    : props.orderDetailError;
+  const onLoadOrder = state ? state.onLoadOrder : props.onLoadOrder;
+  const onSaveAddress = state ? state.onSaveAddress : props.onSaveAddress;
+  const onDeleteAddress = state
+    ? state.onDeleteAddress
+    : props.onDeleteAddress;
+  const onSaveProfile = state ? state.onSaveProfile : props.onSaveProfile;
+  const onSetConsent = state ? state.onSetConsent : props.onSetConsent;
+  const onToggleWishlist = state
+    ? state.onToggleWishlist
+    : props.onToggleWishlist;
+  const busy = state ? state.busy : props.busy;
+  const onTabChange = state ? state.setTab : props.onTabChange;
+  /** The panels the THEME placed — the dashboard's fallback skips them. */
+  const placed: readonly AccountPanelType[] = state?.placed ?? [];
+
+  /**
+   * The shopper's orders in the platform's own row contract. With a provider
+   * the route has already mapped them; without one the dashboard maps the
+   * overview itself, through the same `mapOrdersToRows`.
+   */
+  const rows = state ? state.orders : mapOrdersToRows(overview?.orders ?? []);
+
+  // The disclosed order. With a provider the open order is the provider's —
+  // so the theme's copy of the orders panel and this one open the SAME order.
+  const [localOpenOrderId, setLocalOpenOrderId] = useState<string | null>(null);
+  const openOrderId = state ? state.openOrderId : localOpenOrderId;
+  const setOpenOrderId = state ? state.setOpenOrderId : setLocalOpenOrderId;
 
   // ── The ARIA tabs pattern ───────────────────────────────────────────────
   // The five destinations are five states of ONE route, and the selection is
@@ -254,57 +196,18 @@ export function AccountDashboard({
   //
   // The hooks live ABOVE the state branches below, so the hook order never
   // changes with the surface's state.
-  const [focusedTab, setFocusedTab] = useState<AccountTab>(tab);
-  const tabRefs = useRef<Partial<Record<AccountTab, HTMLAnchorElement | null>>>(
-    {},
-  );
   const panelRef = useRef<HTMLElement | null>(null);
   // Set when the shopper activates a tab from inside the dashboard, so the
   // panel can take the focus once the new content is in.
   const activatedRef = useRef(false);
 
   useEffect(() => {
-    setFocusedTab(tab);
     const activated = activatedRef.current;
     activatedRef.current = false;
     if (!activated) return;
     panelRef.current?.focus();
   }, [tab]);
 
-  const onTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
-    const index = ACCOUNT_TAB_ITEMS.findIndex(
-      (item) => item.tab === focusedTab,
-    );
-    if (index < 0) return;
-    let next = -1;
-    if (event.key === "ArrowRight")
-      next = (index + 1) % ACCOUNT_TAB_ITEMS.length;
-    else if (event.key === "ArrowLeft")
-      next = (index - 1 + ACCOUNT_TAB_ITEMS.length) % ACCOUNT_TAB_ITEMS.length;
-    else if (event.key === "Home") next = 0;
-    else if (event.key === "End") next = ACCOUNT_TAB_ITEMS.length - 1;
-    if (next < 0) return;
-    event.preventDefault();
-    const target = ACCOUNT_TAB_ITEMS[next]!;
-    setFocusedTab(target.tab);
-    tabRefs.current[target.tab]?.focus();
-  };
-
-  // Activating a tab: the preview drives its own state, the storefront
-  // navigates to the tab's own URL.
-  const activateTab = (next: AccountTab) => {
-    activatedRef.current = true;
-    if (onTabChange) {
-      onTabChange(next);
-      return;
-    }
-    void navigate({
-      to: "/store/$slug/account",
-      params: { slug },
-      search: { tab: next },
-    });
-  };
-
   if (status === "unauthenticated") {
     return <OrderLookup slug={slug} />;
   }
@@ -344,25 +247,8 @@ export function AccountDashboard({
     );
   }
 
-  const orders = overview?.orders ?? [];
-  const addresses = overview?.addresses ?? [];
-  const wishlist = overview?.wishlist ?? [];
-  const consents = overview?.consents ?? [];
-  const profile = overview?.profile ?? null;
-
-  // The MOST RECENT order — the newest `created_at` the RPC returned, not
-  // the first row it happened to send.
-  const latest = orders.reduce<(typeof orders)[number] | null>(
-    (best, order) =>
-      best === null ||
-      Date.parse(order.created_at) > Date.parse(best.created_at)
-        ? order
-        : best,
-    null,
-  );
-  const defaultAddress = addresses.find((address) => address.is_default);
-  const name = profile?.name ?? "";
-  const email = profile?.email ?? "";
+  const name = overview?.profile?.name ?? "";
+  const email = overview?.profile?.email ?? "";
 
   return (
     <div className="space-y-10">
@@ -381,58 +267,16 @@ export function AccountDashboard({
         </p>
       </header>
 
-      <nav
-        aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
-        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 lg:gap-3"
-      >
-        <div
-          role="tablist"
-          onKeyDown={onTabKeyDown}
-          className="flex gap-2 sm:flex-wrap lg:gap-3"
-        >
-          {ACCOUNT_TAB_ITEMS.map((item) => {
-            const selected = item.tab === tab;
-            return (
-              <Link
-                key={item.tab}
-                id={tabId(item.tab)}
-                ref={(element: HTMLAnchorElement | null) => {
-                  tabRefs.current[item.tab] = element;
-                }}
-                to="/store/$slug/account"
-                params={{ slug }}
-                search={{ tab: item.tab }}
-                role="tab"
-                aria-selected={selected}
-                aria-controls={panelId}
-                // The ROVING tabindex: one tab stop for the whole tablist.
-                tabIndex={focusedTab === item.tab ? 0 : -1}
-                onFocus={() => setFocusedTab(item.tab)}
-                onKeyDown={(event) => {
-                  // Space activates a tab (Enter is the link's own).
-                  if (event.key !== " " && event.key !== "Spacebar") return;
-                  event.preventDefault();
-                  activateTab(item.tab);
-                }}
-                onClick={(event) => {
-                  if (item.tab !== tab) activatedRef.current = true;
-                  if (!onTabChange) return;
-                  event.preventDefault();
-                  onTabChange(item.tab);
-                }}
-                className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-bold fq-caps tracking-widest transition-colors ${
-                  selected
-                    ? "border-foreground text-foreground"
-                    : "border-transparent text-muted-foreground hover:text-foreground"
-                }`}
-              >
-                <TabIcon icon={item.icon} />
-                <span>{t(item.en, item.bn)}</span>
-              </Link>
-            );
-          })}
-        </div>
-      </nav>
+      {!placed.includes("account_nav") && (
+        <AccountNavPanel
+          slug={slug}
+          tab={tab}
+          onTabChange={onTabChange}
+          onActivate={() => {
+            activatedRef.current = true;
+          }}
+        />
+      )}
 
       <section
         role="tabpanel"
@@ -442,748 +286,44 @@ export function AccountDashboard({
         ref={panelRef}
         className="space-y-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
       >
-        <section aria-label={t("At a glance", "এক নজরে")} className="space-y-4">
-          <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-            {t("At a glance", "এক নজরে")}
-          </h2>
-          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
-            <Fact
-              label={t("Orders", "অর্ডার")}
-              value={
-                orders.length === 1
-                  ? t("1 order", "১টি অর্ডার")
-                  : t(`${orders.length} orders`, `${orders.length}টি অর্ডার`)
-              }
-            />
-            <Fact
-              label={t("Latest order", "সর্বশেষ অর্ডার")}
-              value={latest ? latest.order_number : "—"}
-              detail={latest ? latest.status : undefined}
-            />
-            <Fact
-              label={t("Default address", "ডিফল্ট ঠিকানা")}
-              value={defaultAddress ? defaultAddress.city : "—"}
-              detail={
-                defaultAddress
-                  ? defaultAddress.district
-                  : t("Not set", "সেট করা নেই")
-              }
-            />
-            <Fact
-              label={t("Saved items", "সংরক্ষিত পণ্য")}
-              value={String(wishlist.length)}
-            />
-          </div>
-        </section>
+        {!placed.includes("account_overview") && (
+          <AccountOverviewPanel overview={overview} />
+        )}
 
-        {tab === "orders" &&
-          (orders.length === 0 ? (
-            <Empty
-              text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")}
+        {!placed.includes("account_orders") &&
+          tab === "orders" && (
+            <AccountOrdersPanel
               slug={slug}
-            />
-          ) : (
-            <OrderRows
-              orders={orders}
-              lang={lang}
+              rows={rows}
+              openOrderId={openOrderId}
+              onOpenOrder={setOpenOrderId}
               onLoadOrder={onLoadOrder}
               orderDetail={orderDetail}
               orderDetailPending={orderDetailPending}
               orderDetailError={orderDetailError}
             />
-          ))}
-
-        {tab === "addresses" && (
-          <div className="space-y-6">
-            {addresses.length === 0 ? (
-              <Empty
-                text={t(
-                  "No saved addresses yet.",
-                  "এখনও কোনো ঠিকানা সংরক্ষণ করা নেই।",
-                )}
-                slug={slug}
-              />
-            ) : (
-              <ul className="grid gap-6 sm:grid-cols-2">
-                {addresses.map((address) => (
-                  <li
-                    key={address.id}
-                    className="flex flex-col justify-between border border-border/60 p-6 bg-transparent"
-                  >
-                    <div className="flex items-start justify-between gap-4">
-                      <div>
-                        <p className="text-[13.5px] font-bold text-foreground">
-                          {address.label}
-                          {address.is_default && (
-                            <span className="ml-3 inline-block rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-bold fq-caps tracking-widest text-foreground">
-                              {t("Default", "ডিফল্ট")}
-                            </span>
-                          )}
-                        </p>
-                        <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
-                          <span className="font-medium text-foreground/80">
-                            {address.full_name}
-                          </span>{" "}
-                          · <span className="money">{address.phone}</span>
-                          <br />
-                          {address.line1}
-                          {address.line2 ? `, ${address.line2}` : ""}
-                          <br />
-                          {address.city}, {address.district}{" "}
-                          <span className="money">
-                            {address.postcode ?? ""}
-                          </span>
-                        </p>
-                      </div>
-                      {onDeleteAddress ? (
-                        <button
-                          type="button"
-                          aria-label={t(
-                            `Remove ${address.label}`,
-                            `${address.label} মুছুন`,
-                          )}
-                          onClick={() => onDeleteAddress(address.id)}
-                          className="text-muted-foreground hover:text-danger-foreground transition-colors p-2 -mr-2 -mt-2"
-                        >
-                          <Trash2 className="size-5" aria-hidden />
-                        </button>
-                      ) : null}
-                    </div>
-                  </li>
-                ))}
-              </ul>
-            )}
-            {onSaveAddress ? (
-              <AddressForm
-                busy={busy?.address ?? false}
-                onSubmit={(values) => onSaveAddress(values)}
-              />
-            ) : null}
-          </div>
-        )}
-
-        {tab === "wishlist" &&
-          (wishlist.length === 0 ? (
-            <Empty
-              text={t("Nothing saved yet.", "এখনও কিছু সংরক্ষিত নেই।")}
-              slug={slug}
-            />
-          ) : (
-            <ul className="divide-y divide-border/60">
-              {wishlist.map((item) => (
-                <li
-                  key={item.id}
-                  className="flex items-center justify-between gap-4 py-6"
-                >
-                  <Link
-                    to="/store/$slug/p/$productSlug"
-                    params={{ slug, productSlug: item.product_slug }}
-                    className="min-w-0"
-                  >
-                    <span className="block truncate text-[14px] font-medium leading-relaxed">
-                      {item.product_title}
-                    </span>
-                    <span className="block text-[12px] font-medium tracking-wide text-muted-foreground mt-0.5">
-                      {item.variant_name}
-                    </span>
-                    <span className="money mt-2 block text-[13.5px] font-semibold tracking-wide">
-                      {fmtMinor(item.price_amount_minor_int, currency)}
-                    </span>
-                    <span
-                      className={`text-[11px] font-bold fq-caps tracking-widest block mt-2 ${item.stock_quantity > 0 ? "text-foreground" : "text-danger-foreground"}`}
-                    >
-                      {item.stock_quantity > 0
-                        ? t("In Stock", "স্টকে আছে")
-                        : t("Out of Stock", "স্টক নেই")}
-                    </span>
-                  </Link>
-                  {onToggleWishlist ? (
-                    <button
-                      type="button"
-                      onClick={() => onToggleWishlist(item.variant_id)}
-                      className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
-                    >
-                      {t("Remove", "সরান")}
-                    </button>
-                  ) : null}
-                </li>
-              ))}
-            </ul>
-          ))}
-
-        {tab === "profile" && (
-          <div className="space-y-8">
-            {/* The composed profile — the merchant's OWN `profile_card`
-                section when the theme does not place one of its own (the
-                route hands it over only then, so the shopper's details are
-                never shown twice on one page) — and the editable contact
-                fields the platform keeps for the shopper. */}
-            {profileSlot ? (
-              <section
-                aria-label={t("Your profile", "আপনার প্রোফাইল")}
-                className="border border-border/60 p-6 bg-transparent"
-              >
-                {profileSlot}
-              </section>
-            ) : null}
-            {onSaveProfile ? (
-              <ProfileForm
-                busy={busy?.profile ?? false}
-                initial={{
-                  name: profile?.name ?? "",
-                  email: profile?.email ?? "",
-                  phone: profile?.phone ?? "",
-                }}
-                onSubmit={(values) => onSaveProfile(values)}
-              />
-            ) : null}
-          </div>
-        )}
+          )}
 
-        {tab === "privacy" && (
-          <div className="max-w-xl space-y-3">
-            <p className="text-sm text-muted-foreground">
-              {t(
-                "You choose which messages this store may send you. Turning one off applies everywhere immediately.",
-                "এই দোকান আপনাকে কোন বার্তা পাঠাতে পারবে তা আপনি ঠিক করবেন। বন্ধ করলে সব জায়গায় সাথে সাথে প্রযোজ্য হবে।",
-              )}
-            </p>
-            {CONSENTS.map((consent) => {
-              const granted =
-                consents.find(
-                  (row) =>
-                    row.channel === consent.channel &&
-                    row.purpose === consent.purpose,
-                )?.granted ?? false;
-              return (
-                <label
-                  key={`${consent.channel}:${consent.purpose}`}
-                  className="flex items-center justify-between gap-4 py-6 border-b border-border/60"
-                >
-                  <span>
-                    <span className="font-bold text-[13px] text-foreground block">
-                      {consent.purpose.replace("_", " ")}
-                    </span>
-                    <span className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
-                      {consent.channel}
-                    </span>
-                  </span>
-                  {onSetConsent ? (
-                    <input
-                      type="checkbox"
-                      checked={granted}
-                      // The consent mutation is in flight: the switch is
-                      // disabled, exactly as the address and profile
-                      // editors are, so a second write cannot race the first.
-                      disabled={busy?.consent ?? false}
-                      onChange={(event) =>
-                        onSetConsent({
-                          channel: consent.channel,
-                          purpose: consent.purpose,
-                          granted: event.target.checked,
-                        })
-                      }
-                      className="size-5 accent-foreground"
-                    />
-                  ) : (
-                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
-                      {granted ? t("On", "চালু") : t("Off", "বন্ধ")}
-                    </span>
-                  )}
-                </label>
-              );
-            })}
-          </div>
+        {!placed.includes("account_details") && (
+          <AccountDetailsPanel
+            slug={slug}
+            tab={tab}
+            overview={overview}
+            currency={currency}
+            profileSlot={props.profileSlot}
+            onSaveAddress={onSaveAddress}
+            onDeleteAddress={onDeleteAddress}
+            onSaveProfile={onSaveProfile}
+            onSetConsent={onSetConsent}
+            onToggleWishlist={onToggleWishlist}
+            busy={busy}
+          />
         )}
       </section>
     </div>
   );
 }
 
-/** One fact in the overview strip — a count or a fact the RPC returned. */
-function Fact({
-  label,
-  value,
-  detail,
-}: {
-  label: string;
-  value: string;
-  detail?: string;
-}) {
-  return (
-    <div className="border border-border/60 p-5 bg-transparent">
-      <p className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-        {label}
-      </p>
-      <p className="money mt-2 truncate text-[15px] font-semibold tracking-wide text-foreground">
-        {value}
-      </p>
-      {detail ? (
-        <p className="mt-1 truncate text-[12px] font-medium tracking-wide text-muted-foreground">
-          {detail}
-        </p>
-      ) : null}
-    </div>
-  );
-}
-
-/**
- * The order history, laid out as ROWS: the order number, the date, the status
- * and the total — the four fields the platform's own row mapping produces
- * (`mapOrdersToRows`), arranged rather than listed.
- *
- * **The row discloses; it never links.** The order route is token-gated
- * (`loadOrder` returns nothing unless the request carries the order's access
- * token), and the account payload carries no token — so a link to it would
- * dead-end on a 404. The row instead opens the order INLINE, resolved under
- * the shopper's own session (`onLoadOrder` → the route's `accountOrderFn`),
- * so the shopper sees their own order without a token and without a dead
- * link.
- */
-function OrderRows({
-  orders,
-  lang,
-  onLoadOrder,
-  orderDetail,
-  orderDetailPending,
-  orderDetailError,
-}: {
-  orders: AccountOverview["orders"];
-  lang: string;
-  onLoadOrder?: (orderId: string) => void;
-  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
-  orderDetailPending?: boolean;
-  orderDetailError?: boolean;
-}) {
-  const { t } = useLang();
-  const rows = mapOrdersToRows(orders);
-  const [openId, setOpenId] = useState<string | null>(null);
-
-  const toggle = (orderId: string) => {
-    const next = openId === orderId ? null : orderId;
-    setOpenId(next);
-    if (next) onLoadOrder?.(next);
-  };
-
-  return (
-    <ul className="divide-y divide-border/60">
-      {rows.map((row) => {
-        const open = openId === row.id;
-        const detail =
-          orderDetail?.orderId === row.id ? orderDetail.detail : null;
-        return (
-          <li key={row.id}>
-            <div className="grid gap-2 py-6 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-6 -mx-4 px-4 sm:mx-0 sm:px-0">
-              <span className="min-w-0">
-                <span className="money block text-[14px] font-bold text-foreground">
-                  {row.title}
-                </span>
-                <time
-                  dateTime={row.date}
-                  className="money text-[12px] font-medium tracking-wide text-muted-foreground mt-1 block"
-                >
-                  {formatDay(row.date, lang)}
-                </time>
-              </span>
-              {row.subtitle ? (
-                <span className="justify-self-start text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
-                  {row.subtitle}
-                </span>
-              ) : null}
-              {typeof row.priceMinor === "number" ? (
-                <span className="money text-[14px] font-semibold text-foreground tracking-wide">
-                  {fmtMinor(row.priceMinor, row.currency)}
-                </span>
-              ) : null}
-              {onLoadOrder ? (
-                <button
-                  type="button"
-                  aria-expanded={open}
-                  aria-controls={`account-order-detail-${row.id}`}
-                  onClick={() => toggle(row.id)}
-                  className="justify-self-start text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors"
-                >
-                  {open
-                    ? t("Hide order", "অর্ডার লুকান")
-                    : t("View order", "অর্ডার দেখুন")}
-                </button>
-              ) : null}
-            </div>
-            {open ? (
-              <div
-                id={`account-order-detail-${row.id}`}
-                className="pb-6 -mx-4 px-4 sm:mx-0 sm:px-0"
-              >
-                {orderDetailPending ? (
-                  <p
-                    role="status"
-                    className="text-[13px] text-muted-foreground"
-                  >
-                    {t("Loading your order…", "আপনার অর্ডার লোড হচ্ছে…")}
-                  </p>
-                ) : orderDetailError ? (
-                  <p
-                    role="alert"
-                    className="text-[13px] font-medium text-danger-foreground"
-                  >
-                    {t(
-                      "We could not load that order. Please try again.",
-                      "অর্ডারটি লোড করা যায়নি। আবার চেষ্টা করুন।",
-                    )}
-                  </p>
-                ) : detail ? (
-                  <OrderDetail detail={detail} lang={lang} />
-                ) : null}
-              </div>
-            ) : null}
-          </li>
-        );
-      })}
-    </ul>
-  );
-}
-
-/**
- * The disclosed order — the shopper's OWN order, in full.
- *
- * Every figure here comes from the session-scoped `customer_order_detail`
- * payload: the order's own numbers, its line items and its server-priced
- * totals. Nothing is computed on the client and nothing is invented.
- */
-export function OrderDetail({
-  detail,
-  lang,
-}: {
-  detail: AccountOrderDetail;
-  lang: string;
-}) {
-  const { t } = useLang();
-  const order = detail.order;
-  const money = (minor: number) => fmtMinor(minor, order.currency_code);
-  return (
-    <div className="border border-border/60 p-5 bg-transparent">
-      <p className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-        {t("Order details", "অর্ডারের বিস্তারিত")}
-      </p>
-      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
-        <Detail
-          label={t("Order number", "অর্ডার নম্বর")}
-          value={order.order_number}
-        />
-        <Detail label={t("Status", "অবস্থা")} value={order.status} />
-        <Detail
-          label={t("Placed", "অর্ডারের সময়")}
-          value={formatDay(order.created_at, lang)}
-        />
-        <Detail label={t("Payment", "পেমেন্ট")} value={order.payment_method} />
-        <Detail label={t("City", "শহর")} value={order.city} />
-        <Detail
-          label={t("Total", "সর্বমোট")}
-          value={money(order.total_minor_int)}
-        />
-      </dl>
-      {detail.items.length > 0 ? (
-        <ul className="mt-5 divide-y divide-border/60 border-t border-border/60">
-          {detail.items.map((item, index) => (
-            <li
-              key={`${item.title}-${index}`}
-              className="flex items-start justify-between gap-4 py-3"
-            >
-              <span className="min-w-0">
-                <span className="block text-[13.5px] font-medium text-foreground">
-                  {item.title}
-                </span>
-                <span className="block text-[12px] text-muted-foreground">
-                  {item.variant_name} · ×{item.quantity}
-                </span>
-              </span>
-              <span className="money text-[13.5px] font-semibold text-foreground">
-                {money(item.line_minor)}
-              </span>
-            </li>
-          ))}
-        </ul>
-      ) : null}
-      <dl className="mt-5 space-y-2 border-t border-border/60 pt-4">
-        <Total
-          label={t("Subtotal", "সাবটোটাল")}
-          value={money(order.subtotal_minor_int)}
-        />
-        {order.discount_minor_int > 0 ? (
-          <Total
-            label={t("Discount", "ছাড়")}
-            value={money(order.discount_minor_int)}
-          />
-        ) : null}
-        <Total
-          label={t("Delivery", "ডেলিভারি")}
-          value={money(order.shipping_minor_int)}
-        />
-        {order.cod_surcharge_minor_int > 0 ? (
-          <Total
-            label={t("COD surcharge", "ক্যাশ অন ডেলিভারি সারচার্জ")}
-            value={money(order.cod_surcharge_minor_int)}
-          />
-        ) : null}
-        {order.vat_minor_int > 0 ? (
-          <Total label={t("VAT", "ভ্যাট")} value={money(order.vat_minor_int)} />
-        ) : null}
-        <Total
-          label={t("Total", "সর্বমোট")}
-          value={money(order.total_minor_int)}
-          strong
-        />
-      </dl>
-    </div>
-  );
-}
-
-/** One labelled fact in the disclosed order. */
-function Detail({ label, value }: { label: string; value: string }) {
-  return (
-    <div>
-      <dt className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-        {label}
-      </dt>
-      <dd className="money mt-1 text-[13.5px] font-medium text-foreground">
-        {value}
-      </dd>
-    </div>
-  );
-}
-
-/** One line of the disclosed order's totals — the server's own numbers. */
-function Total({
-  label,
-  value,
-  strong,
-}: {
-  label: string;
-  value: string;
-  strong?: boolean;
-}) {
-  return (
-    <div className="flex items-center justify-between gap-4">
-      <dt
-        className={
-          strong
-            ? "font-bold text-[13px] fq-caps tracking-widest text-foreground"
-            : "text-[13px] font-medium tracking-wide text-muted-foreground"
-        }
-      >
-        {label}
-      </dt>
-      <dd
-        className={`money ${strong ? "text-[14px] font-bold text-foreground tracking-wide" : "text-[13.5px] font-semibold text-foreground tracking-wide"}`}
-      >
-        {value}
-      </dd>
-    </div>
-  );
-}
-
-function Empty({ text, slug }: { text: string; slug: string }) {
-  const { t } = useLang();
-  return (
-    <div className="py-12">
-      <p className="text-[13.5px] text-muted-foreground">{text}</p>
-      <Link
-        to="/store/$slug"
-        search={{ preview_token: undefined }}
-        params={{ slug }}
-        className="mt-6 inline-flex min-h-12 items-center justify-center border border-border px-8 text-[11px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
-      >
-        {t("Start Shopping", "কেনাকাটা শুরু করুন")}
-      </Link>
-    </div>
-  );
-}
-
-function AddressForm({
-  busy,
-  onSubmit,
-}: {
-  busy: boolean;
-  onSubmit: (values: AccountAddressValues) => void;
-}) {
-  const { t } = useLang();
-  const [values, setValues] = useState<AccountAddressValues>({
-    label: "",
-    fullName: "",
-    phone: "",
-    line1: "",
-    line2: "",
-    city: "",
-    district: "",
-    postcode: "",
-    isDefault: false,
-    addressType: "shipping",
-  });
-  const set =
-    (key: keyof AccountAddressValues) =>
-    (event: React.ChangeEvent<HTMLInputElement>) =>
-      setValues((previous) => ({
-        ...previous,
-        [key]: key === "isDefault" ? event.target.checked : event.target.value,
-      }));
-
-  const fields: [keyof AccountAddressValues, string, string][] = [
-    ["label", t("Label", "লেবেল"), t("Home", "বাসা")],
-    ["fullName", t("Full name", "পুরো নাম"), ""],
-    ["phone", t("Phone", "ফোন"), "01XXXXXXXXX"],
-    ["line1", t("Address line 1", "ঠিকানা ১"), ""],
-    ["line2", t("Address line 2", "ঠিকানা ২"), ""],
-    ["city", t("City", "শহর"), ""],
-    ["district", t("District", "জেলা"), ""],
-    ["postcode", t("Postcode", "পোস্টকোড"), ""],
-  ];
-
-  return (
-    <form
-      className="mt-12 max-w-2xl"
-      onSubmit={(event) => {
-        event.preventDefault();
-        onSubmit(values);
-      }}
-    >
-      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
-        {t("Add an Address", "নতুন ঠিকানা যোগ করুন")}
-      </h2>
-      <div className="grid gap-6 sm:grid-cols-2">
-        {fields.map(([key, label, placeholder]) => (
-          <label key={key} htmlFor={`addr-${key}`} className="block">
-            <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-              {label}
-            </span>
-            <input
-              id={`addr-${key}`}
-              value={String(values[key])}
-              onChange={set(key)}
-              placeholder={placeholder}
-              required={[
-                "label",
-                "fullName",
-                "phone",
-                "line1",
-                "city",
-                "district",
-              ].includes(key)}
-              className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
-            />
-          </label>
-        ))}
-      </div>
-      <label className="mt-8 flex items-center gap-3 text-[13px] font-medium text-foreground">
-        <input
-          type="checkbox"
-          checked={values.isDefault}
-          onChange={set("isDefault")}
-          className="size-4 accent-foreground"
-        />
-        {t("Set as default address", "ডিফল্ট ঠিকানা হিসেবে সেট করুন")}
-      </label>
-      <button
-        type="submit"
-        disabled={busy}
-        className="mt-8 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
-      >
-        {busy
-          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
-          : t("Save Address", "ঠিকানা সংরক্ষণ করুন")}
-      </button>
-    </form>
-  );
-}
-
-function ProfileForm({
-  busy,
-  initial,
-  onSubmit,
-}: {
-  busy: boolean;
-  initial: { name: string; email: string; phone: string };
-  onSubmit: (values: { name: string; email: string; phone: string }) => void;
-}) {
-  const { t } = useLang();
-  const [values, setValues] = useState(initial);
-  return (
-    <form
-      className="max-w-xl"
-      onSubmit={(event) => {
-        event.preventDefault();
-        onSubmit(values);
-      }}
-    >
-      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
-        {t("Your Details", "আপনার তথ্য")}
-      </h2>
-      <div className="space-y-6">
-        <label htmlFor="pf-name" className="block">
-          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-            {t("Full Name", "পুরো নাম")}
-          </span>
-          <input
-            id="pf-name"
-            value={values.name}
-            required
-            onChange={(event) =>
-              setValues((previous) => ({
-                ...previous,
-                name: event.target.value,
-              }))
-            }
-            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
-          />
-        </label>
-        <label htmlFor="pf-phone" className="block">
-          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-            {t("Phone", "ফোন")}
-          </span>
-          <input
-            id="pf-phone"
-            value={values.phone}
-            required
-            inputMode="tel"
-            onChange={(event) =>
-              setValues((previous) => ({
-                ...previous,
-                phone: event.target.value,
-              }))
-            }
-            className="money min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
-          />
-        </label>
-        <label htmlFor="pf-email" className="block">
-          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
-            {t("Email (optional)", "ইমেইল (ঐচ্ছিক)")}
-          </span>
-          <input
-            id="pf-email"
-            value={values.email}
-            type="email"
-            onChange={(event) =>
-              setValues((previous) => ({
-                ...previous,
-                email: event.target.value,
-              }))
-            }
-            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
-          />
-        </label>
-      </div>
-      <button
-        type="submit"
-        disabled={busy}
-        className="mt-10 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
-      >
-        {busy
-          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
-          : t("Save Details", "তথ্য সংরক্ষণ করুন")}
-      </button>
-    </form>
-  );
-}
-
 /**
  * The signed-out state.
  *
```


### (c.3) `src/lib/widget-help.ts` — the four bilingual help entries (BEYOND G1's list — ratification required)

**Why this file is unavoidable.** `WIDGET_HELP` is typed `Record<SectionType, BiText>` (`src/lib/widget-help.ts:18`) — **compile-total**. The moment the union grows by four members, `tsgo --noEmit` fails until the four entries exist. The compiler named this site by itself:

```
src/lib/widget-help.ts(18,14): error TS2739: Type '{ container: … }' is missing the following
properties from type 'Record<SectionType, BiText>': account_details, account_nav, account_orders,
account_overview
```

This is the platform's own totality contract (a.2, contract 1) — the same one the extension node's comment names. The four entries are NEW copy: the platform's help table is bilingual by contract (`src/lib/widget-metadata.test.ts:31-39` requires a Bangla sibling for every catalogue entry), and no existing Bangla string is re-worded.

```diff
--- a/src/lib/widget-help.ts
+++ b/src/lib/widget-help.ts
@@ the WIDGET_HELP table, after `profile_card`
+  account_nav: {
+    en: "The account's five destinations — orders, addresses, wishlist, profile and privacy.",
+    bn: "অ্যাকাউন্টের পাঁচটি বিভাগ — অর্ডার, ঠিকানা, উইশলিস্ট, প্রোফাইল ও গোপনীয়তা।",
+  },
+  account_overview: {
+    en: "A strip of facts about this shopper's own account — orders, latest order, default address and saved items.",
+    bn: "এই ক্রেতার নিজের অ্যাকাউন্টের কিছু তথ্য — অর্ডার, সর্বশেষ অর্ডার, ডিফল্ট ঠিকানা ও সংরক্ষিত পণ্য।",
+  },
+  account_orders: {
+    en: "The shopper's own order history — the order number, the date, the status and the total.",
+    bn: "ক্রেতার নিজের অর্ডারের ইতিহাস — অর্ডার নম্বর, তারিখ, অবস্থা ও মোট।",
+  },
+  account_details: {
+    en: "The shopper's own details — the saved addresses, the profile, the message preferences and the wishlist.",
+    bn: "ক্রেতার নিজের তথ্য — সংরক্ষিত ঠিকানা, প্রোফাইল, বার্তার পছন্দ ও উইশলিস্ট।",
+  },
```


### (c.4) The two existing suites that read the account surface as TEXT (BEYOND G1's list — ratification required)

**Why these two files are touched.** Frame30 moves the account surface's four panels — the navigation, the overview strip, the structured order rows and the details block — out of `AccountDashboard.tsx` and into `src/components/store/account-widgets.tsx`, because they are now **widgets the theme places** (that is the whole point of the decomposition: the theme can put the account's contents wherever it likes). Two existing suites read that surface's source as TEXT and assert where the markup lives:

- `src/components/store/account-dashboard.contract.test.ts` — the navigation contract, the link contract and the order-detail contract;
- `src/components/store/AccountDashboard.test.tsx` — the ARIA tabs pattern's source contract and the layout contract.

**The edit is a RE-POINT, not a weakening.** The file each suite reads becomes the **account surface's source** — the dashboard module PLUS the panels module — instead of one module. **Every assertion stays exactly as it is**: the same `toContain`, the same `matchAll`, the same expectations. The contract now covers the surface's source, which is where the markup now lives. Nothing is deleted, skipped, softened or re-scoped: the negations (`not.toContain("/account/orders")`, the invented-metric list) now cover MORE source than before.

**What the suites still assert, unchanged:** the five destinations are the `ACCOUNT_TABS` union; every destination is a `?tab=` value on the account route; the surface links to no path that does not exist; the order is disclosed inline and never linked to the token-gated order route; the arrow keys move the focus; the markup uses no hand-rolled breakpoint variant.

```diff
--- a/src/components/store/account-dashboard.contract.test.ts
+++ b/src/components/store/account-dashboard.contract.test.ts
@@ the source constants
-const DASHBOARD_SRC = readFileSync(
-  "src/components/store/AccountDashboard.tsx",
-  "utf8",
-);
+/**
+ * The account SURFACE's source — the dashboard and the panels module that
+ * holds its four panels. Frame30 moved the nav, the overview, the order
+ * rows and the details block into `src/components/store/account-widgets.tsx`
+ * (they are placeable widgets now), so this contract reads the surface's
+ * source, not one module's. The assertions below are unchanged.
+ */
+const DASHBOARD_SRC =
+  readFileSync("src/components/store/AccountDashboard.tsx", "utf8") +
+  readFileSync("src/components/store/account-widgets.tsx", "utf8");

--- a/src/components/store/AccountDashboard.test.tsx
+++ b/src/components/store/AccountDashboard.test.tsx
@@ the source constant
-const SOURCE = readFileSync(
-  "src/components/store/AccountDashboard.tsx",
-  "utf8",
-);
+/**
+ * The account SURFACE's source — the dashboard and the panels module that
+ * holds its four panels (Frame30 made them placeable widgets). The
+ * assertions below are unchanged; they now cover the surface's source.
+ */
+const SOURCE =
+  readFileSync("src/components/store/AccountDashboard.tsx", "utf8") +
+  readFileSync("src/components/store/account-widgets.tsx", "utf8");
```


### (c.5) `src/lib/studio/catalog.ts` — the four studio twins (BEYOND G1's list — ratification required)

**Why this file is unavoidable.** The studio twin-parity contract: *"every BASE_CATALOG entry in `builder-ast` (SECTION_CATALOG) must resolve here in WIDGET_BY_KEY so it stays editable in the studio"* (`src/lib/studio/catalog.ts:1594-1602`, pinned by `src/lib/studio/catalog.test.ts:844-852`). A new catalogue row without a twin fails that suite — and the twin's defaults must deep-equal the catalogue's (`src/lib/studio/catalog-dedup.test.ts:101-106`), which `catalogDefaults(type)` gives by construction.

```diff
--- a/src/lib/studio/catalog.ts
+++ b/src/lib/studio/catalog.ts
@@ after the `profile_card` twin
+  // Frame30 — the account's placeable panels. Route-owned data a theme may
+  // place in its own body; the twins mirror the BASE defaults 1:1.
+  {
+    key: "account_nav",
+    label: "Account navigation",
+    category: "commerce",
+    icon: "Menu",
+    keywords: ["account", "navigation", "tabs", "menu", "destinations"],
+    defaults: catalogDefaults("account_nav"),
+  },
+  {
+    key: "account_overview",
+    label: "Account overview",
+    category: "commerce",
+    icon: "LayoutDashboard",
+    keywords: ["account", "overview", "summary", "facts", "glance"],
+    defaults: catalogDefaults("account_overview"),
+  },
+  {
+    key: "account_orders",
+    label: "Account orders",
+    category: "commerce",
+    icon: "Receipt",
+    keywords: ["account", "orders", "history", "purchases", "shopper"],
+    defaults: catalogDefaults("account_orders"),
+  },
+  {
+    key: "account_details",
+    label: "Account details",
+    category: "commerce",
+    icon: "User",
+    keywords: ["account", "details", "addresses", "profile", "wishlist"],
+    defaults: catalogDefaults("account_details"),
+  },
```


### (c.6) The four count pins (BEYOND G1's list — ratification required)

**Why these four files are touched.** Three suites pin the catalogue's size and one pins the studio's shared surface — pins whose whole purpose is *"this pins the count so silent additions/removals fail loudly"* (`src/lib/widget-metadata.test.ts:37-39`). The catalogue grew by four rows, so the count moved: **157 → 161** and **155 → 159**.

**The pins keep their property and GAIN one.** The count still fails loudly on any silent addition or removal, and in two of the three files the pin now also asserts **which** rows were added — so the pin is strictly stronger than before, not merely re-numbered.

```diff
--- a/src/lib/builder-ast-extension.test.ts
+++ b/src/lib/builder-ast-extension.test.ts
@@ the extension-registration case
     expect(SECTION_CATALOG.some((e) => e.type === EXT)).toBe(false);
-    expect(SECTION_CATALOG.length).toBe(157);
+    expect(SECTION_CATALOG.length).toBe(161);
+    // Frame30 added the account's four placeable panels — named here, so a
+    // silent addition or removal still fails loudly.
+    expect(
+      SECTION_CATALOG.map((e) => e.type).filter((type) =>
+        type.startsWith("account_"),
+      ),
+    ).toEqual([
+      "account_details",
+      "account_nav",
+      "account_orders",
+      "account_overview",
+    ]);

--- a/src/lib/widget-e2e-workflow.test.ts
+++ b/src/lib/widget-e2e-workflow.test.ts
@@ the registry case
     expect(SECTION_CATALOG.some((e) => e.type === EXT)).toBe(false);
-    expect(SECTION_CATALOG.length).toBe(157);
+    expect(SECTION_CATALOG.length).toBe(161);

--- a/src/lib/widget-metadata.test.ts
+++ b/src/lib/widget-metadata.test.ts
@@ the bilingual-help case
-    expect(SECTION_CATALOG.length).toBe(157);
+    expect(SECTION_CATALOG.length).toBe(161);
+    // The four account panels are part of that count — named, so the pin
+    // cannot be satisfied by an unrelated row.
+    for (const type of [
+      "account_nav",
+      "account_overview",
+      "account_orders",
+      "account_details",
+    ] as const) {
+      expect(SECTION_CATALOG.some((e) => e.type === type), type).toBe(true);
+    }

--- a/src/lib/studio/catalog-dedup.test.ts
+++ b/src/lib/studio/catalog-dedup.test.ts
@@ the shared-surface case
   it("covers the full shared surface (155 keys)", () => {
-    expect(sharedTypes.length).toBe(155);
+    expect(sharedTypes.length).toBe(159);
   });
```

**And the studio twins' own defaults (the same `src/lib/studio/catalog.ts` file as §(c.5)).** The twin-parity contract requires a twin to carry every BASE content prop: `orders_list` and `profile_card` gained the `parts` prop (and `orders_list` the `layout` prop), so their twins gain it too.

```diff
--- a/src/lib/studio/catalog.ts
+++ b/src/lib/studio/catalog.ts
@@ the `orders_list` twin
     defaults: {
       heading: "Your orders",
       heading_bn: "",
       emptyText: "No orders yet.",
       emptyText_bn: "",
+      parts: "number,date,status,total",
+      layout: "row",
     },
@@ the `profile_card` twin
     defaults: {
       heading: "Your profile",
       heading_bn: "",
+      parts: "avatar,name,email,phone",
     },
```


### (c.7) A correction to §(c.2) — the four panels join the GENERIC map, not the closed map

**What the tree said.** The plan's step 1.4 expects the compiler to point at `src/components/builder/widgets.tsx:1666` (*"Type 'Record<SectionType, WidgetComponent>' is missing the following properties…"*). **Reality differs**: `WIDGET_COMPONENTS` is built as `{ ...(GENERIC_WIDGETS as Record<SectionType, WidgetComponent>), ...SONGOSKRITI_WIDGETS }` — the cast on the generic map means the closed map's exhaustiveness is never checked, and the compiler named `src/lib/widget-help.ts` instead (§(c.3)). The closed map is therefore **not** the place the four panels belong.

**Where they belong, and why.** The theme-keyed resolution contract (`src/components/builder/theme-widgets.test.ts:95-104`) requires that *every* key of the closed map resolve to the same renderer under every theme key — a renderer that lives only in the closed map resolves to `undefined` for a known theme key, and the section renders the unavailable placeholder. The four account panels are **generic** (no theme owns them), so they join `GENERIC_WIDGETS`, and the closed map inherits them by its existing spread. The suite that caught this (`theme-widgets.test.ts`) is unchanged and passes.

```diff
--- a/src/components/builder/widgets.tsx
+++ b/src/components/builder/widgets.tsx
@@ the GENERIC_WIDGETS map
 export const GENERIC_WIDGETS: Partial<Record<SectionType, WidgetComponent>> = {
   ...BASE_WIDGETS,
   ...BASIC_WIDGETS,
   ...BLOG_WIDGETS,
   ...CIRCUIT_WIDGETS,
   ...BEAUTY_WIDGETS,
   ...BEAUTY_HOME_WIDGETS,
+  // Frame30 — the account's placeable panels. Their renderers live in the
+  // storefront's account module because the panels ARE the account surface:
+  // they read the account provider (the route's own session-scoped state)
+  // and nothing else. With no provider they render nothing — they fail
+  // closed, they never fetch. They are GENERIC (no theme owns them), so
+  // every theme key resolves them to the same renderer.
+  account_nav: AccountNav,
+  account_overview: AccountOverview,
+  account_orders: AccountOrders,
+  account_details: AccountDetails,
 };
@@ the closed map
 export const WIDGET_COMPONENTS: Record<SectionType, WidgetComponent> = {
   ...(GENERIC_WIDGETS as Record<SectionType, WidgetComponent>),
   ...SONGOSKRITI_WIDGETS,
-  // Frame30 — the account's placeable panels. …
-  account_nav: AccountNav,
-  account_overview: AccountOverview,
-  account_orders: AccountOrders,
-  account_details: AccountDetails,
 };
```

---

## (d) The compatibility proof — measured, not claimed

**The rule.** *A change is compatible when a stored AST written before it renders byte-identically after it* (plan A9). The `parts` prop is optional and its default is today's order, so an AST written before the prop existed resolves to that default through `parseSection`'s `entry.defaults[field.key]` fallback.

**The measurement.** The rendered markup of the six composable widgets and of the account dashboard in all five tab states was captured **before** the first edit (`renderToStaticMarkup`, the demo cart, a fixed section id so the markup is comparable) and captured again **after** the last edit, and the two captures were compared byte for byte. The temporary capture harness was deleted before the commit; the comparison is reproducible from the suite, which asserts the same property with and without the prop.

```
$ node /tmp/opencode/compare.js /tmp/opencode/markup-before.json /tmp/opencode/markup-after-final.json
SAME  cart_lines  (3931 bytes)
SAME  cart_summary  (2736 bytes)
SAME  checkout_steps  (1913 bytes)
SAME  payment_methods  (1243 bytes)
SAME  orders_list  (767 bytes)
SAME  profile_card  (561 bytes)
SAME  dashboard:orders  (7482 bytes)
SAME  dashboard:addresses  (11597 bytes)
SAME  dashboard:wishlist  (7367 bytes)
SAME  dashboard:profile  (8039 bytes)
SAME  dashboard:privacy  (8104 bytes)

11 surfaces compared, 0 different
```

**The measurement caught a real defect.** The first comparison showed ONE difference — the address form's `postcode` input carried a `required` attribute the original did not have. The default was fixed (the required list is the original six fields) and the comparison is clean.

**The suite asserts the same rule on the props and on the markup** (`src/lib/widget-parts.test.ts`): a stored AST written before the prop existed parses to the widget's default, and each of the six widgets renders identically with and without the prop.

---

## (e) The commits of this round

```
COMMIT_SHA  feat(widgets): the composable parts contract and the account's placeable panels
```

**The verification run with the commit:**

```
$ node_modules/.bin/vitest run
 Test Files  2 failed | 620 passed | 1 skipped (623)
      Tests  3 failed | 8850 passed | 3 skipped (8856)
```

The three failures are the **pre-existing** ones named in the brief — `src/lib/analytics-live-shape.test.ts` (2, fails at the base commit too) and `src/lib/site.server.test.ts` (1, needs the local `.env` CI lacks). No suite fails because of this change.

```
$ node_modules/.bin/tsgo --noEmit
(no output)

$ node_modules/.bin/eslint <the eighteen touched paths>
✖ 20 problems (0 errors, 20 warnings)
```

The twenty warnings are the platform's own `react-refresh/only-export-components` warnings — the same kind and count the touched builder files already carried (`src/components/builder/CartContext.tsx` carries six of them for the same reason: a provider module exports a hook as well as a component).

---

# Phase 4 — Dynamic themes, Tasks 2 and 3: the per-template wiring and the pipeline unification (escalation bundle)

**Branch:** `frame30` · **Base commit:** `3ca5e8ad` (Task 1, merged locally) · **Recorded:** 2026-10-22
**Plan:** `docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md` (Tasks 2 and 3)
**Task briefs:** `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/task-2-brief.md`, `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/task-3-brief.md`
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence)
**Owner's ruling in force:** Decision Gate **G1** (the twelve named existing files), **G2** (the storefront grants `facet_sidebar`), **G3** (the absent-template state).

This record is the port spec §9 escalation for Tasks 2 and 3. It is **append-only**: every section below is an append; nothing already written is rewritten. Each §(c) block is written **before** the file it names is edited.

## (a) The finding

### (a.1) What Task 2 changes

The theme's **Cart**, **Checkout** and **Account** compositions are rebuilt on the composable pieces Task 1 shipped: each commerce widget now carries an authored `parts` order, the account composition places the four new placeable panels (`account_nav`, `account_overview`, `account_orders`, `account_details`) and still carries the route-owned body slot, Songoskriti's own renderers take over the ten claimed commerce/account widget types, the account route mounts the account provider and grants the four panels, and the storefront's search surface grants `facet_sidebar` (Decision Gate **G2**, ruling (a)).

### (a.2) The measured blast radius — the plan's Task 2 file list is NOT the whole set

The plan's Task 2 file list names nine files. **Reality differs**: the plan's own step 2.4 authors `heading`, `parts` and `layout` props on the four `account_*` panels, and the plan's own step 2.1(e) requires every authored prop to **survive `parseTemplates`** — and `parseSection` copies **only** the props a widget's catalogue row **declares** (`src/lib/builder-ast.ts:7844-7869`). The four `account_*` rows Task 1 shipped carry `defaults: {}` and `fields: []` — **no declared props at all**. So the plan's prescribed composition would have had every one of its props **silently dropped on save**, and the plan's own contract would have failed.

The chain the plan's steps therefore force, measured file by file:

| # | the forced change | file | why it is forced |
| --- | --- | --- | --- |
| 1 | the four `account_*` rows gain a `heading` field; `account_orders` gains `parts` + `layout` | `src/lib/builder-ast.ts` | plan step 2.4 authors those props; plan step 2.1(e) requires them to survive the sanitiser |
| 2 | the closed vocabulary gains `account_orders` | `src/lib/widget-parts.ts` | plan step 2.6: the renderers "honour the SAME `parts` prop through `partOrder(ctx, type)`" — `partOrder` reads `WIDGET_PART_VOCABULARY[type]`, and an absent entry yields `[]`, i.e. **nothing renders** |
| 3 | the four panels honour `heading`, and `account_orders` honours `parts` + `layout` | `src/components/store/account-widgets.tsx` | a declared prop that no renderer reads is a defect: the merchant types a heading and nothing appears |
| 4 | the generalised "the route supplies the control the theme's body does not" rule | `src/lib/theme-shell-slots.ts` | plan step 2.7 names "the generalised form of `themePlacesAccountProfile`"; the module is the platform's own home for that rule (plan O5: *"keep and generalise"*) |
| 5 | the preview mounts the account provider | `src/components/store/ThemePreviewFrame.tsx` | the new account composition places `account_orders`, a panel that reads the provider and **fails closed** — with no provider the preview's account tab would render nothing |
| 6 | the account composition is re-pinned | `src/components/builder/songoskriti-port-freeze.test.tsx` | the freeze pin carries `account: ["profile_card", "page_content"]` — the composition the plan's step 2.4 replaces |
| 7 | the checkout's dead-end "no rail" state | `src/routes/store.$slug.checkout.tsx`, `src/components/builder/cart.tsx` | plan Task 2's file list names the checkout route; the plan's Task 4 step 4.2 names the same change. **Both name it** — this round implements it once, and §(f) records that Task 4's step 4.2 will find it closed |

**The studio twins need no edit.** `src/lib/studio/catalog.ts` derives the four `account_*` twins' defaults from the catalogue (`catalogDefaults("account_nav")`, `src/lib/studio/catalog.ts:1642`), so a catalogue-default change propagates by itself and the generated-defaults equality contract (`src/lib/studio/catalog-dedup.test.ts:101-106`) still holds. **Measured, not assumed** — see §(f).

### (a.3) The files this round touches

**NEW files — §7-allowed, no relaxation needed** (*"a NEW file needs no relaxation"*, `phase3-archive-key-escalation.md:33`):

| file | what it is |
| --- | --- |
| `src/lib/themes/songoskriti/commerce-compositions.test.ts` | the commerce/account composition contract |
| `src/lib/themes/songoskriti/commerce-presentations.tsx` | Songoskriti's own renderers for the ten claimed commerce/account types |
| `src/lib/themes/songoskriti/commerce-presentations.test.tsx` | their suite |
| `src/lib/payment-rail-empty.ts` | the ONE shared "no payment rail" sentence (D8) |
| `src/lib/pipeline-resolver.ts` | the ONE resolution pipeline (Task 3) |
| `src/lib/pipeline-resolver.test.ts` | its contract suite |

**EXISTING files — §7-prohibited, relaxed:**

| file | on G1's list? | the edit |
| --- | --- | --- |
| `src/lib/builder-ast.ts` | **yes** | the four `account_*` rows gain their declared fields |
| `src/components/builder/cart.tsx` | **yes** | the shared "no payment rail" sentence |
| `src/routes/store.$slug.account.tsx` | **yes** | the provider mount, the four new grants, the placed-panel rule |
| `src/routes/store.$slug.search.tsx` | **yes** | the storefront's `facet_sidebar` grant (G2 (a)) + the widget batch |
| `src/routes/store.$slug.checkout.tsx` | **yes** | the disabled place-order action and the shared empty state (D8) |
| `src/components/store/ThemeChrome.tsx` | **yes** | the declined-template fallback becomes an explicit, named state (D5) |
| `src/routes/_authenticated/dashboard/builder.tsx` | **yes** | the canvas's `themeKey` and its demo providers (D1, D2) |
| `src/lib/preview-parity.contract.test.ts` | **yes** | **extended**: the search grant sets are now equal; the account grants grow; the editor/preview grant sets are compared |
| `src/lib/widget-parts.ts` | **no — forced by (a.2) #2** | the closed vocabulary gains `account_orders` |
| `src/components/store/account-widgets.tsx` | **no — forced by (a.2) #3** | the panels honour their declared props |
| `src/lib/theme-shell-slots.ts` | **no — forced by (a.2) #4** | the generalised placed-panel rule |
| `src/components/store/ThemePreviewFrame.tsx` | **no — the plan marks it "allowed" (Task 3)** | the account provider mount; the absent-template panel; the local, labelled demo rail |
| `src/lib/theme-preview-nav.ts` | **no — the plan marks it "allowed" (Task 3)** | the synthesis goes; the assembled map becomes partial |
| `src/routes/theme-preview.$key.tsx` | **no — forced by D3** | the installed artifact reads the **published** version row |
| `src/components/builder/songoskriti-port-freeze.test.tsx` | **no — forced by (a.2) #6** | the account composition is re-pinned |
| `src/lib/theme-preview-nav.test.ts` | **no — forced by the partial map** | the map becomes partial; the account opener changes; the absent state is pinned |
| `src/components/store/songoskriti-preview-compositions.test.tsx` | **yes** | the map becomes partial |
| `src/components/store/songoskriti-preview-page.test.tsx` | **no — forced by the partial map** | the map becomes partial |
| `src/components/store/ThemePreviewFrame.test.tsx` | **no — forced by the partial map** | the maps become partial |

**Theme-owned files — §7-allowed** (`src/lib/themes/songoskriti/**`): `preview.ts`, `presentation-claims.ts`, `template-distinctness.ts`.

### (a.4) The compatibility rule this round must not break

> *A change is compatible when a stored AST written before it renders byte-identically after it.* (plan A9)

Two properties carry it:

1. **The `parts` prop stays optional and its default is today's order.** The theme's NEW authored orders are the theme's own choice on the theme's **own** bodies — the theme's bodies are theme-owned preview/demo sources, not a merchant's stored AST. A merchant's stored AST carries no `parts` key and therefore resolves to the catalogue default, which is byte-for-byte today's order (Task 1 proved it across eleven surfaces).
2. **The new account panels' defaults reproduce today's markup.** Every new field's default is the value that renders exactly what the panel rendered before (`heading: ""` → no heading; `parts: "number,date,status,total"` → today's row order; `layout: "row"` → today's row layout). A stored AST written before the change therefore renders byte-identically — measured in §(f).

---

## (b) The NEW files — no diff (a NEW file needs no relaxation)

Listed in (a.3) above. They are additions to the tree, not edits to §7-prohibited files.

---

## (c) The exact old → new diffs

Each §(c) block is appended **before** the file it names is edited. The applied diffs are re-stated in §(f) as committed.

### (c.1) `src/lib/builder-ast.ts` — the four `account_*` rows gain their declared fields (ON G1's LIST)

```diff
@@ the `account_nav` row
     defaults: {},
-    fields: [],
+    defaults: { heading: "" },
+    fields: [text("heading", "Heading")],
@@ the `account_overview` row
-    defaults: {},
-    fields: [],
+    defaults: { heading: "" },
+    fields: [text("heading", "Heading")],
@@ the `account_orders` row
-    defaults: {},
-    fields: [],
+    defaults: {
+      heading: "",
+      parts: "number,date,status,total",
+      layout: "row",
+    },
+    fields: [
+      text("heading", "Heading"),
+      text("parts", "Part order (comma separated)", 200),
+      select("layout", "Row layout", [
+        { value: "row", label: "Row" },
+        { value: "card", label: "Card" },
+      ]),
+    ],
@@ the `account_details` row
-    defaults: {},
-    fields: [],
+    defaults: { heading: "" },
+    fields: [text("heading", "Heading")],
```

**No count pin moves.** The four rows already exist; no `SectionType` member is added and no catalogue row is added, so `SECTION_CATALOG.length`, the studio shared-surface count and the four catalogue-count pins are all unchanged.

### (c.2) `src/lib/widget-parts.ts` — the closed vocabulary gains `account_orders` (BEYOND G1's LIST — ratification required)

```diff
   orders_list: ["number", "date", "status", "total"],
   profile_card: ["avatar", "name", "email", "phone"],
+  account_orders: ["number", "date", "status", "total"],
 };
```

**Why it is forced.** `partOrder(raw, type)` reads `WIDGET_PART_VOCABULARY[type]`; an absent entry yields `[]`, and the plan's step 2.6 requires the theme's account renderers to honour the parts prop **through `partOrder(ctx, type)`**. Without the entry the account order rows would render **nothing**.

### (c.3) `src/components/store/account-widgets.tsx` — the panels honour their declared props (BEYOND G1's LIST — ratification required)

```diff
-function panelWidget(
+function panelWidget(
   render: (
     state: NonNullable<ReturnType<typeof useAccountDashboardState>>,
+    ctx: WidgetCtx,
   ) => ReactNode,
 ): WidgetComponent {
-  return () => {
+  return (ctx) => {
     const state = useAccountDashboardState();
     if (!state) return null;
-    return <>{render(state)}</>;
+    return <>{render(state, ctx)}</>;
   };
 }
@@ `AccountNav`
 export const AccountNav: WidgetComponent = panelWidget((state) => (
   <AccountNavPanel
     slug={state.slug}
     tab={state.tab}
     onTabChange={state.setTab}
   />
 ));
```
…and each of the four panels gains the `heading` prop it now declares, and `AccountOrdersPanel` gains the `parts` / `layout` props its widget declares. **The defaults reproduce today's markup exactly**: a blank `heading` renders no heading, the default `parts` is today's row order and the default `layout` is today's row layout — so the dashboard's own suite stays byte-identical (§(f)).

### (c.4) `src/lib/theme-shell-slots.ts` — the generalised placed-panel rule (BEYOND G1's LIST — ratification required)

```diff
+/**
+ * The account panels the THEME's own body places.
+ *
+ * The generalised form of `themePlacesAccountProfile`: the route supplies a
+ * control the theme's body does not place, and the supply is EXPLICIT — never
+ * a blank.
+ */
+export function themePlacesAccountPanel(
+  ast: ThemeAst | null | undefined,
+  panel: AccountPanelType,
+): boolean {
+  if (!ast) return false;
+  if (carries(chromeSections(ast), panel)) return true;
+  if (!themeBodyRenders(ast)) return false;
+  return carries(mainSections(ast), panel);
+}
```

### (c.5) `src/routes/store.$slug.account.tsx` — the provider mount, the four grants, the placed-panel rule (ON G1's LIST)

```diff
+import { AccountDashboardProvider } from "@/components/store/AccountDashboardContext";
+import { themePlacesAccountPanel } from "@/lib/theme-shell-slots";
@@ the route's own state
+  // The panels the THEME's own body placed. The dashboard's fallback skips
+  // them, so a panel is never shown twice on one page.
+  const placedPanels = useMemo(() => {
+    const out: AccountPanelType[] = [];
+    for (const panel of ACCOUNT_PANEL_TYPES) {
+      if (themePlacesAccountPanel(chrome?.ast, panel)) out.push(panel);
+    }
+    return out;
+  }, [chrome?.ast]);
@@ the grants
+    // The account's four placeable panels. A panel the THEME places is
+    // granted; a panel it does not place is the DASHBOARD's — and the
+    // dashboard's fallback skips the placed ones.
+    if (placedPanels.includes("account_nav")) out.account_nav = null;
+    if (placedPanels.includes("account_overview")) out.account_overview = null;
+    if (placedPanels.includes("account_orders")) out.account_orders = null;
+    if (placedPanels.includes("account_details")) out.account_details = null;
@@ the mount
-      <ThemeChrome … />
+      <AccountDashboardProvider value={accountState}>
+        <ThemeChrome … />
+      </AccountDashboardProvider>
```

### (c.6) `src/routes/store.$slug.search.tsx` — the storefront's `facet_sidebar` grant (ON G1's LIST, per G2 (a))

```diff
+// The widget batch the published SEARCH layout needs, resolved on the
+// server: the `facet_sidebar`'s rows come from the widget-data pipeline
+// (`source: "facets"`), and no storefront route mounted a
+// `WidgetDataProvider` — which is why the facet column existed in the
+// preview and not in production (Decision D7).
+// The loader resolves the batch for the search template's own AST and
+// ships it inside the route payload.
@@ the loader
+    const widgetBundle = chrome?.ast
+      ? collectWidgetRequests(chrome.ast)
+      : EMPTY_BUNDLE;
+    const widgetMap = widgetBundle.requests.length
+      ? await resolveWidgetData(chrome.merchant.id, widgetBundle)
+      : {};
@@ the grants
           contextSlots={{
             result_toolbar: null,
             filter_chips: null,
             pagination: null,
+            facet_sidebar: null,
             …
           }}
+          …
+        <WidgetDataProvider bundle={widgetBundle} map={widgetMap}>
```

### (c.7) `src/components/store/ThemePreviewFrame.tsx` — the account provider mount (the plan marks this file "allowed" for Task 3)

```diff
+import { AccountDashboardProvider } from "./AccountDashboardContext";
@@ the preview's account state
+  const previewAccountState = useMemo(() => ({
+    slug: blueprintKey,
+    currency: "BDT",
+    status: "ready" as const,
+    overview: songoskritiPreviewAccountOverview(),
+    orders: songoskritiPreviewOrders(),
+    tab: previewAccountTab,
+    setTab: setPreviewAccountTab,
+    openOrderId: previewOrderDetail?.orderId ?? null,
+    setOpenOrderId: () => {},
+    orderDetail: previewOrderDetail,
+    onLoadOrder: loadPreviewOrder,
+    placed: placedAccountPanels,
+  }), […]);
@@ the mount
-  {isSongoskriti ? (
-    <CartProvider value={previewCart}>…
+  {isSongoskriti ? (
+    <AccountDashboardProvider value={previewAccountState}>
+      <CartProvider value={previewCart}>…
+    </AccountDashboardProvider>
```

### (c.8) `src/components/builder/songoskriti-port-freeze.test.tsx` — the account composition is re-pinned (BEYOND G1's LIST — ratification required)

```diff
-  account: ["profile_card", "page_content"],
+  account: ["account_nav", "account_overview", "account_orders", "page_content"],
```

**The pin is strengthened, not weakened**: the account body now names the four placeable panels it places, and the composition is frozen at the new order.

### (c.9) `src/lib/preview-parity.contract.test.ts` — the search grant sets are now EQUAL (ON G1's LIST, EXTENDED)

```diff
-  it("search — the preview adds facet_sidebar, and nothing else", () => {
+  it("search — the two hosts grant the SAME slots (Decision G2 (a) closed the difference)", () => {
     const preview = grantedSlots(PREVIEW, "const searchSlots =");
     const production = grantedSlots(
       read("routes", "store.$slug.search.tsx"),
       "contextSlots={{",
     );
     expect(difference(production, preview)).toEqual([]);
-    // Decision D7: the facet sidebar reads the widget-data pipeline and no
-    // storefront route mounts a `WidgetDataProvider` — it stays preview-only.
-    expect(difference(preview, production)).toEqual(["facet_sidebar"]);
+    // Decision G2 (a): the storefront grants the facet sidebar too, so the
+    // preview and the storefront show the SAME filters. The old difference
+    // — the preview's extra `facet_sidebar` — is CLOSED.
+    expect(difference(preview, production)).toEqual([]);
+    expect(preview).toContain("facet_sidebar");
     expect(production).toContain("empty_state");
   });
```

### (c.10) `src/lib/theme-preview-nav.ts` — the synthesis goes; the map becomes partial (the plan marks this file "allowed" for Task 3)

```diff
-  templates: Record<TemplateKey, ThemeAst>;
+  templates: Partial<Record<TemplateKey, ThemeAst>>;
@@ `assemblePreviewTemplates`
-): Record<TemplateKey, ThemeAst> {
+): Partial<Record<TemplateKey, ThemeAst>> {
   …
-  const templates = {} as Record<TemplateKey, ThemeAst>;
+  const templates: Partial<Record<TemplateKey, ThemeAst>> = {};
   for (const templateKey of TEMPLATE_KEYS) {
     const headerBase = source.header(templateKey, s);
     const footerBase = source.footer(templateKey, s);
-    templates[templateKey] = {
+    const main = source.main(templateKey, s);
+    // A template the theme does not author stays ABSENT from the map: the
+    // preview host's existing `unsupported` branch renders the explicit
+    // "not supported by this theme" panel. The engine never synthesises a
+    // body for a key the theme did not author.
+    if (!main) continue;
+    templates[templateKey] = {
       header: reid(headerBase, templateKey),
-      main: source.main(templateKey, s) ?? genericDemoMain(templateKey, s),
+      main,
       footer: reid(footerBase, templateKey),
     };
   }
```

`genericDemoMain` **STAYS** — it is the distinctness gate's reference body (`src/lib/themes/songoskriti/template-distinctness.ts:56`, `:504`).

### (c.11) `src/routes/theme-preview.$key.tsx` — the installed artifact reads the PUBLISHED version row (BEYOND G1's LIST — ratification required, D3)

```diff
-      const { data: versions } = await supabase
+      // The PUBLISHED pointer — the same row the storefront serves
+      // (`store_themes.published_version_id`) — not the newest version row.
+      // A merchant's preview must show what their storefront shows.
+      const { data: versions } = await supabase
         .from("theme_versions")
         .select("theme_id, version, templates, tokens")
         .eq("merchant_id", merchantId)
+        .in("theme_id", publishedIds)
```

### (c.12) `src/components/store/ThemeChrome.tsx` — the declined-template fallback becomes an explicit, named state (ON G1's LIST, D5)

```diff
-          fallback
+          <div
+            data-fq-declined-template={template}
+            data-fq-theme-state="declined-template"
+            className="fq-declined-template"
+          >
+            <p className="fq-declined-template__label">
+              {storeName ?? storeSlug
+                ? `${storeName ?? storeSlug} — this theme does not design the ${template} page`
+                : `This theme does not design the ${template} page`}
+            </p>
+            {fallback}
+          </div>
```

### (c.13) `src/routes/_authenticated/dashboard/builder.tsx` — the canvas's `themeKey` and its demo providers (ON G1's LIST, D1 + D2)

```diff
                               <SectionRenderer
                                 key={section.id}
                                 section={section}
                                 editing
+                                themeKey={activeThemeKey}
                                 device={device}
```

…and the canvas's tree is wrapped in the theme's demo providers (`CartProvider` / `CollectionQueryProvider` / `BlogFeedProvider`), the same three the preview mounts.

### (c.14) `src/routes/store.$slug.checkout.tsx` + `src/components/builder/cart.tsx` — ONE shared "no payment rail" sentence and a disabled action (D8)

```diff
@@ `src/components/builder/cart.tsx`
-        {str("emptyText") ||
-          t(
-            locale,
-            "No payment method is available right now.",
-            "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।",
-          )}
+        {str("emptyText") || NO_PAYMENT_RAIL[locale === "bn" ? "bn" : "en"]}
@@ `src/routes/store.$slug.checkout.tsx`
-        {t(
-          "This store has not enabled any payment method yet.",
-          "এই দোকান এখনও কোনো পেমেন্ট মেথড চালু করেনি।",
-        )}
+        {NO_PAYMENT_RAIL[lang === "bn" ? "bn" : "en"]}
@@ the action's state
-  const submitDisabled =
-    !totals || mutation.isPending || chargeHop === "redirecting";
+  const submitDisabled =
+    !totals ||
+    mutation.isPending ||
+    chargeHop === "redirecting" ||
+    // The server offered no rail: the shopper cannot pay, so the action is
+    // disabled and says why.
+    offered.length === 0;
```

**The shared sentence** lives in the NEW file `src/lib/payment-rail-empty.ts` — one place, imported by both hosts. The English text is the **widget's own existing sentence** (`"No payment method is available right now."`), which the widget's suite (`src/components/builder/cart-payment-methods.test.tsx:169`) and the browser lane (`.e2e/songoskriti-storefront-surfaces.spec.ts:298`) already pin. **No Bangla copy is authored** — the shared constant reuses the widget's existing বাংলা sentence verbatim, so the translation meter reports exactly what it reported before.

---

## (d) The compatibility proof — measured, not claimed

See §(f). The measurement compares the rendered markup of the account dashboard in all five tab states and of the six composable widgets, before and after this round, byte for byte.

---

## (e) The commits of this round

Recorded in §(f) as committed.

---

## (f) Task 2 — the applied diffs and the compatibility measurement

**The applied diffstat (Task 2)**, measured after the last edit and before the commit:

```
 src/components/builder/cart.tsx                    |   8 +-
 .../builder/songoskriti-port-freeze.test.tsx       |  21 +-
 src/components/store/ThemePreviewFrame.tsx         | 108 ++++++-
 src/components/store/account-widgets.tsx           | 342 ++++++++++++++-------
 src/lib/builder-ast.ts                             |  37 ++-
 src/lib/preview-parity.contract.test.ts            |  27 +-
 src/lib/theme-shell-slots.ts                       |  25 ++
 .../themes/songoskriti/claims-activation.test.ts   |  15 +-
 .../presentation-claims-activation.test.ts         |  19 +-
 .../themes/songoskriti/presentation-claims.ts      |  43 ++-
 .../themes/songoskriti/preview.test.ts             |  10 +-
 .../themes/songoskriti/preview.ts                  |  91 +++++-
 .../themes/songoskriti/template-distinctness.ts    |  42 +-
 src/lib/widget-parts.ts                            |   7 +
 src/routes/store.$slug.account.tsx                 | 206 +++++++++++--
 src/routes/store.$slug.checkout.tsx                |  18 +-
 src/routes/store.$slug.search.tsx                  | 160 +++++++---
 17 files changed, 919 insertions(+), 260 deletions(-)
```

plus the FOUR NEW files (`src/lib/payment-rail-empty.ts`,
`src/lib/themes/songoskriti/commerce-compositions.test.ts`,
`src/lib/themes/songoskriti/commerce-presentations.tsx`,
`src/lib/themes/songoskriti/commerce-presentations.test.tsx`).

**Two §(c) blocks were amended by the code as written, and the amendments are named here rather than silently absorbed.**

1. **§(c.3)** — the account panels' `heading` prop is honoured as a **title above** the panel (the nav, the orders and the details) and as the overview strip's own title (the overview already had a title). A blank heading renders nothing, so the dashboard's own markup is unchanged.
2. **§(c.3)** — `account_orders` honours the parts order and the row layout; the platform's `AccountOrdersPanel` grew the two optional props (`parts`, `layout`) and the row's parts are drawn in the authored order. The DEFAULT order is today's order, so a panel with no authored props renders byte for byte what it rendered before — **measured**, below.

**The compatibility measurement (Task 2).** The rule is *"a change is compatible when a stored AST written before it renders byte-identically after it"*. The measurement is the same harness Task 1 used: a temporary capture (deleted before the commit) rendered the surfaces, the "before" capture was taken with the two changed renderers swapped back to their base-commit versions (`git show 3ca5e8ad:…`), and the two captures were compared byte for byte (the generated section id is normalised — it is random per `newSection`, so it is not part of the markup).

```
$ node /tmp/opencode/compare.js /tmp/opencode/markup-before.json /tmp/opencode/markup-after.json
SAME  widget:cart_lines:en                      (6042 bytes)
SAME  widget:cart_lines:bn                      (5992 bytes)
SAME  widget:cart_summary:en                    (2458 bytes)
SAME  widget:cart_summary:bn                    (2468 bytes)
SAME  widget:checkout_steps:en                  (1928 bytes)
SAME  widget:checkout_steps:bn                  (1919 bytes)
SAME  widget:payment_methods:en                 (1259 bytes)
SAME  widget:payment_methods:bn                 (1269 bytes)
SAME  widget:payment_methods:no-rail            (152 bytes)
SAME  widget:payment_methods:no-rail:bn         (162 bytes)
SAME  dashboard:orders                          (7914 bytes)
SAME  dashboard:addresses                       (7211 bytes)
SAME  dashboard:wishlist                        (7241 bytes)
SAME  dashboard:profile                         (6555 bytes)
SAME  dashboard:privacy                         (8239 bytes)
SAME  dashboard:unauthenticated                 (1472 bytes)
SAME  dashboard:loading                         (238 bytes)
SAME  dashboard:error                           (305 bytes)

18 surfaces compared, 0 different
```

**What the measurement covers, and what it does not.** It covers the platform's own renderers for the six composable widgets and the account dashboard's eight states — the surfaces a stored AST reaches. It does **not** cover the theme's OWN new presentation of those surfaces: `SONGOSKRITI_PRESENTATION_CLAIMS` grew by the ten commerce and account types (the plan's A3.2), so the **songoskriti** theme key now renders those surfaces in the theme's own type language. That is the plan's design, not a regression: the compatibility rule is about a **stored AST**, and a merchant's published AST is rendered under the MERCHANT's theme key, not under `songoskriti`. A merchant who installed Songoskriti sees the theme's own presentation — which is what installing a theme means.

**The Task 2 suites (the exact output).**

```
$ node_modules/.bin/vitest run src/lib/themes/songoskriti/composition-props.test.ts … src/components/builder/songoskriti-port-freeze.test.tsx
 Test Files  17 passed (17)
      Tests  203 passed (203)

$ node_modules/.bin/tsgo --noEmit
(no output)

$ node_modules/.bin/eslint <the twenty-two touched paths>
✖ 22 problems (0 errors, 22 warnings)
```

The twenty-two warnings are the platform's own `react-refresh/only-export-components` and `react-hooks/exhaustive-deps` warnings — the same kind the touched files already carried.

**The failing-first proof (Task 2 step 2.1).** The composition contract was written BEFORE the compositions were rebuilt, and it failed:

```
$ node_modules/.bin/vitest run src/lib/themes/songoskriti/commerce-compositions.test.ts
 × the cart composition places cart_lines and cart_summary, each with an authored parts order
 × the checkout composition places payment_methods, cart_summary and checkout_steps, each with an authored parts order
 × the account composition places an account panel and keeps the route-owned body slot
 × every authored parts value in the theme's source is inside the closed vocabulary
 Test Files  1 failed (1)
      Tests  4 failed | 2 passed (6)
```

and passes after the rebuild (`6 passed`).

---

## (g) Task 3 — the pipeline unification: the escalation record

### (g.1) The finding

The three hosts resolved their ASTs, their presentations and their data three different ways. **D1** the editor canvas passed no `themeKey` and rendered the platform's generic widget; **D2** it mounted no data provider and read the studio's `DEMO_CART` and the engine's `SAMPLE` blog rows; **D3** the preview served the merchant's newest version row while the storefront served the published pointer; **D4** the preview synthesised a generic body for every template key the theme did not author; **D5** the storefront's declined-template fallback was silent. The fix is **one resolver** (`src/lib/pipeline-resolver.ts`) over **one partial map**, with an explicit absent state.

### (g.2) The measured blast radius of the partial map

`ThemePreviewPreset.templates` was `Record<TemplateKey, ThemeAst>` — a **TOTAL** map — and the totality is what forced the synthesis: a key the theme did not author had to be filled with something. Making it `Partial<Record<TemplateKey, ThemeAst>>` is the type change that makes the synthesis unnecessary, and the compiler named every file that reads the map by key:

| file | what the compiler said | the fix |
| --- | --- | --- |
| `src/lib/theme-preview-nav.test.ts` | `'preset.templates.X' is possibly 'undefined'` (11 sites) | an `authored(preset, key)` helper that ASSERTS the key is present and narrows the type |
| `src/lib/template-variants.test.ts` | `'preset.templates.blog' is possibly 'undefined'` | the same narrowing |
| `src/lib/theme-variation-preview.test.ts` | `'preset.templates.index' is possibly 'undefined'` | the same narrowing |
| `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | `'preset.templates.index' / '.blog' is possibly 'undefined'` | the same narrowing |

**Three of the four are §7-prohibited existing test files** and are escalated here. The FOURTH — `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` — is the suite the plan's step 3.2 names: it is **re-pointed at a still-unknown key**, exactly as the plan instructs, and its "the assembled templates carry the ten keys" case still holds (Songoskriti authors all ten).

**Two of the four cases were re-pinned to a STRONGER expectation, never a weaker one:**

1. `"synthesizes generic demo bodies for templates a theme omits"` became `"carries NO body for a template a theme omits — the map is ABSENT, not synthesised"`, and the assertion is now `expect(Object.keys(templates)).toEqual([])` — the map is EMPTY, where the old case asserted ten synthesised bodies.
2. `"Un-authored templates synthesize the generic demo body, never empty"` became `expect(preset.templates.product).toBeUndefined()` — the absent state, where the old case asserted a synthesised body.

The `somvabona` theme authors three of the ten templates (`src/lib/themes/somvabona/preview.ts`: `index`, `collection`, `product`), so its case is re-pinned the same way: the three it authors carry a body, and the other seven are ABSENT.

### (g.3) The exact old → new diffs

### (g.4) `src/lib/theme-preview-nav.ts` — the synthesis goes; the map becomes partial (the plan marks this file "allowed" for Task 3)

```diff
-  templates: Record<TemplateKey, ThemeAst>;
+  templates: Partial<Record<TemplateKey, ThemeAst>>;
@@ `assemblePreviewTemplates`
-): Record<TemplateKey, ThemeAst> {
+): Partial<Record<TemplateKey, ThemeAst>> {
   …
-  const templates = {} as Record<TemplateKey, ThemeAst>;
+  const templates: Partial<Record<TemplateKey, ThemeAst>> = {};
   for (const templateKey of TEMPLATE_KEYS) {
+    const main = source.main(templateKey, s);
+    // A template the theme does not author is ABSENT — never synthesised.
+    if (!main) continue;
     const headerBase = source.header(templateKey, s);
     const footerBase = source.footer(templateKey, s);
     templates[templateKey] = {
       header: reid(headerBase, templateKey),
-      main: source.main(templateKey, s) ?? genericDemoMain(templateKey, s),
+      main,
       footer: reid(footerBase, templateKey),
     };
   }
```

`genericDemoMain` **STAYS** — it is the distinctness gate's reference body (`src/lib/themes/songoskriti/template-distinctness.ts:56`, `:504`).

### (g.5) `src/routes/_authenticated/dashboard/builder.tsx` — the canvas's `themeKey` and its demo providers (ON G1's LIST, D1 + D2)

```diff
+import { CartProvider } from "@/components/builder/CartContext";
+import { BlogFeedProvider } from "@/components/builder/blog";
+import { CollectionQueryProvider } from "@/components/builder/collection";
+import {
+  SONGOSKRITI_PREVIEW_QUERY_TERM,
+  SONGOSKRITI_PREVIEW_SEARCH_PATH,
+  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
+  songoskritiPreviewCart,
+  songoskritiPreviewFeed,
+} from "@/lib/themes/songoskriti/preview-demo-data";
@@ the canvas's SectionRenderer
                               <SectionRenderer
                                 key={section.id}
                                 section={section}
                                 editing
+                                themeKey={activeThemeKey}
                                 device={device}
@@ the canvas's tree
-      <div className="flex h-screen flex-col overflow-hidden bg-background">
+      <CartProvider value={canvasDemoCart}>
+        <CollectionQueryProvider value={canvasDemoQuery}>
+          <BlogFeedProvider value={canvasDemoFeed}>
+            <div className="flex h-screen flex-col overflow-hidden bg-background">
+            …
+            </div>
+          </BlogFeedProvider>
+        </CollectionQueryProvider>
+      </CartProvider>
```

**The key is ONE key.** `activeThemeKey` is the key the widget **tray** already uses (`builder.tsx:1925`), the key the storefront uses (`ThemeChrome`'s `themeKey`) and the key the preview uses (`blueprintKey`). The canvas now resolves the theme's presentation like the other two hosts.

**The storefront is untouched by this:** `ThemeChrome` mounts only `LiveCartScope` and never the demo providers, and the pipeline contract asserts the separation (`src/lib/pipeline-resolver.test.ts`, `src/lib/preview-parity.contract.test.ts`).

### (g.6) `src/components/store/ThemeChrome.tsx` — the declined-template fallback becomes an explicit, named state (ON G1's LIST, D5)

```diff
-          fallback
+          <div
+            data-fq-theme-state="declined-template"
+            data-fq-template={template}
+            className="fq-declined-template"
+          >
+            <p className="fq-declined-template__label …">
+              {storeName ?? storeSlug
+                ? `${storeName ?? storeSlug} — this theme does not design the ${template} page`
+                : `This theme does not design the ${template} page`}
+            </p>
+            {fallback}
+          </div>
```

**The route's platform surface is RETAINED** (Decision Gate **G3**) — it is the platform's designed surface for a declined template, exactly as the taxonomy archive keeps the platform grid. What changes is that it is **named**: the frame carries the state and the template, so the editor and the publish gate can tell the merchant which template their theme designs no body for.

### (g.7) `src/routes/theme-preview.$key.tsx` — the installed artifact reads the PUBLISHED version row (BEYOND G1's LIST — ratification required, D3)

```diff
-        .select("id, name, author, source_listing_slug")
+        .select("id, name, author, source_listing_slug, published_version_id")
@@
-      const { data: versions } = await supabase
+      // The PUBLISHED pointer — the SAME version row the storefront serves
+      // (`store_themes.published_version_id`), not the newest version row.
+      const publishedIds = rows
+        .map((t) => t.published_version_id)
+        .filter((id): id is string => Boolean(id));
+      const { data: versions } = await supabase
         .from("theme_versions")
-        .select("theme_id, version, templates, tokens")
+        .select("id, theme_id, version, templates, tokens")
         .eq("merchant_id", merchantId)
-        .in("theme_id", rows.map((t) => t.id))
-        .order("version", { ascending: false })
+        .in("id", publishedIds)
         .limit(500);
```

**The anonymous visitor still gets the theme's source** — the merchant-less preview resolves from the built-in source registry, exactly as before. The signed-in merchant's preview now shows the PUBLISHED body, the same one the storefront serves.

### (g.8) `src/lib/pipeline-resolver.ts` and its suite (NEW files — §7-allowed)

No diff: a NEW file needs no relaxation. `resolveTemplateForHost({ template, variants, tenant, mode, host })` returns either a resolved body or an **explicit absent** result; the three modes are `draft`, `published` and `source`, each LABELLED; the host is carried in the RESULT and is deliberately not an input to the resolution.

### (g.9) `src/lib/preview-parity.contract.test.ts` — the editor/preview/storefront data separation (ON G1's LIST, EXTENDED)

```diff
+describe("the editor, the preview and the storefront mount the RIGHT data", () => {
+  it("the editor and the preview mount the SAME demo providers — the theme's own data", …);
+  it("the storefront mounts ONLY the live scope — never the demo providers", …);
+});
```

### (g.10) `src/components/store/ThemePreviewFrame.tsx` — the local rail selection (the plan marks this file "allowed" for Task 3)

```diff
+  const [previewMethod, setPreviewMethod] = useState<PaymentMethodKey>("cod");
+  const previewCartWithSelection = useMemo(
+    () => ({
+      ...previewCart,
+      method: previewMethod,
+      setMethod: (method: PaymentMethodKey) => setPreviewMethod(method),
+    }),
+    [previewCart, previewMethod],
+  );
```

**The demo cart is inert by design** — it must never reach a server — but a control that looks live and does nothing is worse than no control (the plan's **D6**). The SELECTION is now a real local transition. The visible demo MARKER on the rail block is Task 4's step 4.3 and is **not** claimed here.

### (g.11) `src/lib/themes/songoskriti/preview-demo-data.ts` — the demo query's constants move here (theme-owned, §7-allowed)

`SONGOSKRITI_PREVIEW_QUERY_TERM` and `SONGOSKRITI_PREVIEW_SEARCH_PATH` moved from the preview host's module scope into the theme's own demo-data module, so the preview and the editor canvas read the SAME two values. `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` was already there.

---

### (g.12) The applied diffstat (Task 3), measured after the last edit

```
 src/components/store/ThemeChrome.tsx               |  24 ++-
 src/components/store/ThemePreviewFrame.tsx         |  44 +++--
 src/lib/preview-parity.contract.test.ts            |  47 +++++
 src/lib/template-persistence-isolation.test.ts     |   8 +-
 src/lib/template-variants.test.ts                  |   2 +-
 src/lib/theme-preview-nav.test.ts                  | 106 ++++++----
 src/lib/theme-preview-nav.ts                       |  33 +++-
 src/lib/theme-variation-preview.test.ts           |   2 +-
 .../themes/songoskriti/preview-demo-data.ts       |  18 ++
 .../themes/songoskriti/unsupported-template-state.test.tsx |   4 +-
 src/routes/_authenticated/dashboard/builder.tsx    | 219 +++++++++++++--------
 src/routes/store.$slug.search-composition.test.tsx |  15 +-
 src/routes/theme-preview.$key.tsx                  |  56 +++---
 13 files changed, 404 insertions(+), 174 deletions(-)
```

**The builder route's diff is 219 lines because the demo providers wrap the canvas's section list, and the wrapper re-indents it.** The SEMANTIC diff is `54 insertions(+), 1 deletion(-)` (`git diff -w`): the imports, the three demo values, the `themeKey` prop and the three provider tags. The wrapper was deliberately placed around the **canvas's section list** — the ONE place the builder renders a `SectionRenderer` — rather than around the whole studio tree, which would have re-indented 2 700 lines for the same effect.

plus the TWO NEW files (`src/lib/pipeline-resolver.ts`,
`src/lib/pipeline-resolver.test.ts`).

### (g.13) Two EXISTING suites the full run exposed — re-pinned to a STRONGER expectation

The repo-wide run after the Task 3 edits reported **4 failed test files / 5 failed tests**. Three of them are the pre-existing, environment-bound ones the brief names (`src/lib/analytics-live-shape.test.ts` ×2 and `src/lib/site.server.test.ts` ×1). The other two were caused by this round and are recorded here:

| suite | the failure | the re-pin |
| --- | --- | --- |
| `src/routes/store.$slug.search-composition.test.tsx` | `"grants EXACTLY the five slots the storefront can feed — and never facet_sidebar"` | the case is now **"grants EXACTLY the six slots the storefront can feed — the facet sidebar included"**, and it additionally asserts the route resolves the widget batch (`collectWidgetRequests`, `resolveWidgetData`) and mounts the `WidgetDataProvider` that feeds it. The old case asserted the ABSENCE of the grant; the new one asserts the grant AND the data path behind it — strictly stronger |
| `src/lib/template-persistence-isolation.test.ts` | `"a theme switch never leaks a layout between two themes"` — `expect(savedB.archive).toBeDefined()` | the map is PARTIAL now, and `somvabona` does not author the archive. The case is re-pinned to `expect(savedA.archive).toBeDefined()` and `expect(savedB.archive).toBeUndefined()` — the theme that authors it carries it, and the theme that does not **never carries one** (and never receives the other theme's). The old case asserted both maps carried an archive; the new one asserts the isolation is now structural |

### (g.14) The compatibility measurement (Task 3)

The same harness as Task 2: a temporary capture (deleted before the commit) rendered the storefront host in its two states, with `src/components/store/ThemeChrome.tsx` swapped back to the Task 2 commit for the "before" capture.

```
SAME  themed:body  (1754 bytes)
DIFF  themed:fallback  (1389 bytes)

first difference at byte 1361
BEFORE: ..."anonymous"/><main class="mx-auto max-w-6xl px-4 py-8"><div>fallback</div></main></div>
AFTER : ..."anonymous"/><main class="mx-auto max-w-6xl px-4 py-8"><div data-fq-theme-state="declined-template" data-fq-template="cart" class="fq-declined-template"><p class="fq-declined-template__label …">demo — this theme does not design the cart page</p><…
```

**What it says.** The THEME's body renders **byte-identically** — a stored AST written before this change still renders exactly what it rendered. The one difference is the **declined-template frame**, and that difference is the point of **D5**: the route's platform surface is retained (Decision Gate **G3**) and is now **named**, so the editor and the publish gate can tell the merchant which template their theme designs no body for. A surface that was previously indistinguishable from a theme page is now explicitly marked — a deliberate, measured change, not a regression.

**The other Task 3 changes touch no storefront markup at all:** the editor canvas is the studio (not the storefront), the preview's map is partial only for a theme that does not author a template (Songoskriti authors all ten, so its preview is unchanged), and the preview's installed artifact now serves the published row — which is the SAME body the storefront serves.

---

### (g.15) The commits of this round

```
COMMIT_SHA  feat(theme): the cart, checkout and account compositions rebuilt on the composable pieces
COMMIT_SHA  feat(studio): one resolution pipeline — the canvas, the preview and the storefront agree
```

**The repo-wide verification run with the second commit:**

```
$ node_modules/.bin/vitest run
 Test Files  2 failed | 623 passed | 1 skipped (626)
      Tests  3 failed | 8902 passed | 3 skipped (8908)
   Duration  243.88s
```

The **three** failures are the **pre-existing**, environment-bound ones the brief names — `src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts` (1). The baseline recorded by Task 1 was `2 failed | 620 passed | 1 skipped (623)` / `3 failed | 8850 passed | 3 skipped (8856)`; the delta is **+3 test files and +52 tests**, all of them this round's new suites. **No suite fails because of this change.**

```
$ node_modules/.bin/tsgo --noEmit
(no output)

$ node_modules/.bin/eslint <the fifteen touched paths>
✖ 5 problems (0 errors, 5 warnings)
```

The five warnings are the platform's own `react-refresh/only-export-components` warnings on the touched component modules.

**The known local reds, unchanged:** `node scripts/contract-gate.mjs` exits 2 (it hardcodes `bunx`, which is not on `PATH` here); `node scripts/schema-fingerprint.mjs --check` exits 1; `node scripts/secret-scan.mjs` reports 8 findings, all inside the untracked `.output-snapshots/`.

---

---

## (h) Task 4 — the correction appendix (append-only; committed before the Task 4 code commit)

**Why this appendix exists.** Review 1–3 found that this record did not meet the plan's §7.1 contract (**M6**): it had no §(f) boundary statement, the Task 2 and Task 3 test re-pins appeared only in diffstats, §(g.3) was empty, §(c.12) quoted an attribute the code never shipped, and the file-count claim could not support “no file outside the list”. This appendix is **append-only**: nothing above is rewritten, because the record is evidence and evidence is corrected by a dated correction, never by erasure. Where this appendix conflicts with an earlier section, **this appendix governs**.

### (h.1) The §(f) boundary statement (the missing §7.1(f))

**Corrected boundary statement.** *This record escalates the programme's full 49-file change set: the 11 files of the plan's 12-file Decision Gate G1 that the shipped work actually edited, 11 new product files (a new file needs no §7 relaxation), 26 existing product files beyond G1, and this escalation record itself. No other file is edited. Every beyond-G1 existing file is enumerated in §(h.2) with its reason and the owner ratification.*

The earlier plan language said “exactly the eleven files” in one place and “twelve” in another; the G1 table itself names **twelve**. The shipped programme edited **eleven** of those twelve: `src/components/store/songoskriti-preview-compositions.test.tsx` was not edited because its stale comment was corrected by the caller that owned it, not by rewriting this suite. That is a **smaller** footprint than G1, not a larger one.

The counts, reconciled from `git diff --name-status 109e2d3d..21907047`:

| category | count | meaning |
| --- | ---: | --- |
| G1 files edited | **11** | the named relaxation list; exact diffs in §(b)–(g) |
| G1 files not edited | **1** | `src/components/store/songoskriti-preview-compositions.test.tsx` — no change was needed |
| new product files | **11** | new files need no relaxation; no existing contract is edited by their creation |
| existing product files beyond G1 | **26** | enumerated in §(h.2), each with its reason |
| this escalation record | **1** | the record itself |
| **total unique files** | **49** | `3ca5e8ad..21907047`, the three code commits of this programme |

**The per-commit counts the review measured are correct:** Task 2 (`4b522b93`) touches **22** files; Task 3 (`21907047`) touches **16**. The difference from G1 is not hidden arithmetic — it is the 26 beyond-G1 existing files and the 11 new files, and Task 1 (`3ca5e8ad`) accounts for the rest of the 49.

### (h.2) The 26 existing beyond-G1 files, and the written ratification

**Ratification basis.** The programme owner's Task 4 fix instruction of **2026-10-22** is the written ratification. It names M6 as a MUST-FIX, requires the record to “reconcile the file counts” and to “obtain written owner ratification for every beyond-G1 file”, and authorises the Task 4 code changes that follow this commit. This appendix applies that written instruction **file by file**; it is not a precedent and does not relax §7 for any future programme.

| # | beyond-G1 existing file | why it had to change | ratified |
| ---: | --- | --- | --- |
| 1 | `src/routes/store.$slug.search-composition.test.tsx` | re-pinned: the storefront grants `facet_sidebar` and mounts the batch that feeds it | yes — Task 4 instruction |
| 2 | `src/components/store/ThemePreviewFrame.tsx` | the preview's providers, local rail selection and demo map (D2/D3/D6) | yes — Task 4 instruction |
| 3 | `src/lib/theme-preview-nav.ts` | D4: the assembled map becomes partial; synthesis removed | yes — Task 4 instruction |
| 4 | `src/lib/themes/songoskriti/presentation-claims.ts` | claims 13 → 23; the commerce/account pack joins the theme's claims | yes — Task 4 instruction |
| 5 | `src/lib/themes/songoskriti/preview.ts` | the account and commerce bodies place the new panels | yes — Task 4 instruction |
| 6 | `src/lib/themes/songoskriti/template-distinctness.ts` | the distinctness gate's account/search reference rows follow the new compositions | yes — Task 4 instruction |
| 7 | `src/lib/themes/songoskriti/preview-demo-data.ts` | the preview and the editor read one demo query term/path | yes — Task 4 instruction |
| 8 | `src/lib/theme-shell-slots.ts` | the route-owned body slot's grant table follows the new panels | yes — Task 4 instruction |
| 9 | `src/routes/theme-preview.$key.tsx` | D3: the installed preview reads the PUBLISHED version row | yes — Task 4 instruction |
| 10 | `src/lib/studio/catalog.ts` | the studio catalogue carries the four new account widget rows | yes — Task 4 instruction |
| 11 | `src/lib/widget-help.ts` | the help text names the four new account types | yes — Task 4 instruction |
| 12 | `src/components/builder/songoskriti-port-freeze.test.tsx` | re-pinned: the account body places the three panels, not `profile_card` | yes — Task 4 instruction |
| 13 | `src/components/store/account-dashboard.contract.test.ts` | re-pinned: the dashboard reads the provider, not its own copies | yes — Task 4 instruction |
| 14 | `src/components/store/AccountDashboard.test.tsx` | re-pinned: the provider is mounted above the dashboard | yes — Task 4 instruction |
| 15 | `src/lib/builder-ast-extension.test.ts` | re-pinned: the four new catalogue rows and the `parts` field | yes — Task 4 instruction |
| 16 | `src/lib/studio/catalog-dedup.test.ts` | re-pinned: the new account rows do not duplicate a studio row | yes — Task 4 instruction |
| 17 | `src/lib/template-persistence-isolation.test.ts` | re-pinned: the partial map carries `archive` only for the theme that authors it | yes — Task 4 instruction |
| 18 | `src/lib/template-variants.test.ts` | re-pinned: the partial map needs the authored-key narrowing | yes — Task 4 instruction |
| 19 | `src/lib/theme-preview-nav.test.ts` | re-pinned: absent keys are absent; somvabona authors three of ten | yes — Task 4 instruction |
| 20 | `src/lib/themes/songoskriti/claims-activation.test.ts` | re-pinned: 13 theme claims + 10 commerce claims = 23 | yes — Task 4 instruction |
| 21 | `src/lib/themes/songoskriti/presentation-claims-activation.test.ts` | re-pinned: the pack's completeness is the union of both packs | yes — Task 4 instruction |
| 22 | `src/lib/themes/songoskriti/preview.test.ts` | re-pinned: the account body places `account_nav/overview/orders` | yes — Task 4 instruction |
| 23 | `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | re-pinned: the partial-map narrowing; still unknown-key driven | yes — Task 4 instruction |
| 24 | `src/lib/theme-variation-preview.test.ts` | re-pinned: the partial-map narrowing | yes — Task 4 instruction |
| 25 | `src/lib/widget-e2e-workflow.test.ts` | re-pinned: the catalogue's new rows | yes — Task 4 instruction |
| 26 | `src/lib/widget-metadata.test.ts` | re-pinned: the catalogue's new rows | yes — Task 4 instruction |

**The 11 new product files** (no relaxation needed): `src/components/store/AccountDashboardContext.tsx`, `src/components/store/account-widgets.tsx`, `src/components/store/account-widgets.test.tsx`, `src/lib/payment-rail-empty.ts`, `src/lib/pipeline-resolver.ts`, `src/lib/pipeline-resolver.test.ts`, `src/lib/themes/songoskriti/commerce-compositions.test.ts`, `src/lib/themes/songoskriti/commerce-presentations.tsx`, `src/lib/themes/songoskriti/commerce-presentations.test.tsx`, `src/lib/widget-parts.ts`, `src/lib/widget-parts.test.ts`. The twelfth added file is this record — the allowed Task 7 artefact.

**The 16 existing test suites beyond G1 were re-pinned, never weakened.** Their exact old → new hunks follow in §(h.4) and §(h.5). Each re-pin asserts the new, stronger truth; none removes an assertion or skips a case.

### (h.3) Correction to §(c.12) — the stale attribute

**§(c.12) is superseded.** It quotes `data-fq-declined-template={template}`, which was never the committed shape. The committed diff (`21907047`) is:

```diff
-          fallback
+          <div
+            data-fq-theme-state="declined-template"
+            data-fq-template={template}
+            className="fq-declined-template"
+          >
+            <p className="fq-declined-template__label mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
+              {(storeName ?? storeSlug)
+                ? `${storeName ?? storeSlug} — this theme does not design the ${template} page`
+                : `This theme does not design the ${template} page`}
+            </p>
+            {fallback}
+          </div>
```

The correct attributes are `data-fq-theme-state="declined-template"` and `data-fq-template={template}`; §(g.6) already quoted them correctly. The stale line in §(c.12) is left in place as the correction trail requires.

### (h.4) The Task 2 test re-pins — the missing exact diffs

These are the five existing suites Task 2 changed. The three semantic re-pins are `songoskriti-port-freeze`, `preview-parity.contract`, and `preview`; the two activation suites are **extended** to the union of both packs.

```diff
diff --git a/src/components/builder/songoskriti-port-freeze.test.tsx b/src/components/builder/songoskriti-port-freeze.test.tsx
index 9be71cbe..ee298704 100644
--- a/src/components/builder/songoskriti-port-freeze.test.tsx
+++ b/src/components/builder/songoskriti-port-freeze.test.tsx
@@ -103,13 +103,20 @@ const TEMPLATE_MAIN: Record<string, string[]> = {
     "product_rail",
   ],
   // Batch B — the account dashboard (Task 3). The theme's account body is a
-  // FRAME around the route's dashboard: the merchant's own profile card and
-  // the route-owned body slot the dashboard flows through. NO `heading` (the
-  // account template is a route-h1 template — the route owns the page's
-  // <h1>) and NO `orders_list` (the dashboard's orders tab renders the
-  // orders as structured rows; the widget's plain list beside them would
-  // show the same orders twice).
-  account: ["profile_card", "page_content"],
+  // FRAME around the route's dashboard: the account's PLACEABLE panels (the
+  // nav, the overview and the orders) plus the route-owned body slot the
+  // dashboard flows through. NO `heading` (the account template is a
+  // route-h1 template — the route owns the page's <h1>), NO `orders_list`
+  // (the dashboard's orders tab renders the orders as structured rows; the
+  // widget's plain list beside them would show the same orders twice) and
+  // NO `profile_card` (the route supplies the composed profile card when the
+  // theme's body places none of its own).
+  account: [
+    "account_nav",
+    "account_overview",
+    "account_orders",
+    "page_content",
+  ],
   page: ["breadcrumb", "page_content"],
   blog: ["blog_terms", "blog_archive", "blog_pager"],
   cart: ["heading", "columns"],
diff --git a/src/lib/preview-parity.contract.test.ts b/src/lib/preview-parity.contract.test.ts
index 65e79ca6..6c08dfe9 100644
--- a/src/lib/preview-parity.contract.test.ts
+++ b/src/lib/preview-parity.contract.test.ts
@@ -112,16 +112,20 @@ function difference(a: string[], b: string[]): string[] {
 }
 
 describe("the preview and the storefront grant the SAME slots", () => {
-  it("search — the preview adds facet_sidebar, and nothing else", () => {
+  it("search — the two hosts grant the SAME slots (Decision G2 (a) closed the difference)", () => {
     const preview = grantedSlots(PREVIEW, "const searchSlots =");
     const production = grantedSlots(
       read("routes", "store.$slug.search.tsx"),
       "contextSlots={{",
     );
     expect(difference(production, preview)).toEqual([]);
-    // Decision D7: the facet sidebar reads the widget-data pipeline and no
-    // storefront route mounts a `WidgetDataProvider` — it stays preview-only.
-    expect(difference(preview, production)).toEqual(["facet_sidebar"]);
+    // Decision G2 (a): the storefront grants the facet sidebar too — the
+    // widget batch its rows come from is resolved on the server and mounted
+    // by the route. The OLD difference — the preview's extra
+    // `facet_sidebar` — is CLOSED, so the two sets are EQUAL.
+    expect(difference(preview, production)).toEqual([]);
+    expect(preview).toContain("facet_sidebar");
+    expect(production).toContain("facet_sidebar");
     expect(production).toContain("empty_state");
   });
 
@@ -158,7 +162,7 @@ describe("the preview and the storefront grant the SAME slots", () => {
     expect(preview).toEqual(production);
   });
 
-  it("account — the two account widgets plus the route-owned body", () => {
+  it("account — the account widgets, the placeable panels and the route-owned body", () => {
     const preview = union(
       grantedSlots(PREVIEW, "const accountSlots ="),
       grantedSlots(PREVIEW, "const accountBodySlot ="),
@@ -167,7 +171,18 @@ describe("the preview and the storefront grant the SAME slots", () => {
       read("routes", "store.$slug.account.tsx"),
       "contextSlots={{",
     );
-    expect(preview).toEqual(["orders_list", "page_content", "profile_card"]);
+    // The four PLACEABLE panels join the two account widgets: a panel the
+    // theme places is granted to the theme's body, and a panel it does not
+    // place is the dashboard's.
+    expect(preview).toEqual([
+      "account_details",
+      "account_nav",
+      "account_orders",
+      "account_overview",
+      "orders_list",
+      "page_content",
+      "profile_card",
+    ]);
     expect(preview).toEqual(production);
   });
 
diff --git a/src/lib/themes/songoskriti/claims-activation.test.ts b/src/lib/themes/songoskriti/claims-activation.test.ts
index e4fb8b34..a22ed983 100644
--- a/src/lib/themes/songoskriti/claims-activation.test.ts
+++ b/src/lib/themes/songoskriti/claims-activation.test.ts
@@ -4,7 +4,7 @@
  * Imports ONLY the editor chain (`@/lib/unified-widget-registry` →
  * `components/builder/songoskriti.tsx` → `claims-activation.ts`); never
  * `builtin-themes` / `preview.ts`. Proves the pack's lazy activation hop
- * (`claims-activation.ts`) registers all 13 presentation claims without the
+ * (`claims-activation.ts`) registers all 23 presentation claims without the
  * storefront carrier — the gap the Task 6 value-import silently held (and
  * `widget-registry.test.ts` rejects). RED tooth: removing the dynamic hop
  * from the pack file fails this file.
@@ -14,6 +14,7 @@ import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";
 import { resolveThemePresentation } from "@/lib/theme-presentations";
 import "@/lib/unified-widget-registry";
 import { SONGOSKRITI_PRESENTATION_CLAIMS } from "./presentation-claims";
+import { SONGOSKRITI_COMMERCE_WIDGETS } from "./commerce-presentations";
 
 describe("claims-activation — editor carrier alone", () => {
   it("registers every claim through the pack's lazy activation hop (no preview.ts)", async () => {
@@ -26,9 +27,15 @@ describe("claims-activation — editor carrier alone", () => {
       { timeout: 2000 },
     );
     for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
-      expect(resolveThemePresentation("songoskriti", key)).toBe(
-        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS],
-      );
+      // The theme's OWN pack carries thirteen claims; the commerce and
+      // account pack carries the other ten.
+      const expected =
+        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS] ??
+        SONGOSKRITI_COMMERCE_WIDGETS[
+          key as keyof typeof SONGOSKRITI_COMMERCE_WIDGETS
+        ];
+      expect(expected, `${key} must have a theme renderer`).toBeDefined();
+      expect(resolveThemePresentation("songoskriti", key)).toBe(expected);
     }
   });
 });
diff --git a/src/lib/themes/songoskriti/presentation-claims-activation.test.ts b/src/lib/themes/songoskriti/presentation-claims-activation.test.ts
index 04241955..0fc5c794 100644
--- a/src/lib/themes/songoskriti/presentation-claims-activation.test.ts
+++ b/src/lib/themes/songoskriti/presentation-claims-activation.test.ts
@@ -22,6 +22,7 @@ import {
   registerSongoskritiPresentationClaims,
   SONGOSKRITI_PRESENTATION_CLAIMS,
 } from "./presentation-claims";
+import { SONGOSKRITI_COMMERCE_WIDGETS } from "./commerce-presentations";
 import { SongoskritiHeaderPresentation } from "./header-presentation";
 
 // Productive entry modules — import-time registration is the subject under
@@ -38,7 +39,10 @@ const CORE_REQUIRED = [
 ] as const;
 
 function packOf(key: string): WidgetComponent {
-  return SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS];
+  return (SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS] ??
+    SONGOSKRITI_COMMERCE_WIDGETS[
+      key as keyof typeof SONGOSKRITI_COMMERCE_WIDGETS
+    ]) as WidgetComponent;
 }
 
 function genericOf(key: string): WidgetComponent {
@@ -104,7 +108,7 @@ describe("songoskriti presentation claims — editor graph (unified-widget-regis
 });
 
 describe("songoskriti presentation claims — completeness", () => {
-  it("claims list is exactly 13 keys: the theme-fixable leak keys", () => {
+  it("claims list is exactly 23 keys: the theme-fixable leak keys plus the commerce and account types", () => {
     const generic = GENERIC_WIDGETS as Record<string, unknown>;
     const expected = Object.keys(SONGOSKRITI_WIDGETS).filter(
       (key) =>
@@ -112,9 +116,16 @@ describe("songoskriti presentation claims — completeness", () => {
         !CORE_REQUIRED.includes(key as never) &&
         key !== "mega_menu",
     );
-    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(13);
+    // The theme's own pack claims thirteen; the commerce and account pack
+    // claims ten more — the surfaces the composable parts contract made
+    // authorable.
+    const commerce = Object.keys(SONGOSKRITI_COMMERCE_WIDGETS);
+    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(
+      expected.length + commerce.length,
+    );
+    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(23);
     expect([...SONGOSKRITI_PRESENTATION_CLAIMS].sort()).toEqual(
-      [...expected].sort(),
+      [...expected, ...commerce].sort(),
     );
   });
 });
diff --git a/src/lib/themes/songoskriti/preview.test.ts b/src/lib/themes/songoskriti/preview.test.ts
index 27867c0c..cc88c4c4 100644
--- a/src/lib/themes/songoskriti/preview.test.ts
+++ b/src/lib/themes/songoskriti/preview.test.ts
@@ -77,6 +77,14 @@ describe("songoskritiPreviewSource", () => {
     expect(
       flattenSections(source.main("product", s)!).map((x) => x.type),
     ).toContain("product_media");
-    expect(types("account")).toEqual(["profile_card", "page_content"]);
+    // The account body places the account's four PLACEABLE panels and keeps
+    // the route-owned body slot — the dashboard's own fallback renders
+    // everything the theme did not place.
+    expect(types("account")).toEqual([
+      "account_nav",
+      "account_overview",
+      "account_orders",
+      "page_content",
+    ]);
   });
 });
```

### (h.5) The Task 3 test re-pins — the missing exact diffs

§(g.3) is empty and §(g.13) documents only two of the six. This section carries all six existing suites Task 3 changed. The `theme-preview-nav.test.ts` hunk is long because the partial map forces every authored-key read through the `authored()` helper; the helper ASSERTS presence and narrows the type, so it is stricter than the old unchecked read.

```diff
diff --git a/src/lib/template-persistence-isolation.test.ts b/src/lib/template-persistence-isolation.test.ts
index 326fdf77..89081d98 100644
--- a/src/lib/template-persistence-isolation.test.ts
+++ b/src/lib/template-persistence-isolation.test.ts
@@ -190,9 +190,13 @@ describe("per-template persistence isolation", () => {
     expect(bytes(savedB.index)).toBe(bytes(baselineB.index));
     expect(bytes(savedA.index)).not.toBe(bytes(savedB.index));
     // The archive key is a key like any other: it travels with the theme
-    // that authors it and never appears in the other's map.
+    // that AUTHORS it and never appears in the other's map. The assembled
+    // map is PARTIAL (a template a theme does not author is ABSENT — the
+    // engine no longer synthesises a body for it), so the theme that does
+    // not author the archive never carries one — and never receives the
+    // other theme's.
     expect(savedA.archive).toBeDefined();
-    expect(savedB.archive).toBeDefined();
+    expect(savedB.archive).toBeUndefined();
     expect(bytes(savedA.archive)).not.toBe(bytes(savedB.archive));
   });
 
diff --git a/src/lib/template-variants.test.ts b/src/lib/template-variants.test.ts
index 45f60c5b..f6274480 100644
--- a/src/lib/template-variants.test.ts
+++ b/src/lib/template-variants.test.ts
@@ -270,7 +270,7 @@ describe("the listing and the article detail are DIFFERENT compositions", () =>
   });
 
   it("the base blog body is still the listing's pack", () => {
-    const base = preset.templates.blog.main.map((s) => s.type);
+    const base = preset.templates.blog!.main.map((s) => s.type);
     expect(base).toEqual(["blog_terms", "blog_archive", "blog_pager"]);
   });
 
diff --git a/src/lib/theme-preview-nav.test.ts b/src/lib/theme-preview-nav.test.ts
index b055730d..497ead40 100644
--- a/src/lib/theme-preview-nav.test.ts
+++ b/src/lib/theme-preview-nav.test.ts
@@ -6,6 +6,7 @@ import {
   TEMPLATE_KEYS,
   flattenSections,
   type TemplateKey,
+  type ThemeAst,
 } from "./builder-ast";
 import {
   TEMPLATE_VARIANT_KEYS,
@@ -23,8 +24,23 @@ import {
   resolveDemoFocus,
   resolveThemePreview,
   validateThemePreviewSearch,
+  type ThemePreviewPreset,
 } from "./theme-preview-nav";
 
+/**
+ * The theme's AUTHORED body for one template.
+ *
+ * The assembled map is PARTIAL (a template the theme does not author is
+ * ABSENT — the engine no longer synthesises a body for it), so a suite that
+ * pins an authored body must SAY so. The helper asserts the key is present
+ * and narrows the type.
+ */
+function authored(preset: ThemePreviewPreset, key: TemplateKey): ThemeAst {
+  const ast = preset.templates[key];
+  expect(ast, `the theme must author the ${key} template`).toBeDefined();
+  return ast!;
+}
+
 // O2: static theme sources are build-time-only — this test file is a
 // build-time context, so it wires the factories explicitly (legacy
 // null/undefined cases resolve from the registered table).
@@ -78,8 +94,8 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     // announcement bar). Full order pinned in wiring.test.ts; the header
     // blueprint stays empty (StoreHeader owns search/account/cart chrome),
     // so the preview index header carries no sections.
-    expect(preset!.templates.index.header.length).toEqual(0);
-    expect(preset!.templates.index.main.map((s) => s.type)).toEqual([
+    expect(authored(preset!, "index").header.length).toEqual(0);
+    expect(authored(preset!, "index").main.map((s) => s.type)).toEqual([
       "hero_carousel",
       "department_grid",
       "product_rail",
@@ -102,7 +118,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
       "trust_footer",
       "store_locator",
     ]);
-    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
+    expect(authored(preset!, "index").footer.length).toBeGreaterThan(0);
   });
 
   it("returns null for unknown keys (route renders 404)", () => {
@@ -117,7 +133,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     for (const key of Object.keys(
       preset.templates,
     ) as (keyof typeof preset.templates)[]) {
-      expect(preset.templates[key].main.length, `${key} main`).toBeGreaterThan(
+      expect(authored(preset, key).main.length, `${key} main`).toBeGreaterThan(
         0,
       );
     }
@@ -133,7 +149,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     index: "hero_carousel",
     product: "heading",
     collection: "category_header",
-    account: "profile_card",
+    account: "account_nav",
     page: "breadcrumb",
     blog: "blog_terms",
     cart: "heading",
@@ -158,7 +174,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     // knows — including `archive`, the tenth key, which the old literal
     // list of nine did not.
     for (const key of TEMPLATE_KEYS) {
-      const ast = preset.templates[key];
+      const ast = authored(preset, key);
       expect(ast.header.length, `${key} header`).toBeGreaterThanOrEqual(0);
       expect(ast.main.length, `${key} main`).toBeGreaterThan(0);
       // Distraction-free checkout by design: the checkout template renders
@@ -175,23 +191,25 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
       );
     }
     // Spot-check demo bodies use proven renderers.
-    expect(preset.templates.collection.main.map((s) => s.type)).toContain(
+    expect(authored(preset, "collection").main.map((s) => s.type)).toContain(
       "product_rail",
     );
     // product_media nests under columns > container (2-col product
     // layout), so assert presence with the recursive helper rather than
     // the top-level type list (same precedent as preview.test.ts).
     expect(
-      flattenSections(preset.templates.product.main).map((s) => s.type),
+      flattenSections(authored(preset, "product").main).map((s) => s.type),
     ).toContain("product_media");
-    expect(preset.templates.account.main.map((s) => s.type)).toEqual([
-      "profile_card",
+    expect(authored(preset, "account").main.map((s) => s.type)).toEqual([
+      "account_nav",
+      "account_overview",
+      "account_orders",
       "page_content",
     ]);
     // Section ids stay unique across templates sharing one counter.
-    const ids = (
-      Object.values(preset.templates) as (typeof preset.templates.index)[]
-    ).flatMap((t) => [...t.header, ...t.main, ...t.footer].map((s) => s.id));
+    const ids = (Object.values(preset.templates) as ThemeAst[]).flatMap((t) =>
+      [...t.header, ...t.main, ...t.footer].map((s) => s.id),
+    );
     expect(new Set(ids).size).toBe(ids.length);
   });
 
@@ -234,7 +252,12 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     ).not.toEqual(preset.variants["blog_listing"]!.main.map((s) => s.type));
   });
 
-  it("synthesizes generic demo bodies for templates a theme omits", async () => {
+  it("carries NO body for a template a theme omits — the map is ABSENT, not synthesised", async () => {
+    // The engine no longer synthesises a generic body for a key the theme
+    // did not author: the key is simply ABSENT from the map, and the
+    // preview host turns an absent key into its explicit "not supported by
+    // this theme" panel. `genericDemoMain` STAYS in the module — it is the
+    // distinctness gate's reference body, not a synthesiser.
     const { assemblePreviewTemplates } = await import("./theme-preview-nav");
     const { DEFAULT_TOKENS } = await import("./builder-ast");
     const stub = {
@@ -247,9 +270,10 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
       main: () => null,
     };
     const templates = assemblePreviewTemplates(stub);
-    for (const key of Object.keys(templates) as (keyof typeof templates)[]) {
-      expect(templates[key].main.length, `${key} main`).toBeGreaterThan(0);
-      expect(templates[key].main[0]!.type).toBe("heading");
+    // The map carries NOTHING — not a synthesised body for the ten keys.
+    expect(Object.keys(templates)).toEqual([]);
+    for (const key of TEMPLATE_KEYS) {
+      expect(templates[key], `${key} must be absent`).toBeUndefined();
     }
   });
 });
@@ -372,10 +396,10 @@ describe("demo focus (slug-aware collection preview)", () => {
     // DemoProductMediaGallery (ThemePreviewFrame.tsx:108), not as an
     // injected product_media prop (no-inject design).
     expect(focus.image).toBe("/ph/songoskriti/prod-panjabi.png");
-    const before = flattenSections(preset.templates.product.main).find(
+    const before = flattenSections(authored(preset, "product").main).find(
       (s) => s.type === "product_media",
     )!;
-    const out = applyDemoFocus(preset.templates.product.main, focus);
+    const out = applyDemoFocus(authored(preset, "product").main, focus);
     const media = flattenSections(out).find((s) => s.type === "product_media")!;
     // Static media stays untouched so the frame gallery owns focused art.
     expect(media.props).toMatchObject({ ...before.props });
@@ -384,7 +408,7 @@ describe("demo focus (slug-aware collection preview)", () => {
 
   it("keeps static product_media for unknown product slugs", () => {
     const preset = resolveThemePreview("songoskriti")!;
-    const before = flattenSections(preset.templates.product.main).find(
+    const before = flattenSections(authored(preset, "product").main).find(
       (s) => s.type === "product_media",
     )!;
     const focus = resolveDemoFocus(
@@ -392,7 +416,7 @@ describe("demo focus (slug-aware collection preview)", () => {
       "product",
       "no-such-product-xyz",
     )!;
-    const out = applyDemoFocus(preset.templates.product.main, focus);
+    const out = applyDemoFocus(authored(preset, "product").main, focus);
     const media = flattenSections(out).find((s) => s.type === "product_media")!;
     expect(media.props).toMatchObject({ ...before.props });
   });
@@ -404,7 +428,7 @@ describe("resolveThemePreview (somvabona)", () => {
     expect(preset).not.toBeNull();
     expect(preset!.key).toBe("somvabona");
     expect(preset!.tokens.brand).toBe("#7C2A1A");
-    expect(preset!.templates.index.main.map((s) => s.type)).toEqual([
+    expect(authored(preset!, "index").main.map((s) => s.type)).toEqual([
       "announcement_bar",
       "hero_carousel",
       "trust_marquee",
@@ -418,26 +442,34 @@ describe("resolveThemePreview (somvabona)", () => {
       "craft_story",
       "testimonials",
     ]);
-    expect(preset!.templates.index.header.map((s) => s.type)).toEqual([
+    expect(authored(preset!, "index").header.map((s) => s.type)).toEqual([
       "mega_menu",
     ]);
-    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
+    expect(authored(preset!, "index").footer.length).toBeGreaterThan(0);
   });
 
-  it("authors demo content for every somvabona template", () => {
+  it("authors demo content for the templates somvabona authors — and ABSENT for the rest", () => {
     const preset = resolveThemePreview("somvabona")!;
-    // `TEMPLATE_KEYS`-driven: the sweep covers EVERY template the platform
-    // knows — including `archive`, the tenth key, which the old literal
-    // list of nine did not.
-    for (const key of TEMPLATE_KEYS) {
-      const ast = preset.templates[key];
+    // The map is PARTIAL: a template the theme does not author is ABSENT —
+    // the engine no longer synthesises a generic body for it (the plan's
+    // **D4**), and the preview host renders its explicit "not supported by
+    // this theme" panel for an absent key.
+    for (const key of ["index", "collection", "product"] as const) {
+      const ast = authored(preset, key);
       expect(ast.header.length, `${key} header`).toBeGreaterThan(0);
       expect(ast.main.length, `${key} main`).toBeGreaterThan(0);
       expect(ast.footer.length, `${key} footer`).toBeGreaterThan(0);
     }
-    const ids = (
-      Object.values(preset.templates) as (typeof preset.templates.index)[]
-    ).flatMap((t) => [...t.header, ...t.main, ...t.footer].map((s) => s.id));
+    // … and the templates somvabona does NOT author are absent — never a
+    // synthesised body.
+    for (const key of TEMPLATE_KEYS) {
+      if (key === "index" || key === "collection" || key === "product")
+        continue;
+      expect(preset.templates[key], `${key} must be absent`).toBeUndefined();
+    }
+    const ids = (Object.values(preset.templates) as ThemeAst[]).flatMap((t) =>
+      [...t.header, ...t.main, ...t.footer].map((s) => s.id),
+    );
     expect(new Set(ids).size).toBe(ids.length);
   });
 });
@@ -541,10 +573,10 @@ describe("resolveThemePreview installed packages (SWITCHOVER-4)", () => {
     expect(preset.key).toBe("acme-pack");
     expect(preset.themeName).toBe("Acme Pack");
     expect(preset.tokens.surface).toBe("#112233");
-    expect(preset.templates.index.main[0]!.props["text"]).toBe("Acme home");
-    // Un-authored templates synthesize the generic demo body, never empty.
-    expect(preset.templates.product.main.length).toBeGreaterThan(0);
-    expect(preset.templates.product.main[0]!.type).toBe("heading");
+    expect(authored(preset, "index").main[0]!.props["text"]).toBe("Acme home");
+    // A template the artifact does not author is ABSENT — never a
+    // synthesised generic body (the plan's D4).
+    expect(preset.templates.product).toBeUndefined();
   });
 
   it("uninstalled keys fail closed to null (never silent wrong theme)", () => {
diff --git a/src/lib/theme-variation-preview.test.ts b/src/lib/theme-variation-preview.test.ts
index 6bd5a1c4..a0282a2c 100644
--- a/src/lib/theme-variation-preview.test.ts
+++ b/src/lib/theme-variation-preview.test.ts
@@ -73,7 +73,7 @@ describe("resolveThemePreview with variation", () => {
   it("omitted variation keeps today's base behavior byte-identical", () => {
     const preset = resolveThemePreview("songoskriti")!;
     expect(preset.variation).toBeNull();
-    expect(preset.templates.index.main.length).toBeGreaterThan(0);
+    expect(preset.templates.index!.main.length).toBeGreaterThan(0);
     const somvabona = resolveThemePreview("somvabona")!;
     expect(somvabona.variation).toBeNull();
     expect(somvabona.tokens).toEqual(SOMVABONA_TOKENS);
diff --git a/src/lib/themes/songoskriti/unsupported-template-state.test.tsx b/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
index 0b20cd31..5d0ea7dc 100644
--- a/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
+++ b/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
@@ -149,7 +149,7 @@ const preset = resolveThemePreview("songoskriti")!;
  * derived, never typed twice. It is the marker that tells the homepage
  * composition apart from the unsupported panel.
  */
-const homeGrid = preset.templates.index.main.find(
+const homeGrid = preset.templates.index!.main.find(
   (section) => section.type === "department_grid",
 );
 const HOME_MARKER = String(homeGrid?.props["heading"] ?? "");
@@ -332,7 +332,7 @@ describe("the preview renders a CLOSED variant from the URL", () => {
   it("?template=blog_listing renders the VARIANT's body, not the base's", () => {
     const html = renderRequested({ template: "blog_listing" });
     const variant = preset.variants["blog_listing"]!;
-    const base = preset.templates.blog;
+    const base = preset.templates.blog!;
     // The VARIANT's own sections rendered …
     for (const section of [
       ...variant.header,
```

### (h.6) Ordering proof

This appendix is committed **before** any Task 4 code change. The Task 4 code commit that follows is therefore provably later than the correction it implements, which is what the plan's §7.1 ordering requires. The record itself is amended again only by appendices, never by rewriting the sections above.


### (h.7) M3 — the compatibility claim, corrected and measured on the THEME path

**The defect (review 1–3, M3).** This record claimed compatibility while conceding, at §(f), that the measurement covered only the platform renderers. The concession was load-bearing: `SONGOSKRITI_PRESENTATION_CLAIMS` grew from **13 to 23** entries, the claims registry is keyed by **theme key × widget type** (`src/lib/theme-presentations.ts:26`, `:146`), and the storefront's theme key is the theme row's **`source_listing_slug`** (`src/lib/themes.server.ts:759`) — the value both install paths write (`src/lib/themes/appearance.server.ts:448`, `src/lib/marketplace-install.server.ts:963`). No version participates in claim resolution. Therefore **every existing `songoskriti`-keyed store renders the ten new commerce/account presentations immediately**, from the same stored AST. The platform-renderer capture could not and did not measure that path.

**The corrected rule.** The compatibility rule (*"a stored AST written before it renders byte-identically after it"*, plan A9) is satisfied on the **platform renderer** path, and it remains byte-identical there. It is **not** satisfied on the **theme presentation** path: for a `songoskriti`-keyed store the same stored AST now renders in the theme's own commerce/account type language. That is a **deliberate visual change**, not a byte-identical one. The correct claim is therefore:

> Stored ASTs remain byte-identical through the platform renderers. On the **songoskriti theme path** the cart, checkout and account surfaces change by design, because presentation claims are keyed by `source_listing_slug`, not by version. The change is measured below and ratified by the programme owner's Task 4 instruction of 2026-10-22. No stored AST is migrated or rewritten.

**The version bump records, it does not gate.** `src/lib/themes/builtin-themes.ts:71` now carries `version: "1.1.0"` (was `"1.0.0"`); the module comment (`:46–54`) states the truth explicitly: the version is the documented source version, existing installs are keyed by `source_listing_slug`, and the bump **records** the change without gating it. `src/lib/themes-official-catalog.test.ts` follows the metadata. The bump does **not** migrate an installed row (`source_version` is written at install time; `installCatalogTheme` returns `alreadyInstalled` for an existing slug), and no code path compares it before resolving a claim. It is provenance, not an opt-in. An opt-in gate was considered and rejected: it would fork every existing install into two renderers indefinitely, and the owner's Task 4 instruction chose the measured-and-ratified route instead.

**The measurement (the theme path this time).** The harness is the same temporary capture used in Tasks 1–3 (created for the measurement, deleted before the commit, never part of the diff). It rendered the three real Songoskriti compositions — `cart`, `checkout`, `account` — through `ThemeChrome`, with `parts` stripped from each stored AST to mimic an AST written **before** Task 2, in two states: **before** = `themeKey={null}` (the platform renderers, i.e. the pre-claim path) and **after** = `themeKey="songoskriti"` (today's claim path). Both captures are the same stored AST, same data, same locale.

| surface | before (platform path) | after (songoskriti path) | tags | text characters |
| --- | ---: | ---: | ---: | ---: |
| cart | 1847 bytes | 1492 bytes | 25 → 22 | 116 → 72 |
| checkout | 33157 bytes | 33120 bytes | 162 → 162 | 306 → 306 |
| account | 8936 bytes | 9047 bytes | 83 → 86 | 266 → 266 |

**The named differences (not "some markup changed"):**

- **cart** — the platform's empty-state block (title, secondary line, and the “Continue shopping” link to `/store/songoskriti/`) is replaced by the theme's single-line empty state; the order-summary heading loses the platform panel chrome and its body drops one type size. This is the same break M1 named: the old CTA targeted the demo path and is gone; the theme's cart is text-only by design.
- **checkout** — the theme's payment empty-state body is one type size smaller, and the platform order-summary card chrome is replaced by the theme's heading treatment. No control, label, step or amount is added or removed (162 → 162 tags, 306 → 306 text characters).
- **account** — three presentational `<section class="space-y-4">` wrappers are added around the theme's own `account_nav`, `account_overview` and `account_orders`; the text is unchanged (266 → 266 characters). No panel is blank: the three account widgets render their rows, which is what M5 and Task 4 require.

**What did not change.** The platform path is byte-identical for all three surfaces (it is the “before” column), and the stored ASTs are untouched — no migration, no rewrite, no id change. The earlier 18-surface capture remains valid for what it measured. What was missing was this second projection, and it is now on the record.

**Owner ratification (M3).** The programme owner's Task 4 fix instruction of **2026-10-22** directs this exact remedy — *bump the version, measure the theme path before/after, correct the record* — and accepts the resulting visual change for existing Songoskriti stores. It is file- and programme-scoped to this task, not a precedent, and it does not relax A9 for any future change: a future theme-path change must again be measured and either gated or ratified before the claim is made.

---

# Phase 4 — Fix wave 2: the re-review's corrections (escalation appendix)

**Recorded:** 2026-10-22 · **Branch:** `frame30` · **Base reviewed:** `5f283eb1` · **Re-review:** `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/review-4.md`

**Why this appendix exists.** Review 4 found that the Task 4 wave closed M1/M3/M4/M5 and S1–S8 but introduced **one shopper-facing regression** (the storefront payload lost the theme's chrome, tokens and presentations for every template a theme does not author) and left **one false in-code claim** (the demo marker's comment denied a clause the render appends). It also found that this record's boundary statement stops at `21907047` and therefore does not cover the wave's own seven existing beyond-G1 files, and that four of the wave's pins assert a **source string** where the plan asks for behaviour.

This appendix is **append-only**: nothing above is rewritten, because the record is evidence and evidence is corrected by a dated correction, never by erasure. Where this appendix conflicts with an earlier section, **this appendix governs**. It is committed **before** the code commit it governs (§7.1's ordering), exactly as §(h.6) proved for the previous wave.

## (i.1) The boundary statement over the FULL programme (`3ca5e8ad..HEAD`)

**Corrected boundary statement.** *This record escalates the programme's full change set from the pre-programme base `109e2d3d` to `HEAD`: the **11** files of the plan's 12-file Decision Gate G1 that the shipped work actually edited, **18** new files (a NEW file needs no §7 relaxation — 17 product files plus this record), and **36** existing product files beyond G1 — 26 from Tasks 1–3 (enumerated in §(h.2)), 7 from the Task 4 fix wave (`5f283eb1`, enumerated in §(i.1.2)) and 3 from this wave (enumerated in §(i.1.3)). No other file is edited. Every beyond-G1 existing file is enumerated with its commit and the owner's ratification.*

The review names the range **`3ca5e8ad..HEAD`** — Task 1's commit through the head of the branch. That range is the programme's *own* commits; Task 1's own diff is measured against the pre-programme base `109e2d3d`, so the enumeration below is the union of `109e2d3d..3ca5e8ad` (Task 1), `3ca5e8ad..4b522b93` (Task 2), `4b522b93..21907047` (Task 3), `21907047..5f283eb1` (the Task 4 fix wave) and `5f283eb1..HEAD` (this wave). The arithmetic, measured from `git diff --name-status 109e2d3d..HEAD` at this wave's record commit:

| category | count | meaning |
| --- | ---: | --- |
| G1 files edited | **11** | the named relaxation list; exact diffs in §(b)–(g) |
| G1 files not edited | **1** | `src/components/store/songoskriti-preview-compositions.test.tsx` — no change was needed |
| new files | **18** | 17 new product files + this record; a NEW file needs no relaxation |
| existing product files beyond G1 | **36** | 26 in §(h.2) + 7 in §(i.1.2) + 3 in §(i.1.3) |
| **total unique files** | **65** | `109e2d3d..HEAD` |

### (i.1.1) The 11 G1 files — the named relaxation list

| # | G1 file | first edited | why |
| ---: | --- | --- | --- |
| 1 | `src/lib/builder-ast.ts` | `3ca5e8ad` | the `SectionType` union, the four new catalogue rows, the `parts` / `layout` fields |
| 2 | `src/components/builder/widgets.tsx` | `3ca5e8ad` | the closed `WIDGET_COMPONENTS` map |
| 3 | `src/components/builder/cart.tsx` | `3ca5e8ad` | the part order in the four commerce widgets |
| 4 | `src/components/builder/account.tsx` | `3ca5e8ad` | the part order in the two account widgets |
| 5 | `src/components/store/AccountDashboard.tsx` | `3ca5e8ad` | the dashboard becomes the provider's default composition |
| 6 | `src/lib/preview-parity.contract.test.ts` | `4b522b93` | the hosts' grant sets (EXTENDED, never weakened) |
| 7 | `src/routes/store.$slug.account.tsx` | `4b522b93` | the provider mount and the four new grants |
| 8 | `src/routes/store.$slug.search.tsx` | `4b522b93` | the storefront's `facet_sidebar` grant (G2 (a)) |
| 9 | `src/routes/store.$slug.checkout.tsx` | `4b522b93` | the disabled place-order action and the shared empty state |
| 10 | `src/components/store/ThemeChrome.tsx` | `21907047` | the declined-template fallback becomes an explicit, named state (D5) |
| 11 | `src/routes/_authenticated/dashboard/builder.tsx` | `21907047` | the canvas's `themeKey`, its demo providers and its draft resolution |

### (i.1.2) The Task 4 fix wave's SEVEN existing beyond-G1 files (`5f283eb1`)

Review 4 found these named nowhere in this record — §(h.2)'s ratification list covers Tasks 1–3 only, and the wave's own commit sat outside every boundary statement. They are enumerated here, one line per file, with the owner's ratification.

| # | beyond-G1 existing file | why it had to change | ratified |
| ---: | --- | --- | --- |
| 1 | `src/lib/storefront.server.ts` | the storefront's published body resolves through the ONE resolver (`mode: "published"`, `host: "storefront"`) | yes — owner's standing instruction, 2026-10-22 |
| 2 | `src/lib/widget-data.server.ts` | the search surface's facets answer from the shopper's query scope (S4) | yes — owner's standing instruction, 2026-10-22 |
| 3 | `src/lib/preview-sources.ts` | the installed artifact's body resolves through the ONE resolver (`mode: "source"`, `host: "preview"`) | yes — owner's standing instruction, 2026-10-22 |
| 4 | `src/components/builder/SectionRenderer.tsx` | the editor canvas draws the provider-backed context widgets instead of the editing placeholder (M5) | yes — owner's standing instruction, 2026-10-22 |
| 5 | `src/lib/themes/builtin-themes.ts` | the version metadata records the theme-path change (`1.0.0` → `1.1.0`) — records, it does not gate (M3) | yes — owner's standing instruction, 2026-10-22 |
| 6 | `src/lib/themes-official-catalog.test.ts` | re-pinned to the new metadata (a version pin — the loop still asserts an exact version for every official entry) | yes — owner's standing instruction, 2026-10-22 |
| 7 | `src/components/store/ThemePreviewFrame.test.tsx` | re-pinned: the demo marker renders on the cart and the checkout (S5) | yes — owner's standing instruction, 2026-10-22 |

### (i.1.3) THIS wave's THREE further beyond-G1 existing files

| # | beyond-G1 existing file | why it had to change | ratified |
| ---: | --- | --- | --- |
| 1 | `src/components/builder/PublishModal.tsx` | the publish gate must surface the declined-template **warning text**, not a count (review F4) | yes — owner's standing instruction, 2026-10-22 |
| 2 | `src/lib/template-key-contract.test.ts` | the label-map totality contract must enumerate EVERY per-template label map, including the storefront's (review F6) | yes — owner's standing instruction, 2026-10-22 |
| 3 | `src/lib/template-variants.ts` | `templateAstOf` became dead when the editor swapped to the resolver (review F9) | yes — owner's standing instruction, 2026-10-22 |

### (i.1.4) The owner's ratification, one line per beyond-G1 file

**The owner's standing instruction of 2026-10-22** — *"whatever goes, as per the expert opinion"* — is the written ratification for the beyond-G1 files above. It is applied **file by file** and **programme by programme**: it relaxes §7 for the files named in §(h.2), §(i.1.2) and §(i.1.3) and for nothing else, it does not set a precedent for any future programme, and it does not move the plan's other constraints (no new dependency, no new registry or renderer, no weakened test, no migration, no deploy).

| # | beyond-G1 existing file | ratified under the owner's standing instruction |
| ---: | --- | --- |
| 1 | `src/routes/store.$slug.search-composition.test.tsx` | yes — 2026-10-22 |
| 2 | `src/components/store/ThemePreviewFrame.tsx` | yes — 2026-10-22 |
| 3 | `src/lib/theme-preview-nav.ts` | yes — 2026-10-22 |
| 4 | `src/lib/themes/songoskriti/presentation-claims.ts` | yes — 2026-10-22 |
| 5 | `src/lib/themes/songoskriti/preview.ts` | yes — 2026-10-22 |
| 6 | `src/lib/themes/songoskriti/template-distinctness.ts` | yes — 2026-10-22 |
| 7 | `src/lib/themes/songoskriti/preview-demo-data.ts` | yes — 2026-10-22 |
| 8 | `src/lib/theme-shell-slots.ts` | yes — 2026-10-22 |
| 9 | `src/routes/theme-preview.$key.tsx` | yes — 2026-10-22 |
| 10 | `src/lib/studio/catalog.ts` | yes — 2026-10-22 |
| 11 | `src/lib/widget-help.ts` | yes — 2026-10-22 |
| 12 | `src/components/builder/songoskriti-port-freeze.test.tsx` | yes — 2026-10-22 |
| 13 | `src/components/store/account-dashboard.contract.test.ts` | yes — 2026-10-22 |
| 14 | `src/components/store/AccountDashboard.test.tsx` | yes — 2026-10-22 |
| 15 | `src/lib/builder-ast-extension.test.ts` | yes — 2026-10-22 |
| 16 | `src/lib/studio/catalog-dedup.test.ts` | yes — 2026-10-22 |
| 17 | `src/lib/template-persistence-isolation.test.ts` | yes — 2026-10-22 |
| 18 | `src/lib/template-variants.test.ts` | yes — 2026-10-22 |
| 19 | `src/lib/theme-preview-nav.test.ts` | yes — 2026-10-22 |
| 20 | `src/lib/themes/songoskriti/claims-activation.test.ts` | yes — 2026-10-22 |
| 21 | `src/lib/themes/songoskriti/presentation-claims-activation.test.ts` | yes — 2026-10-22 |
| 22 | `src/lib/themes/songoskriti/preview.test.ts` | yes — 2026-10-22 |
| 23 | `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | yes — 2026-10-22 |
| 24 | `src/lib/theme-variation-preview.test.ts` | yes — 2026-10-22 |
| 25 | `src/lib/widget-e2e-workflow.test.ts` | yes — 2026-10-22 |
| 26 | `src/lib/widget-metadata.test.ts` | yes — 2026-10-22 |
| 27 | `src/lib/storefront.server.ts` | yes — 2026-10-22 (Task 4 wave) |
| 28 | `src/lib/widget-data.server.ts` | yes — 2026-10-22 (Task 4 wave) |
| 29 | `src/lib/preview-sources.ts` | yes — 2026-10-22 (Task 4 wave) |
| 30 | `src/components/builder/SectionRenderer.tsx` | yes — 2026-10-22 (Task 4 wave) |
| 31 | `src/lib/themes/builtin-themes.ts` | yes — 2026-10-22 (Task 4 wave) |
| 32 | `src/lib/themes-official-catalog.test.ts` | yes — 2026-10-22 (Task 4 wave) |
| 33 | `src/components/store/ThemePreviewFrame.test.tsx` | yes — 2026-10-22 (Task 4 wave) |
| 34 | `src/components/builder/PublishModal.tsx` | yes — 2026-10-22 (this wave) |
| 35 | `src/lib/template-key-contract.test.ts` | yes — 2026-10-22 (this wave) |
| 36 | `src/lib/template-variants.ts` | yes — 2026-10-22 (this wave) |

## (i.2) The demo marker's English-only clause — stated, not silently "fixed"

**The finding (review F3/F11).** `src/components/store/ThemePreviewFrame.tsx`'s demo marker rendered the shared preview sentence (`PREVIEW_DISABLED_MESSAGE = "Disabled in preview"`, `src/lib/theme-preview-nav.ts:137`) **plus a clause of its own** — *"payment selection changes this preview only."* — while its comment claimed the marker used *"the one shared preview sentence so it cannot drift into new copy"*. The claim was false.

**The truth, stated in the code.** The marker **reuses the shared preview sentence as its PREFIX** and appends **one** clause that says what the demo selection affects. The clause is **English-only on purpose**:

- **Translations are out of scope for this programme.** The plan's Global Constraints state *"No Bangla copy is authored, translated or re-worded by this programme"* (`docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md:321`). Authoring a Bangla sibling here would break that constraint.
- **The marker is preview CHROME, not theme AST.** The clause lives in the preview host's own JSX, not in any template's authored AST.
- **The translation meter therefore does not cover it.** `translationCoverage(templates)` (`src/lib/translation-coverage.ts:92`) is a pure function of the theme's template ASTs; it walks sections, fields and props. A string in the preview host's markup is not in an AST, so the meter cannot see it and the meter is unchanged by this clause — **measured**: 46 % (179/391 bilingual fields) before and after.

**The change.** The comment now states exactly this. The marker is also **split** so the shared sentence stands alone as its own sentence instead of reading *"Disabled in preview: payment selection changes this preview only."* — the shared sentence keeps its own words, and the clause is a separate sentence beside it. A bilingual marker would need a separate, explicitly ratified translation task; it is not authored here.

**Owner ratification.** The programme owner's standing instruction of 2026-10-22 (*"whatever goes, as per the expert opinion"*) covers this English-only clause: it is stated in the code, stated here, and left out of the translation meter on purpose.

## (i.3) The storefront payload regression (review F1) — the fix and the re-measured compatibility

**The defect.** The Task 4 wave changed `src/lib/storefront.server.ts`'s `loadPublished` to `if (!ast) return null;` for a template the theme does not author. That nulled the **whole theme payload** — `ast`, `tokens` **and** `themeKey` — so the store's header, footer, design tokens and widget presentations **disappeared** on `/search`, `/cart`, `/checkout`, `/account`, `/page` and `/blog` for every theme that declines that template. The official built-in `somvabona` authors only three of the ten templates (`src/lib/themes/somvabona/preview.test.ts:50-64`).

**The fix.** An `absent` resolution now means **an empty BODY**, never "no theme": the storefront keeps the theme's chrome, tokens and `themeKey`, and the route's own platform surface renders inside the theme's chrome inside the named declined frame — exactly as Decision Gate G3 requires. The wave's own comment stated the invariant it broke (*"a shopper never lands on a page without the store's navigation or its policy links"*); the invariant is restored.

**The compatibility re-measurement (the previous wave's capture logic, re-run).** The M3 harness was reconstructed — it renders the three real Songoskriti compositions (cart, checkout, account) through `ThemeChrome` with `parts` stripped from each stored AST, in two states: *before* = `themeKey={null}` (the platform renderers) and *after* = `themeKey="songoskriti"` (the theme's presentations). **The reconstruction reproduces the previous wave's six captures byte for byte** (1847 / 1492 / 33157 / 33120 / 8936 / 9047 bytes), which is what makes the cross-commit comparison below meaningful.

| surface | platform path at `109e2d3d` | platform path at this wave's HEAD | verdict |
| --- | ---: | ---: | --- |
| cart | 1847 B | 1847 B | **byte-identical** |
| checkout | 33157 B | 33157 B | **byte-identical** |
| account | 718 B (the pre-programme composition) | 718 B for the same stored AST | **byte-identical** |

The **declined-template storefront surface** — the one surface the 18-surface capture never covered — was captured at `109e2d3d` and at this wave's HEAD. The **only** difference is the D5 named frame (`data-fq-theme-state="declined-template"` and the label *"… this theme does not design the Search results page"*), which is the ratified Task 3 change; the theme's header chrome, its footer chrome and the route's own platform surface are byte-identical on both sides. The F1 defect (a payload with no chrome at all) is therefore **not** a change from `109e2d3d` — it is a change from `109e2d3d`'s behaviour **back** to `109e2d3d`'s behaviour.

**The corrected claim.** The compatibility rule (*"a stored AST written before it renders byte-identically after it"*, plan A9) holds on the platform renderer path, and the storefront's payload for a declined template is byte-identical to `109e2d3d` again. The **theme presentation** path remains the one ratified visual change (§(h.7)); it is unchanged by this wave.

## (i.4) The fifth per-template label map joins the repo's totality contract (review F6)

`src/lib/template-display.ts`'s `TEMPLATE_DISPLAY_NAME` is a **fifth** per-template label map. It is dependency-light on purpose (the storefront must not pull the preview registry), but it sat **outside** the repo's own contract for label maps (`src/lib/template-key-contract.test.ts`), so a future template key would silently fall back to the raw key — the exact defect S7 was raised for.

**The change.** The contract now **enumerates every** per-template label map — `TEMPLATE_LABEL` (the editor's bilingual map), `TEMPLATE_META` (the editor's top-bar map), `GENERIC_TITLES` (the preview's generic-body titles) and `TEMPLATE_DISPLAY_NAME` (the storefront's shopper names) — and asserts, for **every** template key, that every map carries it and that the maps' key sets are identical. It additionally asserts that the storefront's English names agree with the editor's `TEMPLATE_LABEL` English on **every** key, which is the duplication the module's docstring now names. **No sixth map is added.** `TEMPLATE_FALLBACK` (`src/lib/builder-seo.ts`) is a **SEO** map, not a label map: it is deliberately partial (it names only the templates that have an indexable page) and it stays outside the label-map agreement; the existing contract still pins its `archive` row.

The storefront's names are **English-only** while the platform has bilingual labels available — acceptable under *"No Bangla copy is authored"*, and stated here as the report states it for the marker.

## (i.5) The rest of the re-review's corrections

| finding | the change | where |
| --- | --- | --- |
| **F4** — the publish modal renders a warning COUNT, not the warning text | the modal now lists the warning messages (the declined template is named by name), reusing the existing *"…and N more"* wording so no new copy is authored | `src/components/builder/PublishModal.tsx` |
| **F5** — four pins assert a source string, not behaviour | each is converted to a behavioural assertion (the source pin is **kept in addition**, never instead): the preview's rail selection by an **interaction**, the rail-less place-order action by a **render**, the editor's draft resolution and mode label by a **render**, the search's facet scope by the **scope the route hands the resolver** | `src/lib/preview-safety.contract.test.ts`, `src/lib/pipeline-resolver.test.ts`, `src/routes/store.$slug.search-composition.test.tsx` |
| **F8** — two storefront paths still resolve through `templateOf` | both now resolve through the ONE resolver. The **pinned** page resolves a **different** theme's published pointer (the page's own pinned theme, not the store's active theme) and the **draft** index resolves the merchant's unsaved draft (`mode: "draft"`); both are named in the code, and the draft path's label says `draft` | `src/lib/storefront.server.ts` |
| **F9** — `templateAstOf` is dead | removed: it had no caller in `src/` once the editor swapped to the resolver | `src/lib/template-variants.ts` |
| **F10** — the editor's variant fallback changed with no test | the editor's draft resolution is now a **pure, exported** function of the ONE resolver, and the variant→base fallback is pinned by a test that proves it against the storefront's own rule (`resolveVariantAst`) rather than assuming it | `src/lib/pipeline-resolver.ts`, `src/lib/pipeline-resolver.test.ts` |

### (i.6) Correction to §(i.1)'s arithmetic — the three NEW files this wave adds

**§(i.1)'s table is superseded by this paragraph.** It counted the new files as **18** (17 product files plus this record); the wave's own three NEW product files were written after that table was drafted, so the measured count is **21** (20 product files plus this record). The corrected arithmetic, measured from `git diff --name-status 109e2d3d..HEAD` plus the wave's working tree at the code commit (the three churn files — `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf` — are the forbidden churn and are never staged, so they are not in the programme's set):

| category | count | meaning |
| --- | ---: | --- |
| G1 files edited | **11** | the named relaxation list; exact diffs in §(b)–(g) |
| G1 files not edited | **1** | `src/components/store/songoskriti-preview-compositions.test.tsx` — no change was needed |
| new product files | **20** | new files need no relaxation; no existing contract is edited by their creation |
| existing product files beyond G1 | **36** | 26 in §(h.2) + 7 in §(i.1.2) + 3 in §(i.1.3) |
| this escalation record | **1** | the record itself |
| **total unique files** | **68** | `109e2d3d..HEAD` |

**The three NEW files this wave adds** (a new file needs no §7 relaxation, and none of them edits an existing contract):

| # | new file | what it is |
| ---: | --- | --- |
| 1 | `src/lib/storefront-declined-template.test.tsx` | the F1 render-level proof: a theme that declines a template still renders the store's navigation, the theme's tokens and the theme's own presentation |
| 2 | `src/components/builder/PublishModal.test.tsx` | the F4 proof: the publish gate renders the declined-template warning's TEXT, and a warning never blocks a publish |
| 3 | `src/lib/checkout-submit-state.ts` | the place-order action's PURE state (the D8 decision), so the rail-less case can be rendered and asserted instead of scanned |

**The §7-prohibited existing files this wave edits** are exactly the three in §(i.1.3) plus the files the previous wave already edited (`src/lib/storefront.server.ts`, `src/components/store/ThemePreviewFrame.tsx`, `src/components/store/ThemePreviewFrame.test.tsx`, `src/routes/store.$slug.search-composition.test.tsx` — all already enumerated in §(i.1.2)) and the G1 files `src/routes/_authenticated/dashboard/builder.tsx`, `src/routes/store.$slug.checkout.tsx` and `src/routes/store.$slug.search.tsx`. No other existing file is edited, and the owner ratification in §(i.1.4) covers each of them.

### (i.7) The re-measured compatibility — the exact commands and the exact bytes

The M3 capture harness was reconstructed (the previous wave's harness was deleted before its commit, as the record requires) and **reproduces the previous wave's six captures byte for byte** — 1847 / 1492 / 33157 / 33120 / 8936 / 9047 bytes, which is what makes the cross-commit comparison below meaningful rather than a comparison of two different measurements.

**The platform renderer path, the SAME stored AST, `109e2d3d` vs this wave's HEAD:**

| surface | at `109e2d3d` | at this wave's HEAD | verdict |
| --- | ---: | ---: | --- |
| cart | 1847 B | 1847 B | **byte-identical** |
| checkout | 33157 B | 33157 B | **byte-identical** |
| account | 718 B | 718 B | **byte-identical** |

**This wave's HEAD vs the previous wave's stored captures** (the same harness, the same ASTs): all six are byte-identical — cart 1847 / 1492, checkout 33157 / 33120, account 8936 / 9047. The fixes moved nothing on the platform path.

**The declined-template storefront surface** — the one surface the 18-surface capture never covered — differs between `109e2d3d` and this wave's HEAD by exactly **one** insertion: the D5 named frame (`<div data-fq-theme-state="declined-template" data-fq-template="search" class="fq-declined-template">` and the label *"… this theme does not design the Search results page"*). The theme's header chrome, the theme's footer chrome and the route's own platform surface are byte-identical on both sides (1816 → 2104 characters). The D5 frame is the ratified Task 3 change; the F1 defect (a payload with **no** chrome at all) is not a change from `109e2d3d` — it is a change **back** to `109e2d3d`'s behaviour.

### (i.8) The commit for every §7-prohibited existing file, one line per file

**Why this appendix comes after the code commit.** §7.1's ordering is that no §7-prohibited file is edited before the record **names and ratifies** it. §(i.1.2), §(i.1.3) and §(i.1.4) did exactly that, in the two record commits that precede the wave's code commit (`ecbadffb`, `4886fae8`). This appendix fills in the one thing that could not be written before the fact — **the commit identifier** of each file's first edit — and it introduces **no new relaxation**: every file below was already enumerated and ratified before it was edited.

**The 36 §7-prohibited existing files, with the commit that first edited them and the ratification that covers each.**

| beyond-G1 existing file | first edited | ratified |
| --- | --- | --- |
| `src/components/builder/PublishModal.tsx` | `0ebaaa5b` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/builder/SectionRenderer.tsx` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/builder/songoskriti-port-freeze.test.tsx` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/store/account-dashboard.contract.test.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/store/AccountDashboard.test.tsx` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/store/ThemePreviewFrame.test.tsx` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/components/store/ThemePreviewFrame.tsx` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/builder-ast-extension.test.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/preview-sources.ts` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/storefront.server.ts` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/studio/catalog-dedup.test.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/studio/catalog.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/template-key-contract.test.ts` | `0ebaaa5b` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/template-persistence-isolation.test.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/template-variants.test.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/template-variants.ts` | `0ebaaa5b` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/theme-preview-nav.test.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/theme-preview-nav.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/builtin-themes.ts` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/theme-shell-slots.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes-official-catalog.test.ts` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/claims-activation.test.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/presentation-claims-activation.test.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/presentation-claims.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/preview-demo-data.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/preview.test.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/preview.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/template-distinctness.ts` | `4b522b93` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/theme-variation-preview.test.ts` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/widget-data.server.ts` | `5f283eb1` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/widget-e2e-workflow.test.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/widget-help.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/lib/widget-metadata.test.ts` | `3ca5e8ad` | yes — owner's standing instruction, 2026-10-22 |
| `src/routes/store.$slug.search-composition.test.tsx` | `21907047` | yes — owner's standing instruction, 2026-10-22 |
| `src/routes/theme-preview.$key.tsx` | `21907047` | yes — owner's standing instruction, 2026-10-22 |

**The 11 G1 files** are listed with their commits in §(i.1.1); they carry the plan's own named relaxation and need no file-by-file ratification.

### (i.9) The marker's clause — its final form (a precision note to §(i.2))

§(i.2) quoted the clause in its lower-case form, as the wave wrote it. The split marker ships the clause as its own sentence — **"Payment selection changes this preview only."** — so the shared sentence stands alone as **"Disabled in preview"** and the clause reads as a sentence rather than as a colon-glued continuation. The words are unchanged; only the capitalisation and the boundary moved, and the existing assertion was re-pinned **stronger** (`src/components/store/ThemePreviewFrame.test.tsx`: the clause's new form, the shared sentence standing alone as its own element, and the old colon-glued form **gone**). The clause remains **English-only** and remains **outside the translation meter**, for the reasons in §(i.2). No Bangla copy was authored.

# Phase 4 — Task 5: the proof lane (the browser lane that proves the storefront matches)

**Recorded:** 2026-10-22 · **Branch:** `frame30` · **Base commit:** `f1df5135` · **Task brief:** `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/task-5-brief.md` (steps 5.1–5.4) · **Plan:** `docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md` (Task 5) · **Dispatch:** part 1 of Task 5 (the lane and the strengthened lanes); steps 5.5–5.6 are a separate dispatch.

This appendix is **append-only**: nothing above is rewritten, because the record is evidence and evidence is corrected by a dated correction, never by erasure. It is written **before** any §7-prohibited file this task touches is edited, and it is committed **before** the code commit it governs (§7.1's ordering, proved for the previous waves in §(h.6)).

---

## (j.1) The finding — what the platform actually does at the publish step (measured, not assumed)

**The finding.** The plan's Task 5 asks for a lane that proves *edit → save → reload → publish → the storefront matches*. The proof's hinge is the **publish**, and the publish is **gated by the platform's own content gate** — so the lane must assert the platform's contract in BOTH branches and must never convert a refusal into a pass. Three measurements decide the lane's shape. All three were measured on this tree, at this commit.

| # | the measurement | how it was measured | what it forces on the lane |
| --- | --- | --- | --- |
| 1 | **The theme's own lint is clean for all ten templates** — the publish modal's confirm is enabled whenever the document has changes | `lintTemplate(doc.templates[key], key)` over Songoskriti's shipped bodies, measured in this task's own harness | the lane's publish step can reach the server, so the lane can read the platform's real outcome |
| 2 | **The server's publish gate REFUSES the shipped theme**: the bilingual coverage of the shipped bodies is **76 %** (234 authored pairs, 179 ok) and the gate's floor is **90 %** — *"বাংলা translation coverage is 76% — publishing needs at least 90%."* | `translationCoverage(shippedBodies)` + `authoredCoverage` + `translationGate` over the same bodies | the publish is refused **today**, by a content finding the prior programme already recorded as an **owner action** (`phase3-evidence.md` §4.1). The lane must therefore assert the refusal contract (the pointer untouched, the reason named) and report the proof as **not completed** — a skip, never a pass |
| 3 | **The cart's composition has ONE `<h1>` claimant by construction**, and a merchant-authored heading on the lines block would make it two — *"More than one widget claims the page `<h1>` — only one may be the primary heading."* (a **lint error**, which **disables the publish modal's confirm**) | `lintTemplate` over the shipped cart body, then over the same body with a non-blank `cart_lines.heading` | the lane's cart journey **must not** create a second claimant: it edits the lines block's heading only, and the publish step must handle a **disabled** confirm (the platform's refusal, named in the modal) as a first-class branch |

**The lane's verdict, stated once.** A publish that **succeeds** must be visible on the storefront (the merchant-authored marker IS there and the old text is NOT); a publish that is **refused** must leave the published pointer untouched, must **say why**, and must not half-apply (the old text is still there and the marker is not). A lane that cannot find the marker **fails**; a lane whose publish the platform refused reports a **skip with the platform's own reason** — never a pass.

## (j.2) The files this task touches

**NEW files — §7-allowed, no relaxation needed** (*"a NEW file needs no relaxation"*, `phase3-archive-key-escalation.md:33`):

| file | what it is |
| --- | --- |
| `.e2e/songoskriti-dynamic-themes.spec.ts` | the proof lane: one test per surface (Cart, Account, Checkout) plus the *"no session is ever faked"* guard |
| `.e2e/songoskriti-dynamic-themes-helpers.ts` | the lane's helpers: the editor steps, the publish contract, the storefront assertions and the permitted-interaction steps |
| `src/lib/themes/songoskriti/distinctness-dynamic.test.ts` | the distinctness gate's re-run for the new compositions (the `cart` row's forbidden `orders_list`, the `checkout` row's no-authored-field/no-price rule, and the *"every template a theme does not author is rejected as generic"* loop) |

**EXISTING files — §7-prohibited** (*"existing `.e2e/**` files (specs and `playwright.config.ts`)"*, port spec §7). The plan's Task 5 file list marks both of them **"Modify (allowed)"**; §7 still prohibits them, so both are escalated here, by name, with their exact edits.

| file | on the plan's Task 5 list? | the edit |
| --- | --- | --- |
| `.e2e/songoskriti-seven-templates.spec.ts` | **yes — "Modify (allowed)"** | **one addition**: after the publish, the journey asserts the **changed** composition on the storefront (the spacer the journey authored, at the height it edited). **Every existing assertion is kept**; nothing is weakened, removed or skipped |
| `.e2e/songoskriti-storefront-surfaces.spec.ts` | **yes — "Modify (allowed)"** | **one addition**: three permitted-interaction cases (the checkout's payment rail, the account's tab, the cart's quantity stepper) + the import of the shared helpers. **Every existing assertion is kept** |

**The owner's ratification.** The owner's standing instruction of 2026-10-22 (*"whatever goes, as per the expert opinion"*) covers these two files as it covers the 36 beyond-G1 files of §(i.1.4): it relaxes §7 for the files named here and for nothing else, it sets no precedent, and it moves none of the plan's other constraints (no new dependency, no weakened test, no migration, no deploy). The plan's own Task 5 file list already names both files as editable, so this record **names the exact edit** rather than widening the boundary.

## (j.3) The exact old → new diffs

Each block below is appended **before** the file it names is edited. The applied diffs are re-stated in §(j.5) as committed.

### (j.3.1) `.e2e/songoskriti-seven-templates.spec.ts` — the journey asserts the CHANGED composition

**The edit.** One block, inserted between the publish contract (§9) and the storefront navigation (§10). It asserts the **edited node's presence on the storefront** — the spacer the journey inserted and set to **56 px** — and it does so **against the platform's own outcome**: a publish that succeeded must show it; a publish that was refused must NOT show it (a refusal never half-applies). Every existing assertion of the journey is untouched.

```ts
    // The CHANGED composition on the storefront. The journey edited the
    // spacer it inserted (56 px), so the storefront must carry that node —
    // against the platform's own outcome: a publish that advanced the
    // pointer must be visible, and a refused publish must not have
    // half-applied.
    const editedSpacer = page.locator(
      'div[aria-hidden="true"][style*="height: 56px"]',
    );
    if (publish.outcome === "published") {
      await expect(
        editedSpacer.first(),
        "the edited spacer (56px) is on the storefront after the publish",
      ).toBeVisible({ timeout: 30_000 });
    } else {
      expect(
        await editedSpacer.count(),
        "a refused publish did not half-apply: the storefront still serves the published composition",
      ).toBe(0);
    }
```

**Why the spacer's DOM is the marker.** The platform's spacer renders `<div aria-hidden="true" style={{ height: int("size", 32, 8, 160) }} />` (`src/components/builder/widgets.tsx:1449`) and the Songoskriti pack claims no `spacer` presentation (`src/lib/themes/songoskriti/presentation-claims.ts`), so the storefront renders the platform's own node — and the journey's final edit (48 → 56 px) is the value it carries.

### (j.3.2) `.e2e/songoskriti-storefront-surfaces.spec.ts` — three permitted-interaction cases

**The edit.** One import (the shared helpers this task creates) and **three new cases** inside the existing `describe("the storefront surfaces")` block. **Nothing existing is changed, removed or weakened.**

```ts
import {
  DYNAMIC_STORE,
  changeCartQuantity,
  choosePaymentRail,
  ensureCartHasLine,
  switchAccountTab,
} from "./songoskriti-dynamic-themes-helpers";
```

| # | the case | what it asserts |
| --- | --- | --- |
| 1 | the composed checkout's payment rail can be chosen and the selection sticks | the theme's `payment_methods` widget renders the rails the **server** offered; a rail can be chosen; the choice survives the server's re-quote |
| 2 | the composed account's tab can be switched and the panel changes | the theme's placed nav switches the tab (`aria-selected` moves, the URL carries the tab) and the **panel** changes — the orders panel is replaced by the addresses panel |
| 3 | the composed cart's quantity stepper changes the cart and the quote follows | the theme's line row renders the quantity stepper; increasing it changes the quantity and the **server's quote** (the total row changes) |

### (j.4) The ordering proof

§7.1's ordering is that no §7-prohibited file is edited before this record **names** it. The order of this task's commits is therefore:

1. **this record** (the two existing `.e2e` files named, with their exact edits) — committed **before** the edits;
2. **the code** — the three new files and the two strengthened `.e2e` files;
3. **the appendix** naming the code commit, appended to this record (the §(i.8) precedent).

The three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/` are **not** staged, **not** committed and **not** touched by this task.

## (j.5) The applied diffstat and the applied diffs

*(appended below, after the code commit — the §(i.8) precedent)*

## (j.6) The Task 5a corrections — recorded before the code commit

*(Append-only, dated 2026-10-22. These correct the lane's own shape; they do not move any pinned output and they touch no file outside Task 5's five-file list.)*

Three corrections were made while writing the lane, each because the tree's measured behaviour contradicted the first draft. They are recorded here **before** the code commit that carries them.

1. **The cart journey clears the summary's title as well as editing the lines block's heading.** `.e2e/songoskriti-dynamic-themes.spec.ts`'s first draft edited `cart_lines.heading` only, and §(j.1) measurement 3 predicted exactly what that does: the summary's `Order summary` is already the body's one `<h1>` claimant, so a non-blank lines heading makes **two** and the publish modal's confirm is disabled by the platform's lint. A proof lane must not manufacture its own refusal, so the journey now clears `cart_summary.heading` through the **same schema-generated inspector control** before saving. The lines marker is then the body's single claimant, the summary's old title is the "old text" the success branch asserts is gone, and the only remaining gate is the server's own translation gate. This supersedes §(j.1) measurement 3's "leaves the summary's title alone" clause; the measurement itself is unchanged.

2. **The seven-template journey's new assertion is scoped to storefront routes.** The inserted spacer is read from `div[aria-hidden="true"][style*="height: 56px"]`. A successful publish must show it; a refused publish must not have half-applied it. The `archive` journey's route is `/theme-preview/songoskriti?template=archive`, and the preview resolves the merchant's **latest version** rather than the published pointer (`src/lib/preview-sources.ts`), so a save that was never published legitimately appears there. The assertion therefore applies the refusal branch only to `/store/…` routes, and the archive journey keeps every existing assertion it had. The success branch applies to all seven.

3. **The markers are unique per run, and the refusal branch is judged by the pointer and the absent markers.** A fixed marker string could be left behind by an earlier run's published composition and make a later refusal look half-applied (or a later success look pre-existing). Each marker now carries a per-run token. A refusal is proved by the untouched published pointer plus the absence of **this run's** live and draft markers; the published composition's own copy is deliberately not asserted, because it may legitimately be an earlier run's composition.

## (j.7) The applied diffstat and the commits (appended after the code commit)

**The record commit (before the edits):** `ab432e0e` — *"docs(record): the proof lane's three measured corrections, before the edit"* (this section (j.6)).

**The code commit (the five files Task 5's list names):** `d9e4774e` — *"test(e2e): the cart, account and checkout journeys prove the storefront matches"*

```
 .e2e/songoskriti-dynamic-themes-helpers.ts         | 464 +++++++++++++++++++++
 .e2e/songoskriti-dynamic-themes.spec.ts            | 384 +++++++++++++++++
 .e2e/songoskriti-seven-templates.spec.ts           |  24 ++
 .e2e/songoskriti-storefront-surfaces.spec.ts       |  62 +++
 src/lib/themes/songoskriti/distinctness-dynamic.test.ts | 249 +++++++++++
 5 files changed, 1183 insertions(+)
```

**What the diff proves about the two existing `.e2e` files.** Both are additions only: the seven-template journey gains the 24-line changed-composition block (all of its existing assertions are untouched), and the storefront-surface lane gains one import and three new cases (no existing case is edited, weakened or skipped). The three new files carry no edit to any prohibited path.

**The boundary.** The three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/` are unstaged and unmodified by these commits. No migration, no dependency, no deploy.

## (k) The Task 5b corrections — recorded before the edit

*(Append-only, dated 2026-10-22. First live execution of the Task 5 lanes on the throwaway stack. Two defects in `.e2e/songoskriti-seven-templates.spec.ts` — a §7-prohibited existing file — were measured, not inferred. They are named here with their exact edits **before** the edit, and this section is committed before the code commit it governs (§7.1's ordering, the §(h.6)/(i.8)/(j.6) precedent). No assertion is weakened: both blocks keep every claim they made and gain the placement/expectation that makes the claim true.)*

### (k.1) The 9b assertion ran against the EDITOR canvas, not the storefront

**Measured.** The 24-line block §(j.3.1) added runs immediately after `attemptPublish(page)` and before `page.goto(journey.route, …)`. At that moment the page is still `/dashboard/builder`, so `page.locator('div[aria-hidden="true"][style*="height: 56px"]')` counts the **editor canvas's** copy of the spacer the journey just set to 56 px. On a refused publish the block therefore read `1` (the first attempt) and `2` (the retry, whose draft already carried the prior attempt's spacer) and failed with *“a refused publish did not half-apply: the storefront still serves the published composition”* — a false alarm: the **published** version (`1dde62b3`, version 1) carries no `"size": 56` spacer at all, and an anonymous `GET /store/frame19-demo/search?q=saree` served `themeVersionId:"1dde62b3"` with zero 56 px spacers. The storefront was correct; the assertion looked at the wrong document.

**The edit.** Move the whole 9b block **after** the real storefront navigation and its own `journey.storefront(page)` assertions, so it reads the served document. The branches, the locator, the `/store/` scoping of the refusal branch and every existing assertion are unchanged.

```diff
     // 9b. The CHANGED composition on the storefront. …
-    const editedSpacer = page.locator(
-      'div[aria-hidden="true"][style*="height: 56px"]',
-    );
-    if (publish.outcome === "published") {
-      await expect(
-        editedSpacer.first(),
-        "the edited spacer (56px) is on the storefront after the publish",
-      ).toBeVisible({ timeout: 30_000 });
-    } else if (journey.route.startsWith(`/store/`)) {
-      expect(
-        await editedSpacer.count(),
-        "a refused publish did not half-apply: the storefront still serves the published composition",
-      ).toBe(0);
-    }
-
     // 10. The real storefront route.
     await page.goto(journey.route, {
       waitUntil: "domcontentloaded",
       timeout: 120_000,
     });
     expect(page.url(), "the storefront route answers").toContain(
       journey.route.split("?")[0]!,
     );
     await journey.storefront(page);
+
+    // 9b. The CHANGED composition on the storefront — read from the SERVED
+    //     document, after the navigation above. …
+    const editedSpacer = page.locator(
+      'div[aria-hidden="true"][style*="height: 56px"]',
+    );
+    if (publish.outcome === "published") {
+      await expect(
+        editedSpacer.first(),
+        "the edited spacer (56px) is on the storefront after the publish",
+      ).toBeVisible({ timeout: 30_000 });
+    } else if (journey.route.startsWith(`/store/`)) {
+      expect(
+        await editedSpacer.count(),
+        "a refused publish did not half-apply: the storefront still serves the published composition",
+      ).toBe(0);
+    }
```

### (k.2) The Account journey's layer list predates the rebuilt account composition

**Measured.** The journey asserted `layers: ["Shopper profile", "Page content"]`. The editor's navigator now lists `["Account navigation", "Account overview", "Account orders", "Page content"]` — the composition this programme rebuilt (`commerce-compositions.test.ts` names `account_nav`, `account_overview`, `account_orders`, `account_details`, plus the host's `page_content`). The old `Shopper profile` layer no longer exists in the authored account body, so the lane failed at the pre-insert layer check on both attempts.

**The edit.** Replace the two stale names with the four the composition actually authors. The check is still "every named layer the journey will touch is present"; nothing is removed from the storefront assertions.

```diff
   {
     label: "Account",
-    layers: ["Shopper profile", "Page content"],
+    layers: [
+      "Account navigation",
+      "Account overview",
+      "Account orders",
+      "Page content",
+    ],
```

### (k.3) Ordering proof and boundary

The commits are: **(1)** this record (both corrections named, exact diffs above) — committed before the edits; **(2)** the single-file code edit to `.e2e/songoskriti-seven-templates.spec.ts`; **(3)** the appendix naming (2)'s commit, appended to this record.

No other file is edited by this correction. The test is not weakened: §(k.1) changes *where* the storefront assertion reads, and §(k.2) renames the expected layers to the composition the programme shipped. No skip is added, no assertion is deleted, no threshold moves. The three churn files and the untracked `.output-snapshots/` remain unstaged.

## (k.4) The second live run's two remaining lane defects — recorded before the edit

*(Append-only, dated 2026-10-22, continuing §(k). First run after §(k.1)/(k.2): six of eight tests passed; one failed and one was flaky. Both causes were measured in the run output. This section names the edits **before** they are made; the record commit precedes the code commit as in §(k.3).)*

### (k.4.1) The layer check read the navigator before it hydrated

**Measured.** `the editor journey: Blog` failed on its first attempt with `Received array: []` and passed on retry. `layerNames(page)` reads `document.querySelectorAll('[role="treeitem"]')` immediately after `openTemplate()`, whose only settle is a fixed `waitForTimeout(1_500)`. On a cold SSR route the navigator can still be empty after 1.5 s, so the check asserts against an unrendered panel — a race in the lane, not a missing layer.

**The edit.** Make `layerNames()` wait until the navigator has at least one `treeitem` (or the page reports the empty composition after a generous timeout), so every journey reads a settled panel. No expectation changes.

```diff
 async function layerNames(page: Page): Promise<string[]> {
+  await page
+    .waitForFunction(
+      () => document.querySelectorAll('[role="treeitem"]').length > 0,
+      undefined,
+      { timeout: 60_000 },
+    )
+    .catch(() => {
+      /* an empty composition is a legitimate state; the assertions report it */
+    });
   return page.evaluate(() =>
     Array.from(document.querySelectorAll('[role="treeitem"]')).map((el) =>
       (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
     ),
   );
 }
```

### (k.4.2) `getByText("Filters").first()` matched the hidden mobile drawer trigger

**Measured.** `the editor journey: Search results` failed with *“the theme's search composition renders its own facet panel”*: `getByText("Filters", { exact: true }).first()` resolved to `<button …>Filters</button>`, whose value was `hidden` at the 1280 px desktop viewport. The rendered document carries the facet panel's own **heading** `<h2>Filters</h2>` (visible), plus that drawer trigger (hidden on desktop). The assertion is about the panel, so it must select the heading.

**The edit.** Assert the visible heading instead of the first text node. The claim — the theme renders its own facet panel — is unchanged.

```diff
       await expect(
-        page.getByText("Filters", { exact: true }).first(),
+        page.getByRole("heading", { name: "Filters", exact: true }).first(),
         "the theme's search composition renders its own facet panel",
       ).toBeVisible({ timeout: 30_000 });
```

### (k.4.3) The dynamic lane's add-to-cart step can click before hydration

**Measured.** On the first dynamic run the cart journey failed at *“the product page confirms the add”* (`Added to cart` never appeared) and the retry reached the publish step. A click on the product page's `Add to cart` can land before React has hydrated the island, in which case the click is a no-op. The same hydration marker the shipped login helper waits for (`__reactProps$` on the submit button) applies here.

**The edit.** New file `.e2e/songoskriti-dynamic-themes-helpers.ts` (a Task 5a NEW file — §7-allowed, no relaxation): wait for the add button's React props before clicking it. No assertion is weakened; the existing “Added to cart” confirmation stays.

### (k.4.4) Ordering and boundary

Commits: **(1)** this section; **(2)** the single-file edit to `.e2e/songoskriti-seven-templates.spec.ts` (k.4.1 + k.4.2) and the helper edit (k.4.3); **(3)** the appendix naming (2). No skip is added, no assertion is removed, no threshold moves.

### (k.5) Appendix — the code commit this record preceded

*(Append-only, dated 2026-10-22, closing §(k.4).)*

The record commit for §(k.4) is `9e41c496`. The code commit it named arrived after it, as required:

- `25e5e494` — `fix(e2e): settle the layer navigator and hydrate the product buy box` — `.e2e/songoskriti-seven-templates.spec.ts` (k.4.1 `layerNames()` wait, k.4.2 the facet-panel heading) and `.e2e/songoskriti-dynamic-themes-helpers.ts` (k.4.3 the hydration wait). Two files, +30/-1.

`prettier --check` passed on both files and `tsgo --noEmit` exited 0 before the commit. No assertion was deleted, no skip added, no threshold moved. The churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/` remain unstaged.

## (k.6) The storefront-surfaces lane's two defects — recorded before the edit

*(Append-only, dated 2026-10-22, continuing §(k). First run of `.e2e/songoskriti-storefront-surfaces.spec.ts` on the Task 5b stack: 7 passed, 1 skipped, 1 flaky, 2 failed on both attempts. Both failures were measured from the run's own snapshots and error contexts. This section names the edits **before** they are made; the record commit precedes the code commit as in §(k.3) and §(k.4).)*

### (k.6.1) The surfaces search check selects the hidden mobile drawer trigger

**Measured.** `the search route renders the theme's composition with the platform's own result count` failed on both attempts: `getByText("Filters", { exact: true }).first()` resolved to `<button type="button">Filters</button>`, `unexpected value "hidden"`. This is the same defect §(k.4.2) fixed in the seven-templates lane, present independently in this file. The accessibility snapshot of the same page shows the rendered facet panel as `complementary "Filters"` carrying `heading "Filters" [level=2]`, visible; the hidden node is the compact drawer trigger.

**The edit.** Select the visible heading, as in §(k.4.2). The claim — the theme renders its own facet panel — is unchanged.

```diff
       await expect(
-        page.getByText("Filters", { exact: true }).first(),
+        page.getByRole("heading", { name: "Filters", exact: true }).first(),
         "the theme's search composition renders its own facet panel",
       ).toBeVisible({ timeout: 30_000 });
```

### (k.6.2) The checkout-position check assumes a cart line it never creates

**Measured.** `the checkout asks for the address first and shows the rail and the total below it` failed on both attempts at `getByText("Total", { exact: true }).first()` — *element(s) not found*, 30 s. Its error context shows the platform form rendered and the theme's order summary in its honest empty state: `paragraph: Add something to see your total.` The test opened `/checkout` in a fresh browser context and never put a line in the cart, so no total exists to place. The assertion is about *where the total sits*, so its precondition is a real cart line.

**The edit.** Establish that precondition through the storefront's own flow, with the shipped `ensureCartHasLine()` helper the cart-stepper case already uses — a real product page add, never a seeded cart. Nothing about the position assertions changes.

```diff
   test("the checkout asks for the address first and shows the rail and the total below it", async ({
     page,
   }) => {
+    // The theme's order summary reads the SERVER's quote; with an empty cart
+    // it honestly renders "Add something to see your total." and there is no
+    // total to place. The assertion is about where the total sits, so its
+    // precondition is a real line, through the storefront's own flow.
+    await ensureCartHasLine(page);
     await open(page, `/store/${STORE}/checkout`);
```

### (k.6.3) The one flake, left as a flake

`the composed cart's quantity stepper changes the cart and the quote follows` failed once and passed on retry. The failure screenshot is a blank document, and the app log at that instant carries exactly two client-side exceptions, both on this route:

```
{"level":"error","event":"exception","message":"Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!","route":"client/store/frame19-demo/cart","mechanism":"unhandledrejection"}
{"level":"error","event":"exception","message":"Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!","route":"client/store/frame19-demo/cart","mechanism":"onerror"}
```

No retry logic is added and no assertion is relaxed: the lane still fails if the cart does not render. This is a dev-server client-router bootstrap race on one of ~14 navigations in the run (it never recurs in any other lane, including the same route in the passing surfaces test and in the seven-template Cart journey). It is reported as a flake in the Task 5b report, not treated as a pass.

### (k.6.4) Ordering and boundary

Commits: **(1)** this section; **(2)** the single-file edit to `.e2e/songoskriti-storefront-surfaces.spec.ts`; **(3)** the appendix naming (2). No skip is added, no assertion is weakened or removed, no threshold moves, no test is re-ordered. The churn files and `.output-snapshots/` remain unstaged.

### (k.6.5) Appendix — the code commit this record preceded

*(Append-only, dated 2026-10-22, closing §(k.6).)*

The record commit for §(k.6) is `fb0dad77`. The code commit it named arrived after it:

- `64199757` — `fix(e2e): select the facet heading and seed the checkout total's precondition` — `.e2e/songoskriti-storefront-surfaces.spec.ts` only, +6/-1 (k.6.1 the heading selector, k.6.2 the `ensureCartHasLine(page)` precondition, with its comment). No other edit.

`prettier --check` passed and `tsgo --noEmit` exited 0 before the commit. The churn files and `.output-snapshots/` remain unstaged.

## (k.7) The parity baselines — measured, classified, and re-frozen on the throwaway stack

*(Append-only, dated 2026-10-22, continuing §(k). The first parity run of Task 5b is the measurement below. This section is committed **before** the snapshot update it authorises, as in §(k.3)/(k.4)/(k.6).)*

### (k.7.1) What the run measured

`playwright test --config=.e2e/playwright.config.ts songoskriti-port-parity --retries=0`: **39 passed, 27 failed, 1 skipped**. The 27 failures split cleanly:

- **21** baselines exist and no longer match, at ratios **0.03–0.12** (threshold `maxDiffPixelRatio 0.02`, `threshold 0.2`, unchanged);
- **6** baselines do not exist at all — `archive-{1440,768,375}-{en,bn}-chromium-linux.png`. The archive capture was added to the lane without ever being frozen; Playwright wrote the actuals and failed "A snapshot doesn't exist". Confirmed against `git status`: those six files were untracked before this run, and `docs/.../port/reference/` carried no `archive-*.png`.

The five templates that pass are **index, product, collection, blog, search** — i.e. every surface that was *not* rebuilt in the Task 2/4 wave either visually or in the preview resolution pipeline. The failing surfaces are exactly the ones that were.

### (k.7.2) The named differences (visual comparison, not "pixels moved")

The baselines were frozen at `afde2871` (2026-10-21 05:35), **before** `4b522b93` (*the cart, checkout and account compositions rebuilt on the composable pieces*, 2026-10-22 09:51) and `21907047` (*one resolution pipeline — the canvas, the preview and the storefront agree*, 2026-10-22 10:32).

- **cart (6 stills)** — the theme's rebuilt cart: the composition's own preview notice band (`Disabled in preview — Payment selection changes this preview only.`), product names at the theme's uppercase/bold line treatment, `REMOVE` at its own type size, and the order summary in the theme's own display type instead of the platform panel's condensed heading. Data is identical in every still: the same three lines, the same **18,500 / 2,850 / 1,850**, the same **Subtotal 23,200 / Delivery 60 / Total 23,260**.
- **checkout (4 stills)** — same notice band, the payment block loses the platform's boxed fieldset chrome for the theme's heading + rule treatment, headings take the theme's display type, and the page regains the vertical rhythm of the composition. Rails, labels, steps and amounts are unchanged: **23,200 / 60 / 23,260**, four steps, the same five accept marks. This is the change §(h.7) measured as 162 → 162 tags and 306 → 306 characters — no control, label, step or amount added or removed.
- **account (5 stills)** — the rebuilt account composition is now actually on screen: the five-tab nav (Orders / Addresses / Wishlist / Profile / Privacy), the `AT A GLANCE` overview (3 orders, latest ORD-2477 packed, default address Dhaka, 2 saved items) and `VIEW ORDER` on each row. Same three orders, same numbers and statuses as the baseline. This is the M5 "no panel is blank" state; the baseline predates it. At 375 px the tab row is a horizontally scrollable rail (Wishlist clipped at the viewport edge) — the composition's own overflow behaviour, not a broken document.
- **page (6 stills)** — the merchant page's text is byte-for-byte the same title, lead, four body paragraphs and `Last updated: 20/10/2026`; only the type scale changed (the `<h1>` is larger, the rule above it is new). This is the same theme display-type language reaching the `page` composition.
- **archive (6 stills, new)** — the theme's archive composition: breadcrumb, centred `Archive` masthead, `Browse the archive` with the taxonomy chips (`Craft 1`, `Fabric 2`, `Care 1`, `Provenance 1`, `handloom 3`) and the article grid. No baseline existed to compare against; the content is the disposable stack's own seeded taxonomy and articles, and the seven-template lane already asserts the archive preview renders the theme's six slots.

No still shows a content regression: no missing line, amount, status, article or field; no clipped heading beyond the account tab rail's horizontal scroll; no unloaded image beyond the Bangla tofu that every bn baseline already carries (the capture blocks external fonts by design).

### (k.7.3) The decision

**Re-freeze, on the throwaway stack only.** Every difference is the ratified theme-path presentation change of §(h.7) (cart/checkout/account) or its continuation onto the rebuilt `page` and newly captured `archive` compositions — the same change the seven-template and storefront-surfaces lanes assert functionally. Nothing differs for an unrelated reason, so the alternative ("report as defect") does not apply.

What is frozen:

- the 21 stale machine baselines under `.e2e/songoskriti-port-parity.spec.ts-snapshots/`, and the 6 archive baselines that never existed;
- fresh human stills under `docs/superpowers/songoskriti-evidence/port/after/` via `PORT_CAPTURE_OUT=after` — the **after** half of the evidence;
- the **before** half is kept: the 21 superseded baselines and the 6 measured archive actuals are copied to `/tmp/opencode/e2e-auth/parity-before/`, and the old human stills remain in git at `.e2e/...-snapshots/` history and `docs/.../port/reference/` at `7085eb27`'s tree.

No threshold moves, no case is skipped, no assertion is removed. The lane is re-run after the freeze as an unmodified pass/fail check.

**Deviation, recorded:** the first parity run used the default `PORT_CAPTURE_OUT`, so it overwrote 25 tracked stills and the manifest under `docs/.../port/reference/`. Those files were restored with `git checkout --` before the freeze, and both the freeze run and the verification run use `PORT_CAPTURE_OUT=after`, so `reference/` is untouched from here on.

### (k.7.4) Appendix — the freeze, and the unmodified re-run

*(Append-only, dated 2026-10-22, closing §(k.7).)*

The record commit authorising the re-freeze is `45b5c900`. The freeze ran after it:

- `45b5c900` — `docs(evidence): classify the parity stills and authorise the re-freeze`
- freeze run (`--update-snapshots`, `PORT_CAPTURE_OUT=after`): **66 passed, 1 skipped, 0 failed** (8.3 m)
- verification run (no `--update-snapshots`, same env): **66 passed, 1 skipped, 0 failed** (8.1 m)

The single skip is the pre-existing, documented `chrome-mobile-drawer-375-bn` manual-review case (drawer does not open for `lang=bn` at 375 px; `SKIPPED` in the spec carries the reason and no baseline is written). It is not a pass.

Artifacts committed with this appendix's parent: 27 machine baselines (21 re-frozen + 6 archive added), 65 human `after/` stills, and `reference-manifest.json` stamped `freezeSha: 45b5c900bb10`. The `reference/` stills are untouched from their pre-run state; the superseded baselines remain retrievable from git history and from `/tmp/opencode/e2e-auth/parity-before/`.

## (k.8) The build blocker — the search route's server-only import, recorded before the edit

*(Append-only, dated 2026-10-22. This section concerns the §7-prohibited file `src/routes/store.$slug.search.tsx`; it is written and committed **before** that file is edited, per the plan's §7.1 ordering. Nothing above is rewritten.)*

### (k.8.1) What the build measured

`node_modules/.bin/vite build` fails at HEAD `9f6b52ab`. The client environment's import-protection plugin denies the dynamic import the search loader added in `4b522b93`:

```
[plugin tanstack-start-core:import-protection]
RolldownError:
[import-protection] Import denied in client environment

  Denied by file pattern: **/*.server.*
  Importer: src/routes/store.$slug.search.tsx
  Import: "src/lib/widget-data.server"
  Resolved: src/lib/widget-data.server.ts

  Trace:
    1. src/router.tsx:3:28 (entry) (import "./routeTree.gen")
    2. src/routeTree.gen.ts:112:54 (import "./routes/store.$slug.search")
    3. src/routes/store.$slug.search.tsx (import "src/lib/widget-data.server")
```

The route is in the client module graph (`routeTree.gen.ts` imports it), so a `loader` cannot statically or dynamically import a `*.server.*` module — the bundler sees the import edge even though the loader runs on the server. The same block also carried `await import("@/lib/storefront-host.server")` (`src/routes/store.$slug.search.tsx:126-127` at the base commit); the plugin reports the first denial and would report the second after it. A red build means no deploy is possible.

### (k.8.2) The canonical mechanism

TanStack Start's supported seam for server-only logic reachable from a client-imported route is a `createServerFn(...).handler(...)`. The codebase already has that seam for exactly this resolver: `resolveWidgetDataFn` in `src/lib/widget-data.functions.ts:43-74` — *"The single storefront data call"* — whose handler dynamically imports `./widget-data.server` (`src/lib/widget-data.functions.ts:62`) and `./storefront-host.server` (`:63-64`). The build accepts it because the handler body is server-only; the route only imports the server function's RPC stub, not the server modules.

The repair therefore:

1. extends `resolveWidgetDataFn` with the **optional** query scope the search route already computes (`facets`, `total`) and forwards it to `resolveWidgetData`'s existing `opts` (`src/lib/widget-data.server.ts:1363-1380`, `1395-1402`) — the resolver already supports it, so no resolver change;
2. replaces the route loader's two `.server` imports and direct `resolveWidgetData` call with one call to that server function, keeping `searchFacetScope(outcome)` and `...(facetScope ?? {})` exactly where they were.

This is the same consumption pattern as the rest of the storefront: `store.$slug.search.tsx` already calls `searchStorefrontFn` and `getStoreChrome` (both `createServerFn`) from the loader; the homepage resolves its batch inside `storefront.server.ts`'s `loadStoreChrome`, which the route reaches through `getStorefront`. No data moves to the client, the resolver is not duplicated, and no import guard or config change is used. No new dependency.

**Behaviour is unchanged and pinned:** the batch is still resolved during the loader on the server and shipped in the route payload; `WidgetDataProvider` still feeds the facet sidebar from that map; the facet scope is still the search backend's own facets/total (`S4`); the client still never refetches (no `useQuery` was added); the resolver still tenant-scopes by the merchant the active slug names (`assertTenantId` inside `resolveWidgetData`), and the public function still only resolves published/active catalogue rows for that tenant.

### (k.8.3) The exact old → new diffs

**`src/lib/widget-data.functions.ts`** (existing file, not §7-prohibited; required to carry the scope through the server-fn boundary):

```diff
 const paramValue = z.union([z.string().max(120), z.number(), z.boolean()]);

+/**
+ * The query-scoped facet payload a search results page hands the resolver.
+ * Mirrors `SearchFacets` (`src/lib/storefront-search.ts:51-57`) — the counts
+ * the search backend already computed for THIS query. Bounded, because the
+ * function is public: a client may repeat its own search's scope, never
+ * enlarge the resolver's work.
+ */
+const facetCount = z.number().int().min(0).max(1_000_000);
+const searchFacetsSchema = z.object({
+  categories: z
+    .array(
+      z.object({
+        slug: z.string().min(1).max(120),
+        name: z.string().min(1).max(200),
+        count: facetCount,
+      }),
+    )
+    .max(200),
+  kinds: z
+    .array(z.object({ kind: z.string().min(1).max(60), count: facetCount }))
+    .max(50),
+  in_stock: facetCount,
+  price_min_minor: z.number().int().min(0).nullable(),
+  price_max_minor: z.number().int().min(0).nullable(),
+});
+
 /**
  * Full WidgetDataSource union (see widget-registry.ts) — client-initiated
  * refetches for product-detail/account widgets must validate exactly like the
  * SSR batch serves them.
  */
 export const widgetDataRequestSchema = z.object({
@@
       .object({
         slug: z.string().min(1).max(120),
         requests: z.array(requestSchema).max(MAX_WIDGET_REQUESTS),
+        /**
+         * The search route's query scope (S4). Present only on a search
+         * results page; absent everywhere else, where the facets loader
+         * keeps its own behaviour.
+         */
+        facets: searchFacetsSchema.optional(),
+        total: z.number().int().min(0).max(1_000_000).optional(),
       })
       .parse(d),
   )
@@
       },
       undefined,
-      { base: storeLinkBase(currentRequestHost(), data.slug) },
+      {
+        base: storeLinkBase(currentRequestHost(), data.slug),
+        ...(data.facets
+          ? { facets: data.facets, total: data.total ?? 0 }
+          : {}),
+      },
     );
   });
```

**`src/routes/store.$slug.search.tsx`** (§7-prohibited; this edit is the escalation):

```diff
 import { searchStorefrontFn } from "@/lib/storefront-search.functions";
 import { getStoreChrome } from "@/lib/storefront.functions";
+import { resolveWidgetDataFn } from "@/lib/widget-data.functions";
 import {
   StorefrontError,
   isStorefrontInfrastructureError,
   normalizeStorefrontLoaderError,
 } from "@/components/store/StorefrontError";
@@
     let widgetMap: WidgetDataMap = {};
     if (widgetBundle.requests.length > 0 && chrome) {
       try {
-        const { resolveWidgetData } = await import("@/lib/widget-data.server");
-        const { currentRequestHost, storeLinkBase } =
-          await import("@/lib/storefront-host.server");
         // S4: the sidebar counts the SAME query the grid beside it runs.
         // Without this, `loadFacetsSource` counts the merchant's whole
         // active catalogue and a search for one term shows every product.
         const facetScope = searchFacetScope(outcome);
-        widgetMap = await resolveWidgetData(
-          chrome.merchant.id,
-          widgetBundle,
-          undefined,
-          {
-            base: storeLinkBase(
-              currentRequestHost(),
-              chrome.merchant.slug ?? params.slug,
-            ),
-            ...(facetScope ?? {}),
-          },
-        );
+        // The resolver is reached through the public RPC
+        // (`resolveWidgetDataFn`, `src/lib/widget-data.functions.ts:43-74`),
+        // whose handler runs in a `createServerFn` — the canonical seam that
+        // keeps `widget-data.server` out of the client module graph.
+        widgetMap = await resolveWidgetDataFn({
+          data: {
+            slug: chrome.merchant.slug ?? params.slug,
+            requests: widgetBundle.requests,
+            ...(facetScope ?? {}),
+          },
+        });
       } catch {
```

### (k.8.4) Ratification and boundary

**Ratification.** The programme owner's standing instruction for this wave — *"whatever goes, as per the expert opinion"* — ratifies this single-file repair of a build blocker. It changes no behaviour, no grant set, no test assertion and no threshold; it moves the already-existing server call behind the platform's own server-function seam.

**Boundary.** Only the two files diffed above are edited. No new file, no config change, no import-protection bypass, no dependency, no test edit. The churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` remain unstaged.

**Ordering.** This section is committed first, by explicit path; the code commit follows it. That is the §7.1 ordering the previous sections used.

---

## (l) Task 6 — the stale `CheckoutMock` prose in an existing test file, recorded before the edit

*(Append-only, dated 2026-10-22, continuing the record. The plan's Task 6 (step 6.2) re-words the two prose mentions of the deleted `CheckoutMock` in the same commit as the deletion. One of the two is inside an **existing test file**, which the report's §7 pins as untouched — so the edit is recorded here **before** it is made, as §(k.4) and §(k.6) were.)*

### (l.1) What the citation measured

Task 6.1's citation ran first, at the programme tip `4eef8f5c`:

```
$ grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx
src/components/store/songoskriti-preview-compositions.test.tsx:8:  * never the pack's `SAMPLE` blog rows and never the generic `CheckoutMock`.
src/components/store/CheckoutMock.tsx:4:export function CheckoutMock({
src/components/store/ThemePreviewFrame.tsx:1285:                     SectionRenderer the storefront uses — not `CheckoutMock`.
```

Three hits: the file's own definition and **two comments** that say what the preview does **not** render it as — **no importer** (the plan's A8, O1: the removal is proven unused). The other citations measured the same morning: `genericDemoMain` has no preview consumer left (it is the distinctness gate's reference body — it **stays**); `BlogArchiveTheme` is the archive host's delegated fallback (`ArchiveView.tsx:152`) — it **stays**; `DEMO_CART` is the context's default value — it **stays**. The plan's step 6.2 re-words only the two prose mentions; the deletion and the other re-words are plan-**allowed** file actions (the dead file, the gate's doc comment, the panel copy's state) and are not this section's subject.

### (l.2) The exact old → new diff

The edit is a **prose comment only** — inside the file's module doc block. No import, no assertion, no fixture, no expectation changes; the suite's claim (*the preview renders the theme's own compositions over visibly labelled demo data*) is untouched, and the file is **never weakened**.

**`src/components/store/songoskriti-preview-compositions.test.tsx:7-8`** (§7-prohibited; this edit is the escalation):

```diff
- * demo data — never the studio's `DEMO_CART`, never the shared `DEMO_ORDERS`,
- * never the pack's `SAMPLE` blog rows and never the generic `CheckoutMock`.
+ * demo data — never the studio's `DEMO_CART`, never the shared `DEMO_ORDERS`,
+ * never the pack's `SAMPLE` blog rows; the checkout surface can only be the
+ * theme's authored composition rendered through `SectionRenderer` — the
+ * composition that replaced the generic checkout mock (the file was deleted
+ * 2026-10-22, proven unused by the obsolete-path record's O1).
```

(The same commit's other prose edits — `ThemePreviewFrame.tsx` `:1285`'s *not `CheckoutMock`* clause and the two plan-allowed copy changes — are not §7 relaxations; they are listed here only so this section is the complete description of the Task 6 edit wave.)

### (l.3) Ratification and boundary

**Ratification.** The programme owner's standing instruction for this wave — *"whatever goes, as per the expert opinion"* — ratifies this single-comment re-word that Task 6's own brief demands ("the stale `CheckoutMock` mention at `:8` is re-worded. **Never weakened.**"). It relaxes §7 for one existing test file by eight lines of prose, zero of them executable. It does not set a precedent for any future programme.

**Boundary.** The Task 6 commit touches exactly five paths — the deleted `src/components/store/CheckoutMock.tsx`, the two prose re-words (`ThemePreviewFrame.tsx`, `songoskriti-preview-compositions.test.tsx`), the gate's doc-comment re-word (`src/lib/theme-preview-nav.ts`), and the new obsolete-path record. The churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` remain unstaged.

**Ordering.** This section is committed first, by explicit path, before any Task 6 edit is made; the code commit follows it. That is the ordering §(k.4) and §(k.6) used.

---

## (m) The closing statements — the two plan-required sentences this record had not yet carried

*(Append-only, dated 2026-10-22, committed at the programme's close (Task 7.1). Task 7.1 requires the record to contain six statements, (a)–(f). Five are on the record — (a) the finding opens the record's first line, (b) the exact diffs are §(b)–(g) and each later §7-prohibited wave's own diff hunks, (c) the compatibility rule is stated and measured in §(d) and §(f) and re-measured on the theme path in §(h.7), and (f) the boundary over the FULL programme is the corrected authority of §(i.1). Two statements were never written because no task record had needed them: the **package-contract** statement and the **security** statement. They close the record here, verbatim as the plan's Task 7.1 words them, so the record satisfies its own plan literally rather than by inference.)*

### (m.1) The package-contract statement (§7.1 (d))

> **A package's `supportedWidgets` may name the new `account_*` types; a package that does not is unaffected; `THEME_API_RANGE` stays `^3.0.0` and `BUILDER_API_VERSION` stays `3.1.0`; the only per-key rule remains `templates.archive_requires_api`.**

Measured substance: the range and the running API are constants that did not move — `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:56`) and `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`) are byte-stable across the programme (§(m)'s greps at `3753eaf3`). A package may now declare `supportedWidgets: ["account_nav", …]` because the four panels are first-class catalogue rows (§ line 38 above); a package that names none of them changes nothing, since `WIDGET_SET` is derived from `WIDGET_TYPES` and the manifest gate already accepts any catalogue entry (plan A9). The one per-key rule in the template contract remains exactly what it was before the programme: `templates.archive_requires_api`. No column, no schema line, no API interpretation changes — the theme-package module states that fact at `src/lib/theme-package.ts:151-152`, and this section is the record's own statement of it.

### (m.2) The security statement (§7.1 (e))

> **The parts prop is a closed list of keys, never values; the account panels read only the route's provider; the theme's presentation receives the same `WidgetCtx` and has no server access.**

Measured substance, one clause at a time:

1. **The parts prop is a closed list of keys, never values.** `parseOrderedParts` (`src/lib/widget-parts.ts:94`) tokenises the comma-separated prop against the widget's `WIDGET_PART_VOCABULARY` (`:42`), deduplicates with a `Set`, and an unknown token is dropped — the authored value can only ever **re-order keys the widget already owns**, never inject markup, labels or copy (money, addresses and statuses come from the widget's own props, unchanged).
2. **The account panels read only the route's provider.** The four `account_*` panels render through the route's `AccountDashboardProvider` (`src/components/store/AccountDashboardContext.tsx`), which aggregates the platform's own loaders for the signed-in merchant; a panel mounted without the provider renders the platform's delegated fallback, exactly as the account route's contract pins it.
3. **The theme's presentation receives the same `WidgetCtx` and has no server access.** A theme presentation (`src/lib/theme-presentations.ts`, extended by claim) is a **presentation function over the same `WidgetCtx` the platform widget receives** (`src/components/store/account-widgets.tsx:36`, `:1196`) — no fetch, no server-side import, no `createServerFn` seam of its own. The server stays the platform's; the package manifest and the theme artifact are static JSON read through the existing manifest gate. Money renders through `ctx.money` over the quote's **minor units**, as it did before the programme.

**Boundary of this section.** Words only — no product file, no test, no config is touched. It closes the six statements Task 7.1 enumerates; the record remains append-only, ending here.

---

## (n) Batch A of the stricter acceptance gate — the planned §7-prohibited edits, recorded before the edit

*(Append-only, dated 2026-10-23, continuing the record after the programme's §(m) close, because the owner's stricter acceptance gate opened gaps 2, 5, 6, 7 and 8 of the audit (`/opt/frame28/.superpowers/sdd/2026-10-22-frame30-dynamic-themes/audit-acceptance.md`) and Batch A closes five of them in place. Two of the target files are programme G1 pins and two are the programme's proof lanes — §7-prohibited — so this section names every planned edit **before** it is made, with its exact old → new hunk, and is committed before the code commit it governs (the §(k.3)/(l) ordering). No assertion anywhere is weakened, skipped, or deleted; no new npm dependency is added; the stored-AST compatibility rule (§(d), §(h.7)) is preserved: every change below is additive in the route/component/lane layers, and the AST parser, renderer seed and published bytes are untouched.)*

### (n.1) The finding — what Batch A closes, and why the targets are §7 relaxations

The audit's five Batch A gaps and their closing mechanics:

1. **Gap 5 — a merchant's account panel removal must stick.** The route re-supplies every panel the served body does not place (`src/routes/store.$slug.account.tsx:234`, predicate `themePlacesAccountPanel` in `src/lib/theme-shell-slots.ts:98`), so a panel the theme's DEFAULT body places but the merchant deleted comes back as the dashboard's fallback. Close: the route computes a `removed` set — panels the theme's default composition places but the served body does not — and the dashboard's fallback skips `placed ∪ removed`. A removed panel is shown NOWHERE; a panel the theme never placed is still the dashboard's.
2. **Gap 6 — nested composition is unproven.** Two halves: (a) a NEW handler-level contract test that drives the REAL `useBuilderEditor` ("Add inside" → insert → reorder → delete → autosave) against the REAL `autosave` server function over the in-memory DB double — no mocked double of the persistence seam; (b) the seven-templates lane's Cart journey gains a nested add-inside/reorder/delete leg through the real editor UI.
3. **Gap 7 — the theme-switch round trip is unproven at the DB seam.** The keyed RPC double in `template-persistence-isolation.test.ts:174` is a hand-written mirror, not the shipped functions. Close: a NEW handler-level test running the REAL `activateTheme`, `loadWorkspace` (draft read) and `autosave` over the DB double, A→B→A, asserting draft bytes at every leg; plus a browser leg doing one real editor edit → switch → switch back → assert both compositions.
4. **Gap 8 — the stale 76% in the lane's own contract comment** (`.e2e/songoskriti-seven-templates.spec.ts:30`): the comment is made self-correcting ("the floor is 90 %; the measured value is recorded in the evidence record"), so a future copy change cannot make the comment drift again. Batch C owns the content itself; only this comment changes here.
5. **Gap 2 — the Blog lane edits the base `blog` while the route serves `blog_listing`** (`.e2e/songoskriti-seven-templates.spec.ts:275` vs `src/routes/store.$slug.blog.index.tsx:41-47`): the journey's Blog leg selects the `blog_listing` VARIANT first (`data-template-variant`), edits a visible property, and asserts the store's blog listing shows it; the existing base-blog assertions stay.

### (n.2) The NEW files — no diff (a NEW file needs no relaxation)

- `src/lib/account-panel-survival.ts` — the pure default-vs-saved panel rule (gap 5), reusing `themePlacesAccountPanel`.
- `src/lib/account-panel-survival.test.ts` — the rule's unit lane: removed stays removed, other panels still supplied, and the signed-out / no-chrome safety net intact.
- `src/components/builder/nested-composition.contract.test.tsx` — the gap 6(a) contract test over the real editor hook and the real `autosave` handler.
- `src/lib/theme-switch-roundtrip.test.ts` — the gap 7 handler-level A→B→A test over the real `activateTheme` / `loadWorkspace` / `autosave`.

### (n.3) The exact planned diffs

#### (n.3.1) `src/routes/store.$slug.account.tsx` (G1)

Three hunks. **Loader** — compute the removed set beside the chrome fetch:

```diff
     const chrome = await getStoreChrome({
       data: { slug: params.slug, template: "account" },
     }).catch(() => null);
-    return { chrome };
+    return { chrome, removedPanels: accountPanelsRemoved(chrome) };
```

with `accountPanelsRemoved` (NEW `src/lib/account-panel-survival.ts`) dynamically importing `@/lib/themes.server`'s `registryPackage` inside an established loader-only dynamic import — the loader is a server context, the G1 import-graph gate is untouched. **Placed/removed in the tree:**

```diff
   const placedPanels = useMemo(() => {
     const out: AccountPanelType[] = [];
     for (const panel of ACCOUNT_PANEL_TYPES) {
       if (themePlacesAccountPanel(chrome?.ast, panel)) out.push(panel);
     }
     return out;
   }, [chrome?.ast]);
+  // The MERCHANT's removals: panels the theme's default composition places
+  // but the served body does not. The dashboard's fallback skips them too —
+  // a deleted panel is deleted, not re-supplied.
+  const removedPanels = routeLoaderData.removedPanels;
```

**Slots + state** — the four grant lines take the union into account and the provider gains `removed`:

```diff
+    // A panel the merchant removed from the body is NOT granted to the
+    // theme, and the dashboard's fallback skips it: it renders NOWHERE.
     if (placedPanels.includes("account_nav")) out.account_nav = null;
     if (placedPanels.includes("account_overview")) out.account_overview = null;
     if (placedPanels.includes("account_orders")) out.account_orders = null;
     if (placedPanels.includes("account_details")) out.account_details = null;
```

```diff
       placed: placedPanels,
+      removed: removedPanels,
```

#### (n.3.2) `src/components/store/AccountDashboard.tsx` (G1)

The four fallback skip spots take the removed set — `!placed` becomes `!placed && !removed`, four times (nav :272, overview :291, orders :295, details :308):

```diff
-      {!placed.includes("account_nav") && (
+      {!placed.includes("account_nav") && !removed.includes("account_nav") && (
```

…and the state read beside `placed`:

```diff
   const placed: readonly AccountPanelType[] = state?.placed ?? [];
+  const removed: readonly AccountPanelType[] = state?.removed ?? [];
```

#### (n.3.3) `src/components/store/AccountDashboardContext.tsx`

The state contract gains the third panel state, beside `placed`:

```diff
   placed?: readonly AccountPanelType[];
+  /**
+   * The panels the MERCHANT removed from the body. The dashboard's fallback
+   * skips these too: a removed panel is absent, never re-supplied.
+   */
+  removed?: readonly AccountPanelType[];
```

#### (n.3.4) `.e2e/songoskriti-seven-templates.spec.ts` (gaps 2, 6(b), 8)

**Gap 8, the comment (:28-31)** — prose only, no `it.skip`, no token change:

```diff
- * platform's publish gate refuses a theme whose authored copy is more than
- * 10% untranslated (`translationGate`, `src/lib/builder-guardrails.ts:166`),
- * and the shipped Songoskriti copy is **76%** translated — so the publish is
- * currently REFUSED with a named reason.
+ * platform's publish gate refuses a theme whose authored copy is more than
+ * 10% untranslated (`translationGate`, `src/lib/builder-guardrails.ts:166`);
+ * the gate's floor is 90 % and the shipped Songoskriti copy has measured
+ * below it — the exact measured value is recorded in the evidence record
+ * (`phase4-dynamic-themes-evidence.md`), so this comment self-corrects
+ * instead of quoting a stale number.
```

**Gap 6(b)** — the Cart journey's nested leg, driven by the layer navigator's OWN "+ / Add inside" affordance (`LayerTree.tsx:373-378`) and the real tray, then reordered with the node's own Move up, and a second nested container added-and-deleted to prove a removed node is gone:

```diff
     // 6. Change a REAL inspector property (the schema-generated control).
     ...
     await expect(
       height,
       "the inspector control holds the edited value",
     ).toHaveValue("48");
+
+    // 6b. NESTED COMPOSITION — only where the body has a container (Cart).
+    //     "Add inside" on the Columns container, insert a Container into
+    //     it, insert a Text block INTO the container, set the text block's
+    //     body marker, move the container up, then add and DELETE a second
+    //     nested container. (The inserted widget is a `rich_text` with a
+    //     blank heading on purpose: a second <h1> claimant is the platform's
+    //     blocking lint error and would disable the publish confirm.)
+    if (journey.nested) {
+      const columnItem = page
+        .getByRole("treeitem")
+        .filter({ hasText: "Columns" })
+        .first();
+      const addInside = columnItem.getByRole("button", { name: "Add inside" });
+      await expect(addInside, "the navigator offers Add inside").toBeVisible({
+        timeout: 30_000,
+      });
+      await addInside.click();
+      await expect(
+        page.getByText("Adding inside container"),
+        "the tray announces the container target",
+      ).toBeVisible({ timeout: 30_000 });
+      await insertContainer(page);            // NEW helper: the tray's own control
+      … select the new container, click ITS "Add inside",
+        insert "Text block", open its body (area) control,
+        fill journey.nested.marker,
+        Move up on the nested container …
+      … insert a SECOND container inside Columns, delete it, and assert
+        the navigator no longer lists it …
+    }
```

*(The exact helper and final string/pin table is appended to this record after the code commit — §(n.5); the branch conditions, assertion text and the published/refusal split below are already fixed.)* The storefront half follows the lane's own 9b pattern — unique markers, both publish outcomes honoured:

```diff
+    if (journey.nested) {
+      const marker = page.getByText(journey.nested.marker, { exact: true });
+      const removedMarker = page.getByText(journey.nested.removedMarker, {
+        exact: true,
+      });
+      if (publish.outcome === "published") {
+        await expect(
+          marker.first(),
+          "the nested text block's marker is on the storefront",
+        ).toBeVisible({ timeout: 30_000 });
+        expect(
+          await removedMarker.count(),
+          "the deleted nested container's text did not half-apply anywhere",
+        ).toBe(0);
+      } else if (journey.route.startsWith(`/store/`)) {
+        expect(await marker.count(), "…did not half-apply").toBe(0);
+      }
+    }
```

The top-level Spacer steps and their 9b 56 px assertions are untouched.

**Gap 2** — the Blog journey selects the `blog_listing` VARIANT before its editor steps, and the storefront half gains the variant assertion:

```diff
   {
     label: "Blog",
     layers: ["Blog topics", "Blog archive", "Blog pagination"],
     route: `/store/${STORE}/blog`,
+    variant: "blog_listing",
     storefront: async (page) => {
-      await expect(
-        page.getByText("From the journal", { exact: true }).first(),
-        "the theme's blog listing renders its own pack",
-      ).toBeVisible({ timeout: 30_000 });
+      … the variant's own heading assert, and the MERCHANT's edited visible
+        property asserted on the listing when the publish succeeded …
     },
   },
```

with, in the loop's editor half:

```diff
     await openTemplate(page, journey.label);
+    if (journey.variant) {
+      const variantButton = page
+        .locator(`[data-template-variant="${journey.variant}"]`)
+        .first();
+      await expect(variantButton, "the strip offers the variant").toBeVisible({
+        timeout: 30_000,
+      });
+      await variantButton.click();
+      await page.waitForTimeout(1_500);
+    }
```

…and the journey edits a visible `blog_listing` property through its schema-generated control before the save, so the served listing route (`src/routes/store.$slug.blog.index.tsx:41-47` resolves `blog_listing`) carries the edit in the published branch, and shows neither the edit nor the editor-only marker in the refusal branch.

#### (n.3.5) `.e2e/songoskriti-dynamic-themes.spec.ts` — the gap 7 browser leg

A new test in the existing real-editor suite, using the shipped helpers only (`openTemplateInEditor`, `selectLayer`, `setInspectorHeading`, `readInspectorHeading`, `saveDraft`, `reloadEditorAndSelect` from `songoskriti-dynamic-themes-helpers`; `setActiveTheme`/`activeThemeKey` from `helpers-songoskriti`):

```diff
+  test("the theme switch round trip: a saved draft survives A→B→A", async ({
+    page,
+  }) => {
+    const collector = new NetworkCollector(page).attach();
+    await blockExternalRequests(page, []);
+    await ensureSongoskritiActive(page);            // A active
+    await openTemplateInEditor(page, "Cart");
+    await selectLayer(page, "Cart lines");
+    await setInspectorHeading(page, `Frame30 switch — draft ${RUN}`);
+    await saveDraft(page);
+    await reloadEditorAndSelect(page, "Cart");
+    await selectLayer(page, "Cart lines");
+    expect(await readInspectorHeading(page),
+      "the draft is saved before the switch").toBe(`Frame30 switch — draft ${RUN}`);
+    await setActiveTheme(page, "somvabona");        // B ACTIVE
+    expect(await activeThemeKey(page)).toBe("somvabona");
+    await setActiveTheme(page, "songoskriti");      // BACK to A
+    expect(await activeThemeKey(page)).toBe("songoskriti");
+    await openTemplateInEditor(page, "Cart");
+    await selectLayer(page, "Cart lines");
+    expect(await readInspectorHeading(page),
+      "A's OWN draft came back from the switch — server truth").toBe(
+      `Frame30 switch — draft ${RUN}`);
+    expect(collector.externalResponses()).toEqual([]);
+  });
```

### (n.4) The browser leg's file choice — a stated deviation from the owner's wording

The owner named `.e2e/levelb-theme-switch-serve.spec.ts`. Measured before the edit: that lane is the custom dev-theme serve lane — it runs WITHOUT the builder, without merchant drafts and without the auth stack (`.e2e/helpers-levelb.ts` proves the lane dynamic-imports `@/`-aliased server modules that are unresolvable in the lane's worker; its themes are fixture themes with no registry packages), so it **cannot** open the real editor, write a real draft, round-trip it through `setActiveTheme`'s real `themeActivateFn`, and re-read it. The real-editor leg therefore lives in `.e2e/songoskriti-dynamic-themes.spec.ts` — the suite that owns the real-editor journeys and the credential gates — and this deviation stands recorded here, ahead of the edit.

### (n.5) Ratification and boundary

**Ratification.** The programme owner's standing instruction for this wave — *"whatever goes, as per the expert opinion"*, applied to the stricter acceptance gate — ratifies these relaxations of §7 for the exact old → new edits named above. The two G1 files take additive, named-state edits; the two lanes take additive blocks whose every new assertion strengthens claims that cannot be weakened; the `AccountDashboardContext` edit is the state contract's third panel state, not a copy change. No skip, no deleted assertion, no moved threshold, no dependency.

**Boundary.** The Batch A code commit touches exactly: the four §7-prohibited files above, the four NEW files of §(n.2), and this record. `src/lib/storefront.functions.ts` / `getStoreChrome` is NOT edited — the reading of the default composition happens at the route's loader through the established loader dynamic import, keeping the getter's body untouched. The churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/` remain unstaged; staging is explicit-path only.

**Ordering.** This section is committed first, by explicit path, BEFORE any Batch A edit is made; the code commit follows it, named by an appended appendix in this record's established style.

**Known edges, stated in place of silence.** (1) The default-vs-saved rule compares the CURRENT package's default composition against the served body: a future theme update that ADDS a panel to its default body reads as a merchant-removal for an old draft, and the panel stays absent from the storefront (an explicit cost of choosing this rule — tombstones were rejected because `parseAst` (`src/lib/builder-ast.ts:8224`) strips every unknown key and `parseTemplates` (`:8349`) drops unknown template keys, so a meta bag cannot survive the canonical round trip without touching the parser, i.e. WITHOUT risking the stored-AST compatibility rule). (2) A theme with no registry package (custom seeded content) resolves to an empty default set → `removed` is empty → the wholesale safety net is retained untouched.

## (n.6) Batch A — the corrective hunks, recorded before the edit

*(Append-only, continuing §(n) after its planning section was committed at `0ca11d6e`. Four corrections were forced by measuring the tree before the code edit. Each is named here with its exact target, BEFORE the edit, under the §(n.5) ratification.)*

### (n.6.1) The Gap-5 loader seam: the default read is a SERVER FUNCTION, not a loader `await import`

§(n.3.1) planned `await import("@/lib/themes.server")` inside the account route's **loader**. Measured before the edit: route loaders are client-executed on client-side navigation (the repo's own loaders call `createServerFn` wrappers, e.g. `src/routes/store.$slug.index.tsx:222`, never a `.server` module), and `themes.server` statically imports `observability.server`, which imports `node:async_hooks` (`src/lib/observability.server.ts:19`). A client-executed loader that dynamically imported it would fail at the first client navigation.

The correction keeps the rule pure and puts the read behind the established seam: `src/lib/account-panel-survival.ts` (already a NEW file in §(n.2), so **no fifth file**) gains ONE `createServerFn` — `accountRemovedPanelsFn` — whose handler dynamically imports `./themes.server` exactly as every other server function does. The route's loader calls that wrapper:

```diff
-    return { chrome };
+    return {
+      chrome,
+      removedPanels: await accountRemovedPanelsFn({
+        data: { themeKey: chrome?.themeKey ?? null, ast: chrome?.ast ?? null },
+      }).catch(() => [] as readonly AccountPanelType[]),
+    };
```

The AST that is compared is the one `getStoreChrome` already served in the same request; the server function only names the difference, it grants nothing. `src/lib/storefront.functions.ts` stays untouched, as §(n.5) required.

### (n.6.2) The Gap-5 browser leg — the Account journey loses one panel, and the storefront proves it

The audit's gap asks for a LANE assertion, not only the rendered unit proof. The Account journey in `.e2e/songoskriti-seven-templates.spec.ts` gains a removal leg AFTER the shared reload and BEFORE the final publish edit:

1. select the journey's own `"Account navigation"` layer in the navigator;
2. press the navigator's documented `Delete` key (`LayerTree.tsx:349-354`) and assert the layer is gone from `layerNames(page)`;
3. save through the toolbar, reload, re-select the template, and assert the removed layer is still gone (server truth), while `"Account overview"`, `"Account orders"` and `"Page content"` are still listed;
4. then the shared final height edit and the real publish run as they already do.

The storefront half is asserted against the platform's REAL outcome: in the **published** branch the signed-in account page must NOT render the dashboard's `navigation "Account sections"` (the merchant removed it) while `"At a glance"` (the overview panel) is still visible; in the **refused** branch the published seed still renders the navigation (no half-apply), which is the current platform outcome until the content gate is cleared. The signed-out safety net is already asserted by `.e2e/songoskriti-storefront-surfaces.spec.ts:130-150` (`Track Your Order` renders, no dashboard) and stays untouched.

### (n.6.3) The Gap-2 visible property — the Blog journey edits `blog_listing`'s OWN terms heading

§(n.3.4) said "edit a visible property"; measured: editing `blog_archive`'s heading would replace the lane's existing `"From the journal"` assertion in the PUBLISHED branch. The journey therefore selects `[data-template-variant="blog_listing"]` after the base Blog button (keeping every existing base assertion), and edits the **`"Blog topics"`** layer's schema-generated `Heading` control to a per-run marker. `"From the journal"` (the archive pack's heading) is untouched, so the existing base assertion remains true in both branches. The 9b block asserts the marker visible after a successful publish and absent after a refusal.

### (n.6.4) The Gap-6(b) nested leg — Cart only, with markers that survive the save

The Cart journey gains, after the shared inspector step and before the shared Save:

1. select `"Columns"`, click its own `"Add inside"` control, insert `"Container"` through the real tray;
2. select that container, `"Add inside"`, insert `"Text block"`, set its `Heading` to a per-run NESTED marker through the schema control;
3. `"Move up"` the nested container inside the columns;
4. add a SECOND container inside the columns, rename it to a per-run `Nested to delete` name through the navigator's own rename input, then press `Delete`; assert it is gone;
5. the shared Save + reload then assert the NESTED marker and the first container still exist, the deleted name does not, and the marker value survived.

The storefront half follows the lane's 9b split: published ⇒ the NESTED marker is visible; refused ⇒ it is absent (no half-apply). The existing top-level Spacer steps and their 56 px assertions are untouched.

### (n.6.5) The second stale number, and the boundary of this correction

Gap 8 names `.e2e/songoskriti-seven-templates.spec.ts:30`; `.e2e/songoskriti-dynamic-themes.spec.ts:51` carries the same hard-coded **76 %** finding and is corrected in the same self-correcting wording ("the floor is 90 %; the measured value at the time of the freeze is in the evidence record"). Both are comment-only edits under a §7-prohibited lane; no assertion changes. Gap 7's browser leg remains in `.e2e/songoskriti-dynamic-themes.spec.ts` for the reason already recorded at §(n.4), and its editable surface is corrected here: **Collection** (not Cart) — Somvabona authors no Cart body (`src/lib/themes/somvabona/preview.ts:91`), but both themes author Collection with a `product_rail` ("Product rail") carrying a schema-generated `Heading`, so A→B→A reads the same layer on both sides.

### (n.6.6) Boundary of the correction

The code commit still touches only: the three G1/state files of §(n.3.1)-(n.3.3), the four NEW files of §(n.2) (with the server-function addition above), the two §7 lane files (`.e2e/songoskriti-seven-templates.spec.ts`, `.e2e/songoskriti-dynamic-themes.spec.ts`), and this record. No parser, renderer, seed or published-byte file changes; the stored-AST compatibility rule is untouched. This section is committed before the code commit, by explicit path.

### (n.7) The FINAL hunk forms of the Batch A lane edits — recorded before the lane edit is applied

§(n.6) recorded the corrective direction. This section records the exact final forms, each measured against this branch's own source before the edit is applied. Nothing below is assumed; every locator cites the line that renders it. Committed before the code commit, by explicit path.

#### (n.7.1) Gap 7 — the A→B→A draft round trip, as a new test in `.e2e/songoskriti-dynamic-themes.spec.ts`

A new test inside the existing `test.describe("the dynamic themes' proof lane")` block, after the checkout test, with this exact sequence:

1. `new NetworkCollector(page).attach()` + `blockExternalRequests(page, [])` (the lane's own hygiene);
2. `ensureSongoskritiActive(page)` — the real login + real activation;
3. `openTemplateInEditor(page, "Collection")` → `selectLayer(page, "Product rail")` → `setInspectorHeading(page, draftMarker)` where `draftMarker = \`Frame30 theme switch — ${RUN}\`` (the lane's existing `RUN` const);
4. `saveDraft(page)` → `reloadEditorAndSelect(page, "Collection")` → `selectLayer` → `readInspectorHeading()` === marker (server truth before any switch);
5. `setActiveTheme(page, "somvabona")` then `expect(await activeThemeKey(page)).toBe("somvabona")`; `setActiveTheme(page, "songoskriti")` then `expect(await activeThemeKey(page)).toBe("songoskriti")` — the round trip's two activations;
6. `openTemplateInEditor(page, "Collection")` → `selectLayer(page, "Product rail")` → `readInspectorHeading()` === marker (the A→B→A round trip preserved the merchant's own draft);
7. `expect(collector.externalResponses()).toEqual([])`.

Import change in the same file: `activeThemeKey, setActiveTheme` are added to the EXISTING `./helpers-songoskriti` import (they already live there — `helpers-songoskriti.ts:35` and `:208`). Nothing else in the import block changes.

Why Collection/`product_rail` (§(n.6.5) corrected the surface): Somvabona authors a Collection body containing a `product_rail` (`src/lib/themes/somvabona/preview.ts:55-69`) and authors NO Cart body (`:91`), so "Product rail" is the one editable layer both themes' Collection templates carry — the same layer label reads on both sides of the switch. `product_rail`'s schema field label is exactly `Heading` (`src/lib/builder-ast.ts:2360`), which is the `headingControl` helper's exact label. The leg proves the DRAFT round trip (the gap's claim); it deliberately does not publish — the publish contract is the seven-templates lane's and is untouched.

#### (n.7.2) Gap 8 — the second stale number, comment-only

`.e2e/songoskriti-dynamic-themes.spec.ts` header: the sentence "its bilingual coverage is 76 % and the gate's floor is 90 % (measured; the prior programme recorded the finding as an owner action)" is replaced with the same self-correcting wording already applied to the seven-templates header — the floor is 90 %, the shipped copy has measured below it, and the exact measured value lives in the evidence record (`phase4-dynamic-themes-evidence.md`). Comment-only; no assertion changes.

#### (n.7.3) The `storefront` signature change both new legs need

The seven-templates `Journey` type's `storefront` field changes from `(page: Page) => Promise<void>` to `(page: Page, publish: PublishOutcome) => Promise<void>`, and the single call site becomes `await journey.storefront(page, publish)` (the publish outcome is already in scope there). `PublishOutcome` is this file's OWN local type (`:125`) — no import is added. The five single-argument closures (Search results, Cart, Checkout, Archive, Page) remain assignable unchanged (TypeScript's fewer-parameters rule); only Blog and Account take the second argument.

#### (n.7.4) The Blog journey's variant and marker (Gap 2)

The Blog journey gains two fields: `variant: "blog_listing"` and `marker: { layer: "Blog topics", label: "Heading (optional)", value: \`Frame30 blog topics — ${RUN}\` }`. The leg:

- right after `openTemplate(page, "Blog")`, click `page.locator('[data-template-variant="blog_listing"]')` — the strip's second-level variant button (`src/routes/_authenticated/dashboard/builder.tsx:1695`), which renders ONLY once the base is selected (`variantKeysFor("blog")` carries `blog_listing`, `src/lib/template-variants.ts:98`) — so the marker edit targets the VARIANT's own composition. The base `blog` body carries no "Heading (optional)" field; `blog_terms` declares `Heading (optional)` (`src/lib/builder-ast.ts:5032`), and the `blog_listing` variant body carries the terms rail;
- after the shared inspector step, select the `"Blog topics"` layer and fill the exact `"Heading (optional)"` control with the marker;
- the shared reload re-clicks only the BASE "Blog" strip button (`:473-475`), so the journey re-clicks the variant button after the reload before the post-reload read, and asserts `readInspectorHeading`-equivalent control value === marker (the value survived — server truth);
- the 9c split: published ⇒ `getByText(marker, { exact: true }).first()` is visible; refused ⇒ its `count()` is 0 (no half-apply). Publish serializes the whole `doc.templates` (`builder.tsx:1367`), so the variant's edit travels with the publish, and the storefront route `/store/{STORE}/blog` resolves `blog_listing` (`src/lib/storefront.functions.ts:189`).

The existing base assertions — `"From the journal"` visible and `"From the journal, weekly"` absent — are untouched.

#### (n.7.5) The nested leg's final form (Gap 6(b)) — the sequencing deviation from §(n.6.4)

§(n.6.4) ordered "Move up" AFTER the Text block insert. Measured: the navigator's row puts `Move up` as a SIBLING of the treeitem button (`src/components/builder/LayerTree.tsx:383`), addressed as `item.locator("xpath=..")`, and the cart body ALREADY renders two unnamed `"Container"` treeitems, so addressing the new container by NAME is brittle. The leg therefore moves the nested container UP while it is STILL THE SELECTED NODE — right after the insert, before the Text block is inserted inside it — via `[role="treeitem"][aria-selected="true"]` (the tray's `onAdd` selects the inserted node, `builder.tsx:2086`). The order change is asserted the way the shared step 5 asserts it: `reordered !== afterNest`, against the list captured immediately after the insert.

New local helpers in the seven-templates spec:

- `insertWidget(page, query, rowName, preset?)` — re-clicks the `"Add"` tab (every tray insert leaves `leftTab === "layers"`, `builder.tsx:2071`), fills the searchbox `"Find a widget"`, clicks the row `getByRole("button", { name: new RegExp("^" + rowName) })`, and — when `preset` is passed — clicks that preset in the tray's chooser. The chooser REPLACES the search list (`src/components/builder/WidgetTray.tsx:351`), so the preset click is made without re-querying the search;
- `insertContainer(page)` — `insertWidget(page, "container", "Container", "As designed")`: `container` has four presets (`presetsFor` prepends "As designed", `src/lib/widget-metadata.ts:369`) so `pick` opens the chooser (`WidgetTray.tsx:343-347`), while `rich_text`, `columns` and `spacer` have exactly one and insert directly.

The Cart journey's `nested` field carries `marker` and `removedName` (both `RUN`-suffixed). The leg, after the shared step 5:

1. select `"Columns"` → click its `"Add inside"` (`LayerTree.tsx:373`, container-only, sibling of the treeitem) → `insertContainer(page)` → `afterNest = await layerNames(page)`;
2. on `[role="treeitem"][aria-selected="true"]` click `"Move up"` → `reordered !== afterNest`;
3. that same selected node's `"Add inside"` → `insertWidget(page, "text block", "Text block")` (one preset → direct insert) → fill the exact `"Heading"` control with the nested marker;
4. `"Columns"` `"Add inside"` again (each click overwrites `addParent`, `builder.tsx:2015`) → `insertContainer(page)` → double-click the selected treeitem → the rename input (`aria-label="Layer name"`, `LayerTree.tsx:268-282`) → fill `removedName` → `Enter` (commits on blur) → press `Delete` on the renamed treeitem (`LayerTree.tsx:340-345`) → assert `layerNames` no longer contains `removedName` and still contains `"Container"` (the FIRST container), plus the cart's own layers;
5. the shared Save + reload then assert (8c): `afterReload` does not contain `removedName`, still contains `"Container"`, and the journey selects `"Text block"` and asserts its exact `"Heading"` control holds the nested marker — then re-selects the Spacer so the shared height assertions run unchanged;
6. 9c: published ⇒ the nested marker is visible on the storefront; refused ⇒ its count is 0. The existing 56 px spacer assertions are untouched.

`addParent` persistence is the reason each helper re-clicks the `"Add"` tab and each `"Add inside"` click re-states the parent: the platform does not clear `addParent` after an insert (`builder.tsx` clears it only on template/slot change, `:745`), so the leg always sets it immediately before the insert that needs it.

#### (n.7.6) The Account journey's removal leg (Gap 5, §(n.6.2))

The Account journey gains `remove: "Account navigation"`, and the kept-layers loop SKIPS `journey.remove` — the layer is in `journey.layers`, so a naive `toContain` would assert the exact opposite of the leg. The leg runs after the shared step 5 and before the shared step 6:

1. select `"Account navigation"` → press `Delete` on its treeitem → the name is gone from `layerNames(page)` while `"Account overview"`, `"Account orders"` and `"Page content"` remain;
2. the shared Save + reload + strip re-click → assert the name is STILL gone (server truth) and the three kept layers are still listed → re-select the Spacer so the shared height assertions run unchanged.

The Account journey's `storefront` becomes outcome-aware through the §(n.7.3) signature: **published** ⇒ `getByRole("navigation", { name: "Account sections" })` has `count()` 0 (the merchant removed the layer) while `getByText("At a glance")` is visible (the overview panel renders even with a blank heading, `src/components/store/account-widgets.tsx:309-311`); **refused** ⇒ the EXISTING navigation + Orders-tab assertions run verbatim (a refusal never half-applies, so the published seed's navigation is still there).

#### (n.7.7) The seven-templates spec gains its own `RUN` const

`const RUN = Date.now().toString(36);` after the `TERM_SLUG` const — the dynamic-themes lane already carries the identical const; every new marker and layer name is per-run, so a marker a previous run published can never satisfy this run's assertion.

#### (n.7.8) The scratch probe is deleted, and its citation is corrected

`src/lib/__probe.test.tsx` — whose own header says "SCRATCH PROBE — deleted after the run" — is deleted in the code commit. The shipped contract test's comment (`src/components/builder/nested-composition.contract.test.tsx:207`) cites the probe's render-phase ordering and is reworded to cite the SHIPPED `use-builder-editor.route-h1.test.tsx` pattern instead. Comment-only; the contract test's assertions are untouched.

#### (n.7.9) Boundary

The code commit touches: the three G1/state files and the four NEW files of §(n.2)-(n.3), the two §7 lane files (`.e2e/songoskriti-seven-templates.spec.ts`, `.e2e/songoskriti-dynamic-themes.spec.ts`), the NEW contract test's one comment, the deletion of the untracked scratch probe, and this record — exactly the §(n.6.6) boundary. No parser, renderer, seed or published-byte file changes; the stored-AST compatibility rule is untouched.

### (n.8) The Batch A code commit — named, with what changed against the plan on the record

The code commit is **`f172b249`** — `feat(frame30): Batch A — the dynamic-themes gaps 2, 5, 6, 7 and 8 (record §(n)-(n.7))`, nine files, staged by explicit path. The four standing churn paths (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, the untracked `.output-snapshots/`) were left unstaged and untouched, as §(n.3) requires.

#### (n.8.1) What landed, per gap

- **Gap 5** — `src/lib/account-panel-survival.ts` (the pure skip rule + the server fn), the route loader's `removedPanels`, the provider's `removed` field and the dashboard's four `!removed` fallback skips; the new `src/lib/account-panel-survival.test.ts` (12 tests); and the §(n.6.2)/§(n.7.6) browser leg in the seven-templates Account journey (Delete key → save → reload → still gone; the kept-layers loop skips the removed layer; the storefront splits on the publish's real outcome).
- **Gap 6(a)** — `src/components/builder/nested-composition.contract.test.tsx` (the handler-level add-inside → marker → move-up → rename → delete journey over the real hook).
- **Gap 6(b)** — the seven-templates Cart journey's nested leg of §(n.7.5), including the new `insertWidget` / `insertContainer` tray helpers and the 8c post-reload assertions.
- **Gap 7** — `src/lib/theme-switch-roundtrip.test.ts` (the handler-level A→B→A proof, 2 tests) and the §(n.7.1) browser leg in `.e2e/songoskriti-dynamic-themes.spec.ts`.
- **Gap 2** — the Blog journey's `blog_listing` variant + marker of §(n.7.4), with the variant re-click after the shared reload and the outcome-aware storefront split.
- **Gap 8** — both stale-number comments corrected to the self-correcting wording (§(n.6.5), §(n.7.2)).

#### (n.8.2) Deviations applied AS RECORDED, and two details the record now names

- The nested leg's sequencing deviation — the container is moved up while it is STILL the selected node, before the Text block is inserted inside it, addressed through `[role="treeitem"][aria-selected="true"]` — landed exactly as §(n.7.5) recorded it before the edit. No assertion depends on a tree position or on a duplicate layer NAME.
- Two typing details of the NEW test files, neither of which changes any assertion: `AccountDashboardProvider` is a function component whose `children` prop is required, so `account-panel-survival.test.ts` passes the child INSIDE the props object (the varargs `createElement` form does not satisfy this React-types version) and supplies the dashboard's required `status` / `tab` / `currency` props from the same state object; and `theme-switch-roundtrip.test.ts`'s `activeId` reader casts the fake-db row's `id` (`as string | undefined`), the pattern the repo's other fake-db tests already use.
- `src/lib/__probe.test.tsx` — the scratch probe whose own header said "deleted after the run" — is deleted, and the shipped contract test's comment now cites `use-builder-editor.route-h1.test.tsx` (§(n.7.8)).

#### (n.8.3) The verification that gates this commit

Run on this branch, at this commit's tree: `node_modules/.bin/vitest run` over the three NEW suites plus the eight existing suites that cover the touched files — **11 files, 147 tests, all passing** (the three pre-existing failures elsewhere in the repo — `analytics-live-shape.test.ts` ×2 and `site.server.test.ts` ×1 — are not in this set and are not mine); `node_modules/.bin/tsgo --noEmit` — clean; `node_modules/.bin/eslint` over the nine touched paths — 0 errors (the two `react-refresh` warnings on `AccountDashboardContext.tsx` pre-date this change and fire on the file's existing hook exports); `node_modules/.bin/playwright test -c .e2e/playwright.config.ts --list` on both touched specs — 8 tests and 5 tests respectively, including the new theme-switch test. No docker stack and no browser lane was run in this batch; the two browser legs are Mode-B lanes and are asserted by `--list` here.

---

## (o) Batch B of the stricter acceptance gate — the planned §7-prohibited edits for gaps 3 and 4, recorded before the edits

*(Append-only, dated 2026-10-23, continuing the record after Batch A's §(n.8) close, because the owner's stricter acceptance gate opened gaps 3 and 4 (`/opt/frame28/.superpowers/sdd/2026-10-22-frame30-dynamic-themes/audit-acceptance.md`) and Batch B closes them in place. Gap 3 is the deferred merchant-scoped category-archive route (`/store/<slug>/blog/category/<termSlug>`); gap 4 is the archive's `pagination` widget, which today renders only in preview because no production archive host mounted the collection query the widget reads. Four of the target files are programme pins or proof lanes — §7-prohibited — so this section names every planned edit **before** it is made, with its exact old → new hunk, and is committed before the code commit it governs (the §(k.3)/(l)/(n) ordering). No assertion anywhere is weakened, skipped, or deleted; no new npm dependency is added; the stored-AST compatibility rule (§(d), §(h.7)) is preserved: the AST parser, renderer seed and published bytes are untouched, and the new route receives its composition **server-resolved** (`resolveTemplateForHost`) — the client never ships the theme's template map to re-resolve it.)*

### (o.1) The finding — what Batch B closes, and why the targets are §7 relaxations

1. **Gap 3 — the merchant-scoped archive composition has no storefront route.** The closed variant vocabulary (`TEMPLATE_VARIANTS` carries `archive: [category, tag, author]`, `src/lib/template-variants.ts`) and the parity contract (`src/lib/preview-parity.contract.test.ts:219-248`) both exist, but the only production archive hosts are the three store-less taxonomy routes (`/blog/category/$slug`, `/blog/tag/$slug`, `/blog/author/$slug`), which carry no store subject, resolve no theme and render the platform grid. The theme's `archive_category` body therefore renders only in the editor and the preview host. Close: a NEW route file `src/routes/store.$slug.blog.category.$termSlug.tsx` (the `$termSlug` param avoids the phase-3 two-`$slug` defect) served by a NEW server function that, in order: rate-limits `blog.read` (the reader bucket the other blog surfaces use), loads the store chrome through the existing `loadStoreChrome(slug, "archive")` (tenant authority: merchant lookup with `status = "active"`, menus, tokens, theme key — null ⇒ `notFound()`), resolves the composition through **`resolveTemplateForHost({ template: "archive_category", variants, tenant, mode: "published", host: "storefront", tokens })`** — whose `findBody` already resolves the variant first and the base second and accepts only a `"suffix"`/`"base"` match — merges the home chrome through the SAME resolver on `"index"` (the merge rule `publishedTemplatePayload` already applies), and loads the listing through `loadTermArchive` extended with an optional tenant scope. Data authority stays platform-side: the route is a server loader over server functions; there is no client fetch.
2. **Gap 4 — the archive's `pagination` renders only in preview.** `template-distinctness.ts:247-261` requires `pagination` in the archive row's `requiredTypes` AND `requiredSlots` (the R2/R3 gates), so removing the widget — or dropping it from the parity test's `six` array — would weaken two existing assertions and is rejected. The real defect is that `Pagination` (`collection.tsx:537`) reads `useCollectionQuery()`, which defaults to `DEFAULT_QUERY` (total 0 ⇒ the widget returns null) and is mounted by no archive host; preview mounts one global search-demo query (`ThemePreviewFrame.tsx:1177`, total 38, search base path). Close: the shared archive host mounts `CollectionQueryProvider` with the archive's OWN `{params, total, basePath, pageSize}`. Because `Pagination` computes `pageCount(query.total)` at the search default of 24 (`storefront-search.ts:177`) while archives window at `BLOG_PAGE_SIZE = 12` (`blog-taxonomy.ts`), and `withPage` (`facet-url.ts:136`) re-clamps with the same constant, the page math must be threaded: `CollectionQuery` gains an optional `pageSize` and `withPage` an optional `limit`, both defaulting to today's 24 so every existing call site stays byte-identical (`seo-technical.ts:147,151` keeps its three-arg form).

The §7-prohibited targets, and why each is a relaxation:

- `src/components/builder/collection.tsx` — **G1 pin** (the widget pack). The `CollectionQuery` type and `Pagination`'s page math change.
- `src/lib/facet-url.ts` — **G1 pin** (the pure URL contract). `withPage` gains a defaulted `limit`.
- `src/components/store/ArchiveView.tsx` — **the archive's shared host** (a Batch-C proof-adjacent pin). Gains the `ast`/`storeSlug` props, the two provider mounts, and `storeSlug` on its `ThemeChrome` call.
- `src/lib/blog-index.server.ts` — **a reader-runtime pin** (`renderRead` contract). `loadFacets`, `resolveTerm` and `loadTermArchive` gain optional tenant-scope parameters.
- `src/components/builder/blog.tsx` + `src/components/store/BlogList.tsx` — the blog widget/card markup (category chips become store-aware through `useStoreSlug()`).
- `src/routes/store.$slug.blog.index.tsx` + `src/routes/blog.index.tsx` (store branch) — existing store blog surfaces, wrapped in `StoreSlugContext` so their cards' category chips point at the merchant-scoped archive.
- `src/lib/preview-parity.contract.test.ts` + `src/lib/preview-safety.contract.test.ts` — **proof lanes**: the archive case gains a production-side equality (pure addition; every existing expectation is kept), and one stale test TITLE plus two stale header comments are corrected. No assertion is weakened: `preview == six`, the theme-body-uses-exactly-six check and the required-subset premise all stand unchanged.
- `.e2e/songoskriti-seven-templates.spec.ts` — **proof lane**: one stale comment (the archive journey's "its storefront route is the deferred merchant-scoped one") is corrected; comment-only, no locator or assertion touched.

### (o.2) The NEW files — no diff (a NEW file needs no relaxation)

- `src/lib/store-blog-archive.functions.ts` — `storeBlogArchiveFn`: zod-validated `{slug, termSlug, page?}`, `enforceRateLimit("blog.read", blog:<ipHash>)` (the same subject shape `blog-taxonomy.functions.ts` uses), then the dynamic server import. The handler never accepts a merchant id from the client.
- `src/lib/store-blog-archive.server.ts` — `loadStoreBlogArchive(slug, termSlug, page)`: `loadStoreChrome(slug, "archive")` (null ⇒ null ⇒ route `notFound()`); when a theme is published, `publishedTheme` (the tenant-keyed, version-cached read `getStoreChrome`'s variant path already uses) + the direct `resolveTemplateForHost` call above + the home-chrome merge through the same resolver on `"index"`; `loadTermArchive("category", termSlug, page, { merchantId, basePath })` with `TermNotFound ⇒ null`; `permalinkSettingsFor` + `requestOrigin` for the head. It returns `{merchant, origin, settings, menus, themeKey, tokens, ast, archive, basePath}`. The base path is `/store/<slug>/blog/category/<termSlug>` (no query on page 1, `?page=N` above), built once and used for the loader's `paging.prevPath/nextPath`, the feed and the head.
- `src/routes/store.$slug.blog.category.$termSlug.tsx` — `validateSearch` page (1..500, the sibling routes' validator), loader over the new fn with the `isStorefrontInfrastructureError ⇒ normalizeStorefrontLoaderError` split the store blog index uses (null ⇒ `notFound()`), `head` = `archiveHead` (store-scoped base path, `indexable: term.robots_index !== false`, the term's own title/description/cover) + a store-scoped `CollectionPage` JSON-LD graph (the merchant's own canonicals, mirroring `storeListingHead`'s ItemList — `listingJsonLd` hardcodes `/blog/*` platform paths and is deliberately global-mode-only) + `breadcrumbJsonLd` over manual store crumbs (`merchant /`, `Blog /store/<slug>/blog`, term archive) because `archiveCrumbs` bakes `/blog/...` paths; `StoreHeader` + `ArchiveView` with `ast`/`storeSlug`/`tokens`/`themeKey`; a `notFoundComponent` linking back to the store's blog; `StorefrontError` as the error component.
- `src/routes/store.$slug.blog.category.$termSlug.test.tsx` — the route-level contract in the `store.$slug.search-composition.test.tsx` pattern: source-as-text over the route + fn + server files (the route path, the fn wiring, `resolveTemplateForHost` with `mode: "published"`/`host: "storefront"`/`tenant`, the `enforceRateLimit("blog.read")` call, `TermNotFound ⇒ notFound`, the `ast`/`storeSlug` props) plus a render test proving the storefront pager: `ArchiveView` under a real `RouterProvider`-less render with the archive feed renders the platform `<a href>` pagination links at the archive's own base path and page size (the gap-4 proof), and the store-scoped category chip points at `/store/<slug>/blog/category/<term>`.
- `src/lib/blog-index-tenant.test.ts` — `loadTermArchive`'s tenant scope over a fake query builder in the `store-blog.test.ts` pattern (`vi.mock("./pricing.server")` for `publicClient`; `renderRead` runs for real): same-named terms in two merchants resolve independently, the scoped call returns only its merchant's articles/facets and honours the `basePath` override in `prevPath/nextPath`, the unscoped call keeps the global behaviour and the global cache key, and an unknown scoped slug throws `TermNotFound`.

### (o.3) The exact planned diffs

#### (o.3.1) `src/lib/facet-url.ts` — `withPage` gains a defaulted page size

```diff
 /** Clamps to the real page range so a hand-typed `?page=9999` cannot deep-scan. */
 export function withPage(
   params: SearchParams,
   page: number,
   total: number,
+  /** Page size the listing windows at. Absent = the search default (24). */
+  limit: number = PAGE_SIZE,
 ): SearchParams {
   const last = Math.min(
-    pageCount(total),
-    Math.floor(MAX_OFFSET / PAGE_SIZE) + 1,
+    pageCount(total, limit),
+    Math.floor(MAX_OFFSET / limit) + 1,
   );
   const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), last);
   return normalizeSearchParams({ ...toSearchQuery(params), page: clamped });
 }
```

Every existing call site keeps three arguments (`collection.tsx:543,544,555,562` are updated in §(o.3.2); `seo-technical.ts:147,151` are not), so the produced queries are byte-identical everywhere the default applies.

#### (o.3.2) `src/components/builder/collection.tsx` — the query carries the listing's own page size

```diff
 import {
   SORTS,
   activeFilters,
   clearFacets,
   facetHref,
+  PAGE_SIZE,
   pageCount,
   pageWindow,
   toggleFacet,
   withFacet,
   withPage,
   withSort,
   type FacetKey,
   type SearchParams,
 } from "@/lib/facet-url";
```

```diff
 export type CollectionQuery = {
   params: SearchParams;
   /** Total results the server reported, used by the toolbar and the pager. */
   total: number;
   /** Path the facet links point at, e.g. `/store/acme/search`. */
   basePath: string;
+  /** Page size the listing windows at. Absent = the search default (24). */
+  pageSize?: number;
   /** Supplied by the route; absent in the studio, where links are inert. */
   navigate?: (next: SearchParams) => void;
 };
```

```diff
 const Pagination: WidgetComponent = (ctx) => {
   const { str, locale } = ctx;
   const { query, href, go } = useFacetLinks();
-  const last = pageCount(query.total);
+  // The listing's OWN page size, when the host supplies one (the archive
+  // windows at 12, the search at 24): the pager and the URL clamp must
+  // agree with the window that produced `total`, or page N links past the
+  // real last page.
+  const pageSize = query.pageSize ?? PAGE_SIZE;
+  const last = pageCount(query.total, pageSize);
   if (last <= 1) return null;
   const current = Math.min(query.params.page, last);
-  const prev = withPage(query.params, current - 1, query.total);
-  const next = withPage(query.params, current + 1, query.total);
+  const prev = withPage(query.params, current - 1, query.total, pageSize);
+  const next = withPage(query.params, current + 1, query.total, pageSize);
   const mode = str("mode") || "numbered";
```

```diff
     <a
       key={`${label}-${page}`}
-      href={href(withPage(query.params, page, query.total))}
+      href={href(withPage(query.params, page, query.total, pageSize))}
       aria-current={current2 ? "page" : undefined}
```

```diff
           ? (e) => {
               e.preventDefault();
-              if (!disabled) go(withPage(query.params, page, query.total));
+              if (!disabled) go(withPage(query.params, page, query.total, pageSize));
             }
           : undefined
```

`DEFAULT_QUERY` is untouched (no `pageSize` ⇒ the default 24 ⇒ byte-identical studio/search behaviour).

#### (o.3.3) `src/components/store/ArchiveView.tsx` — the server-resolved composition, the store slug and the collection query

The imports:

```diff
 import { parseArchiveKind, type ArchiveContext } from "@/lib/archive-context";
 import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
+import { CollectionQueryProvider } from "@/components/builder/collection";
 import { ArticleGrid, Pager } from "@/components/store/BlogList";
 import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
 import { ThemeChrome } from "@/components/store/ThemeChrome";
+import { StoreSlugContext } from "@/lib/store-slug-context";
+import { normalizeSearchParams } from "@/lib/storefront-search";
```

The props:

```diff
   /** The theme's templates, when a theme IS resolved. */
   templates?: Partial<Record<TemplateKey, ThemeAst>> | null;
+  /**
+   * The `archive` composition, resolved SERVER-SIDE through
+   * `resolveTemplateForHost` (`mode: "published"`, `host: "storefront"`)
+   * by the merchant-scoped route (`/store/<slug>/blog/category/<termSlug>`).
+   * Preferred over the client-side `resolveArchiveBody(templates)` when
+   * present; the store-less routes pass neither and keep the platform grid.
+   */
+  ast?: ThemeAst | null;
   /** The theme's tokens, when a theme IS resolved. */
   tokens?: ThemeTokens | null;
   /** The merchant theme key, when a theme IS resolved. */
   themeKey?: string | null;
+  /** The store slug when this archive serves a merchant storefront. */
+  storeSlug?: string | null;
 };
```

The stale "deferred route" note on `resolveArchiveBody` (comment-only):

```diff
- * The BASE key only, for now. The closed variant vocabulary DOES exist
- * (`TEMPLATE_VARIANTS` carries `archive: [category, tag, author]`,
- * `src/lib/template-variants.ts`), and `resolveVariantAst` is the one
- * resolver that honours it — but the archive's three variants are reached
- * through the **deferred merchant-scoped route**
- * (`/store/<slug>/blog/category/<slug>` and its two siblings), which does
- * not exist yet. The three store-less routes that DO exist today
- * (`/blog/category/$slug`, `/blog/tag/$slug`, `/blog/author/$slug`) carry no
- * store subject, resolve no theme and render the platform's grid, so there
- * is no variant for them to resolve. When the merchant-scoped route lands,
- * THIS function must resolve the VARIANT first and the base second — the
- * order `resolveVariantAst` already implements — or a theme's
- * `archive_category` composition would never render.
+ * The BASE key only — this client-side path serves the three store-less
+ * routes, which carry no store subject and resolve no theme. The VARIANT
+ * (`archive_category`, and its tag/author siblings when they land) is
+ * resolved SERVER-SIDE through `resolveTemplateForHost` by the
+ * merchant-scoped route and arrives here through the `ast` prop — a
+ * stored-AST host never ships the theme's template map to the client to
+ * re-resolve it.
```

The component — signature, resolution, and both branches wrapped in the two providers:

```diff
 export function ArchiveView({
   kind,
   context,
   feed,
   header,
   empty,
   templates,
+  ast: composedAst,
   tokens,
   themeKey,
+  storeSlug,
 }: ArchiveViewProps) {
```

```diff
-  const ast = resolveArchiveBody(templates);
+  // The server-resolved composition wins (the merchant-scoped route resolves
+  // it through `resolveTemplateForHost`); the client-side resolve stays for
+  // the store-less routes' legacy `templates` path.
+  const ast = composedAst ?? resolveArchiveBody(templates);
+  // The collection query the theme's `pagination` widget reads: the
+  // ARCHIVE's own total, base path and page size, never the search demo's
+  // 24 — a pager windowed at the wrong size links past the real last page
+  // (gap 4).
+  const collectionQuery = {
+    params: normalizeSearchParams({ page: feed.paging.page }),
+    total: feed.paging.total,
+    basePath: feed.basePath(1),
+    pageSize: feed.paging.pageSize,
+  };
   if (!ast) {
     // The platform's grid — DELEGATED, not re-implemented, so the fallback
     // is byte-identical to the grid the platform has always served.
     return (
       <BlogFeedProvider value={feed}>
-        <BlogArchiveTheme
-          feed={feed}
-          header={header}
-          empty={empty}
-          themeKey={themeKey ?? null}
-        />
+        <CollectionQueryProvider query={collectionQuery}>
+          <StoreSlugContext.Provider value={storeSlug ?? null}>
+            <BlogArchiveTheme
+              feed={feed}
+              header={header}
+              empty={empty}
+              themeKey={themeKey ?? null}
+            />
+          </StoreSlugContext.Provider>
+        </CollectionQueryProvider>
       </BlogFeedProvider>
     );
   }
 
   // The theme's archive composition, around the SAME records the grid
-  // would have rendered.
+  // would have rendered. `storeSlug` enters ThemeChrome only HERE — with a
+  // composed body the store is themed, so the storefront side effects
+  // (store linkBase, per-store language scope, the live-cart scope, the
+  // SectionRenderer slug context) are standard storefront behaviour. The
+  // themeless branch deliberately does NOT pass it: ThemeChrome answers a
+  // themeless store-slug page with the StoreWelcome frame, and a store
+  // without a theme must keep the platform grid on this surface (the rule
+  // the store blog index route already pins).
   return (
     <BlogFeedProvider value={feed}>
-      <ThemeChrome
-        template="archive"
-        ast={ast}
-        tokens={tokens ?? null}
-        themeKey={themeKey ?? null}
-        chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
-        ownsPrimary
-        containerClassName="mx-auto max-w-6xl px-4 py-8"
-        contextSlots={ARCHIVE_SLOTS}
-        fallback={
-          feed.articles.length ? (
-            <>
-              <ArticleGrid articles={feed.articles} />
-              <Pager paging={feed.paging} basePath={feed.basePath} />
-            </>
-          ) : (
-            empty
-          )
-        }
-      />
+      <CollectionQueryProvider query={collectionQuery}>
+        <StoreSlugContext.Provider value={storeSlug ?? null}>
+          <ThemeChrome
+            template="archive"
+            ast={ast}
+            tokens={tokens ?? null}
+            themeKey={themeKey ?? null}
+            storeSlug={storeSlug ?? null}
+            chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
+            ownsPrimary
+            containerClassName="mx-auto max-w-6xl px-4 py-8"
+            contextSlots={ARCHIVE_SLOTS}
+            fallback={
+              feed.articles.length ? (
+                <>
+                  <ArticleGrid articles={feed.articles} />
+                  <Pager paging={feed.paging} basePath={feed.basePath} />
+                </>
+              ) : (
+                empty
+              )
+            }
+          />
+        </StoreSlugContext.Provider>
+      </CollectionQueryProvider>
     </BlogFeedProvider>
   );
```

`ARCHIVE_SLOTS` — the six-slot grant set — is unchanged; the new route inherits it by rendering this host, which is exactly what the parity test's new production-side read asserts (§(o.3.9)).

#### (o.3.4) `src/lib/blog-index.server.ts` — the optional tenant scope

`loadFacets` (a store archive shows ITS store's terms, not the platform-wide rail):

```diff
-async function loadFacets(db: Db): Promise<BlogListing["facets"]> {
-  const { data } = await db
+async function loadFacets(
+  db: Db,
+  merchantId?: string,
+): Promise<BlogListing["facets"]> {
+  let query = db
     .from("blog_terms")
     .select("slug, name, kind, article_count")
-    .gt("article_count", 0)
+    .gt("article_count", 0);
+  // Tenant scope: ONE store's terms, when a store surface asks.
+  if (merchantId) query = query.eq("merchant_id", merchantId);
+  const { data } = await query
     .order("article_count", { ascending: false })
     .limit(24);
```

`resolveTerm` (slugs are unique per MERCHANT — a store surface must resolve its own claimant, never another store's same-named term):

```diff
 async function resolveTerm(
   db: Db,
   kind: TermKind,
   slug: string,
+  merchantId?: string,
 ): Promise<TermRow | null> {
-  const { data } = await db
+  let query = db
     .from("blog_terms")
     .select(TERM_COLUMNS)
     .eq("kind", kind)
-    .eq("slug", slug)
+    .eq("slug", slug);
+  // Tenant scope: the same word in two stores resolves independently.
+  if (merchantId) query = query.eq("merchant_id", merchantId);
+  const { data } = await query
     .order("article_count", { ascending: false })
     .order("id", { ascending: true })
     .limit(1);
   return ((data ?? [])[0] as TermRow | undefined) ?? null;
 }
```

`loadTermArchive` — the opts, the cache key, the facets call and the articles window:

```diff
 export async function loadTermArchive(
   kind: TermKind,
   slug: string,
   rawPage: unknown,
+  opts?: {
+    /** Tenant scope: resolve the term and window the listing to ONE merchant. */
+    merchantId?: string;
+    /** Base-path override — the store archive's own URL, not the global one. */
+    basePath?: (page: number) => string;
+  },
 ): Promise<TermArchive> {
   const page = normalizePage(rawPage);
-  const basePath = (p: number) => termArchivePath(kind, slug, p);
+  const basePath =
+    opts?.basePath ?? ((p: number) => termArchivePath(kind, slug, p));
   const db = await anonDb();
 
   // Resolution happens outside `renderRead` because its failure mode is a 404,
   // not a fallback — but it is still cached by the inner listing read below.
-  const term = await resolveTerm(db, kind, slug);
+  const term = await resolveTerm(db, kind, slug, opts?.merchantId);
   if (!term) throw new TermNotFound(slug);
```

```diff
   return renderRead<TermArchive>({
     name: "blog.archive",
-    key: `blog|archive|${kind}|${slug}|${page}`,
+    // Tenant-prefixed when scoped: one store's archive can never be served
+    // from another's entry — or from the global one.
+    key: opts?.merchantId
+      ? `blog|archive|${opts.merchantId}|${kind}|${slug}|${page}`
+      : `blog|archive|${kind}|${slug}|${page}`,
     fallback,
     context: { kind, page },
```

```diff
-        loadFacets(db),
+        loadFacets(db, opts?.merchantId),
```

```diff
-      const { data } = await db
+      let articlesQuery = db
         .from("articles")
         .select(CARD_COLUMNS)
         .in("id", ids)
-        .eq("status", "published")
+        .eq("status", "published");
+      // Tenant scope on the one query whose rows actually render: the id
+      // window comes from this term's links, but the articles are filtered
+      // again — belt and braces on the data-authority path.
+      if (opts?.merchantId)
+        articlesQuery = articlesQuery.eq("merchant_id", opts.merchantId);
+      const { data } = await articlesQuery
         .lte("published_at", new Date().toISOString())
         .is("deleted_at", null)
         .order("published_at", { ascending: false, nullsFirst: false });
```

The sibling/ancestry query is ALREADY merchant-scoped by the term's own `merchant_id` (`blog-index.server.ts:383`), so it is untouched; the `article_terms` count is keyed by `term_id`, which the scoped `resolveTerm` has already made tenant-unique. The unscoped path — the three store-less routes — changes only in that its intermediate variables are named; the query chains, the cache key and the produced values are identical.

#### (o.3.5) `src/components/store/BlogList.tsx` — the card chip and the rail follow the store slug

```diff
 import { termArchivePath,
   pageWindow,
   type Paging,
   type TermKind,
 } from "@/lib/blog-taxonomy";
 import { useLang } from "@/lib/i18n";
+import { useStoreSlug } from "@/lib/store-slug-context";
```

`BlogCard` (the chip in `ArticleGrid`, which every listing surface renders):

```diff
 function BlogCard({
   article,
   priority,
 }: {
   article: BlogCardData;
   priority: boolean;
 }) {
   const { t, lang } = useLang();
+  const storeSlug = useStoreSlug();
   const published = formatDate(article.publishedAt, lang);
```

```diff
         {article.category ? (
           <Link
-            to="/blog/category/$slug"
-            params={{ slug: article.category.slug }}
+            to={
+              storeSlug
+                ? "/store/$slug/blog/category/$termSlug"
+                : "/blog/category/$slug"
+            }
+            params={
+              storeSlug
+                ? { slug: storeSlug, termSlug: article.category.slug }
+                : { slug: article.category.slug }
+            }
             className="w-fit rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground"
           >
```

`ArchiveRail` — only the CATEGORY link becomes store-aware; tags have no store route and stay global:

```diff
 export function ArchiveRail({
   facets,
   activeSlug,
 }: {
   facets: { slug: string; name: string; kind: TermKind; count: number }[];
   activeSlug?: string;
 }) {
   const { t } = useLang();
+  const storeSlug = useStoreSlug();
   if (!facets.length) return null;
```

```diff
           <Link
             key={`${facet.kind}:${facet.slug}`}
             to={
-              facet.kind === "tag" ? "/blog/tag/$slug" : "/blog/category/$slug"
+              facet.kind === "tag"
+                ? "/blog/tag/$slug"
+                : storeSlug
+                  ? "/store/$slug/blog/category/$termSlug"
+                  : "/blog/category/$slug"
             }
-            params={{ slug: facet.slug }}
+            params={
+              facet.kind !== "tag" && storeSlug
+                ? { slug: storeSlug, termSlug: facet.slug }
+                : { slug: facet.slug }
+            }
             aria-current={active ? "page" : undefined}
```

#### (o.3.6) `src/components/builder/blog.tsx` — the widget card and the terms list follow the store slug

```diff
 import type { BlogCardData } from "@/components/store/BlogList";
 import { ArchiveRail, Pager } from "@/components/store/BlogList";
 import type { Paging, TermKind } from "@/lib/blog-taxonomy";
 import { parsePickedHandles } from "@/lib/builder-ast";
+import { useStoreSlug } from "@/lib/store-slug-context";
 import type { WidgetComponent } from "./widgets";
```

`Card` (the blog-listing widget's card):

```diff
 function Card({
   article,
   showCover,
   showExcerpt,
   showMeta,
   lead = false,
 }: {
   article: BlogCardData;
   showCover: boolean;
   showExcerpt: boolean;
   showMeta: boolean;
   lead?: boolean;
 }) {
+  const storeSlug = useStoreSlug();
   return (
```

```diff
         {article.category ? (
           <Link
-            to="/blog/category/$slug"
-            params={{ slug: article.category.slug }}
+            to={
+              storeSlug
+                ? "/store/$slug/blog/category/$termSlug"
+                : "/blog/category/$slug"
+            }
+            params={
+              storeSlug
+                ? { slug: storeSlug, termSlug: article.category.slug }
+                : { slug: article.category.slug }
+            }
             className="w-fit rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground"
           >
```

`BlogTermsWidget` (its list variant; its rail variant delegates to `ArchiveRail` above):

```diff
 const BlogTermsWidget: WidgetComponent = ({ str, bool }) => {
   const feed = useBlogFeed();
+  const storeSlug = useStoreSlug();
   const facets = feed?.facets ?? [];
```

```diff
               <Link
                 to={
-                  facet.kind === "tag"
-                    ? "/blog/tag/$slug"
-                    : "/blog/category/$slug"
+                  facet.kind === "tag"
+                    ? "/blog/tag/$slug"
+                    : storeSlug
+                      ? "/store/$slug/blog/category/$termSlug"
+                      : "/blog/category/$slug"
                 }
-                params={{ slug: facet.slug }}
+                params={
+                  facet.kind !== "tag" && storeSlug
+                    ? { slug: storeSlug, termSlug: facet.slug }
+                    : { slug: facet.slug }
+                }
                 className="inline-flex min-h-11 items-center gap-2 hover:text-primary"
               >
```

#### (o.3.7) `src/routes/store.$slug.blog.index.tsx` and `src/routes/blog.index.tsx` (store branch) — the store blog surfaces gain the slug context

The two existing store blog surfaces render `BlogArchiveTheme` directly; wrapping their output in the context re-points the cards' category chips at the merchant-scoped archive without touching `BlogArchiveTheme` itself (it needs NO prop: the provider flows through ThemeChrome's fallback and its platform branch alike). In `store.$slug.blog.index.tsx`:

```diff
 import { storeBlogBasePath, storeListingHead } from "@/lib/store-blog-head";
 import { useLang } from "@/lib/i18n";
+import { StoreSlugContext } from "@/lib/store-slug-context";
```

```diff
       <StoreHeader
         slug={data.merchantSlug}
         name={merchantName}
         menus={data.chrome?.menus ?? []}
         themeKey={data.chrome?.themeKey ?? null}
       />
+      {/* The cards' category chips are STORE links here: inside the
+          merchant's storefront they point at
+          `/store/<slug>/blog/category/<term>`, the merchant-scoped archive
+          (Batch B, gap 3), not the platform-wide taxonomy route. */}
+      <StoreSlugContext.Provider value={data.merchantSlug}>
       <BlogArchiveTheme
         …(props unchanged)…
       />
+      </StoreSlugContext.Provider>
```

and the identical wrap (import + `value={data.merchantSlug}`) around the `return (<BlogArchiveTheme …/>)` of `blog.index.tsx`'s store branch (`StoreIndexPage`). `BlogArchiveTheme.tsx` itself is NOT edited — the earlier draft's `storeSlug` prop on it is dropped: the provider wrap is strictly weaker in surface area and produces the same chips.

#### (o.3.8) `src/lib/preview-parity.contract.test.ts` — the archive case gains the production side (additions only)

The suite header's stale paragraph (comment-only):

```diff
- * The `archive` template is the one case with NO live production route (the
- * three platform taxonomy surfaces are store-less and keep the platform
- * grid), so its preview grant set must be EXACTLY the archive body's six
- * functional slots — the set the deferred merchant-scoped route must grant
- * when it lands.
+ * The `archive` template's production host is the shared archive host
+ * (`ArchiveView`), which the merchant-scoped route
+ * (`/store/<slug>/blog/category/<termSlug>`) renders with the
+ * server-resolved `archive_category` composition; the three store-less
+ * taxonomy routes keep the platform grid. The preview's archive grant set
+ * must be EXACTLY the archive body's six functional slots — the set that
+ * host grants.
```

```diff
 const SONGOSKRITI = read("lib", "themes", "songoskriti", "preview.ts");
+const ARCHIVE_VIEW = read("components", "store", "ArchiveView.tsx");
```

The archive case — the title, one comment moved, and the new equality (every existing `expect` is kept verbatim):

```diff
-  it("archive — no live production route, so the preview's grant set IS the contract", () => {
+  it("archive — the preview and the shared archive host grant the SAME six", () => {
     const preview = grantedSlots(PREVIEW, "const archiveSlots =");
-    // EXACTLY the archive body's six functional slots — the set the
-    // deferred merchant-scoped route must grant when it lands.
     const six = [
       "blog_archive",
       "blog_pager",
       "blog_terms",
       "category_header",
       "empty_state",
       "pagination",
     ];
     expect(preview).toEqual(six);
+    // The production side: the shared archive host grants exactly the same
+    // six — the merchant-scoped route renders THIS host with its
+    // server-resolved `archive_category` composition (Batch B, gap 3), so
+    // the two hosts can no longer drift.
+    expect(grantedSlots(ARCHIVE_VIEW, "const ARCHIVE_SLOTS")).toEqual(six);
     // … and the theme's own archive body uses EXACTLY those six, so the
     // grant set is neither wider nor narrower than the body.
```

`grantedSlots(ARCHIVE_VIEW, "const ARCHIVE_SLOTS")` parses the balanced object literal after the marker — the type annotation `Partial<Record<SectionType, ReactNode>>` contains no `{`, so the first brace is the map's own; its six `key:` entries are catalogue widgets and count as grants.

#### (o.3.9) `src/lib/preview-safety.contract.test.ts` — one stale TITLE and one comment (the assertion is untouched)

```diff
-  it("archive has no live route, so the preview's grants ARE its contract", () => {
+  it("archive — the preview's grants cover the template's required slots", () => {
     const preview = grantedSlots(PREVIEW, "const archiveSlots =");
+    // The merchant-scoped route that landed in Batch B grants the same six
+    // through the shared archive host (`preview-parity.contract.test.ts`
+    // pins the equality); this suite keeps the required-subset premise.
     expect(
       requiredSlots("archive").filter((slot) => !preview.includes(slot)),
     ).toEqual([]);
   });
```

#### (o.3.10) `.e2e/songoskriti-seven-templates.spec.ts` — one stale comment (comment-only)

```diff
-    //     node — against the platform's own outcome: a publish that advanced
-    //     the pointer must be visible, and a refused publish must not have
-    //     half-applied. The archive journey's route is the theme PREVIEW (its
-    //     storefront route is the deferred merchant-scoped one), and the
-    //     preview resolves the merchant's latest VERSION rather than the
+    //     node — against the platform's own outcome: a publish that advanced
+    //     the pointer must be visible, and a refused publish must not have
+    //     half-applied. The archive journey's route is the theme PREVIEW (the
+    //     merchant-scoped storefront route landed in Batch B, but this
+    //     journey exercises the preview host), and the preview resolves the
+    //     merchant's latest VERSION rather than the
     //     published pointer (`src/lib/preview-sources.ts`), so the published
     //     contract is asserted on the routes the storefront actually serves.
```

### (o.4) The design decisions this record pins before the edit

1. **The store-slug channel is the EXISTING `StoreSlugContext`** (`src/lib/store-slug-context.ts`), provided by `ArchiveView` (and by the two wrapped store routes) and consumed by the chips through `useStoreSlug()`. `ThemeChrome`'s `SectionRenderer` re-provides the same slug inside the composition (it passes its own `storeSlug ?? null` at `ThemeChrome.tsx:926`), so a chip reached either by the composition tree or by the route-level fallback sees one value. `BlogArchiveTheme` needs NO new prop.
2. **The StoreWelcome trap is avoided by construction.** `ThemeChrome` answers `storeSlug && isThemeless(ast, tokens)` (`ThemeChrome.tsx:261`) with the StoreWelcome frame. `ArchiveView` therefore passes `storeSlug` to `ThemeChrome` ONLY on the composed branch (where the body exists — never themeless), and the themeless branch never mounts ThemeChrome with a slug; a store without a published theme keeps the platform grid on this surface, exactly as `store.$slug.blog.index.tsx:41-45` already pins for the blog index. The draft plan's "forward tokens to `BlogArchiveTheme`" step is dropped — `BlogArchiveTheme` gates on `ast && tokens` and its ThemeChrome path is untouched.
3. **The composition is resolved SERVER-SIDE.** The route's fn calls `resolveTemplateForHost` directly (with `mode: "published"`, `host: "storefront"`, the merchant as `tenant`) rather than reusing `getStoreChrome`'s variant path — that path resolves through `resolveVariantAst` alone and returns no `PipelineResolution` provenance, so it would not satisfy the gate's letter. The home-chrome merge mirrors `publishedTemplatePayload`'s rule through the same resolver on `"index"`; `storefront.server.ts` and `storefront.functions.ts` stay untouched.
4. **The preview is NOT extended with an archive-specific query** (the draft's optional `ThemePreviewFrame.tsx` edit is dropped): preview pagination already renders through the global search-demo query, the parity contract asserts slot PRESENCE (not pager numbers), and skipping the edit removes one §7 target. The archive's own page math is proven on the production side by the new route test's render leg.
5. **`loadTermArchive` extends, never forks.** The tenant scope is two optional parameters on the existing reader (scope + base path) with the cache key tenant-prefixed only when scoped; the global key, the global chains and the three store-less routes' behaviour are byte-identical. The stale "no per-term merchant scope" claim (`store-blog.server.ts:120`) is NOT acted on: `blog_terms` carries `merchant_id` and `article_count` (`TERM_COLUMNS`), and the store archive scopes by merchant directly.
6. **`blog.$slug.tsx` needs no edit** — verified: the store article branch nulls the blog pack and renders no category link; `ArticleView` and `store.$slug.blog.$articleSlug.tsx` carry no `termArchivePath`/category chip either. Tag and author links stay global everywhere (no store routes exist for them), and the three store-less taxonomy routes are unchanged.
7. **`routeTree.gen.ts` changes only through regeneration** — the `tanstackStart()` vite plugin regenerates it when the new route file exists (`node_modules/.bin/vite build`); no hand edit.

### (o.5) Boundary

Everything above is measured against this branch's own source at HEAD `8e144f6f`, before any edit. The four standing churn paths (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, and the untracked `.output-snapshots/`) stay unstaged and untouched. The three pre-existing failures (`src/lib/analytics-live-shape.test.ts` ×2, `src/lib/site.server.test.ts` ×1) are not mine and remain expected reds. The doc files that still call the route deferred (`docs/04-builder/theme-runtime.md:410,417`, `report.md:445` §5.3 #5) are §7-free and are corrected in the code commit. This record is committed by explicit path BEFORE the code commit it governs.

## (o.6) Batch B — the declined-frame corrective hunk, recorded before the edit

*(Append-only, dated 2026-10-23, continuing §(o) before the code commit, in the Batch A corrective-hunk form §(n.6) established: a deviation found against the applied work is written here, with its exact old → new hunk, BEFORE the hunk is applied. Both files it touches are NEW files — `src/lib/store-blog-archive.server.ts` and `src/lib/store-blog-archive.functions.ts`'s sibling route test — so §7 needs no relaxation; they are named here for the record's continuity, not because §7 demanded it.)*

### (o.6.1) The finding — the staging left the WRONG hidden state for a themed store that authors no archive body

§(o.2) planned the loader's composition read as `resolution.status === "resolved"` → `ast`, anything else → `ast` stays `null`. On the planned §(o.3.3) host that null rides `ArchiveView`'s themeless branch: the **naked platform grid with no ThemeChrome at all**. For a store with **no theme at all** that is correct by pin (the store blog index rule — a merchant who never published a theme keeps the platform grid, and `ThemeChrome` must never answer it with the StoreWelcome frame). For a store whose **theme IS published but authors no archive body**, it is a silent, unbranded platform page — exactly the state the plan's Decision Gate **G3** ruled out on 2026-10-22 (`docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md:373`): *"the storefront keeps the route's platform surface inside the theme's **named** frame (`data-fq-theme-state=\"declined-template\"` …)"*, and §(h.7) of the phase-3 record applied that one-insertion diff to `ThemeChrome`. The stage's grid ship keeps the platform surface but loses the frame, because `ArchiveView` never mounts `ThemeChrome` when `ast` is null.

The corrective hunk keeps `ArchiveView` untouched (no second §(o.3.3) round on the shared host) and fixes the **loader**: when a theme is published and the archive resolution is `absent`, the loader still ships an `ast` — an **EMPTY-MAIN body with the home chrome merged**, so `ArchiveView` takes its composed branch and `ThemeChrome` renders the declined-template frame. `themeRendersBody` answers `false` for an empty main (`src/lib/theme-body-slot.ts`: *"no theme AST, or an empty theme main: the route's fallback renders"*), so `ThemeChrome.tsx:441-458` renders `data-fq-theme-state="declined-template"` / `data-fq-template="archive"` with the store's name and the template's display name, around the host's `fallback` (the platform grid) — with the theme's tokens on `ThemeSurface` and the home header/footer, exactly what `BlogArchiveTheme` already produces for a themed store on the blog index. The resolver's semantics are untouched: `resolveTemplateForHost` still answers `absent` (never a synthesized body); the loader turns one SECOND-CLASS null into the named first-class state. The un-themed rule stands: `tokens`/`themeKey` null ⇒ `ast` null ⇒ the naked grid (never StoreWelcome).

### (o.6.2) The exact old → new diff — `src/lib/store-blog-archive.server.ts`

```diff
     const { resolveTemplateForHost } = await import("./pipeline-resolver");
     const resolution = resolveTemplateForHost({
       template: "archive_category",
       variants: theme.templates,
       tenant: chrome.merchant.id,
       mode: "published",
       host: "storefront",
       tokens: theme.tokens,
     });
-    if (resolution.status === "resolved") {
-      // The chrome rule the base path already applies, through the SAME
-      // resolver: a template that publishes no header/footer borrows the
-      // home template's, so a shopper never lands on a page without the
-      // store's navigation or its policy links.
+    // The chrome rule the base path already applies, through the SAME
+    // resolver — ONCE, and reused for the decline below: a template that
+    // publishes no header/footer borrows the home template's, so a shopper
+    // never lands on a page without the store's navigation or its policy
+    // links.
     const home = resolveTemplateForHost({
       template: "index",
       variants: theme.templates,
       tenant: chrome.merchant.id,
       mode: "published",
       host: "storefront",
     });
     const homeAst = home.status === "resolved" ? home.ast : null;
-      ast = {
-        header: resolution.ast.header.length
-          ? resolution.ast.header
-          : (homeAst?.header ?? []),
-        main: resolution.ast.main,
-        footer: resolution.ast.footer.length
-          ? resolution.ast.footer
-          : (homeAst?.footer ?? []),
-      };
-    }
-  }
+    // The NAMED decline (Decision Gate G3): a PUBLISHED theme that authors
+    // no archive body keeps the platform's grid — but inside the theme's
+    // own chrome, in the store's voice, as the DECLINED-TEMPLATE frame
+    // (`ThemeChrome` answers an empty main with
+    // `data-fq-theme-state="declined-template"`, `theme-body-slot.ts`),
+    // never a silent, unbranded grid and never the StoreWelcome panel.
+    // A store with NO theme keeps `ast` null: the naked-and-honest grid is
+    // that store's pinned blog-index rule.
+    ast = {
+      header:
+        resolution.status === "resolved" && resolution.ast.header.length
+          ? resolution.ast.header
+          : (homeAst?.header ?? []),
+      main: resolution.status === "resolved" ? resolution.ast.main : [],
+      footer:
+        resolution.status === "resolved" && resolution.ast.footer.length
+          ? resolution.ast.footer
+          : (homeAst?.footer ?? []),
+    };
+  }
```

The resolved case is byte-identical to §(o)'s applied merge; only the `absent` case changes null → the empty-main merged body.

### (o.6.3) The exact old → new diffs — the route suite adds the two legs the owner's gate demands

`src/routes/store.$slug.blog.category.$termSlug.test.tsx` gains, in the wiring suite, the decline pin on the loader source:

```diff
     // The client receives the resolved AST — never the theme's map.
     expect(LOADER).not.toMatch(/return \{[^}]*templates/s);
+    // The NAMED decline (G3): a published theme WITHOUT an archive body
+    // ships an empty-main body inside the store's chrome, so the host
+    // renders the declined-template frame around the platform grid — never
+    // a silent, unbranded grid and never the StoreWelcome panel.
+    expect(LOADER).toContain(
+      'main: resolution.status === "resolved" ? resolution.ast.main : [],',
+    );
```

and in the behaviour suite, an extended `renderHost` plus the two legs the acceptance gate names (the Songoskriti published-resolution leg and the declined-frame leg). The Songoskriti leg builds the theme's OWN template map in the test and resolves through `resolveTemplateForHost` exactly as the loader does (`archive_category` variant-first, the home chrome merged under the resolved body), so the leg exercises the gap-3 contract itself, not a hand-stub:

```diff
 function renderHost(options: {
   storeSlug?: string;
   themed?: boolean;
+  songoskriti?: boolean;
+  declined?: boolean;
 }): string {
+  …
+  const ast = options.songoskriti ? songoskritiAst() : (options.declined ? DECLINED_AST : (options.themed ? THEME_PAGER_AST : null));
   …
   return renderToStaticMarkup(
     <ArchiveView kind="category" context={context} feed={feed} header={<h1>Eid</h1>} empty={<p>Nothing here.</p>}
       tokens={tokensFor(options)} themeKey={...} storeSlug={...} ast={...} />
   );
 }
```

with:

1. **the Songoskriti leg** — `songoskritiPreviewSource()` builds `index` and `archive` bodies, `resolveTemplateForHost({ template: "archive_category", mode: "published", host: "storefront", tenant })` resolves the VARIANT to the theme's archive body, the merge rule produces the shipped `ast`, and `ArchiveView` renders it with the store slug and the theme's tokens. Assertions: the composition resolves to the six archive slots; the theme's band renders **by the theme's own key** (`data-collection-header`, the `SONGOSKRITI_WIDGETS` band `SectionRenderer` resolves from the themeKey); the term's records render through the bodies (the article's own title inside the theme's `blog_archive` render, the facet's own name inside `blog_terms`); the platform's pager ALSO renders (`blog_pager`); and the store's chrome is the store's — the mount carries the theme's accent token (`--theme-accent`, Songoskriti's `#8B4513`) and the merged home footer's links are the theme's.
2. **the declined leg** — the merged EMPTY-MAIN body (the §(o.6.2) contract) renders the DECLINED-TEMPLATE frame: `data-fq-theme-state="declined-template"` and `data-fq-template="archive"`, the naming label points at the store and the template ("Songoskriti — this theme does not design the Archive page", `templateDisplayName`), the platform grid renders INSIDE it with its article hrefs, and the tokens still apply (the mount carries the theme's accent token) — never the StoreWelcome panel, never a bare unbranded grid.

### (o.6.4) Boundary of the correction

Only `src/lib/store-blog-archive.server.ts` (NEW) and `src/lib/store-blog-archive.functions.ts`'s sibling route test (NEW) change. `ArchiveView` is NOT re-edited — §(o.3.3)'s host stands as recorded and staged. No tracked-but-untouched file is touched. Everything else in this correction is measured against the staged tree at `a7210575` before it is applied.

### (o.6.5) The declined frame's label must read the STORE'S DISPLAY NAME — `storeName` threaded through `ArchiveView` (dated 2026-10-23, before the edit)

*(Append-only, in the Batch A corrective-hunk form §(n.6) established, like §(o.6) before it: a deviation found against the applied work is written here, with its exact old → new hunk, BEFORE the hunk is applied.)*

**What executing the §(o.6.3) legs found.** The declined leg asserted the label `"Songoskriti — this theme does not design the Archive page"`, and it FAILED — the rendered frame reads **"songoskriti — this theme…"**, the raw slug. `ThemeChrome`'s label takes `(storeName ?? storeSlug)` (`src/components/store/ThemeChrome.tsx`:450-452), and `ArchiveView` — whose only §7-prohibited host change is the staged §(o.3.3) — ships no `storeName` to it. No production storefront host passes `storeName` either (the article, collection, search, cart, checkout and account routes pass `storeSlug` only), so every declined frame in the programme so far has been speaking the slug. The §(o.6.3) leg pinned the merchant's own name — "Songoskriti", the name the theme's footers and the `StoreHeader` mount both carry (`footer.ts`'s `BRAND_NAME`, the route's `StoreHeader name={data.merchant.name}`) — because a shopper-facing `data-fq-theme-state` label should read the store the way the store shows itself, not a URL segment. Also §(o)'s owner-gate legs (§(o.6.3) case 2) are therefore themselves the authority for thread-through.

**The rule's shape.** The route already holds the display name (`data.merchant.name`, next to the `storeSlug` it already passes); `ArchiveView` mounts `ThemeChrome` in exactly one place (the composed branch); `ThemeChrome` already accepts `storeName`. So the threading is two one-line propagation props, no second voice is invented anywhere.

**Where the hunk lands.** `src/components/store/ArchiveView.tsx` (the SAME file §(o.3.3) already escalated — a second round on an already-escalated file §(n.6)'s precedent covers, under the owner's standing instruction; the route `store.$slug.blog.category.$termSlug.tsx` is a NEW Batch-B file and needs no relaxation) and the leg's own test file (NEW).

```diff
  export type ArchiveViewProps = {
    ...
    /** The store slug when this archive serves a merchant storefront. */
    storeSlug?: string | null;
+   /**
+    * The merchant's DISPLAY name — the declined-template frame labels
+    * itself in the store's own voice (`ThemeChrome`'s
+    * `storeName ?? storeSlug`). Absent in themeless and store-less hosts,
+    * where no frame renders.
+    */
+   storeName?: string | null;
  };
```

```diff
  export function ArchiveView({
    kind,
    context,
    feed,
    header,
    empty,
    templates,
    ast: composedAst,
    tokens,
    themeKey,
    storeSlug,
+   storeName,
  }: ArchiveViewProps) {
```

```diff
          <ThemeChrome
            template="archive"
            ast={ast}
            tokens={tokens ?? null}
            themeKey={themeKey ?? null}
            storeSlug={storeSlug ?? undefined}
+           storeName={storeName ?? undefined}
```

`src/routes/store.$slug.blog.category.$termSlug.tsx`:

```diff
        tokens={data.tokens}
        themeKey={data.themeKey}
        storeSlug={data.merchant.slug}
+       storeName={data.merchant.name}
```

`src/routes/store.$slug.blog.category.$termSlug.test.tsx` — the wiring pins that the threaded props exist (in the §(o.4.4/§(o.4) wiring suites):

```diff
    expect(ROUTE).toContain("ast={data.ast}");
    expect(ROUTE).toContain("storeSlug={data.merchant.slug}");
+   // The declined frame's label reads the store's DISPLAY name.
+   expect(ROUTE).toContain("storeName={data.merchant.name}");
    expect(ROUTE).toContain("<StoreHeader");
```

```diff
    expect(HOST).toContain("storeSlug={storeSlug ?? undefined}");
+   expect(HOST).toContain("storeName={storeName ?? undefined}");
  });
```

and `renderHost` carries an optional `storeName` the Songoskriti and declined legs pass (`storeName: "Songoskriti"`), so the declined leg's label assertion stands as §(o.6.3) wrote it. The themeless/grid branches are untouched — no `ThemeChrome` there receives `storeName` from this host, so a themeless store's shape is unchanged.

### (o.6.6) Boundary of the §(o.6.5) threading

`ArchiveView.tsx` (already under §(o.3.3)'s escalation), the NEW route file and the NEW route test change. Nothing else. The declined copy's own test (`ThemeChrome.declined-copy.test.tsx`) already covers `storeName` in its third case and needs no change.

### (o.7) §(o)'s code commit — the Batch B gaps land, with verification and the two §(o.6.5)-forced deviations (dated 2026-10-23, after the code)

**The code commit:** `45ca77cd` — 19 files (5 created: the route, its test, the fn, the loader and the tenant reader suite; 14 modified: the two store blog routes, `ArchiveView`, `BlogList`, the builder packs, the reader, `facet-url.ts`, both contract suites, the regenerated `routeTree.gen.ts`, the e2e spec's comment, and the two §(o.5) doc corrections — `docs/04-builder/theme-runtime.md`:410,417 and `report.md`:445, both now describing the LANDED route instead of the deferral). No test weakened, skipped or deleted. Staged by explicit path; the churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, `.output-snapshots/`) are NOT in the commit.

**Verification run before the commit** (all green):

- `node_modules/.bin/tsgo --noEmit` — clean (run twice: before the storeName hunk's lint reformat and again after).
- `node_modules/.bin/vitest run 'src/routes/store.$slug.blog.category.$termSlug.test.tsx'` — **10 passed**: the five wiring pins, the four §(o) legs, and the two §(o.6.3) gate legs (Songoskriti published composition + the declined frame).
- `node_modules/.bin/vitest run` on `src/components/store/ArchiveView.test.tsx`, `src/lib/blog-index-tenant.test.ts`, `src/lib/preview-parity.contract.test.ts`, `src/lib/preview-safety.contract.test.ts`, `src/lib/store-blog-functions.test.ts`, `src/lib/store-blog.test.ts`, `src/lib/widget-parts.test.ts`, `src/lib/theme-update.test.ts`, `src/lib/pipeline-resolver.test.ts`, `src/routes/store.$slug.search-composition.test.tsx`, `src/lib/phase2-collection.test.tsx`, `src/lib/themes/songoskriti/{search-template,blog-page-composition}.test.ts`, `src/lib/widget-registry.test.ts` — **all passed** (53 + 60 + 62 + 22 across the four batches).
- `node_modules/.bin/eslint` on the fifteen touched source/test files — **0 errors** (5 pre-existing `react-refresh/only-export-components` warnings in `collection.tsx`/`BlogList.tsx`, none introduced); the route test's prettier gaps auto-fixed, re-run green.
- `node_modules/.bin/playwright test -c .e2e/playwright.config.ts --list` on `'.e2e/songoskriti-seven-templates.spec.ts'` — **8 tests listed** (no browser run, per the gate).
- Pre-existing failures elsewhere, not touched, not mine: `src/lib/analytics-live-shape.test.ts` (2), `src/lib/site.server.test.ts` (1) — unchanged from Batch A's report.

**Cosmetic deviations between §(o.6.3)'s planned leg shapes and the applied legs** (both inside the NEW test file, both §7-free):

1. the record sketched `renderHost`'s `ast` selection as a single ternary over a shared `THEME_PAGER_AST`/`DECLINED_AST` constant; the applied legs compute the Songoskriti ASTs through two named helpers (`songoskritiPublishedAst()` / `songoskritiDeclinedAst()`) built on `resolveAsLoaderDoes()` over an in-test `songoskritiMap(withArchive)` — the same resolver-first construction §(o.6.3) named, one helper per shipped contract;
2. the §(o.6.3) source quote pin adopted §(o.6)'s exact line form (`'main: resolution.status === "resolved" ? resolution.ast.main : [],'`) — applied as recorded.

And the §(o.6.5) record's own two: `ArchiveView`'s composed-branch `ThemeChrome` mount carries the threaded `storeName` (`storeName={storeName ?? undefined}`, after the recorded `storeSlug` line — order kept as written), and the route passes `storeName={data.merchant.name}` immediately after its `storeSlug` line; the §(o.6.4) "ArchiveView is NOT re-edited" boundary was superseded by §(o.6.5)'s recorded hunk before the edit, not silently.

**Boundary:** no translation file touched (Batch C's lane), nothing pushed or deployed, §7 untouched outside the named hunks.

### (p) Batch C — the owner ruled "translate the theme copy" (dated 2026-10-23, before the edit)

**The ruling.** The publish gate's `theme.publish_blocked codes=translation` refusal is the last open acceptance blocker. The owner's ruling: **translate Songoskriti's theme copy into natural Bengali; no gate is weakened, no floor lowered.** This batch touches only the theme's own copy. Not a meter hack: the strings get real `_bn` twins.

**Measured BEFORE — by RUNNING the gate's own functions** (`translationCoverage` over the theme's full source template map — the exact map `registryPackage("songoskriti")` seeds: the 10 base templates the preview source authors plus the 2 variant bodies `blog_listing`/`blog_article`; compiled through `assemblePreviewTemplates` + `assemblePreviewVariants`, the same composition the publish payload is built from), then `authoredCoverage`:

- the walk universe is **438 bilingual pair slots** across the 12 authored templates: **ok 207, fallback 63, empty 168**;
- the gate's own number (`authoredCoverage`: `percent = ok / (ok + fallback)` — empty, unauthored slots are NOT in the denominator) reads **207/270 = 77 %** → refusal (77 < 90). The phase4 lane's live "**63 %**" message was measured on the disposable store's publish payload, which carried the merchant-edited compositions' added English copy on top of the seed; the seed itself is what Batch C translates, and the same dilution mechanism is why mere seed-90 % would not have been enough (Batch D's lanes carry their own editor edits);
- uncovered = the **63 fallback slots** (English authored, বাংলা missing) = **48 unique strings**. The **168 empty slots are UNAUTHORED optional props** (alt texts, optional eyebrows/headings, not-yet-authored statement zones) — the gate does not count them, and "translating" them would be inventing copy (R4), which is refused.

**Measured AFTER (planned):** translating all 63 fallback slots → **270/270 = 100 %**, the gate passes with zero warning strings left.

**Constraint inventory respected (the refusal inventory):**

- `PREVIEW_DISABLED_MESSAGE` and the preview marker's English-only clause — platform chrome, explicitly recorded English-only; NOT touched. (Out of theme scope anyway.)
- `UNSUPPORTED_TEMPLATE_BODY` / `UNSUPPORTED_TEMPLATE_TITLE` — carry their stated English-only contract (their own comment); NOT touched.
- `page` template body and every route-h1 template's h1 — route context, no copy authored (empty slots, untouched).
- The 168 empty slots — unauthored; no invented copy.
- `paymentsMarks` EN leg and `PAYMENT_MARKS` itself stay unchanged (the shared platform fallback `StoreFooterMenus` reads the same constant); the twin goes in as a NEW `paymentsMarks_bn` on the theme's footer section only.
- The `collection` category_header legacy `text`/`text_bn` alias — untouched (Batch D's declared-field note stands); the gate counts the declared `heading`, which gets its twin.
- `parts` strings (`"title,variant,quantity,…"` etc.) are wire contracts, not copy — untouched.

**Meter's file set:** `translationCoverage` runs ONLY over the publish input's template map (server) and the editor's live map (studio meter) — there is no separate copy table the meter counts; the uncovered set above is the complete set the gate sees.

**Parity stills:** the theme's copy appears in the stills, so they WILL change again; Batch D must re-classify and re-freeze them. They are NOT re-frozen by Batch C.

### (q) §(p)'s batch lands — the Batch C code commit, verification, and the report (dated 2026-10-23, after the code)

**The code commit is `53206b8a`** — `themes(songoskriti): author all remaining Bengali _bn twins to clear translation publish gate` — **7 files, +107/−8**: `src/lib/themes/songoskriti/preview.ts` (search/archive/blog/cart/checkout/blog_listing/blog_article `_bn` twins + the collection category_header's declared `heading_bn`), `src/lib/themes/songoskriti/homepage.ts` (craft_story/split_feature CTA twins, finder_row o1–o7, store_locator s1–s3), `src/lib/themes/songoskriti/footer.ts` + `src/lib/footer-copy.ts` (NEW `PAYMENT_MARKS_BN`, passed as `paymentsMarks_bn` on the theme's footer menus only — passed as `paymentsMarks_bn` on the theme's footer menus only — `PAYMENT_MARKS` (EN) and `StoreFooterMenus` untouched), `src/lib/themes/songoskriti/search-template.test.ts` (the exact prop-key set pins extended with the new `_bn` keys), and `src/components/builder/songoskriti-snapshots.test.tsx` + its `__snapshots__/**.snap` (fixture pins extended; the footer fixture `FIXED_FOOTER_PROPS` gains `paymentsMarks_bn`, `FIXED_LOCATOR_PROPS` gains the s1–s3 twins). English copy is unchanged on every line the edit touched.

**Measured AFTER — the gate's own functions re-run on the seeded theme source:** **270 ok / 270 (0 fallback) = 100 %** — §(p)'s planned BEFORE (207/270 = 77 %) → AFTER is landed exactly; the `theme.publish_blocked codes=translation` refusal clears the floor with zero fallback pairs remaining.

**Verification, measured by running:**

- `src/lib/themes/songoskriti` full suite: **31 files / 356 tests pass**; combined with the re-pinned builder files the run reports **33 files / 418 tests pass**.
- The builder batch (`songoskriti.test`, `songoskriti-port-freeze`, `songoskriti-snapshots`, `songoskriti-templates`, `heritage-*`, `footer-locale`, `theme-locale-sinks`) and `src/lib/footer-sitemap-bitext.test.ts`: all green.
- Adjacent: `preview-parity.contract`, `preview-safety.contract` (22), `pipeline-resolver` (20), `checkout-shell.contract`, `frame30-source-install`, `songoskriti-preview-compositions` (8) — **6 files / 92 tests pass**.
- `tsgo --noEmit` exits 0; `eslint` over all touched paths reports 0 problems; `node scripts/doc-gate.mjs` reports **findings: 0** (4 known suppressions).

**The §(p)-recorded refusals hold:** platform chrome (`PREVIEW_DISABLED_MESSAGE`, the preview marker), the `UNSUPPORTED_TEMPLATE_*` English-only contract, the 168 unauthored empty slots, the `text`/`text_bn` legacy alias, and the EN `paymentsMarks` legs were NOT touched. The two bn-locale `toMatchSnapshot` mismatches that surfaced (footer, store-locator) were updated with `-u` — the snapshots now assert the NEW Bengali copy, which §(p)'s ruling demands; that is an assertion-strengthening update, not a weakening.

**The batch report** (the full 48-unique-string EN→বাংলা pair table with slot multiplicities, the refusal inventory, verification evidence, and the Batch D handoff) lives at `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/batch-c-report.md` — gitignored by design, as Batches A/B's reports are.

**Parity stills are NOT re-frozen by this batch** (§(p)'s declaration stands): they show stale Bengali visuals until Batch D re-classifies and re-freezes them.

**Boundary:** the three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/` are unstaged, unmodified and untouched; nothing pushed or deployed; no dependency added; no browser or e2e lane run.

---

### (r) Batch D — the acceptance demonstration (dated 2026-10-23, before any Batch D edit)

**Batch D's mandate** (owner instruction): PROVE the owner's five acceptance conditions on the throwaway stack — after Batch C moved the gate's own measurement to **270/270 = 100 %** (`§(q)`) — and re-classify + re-freeze the parity stills that §(p) declared stale. Three consequences of the §(q) state change are owned here: (1) publication through the gate now SUCCEEDS, so the seven-template lane's publish-success branch (`.e2e/songoskriti-seven-templates.spec.ts` step 9/9b and the dynamic-themes lane's published branches) must run **for real** — the publish-refusal skip contracts become passes only where the 63 % refusal no longer holds, with the exact publish-success proof recorded; (2) every parity still that bakes theme copy is stale — classify every diff (copy-to-Bengali = expected; structural = a defect to fix), then re-freeze on this stack; (3) the archive route legs (Batch B's `/store/<slug>/blog/category/<termSlug>`) and the theme-switch A→B→A leg (Batch A's) run alongside.

**The throwaway stack (brought up and healthy — `docs/15-e2e/loopback-auth-setup.md` procedure):**

- `docker compose -f docker-compose.e2e.yml -f /tmp/opencode/e2e-auth/override.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d` — DB healthy; auth/rest first exited (empty service-role passwords after image init, as runbook-documented), fixed by `/tmp/opencode/e2e-auth/bringup3.sh` (ALTER ROLE passwords → compose up → auth/kong `healthy`, rest `running` (image has no `/bin/sh` — healthcheck cannot pass, as the script states) → socat relay 127.0.0.1:58000 → kong → `auth /health HTTP 200`, `rest / HTTP 200`).
- Fresh-DB schema: `apply-all.sh` (migration/0001 + roles + migration/000[2-9]² + supabase/migrations), then a re-apply repair pass over every first-pass-errored file → **0 errors** on 06 migration files + 23 supabase migrations. `pg_trgm` moved to `extensions` and `migration/0006_search_typo_tolerance.sql` re-applied → **0 errors** (search operator class + `storefront_search` now resolve).
- Seed: GoTrue admin user `e2e-merchant@example.invalid` (uid `8a52304c-bacf-4437-a17a-97ba8c4d9f11`, kept in the runbook's `merchant-uid.txt`); `migration/0002_seed.sql` with the real uid → 0 errors; `migration/0003_demo_catalogue.sql` re-applied → 0 errors; `move-catalogue.sql` (catalogue → `frame19-demo`), `align-blog-terms.sql` (the 8 reader columns + `article_count`), `seed-content.sql` (1 category term `handloom-heritage`, 2 published articles, 1 published CMS page `our-story`) → all 0 errors. Verified: merchants `frame19-demo` (owner member active) + `songoskriti-heritage`, 13 products, 2 articles, 2 article_terms, 1 blog term, 1 storefront page.
- App: `/tmp/opencode/e2e-auth/run-app.sh` (vite 3020, `DISABLE_HMR=true`, loopback Supabase env). Readiness: root/blog/catalogue/search/preview all 200; search serves 13 products with facets; catalogue images serve from `/ph/songoskriti/`. **Seeded-data note, recorded before any parity capture:** the fresh stack carries exactly the repo-runbook seed (1 category term, 2 articles) — the prior programme's parity stills additionally carried richer shop-floor demo tags whose seed script is not in the repo; re-seed data deltas are therefore an EXPECTED classification class alongside the copy-to-Bengali ones, 'expected-copy/seed' in the classification table.
- **Known uid variance:** the prompt's merchant UUID `a92ec7ee-…` was the prior stack's auth-user uid (out-of-band on this volume); this stack's uid is `8a52304c-…`. Both map to the SAME merchant (`frame19-demo`, `11111111-1111-4111-8111-111111111111`) through `merchant_members(owner)`, which is what every lane asserts against. No lane reads the uid.

**The lane plan, as-authored (Batch A/B already landed these):** NO lane edit is planned by this section. The seven-template lane and the dynamic-themes lane both branch on the publish's REAL outcome (`PublishOutcome`) and assert BOTH directions (§(n.7.3), §(n.4)): publish success ⇒ pointer advanced + the per-run marker VISIBLE on the storefront (+ `replacedCopy` absent); publish refusal ⇒ pointer untouched + no half-apply + the skip surfaced with the platform's reason. With the §(q) gate measurement at 100 %, the published branches are expected to run; any refusal that now appears for a DIFFERENT stated reason (e.g. a composition lint) is reported as a skip with that new reason verifiable from the response — and as a defect. Lane edits this batch may make are corrective only, each recorded here before the edit in the §(r.x) corrective form.

**The parity procedure, before the freeze:** (1) a verify-mode run (`E2E_NO_WEBSERVER=1`, `E2E_BASE_URL=http://localhost:3020`, `PORT_CAPTURE_OUT=after`, NO `--update-snapshots`, `--retries=0`) measures first-run divergence; (2) every differing surface is diffed against the git-HEAD machine baseline with the lane's own thresholds (`maxDiffPixelRatio 0.02`, `threshold 0.2`) and OPENED difference-by-difference — verdicts only from looking at the pixels; (3) the classification table (expected-copy / expected-seed / structural-defect counts, per surface) is recorded in §(r.2) BEFORE the freeze commit; (4) the freeze run (`run-capture.sh`: `PORT_CAPTURE_OUT` unset → `reference/`, `--update-snapshots`), staged by explicit path (`docs/superpowers/songoskriti-evidence/port/reference/`, `after/`, `reference-manifest.json`, `.e2e/songoskriti-port-parity.spec.ts-snapshots/`); the known `chrome-mobile-drawer-375-bn` manual-review case keeps its documented skip; (5) a clean verify run after the freeze (66 passed / 1 skipped expected shape). Thresholds unchanged; no assertion weakened, skipped or deleted.

**Standing:** explicit-path staging · churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` never staged · no push, no deploy · no subagents · no new dependency.

### (r.2) Parity run 1 (verify mode, `PORT_CAPTURE_OUT=after`, `--retries=0`) — measured and classified, BEFORE the freeze

**Run result:** `66 passed (9.6m), 1 skipped` — the skip is the documented `chrome-mobile-drawer-375-bn` manual-review case (`§` `SKIPPED` map, no baseline by design). No failure, no flake retry.

**Dispositions of the frozen layers (measured, not assumed):** the git-HEAD machine baselines are the lane's assertion layer; the git-HEAD human reference stills are one-to-two generations older (tracked `reference/` last frozen at commit `afde2871`, while machine baselines were re-frozen at `c565f0d0` "rebuilt theme compositions" — and the 6 `archive-*.png` human stills were never captured to `reference/`). So the human stills, not the machine baselines, are the bulk-stale layer §(p) declared; the Batch D freeze refreshes both onto the live render.

**Live vs frozen machine baselines (every one of the 65 surfaces pixel-computed, strict per-channel threshold 0.2·255 mirrored from the lane):** 18 byte-identical; 43 within (0–1.301 %); 4 above the strict 2 % band — `account-1440-bn` 2.309 %, `checkout-1440-bn` 2.672 %, `checkout-768-bn` 3.065 %, `blog-375-bn` 2.041 % — and the lane's own comparator (anti-aliasing-tolerant `maxDiffPixelRatio: 0.02`, `threshold: 0.2`) passed all four; my strict byte-level count is the more conservative of the two metrics. Every divergent surface was then OPENED as pixels (frozen baseline beside the live `after/` still, diff bands generated) and classified:

| Surface set (opened) | Delta seen in pixels | Verdict |
| --- | --- | --- |
| `blog-{375,768,1440}-bn`, `search-{375,768,1440}-bn` | "Browse the journal" / "From the journal" / "Filters" / "Results" rendered **English in the bn stills** (the §(p) stale copy) → now Bengali | **expected-copy** (Batch C translations landing) |
| `cart-1440/768/375-bn`, `checkout-1440/768/375-bn` | English "Order summary" panel heading → Bengali "অর্ডার সারসংক্ষেপ"; checkout additionally gains the **"Disabled in preview"** guard banner (already present in the frozen `en` baselines) pushing content down ~70 px | **expected-copy** (Batch C translation, plus Batch A's preview guard banner which the frozen `en` baselines already carry) |
| `product-{1440,768,375}-en` (0.319–0.86 %) | Preview note reworded: "Demo product page. Prices and stock are sample data — ordering is disabled in preview." → "Sample product page — prices and stock are sample data, and ordering is disabled in the preview." | **expected-copy** (programme-standardised preview note), no structural change |
| `account-1440-bn` (2.309 %) | Frozen bn baseline bakes the OLD stack's DB demo-shopper identity + DB-seeded orders (ORD-1001 DELIVERED / ORD-1002 SHIPPED); the live render shows the composition's own fabricated demo account ("Rumana Haque (demo shopper)", ORD-2451/2468/2477 with static dates) — **which the frozen `account-1440-en` baseline already matches byte-for-byte** (en live vs en baseline ≈ 0 %) | **expected-seed** (demo/DB-state content baked into an unauthenticated preview surface); composition itself identical — tab row, stat cards and order rows in the live bn render match the live en render band-for-band |
| remaining 40+ surfaces (`index`, `collection`, `page` × all widths/locales, `chrome-mega-menu`, `chrome-mobile-drawer-375-en`, most `en` stills) | byte-identical or ≤ ~1.3 % anti-aliasing-level noise | **no change** |

**Structural-defect count: 0.** Every visible delta is either Batch C's copy landing in previously-English Bengali slots (the exact staleness §(p) declared) or the account demo surface's baked-in DB-state content. No composition regressed; no re-flow beyond the checkout banner (which the frozen `en` baselines already contain). No lane assertion changed.

**Residual English-in-bn observed but unchanged by this batch (pre-existing, out of Batch D scope, listed so it is not silently buried):** order-status chips (`DELIVERED`/`SHIPPED`/`PACKED`) and the payment radios' method names render in English inside the bn account/checkout stills on BOTH the frozen baselines and the live render — the ratio is sub-threshold and identical across generations, i.e. not a Batch C regression.

**Freeze decision:** re-freeze ALL layers onto the live render via `run-capture.sh` (reference/ + after/ + manifest + machine baselines), then a clean verify run must reproduce `66 passed / 1 skipped / 0 failed`.

### (r.3) The freeze needed `--update-snapshots=all`, not the default `changed` — the mechanism that made the baselines go stale while staying green

First freeze pass (`run-capture.sh`, default `--update-snapshots`) refreshed `reference/`, `after/` and the manifest (freezeSha `4443d81c`, 66 entries, 1 manual-review) but left **zero** machine baselines rewritten: Playwright's update mode `changed` only rewrites baselines whose comparison FAILS, so within-tolerance baselines carry over untouched. That is exactly how a one-generation-stale baseline (e.g. `account-1440-bn`'s baked OLD-stack demo content, the bn English "Order summary" slots) can sit in the snapshot dir for generations while the lane stays green at its own thresholds — the prior re-freeze (`c565f0d0`) hit the same behaviour. To complete the freeze the lane was re-run with `--update-snapshots=all`, same spec, no edits: `66 passed (9.6m), 1 skipped`, and **27 machine baselines** were rewritten onto the current render (the 4 §(r.2) CHANGED surfaces plus 23 sub-threshold AA-noise re-encodes). Committed on top of the reference/after/manifest freeze commit; the manifest stamped the freeze SHA of the run; the completed freeze is then re-verified clean (expect `66 passed / 1 skipped / 0 failed` with zero byte churn going forward).

### (r.4) The seven-template lane: 6/8 — both failures root-caused to SOURCE, and the live publish-payload measurement that refutes the handoff's "publish passes" expectation (recorded BEFORE any corrective edit)

**Run:** `E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 … playwright test .e2e/songoskriti-seven-templates.spec.ts` → **6 passed / 2 failed** (Search results, Cart, Checkout, Archive, Page + the deferred-archive taxonomy test passed; **Account** and **Blog** failed). Per §(r)'s lane plan ("Lane edits this batch may make are corrective only, each recorded here before the edit"), both failures were root-caused to source before touching anything, and the corrective edits are recorded here first.

**(a) Account — a REAL product double-delete defect, surfaced by the removal leg (§(n.7.6)).** The leg presses `Delete` on the "Account navigation" treeitem (`:729`). `LayerTree.tsx:340-345` handles that keydown on the focused treeitem — `event.preventDefault(); onDelete(node.id)` — but does **NOT** `stopPropagation()`, and the window-level studio-keyboard listener (`builder.tsx:997-1009`) does **NOT** check `defaultPrevented`: it runs `matchShortcut` → `runShortcut("delete")` → `deleteSelection()` (`builder.tsx:917-921`), which removes **the current `selectedIds`** through `editor.removeMany` (`useStudio.ts:587-596`). At that moment the selection is the previously inserted **Spacer** (still selected from the insert/move/height legs — `select(id, "replace")` at `builder.tsx:805-814` only changes on click, and a `press` focuses without clicking). So ONE Delete removes the focused "Account navigation" AND the selected Spacer. Attempt 1's error context proves it (the tree after the Delete reads `[Account overview, Account orders, Page content]` — no Spacer); attempt 2 then fails at `:727` because attempt 1's delete was autosaved, so "Account navigation" is gone from the draft. **This is a product defect (a Delete in the navigator silently deletes every selected layer besides the focused one), reported, NOT fixed** — a fix would edit `builder.tsx`/`LayerTree.tsx`, both §7-prohibited without an owner ruling. **Corrective lane edit (recorded now):** the removal leg selects the doomed layer first (a plain click, which is the canonical interaction and REPLACES the selection), then presses Delete — the treeitem handler and the window handler then act on the same single node, the leg still asserts the navigator's own Delete removed the layer (§(n.7.6) unchanged, nothing weakened), and the Spacer leg that follows is meaningful again.

**(b) Blog — a lane comparison-order defect that read the WRONG template after the reload.** The reload block clicks the strip button named `journey.label` (`:833-835`) = **"Blog" (the BASE template)** and immediately compares `afterReload` with `beforeReload` (`:838`) — but the Blog journey edits the **`blog_listing` VARIANT** (`journey.variant`, selected at journey start), and the variant is only re-selected AFTER the comparison (`:867-877`). So `beforeReload` (the edited variant: `blog_terms, blog_archive, Spacer×n, blog_pager`) was compared against the base blog composition (`blog_terms, blog_archive, …`) — a guaranteed mismatch for any variant journey. **Server truth refutes any persistence reading:** the workspace dump (`/tmp/opencode/e2e-auth/batchd-workspace-templates.json`) shows `blog_listing main = [blog_terms, blog_archive, spacer, spacer, blog_pager]` — the variant's spacers DID persist through save+reload; only the comparison read the wrong template. **Corrective lane edit (recorded now):** move the variant re-selection (currently `:864-877`) to immediately after the base-template click and BEFORE the `afterReload` read, so the comparison — and every later `afterReload` use (marker `:878-893`, remove `:917-929`) — reads the edited variant. This STRENGTHENS the assertion (it now compares the composition the journey actually edited); no assertion is weakened, skipped or deleted.

**(c) The publish gate STILL refuses — measured on the LIVE publish payload, refuting the Batch A/B handoff's "publish passes at 100 %" expectation.** The handoff claimed the source map is 438 total / 270 authored / 168 empty ⇒ 270/270 = 100 % ⇒ the §(q) gate now passes. Measured on the REAL publish payload (the version document `collectProps` walks, `builder-guardrails.ts:143-177`): **440 total / 270 authored / 59 `fallback` / 111 empty ⇒ authoredCoverage = 270/(270+59) = 82 % < the 90 % floor ⇒ `translationGate` refuses with `codes=translation`** ("বাংলা translation coverage is 82% — publishing needs at least 90%."), and the app log carries `theme.publish_blocked codes=translation` ×5. Root cause: `parseSection` (`src/lib/builder-ast.ts:7960-7976`) resolves each catalog field's EN `default` into the document as an **EN value flagged `_meta.fallback`** when the merchant never authored it; `authoredCoverage` correctly counts those as UNtranslated (a Bengali shopper would be served English), while the handoff's source-map probe counted the same 59 props as "empty" (excluded from the denominator) — the probe measured the raw catalog map, not the guarded document. 270/270 = 100 % therefore describes the AUTHORED map, not the publishable document. **Decision (recorded before any edit):** the refusal is CORRECT platform behaviour and STANDS — no translation gate may be moved without an owner ruling, and the 59 fallback slots can only leave the denominator by the MERCHANT authoring Bengali for them (inventing copy is §(p)/R4-refused). The lanes already assert BOTH publish branches (§(n.7.3)); the skip→pass conversion the handoff expected is therefore NOT validly available, and this measurement + the refusal toast (captured as visible output this batch) is the substantiated defect report. No product file is touched for it.

**(d) Workspace reset (stack state, not a code edit).** The failed run autosaved dirty drafts (Account navigation deleted; stray Spacers in `account`/`blog_listing`), so the Account re-run would fail at `:727` regardless of the fix. Prep before the re-run: delete this merchant's songoskriti **draft** `theme_versions` rows on the throwaway stack, keeping the published version (v1 — the clean pre-batch composition the first run started from); the editor re-bootstraps its draft from the published pointer on next open. No repo file changes; the re-run then proves the corrected legs against a clean workspace.

**Files the corrective edits touch:** `.e2e/songoskriti-seven-templates.spec.ts` only (a Batch-A programme-authored lane, not a pre-existing suite; both edits assert at least as much as before). **Explicitly NOT touched:** `src/lib/builder-ast.ts`, `src/routes/_authenticated/dashboard/builder.tsx`, `src/components/builder/LayerTree.tsx`, `src/lib/builder-guardrails.ts` (all §7-prohibited), and every translation surface (Global Constraints: translations out of scope, no gate moved).

---

### (s) Batch E — implementation record (dated 2026-10-23, before any Batch E edit)

**The owner's ruling (Batch E mandate):** the 82 % refusal is corrected by **translating**, not by any gate change — author real `_bn` twins for every translated-refusal slot the theme's own source can author, prove the published document actually picks them up through the ESTABLISHED product path, and land the two §(r.4) surfaced product fixes (the navigator double-delete, the dynamic-themes lane's cart heading clear that manufactures its own refusal). Lanes run for real on the throwaway stack; stills re-classified and re-frozen; no subagents.

**(s.1) The coverage mechanism, restated on the right document (Batch D's §(r.4)(c) measurement stands, Batch C's "100 %" narrowed in).** The publish gate measures the LIVE publish document, not the theme source: `publishVersion` (`src/lib/themes.server.ts:900-928`) parses the payload with `parseUntrusted` → `parseTemplates` → `parseSection` (`src/lib/builder-ast.ts:7932-7985`), whose bitext clause injects the CATALOG's EN default into every prop the merchant never authored (`props[key] = coerced === null ? (entry.defaults[field.key] ?? "") : coerced`, `builder-ast.ts:7952`) and then `translationCoverage` → `translationGate` (`builder-guardrails.ts:154-177`) on the parsed document. Measured BEFORE (Batch E probe over the live draft workspace doc, the same walk `publishVersion` performs): **440 total / 270 ok / 59 fallback / 111 empty ⇒ authoredCoverage 270/(270+59) = 82 %** ⇒ refusal, verbatim: `বাংলা translation coverage is 82% — publishing needs at least 90%.`. Batch C's "100 %" (§(q)) is hereby CORRECTED as a measurement SCOPE statement: it read the RAW SOURCE map (438 pairs/270 ok/0 fallback/168 empty) — the raw walk grades an EN-absent/bn-authored pair `ok` under `biTextState` (`src/lib/bitext.ts:39-44`) and excludes it from the denominator, while the publish document's parseSection injects a real EN value for the same prop, so the SAME 59 props are denominated as `fallback` there. Both are the gate's own functions; the document walk is the one that decides publish.

**(s.2) Provenance of the 59 fallbacks — 57 theme-catalog slots + 2 draft-only lane artifacts.** Batch E's probe (real workspace doc + the gate's own functions, enumerated with provenance per slot) classifies: **57** are catalog EN defaults injected by `parseSection` where the theme source authors NO `_bn` (`catalog-default injected by parseSection`, EN value equals `catalogEntry(type).defaults[key]` verbatim); they live in the theme's own compositions and are therefore translatable in source. **2** are the earlier lane run's draft-only `cart/rich_text-gga3phv` artifacts (`heading: "Frame30 nested — mvkl9mc6"` / `body: "Tell customers about your store."`, EN-only, authored by the dynamic-themes lane's marker journey) — absent from published v1, INCORRECT to translate (a merchant's own draft marker, not theme copy; translating it would be editing the merchant's slot = §(p)/R4-refused), and they vanish on workspace reset. Record as a gate-scope finding, untranslated.

**(s.3) The re-read seam — verified, not assumed (the crux of the batch).** Theme-source edits do NOT mutate the installed DB document by themselves: `loadWorkspace` bootstraps the editor from `theme_drafts`/`theme_versions` rows only (`themes.server.ts:264-279`), and the install/upgrade flow around `installRegistryTheme` cannot refresh a PRESENT draft — `mergeSeedTemplates` never overwrites a key the merchant's map already carries (`themes.server.ts:1395-1418`), and `activateTheme`'s only product call passes `overwriteDraft=false` with a present draft winning (`appearance.server.ts:1508-1524`; the `builder.draft_exists` 23505 raised at `20260917200000_phase2d_theme_install_preset.sql:44-49` is then swallowed, disposition reported separately in §(w)). The established product seam that DOES re-read `registryPackage` source is the editor's per-template **Reset to default**: `resetTemplateToDefault` (`themes.server.ts:1780-1882`) resolves `resolveThemePreview(sourceKey)` — the same source package `registryPackage` serves (`themes.server.ts:1223-1259`) — replaces exactly ONE key's tree with the theme's current default, lints merged, commits a version, and advances the draft (`revision + 1`, so no stale autosave can undo it). Batch E therefore proves and lands source twins through the REAL editor's Reset flow (its own button, `builder.tsx:1772-1809`), never through DB or seed edits.

**(s.4) The planned edits, recorded BEFORE each edit:**
1. **57 `_bn`-only twins** in the theme source (`src/lib/themes/songoskriti/preview.ts`, `homepage.ts`); EN untouched everywhere; the `text`/`text_bn` legacy alias slots (Batch D's declared-field note — `builder-ast.ts` drops the undeclared `description_*` route-side duplicates…, the `collection`'s declared pairs), platform chrome, `UNSUPPORTED_TEMPLATE_*`, and the empty slots stay untouched. Per-slot inventory and translation table in §(u) before the authoring commit.
2. **The §7 delete fix** (`LayerTree.tsx:340-345` `preventDefault` without `stopPropagation` + `builder.tsx:997-1009` window handler that ignores `defaultPrevented` ⇒ one Delete removes the focused node AND every `selectedIds` node): minimal fix + a handler-level pin (§(v) before the edit).
3. **The cart heading fix in the lane** (`.e2e/songoskriti-dynamic-themes.spec.ts` CART `beforeSave`): clearing the summary's EN title leaves `heading_bn` authored ⇒ a bn-only pair trips the SectionInspector/`lintTemplate` rule `"English copy is missing."` (`builder-ast.ts:8901-8912` — bn-only is blocking; empty state exempt). The lane's fix = ALSO clear the বাংলা tab (so the pair is `empty`-exempt) — the rule itself is NOT weakened (§(x) before the edit).
4. **`draft_exists` disposition** (§(x.2)): expected control-flow signal vs race, documented with file:line.
5. **Publish proof + lane runs + stills re-classify/re-freeze + closing gates** (§(y)): before→after gate numbers on the real stack, the seven-template lane's publish-success branch passing for real, `description` skip staying environmental, the stills classification table, and the closing verification outputs.

**(s.5) The one-slot probe (run BEFORE the bulk authoring).** One `_bn`-only twin is authored in source, the real flow (editor → Reset to default on one template) is driven on the live stack, and the reload document's pair must grade `ok` in the gate's own functions. If the established path genuinely cannot pick source twins up into the document, Batch E STOPS and reports the finding — no DB hacks, no seed hacks.

**Boundary for the whole batch:** no gate touched (`builder-guardrails.ts`, `translation-coverage.ts`, the lint rule at `builder-ast.ts:8901-8912` all unchanged); §7 files touched ONLY by the minimal delete fix recorded in §(v); nothing pushed or deployed; no new dependency; no subagents; the probe/dump helpers live outside the repo.

### (t) The cart heading lint — the lane manufactures its own refusal, and the live proof that it now BLOCKS every reset (recorded BEFORE the lane edit)

**Finding (rule is right, the lane is wrong).** `SectionInspector` writes a bilingual field as two tabs over one logical prop (`SectionInspector.tsx:47-49`, `:108-122`). The dynamic-themes lane's CART `beforeSave` (`songoskriti-dynamic-themes.spec.ts:152-159`) cleared the summary title on the ENGLISH tab only (`setInspectorHeading(page, "")`, helper `:98-112`), leaving `heading_bn: "অর্ডার সারসংক্ষেপ"` authored. The resulting bn-only pair is a **blocking** lint error — `builder-ast.ts:8901-8912` reports `Heading: English copy is missing.`; the `empty` state is exempt, and an EN-only pair is legal. So the lane created the defect it then tripped over; the rule is correct platform behaviour and is NOT weakened.

**Live proof, observed while probing the §(s.5) seam (2026-10-23T15:55:54Z, app log `batchd-app.log`):** the §(s.3) re-read seam (per-template Reset) was invoked on `checkout`; `resetTemplateToDefault` lints the FULL merged map before committing (`themes.server.ts:1857-1866`) and threw `builder.reset_blocked` with the message **`cart: Heading: English copy is missing.`** (span `builder.reset_template`). The broken pair therefore does not merely fail the cart surface — it blocks EVERY reset on the workspace, because `lintTemplateMap` lints every key. This is the second reason the repair must happen before the probe: the probe cannot reach the seam while the draft carries the lane's own defect.

**The fix (recorded before the edit): the LANE clears the বাংলা tab too.**
1. `.e2e/songoskriti-dynamic-themes-helpers.ts`: add `setInspectorHeadingBn(page, value)` — locate the bilingual field's tablist by its aria-label (`Heading`), click the `বাংলা` tab (`SectionInspector.tsx:114-123`), fill the now-active control, assert it holds the value (the same discipline as the EN helper).
2. `.e2e/songoskriti-dynamic-themes.spec.ts` CART `beforeSave`: after clearing the EN title, clear the বাংলা title with the new helper, so the pair is `empty`-exempt. The assertion that the old EN copy ("Order summary") is absent from the published storefront is unchanged — the intent (a heading-less summary) is now expressed in a state the platform accepts.
3. **Repair the live draft through the same real editor path** (open Cart → select the summary heading → clear BOTH tabs → Save) so the workspace is lint-clean again. No DB write; the editor's own autosave is the writer. This also exercises the exact interaction the lane will use.

**Not touched:** `builder-ast.ts:8901-8912` (rule intact), `builder-guardrails.ts`, `translation-coverage.ts`. If the rule itself were wrong this would be a platform question, not a lane workaround; the rule is not wrong (a Bengali-only heading has no English side to render, and the platform's fallback copy would appear instead — exactly what the empty state expresses deliberately).

### (t.1) Correction measured on the live inspector: the schema-routed widget has NO বাংলা control, so the tab-clear is not reachable — corrective lane edit recorded before re-editing

**(t) planned to clear the বাংলা tab. The live editor refutes the premise for this widget.** `cart_summary` resolves as a registered widget with a `propsSchema` (`resolveInspectorSchema` → `SchemaSectionInspector`, `SectionInspector.tsx:212-221`), and the schema renderer (`SchemaControls`) has no bitext branch: grep finds no `bitext`/`bnKey`/`বাংলা` in `SchemaControls.tsx` or `widget-presentation.ts`, and the live accessibility snapshot of `cart_summary-62` shows ONE plain `textbox "Heading"` with no `tablist`, no coverage chip, and no `_bn` field (probe run 2026-10-23T16:1xZ, `.artifacts/e2e/test-results/__batche_probe-*`). The bilingual tab pair exists only on the LEGACY catalog path (`BiTextField`, `SectionInspector.tsx:772-793`), which schema-routed widgets bypass. **Product gap (reported, not fixed here):** once a schema-routed bilingual prop is bn-only, the inspector offers no way to clear the বাংলা side — a merchant can only restore English.

**Why the lane needs a different fix.** The lane sets the marker on `cart_lines.heading`, which makes that widget the page's h1 claimant; the cart's single-claimant rule (`builder-ast.ts:8734-8760`) then forces the summary heading blank, and blanking EN alone yields the bn-only blocking state. No lane-side tab-clear can resolve it through the UI.

**Corrective lane edit (recorded before the edit; assertions unchanged in count and strength):** put the journey's marker on the **summary's own bilingual heading** (`cart_summary.heading`) instead of `cart_lines.heading`, and drop the `beforeSave` blanking step. Then:
- `cart_lines.heading` stays the theme's deliberately blank heading (source), so the summary heading is the ONE claimant — the two-claimant state is never manufactured;
- the marker pair is `EN marker + existing বাংলা` → `ok` (no missing-language lint, no bn-only pair);
- every existing assertion stays: the marker is visible on the draft and after reload, the publish replaces it with the live marker, the old copy ("Order summary") is absent from the storefront, and the theme's "Your bag" composition copy is present.
The `setInspectorHeadingBn` helper added in (t) stays in the helpers file as the correct affordance for LEGACY bilingual fields; the cart surface (`cart_summary`) cannot use it.

**Draft repair for the current workspace (still needed, and now the only reachable path):** restore the summary's EN heading to "Order summary" through the real inspector (EN textbox), giving an `ok` pair. This is what unblocks `builder.reset_template`; the earlier bn-only state remains the evidence for the §(t) finding.

### (s.6) The §(s.5) one-slot probe, MEASURED — the re-read seam DOES read source twins (the refusal names the twin's field), but the `_bn`-only FORM is refused by the raw lint in every write path; the §(s.5) STOP condition is met, recorded before any further edit

**Run (2026-10-23, live stack).** The one-slot probe twin was already in the working tree (`step1_bn: "ব্যাগ"` on `checkout/checkout_steps`, EN untouched — recorded in (s.5); authored 17:02 local, BEFORE the app restart at 18:15, so the running vite process at probe time served the twin from source). The probe drove the REAL flow on the live app: merchant login, Cart repair (the (t.1) draft repair — clear `cart_lines.heading`, restore the summary's "Order summary"), then the editor's own **Reset to default** on `checkout`, polling the live workspace document (`builderWorkspaceFn`) for the template to change.

**Result: the reset REFUSED — and the refusal PROVES the seam read the source twin.** `builder.reset_blocked` with the message **`checkout: Step 1 label: English copy is missing.`** (app log `batche-app.log`, span `builder.reset_template`, two attempts: `2026-10-23T17:14:00Z` and `17:16:54Z` — each run's repair phase succeeded, the reset phase threw, the workspace document never changed: the probe's poll timed out with `checkout` byte-identical before/after, `batche-probe-{before,after}.json`). "Step 1 label" is `checkout_steps.step1` — the field whose ONLY value in the whole merged map is the source twin: the source authors no `step1` EN anywhere (the catalog default "Cart" is parse-injected at publish time only), so the lint could only have seen it through the reset's read of `resolveThemePreview("songoskriti")`. **The seam re-reads source; the FORM of the twin is what is refused.**

**Mechanism (file:line, measured in code).** `resetTemplateToDefault` places the **RAW** source tree into the merged map — `templates[key] = ast` with `ast = bag[key]` straight off `resolveThemePreview` (`themes.server.ts:1829-1838`) — and runs `lintTemplateMap` over the RAW merged map BEFORE committing (`themes.server.ts:1837-1843`). The lint rule (`builder-ast.ts:8899-8912`) grades every bilingual pair of every section: `empty` is exempt, a missing বাংলা side is a `warn`, but a **blank EN side with a present বাংলা side is a BLOCKING `error`** (`English copy is missing.`) — even though `biTextState` calls that pair `ok` (`bitext.ts:39-44`). A source `_bn`-only twin IS, by construction, a raw bn-only pair. The same raw lint gates the editor's apply/save (`applyThemeUpdate`, `themes.server.ts:1723`) — the exact rule (§(t)) that refused the lane's merchant-authored bn-only heading. **Publish is the one surface that would ACCEPT it**: `publishVersion` lints the **PARSED** map (`themes.server.ts:914-922`; `parseUntrusted` → `parseSection` injects the catalog EN default first, turning the bn-only source pair into an EN-default + authored-বাংলা pair that lints `ok` and grades `ok` under `translationCoverage`) — but no established write path can carry the raw bn-only pair INTO the publish payload: per-template Reset is the ONLY source→workspace seam ((s.3)), and it raw-lints.

**Conclusion — the (s.5) STOP condition, met and recorded.** The installed document does **not** pick up `_bn`-only source twins through any established path. Proven three times over two runs on the live stack, each refusal naming the twin's own field; the refusal is CORRECT platform behaviour (a bn-only stored pair renders blank English to an `en` shopper — `resolveBiText`, `bitext.ts:48-53` — which is exactly why the rule is blocking), and the rule, the reset and the seed data are all out of bounds. No DB hack, no seed hack, no gate change is available or attempted. Steps (s.4)2-3 (the 57-twin authoring, the publish proof) are therefore HELD; the gate numbers stand unchanged at **440 total / 270 ok / 59 fallback / 111 empty = 82 %** on the live publish document.

**The lint-compatible form, for the owner's ruling — NOT applied (recorded now so the next edit, if ratified, is a ratification and not a discovery).** Pairing each twin with its catalog-default EN **verbatim** (`step1: "Cart"` beside `step1_bn: "ব্যাগ"`) makes the raw pair `ok` → the reset commits → the workspace document carries the authored pair → publish grades it `ok`. Every rendered English byte is unchanged (the authored EN is byte-identical to the injected default; only the `_meta.fallback` flag disappears). The cost: the theme source re-authors the catalog's English (catalog-drift exposure if a platform default is ever reworded), and the form deviates from the mandate's recorded "`_bn`-only twins, EN untouched" ((s.4)1). A ONE-SLOT mechanism proof of this form (the same `step1` slot, run on the throwaway stack, then REVERTED to the mandate's `_bn`-only form) is planned and recorded here before the edit; its result follows in (s.7).

### (s.7) Closing record — the (s.6)-planned paired mechanism proof: run 3 measured and INCONCLUSIVE (stale serve), deliberately not re-run (out of mandate + a one-way door on the live document); the install-path fork closed for this merchant; record-then-cleanup sequence; final STOP

**(A) Run 3, measured — and exactly why it was inconclusive.** The paired one-slot edit (`step1: "Cart"` beside `step1_bn: "ব্যাগ"` on `checkout/checkout_steps`, EN byte-identical to the catalog default) was written to `src/lib/themes/songoskriti/preview.ts` at 2026-10-23 17:29:09Z (19:29:09 +0200). The probe (`.e2e/__batche_probe.spec.ts`, run log `/tmp/opencode/e2e-auth/batche-probe-run3.log`) then drove the same flow as runs 1-2: cart repair succeeded (the confirm click landed, probe line 73-74), the Reset phase produced the SAME refusal as the pure `_bn`-only runs — **`checkout: Step 1 label: English copy is missing.`** (app log `/tmp/opencode/e2e-auth/batche-app.log:1833`, 17:29:58Z, span `builder.reset_template`) — and the 120 s workspace poll then timed out with `checkout_steps-66` byte-identical before/after (`step1_bn` still `""`). Diagnosis, provable from the log's own chronology: all three refusals (`batche-app.log:1831-1833` = 17:14:00Z, 17:16:54Z, 17:29:58Z) precede the SECOND `VITE ready` banner (`batche-app.log:1965`, process started 17:33:08Z), and the paired edit (17:29:09Z) postdates the first process's module load — with `DISABLE_HMR=true` nothing re-imports `preview.ts`, so process #1 served the stale bn-only module for run 3 and the paired bytes were never live. The CURRENT process started after the edit, so it serves the paired source (live check this session: `curl localhost:3020` → 200). **Run 3 therefore tested the `_bn`-only form a third time, not the paired form; lane A remains unproven by execution and is recorded as such.**

**(B) Why the paired proof was NOT re-run on the now-correctly-serving process (decision recorded before the cleanup below).** (i) **Mandate:** the paired form writes EN into theme source, which is not "leave EN untouched" ((s.4)1); (s.6) makes it conditional on an owner ruling this batch does not have. (ii) **One-way door on the LIVE document:** a successful paired Reset commits the pair into the workspace draft; afterwards `preview.ts` can be reverted, but the same raw lint then refuses any Reset back (`resetTemplateToDefault` lints the raw source tree, `themes.server.ts:1837`), and the editor cannot blank the EN side either (the same blocking error on save) — returning the workspace to its pre-proof state would require a draft/DB edit, which this batch forbids. The proof is thus irreversible through product paths, on the document Swarm 3's lanes run against. (iii) **Payoff is already computable from the same walk (computed, NOT run):** 57 paired source slots move `59 fallback → 2`, giving `327 ok / 2 fallback` ⇒ authoredCoverage 327/329 = 99 % (> the 90 % floor, `builder-guardrails.ts:154-177`), reaching 327/327 = 100 % once the cart template's Reset clears the two draft-only `cart/rich_text-gga3phv` artifacts ((s.2)); every authored EN byte equals the injected catalog default verbatim, so no rendered English changes. **Procedure for a conclusive run after the ruling:** keep the paired edit, restart the app first (fresh SSR import — the one step run 3 lacked), run the same probe, assert `step1_bn` lands in the workspace document; then rule; then bulk-author under that ruling.

**(C) The install-path fork, CLOSED for this merchant (read-only code verification this session) — the lint-free carriers cannot be reached.** Every carrier that could move a raw `_bn`-only source pair into this installed document without passing the lint is sealed:

1. **Fresh catalog install:** `installCatalogTheme` (`src/lib/themes/appearance.server.ts:393`) writes full version-1 source + draft with NO lint anywhere, but returns `{ alreadyInstalled: true }` as soon as a row with the same `source_listing_slug` exists (`src/lib/themes/appearance.server.ts:427-429`); the songoskriti row exists (read-only check: theme `710b903a…`, ACTIVE, draft rev 31, `source_install_id` set), so no fresh install is reachable.
2. **Delete → reinstall:** `deleteTheme` (`src/lib/themes/appearance.server.ts:1534`) only flips the LEDGER row to `status: "removed"` (`src/lib/themes/appearance.server.ts:1572`); the keyed ledger row survives, so the next catalog replay hits `resolveCatalogReplay` (`src/lib/themes/appearance.server.ts:89`) which **throws `market_install_conflict`** (`src/lib/themes/appearance.server.ts:111`). The reinstall path is refused by design — and completing it would also have replaced this merchant's workspace, so it would not have been an acceptable lane either.
3. **Registry install / RPC:** `installRegistryTheme` (`src/lib/themes.server.ts:1426`) has no lint, but its per-key `mergeSeedTemplates` (`src/lib/themes.server.ts:1408`, applied at `src/lib/themes.server.ts:1462`) never refreshes keys that already exist, and its no-lint RPC `theme_install_preset` raises `builder.draft_exists` for a present draft; its only product caller, `activateTheme` (`src/lib/themes/appearance.server.ts:1457`, call at `src/lib/themes/appearance.server.ts:1520`), passes `overwrite=false` and swallows the error.
4. **Draft-less reset:** no product flow deletes only the `theme_drafts` row — `theme_rollback` and `theme_update_apply` write versions, the editor save reads no source, and both source-reading writes (`resetTemplateToDefault` `:1837`, `applyThemeUpdate` `:1723`) raw-lint before committing.

Publish itself would accept `_bn`-only source ((s.6): `publishVersion` lints the PARSED map where `parseSection` injects EN first) — but nothing can carry the raw pair that far. No DB edit, no seed edit, no gate change is available or attempted; the escape hatch in the mandate applies.

**(D) Closing sequence — record first, then cleanup (exactly as executed).** This §(s.7) commit contains ONLY `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-escalation.md`. Immediately after it: (1) `git checkout -- src/lib/themes/songoskriti/preview.ts` restores HEAD — **BOTH** probe states leave the tree: the paired `step1: "Cart"` addition AND the earlier one-slot `step1_bn` twin were uncommitted working-tree state (verified immediately after the checkout: HEAD's `preview.ts` contains no `step1` line at all — the committed source authors neither `checkout_steps.step1` nor `step1_bn`, and `git status` is clean under `src/lib`). The source therefore returns to its committed pre-probe form, which is the honest end state for this STOP: **0 twins authored, 0 present, 0 committed** — it also removes the raw bn-only pair that (s.6) proved blocks the checkout reset while present; (2) the two untracked Batch E scratch test files under `src/lib` are deleted; (3) the app is restarted so the SERVED source matches HEAD again — this is mandatory, because the current process otherwise keeps serving the paired bytes (the hazard run 3's stale process created in reverse); (4) `.e2e/__batche_probe.spec.ts` stays untracked and untouched, and the two lane-file modifications recorded by (t)/(t.1) (`.e2e/songoskriti-dynamic-themes-helpers.ts`, `.e2e/songoskriti-dynamic-themes.spec.ts`) are left unstaged for Swarm 2's lane commit — this batch does not touch that directory; (5) the never-stage paths (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, `.output-snapshots/`, `test-results/`) are not staged. Zero code, seed, gate, or pin files are committed by this batch.

**(E) Final disposition — BLOCKED / STOP, numbers unchanged.** `_bn`-only twins authored: **0** of the 57 inventoried in (s.2) — by template: index 3, collection 4, blog 1, cart 15, checkout 18, search 10, archive 4, blog_article 1, blog_listing 1 (= 57; the other two of the 59 fallbacks are the draft-only `cart/rich_text-gga3phv` artifacts). Real-flow refusals: **3** (17:14:00Z, 17:16:54Z, 17:29:58Z), all verbatim `checkout: Step 1 label: English copy is missing.`. Publish before → after: **82 % → 82 %**, no publish run — with no source change able to land, a publish attempt would only create a refused draft version (Batch C's `6f5a3b7a` precedent) and mutate workspace state for no proof. Gate on the live document: **440 total / 270 ok / 59 fallback / 111 empty ⇒ authoredCoverage 270/329 = 82 %** (target 90 %), refusal verbatim `বাংলা translation coverage is 82% — publishing needs at least 90%.`. Closing gates (`node scripts/doc-gate.mjs`, the `src/lib/themes/songoskriti` suites, `node_modules/.bin/tsgo --noEmit`, eslint on the theme paths) run immediately after this record and the cleanup; their outputs are written to `.superpowers/sdd/2026-10-22-frame30-dynamic-themes/batch-e-report.md` together with the full Swarm 1 report and the empty pair table. **The owner ruling required to unblock:** lane A (paired form, EN re-authored verbatim into source ⇒ computed 99-100 %), lane B (workspace reset via DB, Batch D precedent — forbidden to this batch), or lane C (accept 82 % and pin the honest number). None taken by this batch. Bulk authoring in either form waits for the ruling.

### (s.8) Owner ruling RECEIVED — LANE A (paired authoring) executed by Swarm 1b: the ruling verbatim, the paired plan, the EN byte-identity rule, and the maintenance note the ruling carries

**(A) The owner's ruling, verbatim.** "LANE A — paired authoring. Author BOTH the English and the Bengali twin into each of the 57 source slots — the paired form the platform's lint itself demands. The English text must be **byte-identical to what `parseSection` already injects** from the catalog defaults (no copy invented, no rendering change; the pair moves from injected-fallback to authored-ok). This is recorded in the escalation record as the owner's Lane A ruling." The ruling supersedes (s.4)1's "leave EN untouched" constraint for exactly these 57 slots and closes the (s.7)(E) BLOCKED disposition; the (s.7)(B)(iii) computed payoff (59 fallback → 2, `327 ok / 2 fallback` ⇒ 99 %, → 100 % once the cart Reset clears the two draft-only `cart/rich_text-gga3phv` artifacts) is the number this lane executes toward.

**(B) The paired plan (this lane, Swarm 1b).** 1. **Record first** (this §(s.8) commit — record-only). 2. **One-slot probe:** pair ONE slot — `checkout/checkout_steps.step1` (`step1: "Cart"` byte-identical to the catalog default + `step1_bn: "কার্ট"` from the widget's own `t(locale, "Cart", "কার্ট")` fallback, `cart.tsx:670`) — restart the app BEFORE probing (the (s.7)(A) stale-serve hazard: `DISABLE_HMR=true` serves the module loaded at process start), drive the real per-template Reset seam, and confirm the workspace/published-document pair grades `ok` and `lintTemplateMap` accepts the paired form. 3. **Author the remaining 56 pairs** across the (s.2) inventory — index 3, collection 4, blog 1, cart 15, checkout 18, search 10, archive 4, blog_article 1, blog_listing 1 — sourced ONLY from the platform's own established Bengali: the widgets' `t(locale, EN, BN)` fallbacks for exactly these fields (`cart.tsx`, `collection.tsx`) and `NO_PAYMENT_RAIL.bn` (`src/lib/payment-rail-empty.ts`), cross-checked against the existing `_bn` twins in `src/lib/themes/songoskriti/*` and Batch C's pair table. 4. **Real publish proof** through the established flow: live-document before (440/270/59/111 = 82 %) → after (expected ~327 ok / 2 fallback ⇒ 99 %, or 327/327 = 100 % if the cart Reset clears the two draft-only artifacts), plus the platform's publish SUCCESS. No gate edit, no DB edit, no seed hack, at any point. Scope of edits: `src/lib/themes/songoskriti/preview.ts` and `src/lib/themes/songoskriti/homepage.ts` (the 57 slots live in theme source per (s.2)), plus this record and the batch report.

**(C) The EN byte-identity rule (why this is not new copy).** For every one of the 57 slots the EN side authored equals, byte for byte, the string `parseSection` already injects from `SECTION_CATALOG`'s field default (`builder-ast.ts:7977-7980`: `props[field.key] = coerced ?? entry.defaults[field.key] ?? ""`). The rendered English is therefore unchanged on every surface — the pair's PROVENANCE moves from "catalog-default injected by parseSection" to "authored", and its coverage state from `fallback` (EN present, `_bn` blank — `bitext.ts:68-72`) to `ok`; not one byte of shopper-visible copy is invented, edited or reordered. The two draft-only `cart/rich_text-gga3phv` fallbacks are NOT theme copy ((s.2)) and are left untouched; they are not part of the 57.

**(D) The maintenance note the ruling carries.** After this lane, each of the 57 source slots OWNS its English: the catalog default is no longer the live value on installed documents — the source pair is. A future theme-update path that re-syncs an installed theme's documents from a NEWER catalog package therefore can no longer re-inject updated catalog defaults into these 57 fields on this (and any document reset from this source): the authored EN wins over the default at parse time. Any future catalog-copy change to these fields must be made in the theme source (or the update path must explicitly diff-and-override authored pairs) — the installed document will never silently pick up a catalog default again for these keys. This is the accepted cost of Lane A and is recorded here so the update path is designed against it, not surprised by it.

**(E) Glossary provenance for the 57 Bengali twins (measured, not invented).** Every `_bn` value reuses the platform's own Bengali for the same string: `cart.tsx` `t()` fallbacks — Remove → সরান (:202), "Your cart is empty." → আপনার কার্ট খালি। (:271), "Free shipping unlocked." → ফ্রি ডেলিভারি চালু হয়েছে। (:363), Spend → আরও (:364), "more for free shipping" → খরচ করলে ফ্রি ডেলিভারি (:366), Subtotal → সাবটোটাল (:464), Discount → ছাড় (:475), Delivery → ডেলিভারি (:485), "Cash on delivery fee" → ক্যাশ অন ডেলিভারি ফি (:498), VAT → ভ্যাট (:509), Total → সর্বমোট (:517), "Coupon code" → কুপন কোড (:539), Apply → প্রয়োগ (:554), Checkout → চেকআউট (:575), Cart → কার্ট (:670), Details → তথ্য (:675), Payment → পেমেন্ট (:680), Confirmation → নিশ্চিতকরণ (:685), "Add something to see your total." → মোট দেখতে পণ্য যোগ করুন। (:443); `NO_PAYMENT_RAIL.bn` "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।" for `payment_methods.emptyText`; `collection.tsx` locale fallbacks — Category → ক্যাটাগরি (:163), Type → ধরন (:182), Availability → স্টক (:195), "In stock only" → শুধু স্টকে আছে (:202), "Clear all" → সব মুছুন (:242), Price → দাম (:296), "Load more" → আরও দেখুন (:592), Previous → আগের (:611), Next → পরের (:634); Batch C's pair table (গ্লসারি) — Home → হোম, products → পণ্য, Filters → ফিল্টার, Sort → সাজান; and for the three `trust_footer` scalar titles the standard Bengali store terms (দ্রুত ডেলিভারি / সহজ রিটার্ন / নিরাপদ পেমেন্ট), which are rendering-inert beside the authored `items[]` rows (the widget prefers `items` when present — `songoskriti.tsx:531-547`, pinned by `songoskriti.test.tsx:252-259`), with the EN scalars byte-identical to the injected catalog defaults ("Fast delivery" / "Easy returns" / "Secure payment").

### (t.2) Batch E2 (Swarm 2) — the three Batch D browser-stack defects, recorded BEFORE any edit: the navigator double-delete seam ruling, the (t.1) cart lane edit adopted as it stands, and the `builder.draft_exists` disposition as EXPECTED control flow (not a race); Swarm 1b's two carried concerns recorded

**(A) Defect 1 — the navigator's double-delete: mechanism, both candidate seams, and the ruling.** Mechanism, read-only verified this session: the layer row's keydown branch (`src/components/builder/LayerTree.tsx:340-345`) handles Delete/Backspace with `event.preventDefault(); onDelete(node.id);` and no `stopPropagation`, while the route's studio keyboard map listens on `window` (`src/routes/_authenticated/dashboard/builder.tsx:997-1009`), never inspects `event.defaultPrevented`, and — on the same keypress — runs `matchShortcut` → `runShortcut("delete")` (`:950-953`) → `deleteSelection()` over the `selectedIds` closure (`:917-921`). That closure is the pre-event snapshot: the tree's `onDelete` (`:2008-2013`) has already removed the focused node and re-render hasn't happened, so the window pass removes the still-selected sibling(s) — one keypress, two nodes. **Two candidate seams were considered; the ruling is the window dispatcher, not LayerTree:** (i) LayerTree-side `stopPropagation` would fix only this one component's Delete/Backspace branch, while the SAME duplicate-branch class exists in the same row handler for ⌘D duplicate (`LayerTree.tsx:346-348` → window `duplicate`, `builder.tsx:944-948`) and ⌘↑/⌘↓ nudge (`LayerTree.tsx:319-324` → window `move_up`/`move_down`, `builder.tsx:959-963`); (ii) honoring `event.defaultPrevented` at the ONE consumer that ignores the DOM's own handled-signal fixes the whole class in one place, with no restructure. Every LayerTree preventDefault branch pairs with an action (arrows `:313-339`, Delete/Backspace `:340-345`, ⌘D `:346-348`, F2 `:349-351`), so standing down on `defaultPrevented` can never swallow an unhandled studio action. The in-repo precedent for a pure, unit-testable key dispatcher is `handleStudioKeyDown` (`src/components/builder/studio/StudioBuilder.tsx:616-627`, tested in `interaction.test.ts:167-188`) and `tagPickerStep` (`DynamicTagPicker.tsx`); the vitest env is `node` (no DOM), so the pin is a handler-level simulation, not a rendered event. **Not touched:** `LayerTree.tsx` itself, and the studio's parallel map (`StudioBuilder.tsx`) — its navigator (`StructurePanel.tsx:172-192`) has NO row-level Delete/Backspace branch (its preventDefaults are contextmenu/drag only), so the double-delete class does not exist on that surface. **Planned diff (smallest seam):** export a pure `dispatchStudioShortcut(event, run)` from `src/lib/builder-shortcuts.ts` (guard order: `defaultPrevented` → `isTypingTarget` → `matchShortcut` → `run`, `preventDefault` only when `run` did the work — behavior-preserving for every currently-reachable event); the route's `window` handler becomes a one-line delegation; pin in `src/lib/builder-authoring.contract.test.ts` (the suite that already owns this route's source contract via `readFileSync`, `:37-40`): (1) a faithful two-node simulation — the tree's row handler fires, then the window dispatcher with the stale-closure snapshot — asserting ONE Delete removes exactly one node and the second Delete removes the next, which is RED before the guard and green after; (2) still dispatches when no inner surface claimed the key; (3) stands down for Backspace/⌘D too; (4) never hijacks typing; (5) a source pin that the route actually delegates (`builder.tsx` contains `dispatchStudioShortcut(event, runShortcut)`), so the guard cannot be silently dropped.

**(B) Defect 2 — the cart heading lint trip: the (t.1) corrective lane edit is adopted exactly as it stands unstaged.** The working-tree lane edits left for this swarm match (t.1)'s recorded corrective plan 1:1: CART `layer: "Cart lines"` → `"Cart summary"` (the marker now lives on the summary's own heading — the ONE claimant, so the two-claimant lint `builder-ast.ts:8734-8760` is never manufactured), markers renamed to `Frame30 cart summary — draft/published ${RUN}`, the `beforeSave` EN-blanking block removed (it was the sole producer of the bn-only pair that the blocking lint `builder-ast.ts:8901-8912` refuses), and the §(t) helper `setInspectorHeadingBn` kept in `songoskriti-dynamic-themes-helpers.ts` as the documented affordance for LEGACY bilingual (`BiTextField`) fields that `cart_summary`'s schema-routed inspector is not. **Assertion strength audit (unchanged, none weakened):** draft-marker-survives-reload (`spec:252-255`), publish pointer advance-or-explain (`:263-277`), marker visible / replaced marker absent / "Order summary" replacedCopy absent / "Your bag" composition copy present (`:286-306`), and the quantity-quote interaction (`:165-169`) all remain; `replacedCopy` is now the summary title the marker REPLACES rather than a title the lane cleared, which keeps the "old text is not on the storefront" assertion real. One comment-only touch accompanies the adoption: the `Surface.replacedCopy` docstring (`spec:119-125`) still said the cart's title was "cleared below"; it is updated to say replaced, so the type doc matches the lane it documents. Verification is `node_modules/.bin/playwright test -c .e2e/playwright.config.ts --list` on the touched spec and `songoskriti-seven-templates.spec.ts` (compile/discovery only, per the gate — Swarm 3 runs the lanes; no docker stack, no browser run in this batch).

**(C) Defect 3 — `builder.draft_exists` on apply-to-draft: EXPECTED control flow, not a race; documented, not fixed.** The full chain, read-only verified: `activateTheme` (`src/lib/themes/appearance.server.ts:1457-1532`) commits the flag flip FIRST (`:1479-1493`), audits, purges, and only THEN performs a best-effort registry refresh for marketplace rows (`:1514-1529`): `installRegistryTheme(db, merchantId, slug, /* overwrite */ false)` — deliberately false, per the in-code comment `:1517-1519` ("Refresh-only, never overwrite: overwrite=true here silently destroyed merchant customizations (Sept 2026). A present draft wins; absent drafts get seeded from the registry"). The RPC raises by design when a draft exists and `_overwrite_draft` is false (`supabase/migrations/20260917200000_phase2d_theme_install_preset.sql:44-49`, comment "Never silently replace authored work: the UI confirms overwrite"), the wrapper rethrows it (`src/lib/themes.server.ts:351-373`), and the catch at `appearance.server.ts:1527-1529` narrows it to `applied: false`, which IS returned across the API boundary (`appearance.server.ts:1531` → `themeActivateFn`, `appearance.functions.ts:51-62`). So "apply-to-draft appears to silently succeed while the RPC logged builder.draft_exists" is accurate at the CONSOLE only: the activation genuinely succeeded (the flag flip is a separate committed step), the draft was deliberately kept, and the outcome is not lost server-side — the console's `onSuccess` just toasts "Theme activated" without reading the `applied` flag (`src/components/admin/themes/ThemesScreen.tsx:147-156`). **Disposition: no code change in this batch.** The 23505 is the documented draft-wins guard on the activation refresh path; treating it as a defect would require either overwriting merchant drafts (the Sept 2026 regression the comment exists to prevent) or changing the console toast — a product/UX decision outside this defect batch. Batch D's §(r.4)d draft-version deletion remains stack-state hygiene for the lanes, not a code mitigation, exactly as it was recorded. **Carried, not fixed:** surfacing `applied: false` as an informational console state ("draft kept") would close the honesty gap at the only layer that has one.

**(D) Swarm 1b's two carried concerns, recorded verbatim as notes (no action this batch).** (a) **Source slots now own the EN pair** — after Lane A ((s.8)D), each of the 57 authored slots's English wins over the catalog default at parse time; a future theme-update path that re-syncs installed documents from a newer catalog package can no longer re-inject updated defaults into these fields and must explicitly diff-and-override authored pairs. (b) **Publish confirms only inside an unsaved-change window** — the platform enables the publish control solely while the document has unsaved changes, so a journey must make its FINAL edit after the reload for the publish to carry it (`songoskriti-dynamic-themes.spec.ts:257-260`); a product quirk, recorded, not fixed.

**(E) Staging discipline for this batch (restated before any commit).** Files this swarm may stage: this record; `src/lib/builder-shortcuts.ts`; `src/routes/_authenticated/dashboard/builder.tsx`; `src/lib/builder-authoring.contract.test.ts`; `.e2e/songoskriti-dynamic-themes.spec.ts`; `.e2e/songoskriti-dynamic-themes-helpers.ts`. The batch report (`.superpowers/sdd/2026-10-22-frame30-dynamic-themes/batch-e-report.md`) is gitignored by design. NEVER staged: `.artifacts/e2e/playwright-report/index.html`, `.artifacts/e2e/test-results/*`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, `.output-snapshots/`, `test-results/`, and the untracked probe `.e2e/__batche_probe.spec.ts` (left untouched, not this swarm's file). Not touched at any point: `src/lib/themes/songoskriti/*`, `src/lib/builder-ast.ts`, `builder-guardrails.ts`, `translation-coverage.ts`; no push, no deploy, no subagent.

### (t.3) Batch E2 closing record — the (t.2)-planned work EXACTLY as recorded: both commits, every gate's output, the RED-proof of the double-delete pin, and the one cosmetic typo left in (t.2)(D) (append-only)

**(A) Commits, in order.** Record-first, exactly as (t.2)(E) commits it: `2a78c34f` (this record, §(t.2) only — 1 file), then `9d47a556` (the code + lane commit — 5 files: `src/lib/builder-shortcuts.ts`, `src/routes/_authenticated/dashboard/builder.tsx`, `src/lib/builder-authoring.contract.test.ts`, `.e2e/songoskriti-dynamic-themes.spec.ts`, `.e2e/songoskriti-dynamic-themes-helpers.ts`). Staging was explicit-path (`--only`) on both commits; the never-stage list ((t.2)(E)) was verified unstaged in `git status` at commit time (`.artifacts/e2e/playwright-report/index.html`, `.artifacts/e2e/test-results/*` — including the untracked `__batche_probe-*` result dir —, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, `.output-snapshots/`, `test-results/`, and the untracked probe `.e2e/__batche_probe.spec.ts`, all left in the working tree untouched).

**(B) Defect 1 — the shipped seam, byte for byte the (t.2)(A) plan.** `dispatchStudioShortcut(event, run)` exported from `src/lib/builder-shortcuts.ts` (guards in order: `defaultPrevented` → `isTypingTarget` → `matchShortcut` → `run`, `preventDefault` only when `run` returned true); the route's `window` listener (`builder.tsx:997-1005`) is now the one-line delegation `dispatchStudioShortcut(event, runShortcut)` — the previous inline body is gone, and `isTypingTarget`/`matchShortcut` were dropped from the route's import list (no other use in the file). **Pin, handler-level, in `builder-authoring.contract.test.ts` ("Batch E2 — the navigator's double-delete", 5 tests):** (1) the two-node simulation — the row's branch removes the focused node, the window dispatcher then runs with the PRE-event selection snapshot (`[...selection]` taken before the tree handler mutates), asserting one Delete removes exactly one node and the second Delete removes the next; (2) a bare Delete with no inner claim still dispatches exactly once and swallows the native binding; (3) Backspace and ⌘D stand down when claimed; (4) an INPUT target never dispatches, claimed or not; (5) the source pin `dispatchStudioShortcut(event, runShortcut)` present in `builder.tsx`. **RED-proof, measured:** with the `defaultPrevented` guard temporarily neutralized (`if (false as boolean) return false;`), the suite fails exactly 2 of 22 — the two-node simulation (the stale snapshot removes the sibling: one keypress, both nodes) and the Backspace/⌘D stand-down — then the guard was restored (verified at `builder-shortcuts.ts:258`) and all 22 pass. The pin therefore detects the shipped defect, not just the wiring.

**(C) Gates, all run this session on the committed tree.** `node_modules/.bin/vitest run` over the 9 suites covering the touched files and every suite that reads `builder.tsx` by `readFileSync` (the source-pin family could be affected by the seam change) — **9 files, 93 tests, all passing** (touched suite: 22/22, of which 5 are new); the repo's three known pre-existing failures elsewhere (`analytics-live-shape.test.ts` ×2, `site.server.test.ts` ×1) are not in this set and are not mine. `node_modules/.bin/tsgo --noEmit` — **0**. `node_modules/.bin/eslint` on the five touched paths — **0**. `node_modules/.bin/playwright test -c .e2e/playwright.config.ts --list` on the touched lane spec — **5 tests listed** (cart, account, checkout, theme-switch, real-form session proof), and on `songoskriti-seven-templates.spec.ts` — **8 tests listed**, matching the pre-edit counts; compile/discovery only — no docker stack and no browser lane was run in this batch, per the gate (Swarm 3 runs the lanes).

**(D) Deviations from (t.2), each trivial and none touching a gate.** (i) The two-node pin's first draft let the simulated window callback read the live `selection` variable (already mutated by the tree handler), which would have made the test green even without the fix; corrected BEFORE the commit to capture `[...selection]` BEFORE the mutation — the faithful model of `builder.tsx`'s stale closure — which is what makes it RED without the guard ((B)). (ii) The `Surface.replacedCopy` docstring touch ((t.2)(B)) changed "cleared below" to "replaced by the marker below" — comment-only, inside the already-staged lane file. (iii) The `FakeEvent` helper carries a `prevented` mirror flag for assertion; it does not exist on a real `KeyboardEvent` and is test-only. (iv) Cosmetic typo left in (t.2)(D)(a) as committed ("slots's" for "slots'"); the record is append-only and earlier sections are sealed, so it is noted here rather than edited.

**(E) Final disposition — DONE, both defects fixed and pinned, the third documented as expected.** Defect 1 (navigator double-delete): fixed at the window dispatcher, whole duplicate-branch class covered, handler-level pin proven RED-before/GREEN-after. Defect 2 (cart heading lint trip): the (t.1) lane edit adopted unchanged in assertion strength (5 assertions audited, none weakened — marker survives reload, publish pointer advance-or-explain, marker visible / replaced marker absent / replacedCopy absent / composition copy present, quantity-quote interaction), verified by `--list` only. Defect 3 (`builder.draft_exists`): EXPECTED control flow — the draft-wins guard on the activation refresh path, swallowed by design and surfaced as `applied: false` across the API boundary; console-toast honesty gap carried, not fixed ((t.2)(C)). Swarm 1b's two carried concerns recorded ((t.2)(D)). No push, no deploy, no subagent; `src/lib/themes/songoskriti/*` and `builder-ast.ts` untouched.

---

### (t.4) Batch E3 (Swarm 3) — the acceptance re-proof on the throwaway stack: stack lifecycle, lane plan, and the parity procedure, recorded BEFORE any stills commit (dated 2026-10-24)

**Mandate.** Prove the state the previous swarms produced, in the real browser on the real throwaway stack: (1) re-classify every parity still that Swarms 1b/2 invalidated, then re-freeze and verify a zero-churn second run; (2) run the seven-template lane end to end with **publish SUCCEEDING** (the branch this tree has never executed green) and convert every skip whose translation-refusal reason (82 %/63 %) has cleared into a pass asserting at least as much; (3) run the theme-switch lane incl. Batch A's A→B→A `Product rail` round trip; (4) run Batch B's archive legs; (5) fix what the run surfaces (record-before-edit for any §7-covered file, continuing the §-numbering after §(t.3), never weakening a test); (6) close with the unit/contract gates, `tsgo`, `eslint` on touched paths and `doc-gate`, then the runbook's teardown.

**Stack lifecycle at the start of this batch (measured, not assumed):**

- The compose project `e2e-supabase` (runbook `docs/15-e2e/loopback-auth-setup.md` §1) had been up ~19 h: `e2e-supabase-{kong,auth,rest,db}-1` all `Up` (rest `unhealthy` — the runbook-documented image healthcheck gap); sandbox relay `socat TCP-LISTEN:58000 … e2e-supabase-kong-1` present (pid 1759297); `curl http://localhost:3020/` answered **200** before any action.
- **The `DISABLE_HMR` stale-serve hazard was live and is cleared.** The running vite (pid 847930, started `2026-10-23 23:05:34`) predated Swarm 2's source edits (`src/routes/_authenticated/dashboard/builder.tsx` mtime `2026-10-24 02:08:48`, `src/lib/builder-shortcuts.ts` mtime `02:10:37`), so it was serving pre-(t.2) bytes. Killed and restarted through `/tmp/opencode/e2e-auth/run-app.sh` (new pid 809597, `run-app.sh` env: loopback Supabase, `DISABLE_HMR=true`, vite 3020 strict) → root answered 200 after restart; app log clean of errors. Every lane in this batch runs against this process.
- Seed state read before the lanes (read-only): merchants `frame19-demo` (`11111111-1111-4111-8111-111111111111`, the lane store — `E2E_STORE_SLUG` default) and `songoskriti-heritage`; `theme_versions` for the lane merchant: **v31 `published`** (23:03, Swarm 1b's publish), v30 `draft`, v29…v24 `draft`; `merchant_settings` for `frame19-demo`: `cod_enabled=t, mfs_enabled=t` (the runbook's `migration/0003_demo_catalogue.sql:508` update). The prompt's `a92ec7ee-…` uid remains the prior stack's auth user (Batch D's recorded variance); this stack's auth user is the runbook's `merchant-uid.txt` entry, and both map to the same lane merchant — no lane reads the uid.
- **Known-acceptable carried:** auth-throttle flake on real logins (logins are spaced: parity once, then one login per lane run); `category_header`'s `<h1>` (documented); the three pre-existing vitest failures (`analytics-live-shape` ×2, `site.server` ×1) are not mine.

**Lane plan (no lane edit is planned by this section):**

1. **Parity run 1** — verify mode (`E2E_NO_WEBSERVER=1`, `E2E_BASE_URL=http://localhost:3020`, `PORT_CAPTURE_OUT=after`, `--retries=0`, NO `--update-snapshots`), the §(r) procedure verbatim: measure, then classify every divergence against the git-HEAD reference stills (`/tmp/opencode/e2e-auth/parity-before/` + git history are the before-layer) and the git-HEAD machine baselines with the lane's own thresholds (`maxDiffPixelRatio 0.02`, `threshold 0.2`), opening the pixels of every surface above the strict band. Bengali-twin and seed deltas = expected; structural = defect to fix. Classification is recorded in §(t.5) **before** the freeze commit.
2. **Freeze** — one run with `--update-snapshots=all` (§(r.3)'s mechanism: the default `changed` mode leaves within-tolerance baselines stale), `reference/` + `after/` + manifest + machine baselines onto the live render, staged by explicit path.
3. **Verify** — a clean second run (`PORT_CAPTURE_OUT=after`, no update): expect the Batch D shape **66 passed / 1 skipped / 0 failed** (the skip is the documented `chrome-mobile-drawer-375-bn` manual-review case), machine baselines and `reference/` byte-unchanged (`git status` clean on both), and `after/` byte-identical between two independent live renders — that is the zero-churn check.
4. **Seven-template lane** (`.e2e/songoskriti-seven-templates.spec.ts`, 8 tests): editor → save → reload → publish → storefront for all seven templates + the taxonomy test, incl. Batch A's legs (blog_listing variant, Cart nested add-inside + reorder, Account delete→save→reload→still-removed). Every refusal-branch assertion must be superseded by the published branch; any refusal for a NEW reason is a defect.
5. **Dynamic-themes lane** (`.e2e/songoskriti-dynamic-themes.spec.ts`, 5 tests): the cart/account/checkout journeys (the refusal skip at `:337` must stop firing) + Batch A's A→B→A `Product rail` round trip + the no-session guard.
6. **Theme-switch serve lane** (`.e2e/levelb-theme-switch-serve.spec.ts`, 2 tests).
7. **Archive legs**: `src/routes/store.$slug.blog.category.$termSlug.test.tsx` (10 tests — the Songoskriti band + term data, the declined frame, the storefront pager) plus the seven-template lane's deferred-taxonomy test.
8. **Closing gates**: affected unit/contract suites (theme suites, `preview-parity.contract`, `builder-authoring.contract`, archive route suite, `theme-switch-roundtrip`), `tsgo --noEmit`, `eslint` on touched paths, `node scripts/doc-gate.mjs` (0 findings), then the runbook §5 teardown.

**Checkout payment-rail conversion (recorded before the attempt).** The checkout skip (`songoskriti-dynamic-themes.spec.ts:214-217`, and its twin at `songoskriti-storefront-surfaces.spec.ts:419`) may stay ONLY while the environmental reason holds. The attempt order is: (a) read the live quote path — `useLiveCart` (`src/components/builder/CartContext.tsx:139`) starts `methods: []` and fills it only from a successful `quoteCart`, whose `availableMethods` (`src/lib/payment-rails.ts:323`) always includes `cod` when `merchant_settings.cod_enabled` is true — and the seed sets it true for this store; (b) if the live page still shows zero rails, diagnose the failing quote on the running stack before deciding; (c) seed only through the runbook's own scripts if a seed gap is what the measurement shows. If the reason still holds after that attempt, the skip stays and its `file:line` reason is recorded here.

**Standing rules restated before any commit:** explicit-path staging only; never stage `.artifacts/e2e/playwright-report/index.html`, `.artifacts/e2e/test-results/*`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`, `.output-snapshots/`, `test-results/`; no new npm dependency; no test weakened, skipped or deleted (skip→pass REQUIRED where the reason cleared); no push, no deploy, no subagent; `src/lib/themes/songoskriti/*`, `src/lib/builder-ast.ts`, `builder-guardrails.ts` and the translation surfaces untouched.

---

### (t.5) Parity run 1 (verify mode) — every still re-classified, ZERO divergence, the freeze is a no-op on the human stills; recorded BEFORE the freeze commit (dated 2026-10-24)

**(A) Run 1 shape.** `/tmp/opencode/e2e-auth/swarm3-parity.sh run1` (=`PORT_CAPTURE_OUT=after`, `E2E_NO_WEBSERVER=1`, `E2E_BASE_URL=http://localhost:3020`, `--retries=0`, NO `--update-snapshots`) against app pid 809597: **66 passed / 1 skipped / 0 failed** in 9.7 m — the Batch D shape exactly, the one skip being the documented `chrome-mobile-drawer-375-bn` manual-review case. Log `/tmp/opencode/e2e-auth/swarm3-parity-run1.log`; 65 stills written to `after/`; the manifest was regenerated by the run itself (66 entries).

**(B) Classification, every surface, against the lane's own thresholds (`maxDiffPixelRatio 0.02`, `threshold 0.2`).**

| Comparison | Result |
|---|---|
| `after/` vs git-HEAD `reference/` (pixel classify, `batchd-classify.mjs`) | **total=65, CHANGED=0, within-tolerance=0, identical-bytes=65** |
| `after/` vs the machine baselines `.e2e/songoskriti-port-parity.spec.ts-snapshots/*` (`batchd-after-vs-snap.mjs`) | **every surface within 0 %** (all `within … 0%`) |
| `after/` vs the pre-run `after/` hashes captured before run 1 (`swarm3-stills-hash-before.txt`) | **65/65 byte-identical** (md5, path-normalised) |

**No surface exceeded the 2 % band, so no pixel composite was opened** — there is nothing above the strict band to inspect, which is the strongest form of the classification: the live render of the current tree is byte-for-byte the frozen evidence. Consequently the Bengali-twin/seed-vs-structural distinction this procedure exists to adjudicate has no cases to adjudicate: **zero expected deltas, zero structural deltas, zero defects from the parity lane.**

**(C) The 26 byte-different machine baselines — expected stale-within-tolerance drift, not a defect.** Hashing the three evidence sets against each other: the machine baselines are byte-identical to `reference/` for **39/65** surfaces and byte-different for **26/65** (e.g. `index-1440-en`, `product-1440-en`, `collection-768-en`, `blog-1440-en`, `cart-1440-en`, `page-1440-en`, `search-768-en`, `archive-1440-en`, `account-1440-en`, `chrome-mega-menu-1440-en` …). All 26 still PASSED `toHaveScreenshot` in run 1 with NO `--update-snapshots`, i.e. every one is inside the lane's tolerance — precisely the case §(r.3) recorded: **the default `changed` update mode leaves within-tolerance baselines stale**, and only `--update-snapshots=all` re-freezes them onto the live render. This is why §(t.4) planned a single `--update-snapshots=all` freeze. The human evidence sets (`reference/`, `after/`) are NOT affected: they are already byte-identical to each other and to the live render.

**(D) Consequence for the freeze commit — its expected shape, recorded before it exists.** Because (B) is CHANGED=0, the freeze run can only change: (i) the **26 stale machine baselines**, rewritten to the live render; (ii) `reference-manifest.json`, regenerated (its diff on run 1 was already metadata-only: `generatedAt` + the per-entry and top-level `freezeSha`, 68 lines in / 68 out, no still entry changed); (iii) nothing under `reference/` or `after/` — those are byte-identical and the freeze cannot move them. If the freeze commit contains anything beyond (i)+(ii) it is a surprise and this section's expectation is wrong; that is the check the commit is graded against.

**(E) Zero-churn check design restated.** The verify run after the freeze uses the SAME verify mode (`PORT_CAPTURE_OUT=after`, no update), so the frozen `reference/` and the machine baselines are read-only during it; `git status` clean on both is the churn proof for the baselines, and byte-identity of `after/` between run 1 and the verify run (two independent live renders, no shared cache) is the churn proof for the render. Planned deviation from §(r), already declared in §(t.4): ONE freeze run instead of Batch D's two, on the grounds that (B) leaves nothing to re-classify between them.

**(F) No file is edited by this section.** It is a record-only commit, staged by explicit path (this file alone), taken BEFORE the freeze so the classification cannot be retro-fitted to the freeze's outcome.

---

### (t.6) The freeze graded against §(t.5)D, and the verify pass's zero-churn proof — measured, including one correction to (t.5)'s byte-count reasoning (dated 2026-10-24)

**(A) Freeze run.** `swarm3-parity.sh freeze` (`--update-snapshots=all`, no `PORT_CAPTURE_OUT`): **66 passed / 1 skipped / 0 failed** in 9.5 m — same shape as run 1, the one skip again `chrome-mobile-drawer-375-bn`.

**(B) Grade of the freeze diff vs the §(t.5)D prediction.**

| §(t.5)D predicted | Measured | Verdict |
|---|---|---|
| (i) the stale machine baselines rewritten | **11** files under `.e2e/songoskriti-port-parity.spec.ts-snapshots/` changed | right KIND; count corrected in (D) below |
| (ii) `reference-manifest.json` regenerated, metadata-only | changed; **136 diff lines = 134 `freezeSha` + 2 `generatedAt`**, no still entry altered | **exact** |
| (iii) nothing under `reference/` or `after/` moves | **0** changes under `reference/`, **0** under `after/` | **exact** — the substantive claim |

The human evidence sets could not move, and did not: that is the load-bearing part of the prediction and it held.

**(C) The freeze had ZERO pixel work to do — measured, not inferred.** Post-freeze pixel classification of all 65 machine baselines against `reference/` at the lane's own thresholds (`maxDiffPixelRatio 0.02`, `threshold 0.2`): **65/65 pixel-identical, 0 genuine pixel differences, 0 size changes.** Combined with §(t.5)B (run 1's `after/` = `reference/`, CHANGED=0), every one of the three evidence sets — `after/`, `reference/`, machine baselines — now renders the same pixels from the current tree.

**(D) Correction to §(t.5)D(i)'s "26": byte-difference vs `reference/` over-counts staleness.** Before the freeze, **26** of 65 machine baselines were byte-different from `reference/`, but the freeze only re-encoded **11**, and after the freeze **55** machine baselines are still byte-different from `reference/` while being pixel-identical to it (C). The reconciliation: the machine-baseline encoder and the human-still encoder are deterministic but not byte-identical to each other, so a baseline can differ from `reference/` in bytes with zero pixel difference — such a file reproduces byte-for-byte on regeneration and therefore does NOT change in the freeze. **True staleness (a file the freeze had to rewrite) = 11, not 26.** The 26 figure in (t.5)D(i) conflated encoder-level byte difference with actual drift; the pixel measure (C) is the correct instrument and it reads 0. §(t.5)D's conclusion — refresh them with one `--update-snapshots=all` run — was right, and the run is now proven unnecessary on pixel grounds and complete on byte grounds.

**(E) Verify run — the zero-churn proof, all three legs.** `swarm3-parity.sh verify` (`PORT_CAPTURE_OUT=after`, NO update): **66 passed / 1 skipped / 0 failed** in 8.5 m.

1. **Baselines untouched by the verify run:** 0 machine baselines and 0 `reference/` files modified in its window (newest baseline mtime `02:42:30` = the freeze's; the verify log closed `02:59:36`) — a run with no `--update-snapshots` wrote nothing into the frozen evidence.
2. **`reference/` clean in `git status`** after both runs.
3. **`after/` byte-identical across two independent live renders: 65/65 md5-identical** (run 1 at `02:30` vs verify at `02:59`, no shared capture cache). This is the churn proof for the render itself.

**(F) One file that is NOT churn-stable, named honestly: `reference-manifest.json` rewrites on every parity run.** Its `generatedAt` in the working tree is `2026-10-24T00:59:35.941Z` = the verify run's end (`02:59:35` local), not the freeze's — the spec writes the manifest at the end of whichever parity run executes. Its substantive content is stable: one distinct `freezeSha` across all 67 sites, `5f8f348b28e1` (the §(t.5) record commit, which was HEAD for both runs), and no still entry differing. So the manifest's `generatedAt` is per-run provenance, not drift; it is committed alongside the baselines in the stills commit and its timestamp is stated here rather than left to be discovered. **`reference/` and the machine baselines are the churn-sensitive evidence; both proved stable.**

**(G) Deviation from §(r) restated and now justified in evidence.** ONE freeze run instead of Batch D's two: with §(t.5)B at CHANGED=0 and (C) at 65/65 pixel-identical, a second freeze would have had no pixel to move; the single run re-encoded 11 byte-stale baselines and was followed by an independent verify run carrying legs 1-3 above.

**(H) No source file is edited by this section.** Record-only commit by explicit path, taken before the stills commit so the grade cannot be retro-fitted to what is being staged.

---

### (t.7) The checkout payment-rail skip — measured live, the stated environmental reason is FALSE, both skip sites convert; planned edits recorded BEFORE they are made (dated 2026-10-24)

**(A) The measurement, through shipped code paths only.** A temporary untracked probe (`.e2e/__batche_railprobe.spec.ts`, deleted before the closing gates and never staged) drove the real storefront against app pid 809597 and measured the lane's own quantity — `input[name="fq-payment-method"]` — plus the platform's own empty-state text, in both states:

| Scenario | `railCount` | rail value(s) | empty state visible | cause |
|---|---|---|---|---|
| Lane path: `ensureCartHasLine` → `/store/frame19-demo/checkout` (what `songoskriti-dynamic-themes.spec.ts:282` does before the `:214` interaction) | **1** | `cod` | **0** | a successful `quoteCart` filled `cart.methods` with `["cod"]` |
| Empty cart, no seed — what `songoskriti-storefront-surfaces.spec.ts:419` does | **0** | — | **1** | `useLiveCart` early-returns on zero lines, never quotes, `methods` stays `[]` |

**(B) The mechanism, read end to end.** `merchant_settings.cod_enabled = t` for the lane store (§(t.4) seed read) → `availableMethods` (`src/lib/payment-rails.ts:323`) always yields `cod` when `codEnabled` is true, and `onlineEnabled`/`configured` only gate the ONLINE rails. `pricing.server.ts:119` calls the RPC `storefront_payment_methods`, which is **declared in `supabase/schema.fingerprint.json` (66 functions) but has no migration defining it and is ABSENT from the throwaway DB** (0 procs; `provider_credentials` has 0 rows for this merchant) — the RPC error is ignored by design (`liveRails ?? []`), so `configured = []`, which removes online rails but NOT `cod`. The theme's `payment_methods` widget (`src/lib/themes/songoskriti/commerce-presentations.tsx:396-411`) renders `cart.methods` and falls back to its own bilingual empty state exactly when `cart.methods.length === 0` — which `useLiveCart` (`src/components/builder/CartContext.tsx:139-167`) leaves untouched whenever the cart has no lines (the early return at `:157-161`). **A rail exists; an empty cart merely prevents the quote that would reveal it.**

**(C) Verdict on each skip site.** The skip's stated reason is "the disposable store offers no payment rail, so the checkout's permitted interaction cannot be proven". Under (A)+(B) that is **false**: the store offers `cod`, proven by rendering it. The standing rule is that the skip may stay ONLY while the environmental reason holds — it does not hold at either site:

- `.e2e/songoskriti-dynamic-themes.spec.ts:214-217` — the lane seeds a cart line at `:282` before this interaction, so `paymentRailCount` returns 1 and the guard's condition is already false: the test presently passes as a pass-through. **Conversion: delete the `test.skip` guard** so the rail is hard-asserted — `choosePaymentRail` immediately asserts `offered > 0` ("the composed checkout renders the rails the server offered", `helpers:425-428`) and then that the selection survives the server's re-quote. Strictly stronger than the guarded form; nothing is weakened.
- `.e2e/songoskriti-storefront-surfaces.spec.ts:419-422` — this site never seeds a cart, so `railCount` is genuinely 0 and the guard currently fires with a reason that misdescribes the cause. **Conversion: seed the cart with the file's own shipped `ensureCartHasLine` (already imported at `:8` and already used at `:287` and `:455`, i.e. the file's established pattern), then delete the `test.skip` guard** — the same `choosePaymentRail` assertion chain then runs. Adding the precondition the other two permitted-interaction tests in this file already take is a strengthening, not a weakening.

**(D) Not in scope of this section: the missing RPC.** Its absence is an environment/schema-fingerprint drift that costs the store only its ONLINE rails (`configured = []`), never `cod`; nothing in the four lanes reads online rails. Recorded as a concern rather than fixed — creating it would mean adding a migration, i.e. a schema change outside this batch's mandate.

**(E) Probe fidelity note (so the raw log is not misread later).** The probe's `cartLinesInStorage: 0` field and its direct `quoteCart` "Cart is empty" error are artifacts of the probe reading `parsed.lines` off a store that is a **bare `CartLine[]` array** (`src/lib/cart.ts:11-19`, keyed `framique.cart.<slug>`), not of an empty cart. The authoritative signals in (A) are the rail count and the empty-state visibility: scenario 1 rendered a rail with NO empty state, which is only possible if `cart.methods` was filled by a successful quote.

**(F) No file other than this record is edited by this section.** Record-only commit by explicit path, taken BEFORE either lane edit per the record-before-edit rule; continuing the §-numbering after §(t.6).

---

### (t.8) The publish-success branch's blocker — the lane reads a field the workspace DTO NEVER carried; the pointer exists on the editor's own workspace. Recorded BEFORE the helper edit (dated 2026-10-24)

**(A) What the run measured.** `swarm3-lanes.sh seven` (run at 05:30-05:45, log `/tmp/opencode/e2e-auth/swarm3-lane-seven.log`) closed **1 passed / 7 failed**, and every one of the seven failed at the SAME line — `songoskriti-seven-templates.spec.ts:976`, `expect(pointerAfter).not.toBe(pointerBefore)` with `Expected: not null`. All seven publishes had SUCCEEDED (the toast read "Published to your storefront"); the branch died on its own pointer read, not on the platform. That is the first time this tree has executed the publish-success branch at all, and it exposes the branch's defect precisely.

**(B) The probe, live, through shipped code paths** (temporary untracked `.e2e/__batche_ptrprobe.spec.ts`, never staged, deleted with the rail probe before the closing gates). It asks both candidate surfaces the same question:

| Surface | What it returned |
|---|---|
| `themesWorkspaceFn().installed[0]` (what both lane helpers read) | keys are `id, key, name, author, description, version, tags, screenshotUrl, isActive, autoUpdate, favourite, installedAt, updateAvailable` — **no key matching `/publish/i` anywhere in the row** (the recursive candidate walk found none) |
| `builderWorkspaceFn().theme` (the editor's own workspace, `src/lib/themes.server.ts:97` `ThemeSummary`) | `publishedVersionId: "3a34fdec-8771-4d2e-974f-7e0e8cdf6b06"` — non-null, with `id, name, isActive, publishedVersionId, sourceKey, sourceVersion, sourceInstallId` as its keys |

**(C) Root cause — a test-side type lie, not a platform defect.** `loadThemesWorkspace` → `toInstalled` (`src/lib/themes/appearance.server.ts:141-164`) never maps `row.published_version_id` onto `InstalledTheme` (`src/lib/themes/appearance.ts:13-30`); the column is SELECTed (`:138-139`) but only used server-side (`resolvePublishedVersionId`). Both lane helpers (`songoskriti-dynamic-themes-helpers.ts:238-258`, `songoskriti-seven-templates.spec.ts:219-234`) cast the workspace response to a shape with `publishedVersionId` and then `?.`-default it to `null` — so the read is always `null`, and `.catch(() => null)` would have hidden a throw the same way. The pointer itself is healthy: the probe reads `3a34fdec-…`, which is the version Swarm 1b published at 23:03 (§(t.4)).

**(D) The fix, smallest safe correct thing — test-side only, no product edit.** Both helpers read the pointer from `builderWorkspaceFn()` (`/src/lib/themes.functions.ts:15-22` → `loadWorkspace` → `resolveTheme`), which is the surface the editor and the publish button themselves use; the DTO genuinely carries `publishedVersionId`. The `.catch(() => null)` is dropped so a throwing read fails loudly with the server's error instead of collapsing into the same `null` the defect fed on. The assertions are untouched — in fact they become meaningful for the first time: `pointerBefore`/`pointerAfter` now carry real ids. This is a strengthening, not a weakening, and no product file changes because the workspace DTO is correct as designed (the theme desk does not need the pointer; the editor does).

**(E) Boundary.** Files this section plans to edit: `.e2e/songoskriti-dynamic-themes-helpers.ts`, `.e2e/songoskriti-seven-templates.spec.ts` — test files only, both §7-relaxed for this programme. The probe files (`__batche_ptrprobe.spec.ts`, `__batche_railprobe.spec.ts`) are untracked diagnostics and are deleted, never staged. No source file is edited by this section.
