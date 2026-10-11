#!/usr/bin/env node
/**
 * SAST suspicious-diff scanner (blocking CI gate).
 *
 * Scans *changed* code — added lines in the working tree plus the committed
 * range vs a base ref (default: origin/main) — for patterns that deserve a
 * human's eyes before they land:
 *
 *   dynamic-exec    eval( / new Function( outside *.test.* fixtures
 *   dynamic-import  import( with a non-literal specifier (variable / template)
 *   html-sink       dangerouslySetInnerHTML / .innerHTML = outside *.test.*
 *   network-egress  fetch()/XHR/WebSocket/EventSource to a non-allowlisted host
 *   shell-exec      child_process / exec* / spawn* / shell:true (app code only —
 *                   scripts/ and ops/ legitimately shell out, so they are out
 *                   of scope for this rule)
 *   secret-access   privileged service-key env names outside *.server.ts
 *   csp-sandbox     allow-same-origin / unsafe-inline outside *.test.*
 *
 * Modes:
 *   node scripts/sast-scan.mjs                 # changed code (CI default)
 *   node scripts/sast-scan.mjs --base <ref>    # changed code vs <ref>
 *   node scripts/sast-scan.mjs --full          # whole tree (local baselining)
 *   node scripts/sast-scan.mjs -- <path>...    # exactly these files, all lines
 *
 * Findings print as `file:line  [rule-id]  snippet` and exit non-zero.
 * A line can carry an inline suppression with a mandatory reason, e.g.:
 *
 *   spawnSync("git", args); // sast-allow: shell-exec -- one-shot migration probe, no user input
 *
 * Suppressions are visible in the diff itself, which is the point: the
 * reviewer sees the risk and the reason together. A `sast-allow:` without a
 * reason does NOT suppress.
 *
 * Test files (*.test.*, __fixtures__) are out of scope for the
 * attacker-string rules: validator suites must contain attack strings as
 * *data* (negative vectors), and flagging them would make security testing
 * impossible. Tests still ship no code, and the validators they cover are
 * scanned.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const CODE_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "sh",
  "sql",
  "yml",
  "yaml",
]);
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
  ".artifacts",
  "artifacts",
  "coverage",
]);
const SKIP_FILES = new Set([
  "bun.lock",
  "package-lock.json",
  "tsconfig.tsbuildinfo",
]);
// This file's own RULES table contains the suspicious strings by necessity
// (it defines the patterns). It is excluded from scanning itself; changes to
// it are still reviewed as normal diffs.
const SELF = "scripts/sast-scan.mjs";

const isTestish = (rel) =>
  rel.includes(".test.") ||
  rel.includes("__tests__") ||
  rel.includes("__fixtures__");
const inDir = (rel, dir) => rel === dir || rel.startsWith(`${dir}/`);
const isTooling = (rel) => inDir(rel, "scripts") || inDir(rel, "ops");
const isServerBoundary = (rel) => rel.endsWith(".server.ts");
const extOf = (rel) => (rel.split(".").pop() ?? "").toLowerCase();

function scannable(rel) {
  if (rel === SELF) return false;
  const parts = rel.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  const base = parts[parts.length - 1];
  if (SKIP_FILES.has(base)) return false;
  if (base.endsWith(".min.js") || base.endsWith(".bak")) return false;
  return CODE_EXTS.has(extOf(rel));
}

// ---------------------------------------------------------------------------
// Network allowlist: hosts the product is known to talk to. Anything else in
// a fetch()/XHR/WebSocket call site is a finding. Extend with a reason, never
// silently — exfiltration hides in new egress.
// ---------------------------------------------------------------------------
const ALLOW_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "example.com",
  "example.org",
  "w3.org",
  "schema.org",
  "sitemaps.org",
  "framique.com",
  "api.framique.com",
  "framique.qubickle.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "openrouter.ai",
  "wa.me",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "images.unsplash.com",
  "instagram.com",
  "x.com",
  "api.resend.com",
  "tokenized.sandbox.bka.sh",
  "sandbox.sslcommerz.com",
]);
const ALLOW_SUFFIX = [".test", ".example", ".localhost", ".invalid", ".local"];

function hostAllowed(host) {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (ALLOW_HOSTS.has(h)) return true;
  return ALLOW_SUFFIX.some((s) => h === s.slice(1) || h.endsWith(s));
}

// ---------------------------------------------------------------------------
// Rules: { id, scope(rel)->bool, check(line, ctx)->string|null }
// check returns a detail string when the line is a finding.
// ---------------------------------------------------------------------------
const RULES = [
  {
    id: "dynamic-exec",
    scope: (rel) => !isTestish(rel),
    check(line) {
      if (/\beval\s*\(/.test(line)) return "eval() call";
      if (/new\s+Function\s*\(/.test(line)) return "new Function()";
      return null;
    },
  },
  {
    id: "dynamic-import",
    scope: () => true,
    check(line, ctx) {
      const m = line.match(/import\s*\(\s*($|[^'"`\s])/);
      if (!m) return null;
      // `import(` at end of line with a literal on the next line is static.
      if (m[1] === "" && ctx.next) {
        if (/^\s*['"`]/.test(ctx.next)) return null;
      } else if (m[1] === "") {
        return null;
      }
      return "dynamic import() with non-literal specifier";
    },
  },
  {
    id: "html-sink",
    scope: (rel) => !isTestish(rel),
    check(line) {
      if (/dangerouslySetInnerHTML/.test(line))
        return "dangerouslySetInnerHTML sink";
      if (/\.innerHTML\s*=/.test(line)) return "innerHTML assignment";
      return null;
    },
  },
  {
    id: "network-egress",
    scope: (rel) => !isTestish(rel),
    check(line) {
      if (!/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(line))
        return null;
      const m = line.match(/https?:\/\/([^/'"`\s:${]+)/);
      if (!m) return null; // relative URL or variable — not resolvable here
      if (hostAllowed(m[1])) return null;
      return `egress to non-allowlisted host ${m[1]}`;
    },
  },
  {
    id: "shell-exec",
    scope: (rel) => {
      if (isTooling(rel)) return false;
      if (isTestish(rel)) return false;
      return true;
    },
    check(line) {
      if (/child_process/.test(line)) return "child_process import";
      // (?<!\.) keeps regex `.exec(` (String/RegExp.prototype.exec) quiet.
      if (
        /(?<![.\w])(execFileSync|execSync|execFile|spawnSync|spawn)\s*\(/.test(
          line,
        )
      )
        return "subprocess execution";
      if (/\bshell\s*:\s*true\b/.test(line)) return "shell:true spawn option";
      return null;
    },
  },
  {
    id: "secret-access",
    // YAML manifests (compose, workflow env wiring) *declare* secret bindings;
    // that is normal. This rule targets code that *reads* privileged keys
    // outside the server boundary, so yml/yaml are out of scope here.
    scope: (rel) =>
      !["yml", "yaml"].includes(extOf(rel)) &&
      !isServerBoundary(rel) &&
      !isTestish(rel),
    check(line) {
      // `credentialEnv: "X"` declares which env holds a credential — it does
      // not read it. Actual reads (process.env.X) still flag.
      if (/credentialEnv\s*:/.test(line)) return null;
      if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/.test(line))
        return "privileged service key read outside *.server.ts";
      if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(line))
        return "private key material";
      return null;
    },
  },
  {
    id: "csp-sandbox",
    scope: (rel) => !isTestish(rel),
    check(line) {
      if (/allow-same-origin/.test(line))
        return "sandbox allow-same-origin (frame reaches parent origin)";
      if (/unsafe-inline/.test(line)) return "unsafe-inline weakening";
      return null;
    },
  },
];

// A suppression must name rule id(s) AND carry a reason (>= 10 chars).
function suppressed(line, ruleId) {
  const i = line.indexOf("sast-allow:");
  if (i === -1) return false;
  const m = line
    .slice(i)
    .match(/^sast-allow:\s*([A-Za-z0-9_,\s-]+?)\s*--\s*(.{10,})\s*$/);
  if (!m) return false;
  return m[1].split(/[,\s]+/).includes(ruleId);
}

// ---------------------------------------------------------------------------
// Change collection
// ---------------------------------------------------------------------------
function git(args_) {
  return execFileSync("git", args_, { cwd: ROOT, encoding: "utf8" }).trim();
}
function refExists(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

/** Parse `git diff -U0` into Map<file, Set<added line numbers (new side)>>. */
function addedLines(diffText) {
  const out = new Map();
  let file = null;
  let newLine = 0;
  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ b/")) {
      file = raw.slice(6);
      if (!out.has(file)) out.set(file, new Set());
      newLine = 0;
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/\+(\d+)(?:,(\d+))?/);
      newLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (file === null) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      out.get(file).add(newLine);
      newLine += 1;
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      // removed line: new-side counter does not advance
    } else {
      newLine += 1; // context (none at -U0, except "\ No newline" markers)
      if (raw.startsWith("\\")) newLine -= 1;
    }
  }
  return out;
}

function mergeInto(dst, src) {
  for (const [f, lines] of src) {
    if (!dst.has(f)) dst.set(f, new Set());
    for (const l of lines) dst.get(f).add(l);
  }
  return dst;
}

function resolveBase() {
  const flag = args.indexOf("--base");
  if (flag !== -1 && args[flag + 1]) return args[flag + 1];
  if (process.env.SAST_BASE) return process.env.SAST_BASE;
  for (const c of [
    "refs/remotes/origin/main",
    "origin/main",
    "refs/remotes/origin/master",
    "origin/master",
  ])
    if (refExists(c)) return c;
  return null;
}

function collectTargets() {
  // Explicit file list: `node scripts/sast-scan.mjs -- <path>...`
  const dash = args.indexOf("--");
  if (dash !== -1 && args.length > dash + 1) {
    const map = new Map();
    for (const p of args.slice(dash + 1)) {
      const abs = resolve(ROOT, p);
      const rel = relative(ROOT, abs);
      if (rel === SELF) {
        console.error(
          `sast scan: ${SELF} defines the patterns, skipping self.`,
        );
        continue;
      }
      try {
        const n = readFileSync(abs, "utf8").split("\n").length;
        map.set(rel, new Set(Array.from({ length: n }, (_, i) => i + 1)));
      } catch {
        console.error(`sast scan: cannot read ${p} — skipped`);
      }
    }
    return { map, desc: "explicit file list" };
  }

  if (args.includes("--full")) {
    const map = new Map();
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        const rel = relative(ROOT, full);
        if (!scannable(rel)) continue;
        if (statSync(full).size > 2_000_000) continue;
        const n = readFileSync(full, "utf8").split("\n").length;
        map.set(rel, new Set(Array.from({ length: n }, (_, i) => i + 1)));
      }
    };
    walk(ROOT);
    return { map, desc: "full tree" };
  }

  // Default: changed code. Committed range vs base + working tree vs HEAD +
  // untracked files (whole file — a new file is all added lines).
  const map = new Map();
  const base = resolveBase();
  if (base) {
    try {
      mergeInto(map, addedLines(git(["diff", "-U0", `${base}...HEAD`, "--"])));
    } catch (e) {
      console.error(`sast scan: range diff vs ${base} failed — ${e.message}`);
      process.exit(2);
    }
  }
  try {
    mergeInto(map, addedLines(git(["diff", "-U0", "HEAD", "--"])));
  } catch (e) {
    console.error(`sast scan: working-tree diff failed — ${e.message}`);
    process.exit(2);
  }
  try {
    const untracked = git(["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .filter(Boolean);
    for (const rel of untracked) {
      try {
        const n = readFileSync(join(ROOT, rel), "utf8").split("\n").length;
        if (!map.has(rel)) map.set(rel, new Set());
        for (let i = 1; i <= n; i++) map.get(rel).add(i);
      } catch {
        // unreadable (binary, symlink) — not scannable anyway
      }
    }
  } catch {
    // no git — fall through with whatever we have
  }
  // Deleted files have no on-disk content; drop them. Keep only scannables.
  for (const rel of [...map.keys()]) {
    if (!scannable(rel)) {
      map.delete(rel);
      continue;
    }
    try {
      if (!statSync(join(ROOT, rel)).isFile()) map.delete(rel);
    } catch {
      map.delete(rel);
    }
  }
  return {
    map,
    desc: base
      ? `changed code vs ${base} + working tree`
      : "working tree vs HEAD",
  };
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
const { map: targets, desc } = collectTargets();
const findings = [];
let checkedLines = 0;

for (const [rel, lines] of [...targets.entries()].sort()) {
  const content = readFileSync(join(ROOT, rel), "utf8").split("\n");
  for (const ln of [...lines].sort((a, b) => a - b)) {
    const line = content[ln - 1];
    if (line === undefined) continue; // line-number drift between diff and worktree
    // Comment-only lines cannot execute: prose about a pattern ("never use
    // eval()", "allow-same-origin is withheld") is documentation, not risk.
    // Code with a trailing comment is still checked.
    if (/^\s*(?:\/\/|\/\*|\*|#|<!--|%|--(?:\s|$))/.test(line)) continue;
    checkedLines += 1;
    const ctx = { next: content[ln] ?? "" };
    for (const rule of RULES) {
      if (!rule.scope(rel)) continue;
      let detail = null;
      try {
        detail = rule.check(line, ctx);
      } catch {
        detail = null;
      }
      if (!detail) continue;
      if (suppressed(line, rule.id)) continue;
      findings.push({
        file: rel,
        line: ln,
        rule: rule.id,
        detail,
        text: line.trim().slice(0, 120),
      });
      if (line.includes("sast-allow:") && !suppressed(line, rule.id)) {
        findings[findings.length - 1].detail +=
          " (note: malformed sast-allow — needs `sast-allow: <id> -- <reason>`)";
      }
    }
  }
}

if (findings.length > 0) {
  console.error(
    `sast scan FAILED — ${findings.length} finding(s) in ${desc}:\n`,
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.detail}`);
    console.error(`    ${f.text}`);
  }
  console.error(
    `\nIf a finding is an intentional, reviewed use, add a trailing\n` +
      `// sast-allow: <rule-id> -- <reason>  (reason required, stays in the diff)`,
  );
  process.exit(1);
}
console.log(
  `sast scan passed — ${checkedLines} added line(s) across ${targets.size} changed file(s) (${desc}).`,
);
