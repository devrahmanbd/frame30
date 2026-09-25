/**
 * Sandbox settings bridge — TDD: the host answers `plugin.settings` with the
 * merchant-validated values for exactly the plugin mounted in the frame.
 * Everything else still flows to the host `onCall`, and every denial shape
 * from `authorizeWidgetCall` is preserved.
 */
import { describe, expect, it } from "vitest";
import { answerWidgetCall } from "./WidgetSandbox";

const SETTINGS = {
  phone_number: "8801712345678",
  greeting_message: "Hello!",
  button_position: "bottom-right",
};

const msg = (method: string, params?: unknown) => ({
  v: 1,
  id: "7",
  method,
  params,
});

describe("answerWidgetCall", () => {
  it("serves validated settings for plugin.settings with render_storefront", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: SETTINGS,
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("must not delegate settings");
      },
    });
    expect(out).toEqual({ result: SETTINGS });
  });

  it("denies plugin.settings without the scope, even when values exist", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: SETTINGS,
      granted: ["read_orders"],
      onCall: async () => ({ ok: true }),
    });
    expect(out).toEqual({ error: "sandbox.scope_denied" });
  });

  it("delegates non-settings methods to onCall after authorization", async () => {
    const out = await answerWidgetCall(msg("shop.info", { fields: ["name"] }), {
      settings: SETTINGS,
      granted: ["read_shop", "render_storefront"],
      onCall: async (method, params) => ({ method, params }),
    });
    expect(out).toEqual({
      result: { method: "shop.info", params: { fields: ["name"] } },
    });
  });

  it("rejects unknown methods without calling onCall", async () => {
    let called = false;
    const out = await answerWidgetCall(msg("shop.delete"), {
      settings: SETTINGS,
      granted: ["render_storefront", "read_shop"],
      onCall: async () => {
        called = true;
        return {};
      },
    });
    expect(out).toEqual({ error: "sandbox.unknown_method" });
    expect(called).toBe(false);
  });

  it("returns empty settings object when the plugin stored none", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: undefined,
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("must not delegate settings");
      },
    });
    expect(out).toEqual({ result: {} });
  });
});
