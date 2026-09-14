#!/usr/bin/env node
/**
 * Self-hosted release preflight — the last gate before `docker compose up` on a
 * production box.
 *
 * Two kinds of check:
 *  - STATIC: parse every compose/rule/dashboard file, resolve every bind mount
 *    relative to its own compose file, and refuse floating image tags. These run
 *    anywhere, including CI, and are covered by selfhost-preflight.test.ts.
 *  - HOST: file-mounted secrets and the environment an operator must supply.
 *    They cannot pass in CI (the values are git-ignored on purpose), so they are
 *    reported as SKIP unless --host is passed on the target machine.
 *
 * Exit code is the verdict: wire it to the deploy step.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";

const HOST = process.argv.includes("--host");
const rows = [];
const add = (state, name, detail = "") => rows.push({ state, name, detail });
const ok = (n, d) => add("PASS", n, d);
const bad = (n, d) => add("FAIL", n, d);
const skip = (n, d) => add("SKIP", n, d);

const ls = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f)) : []);

const COMPOSE = [
  ...ls("ops", /^docker-compose\..*\.ya?ml$/),
  "supabase/docker/docker-compose.yml",
].filter(existsSync);

const YAML_FILES = [
  ...COMPOSE,
  ...ls("ops/observability", /\.ya?ml$/),
  ...ls("ops/observability/grafana", /\.ya?ml$/),
  "supabase/docker/kong.yml",
].filter(existsSync);

// ------------------------------------------------------------------ static
for (const f of YAML_FILES) {
  try {
    load(readFileSync(f, "utf8"));
    ok(`yaml parses: ${f}`);
  } catch (e) {
    bad(`yaml parses: ${f}`, e.message);
  }
}

const dashboards = ls("ops/observability/grafana", /\.json$/);
if (!dashboards.length) bad("grafana dashboards present");
for (const f of dashboards) {
  try {
    const d = JSON.parse(readFileSync(f, "utf8"));
    if (!Array.isArray(d.panels) || d.panels.length === 0) bad(`dashboard has panels: ${f}`);
    else ok(`dashboard valid: ${f}`, `${d.panels.length} panels`);
  } catch (e) {
    bad(`dashboard valid: ${f}`, e.message);
  }
}

// Bind mounts are relative to the compose file's own directory, which is how
// `docker compose -f <file>` resolves them.
const SECRET_MOUNTS = [];
for (const f of COMPOSE) {
  const base = dirname(f);
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/^\s*-\s+(\.{1,2}\/[\w./-]+):/gm)) {
    const p = resolve(base, m[1]);
    const rel = p.replace(`${resolve(".")}/`, "");
    if (rel.includes("/secrets/") || rel.endsWith("/secrets")) {
      SECRET_MOUNTS.push(rel);
      continue; // git-ignored by design; checked in the host section
    }
    if (existsSync(p)) ok(`mount resolves: ${rel}`);
    else bad(`mount resolves: ${rel}`, `referenced by ${f}`);
  }
}

for (const f of COMPOSE) {
  const images = [...readFileSync(f, "utf8").matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  const floating = images.filter((i) => !/:[^:\s]+$/.test(i) || /:latest$/.test(i));
  if (floating.length) bad(`images pinned: ${f}`, floating.join(", "));
  else ok(`images pinned: ${f}`, `${images.length} images`);
}

// Postgres must never be reachable from outside the compose network, and the
// API gateway must terminate on loopback behind the edge proxy.
const sb = existsSync("supabase/docker/docker-compose.yml")
  ? readFileSync("supabase/docker/docker-compose.yml", "utf8")
  : "";
if (sb) {
  const db = sb.slice(sb.indexOf("\n  db:"), sb.indexOf("\n  auth:"));
  db.includes("ports:") ? bad("postgres not published to the host") : ok("postgres not published to the host");
  /ports:\s*\["127\.0\.0\.1:8000:8000"\]/.test(sb)
    ? ok("api gateway bound to loopback")
    : bad("api gateway bound to loopback");
}

const kong = existsSync("supabase/docker/kong.yml") ? readFileSync("supabase/docker/kong.yml", "utf8") : "";
if (kong) {
  for (const svc of ["auth-v1-open", "rest-v1", "storage-v1"]) {
    const i = kong.indexOf(`- name: ${svc}`);
    const block = i > -1 ? kong.slice(i, i + 900) : "";
    block.includes("name: rate-limiting") ? ok(`gateway rate limit: ${svc}`) : bad(`gateway rate limit: ${svc}`);
  }
  kong.includes("- consumer: service_role\n    group: anon")
    ? bad("service_role is never in the anon group")
    : ok("service_role is never in the anon group");
}

for (const p of ["ops/backup/backup.sh", "ops/backup/restore.sh", "ops/backup/rehearse.sh"]) {
  if (!existsSync(p)) bad(`operational script: ${p}`, "missing");
  else if ((statSync(p).mode & 0o111) === 0) bad(`operational script: ${p}`, "not executable");
  else ok(`operational script: ${p}`);
}
existsSync("scripts/db-migrate.mjs") ? ok("migration runner present") : bad("migration runner present");

// Anything a stack templates must exist in the env template that ships beside
// it, otherwise bring-up silently substitutes an empty string. Each stack owns
// its own template: ops/.env.example for our stacks, supabase/docker/.env.example
// for the vendored Supabase distribution.
const envKeysOf = (p) =>
  existsSync(p)
    ? new Set(
        readFileSync(p, "utf8")
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#"))
          .map((l) => l.split("=")[0].trim()),
      )
    : new Set();
const DOCKER_BUILTINS = new Set(["PWD", "HOME", "PATH"]);

const ENV_SCOPES = [
  {
    template: "ops/.env.example",
    files: [
      ...ls("ops", /^docker-compose\..*\.ya?ml$/),
      ...ls("ops/observability", /\.ya?ml$/),
      ...ls("ops/observability/grafana", /\.ya?ml$/),
    ],
  },
  // kong.yml is templated from the gateway container's environment, which
  // docker-compose.yml supplies from ANON_KEY / SERVICE_ROLE_KEY — so only the
  // compose file is checked against the distribution's template.
  { template: "supabase/docker/.env.example", files: ["supabase/docker/docker-compose.yml"] },
];

for (const scope of ENV_SCOPES) {
  const keys = envKeysOf(scope.template);
  if (!keys.size) {
    bad(`env template exists: ${scope.template}`, "missing or empty");
    continue;
  }
  const referenced = new Set();
  for (const f of scope.files.filter(existsSync)) {
    for (const m of readFileSync(f, "utf8").matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)) referenced.add(m[1]);
  }
  const undocumented = [...referenced].filter((k) => !keys.has(k) && !DOCKER_BUILTINS.has(k)).sort();
  undocumented.length
    ? bad(`every templated variable is in ${scope.template}`, undocumented.join(", "))
    : ok(`every templated variable is in ${scope.template}`, `${referenced.size} variables`);
}


// ------------------------------------------------------------------- host
const HOST_SECRETS = [
  "ops/secrets/framique_metrics_token",
  "ops/secrets/grafana_admin_password",
];
const HOST_ENV = [
  "REDIS_PASSWORD",
  "METRICS_TOKEN",
  "POSTGRES_EXPORTER_DSN",
  "GRAFANA_ADMIN_USER",
  "SUPABASE_URL",
];
if (!HOST) {
  skip("file-mounted secrets exist", `${HOST_SECRETS.length} files — run with --host on the server`);
  skip("operator environment is set", `${HOST_ENV.length} variables — run with --host on the server`);
  for (const rel of new Set(SECRET_MOUNTS)) skip(`secret mount: ${rel}`, "git-ignored by design");
} else {
  for (const p of HOST_SECRETS) {
    if (!existsSync(p)) bad(`secret file: ${p}`, "missing — see ops/README.md §2");
    else if ((statSync(p).mode & 0o077) !== 0) bad(`secret file: ${p}`, "must be chmod 600");
    else ok(`secret file: ${p}`);
  }
  for (const k of HOST_ENV) (process.env[k] ? ok(`env set: ${k}`) : bad(`env set: ${k}`, "unset"));
  const dsn = process.env["GLITCHTIP_DSN"] || process.env["SENTRY_DSN"];
  dsn ? ok("error backend configured") : bad("error backend configured", "set GLITCHTIP_DSN or SENTRY_DSN");
}

// ----------------------------------------------------------------- verdict
const fails = rows.filter((r) => r.state === "FAIL");
const skips = rows.filter((r) => r.state === "SKIP");
for (const r of rows) {
  if (r.state === "PASS" && !process.argv.includes("--verbose")) continue;
  console.log(`${r.state.padEnd(4)}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(
  `\nselfhost-preflight: ${rows.length - fails.length - skips.length}/${rows.length - skips.length} checks passed` +
    (skips.length ? `, ${skips.length} skipped (host-only)` : ""),
);
if (fails.length) {
  console.log(`\n${fails.length} blocking problem(s) — do not release.`);
  process.exit(1);
}
console.log(
  HOST
    ? "Ready: bring the stack up, then `bun run obs:verify` and `bun run err:verify` against it."
    : "Static checks clean. Re-run with --host on the target machine before release.",
);
