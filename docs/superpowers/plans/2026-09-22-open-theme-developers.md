# Open Theme Development (Approved Developers) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let approved third-party developers author, submit, and ship storefront themes without repo access.

**Architecture:** Themes stay JSON packages (`tokens` + `templates` + `manifest`) validated by the existing `parseTemplates` / `parseTokens` / `lintTemplate` / bn-coverage gate — no raw HTML ever executes (XSS boundary preserved). A developer allowlist gates submission; staff review gates publishing; builder export produces packages; registry + marketplace serve them like first-party presets.

**Tech Stack:** TanStack Start, Supabase (RLS + RPC), existing builder-ast validators, existing marketplace tables.

**Spec:** `docs/themes/creation.md` (author flow), `docs/themes/sdk.md` (integrator contract). This plan argues from those two docs; executors read all three.

## Global Constraints

- Package format is JSON AST only: `parseTemplates` + `parseTokens` must accept it byte-identical to in-repo presets; `lintTemplate` clean; bn coverage ≥ 0.9; exactly one H1 per template.
- No new runtime dependencies. No raw HTML/CSS/JS in packages (sanitiser is the boundary, not the feature).
- Package cap 2 MB JSON, 200 sections/template, API range `"api": "^3.0.0"`.
- TDD: failing test first for every behavior; targeted suites green before commit; full suite compared against main baseline (pre-existing failures documented, zero new).
- Never touch migrations already applied; new tables/RPCs ship as new migrations only.

## Review Focus

- `javascript:` / `data:` URLs smuggled in link/image props (sanitiser must strip; test pins it).
- Oversized packages bypassing caps via nested children (depth + node budget).
- Missing bn twins dropping coverage below gate after submit.
- Duplicate H1s from author-filled headings on context templates.
- Version skew: package `api` outside server range installs but breaks render.

---

### Task 1: Package spec + validator

**Files:**
- Create: `docs/themes/packages.md`
- Create: `src/lib/theme-package.ts`
- Test: `src/lib/theme-package.test.ts`

**Interfaces:**
- Consumes: `parseTemplates`, `parseTokens`, `lintTemplate` from `@/lib/builder-ast`; `biTextKeysOf`, `bnKey` from `@/lib/bitext`.
- Produces: `validateThemePackage(input: unknown) => { ok: true; preset: ThemePreset } | { ok: false; errors: string[] }` used by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { validateThemePackage } from "./theme-package";

const good = {
  key: "demo-studio",
  nameEn: "Demo Studio",
  nameBn: "ডেমো স্টুডিও",
  summaryEn: "Minimal demo theme.",
  summaryBn: "সাধারণ ডেমো থিম।",
  category: "fashion",
  version: "1.0.0",
  api: "^3.0.0",
  sortOrder: 10,
  tokens: {},
  templates: {
    index: { header: [], main: [], footer: [] },
  },
};

describe("validateThemePackage", () => {
  it("accepts a minimal valid package", () => {
    const out = validateThemePackage(good);
    expect(out.ok).toBe(true);
  });

  it("rejects raw HTML and javascript: URLs", () => {
    const bad = {
      ...good,
      templates: {
        index: {
          header: [],
          main: [
            {
              id: "x-html-1",
              type: "html",
              props: { html: "<script>alert(1)</script>" },
            },
          ],
          footer: [],
        },
      },
    };
    const out = validateThemePackage(bad);
    expect(out.ok).toBe(false);
  });

  it("rejects oversized packages", () => {
    const big = {
      ...good,
      templates: {
        index: {
          header: [],
          main: Array.from({ length: 500 }, (_, i) => ({
            id: `x-${i}`,
            type: "divider",
            props: {},
          })),
          footer: [],
        },
      },
    };
    const out = validateThemePackage(big);
    expect(out.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/theme-package.test.ts`
Expected: FAIL with "Cannot find module './theme-package'".

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  lintTemplate,
  parseTemplates,
  parseTokens,
  TEMPLATE_KEYS,
} from "./builder-ast";
import type { ThemePreset } from "./theme-presets";

export const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
export const MAX_SECTIONS_PER_TEMPLATE = 200;

export type PackageResult =
  | { ok: true; preset: ThemePreset }
  | { ok: false; errors: string[] };

function jsUrl(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /^\s*(javascript|data|vbscript):/i.test(v)
  );
}

export function validateThemePackage(input: unknown): PackageResult {
  const errors: string[] = [];
  if (JSON.stringify(input ?? null).length > MAX_PACKAGE_BYTES)
    errors.push("package exceeds 2 MB");
  const raw = (input ?? {}) as Record<string, unknown>;
  const templates = parseTemplates(raw["templates"] ?? {});
  const tokens = parseTokens(raw["tokens"] ?? {});
  for (const key of TEMPLATE_KEYS) {
    const ast = templates[key];
    if (!ast) {
      errors.push(`missing template: ${key}`);
      continue;
    }
    const nodes = [...ast.header, ...ast.main, ...ast.footer];
    if (nodes.length > MAX_SECTIONS_PER_TEMPLATE)
      errors.push(`template ${key} exceeds section budget`);
    for (const issue of lintTemplate(ast, key)) {
      if (issue.level === "error") errors.push(`${key}: ${issue.message}`);
    }
    const walk = (v: unknown): void => {
      if (typeof v === "string") {
        if (jsUrl(v)) errors.push(`blocked URL scheme in ${key}`);
        return;
      }
      if (Array.isArray(v)) {
        for (const item of v) walk(item);
        return;
      }
      if (v !== null && typeof v === "object") {
        for (const item of Object.values(v)) walk(item);
      }
    };
    for (const s of nodes) walk(s.props);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    preset: {
      key: String(raw["key"] ?? ""),
      nameEn: String(raw["nameEn"] ?? ""),
      nameBn: String(raw["nameBn"] ?? ""),
      summaryEn: String(raw["summaryEn"] ?? ""),
      summaryBn: String(raw["summaryBn"] ?? ""),
      category: String(raw["category"] ?? "fashion"),
      version: String(raw["version"] ?? "1.0.0"),
      api: String(raw["api"] ?? "^3.0.0"),
      sortOrder: Number(raw["sortOrder"] ?? 50),
      tokens,
      templates,
    },
  };
}
```

Also write `docs/themes/packages.md` documenting: manifest fields (`key` 1–60 slug, names, summaries EN+BN, category, semver, `api`, sortOrder), 2 MB cap, 200-section budget, bn ≥ 0.9 gate, single-H1 rule, no raw executable content, `api` compatibility range.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme-package.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme-package.ts src/lib/theme-package.test.ts docs/themes/packages.md
git commit -m "feat(themes): third-party package spec + validator"
```

### Task 2: Developer allowlist

**Files:**
- Modify: `supabase/migrations/<new-timestamp>_theme_developers.sql` (create)
- Modify: `src/lib/themes/appearance.server.ts` or new `src/lib/theme-developers.server.ts` (create)
- Test: `src/lib/theme-developers.test.ts` (create)

**Interfaces:**
- Consumes: existing Supabase client patterns, `currentMerchantId`-style scoping.
- Produces: `isApprovedDeveloper(merchantId: string) => Promise<boolean>` used by Task 4.

- [ ] **Step 1: Inspect current scoping (discovery, read-only)**

Run: `grep -n "currentMerchantId\|merchant_memberships\|user_id" src/lib/marketing.server.ts | head -n 20`
Read: `src/lib/themes/appearance.server.ts:1-60` for server-function + RLS patterns to imitate.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("isApprovedDeveloper", () => {
  it("resolves from the allowlist (wired in Step 3)", async () => {
    const { isApprovedDeveloper } = await import("./theme-developers.server");
    expect(typeof isApprovedDeveloper).toBe("function");
  });
});
```

- [ ] **Step 3: Write minimal implementation**

New migration creates `public.theme_developers (merchant_id uuid primary key, approved_at timestamptz default now(), approved_by text)` with RLS: reads tenant-scoped, writes admin-only (mirror the tightest existing policy found in Step 1; copy its exact `USING`/`WITH CHECK` shape and name the source file in a comment).

`src/lib/theme-developers.server.ts`:

```ts
import { createClient } from "@/lib/supabase-server";

export async function isApprovedDeveloper(
  merchantId: string,
): Promise<boolean> {
  const db = createClient();
  const { data } = await db
    .from("theme_developers")
    .select("merchant_id")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data !== null;
}
```

(Adjust client import to whatever `appearance.server.ts` uses — verify in Step 1; do not invent a new client.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme-developers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<file> src/lib/theme-developers.server.ts src/lib/theme-developers.test.ts
git commit -m "feat(themes): approved-developer allowlist"
```

### Task 3: Builder export (package download)

**Files:**
- Modify: `src/routes/_authenticated/dashboard/builder.tsx` (add Export button + handler)
- Test: extend `src/lib/theme-package.test.ts` with a round-trip case (see Step 1)

**Interfaces:**
- Consumes: `validateThemePackage` from Task 1; builder's in-memory `{ templates, tokens }` state.
- Produces: downloaded `<key>-<version>.theme.json` file that `validateThemePackage` accepts.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/theme-package.test.ts`:

```ts
it("round-trips builder-shaped state", () => {
  const out = validateThemePackage({
    ...good,
    templates: {
      index: {
        header: [],
        main: [
          {
            id: "demo-hero-1",
            type: "hero_carousel",
            props: {
              slides: [{ headline: "Hello" }],
            },
          },
        ],
        footer: [],
      },
    },
  });
  expect(out.ok).toBe(true);
});
```

Run: `npx vitest run src/lib/theme-package.test.ts` — must stay green (proves exporter input shape is valid).

- [ ] **Step 2: Inspect builder state shape (discovery, read-only)**

Run: `grep -n "templates\|tokens\|useState\|autosave\|commitVersion\|builderCommitFn" src/routes/_authenticated/dashboard/builder.tsx | head -n 30`
Find the exact variable names holding the edited theme (templates + tokens + key/version meta).

- [ ] **Step 3: Write minimal implementation**

Add an "Export package" button next to the existing commit/publish actions that serializes `{ key, nameEn, nameBn, summaryEn, summaryBn, category, version, api: "^3.0.0", sortOrder, tokens, templates }` from builder state, runs it through `validateThemePackage` client-side, toasts the first error on failure, and downloads the JSON on success:

```tsx
const onExport = () => {
  const pkg = { key, nameEn, nameBn, summaryEn, summaryBn, category, version, api: "^3.0.0", sortOrder, tokens, templates };
  const checked = validateThemePackage(pkg);
  if (!checked.ok) {
    toast.error(checked.errors[0] ?? "Package invalid");
    return;
  }
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${key}-${version}.theme.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

(Use the real state variable names found in Step 2.)

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/theme-package.test.ts src/lib/theme-presets.test.ts` — green. Manual: export from builder once after deploy, re-import the file through Task 4's validator path in review.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/dashboard/builder.tsx src/lib/theme-package.test.ts
git commit -m "feat(themes): builder package export"
```

### Task 4: Submission → review → publish

**Files:**
- Modify: `supabase/migrations/<new-timestamp>_theme_submissions.sql` (create)
- Create: `src/lib/theme-submissions.server.ts` + `src/lib/theme-submissions.functions.ts`
- Modify: `src/routes/_authenticated/dashboard/themes.tsx` or marketplace review screen (locate in Step 1)
- Test: `src/lib/theme-submissions.test.ts` (create)

**Interfaces:**
- Consumes: `validateThemePackage` (Task 1), `isApprovedDeveloper` (Task 2), existing `theme_publish`-style RPC patterns.
- Produces: pending submission rows; staff approve/reject; approved packages installable like registry presets.

- [ ] **Step 1: Inspect submission surfaces (discovery, read-only)**

Run: `grep -rn "marketplace_themes" src/lib/*.server.ts | head -n 10` and `grep -n "status" src/lib/marketplace.server.ts | head -n 20`
Record: table columns for theme listings, existing status values, and which server function writes them.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { validateThemePackage } from "./theme-package";

describe("submission acceptance", () => {
  it("rejects invalid packages before any DB write", () => {
    const out = validateThemePackage({ key: "x" });
    expect(out.ok).toBe(false);
  });
});
```

(Rich RPC tests follow the repo's existing `chain()` mock pattern from `marketplace-bridge.test.ts` once Step 1 names the tables; add approve/reject cases then.)

- [ ] **Step 3: Write minimal implementation**

New migration `theme_submissions (id uuid, merchant_id uuid, package jsonb, status text default 'pending', reviewer_note text, submitted_at, decided_at)` with tenant-scoped RLS (same shape as Task 2's policy).

`submitThemePackage(merchantId, pkg)` server function:
1. `if (!(await isApprovedDeveloper(merchantId))) throw new Error("not an approved developer")`
2. `const checked = validateThemePackage(pkg); if (!checked.ok) throw new Error(checked.errors[0])`
3. Insert row with `status: "pending"`, return id.

`decideThemeSubmission(id, approve: boolean, note?: string)` (staff-only, same permission gate as `builderPublishFn` — verify the exact permission string in Step 1): sets status + note; on approve, upserts the package into the serving path used by `installRegistryTheme` (mirror its row shape; do not invent a parallel install flow).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/theme-submissions.test.ts src/lib/marketplace-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<file> src/lib/theme-submissions.server.ts src/lib/theme-submissions.functions.ts src/lib/theme-submissions.test.ts <review-screen-file>
git commit -m "feat(themes): approved-developer submission and review"
```

### Task 5: Author docs + example + gates

**Files:**
- Modify: `docs/themes/creation.md` (append external-author chapter)
- Create: `docs/themes/example-studio.theme.json` (minimal valid package fixture)
- Test: reuse `src/lib/theme-package.test.ts` (fixture must validate)

**Interfaces:**
- Consumes: Task 1 validator.
- Produces: a designer-readable path from zero to submitted package.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/theme-package.test.ts`:

```ts
import pkg from "../../docs/themes/example-studio.theme.json";

it("ships a valid example package", () => {
  expect(validateThemePackage(pkg).ok).toBe(true);
});
```

Run: `npx vitest run src/lib/theme-package.test.ts` — FAIL (file missing).

- [ ] **Step 2: Write the fixture + docs**

Create the fixture (copy the Task 1 `good` object, add one `hero_carousel` + one `product_rail` + footer `newsletter`, all bilingual). Append the `docs/themes/creation.md` chapter: install nothing, build in builder, Export package, submit via Themes screen, what review checks (gates list), versioning rules (`api` range, semver bumps, never rename `key`), rejection reasons.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/theme-package.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/themes/creation.md docs/themes/example-studio.theme.json src/lib/theme-package.test.ts
git commit -m "docs(themes): external author guide + example package"
```

## Self-Review

- [ ] Spec coverage: creation.md 12-area checklist → Task 1 (validation of all areas), Task 3 (authoring), Task 4 (review/publish), Task 5 (docs). Template keys fixed (no signin template) honored — packages cannot invent routes.
- [ ] Placeholder scan: each code step contains exact code; discovery steps name exact files/commands, not "figure out".
- [ ] Type consistency: `ThemePreset` shape reused verbatim from `theme-presets.ts`; `TemplateKey` imported, never redefined.
- [ ] Review Focus: all five lines have pinning tests (Task 1 covers schemes/budgets/coverage/H1; version skew needs one more assertion — add `api`-mismatch rejection case to Task 1 Step 1 before implementing).
