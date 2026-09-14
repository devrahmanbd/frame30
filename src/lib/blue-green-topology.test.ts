import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateNginxUpstream,
  generateK8sServicePatch,
  executeTopologyCutover,
} from "./blue-green-router.server";

describe("Phase 6.4 — Active / Standby Blue/Green Environment Topology", () => {
  const composePath = resolve(process.cwd(), "ops/docker-compose.blue-green.yml");
  const nginxConfPath = resolve(process.cwd(), "ops/routing/nginx-blue-green.conf");
  const upstreamConfPath = resolve(process.cwd(), "ops/routing/upstream.conf");
  const k8sBluePath = resolve(process.cwd(), "ops/k8s/deployment-blue.yaml");
  const k8sGreenPath = resolve(process.cwd(), "ops/k8s/deployment-green.yaml");
  const k8sServicePath = resolve(process.cwd(), "ops/k8s/service-active.yaml");

  it("topology docker-compose definition exists and declares isolated Blue & Green targets", () => {
    expect(existsSync(composePath)).toBe(true);
    const content = readFileSync(composePath, "utf8");
    expect(content).toContain("framique-blue:");
    expect(content).toContain("framique-green:");
    expect(content).toContain("edge-router:");
    expect(content).toContain("127.0.0.1:3001:3000");
    expect(content).toContain("127.0.0.1:3002:3000");
  });

  it("nginx edge router configuration enforces keep-alive and connection draining", () => {
    expect(existsSync(nginxConfPath)).toBe(true);
    const content = readFileSync(nginxConfPath, "utf8");
    expect(content).toContain("proxy_http_version 1.1;");
    expect(content).toContain('proxy_set_header Connection "";');
    expect(content).toContain("proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;");
    expect(content).toContain("proxy_next_upstream_tries 3;");
    expect(content).toContain("keepalive_requests 10000;");
  });

  it("upstream configuration exists with persistent socket pool", () => {
    expect(existsSync(upstreamConfPath)).toBe(true);
    const content = readFileSync(upstreamConfPath, "utf8");
    expect(content).toContain("upstream framique_backend {");
    expect(content).toContain("keepalive 64;");
  });

  it("kubernetes manifests define dual blue/green deployments and dynamic service selector", () => {
    expect(existsSync(k8sBluePath)).toBe(true);
    expect(existsSync(k8sGreenPath)).toBe(true);
    expect(existsSync(k8sServicePath)).toBe(true);

    const blue = readFileSync(k8sBluePath, "utf8");
    const green = readFileSync(k8sGreenPath, "utf8");
    const service = readFileSync(k8sServicePath, "utf8");

    expect(blue).toContain("topology.framique.io/slot: blue");
    expect(green).toContain("topology.framique.io/slot: green");
    expect(service).toContain("topology.framique.io/slot: blue");
  });

  it("generates correct upstream block for Active BLUE / Standby GREEN", () => {
    const upstream = generateNginxUpstream({ primarySlot: "blue" });
    expect(upstream).toContain("server framique-blue:3000 max_fails=3 fail_timeout=10s;");
    expect(upstream).toContain("server framique-green:3000 backup;");
    expect(upstream).toContain("keepalive 64;");
  });

  it("generates correct upstream block for Active GREEN / Standby BLUE", () => {
    const upstream = generateNginxUpstream({ primarySlot: "green" });
    expect(upstream).toContain("server framique-green:3000 max_fails=3 fail_timeout=10s;");
    expect(upstream).toContain("server framique-blue:3000 backup;");
    expect(upstream).toContain("keepalive 64;");
  });

  it("generates weighted upstream configuration for canary traffic splitting", () => {
    const upstream = generateNginxUpstream({ primarySlot: "blue", canaryWeight: 10 });
    expect(upstream).toContain("server framique-blue:3000 weight=90");
    expect(upstream).toContain("server framique-green:3000 weight=10");
  });

  it("generates valid Kubernetes service patch JSON", () => {
    const patchBlue = generateK8sServicePatch("blue");
    expect(patchBlue).toEqual({
      spec: {
        selector: {
          "app.kubernetes.io/name": "framique",
          "topology.framique.io/slot": "blue",
        },
      },
    });

    const patchGreen = generateK8sServicePatch("green");
    expect(patchGreen).toEqual({
      spec: {
        selector: {
          "app.kubernetes.io/name": "framique",
          "topology.framique.io/slot": "green",
        },
      },
    });
  });

  it("executes topology cutover without error and persists new slot", async () => {
    const verdict = await executeTopologyCutover("green");
    expect(verdict.success).toBe(true);
    expect(verdict.activeSlot).toBe("green");
    expect(verdict.upstreamConfig).toContain("framique-green:3000");

    // Revert back to blue
    const revert = await executeTopologyCutover("blue");
    expect(revert.success).toBe(true);
    expect(revert.activeSlot).toBe("blue");
    expect(revert.upstreamConfig).toContain("framique-blue:3000");
  });
});
