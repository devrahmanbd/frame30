/**
 * BlueOcean registry gate — the installable preset must survive exactly
 * what `listRegistry` + publish do to it: `parseTokens` / `parseTemplates`
 * accept the emitted JSON, and `lintTemplate` reports zero errors on all
 * nine templates (single-H1 rule both directions, slot legality, context
 * placement, no invalid nodes). The registry migration embeds this same
 * preset JSON (generated, never hand-written) and the last test pins the
 * two together so they cannot drift.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lintTemplate,
  parseTemplates,
  parseTokens,
  TEMPLATE_KEYS,
  type ThemeAst,
} from "../../builder-ast";
import { BLUEOCEAN_PRESET } from "./preset";

describe("blueocean registry preset", () => {
  it("covers all nine template keys with header/main/footer slots", () => {
    expect(Object.keys(BLUEOCEAN_PRESET.templates).sort()).toEqual(
      [...TEMPLATE_KEYS].sort(),
    );
    for (const key of TEMPLATE_KEYS) {
      const ast = BLUEOCEAN_PRESET.templates[key]!;
      expect(
        Array.isArray(ast.header) &&
          Array.isArray(ast.main) &&
          Array.isArray(ast.footer),
        `${key} must carry all three slots`,
      ).toBe(true);
    }
  });

  it("round-trips through the server shape guards", () => {
    const tokens = parseTokens(
      JSON.parse(JSON.stringify(BLUEOCEAN_PRESET.tokens)),
    );
    expect(tokens.brand).toBe("#0A3642");
    const templates = parseTemplates(
      JSON.parse(JSON.stringify(BLUEOCEAN_PRESET.templates)),
    );
    expect(Object.keys(templates).sort()).toEqual([...TEMPLATE_KEYS].sort());
  });

  it("lints clean on every template (zero errors)", () => {
    const templates = parseTemplates(
      JSON.parse(JSON.stringify(BLUEOCEAN_PRESET.templates)),
    );
    for (const key of TEMPLATE_KEYS) {
      const issues = lintTemplate(templates[key] as ThemeAst, key);
      const errors = issues.filter((i) => i.level === "error");
      expect(errors, `${key}: ${JSON.stringify(errors)}`).toEqual([]);
    }
  });

  it("matches the registry migration preset exactly (no drift)", () => {
    const sql = readFileSync(
      "supabase/migrations/20261003120000_blueocean_registry_row.sql",
      "utf8",
    );
    expect(sql).toContain("('blueocean'");
    const start = sql.indexOf("'{") + 1;
    const end = sql.lastIndexOf("}', true, 31)") + 1;
    const embedded = JSON.parse(sql.slice(start, end).replace(/''/g, "'")) as {
      tokens: unknown;
      templates: unknown;
    };
    const live = {
      tokens: parseTokens(JSON.parse(JSON.stringify(BLUEOCEAN_PRESET.tokens))),
      templates: parseTemplates(
        JSON.parse(JSON.stringify(BLUEOCEAN_PRESET.templates)),
      ),
    };
    expect(embedded).toEqual(live);
  });
});
