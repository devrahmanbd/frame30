// src/lib/phase2m-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync(
  "supabase/migrations/*phase2m*marketplace_install_consent.sql",
);
const sql = files.length ? readFileSync(files[0], "utf8") : "";

describe("phase2m marketplace_installs consent DDL", () => {
  it("adds granted_scopes + consented_by idempotently", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const col of ["granted_scopes", "consented_by"]) {
      expect(sql).toContain(col);
      expect(sql).toContain("if not exists");
    }
  });
  it("mirrors the plugin_state scopes type for vault read-path consistency", () => {
    expect(sql).toMatch(/granted_scopes\s+text\[\]/i);
  });
});
