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
