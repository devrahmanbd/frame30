#!/usr/bin/env node
/**
 * Frame30 DICE Trusted Verification Launcher (Stage 2.4 Sections 1 & 2)
 *
 * Establishes an independently protected execution boundary so the candidate repository
 * cannot control the verification authority evaluating it.
 *
 * 1. Authenticates pinned trusted reference and tree against git object database.
 * 2. Unpacks pinned verification distribution (schemas, verifiers, registries, evaluators)
 *    into an isolated trusted distribution directory outside candidate control.
 * 3. Validates the trusted policy manifest.
 * 4. Executes the pinned bootstrap runner from the trusted distribution (NOT from candidate scripts/).
 * 5. Candidate changes to verification tools are strictly treated as subjects of verification.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  DiceTrustedRoot,
  DEFAULT_TRUSTED_REF,
  validateSafePath,
  validateTrustedRef,
} from "./dice-root-of-trust.mjs";

export class DiceLauncher {
  constructor(options = {}) {
    this.repoRoot = options.candidateDir
      ? resolve(options.candidateDir)
      : options.repoRoot || process.cwd();
    this.trustedRef =
      options.trustedRef || process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
    this.distDir = options.distDir || join("/tmp/dice-trusted-dist");
    this.contractPath =
      options.contractPath || "features/contracts/F30-DICE-STAGE2-4-1.json";
    this.outDir = options.outDir || "artifacts/dice-evidence";
    this.isDryRun = options.isDryRun || false;
    this.allowUnpinnedRoots = options.allowUnpinnedRoots || false;
  }

  launch() {
    validateSafePath(this.repoRoot);
    validateSafePath(this.distDir);
    validateSafePath(this.contractPath);
    validateSafePath(this.outDir);
    validateTrustedRef(this.trustedRef);

    console.log(
      "===============================================================================",
    );
    console.log(
      "  FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — TRUSTED LAUNCHER (STAGE 2.4)",
    );
    console.log(
      "  Normative Standard: F30-DICE-ARCH-001 Revision 2.3 & Stage 2.4",
    );
    console.log(`  Pinned Trusted Ref:  ${this.trustedRef}`);
    console.log(`  Distribution Cache:  ${this.distDir}`);
    console.log(`  Candidate Target:    ${this.repoRoot}`);
    console.log(`  Change Contract:     ${this.contractPath}`);
    console.log(
      "===============================================================================\n",
    );

    // 1. Establish and resolve trusted root
    console.log(
      "[dice-launcher] Step 1: Resolving independent trusted root-of-trust...",
    );
    const trustedRoot = new DiceTrustedRoot({
      repoRoot: this.repoRoot,
      trustedRef: this.trustedRef,
      cacheDir: this.distDir,
      allowUnpinnedRoots: this.allowUnpinnedRoots,
    });

    const trustedInfo = trustedRoot.resolve();
    console.log(`  ✓ Authenticated Root Commit: ${trustedInfo.trustedCommit}`);
    console.log(`  ✓ Authenticated Root Tree:   ${trustedInfo.trustedTree}`);
    console.log(`  ✓ Pinned Policy Manifest:    ${trustedInfo.trustedRootSha}`);
    console.log(`  ✓ Pinned Bootstrap Runner:   ${trustedInfo.runnerSha}`);

    // 2. Verify pinned bootstrap exists in trusted distribution
    const pinnedBootstrapPath = join(
      this.distDir,
      "scripts/dice-bootstrap.mjs",
    );
    if (!existsSync(pinnedBootstrapPath)) {
      throw new Error(
        `FAIL-CLOSED: Pinned bootstrap missing from trusted distribution at ${pinnedBootstrapPath}`,
      );
    }

    // 3. Launch the pinned bootstrap runner from the trusted distribution
    console.log(
      "\n[dice-launcher] Step 2: Launching pinned verification authority from trusted distribution...",
    );
    console.log(`  Executing: node ${pinnedBootstrapPath}\n`);

    const runnerArgs = [
      "--import",
      "data:text/javascript,globalThis.REPO_ROOT=process.cwd();",
      pinnedBootstrapPath,
      `--contract=${this.contractPath}`,
      `--out-dir=${this.outDir}`,
    ];
    if (this.isDryRun) {
      runnerArgs.push("--dry-run");
    }

    try {
      execFileSync("node", runnerArgs, {
        cwd: this.repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          DICE_TRUSTED_REF: this.trustedRef,
          NODE_PATH: join(this.repoRoot, "node_modules"),
          // Guarantee DICE_SIGNING_KEY is NOT passed to the runner
          DICE_SIGNING_KEY: "",
        },
      });
      console.log(
        "\n[dice-launcher] ✓ Trusted launcher execution completed successfully.",
      );
    } catch (err) {
      console.error(
        `\n[dice-launcher] ✗ Trusted runner execution failed with exit code ${err.status}`,
      );
      process.exit(err.status ?? 1);
    }
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("dice-launcher.mjs")) {
  let contractPath = "features/contracts/F30-DICE-STAGE2-4-1.json";
  let distDir = "/tmp/dice-trusted-dist";
  let outDir = "artifacts/dice-evidence";
  let isDryRun = false;
  let candidateDir = null;
  let trustedRef = process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/dice-launcher.mjs [options]

Options:
  --dry-run             Execute launcher and bootstrap in dry-run mode
  --contract=<path>     Path to change contract (default: features/contracts/F30-DICE-STAGE2-4-1.json)
  --candidate-dir=<dir> Target candidate repository directory (default: current working directory)
  --dist-dir=<path>     Path to cache trusted distribution (default: /tmp/dice-trusted-dist)
  --out-dir=<path>      Path to evidence output directory (default: artifacts/dice-evidence)
  --trusted-ref=<ref>   Git commit/tag for trusted root (default: 9e6a82abb3502edb84f2d7be9fcc36401b380bfb)
  --help, -h            Show this help message
`);
      process.exit(0);
    } else if (arg === "--dry-run") {
      isDryRun = true;
    } else if (arg.startsWith("--contract=")) {
      contractPath = arg.split("=")[1];
    } else if (arg.startsWith("--candidate-dir=")) {
      candidateDir = arg.split("=")[1];
    } else if (arg.startsWith("--dist-dir=")) {
      distDir = arg.split("=")[1];
    } else if (arg.startsWith("--out-dir=")) {
      outDir = arg.split("=")[1];
    } else if (arg.startsWith("--trusted-ref=")) {
      trustedRef = arg.split("=")[1];
    }
  }

  const launcher = new DiceLauncher({
    contractPath,
    candidateDir,
    distDir,
    outDir,
    isDryRun,
    trustedRef,
  });

  try {
    launcher.launch();
    process.exit(0);
  } catch (err) {
    console.error(`\n[dice-launcher] ✗ FAIL-CLOSED: ${err.message}`);
    process.exit(1);
  }
}
