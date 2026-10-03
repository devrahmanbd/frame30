/**
 * Sandbox settings bridge — TDD: the host answers `plugin.settings` with the
 * merchant-validated values for exactly the plugin mounted in the frame.
 * Everything else still flows to the host `onCall`, and every denial shape
 * from `authorizeWidgetCall` is preserved.
 */
import { describe, expect, it } from "vitest";
import {
  answerWidgetCall,
  isMenusListCall,
  menusListSlot,
} from "./WidgetSandbox";

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

describe("menus.list bridge — TRACK M fill points", () => {
  const rows = [{ id: "m1", label: "Women", href: "/c/women" }];

  it("serves host rows to plugins granted read_menus", async () => {
    let seen: unknown;
    const out = await answerWidgetCall(
      msg("menus.list", { slot: "menu_bar" }),
      {
        granted: ["read_menus", "render_storefront"],
        onCall: async (method, params) => {
          seen = { method, params };
          return rows;
        },
      },
    );
    expect(out).toEqual({ result: rows });
    expect(seen).toEqual({
      method: "menus.list",
      params: { slot: "menu_bar" },
    });
  });

  it("stays readable by default for storefront plugins without read_menus", async () => {
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => rows,
    });
    expect(out).toEqual({ result: rows });
  });

  it("denies menus.list with no storefront grant at all", async () => {
    let called = false;
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["read_orders"],
      onCall: async () => {
        called = true;
        return rows;
      },
    });
    expect(out).toEqual({ error: "sandbox.scope_denied" });
    expect(called).toBe(false);
  });

  it("rejects an unsanctioned fill point without calling the host", async () => {
    let called = false;
    const out = await answerWidgetCall(
      msg("menus.list", { slot: "sidebar" }),
      {
        granted: ["read_menus", "render_storefront"],
        onCall: async () => {
          called = true;
          return rows;
        },
      },
    );
    expect(out).toEqual({ error: "sandbox.unknown_slot" });
    expect(called).toBe(false);
  });

  it("accepts every sanctioned fill point and slot-less reads", async () => {
    for (const slot of ["menu_bar", "menu_dropdown", "menu_drawer", undefined]) {
      const out = await answerWidgetCall(
        msg(
          "menus.list",
          slot === undefined ? undefined : { slot },
        ),
        {
          granted: ["render_storefront"],
          onCall: async () => rows,
        },
      );
      expect(out, String(slot)).toEqual({ result: rows });
    }
  });

  it("maps host failures to sandbox.host_error without leaking", async () => {
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("db down");
      },
    });
    expect(out).toEqual({ error: "db down" });
    const bare = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => {
        throw "string-failure";
      },
    });
    expect(bare).toEqual({ error: "sandbox.host_error" });
  });

  it("classifies envelopes and slot params without touching scopes", () => {
    expect(isMenusListCall(msg("menus.list"))).toBe(true);
    expect(isMenusListCall(msg("shop.info"))).toBe(false);
    expect(isMenusListCall({ method: "menus.list" })).toBe(false);
    expect(menusListSlot(msg("menus.list", { slot: "menu_drawer" }))).toBe(
      "menu_drawer",
    );
    expect(menusListSlot(msg("menus.list"))).toBeUndefined();
    expect(menusListSlot(msg("menus.list", "junk"))).toBeUndefined();
  });
});
