import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  getTimeMachineDaemonStatus,
  executeWalSync,
  createTimeMachineBasebackup,
  pruneTimeMachineSnapshots,
  runDisasterRecoveryDrill,
} from "./time-machine-daemon.server";

describe("Phase 11.4 — Time-Machine Continuous Archiving Daemon & Disaster Recovery Engine", () => {
  const testBackupDir = resolve(process.cwd(), ".framique/test_backups_p11_4");

  beforeEach(() => {
    rmSync(testBackupDir, { recursive: true, force: true });
    mkdirSync(testBackupDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testBackupDir, { recursive: true, force: true });
  });

  it("reports accurate daemon status when stopped and with zero backups", async () => {
    const status = await getTimeMachineDaemonStatus(testBackupDir);

    expect(status.isRunning).toBe(false);
    expect(status.backupBaseDir).toBe(testBackupDir);
    expect(status.totalSnapshots).toBe(0);
  });

  it("replicates Write-Ahead Log (WAL) segments to secondary durable mirror every 60 seconds", async () => {
    const segments = [
      "000000010000000000000001",
      "000000010000000000000002",
      "000000010000000000000003",
    ];

    const result = await executeWalSync({
      backupBaseDir: testBackupDir,
      simulatedSegments: segments,
    });

    expect(result.syncedCount).toBe(3);

    // Verify segments exist in mirror
    const mirrorDir = resolve(testBackupDir, "remote_wal_mirror");
    expect(existsSync(resolve(mirrorDir, "000000010000000000000001"))).toBe(true);
    expect(existsSync(resolve(mirrorDir, "000000010000000000000002"))).toBe(true);
    expect(existsSync(resolve(mirrorDir, "000000010000000000000003"))).toBe(true);

    const status = await getTimeMachineDaemonStatus(testBackupDir);
    expect(status.lastWalSyncAt).toBeDefined();
  });

  it("creates automated basebackup snapshots with Point-In-Time-Recovery (PITR) metadata and table checksums", async () => {
    const manifest = await createTimeMachineBasebackup({
      backupBaseDir: testBackupDir,
      tag: "snap_hourly_20260910_050000",
    });

    expect(manifest.snapshotTag).toBe("snap_hourly_20260910_050000");
    expect(manifest.rpoSeconds).toBe(0);
    expect(manifest.rtoMinutes).toBeLessThanOrEqual(15);
    expect(manifest.tablesChecksum.merchants).toContain("sha256:");
    expect(manifest.tablesChecksum.orders).toContain("sha256:");
    expect(manifest.tablesChecksum.aiTrainingConversations).toContain("sha256:");

    const status = await getTimeMachineDaemonStatus(testBackupDir);
    expect(status.totalSnapshots).toBe(1);
    expect(status.lastSnapshotTag).toBe("snap_hourly_20260910_050000");
  });

  it("enforces Grandfather-Father-Son retention policy (keeps 24 hourly, 7 daily, 4 weekly = 35 max)", async () => {
    // Generate 40 simulated snapshots
    for (let i = 1; i <= 40; i++) {
      const pad = String(i).padStart(3, "0");
      await createTimeMachineBasebackup({
        backupBaseDir: testBackupDir,
        tag: `snap_hourly_20260910_${pad}`,
      });
    }

    const beforePrune = await getTimeMachineDaemonStatus(testBackupDir);
    expect(beforePrune.totalSnapshots).toBe(40);

    // Prune retention window (max 35 retained: 24 hourly + 7 daily + 4 weekly)
    const pruneResult = await pruneTimeMachineSnapshots({
      backupBaseDir: testBackupDir,
      maxRetained: 35,
    });

    expect(pruneResult.totalFound).toBe(40);
    expect(pruneResult.retainedCount).toBe(35);
    expect(pruneResult.prunedCount).toBe(5);
    expect(pruneResult.prunedTags).toHaveLength(5);

    const afterPrune = await getTimeMachineDaemonStatus(testBackupDir);
    expect(afterPrune.totalSnapshots).toBe(35);
  });

  it("executes automated Disaster Recovery Drill asserting simulated disk corruption restores with RPO = 0 and RTO < 15m", async () => {
    // 1. Seed basebackup and WAL segments
    await createTimeMachineBasebackup({
      backupBaseDir: testBackupDir,
      tag: "snap_drill_candidate",
    });
    await executeWalSync({
      backupBaseDir: testBackupDir,
      simulatedSegments: ["00000001000000000000000A"],
    });

    // 2. Run automated DR drill
    const drillReport = await runDisasterRecoveryDrill({
      backupBaseDir: testBackupDir,
      targetTimestamp: "2026-09-10T05:25:00Z",
    });

    expect(drillReport.status).toBe("PASSED");
    expect(drillReport.rpoSeconds).toBe(0); // Zero uncommitted data loss
    expect(drillReport.rtoSlaMet).toBe(true); // RTO < 15 minutes
    expect(drillReport.mlDataImmunityShieldIntact).toBe(true); // ML tables intact
    expect(drillReport.recoveryTargetReached).toBe(true);
    expect(drillReport.tableChecksums.merchants).toBeDefined();
    expect(drillReport.tableChecksums.orders).toBeDefined();
    expect(drillReport.tableChecksums.aiTrainingConversations).toBeDefined();

    const status = await getTimeMachineDaemonStatus(testBackupDir);
    expect(status.lastDrDrillPassed).toBe(true);
  });

  it("verifies shell daemon script ops/backup/time-machine-daemon.sh executes commands cleanly", () => {
    const scriptPath = resolve(process.cwd(), "ops/backup/time-machine-daemon.sh");
    expect(existsSync(scriptPath)).toBe(true);

    // Test status command
    const output = execSync(`BACKUP_DIR="${testBackupDir}" bash ${scriptPath} status`, {
      encoding: "utf8",
    });
    expect(output).toContain("Framique Time-Machine Continuous Backup Status");
    expect(output).toContain(testBackupDir);

    // Test create-basebackup command
    const backupOut = execSync(`BACKUP_DIR="${testBackupDir}" bash ${scriptPath} create-basebackup 2>&1`, {
      encoding: "utf8",
    });
    expect(backupOut).toContain("Basebackup snapshot created successfully");

    // Test dr-drill command
    const drillOut = execSync(`BACKUP_DIR="${testBackupDir}" bash ${scriptPath} dr-drill 2>&1`, {
      encoding: "utf8",
    });
    expect(drillOut).toContain("DR Drill SUCCESSFUL");
    expect(drillOut).toContain("RPO = 0");
  });

  it("verifies production deployment manifests (Systemd service & Kubernetes sidecar)", () => {
    const systemdPath = resolve(process.cwd(), "ops/backup/systemd/time-machine-daemon.service");
    const k8sPath = resolve(process.cwd(), "ops/backup/k8s/time-machine-sidecar.yaml");

    expect(existsSync(systemdPath)).toBe(true);
    expect(existsSync(k8sPath)).toBe(true);

    const systemdContent = readFileSync(systemdPath, "utf8");
    expect(systemdContent).toContain("ExecStart=/opt/framique/ops/backup/time-machine-daemon.sh run-daemon");
    expect(systemdContent).toContain("Environment=WAL_SYNC_INTERVAL_SEC=60");
    expect(systemdContent).toContain("Environment=BASEBACKUP_INTERVAL_SEC=3600");

    const k8sContent = readFileSync(k8sPath, "utf8");
    expect(k8sContent).toContain("name: time-machine-archiver");
    expect(k8sContent).toContain('command: ["/bin/bash", "/scripts/time-machine-daemon.sh", "run-daemon"]');
    expect(k8sContent).toContain("name: WAL_SYNC_INTERVAL_SEC");
  });
});
