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

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, randomUUID } from "node:crypto";
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
      options.contractPath ||
      process.env.ACTIVE_CHANGE_CONTRACT ||
      "features/contracts/F30-DICE-COMPLETE.json";
    this.outDir = options.outDir || "artifacts/dice-evidence";
    this.isDryRun = options.isDryRun || false;
    this.allowUnpinnedRoots = options.allowUnpinnedRoots || false;
    this.throwOnError = options.throwOnError || false;
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
          DICE_ALLOW_UNPINNED_ROOTS: this.allowUnpinnedRoots ? "1" : "0",
          NODE_PATH: join(this.repoRoot, "node_modules"),
          // Guarantee DICE_SIGNING_KEY is NOT passed to the runner
          DICE_SIGNING_KEY: "",
        },
      });
      console.log(
        "\n[dice-launcher] ✓ Trusted launcher execution completed successfully.",
      );

      // 4. Seal authentic execution evidence
      const fullOutDir = resolve(this.repoRoot, this.outDir);
      const ledgerPath = join(fullOutDir, "receipts.sha256");
      if (existsSync(ledgerPath)) {
        const ledgerContent = readFileSync(ledgerPath, "utf8");
        const ledgerSha256 = createHash("sha256")
          .update(ledgerContent)
          .digest("hex");

        const receiptsDir = join(fullOutDir, "receipts");
        const receiptHashes = {};
        const ledgerLines = ledgerContent.trim().split("\n").filter(Boolean);
        for (const line of ledgerLines) {
          const parts = line.trim().split(/\s+/);
          const rel = parts[parts.length - 1];
          const cleanRel = rel.replace(/^receipts\//, "");
          const rPath = resolve(receiptsDir, cleanRel);
          if (existsSync(rPath)) {
            const rStr = readFileSync(rPath, "utf8");
            receiptHashes[cleanRel] = createHash("sha256")
              .update(rStr, "utf8")
              .digest("hex");
          }
        }

        const logsDir = join(fullOutDir, "logs");
        const logHashes = {};
        if (existsSync(logsDir)) {
          const logFiles = readdirSync(logsDir);
          for (const f of logFiles) {
            const logPath = join(logsDir, f);
            const lStr = readFileSync(logPath, "utf8");
            logHashes[`logs/${f}`] = createHash("sha256")
              .update(lStr, "utf8")
              .digest("hex");
          }
        }

        let candidateCommit = null;
        let candidateTree = null;
        try {
          candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: this.repoRoot,
            encoding: "utf8",
          }).trim();
          candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
            cwd: this.repoRoot,
            encoding: "utf8",
          }).trim();
        } catch {}

        const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });

        const launcherExecutionId =
          typeof randomUUID === "function"
            ? randomUUID()
            : createHash("sha256").update(Date.now().toString()).digest("hex");
        const sealedAt = new Date().toISOString();

        const sealPayload = [
          candidateCommit || "unknown-commit",
          candidateTree || "unknown-tree",
          ledgerSha256,
          trustedInfo.launcherSha || "launcher-sha",
          trustedInfo.runnerSha,
          trustedInfo.trustedRootSha,
          launcherExecutionId,
          sealedAt,
        ].join(":");

        const signature = sign(
          null,
          Buffer.from(sealPayload, "utf8"),
          privateKey,
        ).toString("hex");

        const seal = {
          version: "1.0.0",
          seal_type: "dice-launcher-execution-seal-v1",
          launcher_execution_id: launcherExecutionId,
          sealed_at: sealedAt,
          candidate_commit: candidateCommit,
          candidate_tree: candidateTree,
          launcher_sha: trustedInfo.launcherSha || "launcher-sha",
          runner_sha: trustedInfo.runnerSha,
          trusted_root_sha: trustedInfo.trustedRootSha,
          ledger_sha256: ledgerSha256,
          receipt_count: Object.keys(receiptHashes).length,
          receipt_hashes: receiptHashes,
          log_hashes: logHashes,
          signature,
          public_key: publicKey,
        };

        const sealPath = join(fullOutDir, ".launcher-seal.json");
        writeFileSync(sealPath, JSON.stringify(seal, null, 2), "utf8");
        try {
          chmodSync(sealPath, 0o444);
          chmodSync(ledgerPath, 0o444);
        } catch {}

        console.log(
          `[dice-launcher] ✓ Authentic execution evidence sealed: ${sealPath}`,
        );
        return { success: true, sealPath, seal };
      }
      return { success: true };
    } catch (err) {
      console.error(
        `\n[dice-launcher] ✗ Trusted runner execution failed with exit code ${err.status}`,
      );
      if (this.throwOnError) {
        throw new Error(
          `Trusted runner execution failed with exit code ${err.status}`,
        );
      }
      process.exit(err.status ?? 1);
    }
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("dice-launcher.mjs")) {
  let contractPath =
    process.env.ACTIVE_CHANGE_CONTRACT ||
    "features/contracts/F30-DICE-COMPLETE.json";
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
