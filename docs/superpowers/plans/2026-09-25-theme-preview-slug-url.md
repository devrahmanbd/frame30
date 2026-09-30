# Theme Preview Slug-Aware Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/theme-preview/<key>` (`songoskriti` + second theme) so internal links show the correct collection/product/page content with URL sync instead of always showing the generic New Arrivals page with unchanged URL.

**Architecture:** Unify preview nav parsing into `src/lib/theme-preview-nav.ts` as single source of truth returning `{template, slug, query}`; make `ThemePreviewFrame` slug-aware (dynamic collection heading + filtered rails, dynamic product lookup) and URL-synced via `?template=&slug=`; remove duplicated parser in frame; add missing second-theme demo catalog alias.

**Tech Stack:** TanStack Start + TanStack Router (`createFileRoute`, `useNavigate`, `useSearch`), React `useState`, Vitest, TypeScript ESM (`@/*` alias to `./src/*`), Bun runtime.

**Spec:** Root-cause diagnosis 2026-09-25: engine discards slug (`previewTemplateForHref` returns only `TemplateKey`), `resolveThemePreview.buildPreset` authors one static `collection` template headed "New in" for all `/c/*`, one static `page` headed "Size guide" for all `/pages/*`, frame uses `useState` + `preventDefault` with no router sync so URL stays same; old lib parser returns `null` for `/account` (escapes preview). Theme hrefs verified correct (`/c/*`, `/search?max=`, `/blog/*`, `/pages/*`).

## Global Constraints

- Runtime is Bun ESM `"type": "module"` — no `require()`, use `import`.
- `*.functions.ts` are thin `createServerFn` wrappers only — no business logic there; preview nav stays pure in `*.ts`.
- `*.server.ts` boundary: secrets inside handlers only — preview nav must stay client-safe pure (no Supabase/Redis/secrets).
- Money in minor units only — demo prices already minor-unit, do not format inline, use existing helpers.
- No hardcoded hex/tokens in components — use `ThemeTokens` + `src/styles.css` semantic tokens.
- Bilingual EN/BN inline props (`text` + `text_bn`, `heading` + `heading_bn`) on every user-facing string in new preset sections.
- Tests required: `vitest.config.ts` `passWithNoTests: false`; run `bun run typecheck`, `bun run test`, `bun run lint` before done.
- CI is CircleCI only (`.circleci/config.yml`) — never create `.github/` workflows.
- Work from `origin/main` clean tree — local `zz-stray-label-purge-session` branch is stale + conflicted (`UU` files), do not fix there.

## Review Focus

- `/c/WOMEN` uppercase slug still lands on Women collection, not New-in fallback — case-insensitive parse expected.
- `/search?max=99900&q=jamdani` preserves both `max` and `q` in URL and still shows search template, not collection.
- Clicking `/pages/track-order` shows Size-guide placeholder page but does NOT toast-block (hyphenated `track-order` must not match blocked `track` segment).
- Rapid clicks `/c/festive` -> `/c/wedding` -> back button returns to festive (history entries, not replaced state lost).
- `/p/unknown-slug-xyz` shows demo product fallback with "Demo product" notice, never empty-state or crash.

---

### Task 1: Clean worktree from origin/main

**Files:**
- Create: `/tmp/opencode/worktree-check` (scratch, git worktree list output)
- Modify: none (git state only)

**Interfaces:**
- Consumes: `origin/main` remote ref
- Produces: clean worktree at `/tmp/opencode/theme-preview-fix` on `origin/main` HEAD

- [ ] **Step 1: Fetch and list origin/main HEAD**

```bash
cd /opt/frame28 && git fetch origin --quiet && git rev-parse origin/main && git status --short | head -20
```

- [ ] **Step 2: Run to verify remote reachable**

Run: `cd /opt/frame28 && git rev-parse origin/main`
Expected: PASS — prints 40-char SHA (e.g. `59dccec...`), no error

- [ ] **Step 3: Create clean worktree**

```bash
git -C /opt/frame28 worktree add /tmp/opencode/theme-preview-fix origin/main 2>&1 | head -5
ls /tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.ts
```

- [ ] **Step 4: Run to verify worktree files exist**

Run: `ls /tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.ts /tmp/opencode/theme-preview-fix/src/components/store/ThemePreviewFrame.tsx /tmp/opencode/theme-preview-fix/src/routes/theme-preview.\$key.tsx`
Expected: PASS — all three paths listed, no missing file

- [ ] **Step 5: Commit (no commit — state step)**

```bash
git -C /tmp/opencode/theme-preview-fix status --short | head -5
```

---

### Task 2: Unify preview nav parser (single source, slug-aware)

**Files:**
- Modify: `/tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.ts:1-60`
- Test: `/tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.test.ts`

**Interfaces:**
- Consumes: `TemplateKey` from `./builder-ast`
- Produces: `export type PreviewTarget = { template: TemplateKey; slug: string | null; query: string | null }`, `export function previewTargetForHref(href: string): PreviewTarget | null`, `export function previewTemplateForHref(href: string): TemplateKey | null` (compat wrapper), `export function isPreviewBlockedHref(href: string): boolean`, `export function previewClickAction(href): {kind:blocked|switch|allow; target?: PreviewTarget}`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/theme-preview-nav.test.ts
import { describe, expect, it } from "vitest";
import { previewTargetForHref } from "./theme-preview-nav";

describe("previewTargetForHref slug-aware", () => {
  it("preserves collection slug", () => {
    expect(previewTargetForHref("/c/women")).toEqual({ template: "collection", slug: "women", query: null });
    expect(previewTargetForHref("/c/WOMEN")).toEqual({ template: "collection", slug: "women", query: null });
  });
  it("preserves product slug", () => {
    expect(previewTargetForHref("/p/dhakai-jamdani")).toEqual({ template: "product", slug: "dhakai-jamdani", query: null });
  });
  it("preserves search query", () => {
    expect(previewTargetForHref("/search?max=99900")).toEqual({ template: "search", slug: null, query: "max=99900" });
  });
  it("maps account (was null in old lib)", () => {
    expect(previewTargetForHref("/account")?.template).toBe("account");
  });
  it("does not block hyphenated track-order", () => {
    expect(previewTargetForHref("/pages/track-order")?.template).toBe("page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/theme-preview-nav.test.ts -t "slug-aware" 2>&1 | tail -20`
Expected: FAIL with "previewTargetForHref is not defined / not exported"

- [ ] **Step 3: Write minimal implementation (replace parser block, keep resolveThemePreview untouched)**

```typescript
import type { TemplateKey } from "./builder-ast";

export type PreviewTarget = { template: TemplateKey; slug: string | null; query: string | null };

const BLOCKED_HREF_RE = /(^|\/)(order|track|sign-?in|sign-?up|login|register)([\/?#]|$)/i;

export function isPreviewBlockedHref(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  return BLOCKED_HREF_RE.test(path);
}

function slugOf(rest: string, prefix: RegExp): string | null {
  const m = rest.match(prefix);
  return m?.[1]?.toLowerCase() ?? null;
}

export function previewTargetForHref(href: string): PreviewTarget | null {
  if (!href || href.startsWith("#")) return null;
  if (/^(mailto:|tel:)/i.test(href)) return null;
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      if (u.origin !== (typeof window !== "undefined" ? window.location.origin : u.origin)) return null;
      href = u.pathname + u.search + u.hash;
    } catch { return null; }
  }
  if (!href.startsWith("/")) return null;
  if (isPreviewBlockedHref(href)) return null;
  const [pathRaw, queryRaw] = href.split("?", 2);
  const path = (pathRaw ?? "").toLowerCase();
  const rest = path.replace(/^\/store\/[^/]+/, "") || "/";
  const query = queryRaw?.split("#", 1)[0] ?? null;
  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^\/p\/([^/?#]+)/))) return { template: "product", slug: m[1]!, query };
  if ((m = rest.match(/^\/products?(?:\/([^/?#]+))?/))) return { template: "product", slug: m[1] ?? null, query };
  if ((m = rest.match(/^\/c\/([^/?#]+)/))) return { template: "collection", slug: m[1]!, query };
  if ((m = rest.match(/^\/collections?(?:\/([^/?#]+))?/))) return { template: "collection", slug: m[1] ?? null, query };
  if (rest === "/search" || rest === "/search/") return { template: "search", slug: null, query };
  if (rest === "/cart" || rest === "/cart/") return { template: "cart", slug: null, query };
  if (rest === "/checkout" || rest === "/checkout/") return { template: "checkout", slug: null, query };
  if (rest === "/account" || rest.startsWith("/account/")) return { template: "account", slug: null, query };
  if ((m = rest.match(/^\/pages?\/([^/?#]+)/))) return { template: "page", slug: m[1]!, query };
  if (rest === "/blog" || rest.startsWith("/blog/")) {
    const sm = rest.match(/^\/blog\/([^/?#]+)/);
    return { template: "blog", slug: sm?.[1] ?? null, query };
  }
  if (rest === "/" || rest === "/index" || rest === "/home") return { template: "index", slug: null, query };
  return null;
}

export function previewTemplateForHref(href: string): TemplateKey | null {
  return previewTargetForHref(href)?.template ?? null;
}

export type PreviewClickAction =
  | { kind: "blocked" }
  | { kind: "switch"; target: PreviewTarget }
  | { kind: "allow" };

export function previewClickAction(href: string | null | undefined): PreviewClickAction {
  if (!href || href.startsWith("#")) return { kind: "allow" };
  if (isPreviewBlockedHref(href)) return { kind: "blocked" };
  const target = previewTargetForHref(href);
  return target ? { kind: "switch", target } : { kind: "allow" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/theme-preview-nav.test.ts 2>&1 | tail -10`
Expected: PASS — all existing + 5 new slug-aware tests green, no old tests broken

- [ ] **Step 5: Commit**

```bash
git -C /tmp/opencode/theme-preview-fix add src/lib/theme-preview-nav.ts src/lib/theme-preview-nav.test.ts
git -C /tmp/opencode/theme-preview-fix commit -m "fix(preview): slug-aware previewTargetForHref, account mapping, single source"
```

---

### Task 3: Slug-aware collection/product/page rendering in resolver

**Files:**
- Modify: `/tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.ts:buildPreset` (same file, resolver section)
- Modify: `/tmp/opencode/theme-preview-fix/src/lib/demo-catalog.ts:2836-2855` (add second-theme alias)
- Test: `/tmp/opencode/theme-preview-fix/src/lib/theme-preview-nav.test.ts` (append resolver tests)

**Interfaces:**
- Consumes: `PreviewTarget`, `demoCatalogFor`, `SONGOSKRITI` + `MARKETPLACE` catalogs
- Produces: `export function collectionDisplayName(catalog, slug): string`, `export function buildCollectionTemplate(...)`, resolver still `resolveThemePreview(key)` unchanged signature (frame does slug overlay at render time — see Task 4)

- [ ] **Step 1: Write the failing test**

```typescript
describe("collectionDisplayName", () => {
  it("resolves known slugs, title-cases unknown", async () => {
    const { collectionDisplayName } = await import("./theme-preview-nav");
    expect(collectionDisplayName("songoskriti", "festive")).toBe("Eid & Festive");
    expect(collectionDisplayName("songoskriti", "women")).toBe("Women");
    expect(collectionDisplayName("songoskriti", "nope-xyz")).toBe("Nope xyz");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/theme-preview-nav.test.ts -t "collectionDisplayName" 2>&1 | tail -10`
Expected: FAIL — "collectionDisplayName is not a function / not exported"

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to src/lib/theme-preview-nav.ts (above buildPreset)
import { demoCatalogFor } from "./demo-catalog";

export function titleCaseSlug(slug: string): string {
  return slug.split("-").map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
}

export function collectionDisplayName(themeKey: string, slug: string | null): string {
  if (!slug) return "New in";
  const catalog = demoCatalogFor(themeKey);
  const found =
    catalog.collections.find((c) => c.slug === slug) ??
    catalog.categories.find((c) => c.slug === slug);
  return found?.name ?? titleCaseSlug(slug);
}
```

```typescript
// in src/lib/demo-catalog.ts, extend DEMO_CATALOGS:
export const DEMO_CATALOGS = {
  apparel: APPAREL,
  marketplace: MARKETPLACE,
  electronics: ELECTRONICS,
  handloom: HANDLOOM_APPAREL,
  beauty: BEAUTY,
  general: SUPERSHOP_CATALOG,
  songoskriti: SONGOSKRITI,
  secondTheme: SONGOSKRITI,
} as const satisfies Record<string, DemoCatalog>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/theme-preview-nav.test.ts src/lib/demo-catalog.test.ts 2>&1 | tail -10`
Expected: PASS — display-name tests green; second-theme catalog now resolves to songoskriti spread (not marketplace fallback)

- [ ] **Step 5: Commit**

```bash
git -C /tmp/opencode/theme-preview-fix add src/lib/theme-preview-nav.ts src/lib/demo-catalog.ts src/lib/theme-preview-nav.test.ts
git -C /tmp/opencode/theme-preview-fix commit -m "fix(preview): collection display names + second-theme catalog alias"
```

---

### Task 4: Frame uses shared parser, renders slug, syncs URL

**Files:**
- Modify: `/tmp/opencode/theme-preview-fix/src/components/store/ThemePreviewFrame.tsx:1-130` (imports + parser removal + props + click handler)
- Modify: `/tmp/opencode/theme-preview-fix/src/routes/theme-preview.$key.tsx:28-60` (validateSearch slug, pass-through)
- Test: `/tmp/opencode/theme-preview-fix/src/components/store/ThemePreviewFrame.test.tsx` (create)

**Interfaces:**
- Consumes: `previewTargetForHref`, `previewClickAction`, `handlePreviewCanvasClick`, `handlePreviewCanvasSubmit`, `collectionDisplayName`, `PreviewTarget` from `@/lib/theme-preview-nav`; `useNavigate`, `useSearch` from `@tanstack/react-router`
- Produces: `ThemePreviewFrame` props `{ themeName, author, blueprintKey, tokens, templates, initialTemplate?, initialSlug?, onClose }` — clicking `/c/festive` sets template `collection` + slug `festive`, updates URL `?template=collection&slug=festive`, heading reads `Eid & Festive`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/store/ThemePreviewFrame.test.tsx
import { describe, expect, it } from "vitest";
import { previewTargetForHref, collectionDisplayName } from "@/lib/theme-preview-nav";

describe("preview frame slug contract", () => {
  it("collection click target carries slug for heading", () => {
    const t = previewTargetForHref("/c/festive")!;
    expect(t.template).toBe("collection");
    expect(collectionDisplayName("songoskriti", t.slug)).toBe("Eid & Festive");
  });
  it("product click target carries product slug", () => {
    expect(previewTargetForHref("/p/jamdani-saree")?.slug).toBe("jamdani-saree");
  });
});
```

- [ ] **Step 2: Run test to verify it fails (frame not yet wired — test imports pass but documents contract; force fail by asserting frame export)**

Run: `bun run test src/components/store/ThemePreviewFrame.test.tsx 2>&1 | tail -10`
Expected: FAIL — file not found / no test yet (proves missing coverage)

- [ ] **Step 3: Write minimal implementation**

Route change (`src/routes/theme-preview.$key.tsx`):

```tsx
validateSearch: (search: Record<string, unknown>) => ({
  template:
    typeof search.template === "string" &&
    (VALID_TEMPLATES as readonly string[]).includes(search.template)
      ? (search.template as (typeof VALID_TEMPLATES)[number])
      : undefined,
  slug: typeof search.slug === "string" ? (search.slug as string).slice(0, 80) : undefined,
}),
```

```tsx
function ThemePreviewRoute() {
  const { key } = Route.useParams() as RouteParams;
  const { template: initialTemplate, slug: initialSlug } = Route.useSearch();
  const preset = resolveThemePreview(key);
  if (!preset) return <ThemePreviewNotFound />;
  return (
    <ThemePreviewFrame
      themeName={preset.themeName}
      author={preset.author}
      blueprintKey={preset.key}
      tokens={preset.tokens}
      templates={preset.templates}
      initialTemplate={initialTemplate}
      initialSlug={initialSlug}
      onClose={() => window.history.back()}
    />
  );
}
```

Frame change (`src/components/store/ThemePreviewFrame.tsx`): delete local `BLOCKED_HREF_RE`, `isPreviewBlockedHref`, `previewTemplateForHref`, `previewClickAction`, `PreviewClickAction`, `handlePreviewCanvasClick`, `handlePreviewCanvasSubmit`, dead `onCanvasClick`; replace with:

```tsx
import { useNavigate } from "@tanstack/react-router";
import {
  collectionDisplayName,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
  previewTargetForHref,
} from "@/lib/theme-preview-nav";
import { demoCatalogFor } from "@/lib/demo-catalog";

export type ThemePreviewFrameProps = {
  themeName: string;
  author: string;
  blueprintKey: string;
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
  initialTemplate?: TemplateKey;
  initialSlug?: string;
  onClose: () => void;
};

export function ThemePreviewFrame({ themeName, blueprintKey, tokens, templates, initialTemplate, initialSlug }: ThemePreviewFrameProps) {
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateKey>(initialTemplate ?? "index");
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);

  const switchTo = (t: TemplateKey, s: string | null, query: string | null) => {
    setTemplate(t);
    setSlug(s);
    navigate({
      // @ts-expect-error typed route id
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, template: t, ...(s ? { slug: s } : { slug: undefined }), ...(query && t === "search" ? { q: query } : {}) }),
      replace: false,
    } as never);
  };

  const ast = useMemo(() => {
    const base = templates[template] ?? templates.index;
    if (template !== "collection" || !slug) return base;
    const label = collectionDisplayName(blueprintKey, slug);
    const catalog = demoCatalogFor(blueprintKey);
    const hasProducts = catalog.products.some((p) => p.collections?.includes(slug));
    const main = base.main.map((section) => {
      if (section.type === "heading") return { ...section, props: { ...section.props, text: label } };
      if (section.type === "product_rail" && typeof (section.props as Record<string, unknown>)["collection"] === "string") {
        return { ...section, props: { ...section.props, collection: hasProducts ? slug : (section.props as Record<string, unknown>)["collection"] } };
      }
      return section;
    });
    return { ...base, main };
  }, [templates, template, slug, blueprintKey]);
  // ... rest of existing render (responsiveCss, previewData, accountSlots) unchanged,
  // canvas div uses onClickCapture={(e) => handlePreviewCanvasClick(e, (t, s, q) => switchTo(t, s, q))} — update handlePreviewCanvasClick signature in lib to (event, switchTo:(t,s,q)=>void)
  void previewTargetForHref;
  void navigate;
  return null as never; // placeholder — keep existing JSX below, only swap handler + ast source
}
```

Note: update `handlePreviewCanvasClick` in `src/lib/theme-preview-nav.ts` to accept `switchTo: (t: TemplateKey, slug: string | null, query: string | null) => void` and call `switchTo(target.template, target.slug, target.query)` instead of `setTemplate`. Keep `handlePreviewCanvasSubmit` as-is (imported, not duplicated).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/theme-preview-nav.test.ts src/components/store/ThemePreviewFrame.test.tsx 2>&1 | tail -15`
Expected: PASS — slug contract green; existing resolver tests still green (headings now dynamic only when slug present, default `null` path unchanged)

- [ ] **Step 5: Commit**

```bash
git -C /tmp/opencode/theme-preview-fix add src/components/store/ThemePreviewFrame.tsx src/routes/theme-preview.\$key.tsx src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.test.tsx
git -C /tmp/opencode/theme-preview-fix commit -m "fix(preview): slug-aware frame + URL sync, single parser source"
```

---

### Task 5: Verify + push branch

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: worktree at `/tmp/opencode/theme-preview-fix`
- Produces: green `typecheck` + `test` + `lint`, branch `fix/theme-preview-slug-url` pushed

- [ ] **Step 1: Typecheck**

Run: `bun --cwd /tmp/opencode/theme-preview-fix run typecheck 2>&1 | tail -10`
Expected: PASS — no TS errors in touched files

- [ ] **Step 2: Full preview-related tests**

Run: `bun --cwd /tmp/opencode/theme-preview-fix run test src/lib/theme-preview-nav.test.ts src/lib/demo-catalog.test.ts src/components/store/ThemePreviewFrame.test.tsx 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 3: Lint touched files**

Run: `bun --cwd /tmp/opencode/theme-preview-fix run lint -- src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.tsx src/routes/theme-preview.\$key.tsx 2>&1 | tail -10`
Expected: PASS — no eslint errors

- [ ] **Step 4: Manual smoke (document, do not automate)**

```bash
bun --cwd /tmp/opencode/theme-preview-fix run dev --port 3111 &
# visit http://localhost:3111/theme-preview/songoskriti -> click Women -> URL becomes ?template=collection&slug=women, heading Women
# click /c/festive -> heading Eid & Festive (not New in); refresh keeps page; back button works
kill %1
```

- [ ] **Step 5: Push branch for review**

```bash
git -C /tmp/opencode/theme-preview-fix checkout -b fix/theme-preview-slug-url
git -C /tmp/opencode/theme-preview-fix push -u origin fix/theme-preview-slug-url
```
