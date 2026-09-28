/**
 * OpenAPI spec anti-drift gate (lane G4).
 *
 * (a) openapi.yaml must parse and carry info/version/paths.
 * (b) Every src/routes/api route file must map to >= 1 spec path via the
 *     x-source-file marker (and no marker may point at a deleted file).
 * (c) Spot-checks pin real handler methods/statuses so the spec cannot rot.
 *
 * Run: bun x vitest run openapi (repo config includes openapi/**).
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// js-yaml is a transitive dependency already in the repo lockfiles
// (@eslint/eslintrc); no new package is installed for this suite.
// Loaded via require so the suite needs no type shim for its untyped build.
const require = createRequire(import.meta.url);
const { load: loadYaml } = require("js-yaml") as {
  load: (src: string) => unknown;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SPEC_PATH = join(HERE, "openapi.yaml");
const API_DIR = join(ROOT, "src", "routes", "api");

type Operation = {
  operationId?: string;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
};

type PathItem = {
  "x-source-file"?: string;
  "x-undocumented"?: boolean;
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  [key: string]: unknown;
};

type Spec = {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, PathItem>;
};

function loadSpec(): Spec {
  const raw = readFileSync(SPEC_PATH, "utf8");
  const doc = loadYaml(raw) as Spec;
  return doc;
}

function routeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
        out.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  };
  walk(API_DIR);
  return out.sort();
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options"];

describe("openapi spec parses", () => {
  it("loads as YAML with info, version and a non-empty paths map", () => {
    const doc = loadSpec();
    expect(typeof doc).toBe("object");
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(doc.info?.title).toBeTruthy();
    expect(doc.info?.version).toBeTruthy();
    expect(doc.paths).toBeTypeOf("object");
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(30);
  });

  it("every operation has an operationId and at least one response", () => {
    const doc = loadSpec();
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const method of HTTP_METHODS) {
        const op = item[method] as Operation | undefined;
        if (!op || typeof op !== "object") continue;
        expect(
          op.operationId,
          `${method.toUpperCase()} ${path} needs operationId`,
        ).toBeTruthy();
        expect(
          Object.keys(op.responses ?? {}).length,
          `${method.toUpperCase()} ${path} needs responses`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("filesystem-vs-spec coverage (anti-drift gate)", () => {
  it("every route file maps to >= 1 spec path", () => {
    const doc = loadSpec();
    const covered = new Set(
      Object.values(doc.paths ?? {})
        .map((item) => item["x-source-file"])
        .filter((v): v is string => typeof v === "string"),
    );
    const missing = routeFiles().filter((f) => !covered.has(f));
    expect(
      missing,
      `route files with no spec path: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("no x-source-file marker points at a missing file", () => {
    const doc = loadSpec();
    const files = new Set(routeFiles());
    const stale = Object.entries(doc.paths ?? {})
      .filter(([, item]) => typeof item["x-source-file"] === "string")
      .map(([path, item]) => ({ path, file: item["x-source-file"] as string }))
      .filter(({ file }) => !files.has(file));
    expect(
      stale,
      `stale markers: ${stale.map((s) => `${s.path} -> ${s.file}`).join(", ")}`,
    ).toEqual([]);
  });

  it("exactly the known ambiguous endpoints carry x-undocumented", () => {
    const doc = loadSpec();
    const flagged = Object.entries(doc.paths ?? {})
      .filter(([, item]) => item["x-undocumented"] === true)
      .map(([path]) => path)
      .sort();
    expect(flagged).toEqual([
      "/api/admin/merchant/{id}/risk-tier",
      "/api/public/payments/{provider}",
    ]);
  });
});

describe("endpoint spot-checks", () => {
  const doc = loadSpec();
  const ops = (path: string) =>
    Object.keys(doc.paths?.[path] ?? {}).filter((k) =>
      HTTP_METHODS.includes(k),
    );

  it("oauth token supports POST + OPTIONS preflight", () => {
    expect(ops("/api/public/oauth/token").sort()).toEqual(["options", "post"]);
    const post = doc.paths?.["/api/public/oauth/token"]?.post;
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "500",
    ]);
  });

  it("oauth revoke always answers POST 200", () => {
    expect(ops("/api/public/oauth/revoke").sort()).toEqual(["options", "post"]);
    expect(
      Object.keys(
        doc.paths?.["/api/public/oauth/revoke"]?.post?.responses ?? {},
      ),
    ).toEqual(["200"]);
  });

  it("all seventeen cron jobs expose GET(405-ref) + POST", () => {
    const cronPaths = Object.keys(doc.paths ?? {}).filter((p) =>
      p.startsWith("/api/public/cron/"),
    );
    expect(cronPaths.length).toBe(17);
    for (const path of cronPaths) {
      expect(ops(path).sort(), path).toEqual(["get", "post"]);
      const post = doc.paths?.[path]?.post;
      expect(post?.security, `${path} must require CronBearer`).toEqual([
        { CronBearer: [] },
      ]);
    }
  });

  it("v1 orders list + detail + notes are covered with bearer auth", () => {
    for (const path of [
      "/api/public/v1/orders",
      "/api/public/v1/orders/{id}",
      "/api/public/v1/orders/{id}/notes",
    ]) {
      expect(doc.paths?.[path], path).toBeTruthy();
    }
    const get = doc.paths?.["/api/public/v1/orders"]?.get;
    expect(get?.security).toEqual([{ V1Bearer: [] }]);
    expect(get?.operationId).toBe("v1ListOrders");
  });

  it("telemetry collectors are POST-only with an explicit 405 GET", () => {
    for (const path of [
      "/api/public/ads/click",
      "/api/public/analytics/beacon",
      "/api/public/vitals",
      "/api/public/errors",
    ]) {
      expect(ops(path).sort(), path).toEqual(["get", "post"]);
      expect(
        Object.keys(doc.paths?.[path]?.get?.responses ?? {}),
        `${path} GET`,
      ).toEqual(["405"]);
    }
  });

  it("channel webhook enumerates exactly whatsapp + messenger", () => {
    const params = (
      (doc.paths?.["/api/public/channels/{channel}"]?.["parameters"] as Array<{
        name?: string;
        schema?: { enum?: string[] };
      }>) ?? []
    ).find((p) => p.name === "channel");
    expect(params?.schema?.enum?.sort()).toEqual(["messenger", "whatsapp"]);
  });

  it("platform provider enum matches the billing rail set", () => {
    const params = (
      (doc.paths?.["/api/public/payments/platform/{provider}"]?.[
        "parameters"
      ] as Array<{ name?: string; schema?: { enum?: string[] } }>) ?? []
    ).find((p) => p.name === "provider");
    expect(params?.schema?.enum?.sort()).toEqual(
      [
        "bank_transfer",
        "bkash",
        "card",
        "nagad",
        "rocket",
        "sslcommerz",
      ].sort(),
    );
  });

  it("metrics scrape target documents the closed-by-default 404", () => {
    expect(ops("/api/public/metrics")).toEqual(["get"]);
    expect(
      Object.keys(
        doc.paths?.["/api/public/metrics"]?.get?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "401", "404"]);
  });
});
