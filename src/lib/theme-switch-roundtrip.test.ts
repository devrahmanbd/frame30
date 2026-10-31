/**
 * Gap 7 — the theme-switch round trip at the HANDLER seam.
 *
 * The audit (`.superpowers/sdd/2026-10-22-frame30-dynamic-themes/audit-acceptance.md`,
 * gap 7) found that `template-persistence-isolation.test.ts:174` commits
 * through a keyed RPC double: it proves the payload shape, never a read.
 * This suite runs the REAL shipped functions over the in-memory DB double —
 * `activateTheme` (`src/lib/themes/appearance.server.ts:1457`),
 * `loadWorkspace` (`src/lib/themes.server.ts:229`) and `autosave`
 * (`:419`) — and reads each theme's draft back after every leg:
 *
 *   A active → edit A's Cart (autosave) → activate B → edit B's Collection
 *   → activate A → A's Cart is EXACTLY as the merchant left it (not the
 *   seed, not B's), B's Collection is EXACTLY as the merchant left it, and
 *   the seed merge still never overwrites a merchant's key.
 *
 * The DB double is the repo's own (`src/lib/__fixtures__/fake-db.ts`); its
 * documented limitation (one `order()` is honoured: the LAST) is worked
 * around by reading the theme's rows through `loadWorkspace`'s explicit
 * `previewThemeId`, which is the same per-theme read the editor performs —
 * the ACTIVE flag itself is asserted on `store_themes` after every switch.
 * The `theme_autosave` and `theme_install_preset` RPCs are faithful mirrors
 * of their migrations (`20260917210000_phase2e_theme_engine.sql:14-49`,
 * `20260917200000_phase2d_theme_install_preset.sql:81-151`), including the
 * revision guard and the `builder.draft_exists` refusal.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/lib/__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "@/lib/__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("@/lib/observability.server", () => rec.holder!.observability);
vi.mock("@/lib/rate-limit.server", () => allowAllRateLimits());

const { activateTheme } = await import("@/lib/themes/appearance.server");
const { autosave, installRegistryTheme, loadWorkspace, registryPackage } =
  await import("@/lib/themes.server");
const { parseTemplates } = await import("@/lib/builder-ast");
type Section = import("@/lib/builder-ast").Section;

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const THEME_A = "44444444-4444-4444-8444-444444444444";
const THEME_B = "55555555-5555-4555-8555-555555555555";
const VERSION_A = "66666666-6666-4666-8666-666666666666";
const VERSION_B = "77777777-7777-4777-8777-777777777777";

const RUN = "gap7";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Set the `text` prop of the first `heading` section in a template body. */
/**
 * Synthetic second package (test fixture): Songoskriti's seed minus the
 * Cart body, with a distinct Collection heading. The live catalogue ships
 * one theme, but the round-trip handler must still keep two maps separate.
 */
function packageB() {
  const pkgA = registryPackage("songoskriti");
  const templates = clone(pkgA.templates) as unknown as Record<string, unknown>;
  delete templates["cart"];
  const collection = templates["collection"] as
    | { main: Section[] }
    | undefined;
  collection?.main.unshift({
    id: "synthetic-b-heading",
    type: "heading",
    props: { text: "New in" },
  } as Section);
  return {
    templates: templates as unknown as typeof pkgA.templates,
    tokens: { ...pkgA.tokens, brand: "#7C2A1A" },
    version: "1.0.0",
  };
}

function setHeading(
  templates: Record<string, unknown>,
  key: string,
  marker: string,
): Record<string, unknown> {
  const next = clone(templates);
  const ast = next[key] as { main: Section[] } | undefined;
  expect(ast, `the package authors a ${key} body`).toBeDefined();
  const heading = ast!.main.find((section) => section.type === "heading");
  expect(heading, `the ${key} body carries a heading`).toBeDefined();
  heading!.props = { ...heading!.props, text: marker };
  // A legitimate edit changes ONE key only.
  return next;
}

function headingText(
  templates: Record<string, unknown>,
  key: string,
): string | undefined {
  const ast = templates[key] as { main: Section[] } | undefined;
  const heading = ast?.main.find((section) => section.type === "heading");
  return typeof heading?.props["text"] === "string"
    ? heading.props["text"]
    : undefined;
}

describe("the theme-switch round trip — A → B → A over the real handlers", () => {
  it("keeps each theme's own draft, and never resets it to the seed", async () => {
    const pkgA = registryPackage("songoskriti");
    const pkgB = packageB();
    const seedA = pkgA.templates as unknown as Record<string, unknown>;
    const seedB = pkgB.templates as unknown as Record<string, unknown>;
    expect(headingText(seedA, "cart"), "A authors a Cart heading").toBe(
      "Your bag",
    );
    expect(
      headingText(seedB, "collection"),
      "B authors a Collection heading",
    ).toBe("New in");

    const drafts = [
      {
        merchant_id: MERCHANT,
        theme_id: THEME_A,
        templates: clone(seedA),
        tokens: clone(pkgA.tokens),
        revision: 1,
      },
      {
        merchant_id: MERCHANT,
        theme_id: THEME_B,
        templates: clone(seedB),
        tokens: clone(pkgB.tokens),
        revision: 1,
      },
    ];

    let rpcHandler: (
      fn: string,
      args: Record<string, unknown>,
    ) => { data: unknown; error: unknown } = () => ({
      data: null,
      error: { message: "rpc_not_ready" },
    });
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME_A,
            merchant_id: MERCHANT,
            name: "Songoskriti",
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            source_listing_slug: "songoskriti",
            published_version_id: VERSION_A,
          },
          {
            id: THEME_B,
            merchant_id: MERCHANT,
            name: "Acme Pack",
            is_active: false,
            created_at: "2026-01-02T00:00:00.000Z",
            source_listing_slug: "acme-pack",
            published_version_id: VERSION_B,
          },
        ],
        theme_versions: [
          {
            id: VERSION_A,
            merchant_id: MERCHANT,
            theme_id: THEME_A,
            version: 1,
            status: "published",
            templates: clone(seedA),
            tokens: clone(pkgA.tokens),
          },
          {
            id: VERSION_B,
            merchant_id: MERCHANT,
            theme_id: THEME_B,
            version: 1,
            status: "published",
            templates: clone(seedB),
            tokens: clone(pkgB.tokens),
          },
        ],
        theme_drafts: drafts,
        theme_schedules: [],
        theme_audit: [],
        theme_registry: [],
        seo_templates: [],
      },
      rpc: (fn, args) => rpcHandler(fn, args),
    });

    rpcHandler = (fn, args) => {
      if (fn === "theme_autosave") {
        const draft = db
          .rows("theme_drafts")
          .find((row) => row.theme_id === args._theme_id);
        if (!draft)
          return { data: null, error: { message: "builder.theme_missing" } };
        if (Number(args._revision) > Number(draft.revision)) {
          draft.templates = args._templates ?? {};
          draft.tokens = args._tokens ?? {};
          draft.revision = args._revision;
          return {
            data: { revision: args._revision, applied: true },
            error: null,
          };
        }
        return {
          data: { revision: draft.revision, applied: false },
          error: null,
        };
      }
      if (fn === "theme_install_preset") {
        // The real RPC writes the ACTIVE theme's draft and refuses an
        // existing draft unless the caller confirmed the overwrite.
        const theme = db
          .rows("store_themes")
          .find((row) => row.is_active === true);
        if (!theme) return { data: null, error: { message: "theme_missing" } };
        const draft = db
          .rows("theme_drafts")
          .find((row) => row.theme_id === theme.id);
        if (draft && !args._overwrite_draft) {
          return {
            data: null,
            error: { code: "23505", message: "builder.draft_exists" },
          };
        }
        const preset = args._preset as {
          templates?: Record<string, unknown>;
          tokens?: unknown;
        };
        if (draft) {
          draft.templates = preset.templates ?? {};
          draft.tokens = preset.tokens ?? {};
          draft.revision = Number(draft.revision) + 1;
        } else {
          db.rows("theme_drafts").push({
            merchant_id: MERCHANT,
            theme_id: theme.id,
            templates: preset.templates ?? {},
            tokens: preset.tokens ?? {},
            revision: 1,
          });
        }
        return { data: "installed-version", error: null };
      }
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    };

    const activeId = (): string | undefined =>
      db.rows("store_themes").find((row) => row.is_active === true)?.id as
        string | undefined;

    await activateTheme(db.asClient(), MERCHANT, THEME_A);
    expect(activeId(), "A is the live theme").toBe(THEME_A);

    // --- Leg A: the merchant edits A's Cart through the real save handler.
    const workspaceA1 = await loadWorkspace(db.asClient(), MERCHANT, THEME_A);
    expect(workspaceA1.source, "A reads its own draft").toBe("draft");
    const cartMarkerA = `Frame30 gap7 cart A — ${RUN}`;
    const editedA = setHeading(
      workspaceA1.templates as unknown as Record<string, unknown>,
      "cart",
      cartMarkerA,
    );
    const savedA = await autosave(db.asClient(), MERCHANT, {
      themeId: THEME_A,
      templates: editedA,
      tokens: workspaceA1.tokens,
      revision: 2,
    });
    expect(savedA.applied, "A's autosave applied").toBe(true);
    const workspaceA2 = await loadWorkspace(db.asClient(), MERCHANT, THEME_A);
    expect(workspaceA2.source).toBe("draft");
    expect(workspaceA2.revision, "A's revision advanced").toBe(2);
    expect(headingText(editedA, "cart"), "A's cart carries the marker").toBe(
      cartMarkerA,
    );
    const untouchedA = clone(workspaceA1.templates["blog"]);

    // --- Switch to B: the flag flips and B's rows are B's.
    await activateTheme(db.asClient(), MERCHANT, THEME_B);
    expect(activeId(), "B becomes the live theme").toBe(THEME_B);
    const workspaceB1 = await loadWorkspace(db.asClient(), MERCHANT, THEME_B);
    expect(workspaceB1.source, "B reads its own draft").toBe("draft");
    expect(workspaceB1.theme.id).toBe(THEME_B);
    expect(
      headingText(
        workspaceB1.templates as unknown as Record<string, unknown>,
        "collection",
      ),
      "B's draft is B's seed, not A's edit",
    ).toBe("New in");
    expect(
      (workspaceB1.templates as unknown as Record<string, unknown>)["cart"],
      "B authors no Cart — A's body did not leak in",
    ).toBeUndefined();

    // --- Leg B: edit B's Collection.
    const collectionMarkerB = `Frame30 gap7 collection B — ${RUN}`;
    const editedB = setHeading(
      workspaceB1.templates as unknown as Record<string, unknown>,
      "collection",
      collectionMarkerB,
    );
    const savedB = await autosave(db.asClient(), MERCHANT, {
      themeId: THEME_B,
      templates: editedB,
      tokens: workspaceB1.tokens,
      revision: 2,
    });
    expect(savedB.applied, "B's autosave applied").toBe(true);

    // --- Switch BACK to A.
    await activateTheme(db.asClient(), MERCHANT, THEME_A);
    expect(activeId(), "A is live again").toBe(THEME_A);
    const workspaceA3 = await loadWorkspace(db.asClient(), MERCHANT, THEME_A);
    expect(workspaceA3.source, "A's draft — not the seed version").toBe(
      "draft",
    );
    expect(workspaceA3.revision, "A's revision is the merchant's").toBe(2);
    expect(
      headingText(
        workspaceA3.templates as unknown as Record<string, unknown>,
        "cart",
      ),
      "A's OWN cart came back from the switch — untouched, not the seed",
    ).toBe(cartMarkerA);
    expect(
      JSON.stringify(workspaceA3.templates["blog"]),
      "A's untouched template is byte-identical",
    ).toBe(JSON.stringify(untouchedA));
    expect(
      JSON.stringify(workspaceA3.templates),
      "B's edit never appears in A",
    ).not.toContain(collectionMarkerB);

    // --- B's draft is intact too.
    const workspaceB2 = await loadWorkspace(db.asClient(), MERCHANT, THEME_B);
    expect(
      headingText(
        workspaceB2.templates as unknown as Record<string, unknown>,
        "collection",
      ),
      "B's OWN collection edit survived the round trip",
    ).toBe(collectionMarkerB);
    expect(
      JSON.stringify(workspaceB2.templates),
      "A's cart never appears in B",
    ).not.toContain(cartMarkerA);

    // --- The seed merge still never overwrites a merchant's key: the REAL
    //     install path (overwrite confirmed) receives a map whose `cart` is
    //     A's marker, and A's draft keeps it.
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const installCall = db.rpcCalls("theme_install_preset").at(-1);
    expect(installCall, "the install reached its RPC").toBeDefined();
    const preset = (
      installCall!.args as {
        _preset: { templates: Record<string, unknown> };
      }
    )._preset;
    expect(
      headingText(preset.templates, "cart"),
      "the merge kept the merchant's Cart key",
    ).toBe(cartMarkerA);
    const workspaceA4 = await loadWorkspace(db.asClient(), MERCHANT, THEME_A);
    expect(
      headingText(
        workspaceA4.templates as unknown as Record<string, unknown>,
        "cart",
      ),
      "the install never reset A's Cart to the seed",
    ).toBe(cartMarkerA);
    expect(
      JSON.stringify(
        (workspaceA4.templates as unknown as Record<string, unknown>)["blog"],
      ),
      "the seed's own untouched key is still the seed",
    ).toBe(JSON.stringify(parseTemplates(clone(seedA))["blog"]));
    expect(
      (
        (workspaceA4.templates as unknown as Record<string, unknown>)[
          "blog"
        ] as { main: Section[] }
      ).main.find((section) => section.type === "blog_terms")?.props["heading"],
      "the install kept the merchant's authored blog copy",
    ).toBe("Browse the journal");
  });

  it("the parser keeps A's and B's maps separate documents", () => {
    const a = parseTemplates(
      clone(registryPackage("songoskriti").templates),
    ) as unknown as Record<string, unknown>;
    const b = parseTemplates(
      clone(packageB().templates),
    ) as unknown as Record<string, unknown>;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(a["cart"]).toBeDefined();
    expect(b["cart"]).toBeUndefined();
  });
});
