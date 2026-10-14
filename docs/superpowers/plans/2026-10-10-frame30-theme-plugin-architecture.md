# Frame30 — Correct Theme & Plugin Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate official source distribution from custom ZIP distribution so official Songoskriti/Somvabona render from source via one built-in registry with correct `/ph/` image URLs and zero runtime ZIP/bundle deps, while custom merchant ZIPs keep the full secure pipeline.

**Architecture:** Keep `src/lib/themes/*` source + `preview-sources.ts` built-in registry as the single official authority; cut runtime imports of `theme-export` / `official-artifacts` / `official-artifact-bundle(.json)` from preview/install/render paths (build-time only); introduce branded `SourceAssetUrl` vs `PackageAssetUrl` boundary; keep `package-zip.ts` + install/sandbox pipeline exclusively for custom uploads; keep `builtin-plugins.ts`/`official-plugins.ts` as source registries with no internal ZIP construction.

**Tech Stack:** TanStack Start + Supabase (RPC `theme_install_preset`), Vitest, `tsgo --noEmit`, Vite build

**Spec:** User Frame30 prompt in session (official vs custom distribution, §2–§6, 8 acceptance tests, constraints: no builder-AST/plugin-sandbox/schema redesign, no ZIP removal, no new registry, docs update)

## Global Constraints

- Work directly in `/opt/frame28` repository; audit before changing code; incremental correction, no rewrites of working systems.
- Do not delete tests to make the suite pass; preserve ZIP parsing, archive-security, custom-package installation tests; replace only tests asserting the incorrect official-ZIP architecture.
- Do not remove ZIP support; do not weaken validation; do not introduce another registry or package system; no broad unrelated cleanup.
- Do not redesign builder AST, theme presentation system, plugin sandbox, or DB schema unless audit demonstrates necessity.
- Do not invent OceanBlue or catalogue entries without implementations; keep Songoskriti + Somvabona only.
- Do not provide downloadable official-theme source packages to merchants.
- Base branch for theme code is `origin/main` (HEAD `fix/audit-stock-scope@35f193f2` predates `theme-export`/`official-artifacts`/`package-zip` — verified via `git ls-tree`; all Frame30 targets live on `origin/main`).

## Review Focus

- Anonymous `/theme-preview/songoskriti` with no merchant context must render hero/category images (source `/ph/songoskriti/*.png` servable, no `assets/` bare refs) — bare `assets/x` resolves against `/theme-preview/` and 404s.
- Fresh merchant with empty `theme_registry` + no drafts must still discover/install/preview/activate Songoskriti from source (no `builder.registry_missing` when DB row absent).
- Merchant ZIP upload with `../../evil`, symlink, or `assets/` dangling ref must fail closed without touching active theme or another tenant.
- Built-in plugin toggle must still enforce `requirePermission("plugins.update")` + tenant `merchant_id` predicate (built-in status never bypasses authz).
- Official theme install on merchant A must not create readable rows for merchant B (tenant isolation on `store_themes`/`theme_versions`/`theme_drafts`).

---

### Task 1: Branch setup + audit pin

**Files:**

- Modify: nothing yet (verification only)
- Test: none (evidence task)

**Interfaces:**

- Consumes: `git ls-tree`, `git show origin/main:<path>`
- Produces: branch `frame30` based on `origin/main`, stashed WIP preserved, audit evidence list for Tasks 2–6

- [ ] **Step 1: Stash current WIP without losing it**

```bash
git -C /opt/frame28 stash push -m "frame30-prework: preserve fix/audit-stock-scope WIP" --keep-index
git -C /opt/frame28 stash list | head -3
```

- [ ] **Step 2: Create frame30 branch from origin/main**

```bash
git -C /opt/frame28 fetch origin main 2>&1 | tail -1
git -C /opt/frame28 checkout -b frame30 origin/main
git -C /opt/frame28 log --oneline -3
```

Expected: HEAD is `e6b4e453` (or newer origin/main), branch `frame30` active.

- [ ] **Step 3: Pin audit evidence (read-only, no edits)**

```bash
git -C /opt/frame28 ls-tree -r HEAD --name-only | grep -E "theme-export|official-artifact|package-zip|package-install|official-plugin|builtin-plugin" | sort
grep -rn "from.*official-artifact-bundle\|from.*official-artifacts\|from.*theme-export" /opt/frame28/src /opt/frame28/scripts --include="*.ts" --include="*.tsx" | grep -v test | grep -v ".json"
grep -rn "rewriteThemeUrls\|urlForm" /opt/frame28/src --include="*.ts" | grep -v test | head -20
```

Expected: runtime importers list includes at least `src/lib/themes/appearance.server.ts` (bundledOfficialCatalogEntries), `src/lib/themes.server.ts` legacy path, `scripts/build-official-artifact-bundle.ts` (legit build-time). Record full list in commit message of Task 2.

- [ ] **Step 4: Record audit note**

No commit (branch creation is the artifact). Verify `git status --short | head`.

---

### Task 2: Single authoritative built-in official-theme registry

**Files:**

- Modify: `src/lib/themes/builtin-themes.ts` (create — single authority), `src/lib/preview-sources.ts`, `src/lib/theme-preview-nav.ts` (import type only, no logic change), `src/lib/themes.server.ts` (registryPackage/loadRegistryPackage/installRegistryTheme)
- Test: `src/lib/themes/builtin-themes.test.ts` (create)

**Interfaces:**

- Consumes: `songoskritiPreviewSource` from `./songoskriti/preview`, `somvabonaPreviewSource` from `../somvabona/preview` (existing signatures `(variationKey?: string) => PreviewThemeSource`)
- Produces: `OFFICIAL_THEME_KEYS: readonly ["songoskriti","somvabona"]`, `getBuiltinTheme(key)`, `isOfficialThemeKey(key: string)`, `builtinThemeKeys(): string[]` — later tasks import ONLY these for official identity (never `theme-export.OFFICIAL_THEMES`, never bundle JSON keys, never `theme_registry` keys for identity)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/themes/builtin-themes.test.ts
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_THEME_KEYS,
  getBuiltinTheme,
  isOfficialThemeKey,
} from "./builtin-themes";

describe("builtin-themes single authority", () => {
  it("names exactly songoskriti + somvabona", () => {
    expect([...OFFICIAL_THEME_KEYS]).toEqual(["songoskriti", "somvabona"]);
  });
  it("resolves source modules without ZIP or JSON", () => {
    for (const key of OFFICIAL_THEME_KEYS) {
      const entry = getBuiltinTheme(key);
      expect(entry.key).toBe(key);
      expect(typeof entry.source).toBe("function");
      const src = entry.source();
      expect(src.key).toBe(key);
      expect(typeof src.tokens).toBe("object");
    }
  });
  it("rejects unknown keys including OceanBlue", () => {
    expect(isOfficialThemeKey("oceanblue")).toBe(false);
    expect(getBuiltinTheme("oceanblue" as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/themes/builtin-themes.test.ts 2>&1 | tail -5`
Expected: FAIL with "Cannot find module './builtin-themes'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/themes/builtin-themes.ts
import type { PreviewThemeSource } from "../theme-preview-nav";
import { songoskritiPreviewSource } from "./songoskriti/preview";
import { somvabonaPreviewSource } from "./somvabona/preview";

export const OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"] as const;
export type BuiltinThemeKey = (typeof OFFICIAL_THEME_KEYS)[number];
export type BuiltinThemeEntry = {
  key: BuiltinThemeKey;
  source: () => PreviewThemeSource;
};

const ENTRIES: Record<BuiltinThemeKey, BuiltinThemeEntry> = {
  songoskriti: { key: "songoskriti", source: songoskritiPreviewSource },
  somvabona: { key: "somvabona", source: somvabonaPreviewSource },
};

export function isOfficialThemeKey(key: string): key is BuiltinThemeKey {
  return (OFFICIAL_THEME_KEYS as readonly string[]).includes(key);
}

export function getBuiltinTheme(key: string): BuiltinThemeEntry | null {
  if (!isOfficialThemeKey(key)) return null;
  return ENTRIES[key];
}

export function builtinThemeKeys(): BuiltinThemeKey[] {
  return [...OFFICIAL_THEME_KEYS];
}
```

Then rewire `preview-sources.ts` static table to delegate to `getBuiltinTheme` (keep exported function names/signatures; replace internal `SOURCES` map values with `getBuiltinTheme(key)!.source`). Keep `registerStaticPreviewSource` as no-op shim for tests that call it (do not delete export).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/themes/builtin-themes.test.ts src/lib/preview-sources.test.ts 2>&1 | tail -5`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git -C /opt/frame28 add src/lib/themes/builtin-themes.ts src/lib/themes/builtin-themes.test.ts src/lib/preview-sources.ts
git -C /opt/frame28 -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(frame30): single authoritative builtin official-theme registry"
```

---

### Task 3: Source-direct official install/preview/render; remove runtime bundle/ZIP deps

**Files:**

- Modify: `src/lib/themes.server.ts` (registryPackage → source-direct via builtin registry; loadRegistryPackage → tenant installed rows for custom + official-install state, never bundle JSON; installRegistryTheme → build from source definition), `src/lib/themes/appearance.server.ts` (drop `bundledOfficialCatalogEntries` import; catalogue official section from builtin registry), `src/routes/theme-preview.$key.tsx` (or equivalent route — resolve anonymous preview from builtin source, merchant preview from installed rows)
- Test: `src/lib/themes/frame30-source-install.test.ts` (create)

**Interfaces:**

- Consumes: `getBuiltinTheme`, `resolveThemePreview`, `assemblePreviewTemplates` (existing), RPC `theme_install_preset`
- Produces: `registryPackage(key)` source-direct (no bundle import); `installRegistryTheme` initializes `store_themes`/`theme_versions`/`theme_drafts` from source AST without constructing ZIP; no runtime file imports `theme-export`, `official-artifacts`, `official-artifact-bundle(.json)`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/themes/frame30-source-install.test.ts
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

describe("frame30 source-direct runtime", () => {
  it("registryPackage resolves songoskriti from source with /ph/ URLs", async () => {
    const { registryPackage } = await import("../themes.server");
    const pkg = registryPackage("songoskriti");
    const blob = JSON.stringify(pkg.templates);
    expect(blob).toContain("/ph/songoskriti/");
    expect(blob).not.toMatch(/"(assets\/[a-z0-9_.-]+)"/i);
  });
  it("no runtime source file imports the bundle or exporter", () => {
    const runtimeFiles = [
      "src/lib/themes.server.ts",
      "src/lib/themes/appearance.server.ts",
      "src/lib/preview-sources.ts",
      "src/lib/theme-preview-nav.ts",
    ];
    for (const f of runtimeFiles) {
      const s = fs.readFileSync(`/opt/frame28/${f}`, "utf8");
      expect(s).not.toMatch(
        /official-artifact-bundle|official-artifacts|theme-export/,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/themes/frame30-source-install.test.ts 2>&1 | tail -8`
Expected: FAIL (bundle import present in `appearance.server.ts`; possibly `assets/` refs in package-form templates).

- [ ] **Step 3: Write minimal implementation**
  - In `themes.server.ts`: reimplement `registryPackage(key)` to `getBuiltinTheme(key)` → `source()` → `assemblePreviewTemplates(source)` (source-form AST, no `rewriteThemeUrls`, no `urlForm`). Keep signature. Mark `loadRegistryPackage` as custom-installed-rows-only (rename internal comment; keep export for custom callers, throw `builder.registry_missing` for official keys telling caller to use source path — do not silently fall back).
  - In `appearance.server.ts`: build official catalogue section from `builtinThemeKeys()` + `getBuiltinTheme` metadata (name/author/tokens/templateKeys from source), remove `bundledOfficialCatalogEntries` import. Keep installed/custom sections untouched.
  - In theme-preview route: anonymous (no merchant) → builtin source; merchant with installed set → installed rows; unknown → 404 null (never silent wrong theme).
  - Do NOT delete `theme-export.ts`, `official-artifacts.ts`, `official-artifact-bundle.*`, `scripts/build-official-artifact-bundle.ts` — they become build-time-only (script may still run in CI to assert parity, but nothing at runtime imports them).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/themes/frame30-source-install.test.ts src/lib/theme-preview.test.ts src/lib/themes-install-catalog.test.ts 2>&1 | tail -6`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/frame28 add src/lib/themes.server.ts src/lib/themes/appearance.server.ts src/routes/theme-preview.\$key.tsx src/lib/themes/frame30-source-install.test.ts
git -C /opt/frame28 -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(frame30): source-direct official install/preview/render, drop runtime bundle deps"
```

(If route filename differs, `git add` the actual edited route file instead — same message.)

---

### Task 4: Explicit source-vs-package image-URL boundary (fix regression at source)

**Files:**

- Modify: `src/lib/theme-asset-url.ts` (create — branded types + converters), `src/lib/theme-export.ts` (type `urlForm` input as `PackageAssetUrl` context only; add doc that runtime must never call it), `src/components/builder/heritage.tsx` + `apparel.tsx` (render `src` through source resolver; no bare `assets/` emission outside package context)
- Test: `src/lib/theme-asset-url.test.ts` (create)

**Interfaces:**

- Consumes: nothing new (pure string functions)
- Produces: `type SourceAssetUrl = string & { __brand: "source" }`, `type PackageAssetUrl = string & { __brand: "package" }`, `toSourceUrl(basename, themeKey): SourceAssetUrl` (`/ph/<key>/<file>`), `toPackageRef(basename): PackageAssetUrl` (`assets/<file>`), `isSourceUrl(s)`, `isPackageRef(s)` — renderers accept `SourceAssetUrl`; exporter accepts package conversion explicitly

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/theme-asset-url.test.ts
import { describe, expect, it } from "vitest";
import {
  toSourceUrl,
  toPackageRef,
  isSourceUrl,
  isPackageRef,
} from "./theme-asset-url";

describe("theme-asset-url boundary", () => {
  it("source URLs are absolute /ph/ paths", () => {
    expect(toSourceUrl("hero-festive.png", "songoskriti")).toBe(
      "/ph/songoskriti/hero-festive.png",
    );
    expect(isSourceUrl("/ph/songoskriti/hero-festive.png")).toBe(true);
    expect(isSourceUrl("assets/hero-festive.png")).toBe(false);
  });
  it("package refs are bare assets/ paths for ZIP context only", () => {
    expect(toPackageRef("hero-festive.png")).toBe("assets/hero-festive.png");
    expect(isPackageRef("assets/hero-festive.png")).toBe(true);
    expect(isPackageRef("/ph/songoskriti/hero-festive.png")).toBe(false);
  });
  it("no renderer emits bare assets/ refs (checked in Task 3 test blob; unit pin here)", () => {
    expect(isSourceUrl(toSourceUrl("cat-women.png", "somvabona"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/theme-asset-url.test.ts 2>&1 | tail -4`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/theme-asset-url.ts
export type SourceAssetUrl = string & { readonly __brand: "source" };
export type PackageAssetUrl = string & { readonly __brand: "package" };

export function toSourceUrl(
  basename: string,
  themeKey: string,
): SourceAssetUrl {
  const clean = basename.replace(/^\/+/, "");
  return `/ph/${themeKey}/${clean}` as SourceAssetUrl;
}

export function toPackageRef(basename: string): PackageAssetUrl {
  const clean = basename.replace(/^\/+/, "").replace(/^assets\//, "");
  return `assets/${clean}` as PackageAssetUrl;
}

export function isSourceUrl(s: string): boolean {
  return s.startsWith("/ph/");
}

export function isPackageRef(s: string): boolean {
  return s.startsWith("assets/") && !s.startsWith("/");
}
```

Then: grep renderers for `src={dept.image}`-style passthrough and ensure authored demo data uses `toSourceUrl` values (demo-catalog already does — verify, don't bulk-rewrite); add code comment in `theme-export.ts` above `rewriteThemeUrls`: "PACKAGE CONTEXT ONLY — never call for HTTP preview/storefront rendering."

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/theme-asset-url.test.ts src/lib/themes/frame30-source-install.test.ts 2>&1 | tail -4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/frame28 add src/lib/theme-asset-url.ts src/lib/theme-asset-url.test.ts src/lib/theme-export.ts
git -C /opt/frame28 -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(frame30): explicit source-vs-package asset URL boundary"
```

---

### Task 5: Official plugins stay source-registered; custom plugins keep ZIP pipeline

**Files:**

- Modify: `src/lib/official-plugins.ts` (document source-only; remove any ZIP-build import), `src/lib/official-plugins.server.ts` (remove install-bytes-from-ZIP for official keys; resolve from `builtin-plugins.ts` manifests), `docs/developers/plugins.md` (two-model doc)
- Test: extend `src/lib/official-plugins.test.ts` (add, do not delete existing ZIP security tests)

**Interfaces:**

- Consumes: `BUILTIN_PLUGINS`, `getBuiltinPlugin` (existing), `OFFICIAL_PLUGIN_KEYS` (existing)
- Produces: `getOfficialPlugin(key)` source manifest (no bytes); custom install path unchanged (`package-zip` → validate → sandbox → consent → activate)

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
it("official plugins resolve from source with no ZIP bytes", async () => {
  const mod = await import("./official-plugins");
  for (const key of mod.OFFICIAL_PLUGIN_KEYS) {
    const entry = mod.getOfficialPlugin?.(key) ?? null;
    expect(entry).toBeTruthy();
  }
  const src = await import("./official-plugins.server");
  expect(typeof src.buildOfficialInstallBytes).toBe("undefined");
});
```

(If `getOfficialPlugin` does not exist yet, this fails — then implement it as a thin wrapper over `getBuiltinPlugin` + authored analytics entry.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/official-plugins.test.ts 2>&1 | tail -6`
Expected: FAIL (helper missing or `buildOfficialInstallBytes` still exported).

- [ ] **Step 3: Write minimal implementation**
  - Add `getOfficialPlugin(key)` to `official-plugins.ts` (source manifests only).
  - Remove/neutralize server ZIP-byte builder for official keys (official install goes through `upsertPlugin` with source manifest + grantedScopes, same as `marketplace-install.server.ts` builtin path — no archive validation needed because no archive).
  - Verify `requirePermission("plugins.update")` + merchant predicate remain on all mutation FNs (no authz bypass); keep Class A/B contracts untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/official-plugins.test.ts src/lib/plugins.server.test.ts src/lib/lifecycle-audit.test.ts 2>&1 | tail -6`
Expected: PASS (custom ZIP tests untouched and green).

- [ ] **Step 5: Commit**

```bash
git -C /opt/frame28 add src/lib/official-plugins.ts src/lib/official-plugins.server.ts src/lib/official-plugins.test.ts docs/developers/plugins.md
git -C /opt/frame28 -c user.name="opencode" -c user.email="opencode@local" commit -m "feat(frame30): official plugins source-registered, custom ZIP pipeline preserved"
```

---

### Task 6: Regression tests for §7 acceptance + docs + gates

**Files:**

- Modify: `src/lib/themes/frame30-acceptance.test.ts` (create — §7 items 1–8), `docs/developers/themes.md` (create or update — two-model doc), existing incorrect-official-ZIP tests (edit only assertions that demand ZIP for official flow; keep all `package-zip`/`package-install` security tests byte-identical)
- Test: `src/lib/themes/frame30-acceptance.test.ts`

**Interfaces:**

- Consumes: all Task 2–5 exports
- Produces: green acceptance suite + developer docs describing official-source vs custom-ZIP models

- [ ] **Step 1: Write the failing test (acceptance suite)**

```ts
// src/lib/themes/frame30-acceptance.test.ts
import { describe, expect, it } from "vitest";

describe("frame30 acceptance", () => {
  it("1: official themes work from source without ZIP generation", async () => {
    const { registryPackage } = await import("../themes.server");
    expect(registryPackage("songoskriti").version).toBeTruthy();
    expect(registryPackage("somvabona").version).toBeTruthy();
  });
  it("3: official image URLs are source-form in preview", async () => {
    const { registryPackage } = await import("../themes.server");
    const blob = JSON.stringify(registryPackage("songoskriti").templates);
    expect(blob).toContain("/ph/songoskriti/");
  });
  it("4+5: custom ZIP pipeline still validates and rejects unsafe archives", async () => {
    const { parseZip } = await import("../package-zip");
    await expect(parseZip(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
  });
  it("8: no runtime path imports generated official ZIPs", async () => {
    const fs = await import("node:fs");
    for (const f of [
      "src/lib/themes.server.ts",
      "src/lib/themes/appearance.server.ts",
      "src/lib/preview-sources.ts",
    ]) {
      expect(fs.readFileSync(`/opt/frame28/${f}`, "utf8")).not.toMatch(
        /official-artifact-bundle\.json/,
      );
    }
  });
});
```

(Items 2, 6, 7 covered by existing `themes-install-catalog`, `isolation`, `lifecycle-audit` suites — reference them in docs, do not duplicate DB integration here.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/themes/frame30-acceptance.test.ts 2>&1 | tail -6`
Expected: FAIL until Tasks 2–4 land (then PASS — if green already, strengthen assertion to `assets/` absence).

- [ ] **Step 3: Update developer docs**

In `docs/developers/themes.md` (or `docs/12-marketplace/themes.md` if canonical): add "Two distribution models" section — official source (built-in registry, no ZIP, install initializes tenant rows from source) vs custom ZIP (upload→validate→security→isolated install→sandbox preview→approve→activate; `package-zip.ts` only). Same for `docs/developers/plugins.md` (Task 5).

- [ ] **Step 4: Run gates**

Run: `bun run typecheck 2>&1 | tail -3`
Run: `bun run test src/lib/themes/ src/lib/preview-sources.test.ts src/lib/theme-preview*.test.ts src/lib/package-zip.test.ts src/lib/package-install.test.ts src/lib/official-plugins.test.ts 2>&1 | tail -6`
Run: `bun run build 2>&1 | tail -3`
Expected: typecheck clean, theme/preview/package/plugin suites green, build succeeds. DEFER deployed-preview verification (no prod claim from unit tests).

- [ ] **Step 5: Commit**

```bash
git -C /opt/frame28 add src/lib/themes/frame30-acceptance.test.ts docs/developers/themes.md docs/developers/plugins.md
git -C /opt/frame28 -c user.name="opencode" -c user.email="opencode@local" commit -m "test(frame30): acceptance suite + two-model developer docs"
```

---

## Self-Review

- Spec §2 (official source, single registry, no ZIP/download, tenant state, discoverable/previewable/activatable): Tasks 2–3.
- Spec §3 (custom ZIP lifecycle intact, fail-closed): Tasks 5–6 (untouched `package-zip` + rejection tests).
- Spec §4 (official plugins source, custom plugin ZIP, no authz bypass, Class A/B): Task 5.
- Spec §5 (image-URL at source, typed boundary, no heuristics/fallbacks, verify both themes): Tasks 3–4.
- Spec §6 (one built-in + one installed registry, explicit, no duplicates/stale/legacy): Tasks 2–3 (shim kept only until callers migrate; bundle JSON stays on disk but unimported at runtime).
- No placeholders: every step has exact file paths, code blocks, commands, expected outputs.
- Deferred: deployed preview verification (needs deploy access); `registerStaticPreviewSource` shim removal (O2 follow-up); DB `theme_registry` seeding for fresh envs (uses source floor instead — no migration per constraints).
