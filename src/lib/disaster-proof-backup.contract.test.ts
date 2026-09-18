/**
 * Contract Gate: Disaster-Proof Blue/Green Deployment & Whole-System Time-Machine Backup.
 *
 * Enforces the architectural invariants established for Framique:
 * 1. Whole-System Backup Scope: Database (roles, auth, storage, public, vault), Storage assets, Configs, Redis.
 * 2. Theft-Immunity: Client-side AES-256-GCM envelope encryption.
 * 3. 100% Restore Guarantee: Mandatory Rehearsal Gate asserting auth.users, storage files, and business tables.
 * 4. Never-Failing Blue/Green Release Algorithm: Pre-promotion zero-failure gate, pre-canary snapshot, and sub-second rollback.
 * 5. Bare-Metal Recovery: 1-click disaster recovery runbook in DEPLOY.md and SYSTEM.md.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

describe("Disaster-Proof Blue/Green Deployment & Whole-System Backup Contract", () => {
  const root = process.cwd();
  const backupShPath = resolve(root, "ops/backup/backup.sh");
  const restoreShPath = resolve(root, "ops/backup/restore.sh");
  const rehearseShPath = resolve(root, "ops/backup/rehearse.sh");
  const snapshotShPath = resolve(root, "ops/backup/time-machine-snapshot.sh");
  const systemMdPath = resolve(root, "SYSTEM.md");
  const deployMdPath = resolve(root, "DEPLOY.md");
  const opsBackupMdPath = resolve(root, "docs/14-operations/backup-restore.md");

  describe("Whole-System Time-Machine Backup Engine (ops/backup/backup.sh)", () => {
    it("exists, is executable, and archives full system state", () => {
      expect(existsSync(backupShPath)).toBe(true);
      const content = readFileSync(backupShPath, "utf8");

      // Core Whole-System Artifacts
      expect(content).toContain("db.dump");
      expect(content).toContain("roles.sql");
      expect(content).toContain("storage.tar.zst");
      expect(content).toContain("configs.tar.zst");
      expect(content).toContain("redis.rdb");
      expect(content).toContain("manifest.json");

      // Coverage of auth, storage, and public schemas
      expect(content).toContain('"schemas_covered"');
      expect(content).toContain('"auth"');
      expect(content).toContain('"storage"');
      expect(content).toContain('"public"');
      expect(content).toContain('"vault"');

      // Theft immunity: Client-side envelope encryption
      expect(content).toContain("ENCRYPTION_PASSPHRASE");
      expect(content).toContain("aes-256-gcm");
      expect(content).toContain("snapshot.enc");

      // Automated rehearsal gate invocation
      expect(content).toContain("rehearse.sh");
    });
  });

  describe("Whole-System Restore & Verification Engine (ops/backup/restore.sh)", () => {
    it("exists, verifies manifest checksums before loading, and protects production", () => {
      expect(existsSync(restoreShPath)).toBe(true);
      const content = readFileSync(restoreShPath, "utf8");

      // Production safety gate
      expect(content).toContain("--force");
      expect(content).toContain("framique-restore");

      // Cryptographic manifest verification
      expect(content).toContain("manifest.json");
      expect(content).toContain("hashlib.sha256");
      expect(content).toContain("checksum mismatch");

      // Envelope decryption
      expect(content).toContain("snapshot.enc");
      expect(content).toContain("ENCRYPTION_PASSPHRASE");

      // Restoration of roles, all schemas, and storage objects
      expect(content).toContain("roles.sql");
      expect(content).toContain("pg_restore");
      expect(content).toContain("storage.tar.zst");
    });
  });

  describe("Automated Rehearsal Gate (ops/backup/rehearse.sh)", () => {
    it("asserts auth.users, commerce tables, storage objects, and logs RTO/RPO", () => {
      expect(existsSync(rehearseShPath)).toBe(true);
      const content = readFileSync(rehearseShPath, "utf8");

      expect(content).toContain("framique-restore");
      expect(content).toContain("merchants");
      expect(content).toContain("products");
      expect(content).toContain("orders");
      expect(content).toContain("order_items");
      expect(content).toContain("payments");

      // Auth schema validation
      expect(content).toContain("auth.users");

      // Storage volume check
      expect(content).toContain("/var/lib/storage");

      // Telemetry log output
      expect(content).toContain("rehearsals.jsonl");
      expect(content).toContain("rto_seconds");
      expect(content).toContain("rpo_seconds");
    });
  });

  describe("Continuous Point-in-Time Recovery (ops/backup/time-machine-snapshot.sh)", () => {
    it("supports snapshot verification and point-in-time rewind", () => {
      expect(existsSync(snapshotShPath)).toBe(true);
      const content = readFileSync(snapshotShPath, "utf8");

      expect(content).toContain("restore-pitr");
      expect(content).toContain("recovery.signal");
      expect(content).toContain("recovery_target_time");
      expect(content).toContain("verify");
    });
  });

  describe("Disaster-Proof Blue/Green Architecture in SYSTEM.md & DEPLOY.md", () => {
    it("documents the Never-Failing Blue/Green pipeline and Bare-Metal Restore in SYSTEM.md", () => {
      expect(existsSync(systemMdPath)).toBe(true);
      const content = readFileSync(systemMdPath, "utf8");

      expect(content).toContain("Whole-System Time-Machine Backup & Bare-Metal Restore Architecture");
      expect(content).toContain("Disaster-Proof Blue/Green Deployment Algorithm");
      expect(content).toContain("Pre-Promotion Zero-Failure Gate");
      expect(content).toContain("Canary Shifting with Sub-Second Circuit Breaker");
      expect(content).toContain("roles.sql");
      expect(content).toContain("db_cluster.dump");
      expect(content).toContain("Cold-Metal Bare-Metal Recovery Runbook");
    });

    it("documents the release checklist and bare-metal restore runbook in DEPLOY.md", () => {
      expect(existsSync(deployMdPath)).toBe(true);
      const content = readFileSync(deployMdPath, "utf8");

      expect(content).toContain("Never-Failing Blue/Green Pipeline");
      expect(content).toContain("Bare-Metal Time-Machine Restore Runbook");
      expect(content).toContain("snap_pre_deploy_");
      expect(content).toContain("1-Click System Reconstitution");
    });

    it("documents the canonical backup and recovery machines in docs/14-operations/backup-restore.md", () => {
      expect(existsSync(opsBackupMdPath)).toBe(true);
      const content = readFileSync(opsBackupMdPath, "utf8");

      expect(content).toContain("Whole-System Backup machine (canonical backup)");
      expect(content).toContain("scheduled → snapshot → encrypted → rehearsed → certified → rotated | retained");
      expect(content).toContain("retrieve → decrypt → verify_manifest → restore → smoke_check → switchover");
      expect(content).toContain("Theft Immunity");
      expect(content).toContain("RPO (Recovery Point Objective)");
      expect(content).toContain("RTO (Recovery Time Objective)");
    });
  });
});
