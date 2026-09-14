/**
 * Phase 10 guardrails. These assert the self-hosted stack keeps the properties
 * that make it safe to run: pinned images, a database that is not reachable
 * from outside the compose network, rate limits on the public gateway routes,
 * and a migration/backup/restore path that actually exists on disk.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("self-hosted Supabase compose", () => {
  const compose = read("supabase/docker/docker-compose.yml");

  it("pins every image tag", () => {
    const images = [...compose.matchAll(/^\s*image:\s*(\S+)$/gm)].map((m) => m[1]!);
    expect(images.length).toBeGreaterThan(5);
    for (const image of images) {
      expect(image, `${image} must be pinned`).toMatch(/:[^:\s]+$/);
      expect(image).not.toMatch(/:latest$/);
    }
  });

  it("never publishes Postgres to the host", () => {
    const db = compose.slice(compose.indexOf("\n  db:"), compose.indexOf("\n  auth:"));
    expect(db).toContain('expose: ["5432"]');
    expect(db).not.toMatch(/ports:/);
  });

  it("binds the gateway to loopback only", () => {
    expect(compose).toMatch(/ports:\s*\["127\.0\.0\.1:8000:8000"\]/);
  });
});

describe("gateway policy", () => {
  const kong = read("supabase/docker/kong.yml");

  it("rate limits the public routes", () => {
    for (const service of ["auth-v1-open", "rest-v1", "storage-v1"]) {
      const start = kong.indexOf(`- name: ${service}`);
      expect(start, service).toBeGreaterThan(-1);
      const block = kong.slice(start, start + 900);
      expect(block, `${service} needs a rate limit`).toContain("name: rate-limiting");
    }
  });

  it("keeps service_role admin-only and never anon", () => {
    expect(kong).toContain("- consumer: service_role\n    group: admin");
    expect(kong).not.toContain("- consumer: service_role\n    group: anon");
  });
});

describe("operational scripts", () => {
  const executable = (p: string) => {
    expect(existsSync(p), `${p} missing`).toBe(true);
    return (statSync(p).mode & 0o111) !== 0;
  };

  it("ships migrate, backup, restore and rehearsal", () => {
    for (const p of ["ops/backup/backup.sh", "ops/backup/restore.sh", "ops/backup/rehearse.sh"]) {
      expect(executable(p), `${p} must be executable`).toBe(true);
    }
    expect(existsSync("scripts/db-migrate.mjs")).toBe(true);
  });

  it("refuses a restore into a non-rehearsal project without --force", () => {
    expect(read("ops/backup/restore.sh")).toContain('!= *restore*');
  });

  it("verifies backup checksums before restoring", () => {
    expect(read("ops/backup/restore.sh")).toContain("checksum mismatch");
  });

  it("records a measured RTO and RPO per rehearsal", () => {
    const drill = read("ops/backup/rehearse.sh");
    expect(drill).toContain("rto_seconds");
    expect(drill).toContain("rpo_seconds");
    expect(drill).toContain("rehearsals.jsonl");
  });

  it("keeps the migration runner idempotent and drift-aware", () => {
    const runner = read("scripts/db-migrate.mjs");
    expect(runner).toContain("schema_migration_files");
    expect(runner).toContain("applied migrations were edited after the fact");
  });
});
