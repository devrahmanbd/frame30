/**
 * CONFLICT lane — pre-install/pre-activation namespace conflict detection +
 * dependency version-range solver gate.
 *
 * Pure module: no network, no database, no React. Everything here is
 * decidable from its arguments, so the install pipeline
 * (`src/lib/package-install.server.ts`), review tooling and unit tests all
 * run the same scan.
 *
 * Six namespaces, two severities. Whether an overlap may block an install
 * follows the architecture's isolation rules (one literal, enforced here):
 *
 * - BLOCKING (globally exclusive — first-wins or single-decider at runtime,
 *   so a second claimant would silently shadow or ambiguate):
 *   - `widget`: plugin widget ownership (`plugin:{id}/{widget}`). The id
 *     segment makes cross-slug collisions structurally impossible; the scan
 *     asserts the invariant (same key, two slugs = fail closed).
 *   - `menu`: nav renderer SWAP claims (`menu:<slot>` for `menu_bar` /
 *     `menu_dropdown` / `menu_drawer`). `decideMenuRenderer`
 *     (`src/lib/plugin-manifest.ts:102`) is first-claim-wins — a second live
 *     swap is silently dead. Menu FILL rows fan in by design and are never
 *     claims (not extracted).
 *   - `route`: route-scoped EXCLUSIVE server hooks (`hook:cart.calculate`,
 *     `hook:checkout.validate`) — one decider per route pipeline, so two
 *     calculators leave the result ambiguous. Notification hooks
 *     (`order.created`, `product.saved`) fan out to every subscriber and are
 *     never claims.
 * - INFORMATIONAL (overlap is normal — isolated by design, never blocks):
 *   - `template` / `route` (template routes, `route:<template>` — each
 *     template renders its storefront route, cf. `ROUTE_H1_TEMPLATES` in
 *     `src/lib/builder-ast.ts:68`): only one theme is active at a time, so
 *     two packages declaring `index` is the steady state, not a conflict.
 *   - `presentation`: per-widget theme presentations are keyed
 *     themeKey x widget (`src/lib/theme-presentations.ts`) and community
 *     presentations themeKey x pluginKey
 *     (`src/lib/plugin-theme-contract.ts:157`) — a theme dressing a widget
 *     can never shadow another theme's dressing.
 *   - `asset`: storage is per-version namespaced (`themes/<vId>/…`,
 *     `plugins/<slug>/<artifact8>/…` in `src/lib/package-store.server.ts`),
 *     so identical relative paths in two packages never collide on disk.
 *   - `widget` claims where either side is a theme are DRESSING refs
 *     (`supportedWidgets`, `plugin:{id}` refs), not ownership — "plugins
 *     provide functionality, themes dress them". Only plugin x plugin
 *     ownership overlaps block.
 *
 * Fail-closed: `scanNamespaceConflicts` never throws — malformed input
 * degrades to empty claims. Every blocking overlap carries a stable
 * `conflict.<namespace>:<id>` reason code; callers fail the install with
 * `package.namespace_conflict`.
 *
 * Dependency ranges ride alongside: `satisfiesVersionRange` (exact / caret /
 * `>=a <b` pair — the same shapes `satisfiesApiRange` reads) and
 * `checkDependencyRanges` (presence + range, "any live row satisfies" across
 * successive ledger rows). Codes: `dependency.missing:<slug>`,
 * `dependency.version:<slug>`.
 */

import {
  MENU_SLOTS,
  compareSemver,
  parseSemver,
} from "./marketplace-scopes";

/* ------------------------------------------------------------ namespaces */

export const CONFLICT_NAMESPACES = [
  "widget",
  "template",
  "presentation",
  "route",
  "asset",
  "menu",
] as const;
export type ConflictNamespace = (typeof CONFLICT_NAMESPACES)[number];

/** Route-scoped server hooks with single-decider semantics (two calculators = ambiguous). */
export const EXCLUSIVE_HOOKS = ["cart.calculate", "checkout.validate"] as const;

export type NamespaceClaims = Record<ConflictNamespace, string[]>;

export type ConflictPackage = {
  slug: string;
  kind: "theme" | "plugin";
  version: string;
  claims: NamespaceClaims;
};

export function emptyClaims(): NamespaceClaims {
  return { widget: [], template: [], presentation: [], route: [], asset: [], menu: [] };
}

function uniqSorted(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter((s) => s.length > 0))].sort();
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/* ------------------------------------------------------------- extractors */

/**
 * Theme claims from manifest JSON. Defensive: anything malformed yields
 * empty claims (the PKG-1 manifest gate owns rejection, never the scan).
 * Dressing refs (`supportedWidgets`, `plugin:` refs) stay in `widget` —
 * the scan's exclusivity rule (plugin x plugin only) keeps dressing from
 * ever blocking (see module header).
 */
export function extractThemeClaims(raw: unknown): NamespaceClaims {
  const out = emptyClaims();
  try {
    const r = (raw ?? {}) as Record<string, unknown>;
    const widgets: string[] = [];
    for (const w of strList(r.supportedWidgets)) widgets.push(`widget:${w.trim()}`);
    const deps = Array.isArray(r.pluginDependencies) ? r.pluginDependencies : [];
    for (const d of deps) {
      const ref =
        typeof (d as Record<string, unknown> | null)?.ref === "string"
          ? String((d as Record<string, unknown>).ref).trim()
          : "";
      if (ref) widgets.push(ref);
    }
    out.widget = uniqSorted(widgets);
    out.template = uniqSorted(strList(r.templates).map((t) => String(t).trim()));
    out.presentation = uniqSorted(
      strList(r.presentationSurfaces).map((s) => `surface:${String(s).trim()}`),
    );
    // Each declared template renders its storefront route; the route id
    // follows the template id (no URL-shape invention — identity only).
    out.route = uniqSorted(
      strList(r.templates).map((t) => `route:${String(t).trim()}`),
    );
    const assets = Array.isArray(r.assetManifest) ? r.assetManifest : [];
    const paths: string[] = [];
    for (const a of assets) {
      const p =
        typeof (a as Record<string, unknown> | null)?.path === "string"
          ? String((a as Record<string, unknown>).path).trim()
          : "";
      if (p) paths.push(p);
    }
    out.asset = uniqSorted(paths);
    // Theme `menu` surface = nav MENU BINDINGS (rows the engine renders),
    // never a renderer swap — informational only, never a `menu:<slot>` id.
    out.menu = strList(r.presentationSurfaces).some((s) => String(s) === "menu")
      ? ["menu:bindings"]
      : [];
  } catch {
    return emptyClaims();
  }
  return out;
}

/**
 * Plugin claims from manifest JSON. Only globally-exclusive ids block:
 * owned widget keys, swap slots (replace_menus + menu-slot widgets) and
 * exclusive hooks. Menu FILL widgets (menu slots without replace_menus)
 * and notification hooks fan in/out by design — not extracted.
 */
export function extractPluginClaims(raw: unknown): NamespaceClaims {
  const out = emptyClaims();
  try {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id =
      typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
    const widgets: string[] = [];
    const menuSlots = new Set<string>(MENU_SLOTS as readonly string[]);
    const swapSlots: string[] = [];
    const perms = strList(r.permissions).map((s) => s.trim().toLowerCase());
    const maySwap = perms.includes("replace_menus");
    const list = Array.isArray(r.widgets) ? r.widgets : [];
    for (const w of list) {
      const wr = (w ?? {}) as Record<string, unknown>;
      const wkey = typeof wr.key === "string" ? wr.key.trim() : "";
      if (wkey && id) widgets.push(`plugin:${id}/${wkey}`);
      const slots = Array.isArray(wr.slots) ? wr.slots.map(String) : [];
      if (maySwap) {
        for (const s of slots) {
          const slot = s.trim();
          if (menuSlots.has(slot)) swapSlots.push(`menu:${slot}`);
        }
      }
    }
    out.widget = uniqSorted(widgets);
    out.menu = uniqSorted(swapSlots);
    const hooks = new Set<string>(EXCLUSIVE_HOOKS as readonly string[]);
    const claimed = Array.isArray(r.hooks) ? r.hooks.map(String) : [];
    out.route = uniqSorted(
      claimed.map((h) => h.trim()).filter((h) => hooks.has(h)).map((h) => `hook:${h}`),
    );
  } catch {
    return emptyClaims();
  }
  return out;
}

/**
 * File-level claims from extracted package paths (`templates/*.json` ids,
 * `assets/*` ids). Complements the manifest extractors at install time,
 * where the file list is in hand; installed-side file lists are not
 * persisted, so this runs candidate-side only in the pipeline.
 */
export function extractFileClaims(files: readonly { path: string }[]): NamespaceClaims {
  const out = emptyClaims();
  try {
    const templates: string[] = [];
    const assets: string[] = [];
    for (const f of files ?? []) {
      const p = typeof f?.path === "string" ? f.path : "";
      if (p.startsWith("templates/") && p.endsWith(".json")) {
        const id = p.slice("templates/".length, -".json".length).trim();
        if (id && !id.includes("/")) templates.push(id);
      } else if (p.startsWith("assets/") && p.length > "assets/".length) {
        assets.push(p);
      }
    }
    out.template = uniqSorted(templates);
    out.asset = uniqSorted(assets);
  } catch {
    return emptyClaims();
  }
  return out;
}

/** Merge two claim sets (e.g. manifest + file claims candidate-side). */
export function mergeClaims(a: NamespaceClaims, b: NamespaceClaims): NamespaceClaims {
  const out = emptyClaims();
  for (const ns of CONFLICT_NAMESPACES) out[ns] = uniqSorted([...a[ns], ...b[ns]]);
  return out;
}

/* ------------------------------------------------------------------- scan */

export type NamespaceConflict = {
  namespace: ConflictNamespace;
  /** The colliding id (e.g. `menu:menu_bar`, `hook:cart.calculate`). */
  id: string;
  /** Slug of the installed package already holding the id. */
  holder: string;
  /** Stable reason code: `conflict.<namespace>:<id>`. */
  code: string;
  /** True = blocks install/activate; false = informational overlap only. */
  blocking: boolean;
};

export type ConflictVerdict =
  | { ok: true; conflicts: []; shared: NamespaceConflict[] }
  | { ok: false; conflicts: NamespaceConflict[]; shared: NamespaceConflict[] };

function isBlocking(ns: ConflictNamespace, candidateKind: string, holderKind: string): boolean {
  // Globally-exclusive surfaces block only between two plugin owners.
  // Theme dressing refs, template/route/presentation overlaps and
  // per-version-namespaced assets are isolated by design (module header).
  if (ns === "widget" || ns === "menu") {
    return candidateKind === "plugin" && holderKind === "plugin";
  }
  if (ns === "route") {
    // Only exclusive-hook ids (`hook:*`) block; template routes follow templates.
    return candidateKind === "plugin" && holderKind === "plugin";
  }
  return false;
}

function isHookId(id: string): boolean {
  return id.startsWith("hook:");
}

/**
 * Pairwise scan: every candidate id already held by a DIFFERENT slug is
 * reported. Same slug = same package line (update/reinstall), never a
 * conflict. Blocking overlaps fail the install (`ok: false`); the rest
 * ride in `shared` for review tooling. Never throws.
 */
export function scanNamespaceConflicts(
  candidate: ConflictPackage,
  installed: readonly ConflictPackage[],
): ConflictVerdict {
  try {
    const conflicts: NamespaceConflict[] = [];
    const shared: NamespaceConflict[] = [];
    const seen = new Set<string>();
    for (const ns of CONFLICT_NAMESPACES) {
      for (const id of candidate.claims[ns] ?? []) {
        // Route namespace carries two id families: template routes
        // (`route:*`, informational) and exclusive hooks (`hook:*`).
        const hookRouted = ns === "route" && isHookId(id);
        for (const other of installed ?? []) {
          if (!other || other.slug === candidate.slug) continue;
          if (!(other.claims[ns] ?? []).includes(id)) continue;
          const key = `${ns}:${id}:${other.slug}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const entry: NamespaceConflict = {
            namespace: ns,
            id,
            holder: other.slug,
            code: `conflict.${ns}:${id}`,
            blocking:
              (ns === "route" ? hookRouted : true) &&
              isBlocking(ns, candidate.kind, other.kind),
          };
          (entry.blocking ? conflicts : shared).push(entry);
        }
      }
    }
    const byCode = (a: NamespaceConflict, b: NamespaceConflict) =>
      a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    conflicts.sort(byCode);
    shared.sort(byCode);
    return conflicts.length
      ? { ok: false, conflicts, shared }
      : { ok: true, conflicts: [], shared };
  } catch {
    return { ok: true, conflicts: [], shared: [] };
  }
}

/* ------------------------------------------------------- version-range gate */

/** Exact semver (`1.2.0`), caret (`^1.2.0`) or pair (`>=1.2.0 <2.0.0`). */
export function satisfiesVersionRange(
  version: string,
  range: string | null | undefined,
): boolean {
  try {
    const v = (version ?? "").trim();
    const r = (range ?? "").trim();
    if (!parseSemver(v) || !r) return false;
    if (parseSemver(r)) return compareSemver(v, r) === 0;
    const caret = /^\^(\d+\.\d+\.\d+)$/.exec(r);
    if (caret) {
      const base = parseSemver(caret[1]!);
      const want = parseSemver(v);
      if (!base || !want) return false;
      return base.major === want.major && compareSemver(v, caret[1]!) >= 0;
    }
    const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(r);
    if (pair) {
      return compareSemver(v, pair[1]!) >= 0 && compareSemver(v, pair[2]!) < 0;
    }
    return false;
  } catch {
    return false;
  }
}

export type DependencyWant = { slug: string; version?: string };
export type InstalledVersion = { slug: string; version: string };

export type DependencyVerdict =
  | { ok: true; missing: []; mismatched: [] }
  | {
      ok: false;
      missing: string[];
      mismatched: { slug: string; want: string; got: string }[];
    };

/**
 * Presence + range gate over the install ledger. A dependency is satisfied
 * when ANY live row for its slug carries a version inside the wanted range
 * (successive ledger rows keep history — the newest satisfying row wins);
 * an absent range means "present is enough" (legacy behavior, unchanged).
 * Legacy rows with no (or unparseable) version are treated as UNKNOWN, not
 * as a mismatch — presence suffices, mirroring the artifact-column NULL =
 * legacy fallback in `package-install.server.ts`. Only a parseable
 * installed version provably outside the range fails closed.
 * Codes: `dependency.missing:<slug>`, `dependency.version:<slug>`.
 * Never throws.
 */
export function checkDependencyRanges(
  wants: readonly DependencyWant[],
  installed: readonly InstalledVersion[],
): DependencyVerdict {
  try {
    const missing: string[] = [];
    const mismatched: { slug: string; want: string; got: string }[] = [];
    for (const want of wants ?? []) {
      const slug = (want?.slug ?? "").trim();
      if (!slug) continue;
      const rows = (installed ?? []).filter((i) => i?.slug === slug);
      if (rows.length === 0) {
        if (!missing.includes(slug)) missing.push(slug);
        continue;
      }
      const range = (want.version ?? "").trim();
      if (!range) continue;
      const known = rows.filter((row) => parseSemver((row.version ?? "").trim()) !== null);
      // No parseable version anywhere for this slug = legacy unknown:
      // presence suffices (proven mismatch is the only fail-closed trigger).
      if (known.length === 0) continue;
      const hit = known.some((row) => satisfiesVersionRange((row.version ?? "").trim(), range));
      if (!hit) {
        const got = known
          .map((row) => (row.version ?? "").trim())
          .sort()
          .join(",");
        if (!mismatched.some((m) => m.slug === slug)) {
          mismatched.push({ slug, want: range, got });
        }
      }
    }
    missing.sort();
    mismatched.sort((a, b) => (a.slug < b.slug ? -1 : 1));
    return missing.length || mismatched.length
      ? { ok: false, missing, mismatched }
      : { ok: true, missing: [], mismatched: [] };
  } catch {
    return { ok: true, missing: [], mismatched: [] };
  }
}

/** Stable reason codes for a failed dependency verdict (fail-closed detail). */
export function dependencyConflictCodes(verdict: DependencyVerdict): string[] {
  if (verdict.ok) return [];
  return [
    ...verdict.missing.map((s) => `dependency.missing:${s}`),
    ...verdict.mismatched.map((m) => `dependency.version:${m.slug}`),
  ];
}
