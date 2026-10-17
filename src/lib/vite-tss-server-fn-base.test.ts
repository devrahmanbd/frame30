import { describe, expect, it } from "vitest";
import {
  rewriteTssServerFnBase,
  TSS_SERVER_FN_BASE_KEY,
} from "./vite-tss-server-fn-base";

/**
 * Dev-only workaround for an upstream TanStack Start bug.
 *
 * `createClientRpc` (in `@tanstack/start-client-core`) reads
 * `process.env.TSS_SERVER_FN_BASE` when a server-fn stub module initializes.
 * The Start plugin emits that key through Vite's `define`, but Vite does not
 * apply `define` to raw-served `optimizeDeps`-excluded framework files in
 * dev — the bare `process.env` reference reaches the browser and crashes any
 * module that builds a server-fn stub before something else defines
 * `process` (`ReferenceError: process is not defined`, import-order
 * dependent). Production builds replace the literal; this rewrite covers dev
 * with the exact value the Start plugin resolved.
 */

// Machine-neutral root: the id only needs to carry the framework module
// path (the transform matches by marker), not this box's checkout path.
const CLIENT_RPC_ID =
  "/repo/node_modules/@tanstack/start-client-core/dist/esm/client-rpc/createClientRpc.js";

const BARE_CODE =
  "function createClientRpc(functionId) {\n" +
  "\tconst url = process.env.TSS_SERVER_FN_BASE + functionId;\n" +
  "}\n";

describe("rewriteTssServerFnBase", () => {
  it("replaces the bare define key in the framework client file with the resolved literal", () => {
    const out = rewriteTssServerFnBase(
      BARE_CODE,
      CLIENT_RPC_ID,
      { ssr: false },
      '"/_serverFn/"',
    );
    expect(out).toBe(
      "function createClientRpc(functionId) {\n" +
        '\tconst url = "/_serverFn/" + functionId;\n' +
        "}\n",
    );
  });

  it("respects a custom resolved base value without interpreting $-patterns", () => {
    const out = rewriteTssServerFnBase(
      BARE_CODE,
      CLIENT_RPC_ID,
      { ssr: false },
      '"$&custom-base"',
    );
    expect(out).toBe(
      "function createClientRpc(functionId) {\n" +
        '\tconst url = "$&custom-base" + functionId;\n' +
        "}\n",
    );
  });

  it("leaves non-framework modules untouched", () => {
    expect(
      rewriteTssServerFnBase(
        BARE_CODE,
        "/repo/src/lib/editor/editor.functions.ts",
        { ssr: false },
        '"/_serverFn/"',
      ),
    ).toBeNull();
  });

  it("leaves SSR transforms untouched (the server runtime has a real process.env)", () => {
    expect(
      rewriteTssServerFnBase(
        BARE_CODE,
        CLIENT_RPC_ID,
        { ssr: true },
        '"/_serverFn/"',
      ),
    ).toBeNull();
  });

  it("does nothing when the define value is not a resolved string", () => {
    expect(
      rewriteTssServerFnBase(BARE_CODE, CLIENT_RPC_ID, { ssr: false }, null),
    ).toBeNull();
  });

  it("does nothing when the module does not reference the key", () => {
    expect(
      rewriteTssServerFnBase(
        "export const x = 1;\n",
        CLIENT_RPC_ID,
        { ssr: false },
        '"/_serverFn/"',
      ),
    ).toBeNull();
  });

  it("keeps the key constant exact so the rewrite cannot drift from the plugin define", () => {
    expect(TSS_SERVER_FN_BASE_KEY).toBe("process.env.TSS_SERVER_FN_BASE");
  });
});
