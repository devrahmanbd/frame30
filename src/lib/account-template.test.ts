/**
 * Account theme template key (Task 1 — template plumbing only).
 *
 * The `account` template is a first-class theme part, mirroring `collection`:
 * key known, empty template parses, lints clean. Catalogue widget entries,
 * preset bodies, and routes are owned by parallel tracks — not asserted here.
 */
import { describe, expect, it } from "vitest";
import { defaultAccountAst } from "./default-account-ast";
import {
  EMPTY_AST,
  TEMPLATE_KEYS,
  lintTemplate,
  parseTemplates,
  routeSuppliesH1,
  type TemplateKey,
} from "./builder-ast";

describe("account template key", () => {
  it("is a known template key alongside collection", () => {
    expect(TEMPLATE_KEYS).toContain("account");
    const key: TemplateKey = "account";
    expect(key).toBe("account");
  });

  it("keeps an empty account template through parsing", () => {
    const parsed = parseTemplates({ account: EMPTY_AST });
    expect(parsed.account).toBeDefined();
    expect(parsed.account).toEqual(EMPTY_AST);
  });

  it("lints a main-slot account template clean", () => {
    const parsed = parseTemplates({
      account: { header: [], main: [], footer: [] },
    });
    expect(parsed.account).toBeDefined();
    expect(parsed.account!.header).toHaveLength(0);
    expect(parsed.account!.footer).toHaveLength(0);
    expect(routeSuppliesH1("account")).toBe(true);
    expect(lintTemplate(parsed.account!, "account")).toEqual([]);
  });

  it("ships a default account AST with orders + profile", () => {
    const ast = defaultAccountAst();
    const types = ast.main.map((s) => s.type);
    expect(types).toContain("orders_list");
    expect(types).toContain("profile_card");
    expect(lintTemplate(ast, "account")).toEqual([]);
  });
});
