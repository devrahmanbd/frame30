import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateBuildManifest,
  constructDockerBuildCommand,
} from "../../scripts/build-immutable-artifact";

describe("Phase 6.1 — Immutable Docker Artifacts & Tagging", () => {
  const dockerfilePath = resolve(process.cwd(), "ops/docker/Dockerfile.production");

  it("production Dockerfile exists and is readable", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it("enforces multi-stage build architecture", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("FROM oven/bun:1.2-alpine AS base");
    expect(content).toContain("FROM base AS deps");
    expect(content).toContain("FROM base AS builder");
    expect(content).toContain("FROM base AS runner");
  });

  it("enforces deterministic, frozen lockfile installation", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toMatch(/bun install --frozen-lockfile/);
    expect(content).toContain("COPY package.json bun.lock bunfig.toml ./");
  });

  it("enforces unprivileged non-root user execution (UID 10001)", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("addgroup -g 10001 -S framique");
    expect(content).toContain("adduser -u 10001 -S framique -G framique");
    expect(content).toContain("USER framique");
  });

  it("enforces read-only rootfs compatibility and isolated writable paths", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("mkdir -p /app/.output /app/.cache /tmp");
    expect(content).toContain("chown -R framique:framique /app /tmp");
  });

  it("contains automated container healthcheck", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("/api/healthz?type=liveness");
  });

  it("declares standard OCI image metadata labels", () => {
    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("LABEL org.opencontainers.image.title=");
    expect(content).toContain("org.opencontainers.image.revision=");
    expect(content).toContain("org.opencontainers.image.created=");
    expect(content).toContain("org.opencontainers.image.vendor=\"Framique\"");
  });

  it("generates immutable commit SHA tags and rejects mutable floating tags", () => {
    const manifest = generateBuildManifest({ imageRepository: "registry.framique.internal/framique" });

    expect(manifest.canonicalTag).toMatch(/^registry\.framique\.internal\/framique:sha-[0-9a-f]{8,}$/);
    expect(manifest.canonicalTag).not.toContain(":latest");
    expect(manifest.versionTag).toContain(`registry.framique.internal/framique:${manifest.version}-`);
    expect(manifest.gitSha).toHaveLength(40);
  });

  it("constructs compliant OCI docker build command", () => {
    const manifest = generateBuildManifest();
    const cmd = constructDockerBuildCommand(manifest);

    expect(cmd).toContain("docker build");
    expect(cmd).toContain(`-f ${manifest.dockerfile}`);
    expect(cmd).toContain(`-t ${manifest.canonicalTag}`);
    expect(cmd).toContain(`--build-arg GIT_SHA=${manifest.gitSha}`);
    expect(cmd).toContain(`--build-arg VERSION=${manifest.version}`);
  });
});
