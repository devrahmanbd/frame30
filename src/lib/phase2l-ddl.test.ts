// src/lib/phase2l-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("supabase/migrations/*phase2l*plugin_state_suspend.sql");
const sql = files.length ? readFileSync(files[0], "utf8") : "";

describe("phase2l plugin_state suspend/consent DDL", () => {
  it("adds the six spec columns idempotently", () => {
    for (const col of [
      "suspended",
      "suspended_reason",
      "suspended_at",
      "version_pin",
      "consented_by",
      "manifest_version",
    ]) {
      expect(sql).toContain(col);
      expect(sql).toContain("if not exists");
    }
  });
  it("keeps suspend defaulted false so existing rows stay active", () => {
    expect(sql).toMatch(/suspended\s+boolean\s+not\s+null\s+default\s+false/i);
  });
});
