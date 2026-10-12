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
 *   tainted-egress  fetch()/new URL()/WS/EventSource/window.open() whose
 *                   *host* comes from request- or DB-tainted data
 *                   (intra-file taint, no deps; forwarding wrappers out)
 *   tainted-redirect  redirect()/location targets built from tainted data
 *   tainted-fs      filesystem-write paths built from tainted data
 *   tainted-auth    authorization decisions on request-derived role/flag
 *                   data (req-provenance only — DB role checks are normal)
 *   tainted-url-attr  src=/href= from request-derived data (req-only: DB
 *                   rendering is the product's normal path)
 *
 * Modes:
 *   node scripts/sast-scan.mjs                 # changed code (CI default)
 *   node scripts/sast-scan.mjs --base <ref>    # changed code vs <ref>
 *   node scripts/sast-scan.mjs --full          # whole tree (local baselining)
 *   node scripts/sast-scan.mjs -- <path>...    # exactly these files, all lines
 *
 * Base resolution (first hit wins): --base <ref>, SAST_BASE, origin/main,
 * origin/master. With --require-base (or SAST_REQUIRE_BASE=1) an
 * unresolvable base is a hard error (exit 2) — the scan never silently
 * narrows to working-tree-only, which would pass vacuously on a clean
 * checkout. CI always sets SAST_REQUIRE_BASE=1; local runs without the
 * flag keep the lenient working-tree fallback.
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
 * Test files (*.test.*, *.spec.*, __fixtures__) are out of scope for the
 * attacker-string rules: validator suites and E2E adversarial specs must
 * contain attack strings as *data* (negative vectors), and flagging them
 * would make security testing impossible. Tests still ship no code, and
 * the validators they cover are scanned.
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
  rel.includes(".spec.") ||
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
  {
    // Taint-tracked sinks: the literal patterns above cannot see a
    // destination built through a variable. These fire only when a
    // request- or DB-tainted value (see analyzeTaint) reaches the sink
    // *within the scanned (changed) lines* — the taint map itself is built
    // from the whole file, but findings stay diff-scoped like every rule.
    id: "tainted-egress",
    scope: (rel) => !isTestish(rel),
    check(line, ctx) {
      return taintedEgress(line, ctx?.taint);
    },
  },
  {
    id: "tainted-redirect",
    scope: (rel) => !isTestish(rel),
    check(line, ctx) {
      return taintedRedirect(line, ctx?.taint);
    },
  },
  {
    id: "tainted-fs",
    scope: (rel) => !isTestish(rel),
    check(line, ctx) {
      return taintedFs(line, ctx?.taint);
    },
  },
  {
    id: "tainted-auth",
    scope: (rel) => !isTestish(rel),
    check(line, ctx) {
      return taintedAuth(line, ctx?.taint);
    },
  },
  {
    // Request-controlled URLs rendered into navigation/embedding positions
    // (open-redirect / javascript: sink). DB provenance is deliberately
    // OUT: rendering merchant content (images, links) is the product's
    // normal path and stays owned by runtime sanitization — tracking it
    // here flagged clean storefront rendering file-wide.
    id: "tainted-url-attr",
    scope: (rel) => !isTestish(rel),
    check(line, ctx) {
      return taintedUrlAttr(line, ctx?.taint);
    },
  },
];

// ---------------------------------------------------------------------------
// Intra-file taint tracking (no dependencies).
//
// Gap closed: the literal rules above miss a network call whose destination
// comes through a variable. This engine tracks request-derived and
// merchant/DB-controlled values intra-file and reports when one reaches a
// sink on a scanned (changed) line.
//
// Sources (whole-file pre-pass, iterated to fixpoint):
//   req-provenance: `req|request|ctx|context|Astro|event` + `.query|.body|
//                     .params|.formData`, destructured `{..}` from those,
//                     FormData/URLSearchParams reads (tracked formish vars,
//                     `*.searchParams.get(`, `form*.get(`, `params.get(`,
//                     `new FormData/URLSearchParams`, `.formData()`), and
//                     function params named input|payload|body|query|params
//                     — UNTYPED only: `input: string` / `input: AskInput` are
//                     declared validator contracts, while untyped catch-alls
//                     (`{ params }` route params, `(body) =>`) carry
//                     attacker-influenced data.
//   db-provenance:  assignments whose RHS mentions `db.` or `supabase`
//                     (string literals blanked first, so import paths and
//                     prose cannot taint).
// Propagation: `x = <expr using tainted ident>` (destructuring LHS forms,
//   `+=`, `for..of/in`), where identifier reads exclude post-dot properties
//   (`a.b` reads `a`, not `b`) and object-literal keys (`{data: ..}` does
//   not read a variable named `data`).
//
// Precision choices (each has an evil fixture + a benign-twin fixture):
//   - Bare `request.url` / `req.url` is NOT a source: `new URL(request.url)`
//     is the benign own-URL base used across the tree.
//   - `.headers.get(` / storage / Map reads are NOT sources.
//   - Only the authority region (before the first / ? # outside ${}) of a
//     URL counts for tainted-egress: tainted query strings on an untainted
//     (or literal allowlisted) host are normal app code.
//   - A sink argument that is exactly an enclosing function's own parameter
//     is transparent forwarding (e.g. a fetch wrapper's `input`): the
//     destination was chosen by the caller, which is inter-procedural and
//     out of scope. In-file derivation (`const u = input.url; fetch(u)`)
//     still fires. Bare identifiers otherwise resolve to their in-file
//     definition (depth-capped) before the authority check.
//   - tainted-auth uses req-provenance ONLY: role checks on DB-loaded users
//     or chat messages (`m.role === "customer"`) are the normal auth/chat
//     pattern; request-direct role reads (`req.query.role`) are the vuln.
//   - tainted-url-attr uses req-provenance ONLY (see rule comment).
// Known limits: file-global (no block scoping), one inter-procedural level
//   (single-line declarations/calls/returns; methods, destructured params,
//   and colliding param names out of scope), cross-file named imports from
//   relative paths only (depth-capped; default/namespace/CommonJS deferred),
//   member writes (`o.k = tainted`) do not taint the object, regex literals
//   containing `//` may truncate analysis of that one line.
// Deferred with reasons: tainted-html / tainted-shell — the base html-sink
//   and shell-exec rules are sink-total (fire regardless of data), so taint
//   would only duplicate findings on the same line without gate value.
// ---------------------------------------------------------------------------
const TAINT_PARAM_NAMES = new Set([
  "input",
  "payload",
  "body",
  "query",
  "params",
]);
const FORM_VAR_NAMES = new Set([
  "form",
  "formdata",
  "searchparams",
  "params",
  "queryparams",
  "sp",
  "fd",
]);
const FORM_PROPS = new Set(["body", "query", "params", "formdata", "searchparams"]);
const PRIV_PROPS = new Set([
  "role",
  "roles",
  "isadmin",
  "is_admin",
  "issuperuser",
  "is_superuser",
  "permissions",
  "permission",
  "scope",
  "scopes",
  "privilege",
  "privileges",
]);
const ROLE_LITERALS = new Set([
  "admin",
  "administrator",
  "superuser",
  "superadmin",
  "root",
  "owner",
  "staff",
  "moderator",
]);

/** Blank string-literal contents; keeps code structure + ${} interpolations. */
function maskStrings(line) {
  let out = "";
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === "'" || c === '"') {
      out += c === "'" ? "''" : '""';
      i++;
      while (i < n && line[i] !== c) {
        if (line[i] === "\\") i++;
        i++;
      }
      i++;
    } else if (c === "`") {
      out += "`";
      i++;
      // Template literal text is dropped, but / ? # are structurally
      // significant for URL authority analysis — keep those so the head
      // cut (`${host}/path`, `?query`) survives masking.
      while (i < n && line[i] !== "`") {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === "$" && line[i + 1] === "{") {
          let j = i + 2;
          let depth = 1;
          while (j < n && depth > 0) {
            const d = line[j];
            if (d === "'" || d === '"') {
              const q = d;
              j++;
              while (j < n && line[j] !== q) {
                if (line[j] === "\\") j++;
                j++;
              }
              j++;
              continue;
            }
            if (d === "{") depth++;
            else if (d === "}") depth--;
            j++;
          }
          out += line.slice(i, j);
          i = j;
          continue;
        }
        if (line[i] === "/" || line[i] === "?" || line[i] === "#")
          out += line[i];
        i++;
      }
      out += "`";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Masked line with a whitespace-preceded trailing `//` comment removed. */
function codeOf(rawLine) {
  return maskStrings(rawLine).replace(/\s\/\/.*$/, "");
}

/** Split `lhs = rhs` on the first standalone `=`; null when not a plain assignment. */
function splitAssignment(code) {
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== "=") continue;
    const prev = code[i - 1] ?? "";
    const next = code[i + 1] ?? "";
    if (next === "=" || next === ">") continue;
    if (prev === "=" || prev === "!" || prev === "<" || prev === ">") continue;
    return [code.slice(0, i), code.slice(i + 1)];
  }
  return null;
}

/** Identifier reads in masked code: excludes post-dot props and `key:` labels. */
function readIdents(code) {
  const out = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\b/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const before = code.slice(0, m.index);
    const after = code.slice(m.index + m[0].length);
    if (/[.\w]$/.test(before)) continue; // post-dot property (a.b); `$` excluded so `${x}` still reads `x`
    if (/^\s*:/.test(after)) continue; // object-literal key ({data: ..})
    out.add(m[1]);
  }
  return out;
}

/** Variables bound by an assignment LHS (const/let/var/destructuring/plain). */
function boundIdents(lhs) {
  let s = lhs.trim().replace(/^(?:export\s+)?(?:default\s+)?/, "");
  const decl = s.match(/^(const|let|var)\s+/);
  if (decl) s = s.slice(decl[0].length).trim();
  if (
    /^(return|case|throw|if|while|for|switch|new|delete|void|typeof|class)\b/.test(
      s,
    )
  )
    return [];
  if (s.includes("(") || s.includes(")")) return [];
  if (s.startsWith("{")) {
    const close = s.lastIndexOf("}");
    const inner = close === -1 ? s.slice(1) : s.slice(1, close);
    const keys = new Set(
      [...inner.matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]),
    );
    const all = [...inner.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(
      (m) => m[1],
    );
    return [...new Set(all.filter((id) => !keys.has(id)))];
  }
  if (s.startsWith("[")) {
    const close = s.lastIndexOf("]");
    const inner = close === -1 ? s.slice(1) : s.slice(1, close);
    return [
      ...new Set(
        [...inner.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]),
      ),
    ];
  }
  if (/[.\[]/.test(s)) return []; // member write binds nothing new
  const m = s.match(/^([A-Za-z_$][\w$]*)/);
  if (!m) return [];
  if (["true", "false", "null", "undefined"].includes(m[1])) return [];
  return [m[1]];
}

/** Parameter names declared on one masked code line (also feeds forwarding set).
 * Each entry is { name, typed }: a `:` in the chunk means a TS type
 * annotation — typed params are declared contracts, not request-taint
 * (see analyzeTaint). */
function paramNamesOf(code) {
  const names = new Map();
  const lists = [];
  for (const re of [
    /function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^()]*)\)/g,
    /function\s*\*?\s*\(([^()]*)\)/g,
    /\(([^()]*)\)\s*=>/g,
    /(?:^|[\s{;,=(!])(?:async\s+)?(?!if|for|while|switch|catch|return|typeof|new|in|of\b)[A-Za-z_$][\w$]*\s*\(([^()]*)\)\s*\{/g,
  ]) {
    let m;
    while ((m = re.exec(code)) !== null) lists.push(m[1]);
  }
  // single-identifier arrows: `x => ...` (multi-char forms matched above)
  const single = code.match(/(?:^|[\s=(,;!])([A-Za-z_$][\w$]*)\s*=>/);
  if (single) lists.push(single[1]);
  for (const list of lists) {
    for (const chunk0 of list.split(",")) {
      const chunk = chunk0.trim().replace(/^\.\.\./, "");
      if (!chunk) continue;
      const typed = chunk.includes(":");
      const add = (id) => {
        if (!names.has(id)) names.set(id, { name: id, typed });
      };
      if (chunk.startsWith("{") || chunk.startsWith("[")) {
        const inner = chunk.slice(1);
        for (const idm of inner.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
          const after = inner.slice(idm.index + idm[0].length);
          if (/^\s*:/.test(after)) continue;
          add(idm[1]);
        }
        continue;
      }
      const idm = chunk.match(/^([A-Za-z_$][\w$]*)/);
      if (idm) add(idm[1]);
    }
  }
  return names;
}

const REQ_ATTR_RE =
  /\b(?:req|request|ctx|context|Astro|event)(?:\s*\.\s*(?:req|request))?\s*\.\s*(query|body|params|formData)\b/;
const FORM_TRACK_RE =
  /new\s+FormData\s*\(|new\s+URLSearchParams\s*\(|\.\s*formData\s*\(|useSearchParams\s*\(|\.\s*searchParams\b/;
const FORM_GET_RECV_RE =
  /([A-Za-z_$][\w$]*)\s*\.\s*(?:get|getAll|has)\s*\(/g;
const FORM_GET_HINT_RE =
  /searchParams\s*\.\s*(?:get|getAll)\s*\(|formData\s*\.\s*(?:get|getAll)\s*\(/;
const NON_TAINT_GET_RE =
  /\bheaders\s*\.\s*(?:get|has)\b|localStorage|sessionStorage/;
const DB_SRC_RE = /\bdb\s*\.|\bsupabase\b/;

/** Direct request-derived expression on a sink line (no variable needed). */
function directReqOn(code) {
  if (REQ_ATTR_RE.test(code)) return true;
  if (FORM_GET_HINT_RE.test(code)) return true;
  FORM_GET_RECV_RE.lastIndex = 0;
  let m;
  while ((m = FORM_GET_RECV_RE.exec(code)) !== null) {
    const recv = m[1];
    const before = code.slice(0, m.index);
    if (/[.\w]$/.test(before)) continue; // (no `$`: `${x}` interpolation must still read `x`)
    if (
      FORM_VAR_NAMES.has(recv.toLowerCase()) ||
      /searchParams|formData/i.test(
        code.slice(Math.max(0, m.index - 24), m.index),
      )
    )
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cross-boundary taint: intra-file inter-procedural + cross-file imports.
// One level, bounded, no dependencies. Findings still fire only when taint
// reaches a sink on a scanned line; the authority/provenance gates of the
// sink checkers are unchanged.
//   (a) arg->param: `load(u)` with request-tainted `u` taints `load`'s
//       parameter when that parameter name is unique in the file (colliding
//       names stay unpropagated — see benign-param.ts), so `fetch(param)`
//       in the callee fires. DB-tainted args are NOT threaded (deferred:
//       they flagged the benign same-origin `back(path)` URL builder in
//       payments.server.ts). `called` records params with call-site
//       evidence; the transparent-forwarding carve-out yields to it.
//   (b) return->caller: `const u = getNext()` taints `u` when `getNext`
//       unconditionally returns tainted data, or passes a tainted argument
//       through positionally (param-derived returns).
//   (c) cross-file: named imports from relative paths resolve `./x` plus
//       extension and `/index` candidates (depth-capped, cached). An imported
//       value alias inherits taint when the export is assigned from a tainted
//       source at its definition; an imported function merges as a stub so
//       (a)/(b) apply to its call sites. Re-exports (`export { x } from`)
//       are followed one hop. Default/namespace/CommonJS imports, methods,
//       destructured params, and multi-line declarations/calls/returns are
//       out of scope (documented limits, each with a benign twin or reason).
// ---------------------------------------------------------------------------
function dirOf(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

/** Positional params: simple identifiers by index; destructured slots are null. */
function splitParams(paramStr) {
  const names = [];
  let rest = null;
  for (const chunk0 of paramStr.split(",")) {
    const c0 = chunk0.trim();
    if (!c0) continue;
    const isRest = c0.startsWith("...");
    const chunk = (isRest ? c0.slice(3) : c0).trim();
    if (!chunk) continue;
    if (chunk[0] === "{" || chunk[0] === "[") {
      if (!isRest) names.push(null);
      continue;
    }
    const m = chunk.match(/^([A-Za-z_$][\w$]*)/);
    if (!m) {
      if (!isRest) names.push(null);
      continue;
    }
    if (isRest) rest = m[1];
    else names.push(m[1]);
  }
  return { names, rest };
}

const FUNC_DECL_RE =
  /(?:^|[;{}])\s*(?:export\s+default\s+|export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^()]*)\)/;
const FUNC_ARROW_RE =
  /(?:^|[;{}])\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\s*\*?\s*\(([^()]*)\)|\(([^()]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/;
const RETURN_RE = /^\s*return\s+([^;]+?)\s*;?\s*$/;

/** name -> { names, rest, returns[], start, end }: single-line declarators. */
function buildFuncTable(codes) {
  const table = new Map();
  const n = codes.length;
  for (let i = 0; i < n; i++) {
    const code = codes[i];
    let m = code.match(FUNC_DECL_RE);
    let name = m?.[1];
    let paramStr = m?.[2];
    let after = m ? code.slice(m.index + m[0].length) : "";
    if (!name) {
      m = code.match(FUNC_ARROW_RE);
      if (!m) continue;
      name = m[1];
      paramStr = m[2] ?? m[3] ?? m[4] ?? "";
      after = code.slice(m.index + m[0].length);
      if (m[2] === undefined && !after.trimStart().startsWith("{")) {
        // Expression-bodied arrow: the body itself is the return value.
        const expr = after.trim().replace(/;\s*$/, "");
        if (!expr || table.has(name)) continue;
        const { names, rest } = splitParams(paramStr);
        table.set(name, { names, rest, returns: [expr], start: i, end: i });
        continue;
      }
    }
    if (!name || table.has(name)) continue;
    const brace = after.indexOf("{");
    if (brace === -1) continue; // overload signature / bodyless — skip
    let start = -1;
    let depth = 0;
    let end = i;
    for (let j = i; j < n && j < i + 400; j++) {
      const line = codes[j];
      const s0 = j === i ? m.index + m[0].length + brace : 0;
      for (let k = s0; k < line.length; k++) {
        const c = line[k];
        if (c === "{") {
          if (start === -1) start = j;
          depth++;
        } else if (c === "}") {
          depth--;
          if (depth === 0 && start !== -1) {
            end = j;
            break;
          }
        }
      }
      if (start !== -1 && depth === 0) break;
    }
    if (start === -1) continue;
    const { names, rest } = splitParams(paramStr ?? "");
    table.set(name, { names, rest, returns: [], start, end });
  }
  // Returns, excluding lines owned by a nested function body.
  for (const entry of table.values()) {
    if (entry.returns.length > 0) continue; // arrow-expr body already set
    for (let j = entry.start; j <= entry.end; j++) {
      let nested = false;
      for (const [oname, o] of table) {
        if (o === entry) continue;
        if (j > o.start && j <= o.end) {
          nested = true;
          break;
        }
      }
      if (nested) continue;
      const rm = codes[j].match(RETURN_RE);
      if (rm && rm[1].trim()) entry.returns.push(rm[1].trim());
    }
  }
  return table;
}

const XBOUND_TARGET_BYTES = 500_000;
const xboundCache = new Map(); // absPath -> summary | null (read-only after store)
const xboundActive = new Set(); // cycle guard for recursive imports

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/;
const EXPORT_FROM_RE = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/;
const EXPORT_STAR_RE = /export\s*\*\s*from\s*['"]([^'"]+)['"]/;
const EXPORT_LOCAL_RE = /export\s*\{([^}]*)\}/;
const CALL_RE = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;

/** Read a relative import target: extension + `/index` candidates. */
function readRelativeTarget(base, spec) {
  const cands = [
    spec,
    `${spec}.ts`,
    `${spec}.tsx`,
    `${spec}.js`,
    `${spec}.jsx`,
    `${spec}.mjs`,
    `${spec}.cjs`,
    `${spec}/index.ts`,
    `${spec}/index.tsx`,
    `${spec}/index.js`,
    `${spec}/index.jsx`,
    `${spec}/index.mjs`,
  ];
  for (const cand of cands) {
    try {
      const abs = resolve(base, cand);
      const content = readFileSync(abs, "utf8");
      if (content.length > XBOUND_TARGET_BYTES) return null;
      return { abs, content };
    } catch {
      // next candidate
    }
  }
  return null;
}

/** Export map of raw lines: locals, re-exports, star-re-exports. */
function parseExports(rawLines) {
  const loc = new Map(); // exportName -> localName
  const rem = new Map(); // exportName -> { spec, orig }
  const star = [];
  for (const line of rawLines) {
    let m = line.match(EXPORT_FROM_RE);
    if (m) {
      if (m[2].startsWith(".")) {
        for (const part of m[1].split(",")) {
          const pm = part
            .trim()
            .match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
          if (pm) rem.set(pm[2] ?? pm[1], { spec: m[2], orig: pm[1] });
        }
      }
      continue;
    }
    m = line.match(EXPORT_STAR_RE);
    if (m) {
      if (m[1].startsWith(".")) star.push(m[1]);
      continue;
    }
    m = line.match(EXPORT_LOCAL_RE);
    if (m) {
      for (const part of m[1].split(",")) {
        const pm = part
          .trim()
          .match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (pm) loc.set(pm[2] ?? pm[1], pm[1]);
      }
      continue;
    }
    m = line.match(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m) {
      loc.set(m[1], m[1]);
      continue;
    }
    m = line.match(
      /export\s+default\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
    );
    if (m) {
      loc.set(m[1], m[1]);
      continue;
    }
    m = line.match(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/);
    if (m) {
      loc.set(m[1], m[1]);
      continue;
    }
    m = line.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/);
    if (m) loc.set("default", m[1]);
  }
  return { loc, rem, star };
}

/** Per-function return summary: unconditional req/db + passthrough slots. */
function summarizeFunctions(funcTable, req, db) {
  const fns = new Map();
  for (const [name, e] of funcTable) {
    if (e.stub) {
      fns.set(name, {
        params: e.names,
        rest: e.rest,
        reqRet: e.stubReqRet,
        dbRet: e.stubDbRet,
        flow: e.stubFlow,
      });
      continue;
    }
    const pset = new Set([
      ...e.names.filter(Boolean),
      ...(e.rest ? [e.rest] : []),
    ]);
    let reqRet = false;
    let dbRet = false;
    const flow = new Set();
    for (const r of e.returns) {
      const ids = [...readIdents(r)];
      if (
        directReqOn(r) ||
        ids.some((id) => req.has(id) && !pset.has(id))
      )
        reqRet = true;
      if (DB_SRC_RE.test(r) || ids.some((id) => db.has(id) && !pset.has(id)))
        dbRet = true;
      e.names.forEach((p, idx) => {
        if (p && ids.includes(p)) flow.add(idx);
      });
      if (e.rest && ids.includes(e.rest)) flow.add(e.names.length);
    }
    fns.set(name, { params: e.names, rest: e.rest, reqRet, dbRet, flow });
  }
  return fns;
}

/** Cached, cycle-guarded taint summary of another file (depth-capped). */
function analyzeFileTaint(absPath, depth) {
  if (xboundCache.has(absPath)) return xboundCache.get(absPath);
  if (depth > 2 || xboundActive.has(absPath)) return null;
  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  if (content.length > XBOUND_TARGET_BYTES) {
    xboundCache.set(absPath, null);
    return null;
  }
  xboundActive.add(absPath);
  try {
    const rawLines = content.split("\n");
    const inner = analyzeTaintInner(rawLines, dirOf(absPath), depth);
    const summary = {
      ...inner,
      exports: parseExports(rawLines),
      absPath,
      depth,
    };
    xboundCache.set(absPath, summary);
    return summary;
  } finally {
    xboundActive.delete(absPath);
  }
}

/** Resolve an export name to a value/flow binding (one re-export hop). */
function resolveExportBinding(t, orig) {
  const seen = new Set();
  let cur = t;
  let name = orig;
  while (cur) {
    const key = `${cur.absPath}::${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const ex = cur.exports;
    if (ex.loc.has(name)) {
      const local = ex.loc.get(name);
      if (cur.fns.has(local)) {
        const f = cur.fns.get(local);
        return {
          kind: "fn",
          params: f.params,
          rest: f.rest,
          reqRet: f.reqRet,
          dbRet: f.dbRet,
          flow: f.flow,
        };
      }
      if (cur.req.has(local)) return { kind: "value", prov: "req" };
      if (cur.any.has(local)) return { kind: "value", prov: "db" };
      return null;
    }
    if (ex.rem.has(name)) {
      if (cur.depth >= 2) return null;
      const { spec, orig: o2 } = ex.rem.get(name);
      const hit = readRelativeTarget(dirOf(cur.absPath), spec);
      if (!hit) return null;
      cur = analyzeFileTaint(hit.abs, cur.depth + 1);
      name = o2;
      continue;
    }
    for (const spec of ex.star) {
      if (cur.depth >= 2) break;
      const hit = readRelativeTarget(dirOf(cur.absPath), spec);
      if (!hit) continue;
      const t2 = analyzeFileTaint(hit.abs, cur.depth + 1);
      if (!t2 || !t2.exports.loc.has(name)) continue;
      const local = t2.exports.loc.get(name);
      if (t2.fns.has(local)) {
        const f = t2.fns.get(local);
        return {
          kind: "fn",
          params: f.params,
          rest: f.rest,
          reqRet: f.reqRet,
          dbRet: f.dbRet,
          flow: f.flow,
        };
      }
      if (t2.req.has(local)) return { kind: "value", prov: "req" };
      if (t2.any.has(local)) return { kind: "value", prov: "db" };
    }
    return null;
  }
  return null;
}

/** Merge named relative imports: value taint + function stubs. */
function mergeCrossFile(rawLines, baseDir, depth, funcTable, addReq, addDb) {
  if (!baseDir || depth >= 2) return;
  for (const line of rawLines) {
    const m = line.match(IMPORT_RE);
    if (!m || !m[2].startsWith(".")) continue;
    const hit = readRelativeTarget(baseDir, m[2]);
    if (!hit) continue;
    const t = analyzeFileTaint(hit.abs, depth + 1);
    if (!t) continue;
    for (const part of m[1].split(",")) {
      const pm = part
        .trim()
        .match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!pm) continue;
      const b = resolveExportBinding(t, pm[1]);
      if (!b) continue;
      const alias = pm[2] ?? pm[1];
      if (b.kind === "value") {
        if (b.prov === "req") addReq(alias);
        else addDb(alias);
      } else if (!funcTable.has(alias)) {
        funcTable.set(alias, {
          names: b.params,
          rest: b.rest,
          returns: [],
          start: -1,
          end: -1,
          stub: true,
          stubReqRet: b.reqRet,
          stubDbRet: b.dbRet,
          stubFlow: b.flow,
        });
      }
    }
  }
}

/** One sweep of call-site edges: arg->param (unique names) + return->LHS. */
function sweepInterprocedural(codes, funcTable, useCount, s) {
  const { req, db, addReq, addDb, called } = s;
  const argReq = (a) =>
    directReqOn(a) || [...readIdents(a)].some((id) => req.has(id));
  const argDb = (a) =>
    DB_SRC_RE.test(a) || [...readIdents(a)].some((id) => db.has(id));
  const fns = summarizeFunctions(funcTable, req, db);
  for (const code of codes) {
    if (!code.trim() || !code.includes("(")) continue;
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(code)) !== null) {
      const fname = m[1];
      if (/(?:function|new)\s*$/.test(code.slice(0, m.index))) continue;
      const entry = funcTable.get(fname);
      const fn = fns.get(fname);
      if (!entry || !fn) continue;
      const openIdx = m.index + m[0].length - 1;
      const args = callArgs(code, openIdx);
      // (a) arg->param: stubs excluded (their params live in another file).
      // Request-provenance ONLY: threading DB-tainted args into params
      // flagged a benign same-origin builder (payments.server.ts
      // `back(path)` — a DB-loaded provider enum interpolated into a
      // relative path under `new URL(path, origin)`). DB cross-flow stays
      // deferred; the sink checkers keep their own db handling.
      if (!entry.stub) {
        fn.params.forEach((p, idx) => {
          if (!p || useCount.get(p) !== 1) return;
          const a = (args[idx] ?? "").trim();
          if (!a) return;
          if (argReq(a)) {
            addReq(p);
            called.add(p);
          }
        });
        if (fn.rest && useCount.get(fn.rest) === 1) {
          const tail = args.slice(fn.params.length);
          if (tail.some((a) => argReq(a.trim()))) {
            addReq(fn.rest);
            called.add(fn.rest);
          }
        }
      }
      // (b) return->caller LHS: unconditional first, then passthrough slots.
      const split = splitAssignment(code);
      if (!split) continue;
      const lhs = boundIdents(split[0]);
      if (lhs.length === 0) continue;
      let prov = null;
      if (fn.reqRet) prov = "req";
      else if (fn.dbRet) prov = "db";
      else {
        for (const idx of fn.flow) {
          const a =
            idx < fn.params.length
              ? (args[idx] ?? "")
              : args.slice(idx).join(",");
          if (!a.trim()) continue;
          if (argReq(a)) {
            prov = "req";
            break;
          }
          if (argDb(a)) prov = "db";
        }
      }
      if (prov === "req") for (const id of lhs) addReq(id);
      else if (prov === "db") for (const id of lhs) addDb(id);
    }
  }
}

/**
 * Whole-file taint pre-pass. Returns { req, any, params }:
 * req = request-derived vars, any = req ∪ db-controlled vars,
 * params = all declared function-parameter names (forwarding carve-out).
 */
function analyzeTaintInner(rawLines, baseDir, depth) {
  const req = new Set();
  const db = new Set();
  const formish = new Set();
  const params = new Set();
  const called = new Set();
  const codes = rawLines.map(codeOf);

  for (const code of codes) {
    for (const { name, typed } of paramNamesOf(code).values()) {
      params.add(name);
      // Params named input|payload|body|query|params are a request-taint
      // heuristic ONLY when untyped: `input: string` / `input: AskInput`
      // are declared validator contracts (safeLandingPath, parseManifest…),
      // while untyped catch-alls (`{ params }` route params, `(body) =>`)
      // carry attacker-influenced data.
      if (!typed && TAINT_PARAM_NAMES.has(name.toLowerCase())) req.add(name);
    }
  }

  let changed = false;
  const addReq = (id) => {
    if (!req.has(id)) {
      req.add(id);
      changed = true;
    }
  };
  const addDb = (id) => {
    if (!db.has(id)) {
      db.add(id);
      changed = true;
    }
  };
  const hasReq = (ids) => {
    for (const id of ids) if (req.has(id)) return true;
    return false;
  };
  const hasDb = (ids) => {
    for (const id of ids) if (db.has(id)) return true;
    return false;
  };

  const funcTable = buildFuncTable(codes);
  const useCount = new Map();
  for (const e of funcTable.values()) {
    if (e.stub) continue;
    for (const p of [
      ...e.names.filter(Boolean),
      ...(e.rest ? [e.rest] : []),
    ]) {
      useCount.set(p, (useCount.get(p) ?? 0) + 1);
    }
  }
  mergeCrossFile(rawLines, baseDir, depth, funcTable, addReq, addDb);

  for (let round = 0; round < 6; round++) {
    changed = false;

    for (const code of codes) {
      if (!code.trim()) continue;
      const split = splitAssignment(code);
      if (!split) continue;
      const [lhsRaw, rhs] = split;
      const lhs = boundIdents(lhsRaw);
      if (lhs.length === 0) continue;
      const rhsIds = readIdents(rhs);
      const taintReq =
        hasReq(rhsIds) || REQ_ATTR_RE.test(rhs) || directReqOn(rhs);
      let formGets = false;
      if (!taintReq) {
        FORM_GET_RECV_RE.lastIndex = 0;
        let m;
        while ((m = FORM_GET_RECV_RE.exec(rhs)) !== null) {
          const recv = m[1];
          const before = rhs.slice(0, m.index);
          if (/[.\w]$/.test(before)) continue; // (no `$`: `${x}` interpolation must still read `x`)
          if (
            formish.has(recv) ||
            FORM_VAR_NAMES.has(recv.toLowerCase())
          ) {
            formGets = true;
            break;
          }
        }
        if (
          !formGets &&
          !NON_TAINT_GET_RE.test(rhs) &&
          FORM_GET_HINT_RE.test(rhs)
        )
          formGets = true;
      }
      const taintDb = hasDb(rhsIds) || DB_SRC_RE.test(rhs);
      if (FORM_TRACK_RE.test(rhs)) {
        for (const id of lhs) {
          formish.add(id);
          addReq(id);
        }
        continue;
      }
      const dm = lhsRaw.match(
        /^(?:const|let|var)\s*\{([^}]*)\}\s*$/,
      );
      if (dm && /^(req|request|ctx|context)$/.test(rhs.trim())) {
        for (const idm of dm[1].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
          const after = dm[1].slice(idm.index + idm[0].length);
          if (/^\s*:/.test(after)) continue;
          if (FORM_PROPS.has(idm[1].toLowerCase())) addReq(idm[1]);
        }
        continue;
      }
      if (taintReq || formGets) for (const id of lhs) addReq(id);
      if (taintDb) for (const id of lhs) addDb(id);
    }
    sweepInterprocedural(codes, funcTable, useCount, {
      req,
      db,
      addReq,
      addDb,
      called,
    });
    if (!changed) break;
  }
  const fns = summarizeFunctions(funcTable, req, db);
  const anyRet = new Set();
  const reqRet = new Set();
  for (const [name, f] of fns) {
    if (f.reqRet || f.dbRet) anyRet.add(name);
    if (f.reqRet) reqRet.add(name);
  }
  return {
    req,
    any: new Set([...req, ...db]),
    params,
    codes,
    called,
    anyRet,
    reqRet,
    fns,
  };
}

function analyzeTaint(rawLines, rel) {
  return analyzeTaintInner(rawLines, rel ? dirOf(join(ROOT, rel)) : null, 0);
}

/** In-file definitions of a variable: masked RHS strings (assign + for-of/in). */
function varDefs(codes, name) {
  const defs = [];
  const re = new RegExp(`\\b${name}\\b`);
  for (const code of codes) {
    if (!re.test(code)) continue;
    const forOf = code.match(
      /for\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\s+(.+)\)/,
    );
    if (forOf && forOf[1] === name) {
      defs.push(forOf[2]);
      continue;
    }
    const split = splitAssignment(code);
    if (!split) continue;
    if (boundIdents(split[0]).includes(name)) defs.push(split[1]);
  }
  return defs;
}

/** All top-level call arguments (masked text, depth-aware). */
function callArgs(masked, openIdx) {
  const args = [];
  let depth = 0;
  let cur = "";
  for (let i = openIdx; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      if (depth === 1) continue;
    } else if (c === ")" || c === "]" || c === "}") {
      if (depth === 1 && c === ")") {
        args.push(cur);
        return args;
      }
      depth--;
      if (depth < 0) {
        args.push(cur);
        return args;
      }
    } else if (c === "," && depth === 1) {
      args.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  args.push(cur);
  return args;
}

/** Extract the first call's argument (masked text, depth-aware). */
function firstArg(masked, openIdx) {
  return callArgs(masked, openIdx)[0] ?? "";
}

/**
 * Authority region of a URL expression: text before the first / ? # that
 * sits outside ${} interpolation. Tainted data here can steer the host.
 */
function authorityHead(maskedArg) {
  let t = maskedArg.trim();
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "$" && t[i + 1] === "{") {
      depth++;
      i++;
    } else if (t[i] === "}" && depth > 0) {
      depth--;
    } else if (depth === 0 && (t[i] === "/" || t[i] === "?" || t[i] === "#")) {
      return t.slice(0, i);
    }
  }
  return t;
}

function hasTainted(head, taint) {
  if (!taint) return null;
  for (const id of readIdents(head)) {
    if (taint.any.has(id)) return id;
  }
  if (directReqOn(head)) return "request-derived expression";
  return null;
}

function literalHostStatus(arg) {
  const m = arg.match(/https?:\/\/([^/'"`\s:${]+)/);
  if (!m) return null;
  return hostAllowed(m[1]) ? "allowlisted" : "flagged-by-base";
}

/**
 * Resolve a bare identifier through in-file definitions (depth-capped),
 * then classify who controls the URL authority. Returns a detail string
 * or null. `what` labels the sink for messages.
 */
function urlValueFinding(rawArg, taint, what, depth = 0) {
  if (!taint) return null;
  const masked = codeOf(rawArg);
  const t = masked.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(t)) {
    if (taint.params.has(t) && !taint.called?.has(t)) return null; // transparent forwarding without call-site taint
    if (!taint.any.has(t)) return null;
    // Resolve through in-file definitions: a tainted alias of a safe
    // authority (`${base}/...`, env consts) is not attacker-steered.
    // Unresolvable tainted identifiers (unknown provenance) still fire.
    const defs = depth < 4 ? varDefs(taint.codes, t) : [];
    if (defs.length === 0)
      return `${what} from tainted variable \`${t}\``;
    for (const def of defs.slice(-3)) {
      const inner = def.trim();
      const callee = inner.match(/^([A-Za-z_$][\w$]*)\s*\(/);
      if (callee && taint.anyRet?.has(callee[1]))
        return `${what} from tainted \`${callee[1]}()\` (via \`${t}\`)`;
      if (/^[A-Za-z_$][\w$]*$/.test(inner)) {
        if (inner === t) continue;
        const r = urlValueFinding(inner, taint, what, depth + 1);
        if (r !== null) return r;
        continue;
      }
      const r = classifyAuthority(inner, taint, what, t);
      if (r !== null) return r;
    }
    return null;
  }
  return classifyAuthority(t, taint, what, null);
}

function classifyAuthority(maskedArg, taint, what, varName) {
  const t = maskedArg.trim();
  if (literalHostStatus(t)) return null; // base rule owns it / trusted host
  if (/^\/\//.test(t.replace(/^['"`]/, ""))) {
    const head = authorityHead(t.replace(/^['"`]/, "").slice(2));
    const hit = hasTainted(head, taint);
    if (hit)
      return `${what} host from tainted ${hit === "request-derived expression" ? "request-derived value" : `\`${hit}\``}`;
    return null;
  }
  const bare = t.replace(/^['"`]/, "");
  if (/^(\/|\.\/|\.\.\/|#|\?)/.test(bare)) return null; // same-origin relative
  const head = authorityHead(t);
  const hit = hasTainted(head, taint);
  if (hit) {
    const via =
      hit === "request-derived expression"
        ? "a request-derived value"
        : `tainted \`${hit}\`${varName ? ` (via \`${varName}\`)` : ""}`;
    return `${what} host built from ${via}`;
  }
  return null;
}

const EGRESS_CALL_RE =
  /(\bfetch|new\s+URL|new\s+WebSocket|new\s+EventSource|window\s*\.\s*open)\s*\(/;

function taintedEgress(line, taint) {
  if (!taint) return null;
  const masked = codeOf(line);
  const m = masked.match(EGRESS_CALL_RE);
  if (!m) return null;
  const arg = firstArg(masked, (m.index ?? 0) + m[0].length - 1);
  if (!arg.trim()) return null;
  // `new URL(path, base)`: a tainted base also steers the host.
  let extra = null;
  if (/new\s+URL/.test(m[1])) {
    const args = callArgs(masked, (m.index ?? 0) + m[0].length - 1);
    if (args.length > 1 && args[1].trim()) {
      const hit = hasTainted(authorityHead(args[1].trim()), taint);
      if (hit)
        extra = `URL base from tainted ${hit === "request-derived expression" ? "request-derived value" : `\`${hit}\``}`;
    }
  }
  const kind = /WebSocket/.test(m[1])
    ? "WebSocket destination"
    : /EventSource/.test(m[1])
      ? "EventSource destination"
      : /window/.test(m[1])
        ? "window.open() destination"
        : /new\s+URL/.test(m[1])
          ? "constructed URL"
          : "fetch() destination";
  const main = urlValueFinding(arg, taint, kind);
  return main ?? extra;
}

const REDIRECT_CALL_RE =
  /Response\s*\.\s*redirect\s*\(|(?<![\w$.])redirect\s*\(/;
const REDIRECT_ASSIGN_RE =
  /(?:window\s*\.\s*)?location(?:\s*\.\s*href)?\s*=/;

function taintedRedirect(line, taint) {
  if (!taint) return null;
  const masked = codeOf(line);
  let value = null;
  const cm = masked.match(REDIRECT_CALL_RE);
  if (cm) {
    value = firstArg(masked, (cm.index ?? 0) + cm[0].length - 1);
    const objm = value.trim().match(/^\{\s*([^]*)\}$/);
    if (objm) {
      const hm = objm[1].match(/(?:href|to|url)\s*:\s*([^,}]+)/);
      value = hm ? hm[1] : null;
    }
  } else {
    const am = masked.match(REDIRECT_ASSIGN_RE);
    if (!am) return null;
    value = masked.slice((am.index ?? 0) + am[0].length);
  }
  if (!value || !value.trim()) return null;
  const v = value.trim();
  // A single static literal is not attacker-steered; anything concatenated
  // or interpolated falls through to taint analysis.
  if (/^"[^"]*"$/.test(v) || /^'[^']*'$/.test(v)) return null;
  if (/^`[^`]*`$/.test(v) && !/\$\{/.test(v)) return null;
  return urlValueFinding(v, taint, "redirect target");
}

const FS_WRITE_RE =
  /(?:^|[^.\w$])(?:[A-Za-z_$][\w$]*\s*\.\s*)?(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|copyFileSync|copyFile)\s*\(/;

function taintedFs(line, taint) {
  if (!taint) return null;
  const masked = codeOf(line);
  const m = masked.match(FS_WRITE_RE);
  if (!m) return null;
  const arg = firstArg(masked, (m.index ?? 0) + m[0].length - 1);
  if (!arg.trim()) return null;
  const hit = hasTainted(arg, taint);
  if (hit) {
    const via =
      hit === "request-derived expression"
        ? "a request-derived value"
        : `tainted \`${hit}\``;
    return `filesystem write path from ${via}`;
  }
  return null;
}

const AUTH_DECISION_RE = /\bif\s*\(|\bwhile\s*\(|\breturn\b|\?[^;]*:|&&|\|\||===|!==|==|!=/;
const PRIV_PROP_RE =
  /(?:^|[^.\w$])([A-Za-z_$][\w$]*)(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*(role|roles|isAdmin|is_admin|isSuperuser|is_superuser|permissions|permission|scope|scopes|privilege|privileges)\b/;
const PRIV_NAME_RE = /(admin|role|privileg|permission|scope)/i;

function taintedAuth(line, taint) {
  // Request-provenance only (see header): role checks on DB-loaded data
  // are the normal auth pattern.
  if (!taint) return null;
  const masked = codeOf(line);
  if (!AUTH_DECISION_RE.test(masked)) return null;
  // (a) request-tainted value compared against a privilege literal.
  if (/(===|!==|==|!=)/.test(masked)) {
    const litm = masked.match(/['"`]([^'"`]{1,32})['"`]/);
    if (litm && ROLE_LITERALS.has(litm[1].toLowerCase())) {
      for (const id of readIdents(masked)) {
        if (taint.req.has(id))
          return `authorization decision compares request-derived \`${id}\` against privilege literal "${litm[1]}"`;
      }
      if (directReqOn(masked))
        return `authorization decision compares request-derived value against privilege literal "${litm[1]}"`;
    }
  }
  // (b) privilege property read off request-derived data in a decision.
  const pm = masked.match(PRIV_PROP_RE);
  if (pm) {
    // Identifiers bound on this very line (e.g. `const soft = sample.role
    // === ...`) are the verdict being computed, not its tainted input.
    const boundHere = new Set(
      (() => {
        const split = splitAssignment(masked);
        return split ? boundIdents(split[0]) : [];
      })(),
    );
    const baseIds = [
      ...readIdents(masked.slice(0, (pm.index ?? 0) + pm[1].length + 1)),
    ].filter((id) => id !== pm[2] && !boundHere.has(id));
    if (
      baseIds.some((id) => taint.req.has(id)) ||
      (REQ_ATTR_RE.test(masked) && pm.index !== undefined)
    ) {
      const base = baseIds.find((id) => taint.req.has(id));
      if (base || REQ_ATTR_RE.test(masked))
        return `authorization decision reads privilege property from request-derived ${base ? `\`${base}\`` : "value"}`;
    }
  }
  // (c) decision on a request-derived flag with a privilege-ish name.
  // A bare `return flag;` is just plumbing, not a decision — skip it.
  if (!/^\s*return\s+[A-Za-z_$][\w$]*\s*;?\s*$/.test(masked)) {
    for (const id of readIdents(masked)) {
      if (taint.req.has(id) && PRIV_NAME_RE.test(id))
        return `authorization decision on request-derived flag \`${id}\``;
    }
  }
  return null;
}

const URL_ATTR_RE =
  /(?:^|[^.\w$])(src|href)\s*=\s*\{([^}]*)\}|(?:^|[^.\w$])(src|href)\s*=\s*["'`]([^"'`]*?)["'`]/;

/** True when the authority head involves request-provenance taint. */
function headHasReq(head, taint) {
  if (directReqOn(head)) return true;
  for (const id of readIdents(head)) if (taint.req.has(id)) return true;
  return false;
}

function taintedUrlAttr(line, taint) {
  // Request-provenance only (see rule comment above).
  if (!taint) return null;
  const masked = codeOf(line);
  const m = masked.match(URL_ATTR_RE);
  if (!m) return null;
  const expr = (m[2] ?? m[4] ?? "").trim();
  if (!expr) return null;
  if (!m[2]) return null; // literal src="..."/href="..." — static string
  if (/^"[^"]*"$/.test(expr) || /^'[^']*'$/.test(expr)) return null;
  if (/^`[^`]*`$/.test(expr) && !/\$\{/.test(expr)) return null;
  if (/^(\/|\.\/|\.\.\/|#)/.test(expr)) return null;
  if (literalHostStatus(expr)) return null;
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    // Bare alias: resolve through in-file definitions first, so a tainted
    // alias of a safe authority stays silent (mirrors tainted-egress).
    if (!taint.req.has(expr) || (taint.params.has(expr) && !taint.called?.has(expr))) return null;
    const defs = varDefs(taint.codes, expr);
    if (defs.length === 0)
      return `URL attribute from request-derived \`${expr}\``;
    for (const def of defs.slice(-3)) {
      const inner = def.trim();
      const callee = inner.match(/^([A-Za-z_$][\w$]*)\s*\(/);
      if (callee && taint.reqRet?.has(callee[1]))
        return `URL attribute from request-derived \`${callee[1]}()\` (via \`${expr}\`)`;
      if (/^[A-Za-z_$][\w$]*$/.test(inner)) {
        if (inner !== expr && taint.req.has(inner))
          return `URL attribute from request-derived \`${inner}\` (via \`${expr}\`)`;
        continue;
      }
      const r = classifyAuthority(inner, taint, "URL attribute", expr);
      if (r !== null && headHasReq(authorityHead(inner), taint)) return r;
    }
    return null;
  }
  const head = authorityHead(expr);
  if (directReqOn(head)) return "URL attribute from request-derived value";
  for (const id of readIdents(head)) {
    if (!taint.req.has(id)) continue; // db-provenance does not count here
    if (taint.params.has(id) && !taint.called?.has(id)) continue; // transparent forwarding without call-site taint
    return `URL attribute from request-derived \`${id}\``;
  }
  return null;
}

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
  // Large maxBuffer: the committed-range diff grows with the branch and
  // must never fail with ENOBUFS (a scanner that cannot read the diff
  // cannot report findings — fail-closed means reading it reliably).
  return execFileSync("git", args_, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
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

// Fail-closed gate for CI: `--require-base` (or SAST_REQUIRE_BASE=1) turns
// an unresolvable base into a hard error instead of silently narrowing to
// working-tree-only (which passes vacuously on a clean checkout). Local
// runs without the flag keep the old lenient default.
function requireBaseEnabled() {
  if (args.includes("--require-base")) return true;
  const v = (process.env.SAST_REQUIRE_BASE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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
  if (!base && requireBaseEnabled()) {
    console.error(
      "sast scan FAILED — no base ref resolves and --require-base is set " +
        "(tried --base, SAST_BASE, origin/main, origin/master); refusing to " +
        "narrow to working-tree-only, which passes vacuously on a clean " +
        "checkout. Fetch the target branch first, e.g. " +
        "`git fetch origin main:refs/remotes/origin/main`, or set " +
        "--base <ref> / SAST_BASE=<ref>.",
    );
    process.exit(2);
  }
  if (base && !refExists(base) && requireBaseEnabled()) {
    console.error(
      `sast scan FAILED — base '${base}' does not resolve locally and ` +
        "--require-base is set; fetch the target branch (or fix --base / " +
        "SAST_BASE) so the committed range can be established.",
    );
    process.exit(2);
  }
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
  // Taint rules need whole-file context (sources live outside the diff),
  // but findings stay scoped to the scanned lines by the loop below.
  const taintScope = RULES.some((r) => r.id.startsWith("tainted-") && r.scope(rel));
  const taint = taintScope ? analyzeTaint(content, rel) : null;
  for (const ln of [...lines].sort((a, b) => a - b)) {
    const line = content[ln - 1];
    if (line === undefined) continue; // line-number drift between diff and worktree
    // Comment-only lines cannot execute: prose about a pattern ("never use
    // eval()", "allow-same-origin is withheld") is documentation, not risk.
    // Code with a trailing comment is still checked.
    if (/^\s*(?:\/\/|\/\*|\*|#|<!--|%|--(?:\s|$))/.test(line)) continue;
    checkedLines += 1;
    const ctx = { next: content[ln] ?? "", taint };
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
