import { describe, it, expect } from "vitest";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";

describe("DICE OS Sandbox Security & Containment (Revision 2.3 Section 7 & C4)", () => {
  describe("1. macOS Non-Authoritative Containment Boundary", () => {
    it("halts fail-closed as BLOCKED when authoritative hostile execution is attempted on macOS", () => {
      const sandbox = new DiceSandbox({ platform: "darwin" });
      const envCheck = sandbox.validateEnvironment(true);
      expect(envCheck.status).toBe("BLOCKED");
      expect(envCheck.reason).toContain("INVARIANT-5");
      expect(envCheck.reason).toContain("macOS lacks Linux PID namespaces");

      const execResult = sandbox.execute({ isAuthoritative: true });
      expect(execResult.verdict).toBe("BLOCKED");
      expect(execResult.stderr).toContain("INVARIANT-5");
    });

    it("permits non-authoritative dry-run development execution on macOS", () => {
      const sandbox = new DiceSandbox({ platform: "darwin" });
      const envCheck = sandbox.validateEnvironment(false);
      expect(envCheck.status).toBe("DRY_RUN_PERMITTED");
      expect(envCheck.platform).toBe("darwin");

      const execResult = sandbox.execute({ isAuthoritative: false });
      expect(execResult.verdict).toBe("DRY_RUN");
      expect(execResult.exitCode).toBe(0);
    });
  });

  describe("2. Linux Bubblewrap Argument & Isolation Construction", () => {
    it("constructs compliant Bubblewrap execution arguments with unshared PID and Net namespaces", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/usr/bin/bwrap" });
      const args = sandbox.buildBwrapArgs({
        sourceSnapshot: "/tmp/snapshot-123",
        scratchDir: "/tmp/scratch-123",
        stagingDir: "/tmp/staging-123",
        unshareNet: true,
        command: ["bun", "test"],
      });

      // Verify filesystem isolation
      expect(args).toContain("--ro-bind");
      expect(args).toContain("/tmp/snapshot-123");
      expect(args).toContain("/workspace/src");
      expect(args).toContain("--tmpfs");
      expect(args).toContain("/workspace/tmp");
      expect(args).toContain("--bind");
      expect(args).toContain("/tmp/staging-123");
      expect(args).toContain("/workspace/out");

      // Verify process and network isolation
      expect(args).toContain("--unshare-pid");
      expect(args).toContain("--unshare-net");
      expect(args).toContain("--die-with-parent");

      // Verify docker socket and credentials are not bound
      const joined = args.join(" ");
      expect(joined).not.toContain("/var/run/docker.sock");
      expect(joined).not.toContain(".git");
      expect(joined).not.toContain(".env");
    });
  });

  describe("3. Fail-Closed Handling of Missing Substrates", () => {
    it("fails closed as BLOCKED if bwrap binary is missing on Linux host", () => {
      const sandbox = new DiceSandbox({ platform: "linux", bwrapPath: "/nonexistent/bwrap" });
      const envCheck = sandbox.validateEnvironment(true);
      expect(envCheck.status).toBe("BLOCKED");
      expect(envCheck.reason).toContain("Bubblewrap (bwrap) binary not found");
    });
  });
});
