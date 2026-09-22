// src/lib/phase2n-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync(
  "supabase/migrations/*phase2n*market_install_uninstalling.sql",
);
const sql = files.length ? readFileSync(files[0], "utf8") : "";

describe("phase2n market_install_status uninstalling DDL", () => {
  it("adds the transitional uninstalling value idempotently", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(sql).toContain("uninstalling");
    expect(sql).toContain("if not exists");
    expect(sql).toMatch(
      /alter\s+type\s+public\.market_install_status\s+add\s+value\s+if\s+not\s+exists\s+'uninstalling'/i,
    );
  });
});
