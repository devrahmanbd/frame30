/**
 * Contract tests for Multi-Layer Caching, Redis Distributed Locks,
 * Race-Condition Elimination, and Multi-Tier Rate Limiting.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  acquireLock,
  withDistributedLock,
  withTenantLock,
  withSystemLock,
  LockAcquisitionError,
} from "./redis-lock.server";
import { TenantScopeError } from "./tenant-scope";
import { BUCKETS, enforceTenantRateLimit } from "./rate-limit.server";

describe("Redis Distributed Locking Contract", () => {
  it("provides mutual exclusion using in-memory fallback when Redis is unconfigured", async () => {
    const resource = `test-res-${Date.now()}`;
    const handle1 = await acquireLock(resource, 5000);
    expect(handle1).not.toBeNull();
    expect(handle1?.token).toBeDefined();

    // Concurrent acquire on the same resource must fail
    const handle2 = await acquireLock(resource, 5000);
    expect(handle2).toBeNull();

    // Release must free the lock
    const released = await handle1?.release();
    expect(released).toBe(true);

    // Can acquire again after release
    const handle3 = await acquireLock(resource, 5000);
    expect(handle3).not.toBeNull();
    await handle3?.release();
  });

  it("extends lock TTL via extend()", async () => {
    const resource = `test-extend-${Date.now()}`;
    const handle = await acquireLock(resource, 2000);
    expect(handle).not.toBeNull();

    const extended = await handle?.extend(5000);
    expect(extended).toBe(true);

    await handle?.release();
  });

  it("safely releases locks through withDistributedLock wrapper", async () => {
    const resource = `test-with-${Date.now()}`;
    let executed = false;

    await withDistributedLock(resource, 5000, async (handle) => {
      expect(handle.token).toBeDefined();
      executed = true;
    });

    expect(executed).toBe(true);

    // Lock must be released immediately after execution
    const reacquired = await acquireLock(resource, 2000);
    expect(reacquired).not.toBeNull();
    await reacquired?.release();
  });

  it("throws LockAcquisitionError if lock cannot be acquired after retries", async () => {
    const resource = `test-conflict-${Date.now()}`;
    const holder = await acquireLock(resource, 10000);
    expect(holder).not.toBeNull();

    await expect(
      withDistributedLock(
        resource,
        1000,
        async () => {
          // Should not reach
        },
        { retries: 1, retryDelayMs: 10 },
      ),
    ).rejects.toThrow(LockAcquisitionError);

    await holder?.release();
  });

  it("namespaces tenant locks to tenant:{tenantId}:{resource}", async () => {
    let capturedKey = "";
    await withTenantLock("m_123", "catalog:sync", 2000, async (handle) => {
      capturedKey = handle.key;
    });
    expect(capturedKey).toContain("tenant:m_123:catalog:sync");
  });

  it("strictly enforces tenant scope in withTenantLock and blocks namespace tampering", async () => {
    // Malicious wildcards or keywords must throw TenantScopeError
    await expect(
      withTenantLock("*", "catalog:sync", 1000, async () => {}),
    ).rejects.toThrow(TenantScopeError);

    await expect(
      withTenantLock("all", "catalog:sync", 1000, async () => {}),
    ).rejects.toThrow(TenantScopeError);

    // Lock key smuggling via colons or delimiters must throw TenantScopeError
    await expect(
      withTenantLock("m_123:smuggled", "catalog:sync", 1000, async () => {}),
    ).rejects.toThrow(TenantScopeError);

    await expect(
      withTenantLock("", "catalog:sync", 1000, async () => {}),
    ).rejects.toThrow(TenantScopeError);
  });

  it("rejects invalid or control-character-injected lock resources", async () => {
    await expect(
      withTenantLock("m_123", "", 1000, async () => {}),
    ).rejects.toThrow("Lock resource must be a non-empty string");

    await expect(
      withTenantLock("m_123", "catalog\r\nSET attack 1", 1000, async () => {}),
    ).rejects.toThrow("Lock resource contains invalid control characters");
  });

  it("namespaces system locks to system:{resource}", async () => {
    let capturedKey = "";
    await withSystemLock("cron:sweep", 2000, async (handle) => {
      capturedKey = handle.key;
    });
    expect(capturedKey).toContain("system:cron:sweep");
  });
});

describe("Race Condition Elimination in Critical Flows", () => {
  it("protects checkout reserveStock and consumeStock with tenant distributed locks", () => {
    const source = readFileSync("src/lib/checkout.server.ts", "utf8");
    expect(source).toContain(
      'import { withTenantLock } from "./redis-lock.server"',
    );
    // Reserves serialize per merchant (not per token): concurrent checkouts
    // for the same variant must line up behind one lock, otherwise overlapping
    // re-quotes can double-take stock (Sept 2026 night-shift incident).
    expect(source).toMatch(
      /withTenantLock\s*\(\s*merchantId\s*,\s*"stock:reserve"/,
    );
    expect(source).toMatch(
      /withTenantLock\s*\(\s*checkoutToken\s*,\s*`stock:consume:\${orderId}`/,
    );
  });

  it("protects payout requests with tenant distributed locks", () => {
    const source = readFileSync("src/lib/payouts.server.ts", "utf8");
    expect(source).toContain(
      'import { withTenantLock } from "./redis-lock.server"',
    );
    expect(source).toMatch(
      /withTenantLock\s*\(\s*merchantId\s*,\s*"payout:request"/,
    );
  });

  it("implements fast Redis replay cache in replay-guard.server.ts", () => {
    const source = readFileSync("src/lib/replay-guard.server.ts", "utf8");
    expect(source).toContain("idemRedisKey");
    // Whitespace-tolerant: the redisCommand calls wrap their argv across
    // lines; the fast GET → SET → DEL path is what matters.
    expect(source).toMatch(/redisCommand\(\s*\[\s*"GET"/);
    expect(source).toMatch(/redisCommand\(\s*\[\s*"SET"/);
    expect(source).toMatch(/redisCommand\(\s*\[\s*"DEL"/);
  });
});

describe("Multi-Tier Rate Limiting & Tenant Isolation", () => {
  it("declares segregated tenant and system buckets", () => {
    expect(BUCKETS["tenant.ingress.aggregate"]).toBeDefined();
    expect(BUCKETS["tenant.ingress.aggregate"].limit).toBeGreaterThanOrEqual(
      1000,
    );

    expect(BUCKETS["tenant.ingress.shopper"]).toBeDefined();
    expect(BUCKETS["tenant.ingress.shopper"].limit).toBeLessThanOrEqual(300);

    expect(BUCKETS["system.ingress"]).toBeDefined();
    expect(BUCKETS["system.auth"]).toBeDefined();
    expect(BUCKETS["system.auth"].limit).toBeLessThanOrEqual(30);
  });

  it("enforces tenant-level rate limiting via enforceTenantRateLimit", async () => {
    const res = await enforceTenantRateLimit("m_test_tenant", "192.168.1.100");
    expect(res.allowed).toBe(true);
    expect(res.verdict).toBeDefined();
  });

  it("classifies requests and bypasses static assets in server.ts", () => {
    const source = readFileSync("src/server.ts", "utf8");
    expect(source).toContain("isStaticAsset");
    expect(source).toContain("enforceTenantRateLimit");
    expect(source).toContain('enforceRateLimit("system.auth"');
    expect(source).toContain('enforceRateLimit("system.ingress"');
  });
});

describe("OpenResty Edge Caching & Optimization", () => {
  const nginxConfPath = resolve(
    process.cwd(),
    "ops/routing/nginx-blue-green.conf",
  );

  it("declares edge cache path and stampede lock in OpenResty", () => {
    const conf = readFileSync(nginxConfPath, "utf8");
    expect(conf).toContain("proxy_cache_path /var/cache/nginx/storefront");
    expect(conf).toContain("keys_zone=framique_storefront_cache:32m");
    expect(conf).toContain("proxy_cache_lock on;");
    expect(conf).toContain("proxy_cache_lock_timeout 5s;");
    expect(conf).toContain("proxy_cache_use_stale error timeout updating");
  });

  it("declares edge rate limiting and connection limits in OpenResty", () => {
    const conf = readFileSync(nginxConfPath, "utf8");
    expect(conf).toContain(
      "limit_req_zone $binary_remote_addr zone=edge_ip_limit:32m",
    );
    expect(conf).toContain(
      "limit_conn_zone $binary_remote_addr zone=edge_ip_conn:32m",
    );
    expect(conf).toContain("limit_req zone=edge_ip_limit burst=50 nodelay;");
    expect(conf).toContain("limit_conn edge_ip_conn 25;");
    expect(conf).toContain("limit_req_status 429;");
  });

  it("bypasses cache for personalized storefront routes and authorization headers", () => {
    const conf = readFileSync(nginxConfPath, "utf8");
    expect(conf).toContain("map $request_uri $path_skip_cache");
    expect(conf).toContain("map $http_authorization $auth_skip_cache");
    expect(conf).toContain("map $http_cookie $cookie_skip_cache");
    expect(conf).toContain("proxy_cache_bypass $skip_cache;");
    expect(conf).toContain("proxy_no_cache $skip_cache;");
  });

  it("caches custom domain hostname lookups in tenant-canary.server.ts", () => {
    const source = readFileSync("src/lib/tenant-canary.server.ts", "utf8");
    expect(source).toContain("cached<string | null>");
    expect(source).toContain("`domain_tenant:${host}`");
    expect(source).toContain("shared: true");
  });
});
