#!/usr/bin/env node
/**
 * Frame30 DICE OS-Level Sandbox Engine (Revision 2.3 Section 7)
 * Authoritative hostile candidate execution via Linux Bubblewrap (bwrap).
 * Evaluates fail-closed BLOCKED on macOS for authoritative hostile runs.
 *
 * Inviolable Law: Minimal filesystem allowlist; host root (/), host .git, host .env,
 * /home, /root, CI tokens, signing keys, and host sockets are strictly excluded.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export class DiceSandbox {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.scratchRoot = options.scratchRoot || "/tmp/dice-scratch";
    this.bwrapPath = options.bwrapPath || this.findBwrap();
    this.bwrapVersion = this.getBwrapVersion();
  }

  findBwrap() {
    try {
      return execSync("which bwrap", { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  }

  getBwrapVersion() {
    if (!this.bwrapPath || !existsSync(this.bwrapPath)) return null;
    try {
      return execSync(`"${this.bwrapPath}" --version`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }

  resolveToolchainDirs(extraPaths = []) {
    const dirs = new Set();
    const addDir = (binPath) => {
      if (!binPath) return;
      try {
        const real = realpathSync(binPath);
        const d = dirname(real);
        if (
          !d.startsWith("/usr") &&
          !d.startsWith("/bin") &&
          !d.startsWith("/lib") &&
          !d.startsWith("/sbin")
        ) {
          dirs.add(d);
        }
      } catch {
        const d = dirname(binPath);
        if (
          !d.startsWith("/usr") &&
          !d.startsWith("/bin") &&
          !d.startsWith("/lib") &&
          !d.startsWith("/sbin")
        ) {
          dirs.add(d);
        }
      }
    };

    addDir(process.execPath);
    try {
      const bunPath = execSync("which bun", { encoding: "utf8" }).trim();
      addDir(bunPath);
    } catch {}
    try {
      const nodePath = execSync("which node", { encoding: "utf8" }).trim();
      addDir(nodePath);
    } catch {}

    for (const p of extraPaths) {
      if (p && typeof p === "string") {
        dirs.add(p);
      }
    }

    return Array.from(dirs);
  }

  validateEnvironment(isAuthoritative = true) {
    if (this.platform === "darwin") {
      if (isAuthoritative) {
        return {
          status: "BLOCKED",
          reason:
            "INVARIANT-5: macOS lacks Linux PID namespaces; authoritative hostile execution on macOS is strictly BLOCKED.",
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
        bwrapVersion: this.bwrapVersion,
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
      unsharePid = true,
      dieWithParent = true,
      newSession = true,
      command = ["/bin/true"],
      allowedBindPaths = [],
    } = options;

    if (!sourceSnapshot) {
      throw new Error("[dice-sandbox] sourceSnapshot path is required");
    }

    const args = [
      // 1. Filesystem isolation: root is an empty tmpfs (NO --ro-bind / /)
      "--tmpfs", "/",

      // 2. Explicitly allowlisted minimal host system directories
      "--ro-bind-try", "/usr", "/usr",
      "--ro-bind-try", "/lib", "/lib",
      "--ro-bind-try", "/lib64", "/lib64",
      "--ro-bind-try", "/bin", "/bin",
      "--ro-bind-try", "/sbin", "/sbin",
      "--ro-bind-try", "/etc/ssl", "/etc/ssl",
      "--ro-bind-try", "/etc/ca-certificates", "/etc/ca-certificates",
      "--ro-bind-try", "/etc/alternatives", "/etc/alternatives",

      // 3. Pseudo-filesystems
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
    ];

    // 4. Allowed toolchain binary directories outside /usr (e.g. ~/.bun/bin)
    for (const toolDir of this.resolveToolchainDirs(allowedBindPaths)) {
      args.push("--ro-bind-try", toolDir, toolDir);
    }

    // 5. Read-only candidate source
    args.push("--dir", "/workspace/src");
    args.push("--ro-bind", sourceSnapshot, "/workspace/src");

    // 6. Defense-in-depth masking within /workspace/src
    if (existsSync(join(sourceSnapshot, ".git"))) {
      args.push("--tmpfs", "/workspace/src/.git");
    }
    if (existsSync(join(sourceSnapshot, ".env"))) {
      args.push("--ro-bind-try", "/dev/null", "/workspace/src/.env");
    }

    // 7. Ephemeral scratch tmpfs
    args.push("--tmpfs", "/workspace/tmp");
    args.push("--dir", "/workspace/out");

    if (stagingDir) {
      if (!existsSync(stagingDir)) {
        try {
          mkdirSync(stagingDir, { recursive: true });
        } catch {}
      }
      args.push("--bind", stagingDir, "/workspace/out");
    } else {
      args.push("--tmpfs", "/workspace/out");
    }

    // 8. Remount root as read-only (prevents creating files outside /tmp or /workspace/out)
    args.push("--remount-ro", "/");

    // 9. Process & namespace isolation
    if (unsharePid) {
      args.push("--unshare-pid");
    }
    if (unshareNet) {
      args.push("--unshare-net");
    }
    if (dieWithParent) {
      args.push("--die-with-parent");
    }
    if (newSession) {
      args.push("--new-session");
    }

    // 10. Working directory
    args.push("--chdir", "/workspace/src");

    // 11. Environment sanitation (clears host credentials & CI tokens)
    args.push("--clearenv");
    args.push("--setenv", "PATH", process.env.PATH || "/usr/local/bin:/usr/bin:/bin");
    args.push("--setenv", "HOME", "/tmp");
    args.push("--setenv", "TMPDIR", "/tmp");
    args.push("--setenv", "NODE_ENV", process.env.NODE_ENV || "test");

    if (options.env) {
      for (const [k, v] of Object.entries(options.env)) {
        if (v !== undefined && v !== null) {
          args.push("--setenv", k, String(v));
        }
      }
    }

    // 12. Command to execute
    args.push("--", ...command);

    return args;
  }

  execute(options = {}) {
    const isAuthoritative = options.isAuthoritative !== false;
    const envCheck = this.validateEnvironment(isAuthoritative);
    if (envCheck.status === "BLOCKED") {
      return {
        verdict: "BLOCKED",
        exitCode: 126,
        stdout: "",
        stderr: envCheck.reason,
      };
    }

    if (this.platform === "darwin") {
      // Dry-run mode only on macOS
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
      timeout: options.timeoutMs || 60000,
    });

    const exitCode = result.status ?? (result.signal ? 128 + 15 : 1);
    return {
      verdict: exitCode === 0 ? "PASS" : "FAIL",
      exitCode,
      stdout: result.stdout || "",
      stderr: result.stderr || (result.error ? result.error.message : ""),
    };
  }
}
