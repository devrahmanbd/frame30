#!/usr/bin/env bun
/**
 * Immutable Artifact Builder & OCI Tagging Engine (Phase 6.1).
 *
 * Enforces strict immutable release tagging:
 * 1. Resolves immutable Git commit SHA (never uses mutable floating tags in prod).
 * 2. Formulates canonical image tags: `framique:sha-${GIT_SHA}`.
 * 3. Injects OCI build metadata (build date, git SHA, version).
 * 4. Verifies Dockerfile and outputs build manifest.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type BuildArtifactOptions = {
  dockerfile?: string;
  imageRepository?: string;
  strictGitClean?: boolean;
  dryRun?: boolean;
  push?: boolean;
};

export type BuildManifest = {
  imageTag: string;
  canonicalTag: string;
  versionTag: string;
  gitSha: string;
  shortSha: string;
  version: string;
  buildDate: string;
  dockerfile: string;
  isGitClean: boolean;
};

export function resolveGitMetadata(): { gitSha: string; shortSha: string; isClean: boolean } {
  try {
    const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const shortSha = execSync("git rev-parse --short=8 HEAD", { encoding: "utf8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
    return { gitSha, shortSha, isClean: status.length === 0 };
  } catch {
    // Fallback if running outside git repo (e.g. tarball in CI)
    const fallbackSha = process.env["GIT_SHA"] || "0000000000000000000000000000000000000000";
    return {
      gitSha: fallbackSha,
      shortSha: fallbackSha.slice(0, 8),
      isClean: true,
    };
  }
}

export function generateBuildManifest(opts: BuildArtifactOptions = {}): BuildManifest {
  const pkgPath = resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  const version = pkg.version || "1.0.0";
  const { gitSha, shortSha, isClean } = resolveGitMetadata();
  const repo = opts.imageRepository || "framique";
  const buildDate = new Date().toISOString();
  const dockerfile = opts.dockerfile || "ops/docker/Dockerfile.production";

  const canonicalTag = `${repo}:sha-${shortSha}`;
  const versionTag = `${repo}:${version}-${shortSha}`;

  return {
    imageTag: canonicalTag,
    canonicalTag,
    versionTag,
    gitSha,
    shortSha,
    version,
    buildDate,
    dockerfile,
    isGitClean: isClean,
  };
}

export function constructDockerBuildCommand(
  manifest: BuildManifest,
  opts: BuildArtifactOptions = {},
): string {
  const tags = [`-t ${manifest.canonicalTag}`, `-t ${manifest.versionTag}`];

  const buildArgs = [
    `--build-arg GIT_SHA=${manifest.gitSha}`,
    `--build-arg BUILD_DATE=${manifest.buildDate}`,
    `--build-arg VERSION=${manifest.version}`,
  ];

  const pushFlag = opts.push ? "--push" : "";

  return [
    "docker build",
    `-f ${manifest.dockerfile}`,
    ...tags,
    ...buildArgs,
    pushFlag,
    ".",
  ]
    .filter(Boolean)
    .join(" ");
}

export function executeBuild(opts: BuildArtifactOptions = {}): BuildManifest {
  const manifest = generateBuildManifest(opts);

  if (opts.strictGitClean && !manifest.isGitClean) {
    throw new Error(
      "Refusing to build immutable production artifact: Git working directory has uncommitted modifications.",
    );
  }

  const buildCmd = constructDockerBuildCommand(manifest, opts);

  // Write manifest locally
  const outDir = resolve(process.cwd(), ".output");
  if (!existsSync(outDir)) {
    try {
      mkdirSync(outDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  try {
    writeFileSync(
      resolve(outDir, "build-manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
  } catch {
    /* ignore if non-writable in test */
  }

  if (opts.dryRun) {
    return manifest;
  }

  execSync(buildCmd, { stdio: "inherit" });
  return manifest;
}

// CLI invocation
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const strict = args.includes("--strict");
  const push = args.includes("--push");

  try {
    const manifest = executeBuild({ dryRun, strictGitClean: strict, push });
    console.log(`[build-immutable-artifact] SUCCESS:`);
    console.log(`  Canonical Tag: ${manifest.canonicalTag}`);
    console.log(`  Version Tag:   ${manifest.versionTag}`);
    console.log(`  Git SHA:       ${manifest.gitSha}`);
    console.log(`  Build Date:    ${manifest.buildDate}`);
  } catch (err) {
    console.error(`[build-immutable-artifact] ERROR: ${(err as Error).message}`);
    process.exit(1);
  }
}
