import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeHostname } from "./domains";

describe("OpenResty & lua-resty-acme Custom Domain Edge Router Integration", () => {
  const dockerfilePath = resolve(
    process.cwd(),
    "ops/docker/Dockerfile.openresty",
  );
  const nginxConfPath = resolve(
    process.cwd(),
    "ops/routing/nginx-blue-green.conf",
  );
  const composePath = resolve(
    process.cwd(),
    "ops/docker-compose.blue-green.yml",
  );
  const prometheusPath = resolve(
    process.cwd(),
    "ops/observability/prometheus.yml",
  );

  describe("Dockerfile.openresty", () => {
    it("exists and is based on Alpine OpenResty", () => {
      expect(existsSync(dockerfilePath)).toBe(true);
      const content = readFileSync(dockerfilePath, "utf8");
      expect(content).toContain("FROM openresty/openresty:1.25.3.1-alpine");
    });

    it("installs fffonion/lua-resty-acme and pintsized/lua-resty-http", () => {
      const content = readFileSync(dockerfilePath, "utf8");
      expect(content).toContain(
        "opm get fffonion/lua-resty-acme pintsized/lua-resty-http",
      );
    });

    it("creates persistent ACME directory and generates fallback SSL certificates", () => {
      const content = readFileSync(dockerfilePath, "utf8");
      expect(content).toContain("/var/lib/openresty/acme");
      expect(content).toContain("/etc/openresty/ssl/default.key");
      expect(content).toContain("/etc/openresty/ssl/default.pem");
      expect(content).toContain("openssl req -x509");
    });

    it("declares healthcheck and executes OpenResty binary", () => {
      const content = readFileSync(dockerfilePath, "utf8");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("curl -f -s http://127.0.0.1/healthz");
      expect(content).toContain(
        'CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]',
      );
    });
  });

  describe("OpenResty Nginx Configuration (nginx-blue-green.conf)", () => {
    it("declares shared memory dictionaries for ACME and worker events", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("lua_shared_dict acme 16m;");
      expect(content).toContain("lua_shared_dict autossl_events 128k;");
    });

    it("configures DNS resolver for container mesh resolution", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("resolver 127.0.0.11");
    });

    it("initializes lua-resty-acme autossl with file storage and dynamic domain callback", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain('require("resty.acme.autossl")');
      expect(content).toContain("tos_accepted = true");
      expect(content).toContain('storage_adapter = "file"');
      expect(content).toContain('dir = "/var/lib/openresty/acme"');
      expect(content).toContain(
        "domain_whitelist_callback = function(domain, is_new_cert_needed)",
      );
      expect(content).toContain("/api/public/domains/verify-sni");
    });

    it("initializes autossl worker daemon in init_worker_by_lua_block", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("init_worker_by_lua_block {");
      expect(content).toContain('require("resty.acme.autossl").init_worker()');
    });

    it("handles ACME HTTP-01 challenges on port 80 and 443", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("location /.well-known/acme-challenge/ {");
      expect(content).toContain(
        'require("resty.acme.autossl").serve_http_challenge()',
      );
    });

    it("terminates SSL on port 443 with dynamic SNI certificate dispatch", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("listen 443 ssl;");
      expect(content).toContain(
        "ssl_certificate /etc/openresty/ssl/default.pem;",
      );
      expect(content).toContain(
        "ssl_certificate_key /etc/openresty/ssl/default.key;",
      );
      expect(content).toContain("ssl_certificate_by_lua_block {");
      expect(content).toContain(
        'require("resty.acme.autossl").ssl_certificate()',
      );
    });

    it("preserves blue-green upstream load balancing and zero-downtime draining", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("upstream framique_target_blue");
      expect(content).toContain("upstream framique_target_green");
      expect(content).toContain("proxy_http_version 1.1;");
      expect(content).toContain('proxy_set_header Connection "";');
      expect(content).toContain(
        "proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;",
      );
      expect(content).toContain("proxy_next_upstream_tries 3;");
      expect(content).toContain("keepalive_requests 10000;");
    });
  });

  describe("Docker Compose Blue/Green Topology", () => {
    it("configures OpenResty edge router with acme volume persistence", () => {
      const content = readFileSync(composePath, "utf8");
      expect(content).toContain("edge-router:");
      expect(content).toContain("openresty-acme:/var/lib/openresty/acme");
      expect(content).toContain("ACME_ACCOUNT_EMAIL=");
      expect(content).toContain("ACME_STAGING=");
    });

    it("declares blue and green cluster instances with isolated ports", () => {
      const content = readFileSync(composePath, "utf8");
      expect(content).toContain("framique-blue:");
      expect(content).toContain("framique-green:");
      expect(content).toContain("127.0.0.1:3001:3000");
      expect(content).toContain("127.0.0.1:3002:3000");
    });
  });

  describe("Edge Storefront Caching & Rate Limiting", () => {
    it("configures proxy_cache_path with keys_zone and stampede lock", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("proxy_cache_path /var/cache/nginx/storefront");
      expect(content).toContain("keys_zone=framique_storefront_cache:32m");
      expect(content).toContain("proxy_cache_lock on;");
      expect(content).toContain("proxy_cache_lock_timeout 5s;");
      expect(content).toContain("proxy_cache_use_stale error timeout updating");
      expect(content).toContain(
        "add_header X-Cache-Status $upstream_cache_status always;",
      );
    });

    it("configures edge IP rate limiting and connection zones", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain(
        "limit_req_zone $binary_remote_addr zone=edge_ip_limit:32m rate=50r/s;",
      );
      expect(content).toContain(
        "limit_conn_zone $binary_remote_addr zone=edge_ip_conn:32m;",
      );
      expect(content).toContain(
        "limit_req zone=edge_ip_limit burst=50 nodelay;",
      );
      expect(content).toContain("limit_conn edge_ip_conn 25;");
      expect(content).toContain("limit_req_status 429;");
    });

    it("bypasses edge cache on personalized and authenticated paths", () => {
      const content = readFileSync(nginxConfPath, "utf8");
      expect(content).toContain("map $request_uri $path_skip_cache");
      expect(content).toContain("map $http_authorization $auth_skip_cache");
      expect(content).toContain("map $http_cookie $cookie_skip_cache");
      expect(content).toContain("proxy_cache_bypass $skip_cache;");
      expect(content).toContain("proxy_no_cache $skip_cache;");
    });
  });

  describe("Observability & Prometheus Metrics Scrape Targets", () => {
    it("scrapes active blue and green application pods", () => {
      const content = readFileSync(prometheusPath, "utf8");
      expect(content).toContain('targets: ["framique-blue:3000"]');
      expect(content).toContain('targets: ["framique-green:3000"]');
      expect(content).toContain("slot: blue");
      expect(content).toContain("slot: green");
    });

    it("scrapes openresty edge router metrics", () => {
      const content = readFileSync(prometheusPath, "utf8");
      expect(content).toContain("job_name: openresty-edge");
      expect(content).toContain('targets: ["edge-router:80"]');
    });
  });

  describe("Custom Domain Whitelist Normalization", () => {
    it("normalizes and accepts legitimate merchant custom domains", () => {
      expect(normalizeHostname("https://Shop.FashionBD.com/")).toBe(
        "shop.fashionbd.com",
      );
      expect(normalizeHostname("store.clothing.com.bd")).toBe(
        "store.clothing.com.bd",
      );
      expect(normalizeHostname("my-brand.store")).toBe("my-brand.store");
    });

    it("rejects illegal, IP, or reserved hostnames", () => {
      expect(() => normalizeHostname("192.168.1.1")).toThrow();
      expect(() => normalizeHostname("admin.framique.app")).toThrow();
      expect(() => normalizeHostname("")).toThrow();
    });
  });
});
