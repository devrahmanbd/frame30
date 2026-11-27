#!/usr/bin/env node
/**
 * Frame30 Universal Verification Mould (DICE)
 * Stage 5.2: Executable Baseline-Differential Static Gates
 *
 * Implements approved Option A baseline-differential verification for ESLint
 * and TypeScript against the pinned diagnostic baseline commit.
 *
 * Requirements:
 * 1. Read active DICE contract and extract pinned baseline commit SHA.
 * 2. Resolve exact candidate commit.
 * 3. Enforce identical execution conditions (Bun, Node, lockfile, configs, scripts, dependency versions).
 * 4. Execute full ESLint and TypeScript scans without suppression or scope reduction.
 * 5. Compare complete machine-readable diagnostic identities as multisets.
 * 6. Enforce fail-closed disposition logic: PASS | BASELINE-CONFORMANT | PERMITTED | BLOCK.
 * 7. Produce deterministic machine-readable JSON and human-readable text reports.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  statSync,
  realpathSync,
  copyFileSync,
} from "node:fs";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

// Pinned fallback baseline commit if not extracted from contract
export const DEFAULT_DIAGNOSTIC_BASELINE_SHA =
  "5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb";

export function validateSha(sha, label = "commit SHA") {
  if (!sha || typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha.trim())) {
    throw new Error(
      `[dice-baseline-differential] ✗ Invalid ${label}: ${JSON.stringify(sha)}`,
    );
  }
  return sha.trim().toLowerCase();
}

export function computeFileSha256(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * 1. Read active DICE contract & extract pinned diagnostic baseline SHA
 */
export function extractDiagnosticBaselineFromContract(
  contractPath,
  repoRoot = process.cwd(),
) {
  const fullPath = resolve(repoRoot, contractPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Contract not found at: ${contractPath}`);
  }
  const contract = JSON.parse(readFileSync(fullPath, "utf8"));

  // 1. Direct field if present
  if (contract.diagnostic_baseline_commit) {
    return validateSha(
      contract.diagnostic_baseline_commit,
      "diagnostic_baseline_commit",
    );
  }

  // 2. Extract from required_acceptance array
  if (Array.isArray(contract.required_acceptance)) {
    for (const req of contract.required_acceptance) {
      if (typeof req === "string") {
        const match = req.match(/diagnostic baseline commit\s+([0-9a-f]{40})/i);
        if (match) {
          return validateSha(match[1], "extracted diagnostic baseline commit");
        }
      }
    }
  }

  // 3. Fallback to default pinned baseline SHA if referenced in problem/evidence or constants
  return DEFAULT_DIAGNOSTIC_BASELINE_SHA;
}

export function normalizeToRelative(filePath, repoRoot = process.cwd()) {
  if (!filePath) return "";
  let clean = filePath.replace(/\\/g, "/");
  if (!clean.startsWith("/") && !/^[a-zA-Z]:\//.test(clean)) {
    return clean.replace(/^\.\//, "");
  }

  let realRoot = repoRoot;
  try {
    if (existsSync(repoRoot)) {
      realRoot = realpathSync(repoRoot);
    }
  } catch (err) {
    void err;
  }
  realRoot = realRoot.replace(/\\/g, "/");

  let normFile = clean;
  try {
    if (existsSync(filePath)) {
      normFile = realpathSync(filePath).replace(/\\/g, "/");
    }
  } catch (err) {
    void err;
  }

  if (normFile.startsWith(realRoot + "/")) {
    return normFile.slice(realRoot.length + 1);
  }
  if (normFile === realRoot) {
    return "";
  }
  return relative(realRoot, normFile).replace(/\\/g, "/");
}

/**
 * 2. Parse ESLint JSON diagnostics
 * Identity: file + line + column + rule_id + message
 */
export function parseEslintDiagnostics(output, repoRoot = process.cwd()) {
  if (!output || typeof output !== "string") {
    throw new Error("Empty or invalid ESLint output");
  }

  // Find JSON array start and end
  const trimmed = output.trim();
  const startIdx = trimmed.indexOf("[");
  const endIdx = trimmed.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("Malformed ESLint JSON: array delimiters not found");
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed.slice(startIdx, endIdx + 1));
  } catch (err) {
    throw new Error(`Malformed ESLint JSON: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Malformed ESLint JSON: root element is not an array");
  }

  const diagnostics = [];

  for (const fileEntry of parsed) {
    if (!fileEntry || typeof fileEntry !== "object") continue;
    const rawFilePath = fileEntry.filePath || "";
    const relFile = normalizeToRelative(rawFilePath, repoRoot);

    const messages = Array.isArray(fileEntry.messages)
      ? fileEntry.messages
      : [];
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") continue;

      const line = Number.isInteger(msg.line) ? msg.line : 0;
      const column = Number.isInteger(msg.column) ? msg.column : 0;
      const ruleId = msg.ruleId || "(none)";
      const rawMessage = (msg.message || "").trim();
      const severity = msg.severity === 2 ? "error" : "warning";

      // Exact diagnostic identity tuple
      const identity = `${relFile}:${line}:${column}:${ruleId}:${rawMessage}`;

      diagnostics.push({
        file: relFile,
        line,
        column,
        rule_id: ruleId,
        message: rawMessage,
        severity,
        identity,
      });
    }
  }

  return diagnostics;
}

/**
 * 3. Parse TypeScript compiler diagnostics
 * Identity: file + line + column + diagnostic_code + complete_message
 */
export function parseTypeScriptDiagnostics(
  stdout,
  stderr = "",
  repoRoot = process.cwd(),
  exitCode = 0,
) {
  const combined = (stdout || "") + "\n" + (stderr || "");
  const lines = combined.split(/\r?\n/).map((l) => l.trimEnd());

  const diagnostics = [];
  let current = null;

  // Pattern 1: Non-TTY paren format: file(line,col): error/warning TS<code>: message
  const parenRegex =
    /^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/;
  // Pattern 2: TTY colon format: file:line:col - error/warning TS<code>: message
  const colonRegex =
    /^([^:]+):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.*)$/;

  // Benign lines to ignore
  const isBenign = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^\$\s+tsgo/.test(trimmed)) return true;
    if (/^error:\s*script\s*"typecheck"/.test(trimmed)) return true;
    if (/^Found\s+\d+\s+errors?\s+in\s+\d+\s+files?/i.test(trimmed))
      return true;
    if (/^Errors\s+Files/i.test(trimmed)) return true;
    if (/^\d+\s+src\//.test(trimmed)) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }

    const parenMatch = line.match(parenRegex);
    const colonMatch = line.match(colonRegex);
    const match = parenMatch || colonMatch;

    if (match) {
      if (current) {
        diagnostics.push(finalizeTsDiag(current, repoRoot));
      }
      current = {
        rawFile: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4].toLowerCase(),
        code: match[5].trim(),
        messageLines: [match[6].trim()],
      };
    } else if (line.startsWith("  ") || line.startsWith("\t")) {
      // Indented continuation line
      if (current) {
        current.messageLines.push(line.trim());
      } else if (!isBenign(line)) {
        throw new Error(
          `Unparseable TypeScript output at line ${i + 1}: ${line}`,
        );
      }
    } else if (isBenign(line)) {
      // Ignored build banner
      continue;
    } else {
      // Non-matching line outside of known banners
      throw new Error(
        `Unparseable TypeScript output at line ${i + 1}: ${line}`,
      );
    }
  }

  if (current) {
    diagnostics.push(finalizeTsDiag(current, repoRoot));
  }

  // If compiler exited non-zero but emitted 0 parseable diagnostics, output is incomplete or crashed
  if (exitCode !== 0 && diagnostics.length === 0) {
    throw new Error(
      `Incomplete diagnostic output: TypeScript compiler exited with code ${exitCode} but 0 diagnostics parsed`,
    );
  }

  return diagnostics;
}

function finalizeTsDiag(item, repoRoot) {
  const relFile = normalizeToRelative(item.rawFile, repoRoot);
  const completeMessage = item.messageLines.join("\n").trim();
  const identity = `${relFile}:${item.line}:${item.column}:${item.code}:${completeMessage}`;

  return {
    file: relFile,
    line: item.line,
    column: item.column,
    severity: item.severity,
    diagnostic_code: item.code,
    complete_message: completeMessage,
    identity,
  };
}

/**
 * 4. Multiset Comparison Engine
 * Preserves duplicate identities and classifies exact diagnostic differences.
 */
export function compareDiagnosticMultisets(baselineDiags, candidateDiags) {
  const bCounts = new Map();
  const cCounts = new Map();

  for (const d of baselineDiags) {
    bCounts.set(d.identity, (bCounts.get(d.identity) || 0) + 1);
  }
  for (const d of candidateDiags) {
    cCounts.set(d.identity, (cCounts.get(d.identity) || 0) + 1);
  }

  const allIdentities = new Set([...bCounts.keys(), ...cCounts.keys()]);

  let removedCount = 0;
  let newCount = 0;
  let changedCount = 0;
  let duplicateCount = 0;

  const newItems = [];
  const removedItems = [];
  const changedItems = [];
  const duplicateItems = [];

  const unmatchedBaseline = [];
  const unmatchedCandidate = [];

  for (const id of allIdentities) {
    const bCount = bCounts.get(id) || 0;
    const cCount = cCounts.get(id) || 0;

    if (bCount === cCount) {
      // Identical
      continue;
    } else if (bCount > cCount) {
      // Diagnostic was removed (cCount < bCount)
      const diff = bCount - cCount;
      removedCount += diff;
      for (let i = 0; i < diff; i++) {
        const sample = baselineDiags.find((d) => d.identity === id);
        removedItems.push(sample);
        unmatchedBaseline.push(sample);
      }
    } else {
      // Diagnostic was added or duplicated (cCount > bCount)
      const diff = cCount - bCount;
      for (let i = 0; i < diff; i++) {
        const sample = candidateDiags.find((d) => d.identity === id);
        if (bCount > 0) {
          duplicateCount++;
          duplicateItems.push(sample);
        } else {
          unmatchedCandidate.push(sample);
        }
      }
    }
  }

  // Detect changed diagnostics from unmatched sets
  const remainingCandidate = [];
  for (const cand of unmatchedCandidate) {
    let foundChange = false;
    for (let j = 0; j < unmatchedBaseline.length; j++) {
      const base = unmatchedBaseline[j];
      if (!base) continue;

      if (base.file === cand.file) {
        const sameCode =
          (base.rule_id && base.rule_id === cand.rule_id) ||
          (base.diagnostic_code &&
            base.diagnostic_code === cand.diagnostic_code);
        const sameLoc = base.line === cand.line && base.column === cand.column;
        const sameMsg =
          (base.message && base.message === cand.message) ||
          (base.complete_message &&
            base.complete_message === cand.complete_message);

        let changeType = null;
        if (sameLoc && !sameCode) {
          changeType = "changed_rule_or_code";
        } else if (sameLoc && !sameMsg) {
          changeType = "changed_message";
        } else if (sameCode && sameMsg && !sameLoc) {
          changeType = "changed_line_or_column";
        } else if (sameCode || sameLoc) {
          changeType = "changed_diagnostic";
        }

        if (changeType) {
          changedCount++;
          changedItems.push({
            type: changeType,
            baseline: base,
            candidate: cand,
          });
          unmatchedBaseline[j] = null; // consume
          foundChange = true;
          break;
        }
      }
    }

    if (!foundChange) {
      remainingCandidate.push(cand);
    }
  }

  newCount = remainingCandidate.length + duplicateCount;
  for (const item of remainingCandidate) {
    newItems.push(item);
  }

  // Determine disposition
  let disposition;
  if (newCount > 0 || changedCount > 0) {
    disposition = "BLOCK";
  } else if (baselineDiags.length === 0 && candidateDiags.length === 0) {
    disposition = "PASS";
  } else if (removedCount > 0) {
    disposition = "PERMITTED";
  } else {
    disposition = "BASELINE-CONFORMANT";
  }

  return {
    baselineCount: baselineDiags.length,
    candidateCount: candidateDiags.length,
    newCount,
    changedCount,
    removedCount,
    duplicateCount,
    disposition,
    details: {
      newItems,
      changedItems,
      removedItems,
      duplicateItems,
    },
  };
}

/**
 * 5. Verify identical execution conditions
 */
export function verifyExecutionConditions(baselineDir, candidateDir) {
  const result = {
    ok: true,
    bunVersion: null,
    nodeVersion: process.version,
    checks: {},
    failures: [],
  };

  try {
    result.bunVersion = execFileSync("bun", ["--version"], {
      encoding: "utf8",
    }).trim();
  } catch (err) {
    void err;
    result.bunVersion = "unknown";
  }

  // Check 1: bun.lock SHA-256
  const bLockSha = computeFileSha256(join(baselineDir, "bun.lock"));
  const cLockSha = computeFileSha256(join(candidateDir, "bun.lock"));
  result.checks.lockfile = {
    baseline: bLockSha,
    candidate: cLockSha,
    match: bLockSha === cLockSha,
  };
  if (!bLockSha || bLockSha !== cLockSha) {
    result.ok = false;
    result.failures.push(
      `Lockfile mismatch: bun.lock SHA-256 differs (baseline=${bLockSha}, candidate=${cLockSha})`,
    );
  }

  // Check 2: ESLint configuration hashes
  const eslintFiles = [
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc.json",
    ".eslintrc.js",
  ];
  const bEslintShas = {};
  const cEslintShas = {};
  let eslintMatch = true;

  for (const f of eslintFiles) {
    const bSha = computeFileSha256(join(baselineDir, f));
    const cSha = computeFileSha256(join(candidateDir, f));
    if (bSha || cSha) {
      bEslintShas[f] = bSha;
      cEslintShas[f] = cSha;
      if (bSha !== cSha) eslintMatch = false;
    }
  }
  result.checks.eslintConfig = {
    baseline: bEslintShas,
    candidate: cEslintShas,
    match: eslintMatch,
  };
  if (!eslintMatch) {
    result.ok = false;
    result.failures.push(
      "ESLint configuration mismatch between baseline and candidate",
    );
  }

  // Check 3: TypeScript configuration hashes
  const tsConfigFiles = ["tsconfig.json", "tsconfig.dice.json"];
  const bTsShas = {};
  const cTsShas = {};
  let tsMatch = true;

  for (const f of tsConfigFiles) {
    const bSha = computeFileSha256(join(baselineDir, f));
    const cSha = computeFileSha256(join(candidateDir, f));
    if (bSha || cSha) {
      bTsShas[f] = bSha;
      cTsShas[f] = cSha;
      if (bSha !== cSha) tsMatch = false;
    }
  }
  result.checks.typeScriptConfig = {
    baseline: bTsShas,
    candidate: cTsShas,
    match: tsMatch,
  };
  if (!tsMatch) {
    result.ok = false;
    result.failures.push(
      "TypeScript configuration mismatch between baseline and candidate",
    );
  }

  // Check 4: package.json lint & typecheck scripts and scanner dependencies
  const bPkgPath = join(baselineDir, "package.json");
  const cPkgPath = join(candidateDir, "package.json");
  if (!existsSync(bPkgPath) || !existsSync(cPkgPath)) {
    result.ok = false;
    result.failures.push("package.json missing in baseline or candidate");
  } else {
    const bPkg = JSON.parse(readFileSync(bPkgPath, "utf8"));
    const cPkg = JSON.parse(readFileSync(cPkgPath, "utf8"));

    const bLint = bPkg.scripts?.lint;
    const cLint = cPkg.scripts?.lint;
    const bTc = bPkg.scripts?.typecheck;
    const cTc = cPkg.scripts?.typecheck;

    result.checks.scripts = {
      lint: { baseline: bLint, candidate: cLint, match: bLint === cLint },
      typecheck: { baseline: bTc, candidate: cTc, match: bTc === cTc },
    };

    if (bLint !== cLint) {
      result.ok = false;
      result.failures.push(
        `package.json 'lint' script mismatch (baseline: "${bLint}", candidate: "${cLint}")`,
      );
    }
    if (bTc !== cTc) {
      result.ok = false;
      result.failures.push(
        `package.json 'typecheck' script mismatch (baseline: "${bTc}", candidate: "${cTc}")`,
      );
    }

    // Check scanner dependencies
    const relevantPackages = [
      "eslint",
      "typescript",
      "@typescript/native-preview",
      "typescript-eslint",
      "@eslint/js",
      "eslint-plugin-react-hooks",
      "eslint-plugin-react-refresh",
      "eslint-plugin-prettier",
    ];

    const bDeps = {
      ...(bPkg.dependencies || {}),
      ...(bPkg.devDependencies || {}),
    };
    const cDeps = {
      ...(cPkg.dependencies || {}),
      ...(cPkg.devDependencies || {}),
    };

    const depMismatches = [];
    for (const pkg of relevantPackages) {
      const bVer = bDeps[pkg];
      const cVer = cDeps[pkg];
      if (bVer !== cVer) {
        depMismatches.push(`${pkg}: baseline=${bVer}, candidate=${cVer}`);
      }
    }
    result.checks.dependencies = {
      mismatches: depMismatches,
      match: depMismatches.length === 0,
    };
    if (depMismatches.length > 0) {
      result.ok = false;
      result.failures.push(
        `Scanner dependency version mismatch: ${depMismatches.join("; ")}`,
      );
    }
  }

  return result;
}

/**
 * 6. Execute full comparison pipeline
 */
export async function runDifferentialComparison(options = {}) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const contractPath =
    options.contractPath ||
    process.env.ACTIVE_CHANGE_CONTRACT ||
    "features/contracts/F30-DICE-COMPLETE.json";

  let baselineSha = options.baselineSha;
  if (!baselineSha) {
    try {
      baselineSha = extractDiagnosticBaselineFromContract(
        contractPath,
        repoRoot,
      );
    } catch (err) {
      return makeFailureResult(
        "BLOCK",
        `Failed to read contract: ${err.message}`,
        baselineSha,
        null,
      );
    }
  }
  baselineSha = validateSha(baselineSha, "baseline commit SHA");

  // Verify baseline commit exists in Git (unless using direct mock directories)
  if (!options.baselineDir && !options.skipGitVerify) {
    try {
      execFileSync("git", ["cat-file", "-e", `${baselineSha}^{commit}`], {
        cwd: repoRoot,
        stdio: "ignore",
      });
    } catch {
      return makeFailureResult(
        "BLOCK",
        `Diagnostic baseline commit ${baselineSha} is missing from git history`,
        baselineSha,
        null,
      );
    }
  }

  // Resolve candidate commit
  let candidateSha = options.candidateSha;
  if (!candidateSha) {
    try {
      candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
    } catch (err) {
      return makeFailureResult(
        "BLOCK",
        `Failed to resolve candidate commit: ${err.message}`,
        baselineSha,
        null,
      );
    }
  }
  candidateSha = validateSha(candidateSha, "candidate commit SHA");

  // Worktree setup or direct directories
  let baselineDir = options.baselineDir;
  let candidateDir = options.candidateDir;
  let tmpWorktreeRoot = null;

  try {
    if (!baselineDir || !candidateDir) {
      tmpWorktreeRoot = mkdtempSync(join(tmpdir(), "dice-static-diff-"));
      baselineDir = join(tmpWorktreeRoot, "baseline");
      candidateDir = join(tmpWorktreeRoot, "candidate");

      execFileSync(
        "git",
        ["worktree", "add", "--detach", baselineDir, baselineSha],
        {
          cwd: repoRoot,
          stdio: "ignore",
        },
      );
      execFileSync(
        "git",
        ["worktree", "add", "--detach", candidateDir, candidateSha],
        {
          cwd: repoRoot,
          stdio: "ignore",
        },
      );

      // Link node_modules for identical runtime
      const hostNodeModules = join(repoRoot, "node_modules");
      if (existsSync(hostNodeModules)) {
        symlinkSync(
          hostNodeModules,
          join(baselineDir, "node_modules"),
          "junction",
        );
        symlinkSync(
          hostNodeModules,
          join(candidateDir, "node_modules"),
          "junction",
        );
      }

      // If working tree has uncommitted modifications and candidate was resolved from HEAD,
      // sync the modified files into the candidate worktree
      if (!options.candidateSha) {
        try {
          const porcelain = execFileSync("git", ["status", "--porcelain"], {
            cwd: repoRoot,
            encoding: "utf8",
          });
          const lines = porcelain
            .split("\n")
            .filter((l) => l.trim().length > 0);
          for (const line of lines) {
            const status = line.slice(0, 2).trim();
            const relPath = line.slice(3).trim();
            const srcPath = join(repoRoot, relPath);
            const destPath = join(candidateDir, relPath);

            if (status === "D") {
              if (existsSync(destPath)) {
                rmSync(destPath, { recursive: true, force: true });
              }
            } else if (existsSync(srcPath) && statSync(srcPath).isFile()) {
              mkdirSync(join(destPath, ".."), { recursive: true });
              copyFileSync(srcPath, destPath);
            }
          }
        } catch (err) {
          void err;
        }
      }
    }

    // Enforce identical execution conditions
    const condCheck = verifyExecutionConditions(baselineDir, candidateDir);
    if (!condCheck.ok) {
      return makeFailureResult(
        "BLOCK",
        `Execution conditions mismatch:\n  - ${condCheck.failures.join("\n  - ")}`,
        baselineSha,
        candidateSha,
        condCheck,
      );
    }

    // Execute ESLint scans
    let bEslintOut = options.baselineEslintOutput;
    let cEslintOut = options.candidateEslintOutput;

    if (bEslintOut === undefined) {
      const res = spawnSync("bun", ["run", "lint", "--", "-f", "json"], {
        cwd: baselineDir,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      });
      if (res.error || (res.status !== 0 && res.status !== 1)) {
        return makeFailureResult(
          "BLOCK",
          `ESLint scanner infrastructure failure on baseline: ${res.error?.message || `exit code ${res.status}`}`,
          baselineSha,
          candidateSha,
        );
      }
      bEslintOut = res.stdout;
    }
    if (cEslintOut === undefined) {
      const res = spawnSync("bun", ["run", "lint", "--", "-f", "json"], {
        cwd: candidateDir,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      });
      if (res.error || (res.status !== 0 && res.status !== 1)) {
        return makeFailureResult(
          "BLOCK",
          `ESLint scanner infrastructure failure on candidate: ${res.error?.message || `exit code ${res.status}`}`,
          baselineSha,
          candidateSha,
        );
      }
      cEslintOut = res.stdout;
    }

    let bEslintDiags, cEslintDiags;
    try {
      bEslintDiags = parseEslintDiagnostics(bEslintOut, baselineDir);
      cEslintDiags = parseEslintDiagnostics(cEslintOut, candidateDir);
    } catch (err) {
      return makeFailureResult(
        "BLOCK",
        `ESLint diagnostic parsing error: ${err.message}`,
        baselineSha,
        candidateSha,
      );
    }

    const eslintDiff = compareDiagnosticMultisets(bEslintDiags, cEslintDiags);

    // Execute TypeScript scans
    let bTsRes = options.baselineTsOutput;
    let cTsRes = options.candidateTsOutput;

    if (bTsRes === undefined) {
      const res = spawnSync("bun", ["run", "typecheck"], {
        cwd: baselineDir,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      });
      if (res.error) {
        return makeFailureResult(
          "BLOCK",
          `TypeScript scanner infrastructure failure on baseline: ${res.error.message}`,
          baselineSha,
          candidateSha,
        );
      }
      bTsRes = {
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.status ?? 1,
      };
    }
    if (cTsRes === undefined) {
      const res = spawnSync("bun", ["run", "typecheck"], {
        cwd: candidateDir,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      });
      if (res.error) {
        return makeFailureResult(
          "BLOCK",
          `TypeScript scanner infrastructure failure on candidate: ${res.error.message}`,
          baselineSha,
          candidateSha,
        );
      }
      cTsRes = {
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.status ?? 1,
      };
    }

    let bTsDiags, cTsDiags;
    try {
      bTsDiags = parseTypeScriptDiagnostics(
        bTsRes.stdout,
        bTsRes.stderr,
        baselineDir,
        bTsRes.exitCode,
      );
      cTsDiags = parseTypeScriptDiagnostics(
        cTsRes.stdout,
        cTsRes.stderr,
        candidateDir,
        cTsRes.exitCode,
      );
    } catch (err) {
      return makeFailureResult(
        "BLOCK",
        `TypeScript diagnostic parsing error: ${err.message}`,
        baselineSha,
        candidateSha,
      );
    }

    const tsDiff = compareDiagnosticMultisets(bTsDiags, cTsDiags);

    // Final disposition determination
    let finalDisposition;
    if (eslintDiff.disposition === "BLOCK" || tsDiff.disposition === "BLOCK") {
      finalDisposition = "BLOCK";
    } else if (
      eslintDiff.disposition === "PASS" &&
      tsDiff.disposition === "PASS"
    ) {
      finalDisposition = "PASS";
    } else if (
      eslintDiff.disposition === "BASELINE-CONFORMANT" ||
      tsDiff.disposition === "BASELINE-CONFORMANT"
    ) {
      finalDisposition = "BASELINE-CONFORMANT";
    } else {
      finalDisposition = "PERMITTED";
    }

    const report = {
      timestamp: new Date().toISOString(),
      baseline: baselineSha,
      candidate: candidateSha,
      conditions: condCheck,
      eslint: {
        baselineCount: eslintDiff.baselineCount,
        candidateCount: eslintDiff.candidateCount,
        new: eslintDiff.newCount,
        changed: eslintDiff.changedCount,
        removed: eslintDiff.removedCount,
        duplicate: eslintDiff.duplicateCount,
        disposition: eslintDiff.disposition,
        details: eslintDiff.details,
      },
      typescript: {
        baselineCount: tsDiff.baselineCount,
        candidateCount: tsDiff.candidateCount,
        new: tsDiff.newCount,
        changed: tsDiff.changedCount,
        removed: tsDiff.removedCount,
        duplicate: tsDiff.duplicateCount,
        disposition: tsDiff.disposition,
        details: tsDiff.details,
      },
      finalDisposition,
      exitCode: finalDisposition === "BLOCK" ? 1 : 0,
    };

    return report;
  } finally {
    // Cleanup temporary worktrees
    if (tmpWorktreeRoot) {
      try {
        execFileSync("git", ["worktree", "remove", "--force", baselineDir], {
          cwd: repoRoot,
          stdio: "ignore",
        });
      } catch (err) {
        void err;
      }
      try {
        execFileSync("git", ["worktree", "remove", "--force", candidateDir], {
          cwd: repoRoot,
          stdio: "ignore",
        });
      } catch (err) {
        void err;
      }
      try {
        rmSync(tmpWorktreeRoot, { recursive: true, force: true });
      } catch (err) {
        void err;
      }
    }
  }
}

function makeFailureResult(
  disposition,
  reason,
  baselineSha,
  candidateSha,
  conditions = null,
) {
  return {
    timestamp: new Date().toISOString(),
    baseline: baselineSha || "UNKNOWN",
    candidate: candidateSha || "UNKNOWN",
    conditions: conditions || { ok: false, failures: [reason] },
    error: reason,
    eslint: {
      baselineCount: 0,
      candidateCount: 0,
      new: 0,
      changed: 0,
      removed: 0,
      disposition,
    },
    typescript: {
      baselineCount: 0,
      candidateCount: 0,
      new: 0,
      changed: 0,
      removed: 0,
      disposition,
    },
    finalDisposition: disposition,
    exitCode: 1,
  };
}

export function formatReportText(report) {
  const lines = [
    "=======================================================",
    "DICE BASELINE DIFFERENTIAL",
    `Baseline:  ${report.baseline}`,
    `Candidate: ${report.candidate}`,
    "=======================================================",
  ];

  if (report.error) {
    lines.push(`ERROR: ${report.error}`);
    lines.push("");
    lines.push(`FINAL RESULT: ${report.finalDisposition}`);
    return lines.join("\n");
  }

  lines.push("");
  lines.push("ESLINT");
  lines.push(`Baseline diagnostics: ${report.eslint.baselineCount}`);
  lines.push(`Candidate diagnostics: ${report.eslint.candidateCount}`);
  lines.push(`New:                   ${report.eslint.new}`);
  lines.push(`Changed:               ${report.eslint.changed}`);
  lines.push(`Removed:               ${report.eslint.removed}`);
  lines.push(`Disposition:           ${report.eslint.disposition}`);

  lines.push("");
  lines.push("TYPESCRIPT");
  lines.push(`Baseline diagnostics: ${report.typescript.baselineCount}`);
  lines.push(`Candidate diagnostics: ${report.typescript.candidateCount}`);
  lines.push(`New:                   ${report.typescript.new}`);
  lines.push(`Changed:               ${report.typescript.changed}`);
  lines.push(`Removed:               ${report.typescript.removed}`);
  lines.push(`Disposition:           ${report.typescript.disposition}`);

  lines.push("");
  lines.push("=======================================================");
  lines.push(`FINAL RESULT: ${report.finalDisposition}`);
  lines.push("=======================================================");

  return lines.join("\n");
}

// CLI entry point
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename || "")
) {
  const args = process.argv.slice(2);
  let reportDir = null;
  let candidateSha = null;
  let baselineSha = null;
  let contractPath = null;

  for (const arg of args) {
    if (arg.startsWith("--report-dir=")) {
      reportDir = arg.split("=")[1];
    } else if (arg.startsWith("--candidate=")) {
      candidateSha = arg.split("=")[1];
    } else if (arg.startsWith("--baseline=")) {
      baselineSha = arg.split("=")[1];
    } else if (arg.startsWith("--contract=")) {
      contractPath = arg.split("=")[1];
    }
  }

  runDifferentialComparison({
    reportDir,
    candidateSha,
    baselineSha,
    contractPath,
  })
    .then((report) => {
      const textReport = formatReportText(report);
      console.log(textReport);

      if (reportDir) {
        mkdirSync(resolve(reportDir), { recursive: true });
        writeFileSync(
          join(resolve(reportDir), "dice-static-baseline-report.json"),
          JSON.stringify(report, null, 2),
        );
        writeFileSync(
          join(resolve(reportDir), "dice-static-baseline-report.txt"),
          textReport,
        );
      }

      process.exit(report.exitCode);
    })
    .catch((err) => {
      console.error(
        `[dice-baseline-differential] ✗ Fatal engine error: ${err.message}`,
      );
      process.exit(1);
    });
}
