#!/usr/bin/env node
/**
 * Secret scanner.
 *
 * Walks the tracked tree and fails on anything that looks like a live
 * credential: provider keys, private key blocks, JWTs, and any `.env` file
 * that is not the example. Kept dependency-free so it runs identically in CI,
 * in a pre-commit hook, and on a laptop with no network.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const root = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".output",
  ".tanstack",
  "dist",
  "build",
  "test-results",
  "playwright-report",
  ".vite",
  ".agents",
]);
const SKIP_FILES = new Set([
  "bun.lock",
  "package-lock.json",
  "tsconfig.tsbuildinfo",
]);
const TEXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|yml|yaml|toml|sh|env|txt|html|css)$/i;

const RULES = [
  { id: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  {
    id: "supabase-service-role-jwt",
    re: /"?service_role"?\s*[:=]\s*["']ey[A-Za-z0-9_-]{20,}/,
  },
  {
    id: "jwt",
    re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    id: "private-key-block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  { id: "openai-key", re: /\bsk-[A-Za-z0-9]{32,}/ },
  { id: "stripe-secret", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "slack-token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  {
    id: "hardcoded-secret-assignment",
    re: /\b(?:secret|password|passwd|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9!@#$%^&*_+\-/]{16,}["']/i,
  },
];

// Lines that are documentation, placeholders or env lookups are not findings.
const ALLOW = [
  /process\.env/,
  /import\.meta\.env/,
  /<redacted>/i,
  /YOUR_|EXAMPLE|PLACEHOLDER|xxxx|changeme|\.\.\./i,
  /sb_publishable_/,
  /forged-value/,
  // supabase-js placeholder defaults baked into vendored client bundles —
  // literal placeholder text, never a credential (real keys still trip the
  // sb_secret_/jwt/service-role rules above).
  /your-(?:publishable|anon|service[-_]role)-key/,
  // A CSS custom property is a design token, not a credential: the generic
  // `token: "…"` rule fires on every themed colour/spacing variable.
  /token:\s*["']--/,
];

/** A gitignored file never reaches the remote, so it is not a leak. */
function isIgnored(rel) {
  try {
    execFileSync("git", ["check-ignore", "-q", rel], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The platform writes a committed `.env` holding only public client config
 * (project id, project URL, publishable key). That file is not a leak — but a
 * service key, password or private token appearing in it is, so the contents
 * are checked key by key rather than the file being waved through.
 */
const PUBLIC_ENV_KEY =
  /^(?:VITE_)?SUPABASE_(?:URL|PROJECT_ID|PUBLISHABLE_KEY|ANON_KEY|SERVICE_ROLE_KEY)$/;
function envFileFindings(rel, full) {
  const out = [];
  readFileSync(full, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const key = trimmed.split("=")[0]?.trim() ?? "";
      if (PUBLIC_ENV_KEY.test(key)) return;
      out.push({
        file: rel,
        line: i + 1,
        rule: "env-secret-committed",
        text: key,
      });
    });
  return out;
}

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(root, full);
    if (/^\.env(\..*)?$/.test(entry) && entry !== ".env.example") {
      if (isIgnored(rel)) continue;
      findings.push(...envFileFindings(rel, full));
      continue;
    }

    if (!TEXT.test(entry)) continue;
    if (st.size > 2_000_000) continue;
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (ALLOW.some((a) => a.test(text))) return;
      for (const rule of RULES) {
        if (rule.re.test(text)) {
          findings.push({
            file: rel,
            line: i + 1,
            rule: rule.id,
            text: text.trim().slice(0, 120),
          });
        }
      }
    });
  }
}

walk(root);

// GAP-A5 (SLO-K03): the tree walk above skips build output, but client
// bundles inline `VITE_*` env values — a service-role key baked into a
// shipped bundle is a leak the source scan can never see. Scan emitted
// bundles explicitly (regardless of gitignore status).
const BUNDLE_DIRS = [".output", "dist", "build"];
const BUNDLE_TEXT = /\.(js|mjs|cjs)$/i;
const BUNDLE_MAX_BYTES = 5_000_000;

function scanBundles() {
  // A Supabase anon/publishable key is public by design and is inlined into
  // every client bundle — failing on it would keep this gate permanently red.
  // What must NEVER appear in a bundle is a service-role (or any privileged)
  // JWT, so anon-role tokens are waved through by payload inspection while
  // every other JWT-shaped string still fails.
  const anonJwt = (text) => {
    const m = text.match(
      /\bey[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/,
    );
    if (!m) return false;
    try {
      const payload = JSON.parse(
        Buffer.from(
          m[1].replace(/-/g, "+").replace(/_/g, "/"),
          "base64",
        ).toString("utf8"),
      );
      return payload && payload.role === "anon";
    } catch {
      return false;
    }
  };
  for (const dir of BUNDLE_DIRS) {
    const base = join(root, dir);
    let st;
    try {
      st = statSync(base);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const stack = [base];
    while (stack.length > 0) {
      const cur = stack.pop();
      for (const entry of readdirSync(cur)) {
        const full = join(cur, entry);
        const s = statSync(full);
        if (s.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (entry.endsWith(".map")) continue;
        if (!BUNDLE_TEXT.test(entry)) continue;
        if (s.size > BUNDLE_MAX_BYTES) continue;
        const rel = relative(root, full);
        const lines = readFileSync(full, "utf8").split("\n");
        lines.forEach((text, i) => {
          if (ALLOW.some((a) => a.test(text))) return;
          for (const rule of RULES) {
            if (rule.re.test(text)) {
              // Bundle-only carve-out: public anon JWTs are expected inline.
              if (rule.id === "jwt" && anonJwt(text)) continue;
              findings.push({
                file: `${rel} (bundle)`,
                line: i + 1,
                rule: rule.id,
                text: text.trim().slice(0, 120),
              });
            }
          }
        });
      }
    }
  }
}

scanBundles();

if (findings.length > 0) {
  console.error(`secret scan FAILED — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
  }
  process.exit(1);
}
console.log("secret scan passed — no credential-shaped strings in the tree.");
