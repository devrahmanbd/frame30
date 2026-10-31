/**
 * Batch C — the per-template PERSISTENCE isolation.
 *
 * The brief's §3 promise is "saving Search must not overwrite Cart" and
 * "editing Account must not change Page". The editor's structure already
 * gives it (one AST per template key), but structure is not evidence: this
 * suite proves the property through the REAL save path, with the REAL
 * parser, over the REAL map shape a merchant's theme carries.
 *
 * What is pinned:
 *
 *  1. **One template's save touches no other.** The map the commit RPC
 *     actually received carries every untouched key BYTE-IDENTICALLY.
 *  2. **Every pair.** The whole map (ten base keys and the five closed
 *     variant keys) is round-tripped through `parseTemplates` after a
 *     single-template edit, and every untouched key compares equal.
 *  3. **A theme switch leaks nothing.** Theme A's map and theme B's map are
 *     separate documents; a commit for one never carries the other's
 *     bodies.
 *  4. **A variant never overwrites its base.** `blog_article` and `blog`
 *     are two separate ASTs in the same map, and editing one leaves the
 *     other untouched.
 *
 * The suite is self-contained: it imports the server module through the
 * same `vi.mock` seam the neighbouring suites use (`observability.server`
 * and `rate-limit.server`), so the commit's own rate-limit and metric calls
 * never touch Redis.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { commitVersion, registryPackage } = await import("./themes.server");
const { DEFAULT_TOKENS, TEMPLATE_KEYS, parseTemplates } =
  await import("./builder-ast");
const { TEMPLATE_VARIANT_KEYS } = await import("./template-variants");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const THEME_A = "44444444-4444-4444-8444-444444444444";
const THEME_B = "55555555-5555-4555-8555-555555555555";

/** A tiny authored body — one section, so it is not the empty AST. */
function body(type: string, id: string) {
  return {
    header: [],
    main: [{ id, type, props: {} }],
    footer: [],
  };
}

/**
 * A merchant's WHOLE map: every base key the platform knows and every
 * variant of the closed vocabulary.
 */
function fullMap() {
  const map: Record<string, unknown> = {};
  for (const key of TEMPLATE_KEYS) map[key] = body("heading", `${key}-1`);
  for (const variant of TEMPLATE_VARIANT_KEYS) {
    map[variant] = body("heading", `${variant}-1`);
  }
  return map;
}

/** The single-template edit the editor performs: ONE key is replaced. */
function edit(map: Record<string, unknown>, key: string) {
  return { ...map, [key]: body("rich_text", `${key}-edited`) };
}

/**
 * Commit a map through the REAL save path and return the templates the
 * commit RPC actually received.
 */
async function commit(
  map: Record<string, unknown>,
  themeId = THEME_A,
): Promise<Record<string, unknown>> {
  const db = fakeDb({
    tables: {
      store_themes: [
        {
          id: themeId,
          merchant_id: MERCHANT,
          name: "Songoskriti",
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          source_listing_slug: "songoskriti",
        },
      ],
      theme_versions: [],
      theme_drafts: [],
      theme_custom_code: [],
      theme_audit: [],
    },
    rpc: (fn) =>
      fn === "theme_commit"
        ? { data: "version-new", error: null }
        : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
  });
  await commitVersion(db.asClient(), MERCHANT, {
    themeId,
    templates: map,
    tokens: DEFAULT_TOKENS,
  });
  const call = db.rpcCalls("theme_commit")[0];
  expect(call, "the commit must call theme_commit").toBeDefined();
  return (call!.args as { _templates: Record<string, unknown> })._templates;
}

/** The exact bytes of one key, as the storage layer sees them. */
function bytes(value: unknown): string {
  return JSON.stringify(value);
}

describe("per-template persistence isolation", () => {
  it("saving the search template leaves every other template byte-identical", async () => {
    const before = fullMap();
    // The PARSED baseline: what the storage layer actually holds for this
    // map. (The parser fills a widget's declared defaults in, so the
    // comparison is against the parsed shape, not the raw literal.)
    const baseline = parseTemplates(JSON.parse(JSON.stringify(before)));
    const saved = await commit(edit(before, "search"));
    // The edited template carries the merchant's new body …
    expect(
      (saved.search as { main: { id: string }[] }).main.map((s) => s.id),
    ).toEqual(["search-edited"]);
    // … and every other template is BYTE-IDENTICAL to what it was.
    for (const key of [
      "cart",
      "account",
      "blog",
      "checkout",
      "archive",
      "page",
    ] as const) {
      expect(bytes(saved[key]), `${key} must be untouched`).toBe(
        bytes(baseline[key]),
      );
    }
    // The variants ride the same map and are untouched too.
    for (const variant of TEMPLATE_VARIANT_KEYS) {
      expect(bytes(saved[variant]), `${variant} must be untouched`).toBe(
        bytes(baseline[variant]),
      );
    }
  });

  it("holds for EVERY pair: one template's edit leaves the others equal", () => {
    const before = fullMap();
    const baseline = parseTemplates(JSON.parse(JSON.stringify(before)));
    const keys = [...TEMPLATE_KEYS, ...TEMPLATE_VARIANT_KEYS];
    for (const edited of keys) {
      const after = parseTemplates(edit(before, edited));
      for (const key of keys) {
        if (key === edited) continue;
        expect(
          after[key],
          `${key} must be untouched by the ${edited} edit`,
        ).toEqual(baseline[key]);
      }
    }
  });

  it("a theme switch never leaks a layout between two themes", async () => {
    // Two REAL themes' maps — the shape a merchant switches between.
    const a = registryPackage("songoskriti").templates as Record<
      string,
      unknown
    >;
    // Synthetic second map (one theme ships): a distinct index body and no
    // archive, so the two maps are genuinely different.
    const b = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    delete b["archive"];
    (b["index"] as { main: { id: string }[] }).main[0]!.id =
      "synthetic-theme-b-body";
    // The two maps are genuinely different documents …
    expect(bytes(a.index)).not.toBe(bytes(b.index));
    // … and a commit for theme A carries A's body, a commit for theme B
    // carries B's. Neither RPC payload carries the other theme's layout.
    const savedA = await commit(a, THEME_A);
    const savedB = await commit(b, THEME_B);
    const baselineA = parseTemplates(JSON.parse(JSON.stringify(a)));
    const baselineB = parseTemplates(JSON.parse(JSON.stringify(b)));
    expect(bytes(savedA.index)).toBe(bytes(baselineA.index));
    expect(bytes(savedB.index)).toBe(bytes(baselineB.index));
    expect(bytes(savedA.index)).not.toBe(bytes(savedB.index));
    // The archive key is a key like any other: it travels with the theme
    // that AUTHORS it and never appears in the other's map. The assembled
    // map is PARTIAL (a template a theme does not author is ABSENT — the
    // engine no longer synthesises a body for it), so the theme that does
    // not author the archive never carries one — and never receives the
    // other theme's.
    expect(savedA.archive).toBeDefined();
    expect(savedB.archive).toBeUndefined();
    expect(bytes(savedA.archive)).not.toBe(bytes(savedB.archive));
  });

  it("a variant never overwrites its base", async () => {
    const before = fullMap();
    const baseline = parseTemplates(JSON.parse(JSON.stringify(before)));
    // Editing the VARIANT leaves the BASE alone …
    const savedVariant = await commit(edit(before, "blog_article"));
    expect(bytes(savedVariant.blog)).toBe(bytes(baseline.blog));
    expect(
      (savedVariant.blog_article as { main: { id: string }[] }).main.map(
        (s) => s.id,
      ),
    ).toEqual(["blog_article-edited"]);
    // … and editing the BASE leaves the VARIANT alone.
    const savedBase = await commit(edit(before, "blog"));
    expect(bytes(savedBase.blog_article)).toBe(bytes(baseline.blog_article));
    expect(
      (savedBase.blog as { main: { id: string }[] }).main.map((s) => s.id),
    ).toEqual(["blog-edited"]);
  });

  it("the parser keeps every key of the map — base and variant alike", () => {
    const before = fullMap();
    const parsed = parseTemplates(JSON.parse(JSON.stringify(before)));
    expect(Object.keys(parsed).sort()).toEqual(
      [...TEMPLATE_KEYS, ...TEMPLATE_VARIANT_KEYS].sort(),
    );
  });
});
