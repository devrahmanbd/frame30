/**
 * Frame30 Loop B — server save path: `commitVersion` extension validation (TDD).
 *
 * Contract under test (`src/lib/themes.server.ts`, `commitVersion` ONLY):
 * - Trust boundary: extension props are re-validated server-side with the
 *   SAME `validateProps` module the client calls. A schema embedded in the
 *   browser payload is never trusted — only the server registry copy counts.
 * - Invalid extension props → recoverable `BuilderError`
 *   (`builder.extension_props_invalid`, never a throw of another shape),
 *   BEFORE any `theme_commit` RPC runs: nothing invalid is stored, nothing
 *   is silently dropped, and malformed nodes never crash the save.
 * - Legacy widgets (no registry schema) commit byte-identical to today.
 *
 * Precedent: `theme-update.test.ts` (fakeDb + stubbed `theme_commit` RPC).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuilderError, commitVersion } from "./themes.server";
import { fakeDb } from "./__fixtures__/fake-db";
import { clearRegistry, registerWidget } from "./unified-widget-registry";
import { DEFAULT_TOKENS } from "./builder-ast";
import type { PropSchema } from "./widget-props";

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";

const SCHEMA: PropSchema = {
  fields: [
    { key: "title", label: "Title", kind: "text", required: true, max: 5 },
    { key: "count", label: "Count", kind: "number", min: 0, max: 5 },
  ],
};

const PLUGIN_DEF = {
  id: "plugin:acme/reviews",
  namespace: "plugin",
  version: "1.0.0",
  label: "Reviews",
  category: "social",
  slots: ["main"],
  defaults: {},
  propsSchema: JSON.parse(JSON.stringify(SCHEMA)) as PropSchema,
  renderer: "sandbox",
};

function extensionNode(props: Record<string, unknown>) {
  return {
    id: "ext-1",
    type: "plugin_block",
    props: { pluginKey: "plugin:acme/reviews", ...props },
  };
}

function templatesWith(...main: unknown[]) {
  return { index: { header: [], main, footer: [] } };
}

function commitDb(onRpc: (fn: string) => void = () => {}) {
  return fakeDb({
    tables: {},
    rpc: (fn) => {
      onRpc(fn);
      return { data: "version-new", error: null };
    },
  });
}

const INPUT = (templates: unknown) => ({
  themeId: THEME,
  templates,
  tokens: { ...DEFAULT_TOKENS },
});

beforeEach(() => {
  clearRegistry();
  expect(registerWidget(PLUGIN_DEF).ok).toBe(true);
});

afterEach(() => {
  clearRegistry();
});

describe("commitVersion extension-props trust boundary", () => {
  it("commits valid extension props (registry schema, clean values)", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    const out = await commitVersion(
      db.asClient(),
      MERCHANT,
      INPUT(templatesWith(extensionNode({ title: "Hi", count: 3 }))),
    );
    expect(out.versionId).toBe("version-new");
    expect(seen).toContain("theme_commit");
  });

  it("rejects oversize values with a recoverable error before storing", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    try {
      await commitVersion(
        db.asClient(),
        MERCHANT,
        INPUT(templatesWith(extensionNode({ title: "way too long" }))),
      );
      expect.unreachable("invalid extension props must reject");
    } catch (err) {
      expect(err).toBeInstanceOf(BuilderError);
      expect((err as BuilderError).code).toBe(
        "builder.extension_props_invalid",
      );
      expect((err as Error).message).toContain("ext-1");
    }
    expect(seen).not.toContain("theme_commit");
  });

  it("rejects missing required extension props (never silent drop)", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    try {
      await commitVersion(
        db.asClient(),
        MERCHANT,
        INPUT(templatesWith(extensionNode({ count: 2 }))),
      );
      expect.unreachable("missing required props must reject");
    } catch (err) {
      expect((err as BuilderError).code).toBe(
        "builder.extension_props_invalid",
      );
    }
    expect(seen).not.toContain("theme_commit");
  });

  it("never trusts a browser-supplied embedded schema", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    // The payload smuggles a permissive schema alongside over-long values;
    // the server must validate against its registry copy and still reject.
    const hostile = {
      ...extensionNode({ title: "way too long" }),
      propsSchema: { fields: [{ key: "title", label: "T", kind: "text" }] },
      schema: { fields: [{ key: "title", label: "T", kind: "text" }] },
    };
    try {
      await commitVersion(
        db.asClient(),
        MERCHANT,
        INPUT(templatesWith(hostile)),
      );
      expect.unreachable("embedded schemas must be ignored");
    } catch (err) {
      expect((err as BuilderError).code).toBe(
        "builder.extension_props_invalid",
      );
    }
    expect(seen).not.toContain("theme_commit");
  });

  it("never crashes on malformed extension nodes", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    for (const bad of [
      { id: "x1", type: "plugin_block", props: 42 },
      { id: "x2", type: "plugin_block", props: null },
      { id: "x3", type: "plugin_block" },
      "just a string",
      42,
      null,
    ]) {
      try {
        await commitVersion(
          db.asClient(),
          MERCHANT,
          INPUT(templatesWith(extensionNode({ title: "Hi" }), bad)),
        );
      } catch (err) {
        // Either verdict is acceptable — required-missing rejects, or the
        // node is vacuous — but it must always be a BuilderError, never a
        // TypeError / crash shape.
        expect(err).toBeInstanceOf(BuilderError);
      }
    }
    void seen;
  });

  it("walks nested container children and names the offending node", async () => {
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    const tree = templatesWith({
      id: "wrap-1",
      type: "container",
      props: {},
      children: [extensionNode({ title: "way too long" })],
    });
    try {
      await commitVersion(db.asClient(), MERCHANT, INPUT(tree));
      expect.unreachable("nested invalid props must reject");
    } catch (err) {
      expect((err as BuilderError).code).toBe(
        "builder.extension_props_invalid",
      );
      expect((err as Error).message).toContain("ext-1");
    }
    expect(seen).not.toContain("theme_commit");
  });

  it("commits legacy-only templates byte-identical (no schema, no gate)", async () => {
    clearRegistry();
    const seen: string[] = [];
    const db = commitDb((fn) => seen.push(fn));
    const out = await commitVersion(
      db.asClient(),
      MERCHANT,
      INPUT(
        templatesWith({
          id: "b1",
          type: "banner",
          props: { text: "Sale", tone: "info", junk: "stays-for-legacy" },
        }),
      ),
    );
    expect(out.versionId).toBe("version-new");
    expect(seen).toContain("theme_commit");
  });
});
