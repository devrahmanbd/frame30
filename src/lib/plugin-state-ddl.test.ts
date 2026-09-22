// src/lib/plugin-state-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
const files = globSync("supabase/migrations/*phase2j*plugin_state_ddl.sql");
const sql = files.length ? readFileSync(files[0], "utf8") : "";
describe("phase2j plugin_state DDL", () => {
  it("creates plugin_state with the code-used columns", () => {
    for (const col of ["merchant_id", "plugin_id", "manifest", "scopes", "settings", "enabled", "auto_updates", "updated_at"])
      expect(sql).toContain(col);
  });
  it("enables RLS with tenant policies and grants", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toContain("is_merchant_member");
  });
  it("adds the purged enum value", () => {
    expect(sql).toContain("'purged'");
  });
});
