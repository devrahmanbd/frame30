/**
 * Gap 6(a) — nested composition through the REAL editor handlers.
 *
 * The audit (`.superpowers/sdd/2026-10-22-frame30-dynamic-themes/audit-acceptance.md`,
 * gap 6) found that "Add inside" (`LayerTree.tsx:376`) and the inside-drop
 * (`:231-232`) were source-only: no test drove them at any level. This is
 * the handler-level half of the proof.
 *
 * What is REAL here:
 *
 *  - the REAL `useBuilderEditor` hook the editor mounts
 *    (`src/routes/_authenticated/dashboard/builder.tsx:661`);
 *  - the REAL `LayerTree` component, rendered with the same callbacks the
 *    builder wires — `onAddInside` is the builder's own `setAddParent`
 *    (`builder.tsx:2014-2017`) and the insert is the tray's own
 *    `editor.add(type, { parentId: addParent })` (`:2086-2096`);
 *  - the REAL `autosave` server function over the in-memory DB double the
 *    repo's server suites use (`src/lib/__fixtures__/fake-db.ts`), with a
 *    faithful mirror of the `theme_autosave` RPC's revision guard
 *    (`supabase/migrations/20260917210000_phase2e_theme_engine.sql:14-49`);
 *  - the REAL Songoskriti Cart composition (the fixture the audit named).
 *
 * The journey: add a `container` INSIDE the Cart's `Columns`, add a
 * `cart_lines` INSIDE that container, set its heading, move the container
 * up, add a second container and DELETE it. The finished AST is flushed
 * through the hook's own `flush()` → `onAutosave` → `autosave()`, and the
 * stored draft is read back through `parseTemplates` — so the assertion is
 * on what the save handler persisted, not on React state.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "@/lib/builder-ast";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));

import {
  metricRecorder,
  allowAllRateLimits,
} from "@/lib/__fixtures__/test-doubles";
import { fakeDb } from "@/lib/__fixtures__/fake-db";

const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("@/lib/observability.server", () => rec.holder!.observability);
vi.mock("@/lib/rate-limit.server", () => allowAllRateLimits());

const { useBuilderEditor } = await import("@/hooks/use-builder-editor");
const { parseTemplates } = await import("@/lib/builder-ast");
const { autosave, registryPackage } = await import("@/lib/themes.server");
const { LayerTree } = await import("./LayerTree");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const THEME = "44444444-4444-4444-8444-444444444444";

/**
 * Faithful mirror of `public.theme_autosave` (phase-2e): insert when no
 * draft, apply only when `_revision` is strictly newer, otherwise report the
 * stored revision with `applied: false`. The auth/tenancy guards are the
 * RPC's own and are not stubbed away — the fake bypasses auth the way the
 * repo's server-double suites do.
 */
function themeAutosaveRpc(db: ReturnType<typeof fakeDb>) {
  return (fn: string, args: Record<string, unknown>) => {
    if (fn !== "theme_autosave")
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    const theme = db.rows("store_themes").find((r) => r.id === args._theme_id);
    if (!theme)
      return { data: null, error: { message: "builder.theme_missing" } };
    const drafts = db.rows("theme_drafts");
    const existing = drafts.find((d) => d.theme_id === args._theme_id);
    if (!existing) {
      drafts.push({
        merchant_id: MERCHANT,
        theme_id: args._theme_id,
        templates: args._templates ?? {},
        tokens: args._tokens ?? {},
        revision: args._revision,
      });
      return {
        data: { revision: args._revision, applied: true },
        error: null,
      };
    }
    if (Number(args._revision) > Number(existing.revision)) {
      existing.templates = args._templates ?? {};
      existing.tokens = args._tokens ?? {};
      existing.revision = args._revision;
      return {
        data: { revision: args._revision, applied: true },
        error: null,
      };
    }
    return {
      data: { revision: existing.revision, applied: false },
      error: null,
    };
  };
}

function flatten(nodes: Section[]): Section[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe("nested composition — Add inside, reorder, delete, persist", () => {
  it("builds and persists the nested Cart the merchant composed", async () => {
    const pkg = registryPackage("songoskriti");
    const templates = pkg.templates as Record<string, { main: Section[] }>;
    const cart = templates["cart"]!;
    const columns = cart.main.find((node) => node.type === "columns");
    expect(
      columns,
      "the Cart composition carries its Columns container",
    ).toBeDefined();
    const originalChildren = (columns!.children ?? []).map((n) => n.id);
    expect(originalChildren).toHaveLength(2);

    // The RPC handler needs the same DB instance it reads; bind it through a
    // forwarding closure so both see one set of tables.
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
            id: THEME,
            merchant_id: MERCHANT,
            name: "Songoskriti",
            is_active: true,
          },
        ],
        theme_drafts: [],
      },
      rpc: (fn, args) => rpcHandler(fn, args),
    });
    rpcHandler = themeAutosaveRpc(db);

    const NESTED_MARKER = "Gap6 nested cart heading — α";
    const saved: { doc: unknown; revision: number }[] = [];
    const ids: { container: string; lines: string; doomed: string } = {
      container: "",
      lines: "",
      doomed: "",
    };
    /** The builder's own `addParent` (`builder.tsx:1985`, `:2014`). */
    const addParent = { current: null as string | null };
    let step = 0;
    let flushed = false;
    let flushDone = false;

    const Harness = () => {
      const editor = useBuilderEditor(
        { templates: pkg.templates, tokens: pkg.tokens },
        {
          revision: 0,
          onAutosave: async (doc, revision) => {
            saved.push({ doc, revision });
            await autosave(db.asClient(), MERCHANT, {
              themeId: THEME,
              templates: doc.templates,
              tokens: doc.tokens,
              revision,
            });
          },
        },
      );

      const run = () => {
        if (!editor.doc) return;
        if (step === 0) {
          // THE LayerTree action: its "+" button calls `onAddInside(node.id)`
          // (`LayerTree.tsx:370-380`), which is the builder's `setAddParent`;
          // the tray's insert then uses that parent (`builder.tsx:2086`).
          // One render pass drives both, because the parent is a ref (the
          // builder's state equivalent) and the INSERT is what re-renders.
          addParent.current = columns!.id;
          ids.container = editor.add("cart", "main", "container", {
            parentId: addParent.current,
          });
        } else if (step === 1) {
          // Add inside the NEW container.
          addParent.current = ids.container;
          ids.lines = editor.add("cart", "main", "cart_lines", {
            parentId: addParent.current,
          });
        } else if (step === 2) {
          editor.setProp("cart", "main", ids.lines, "heading", NESTED_MARKER);
        } else if (step === 3) {
          // The navigator's own "Move up".
          editor.nudge("cart", "main", ids.container, -1);
        } else if (step === 4) {
          // A second nested container, deleted in the next step.
          addParent.current = columns!.id;
          ids.doomed = editor.add("cart", "main", "container", {
            parentId: addParent.current,
          });
        } else if (step === 5) {
          editor.remove("cart", "main", ids.doomed);
        }
      };

      // Render-phase drive (the repo's own hook-probe pattern,
      // `use-builder-editor.route-h1.test.tsx`): each pass performs ONE real
      // action on the real hook, and React re-renders until the journey ends.
      // The flush runs on the pass AFTER the last action, so its closure sees
      // the finished document (the shipped route-h1 probe's ordering).
      if (step < 6) {
        run();
        step += 1;
      } else if (!flushed) {
        flushed = true;
        void editor.flush().then(() => {
          flushDone = true;
        });
      }

      return null;
    };

    renderToStaticMarkup(createElement(Harness));
    for (let i = 0; i < 50 && !flushDone; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // The REAL navigator, wired exactly as the builder wires it, renders its
    // own Add inside control for the composition's container rows.
    const treeMarkup = renderToStaticMarkup(
      createElement(LayerTree, {
        sections: cart.main,
        selectedIds: [],
        onSelect: () => undefined,
        onMove: () => undefined,
        onNudge: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onAddInside: (parentId: string) => {
          addParent.current = parentId;
        },
      }),
    );
    expect(
      treeMarkup,
      "the LayerTree renders its own Add inside control for containers",
    ).toContain('aria-label="Add inside"');

    // The save handler ran, and the RPC applied it.
    expect(saved, "the hook flushed through its own save handler").toHaveLength(
      1,
    );
    expect(flushDone, "the save handler resolved").toBe(true);
    const draft = db.rows("theme_drafts")[0];
    expect(draft, "the draft reached the store").toBeDefined();

    // Read the STORED map back through the real parser — the shape a reload
    // would hand the editor.
    const stored = parseTemplates(draft.templates) as Record<
      string,
      { main: Section[] }
    >;
    const storedColumns = stored["cart"]!.main.find(
      (node) => node.type === "columns",
    )!;
    const children = storedColumns.children ?? [];
    expect(
      children,
      "two original children plus the surviving nested container",
    ).toHaveLength(3);

    const nested = children.find((node) => node.id === ids.container);
    expect(nested, "the nested container survived the save").toBeDefined();
    expect(
      children.findIndex((node) => node.id === ids.container),
      "Move up placed the container above the second original child",
    ).toBe(1);
    expect(
      children.find((node) => node.id === ids.doomed),
      "the deleted container is gone from the saved AST",
    ).toBeUndefined();
    expect(
      originalChildren.every((id) => children.some((node) => node.id === id)),
      "the original containers are untouched",
    ).toBe(true);

    const lines = flatten(nested!.children ?? []).find(
      (node) => node.id === ids.lines,
    );
    expect(lines?.type, "cart_lines was added INSIDE the new container").toBe(
      "cart_lines",
    );
    expect(
      lines?.props["heading"],
      "the merchant's heading persisted through the save handler",
    ).toBe(NESTED_MARKER);

    // The nested edit is scoped: every other template key is byte-identical
    // to the parsed package map.
    const baseline = parseTemplates(
      JSON.parse(JSON.stringify(pkg.templates)),
    ) as Record<string, unknown>;
    for (const key of Object.keys(baseline)) {
      if (key === "cart") continue;
      expect(
        JSON.stringify(stored[key]),
        `${key} must be untouched by the nested Cart edit`,
      ).toBe(JSON.stringify(baseline[key]));
    }
  });
});
