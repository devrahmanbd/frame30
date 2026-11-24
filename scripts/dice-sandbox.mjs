#!/usr/bin/env node
/**
 * Frame30 DICE OS-Level Sandbox Engine (Revision 2.3 Section 7)
 * Authoritative hostile candidate execution via Linux Bubblewrap (bwrap).
 * Evaluates fail-closed BLOCKED on macOS for authoritative hostile runs.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export class DiceSandbox {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.scratchRoot = options.scratchRoot || "/tmp/dice-scratch";
    this.bwrapPath = options.bwrapPath || this.findBwrap();
  }

  findBwrap() {
    try {
      return execSync("which bwrap", { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  }

  validateEnvironment(isAuthoritative = true) {
    if (this.platform === "darwin") {
      if (isAuthoritative) {
        return {
          status: "BLOCKED",
          reason: "INVARIANT-5: macOS lacks Linux PID namespaces; authoritative hostile execution on macOS is strictly BLOCKED.",
        };
      }
      return {
        status: "DRY_RUN_PERMITTED",
        platform: "darwin",
      };
    }

    if (this.platform === "linux") {
      if (!this.bwrapPath || !existsSync(this.bwrapPath)) {
        return {
          status: "BLOCKED",
          reason: "FAIL-CLOSED: Bubblewrap (bwrap) binary not found on Linux host.",
        };
      }
      return {
        status: "READY",
        platform: "linux",
        bwrapPath: this.bwrapPath,
      };
    }

    return {
      status: "BLOCKED",
      reason: `FAIL-CLOSED: Unsupported platform: ${this.platform}`,
    };
  }

  buildBwrapArgs(options = {}) {
    const {
      sourceSnapshot,
      scratchDir,
      stagingDir,
      unshareNet = true,
      command = ["/bin/true"],
    } = options;

    if (!sourceSnapshot) {
      throw new Error("[dice-sandbox] sourceSnapshot path is required");
    }

    const args = [
      // 1. Filesystem isolation: read-only root and system binaries
      "--ro-bind", "/", "/",
      "--dev", "/dev",
      "--proc", "/proc",
      // 2. Read-only candidate source
      "--ro-bind", sourceSnapshot, "/workspace/src",
      // 3. Ephemeral scratch tmpfs
      "--tmpfs", "/workspace/tmp",
      "--dir", "/workspace/out",
    ];

    if (stagingDir) {
      args.push("--bind", stagingDir, "/workspace/out");
    }

    // 4. Strict isolation: unshare PID namespace (PID 1 reaper)
    args.push("--unshare-pid");

    // 5. Unshare network if requested
    if (unshareNet) {
      args.push("--unshare-net");
    }

    // 6. Security boundaries: drop capabilities, die with parent
    args.push("--die-with-parent");
    args.push("--chdir", "/workspace/src");

    // Command to execute
    args.push("--", ...command);

    return args;
  }

  execute(options = {}) {
    const envCheck = this.validateEnvironment(options.isAuthoritative !== false);
    if (envCheck.status === "BLOCKED") {
      return {
        verdict: "BLOCKED",
        exitCode: 126,
        stdout: "",
        stderr: envCheck.reason,
      };
    }

    if (this.platform === "darwin") {
      // Dry-run mode only
      return {
        verdict: "DRY_RUN",
        exitCode: 0,
        stdout: "[dice-sandbox] macOS dry-run execution completed without containment.",
        stderr: "",
      };
    }

    // Linux execution via bwrap
    const bwrapArgs = this.buildBwrapArgs(options);
    const result = spawnSync(this.bwrapPath, bwrapArgs, {
      encoding: "utf8",
      timeout: options.timeoutMs || 30000,
    });

    return {
      verdict: result.status === 0 ? "PASS" : "FAIL",
      exitCode: result.status ?? 1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  }
}
