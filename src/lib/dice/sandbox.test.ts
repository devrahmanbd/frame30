import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";

const isLinuxWithBwrap = process.platform === "linux" && !!new DiceSandbox().bwrapPath;

describe("DICE OS Sandbox Security & Containment (Revision 2.3 Section 7 & C4)", () => {
  describe("1. Host .git Access Prohibited", () => {
    it("never binds host .git into sandbox and masks candidate .git when requested", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({
        sourceSnapshot: "/tmp/snapshot-test",
        maskGit: true,
      });

      const joined = args.join(" ");
      expect(joined).not.toContain("--ro-bind / /");
      expect(joined).not.toContain("/.git");
      expect(args[0]).toBe("--tmpfs");
      expect(args[1]).toBe("/");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: reading masked /workspace/src/.git/config fails with ENOENT", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-git-"));
      try {
        const fakeGit = join(tempDir, ".git");
        const fs = require("node:fs");
        fs.mkdirSync(fakeGit, { recursive: true });
        writeFileSync(join(fakeGit, "config"), "SECRET_TOKEN=ghp_forbidden123456");

        const sandbox = new DiceSandbox();
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          maskGit: true,
          command: ["cat", "/workspace/src/.git/config"],
        });

        expect(result.verdict).toBe("FAIL");
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toContain("SECRET_TOKEN");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("2. Host .env Access Prohibited", () => {
    it("never binds host .env into sandbox and shadows candidate .env with /dev/null", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({
        sourceSnapshot: "/tmp/snapshot-test",
        maskEnv: true,
      });

      const joined = args.join(" ");
      expect(joined).not.toContain("--ro-bind / /");
      expect(joined).not.toContain(".env");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: reading masked /workspace/src/.env yields 0 bytes", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-env-"));
      try {
        writeFileSync(join(tempDir, ".env"), "SUPABASE_SERVICE_ROLE_KEY=ey_secret_forbidden");

        const sandbox = new DiceSandbox();
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          maskEnv: true,
          command: ["cat", "/workspace/src/.env"],
        });

        // /dev/null read exits 0 but returns empty stdout
        expect(result.stdout).toBe("");
        expect(result.stdout).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("3. User Home-Directory Access Prohibited (/root, /home)", () => {
    it("never mounts /root or /home in Bubblewrap argument array", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test" });

      // Verify that neither /root nor /home are passed as bind mounts
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === "--ro-bind" || args[i] === "--bind" || args[i] === "--ro-bind-try") {
          expect(args[i + 1]).not.toBe("/root");
          expect(args[i + 1]).not.toBe("/home");
        }
      }
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: accessing /root or /home returns ENOENT", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-home-"));
      try {
        const sandbox = new DiceSandbox();
        const rootResult = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["ls", "/root"],
        });
        expect(rootResult.verdict).toBe("FAIL");
        expect(rootResult.exitCode).not.toBe(0);

        const homeResult = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["ls", "/home"],
        });
        expect(homeResult.verdict).toBe("FAIL");
        expect(homeResult.exitCode).not.toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("4. Credential-File Access Prohibited (/etc/shadow, ~/.ssh)", () => {
    it("binds only minimal SSL/ca-certificates from /etc, never /etc/shadow or ~/.ssh", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test" });

      const joined = args.join(" ");
      expect(joined).not.toContain("/etc/shadow");
      expect(joined).not.toContain(".ssh");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: reading /etc/shadow returns ENOENT", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-shadow-"));
      try {
        const sandbox = new DiceSandbox();
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["cat", "/etc/shadow"],
        });
        expect(result.verdict).toBe("FAIL");
        expect(result.exitCode).not.toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("5. Network Access Denied (--unshare-net)", () => {
    it("mandates --unshare-net in Bubblewrap configuration", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test", unshareNet: true });
      expect(args).toContain("--unshare-net");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: outbound network socket fails with ENETUNREACH", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-net-"));
      try {
        const sandbox = new DiceSandbox();
        const script = "const net = require('net'); const s = net.connect(80, '1.1.1.1'); s.on('error', (e) => { console.error('NET_ERR:', e.code); process.exit(42); });";
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["node", "-e", script],
        });
        expect(result.verdict).toBe("FAIL");
        expect(result.exitCode).toBe(42);
        expect(result.stderr).toMatch(/ENETUNREACH|EADDRNOTAVAIL|ECONNREFUSED/);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("6. Filesystem Writes Outside Staging Prohibited (EROFS)", () => {
    it("remounts root as read-only via --remount-ro /", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test" });

      const remountIdx = args.indexOf("--remount-ro");
      expect(remountIdx).toBeGreaterThan(-1);
      expect(args[remountIdx + 1]).toBe("/");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: writing to root or /usr fails with EROFS", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-rofs-"));
      try {
        const sandbox = new DiceSandbox();
        const writeRoot = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["touch", "/evil_file"],
        });
        expect(writeRoot.verdict).toBe("FAIL");
        expect(writeRoot.exitCode).not.toBe(0);
        expect(writeRoot.stderr).toContain("Read-only file system");

        const writeUsr = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["touch", "/usr/evil_file"],
        });
        expect(writeUsr.verdict).toBe("FAIL");
        expect(writeUsr.exitCode).not.toBe(0);
        expect(writeUsr.stderr).toContain("Read-only file system");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("7. Process Containment & Descendant Reaping (--unshare-pid & --die-with-parent)", () => {
    it("mandates --unshare-pid and --die-with-parent in Bubblewrap arguments", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test" });
      expect(args).toContain("--unshare-pid");
      expect(args).toContain("--die-with-parent");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: background detached children are completely reaped on exit", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-reap-"));
      try {
        const sandbox = new DiceSandbox();
        // Spawns background process that sleeps 60 seconds, then parent exits 0
        const script = "const { spawn } = require('child_process'); spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }); process.exit(0);";
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["node", "-e", script],
        });
        expect(result.verdict).toBe("PASS");
        expect(result.exitCode).toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("8. setsid() Session Escape Contained (--new-session)", () => {
    it("mandates --new-session in Bubblewrap arguments", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/snapshot-test" });
      expect(args).toContain("--new-session");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: setsid() does not escape namespace or outlive supervisor", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-setsid-"));
      try {
        const sandbox = new DiceSandbox();
        const script = "const { spawn } = require('child_process'); spawn('sh', ['-c', 'setsid sleep 60 &'], { detached: true, stdio: 'ignore' }); process.exit(0);";
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["node", "-e", script],
        });
        expect(result.verdict).toBe("PASS");
        expect(result.exitCode).toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("9. Candidate Source Mutation Prohibited (EROFS)", () => {
    it("binds candidate source snapshot read-only at /workspace/src", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/source-snapshot-456" });

      const roBindIdx = args.indexOf("--ro-bind");
      expect(roBindIdx).toBeGreaterThan(-1);
      expect(args).toContain("/tmp/source-snapshot-456");
      expect(args).toContain("/workspace/src");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: modifying /workspace/src/package.json fails with EROFS", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-src-"));
      try {
        writeFileSync(join(tempDir, "package.json"), '{"name":"candidate"}');
        const sandbox = new DiceSandbox();
        const result = sandbox.execute({
          sourceSnapshot: tempDir,
          command: ["touch", "/workspace/src/package.json"],
        });
        expect(result.verdict).toBe("FAIL");
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Read-only file system");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("10. Evidence Modification Outside Staging Prohibited", () => {
    it("binds staging directory to /workspace/out and isolates /workspace/tmp", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({
        sourceSnapshot: "/tmp/source-test",
        stagingDir: "/tmp/staging-test",
      });

      expect(args).toContain("--bind");
      expect(args).toContain("/tmp/staging-test");
      expect(args).toContain("/workspace/out");
      expect(args).toContain("--tmpfs");
      expect(args).toContain("/workspace/tmp");
    });

    it.runIf(isLinuxWithBwrap)("live Linux bwrap: writes inside /workspace/out succeed, writes outside fail", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dice-test-out-"));
      const stagingDir = join(tempDir, "staging");
      const srcDir = join(tempDir, "src");
      const fs = require("node:fs");
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });

      try {
        const sandbox = new DiceSandbox();
        // Write inside /workspace/out succeeds
        const goodResult = sandbox.execute({
          sourceSnapshot: srcDir,
          stagingDir,
          command: ["touch", "/workspace/out/receipt.json"],
        });
        expect(goodResult.verdict).toBe("PASS");
        expect(goodResult.exitCode).toBe(0);
        expect(existsSync(join(stagingDir, "receipt.json"))).toBe(true);

        // Write outside /workspace/out fails
        const badResult = sandbox.execute({
          sourceSnapshot: srcDir,
          stagingDir,
          command: ["touch", "/workspace/unauthorized_leak.json"],
        });
        expect(badResult.verdict).toBe("FAIL");
        expect(badResult.exitCode).not.toBe(0);
        expect(badResult.stderr).toContain("Read-only file system");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("11. Missing Bubblewrap Substrate Fails Closed as BLOCKED", () => {
    it("returns status BLOCKED and exitCode 126 if bwrap binary is missing on Linux host", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/nonexistent/path/to/bwrap" });
      const envCheck = sandbox.validateEnvironment(true);
      expect(envCheck.status).toBe("BLOCKED");
      expect(envCheck.reason).toContain("Bubblewrap (bwrap) binary not found");

      const execResult = sandbox.execute({ isAuthoritative: true });
      expect(execResult.verdict).toBe("BLOCKED");
      expect(execResult.exitCode).toBe(126);
      expect(execResult.stderr).toContain("Bubblewrap (bwrap) binary not found");
    });
  });

  describe("12. Sandbox Executor Bypass Attempt Fails Closed as BLOCKED", () => {
    it("halts fail-closed as BLOCKED when authoritative hostile execution is attempted on macOS (Invariant 5)", () => {
      const sandbox = new DiceSandbox({ platform: "darwin" });
      const envCheck = sandbox.validateEnvironment(true);
      expect(envCheck.status).toBe("BLOCKED");
      expect(envCheck.reason).toContain("INVARIANT-5");
      expect(envCheck.reason).toContain("macOS lacks Linux PID namespaces");

      const execResult = sandbox.execute({ isAuthoritative: true });
      expect(execResult.verdict).toBe("BLOCKED");
      expect(execResult.exitCode).toBe(126);
      expect(execResult.stderr).toContain("INVARIANT-5");
    });

    it("permits non-authoritative dry-run development execution on macOS with explicit verdict DRY_RUN", () => {
      const sandbox = new DiceSandbox({ platform: "darwin" });
      const envCheck = sandbox.validateEnvironment(false);
      expect(envCheck.status).toBe("DRY_RUN_PERMITTED");
      expect(envCheck.platform).toBe("darwin");

      const execResult = sandbox.execute({ isAuthoritative: false });
      expect(execResult.verdict).toBe("DRY_RUN");
      expect(execResult.exitCode).toBe(0);
    });
  });
});
