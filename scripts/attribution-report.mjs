#!/usr/bin/env node
/**
 * Attribution report (observability assemblage, NOT a gate).
 *
 * Gap closed: SAST prints `file:line [rule]` for changed code and
 * `src/lib/package-security-report.ts` (`packageSecurityReport`) assembles
 * per-package-version `{package, version, sha256, merchantId, uploader,
 * scannerVersion, findings, decision, decidedBy, decidedAt}` from existing
 * rows + audits — but nothing links a finding to the PR actor / reviewer /
 * resolution in one place. This script builds that linkage with NO new
 * persistence, mirroring the package-report philosophy (deterministic
 * assembly from data that already exists).
 *
 * Sources (each best-effort; every field is null-with-reason, never guessed):
 *   (a) Current SAST findings — runs `node scripts/sast-scan.mjs
 *       --base <base>` (default base: HEAD, i.e. the working tree vs HEAD
 *       plus untracked files) and parses its `file:line [rule] detail`
 *       lines. Rules are NEVER reimplemented here.
 *   (b) Introducing actor + timestamp per flagged line — `git blame -L
 *       <line>,<line> --porcelain -- <file>` (line-aware, not file-aware).
 *       Uncommitted working-tree lines blame to all-zero sha and read as
 *       null ("uncommitted — no commit yet") rather than misattributing.
 *   (c) GitHub PR number / author / reviewers — REST API, ONLY when
 *       `GITHUB_TOKEN`/`GH_TOKEN` exists. Best-effort, cached in-memory,
 *       never fatal when absent: local runs work fully offline and read
 *       `pr: null, reviewers: null` with reason "no token (offline)".
 *       `--prs-json <path>` preloads the same shape from a fixture so the
 *       PR join is provable offline without touching repo state or network.
 *   (d) Package findings — mirrors the `PackageSecurityReport` field names
 *       (`package{kind,id,name}, version, sha256, merchantId, uploader,
 *       scannerVersion, findings[{code,severity,detail}], decision,
 *       decidedBy, decidedAt`) WITHOUT importing the TS module (different
 *       runtime: dependency-free node script vs app with a DB handle).
 *       Pass `--packages-json <path>` with a dump of such rows to attach
 *       them; otherwise `packages: []` with the join key documented below.
 *
 * Join keys: SAST side joins on (file, line) -> introducing commit -> PR
 * (via `GET /repos/{owner}/{repo}/commits/{sha}/pulls`); package side joins
 * on (package.kind, package.id, version, sha256) back to the
 * `theme_versions` / `plugin_state` rows plus the `theme_audit` /
 * `activity_log` approval trail `packageSecurityReport` reads. There is NO
 * direct key between a repo-file SAST finding and a DB-content package
 * finding — the report places both side by side so a reviewer sees actor,
 * review, and resolution together. That is the whole linkage.
 *
 * EVIDENCE, NOT PROOF OF INTENT: attribution says which account introduced
 * a change (commit author, PR author, reviewers). It never claims why, and
 * a git user.name / email is a self-asserted string, not an identity proof —
 * never treat it as proof of intent, culpability, or authorization.
 *
 * Exit code is ALWAYS 0 on a completed assembly (even with zero findings or
 * fully-null fields); non-zero only for CLI misuse. This is observability,
 * not a gate — CI runs it with `|| true` and stores the artifact.
 *
 * Usage:
 *   node scripts/attribution-report.mjs [--base <ref>] [--out <path>]
 *     [--packages-json <path>] [--prs-json <path>] [--no-pr] [--help]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAST_SCRIPT = join(HERE, "sast-scan.mjs");
const ROOT = process.cwd();
const ZERO_SHA = "0".repeat(40);

function usage() {
  return [
    "Usage: node scripts/attribution-report.mjs [options]",
    "",
    "  --base <ref>           base ref passed to sast-scan (default: HEAD;",
    "                         SAST_BASE env wins over the default too)",
    "  --out <path>           also write the JSON report to <path>",
    "  --packages-json <path> attach PackageSecurityReport-shaped rows",
    "  --prs-json <path>      preload PR join data {sha: {number,url,author,reviewers}}",
    "  --no-pr                skip GitHub PR lookup even when a token exists",
    "  --help                 print this help",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = {
    base: null,
    out: null,
    packagesJson: null,
    prsJson: null,
    noPr: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--base" && argv[i + 1]) opts.base = argv[++i];
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--packages-json" && argv[i + 1])
      opts.packagesJson = argv[++i];
    else if (a === "--prs-json" && argv[i + 1]) opts.prsJson = argv[++i];
    else if (a === "--no-pr") opts.noPr = true;
    else {
      console.error(`attribution-report: unknown argument '${a}'\n${usage()}`);
      process.exit(2);
    }
  }
  return opts;
}

function run(
  cmd,
  args,
  { timeoutMs = 120000, maxBuffer = 64 * 1024 * 1024 } = {},
) {
  try {
    const r = spawnSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer,
    });
    return {
      ok: !r.error,
      code: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      error: r.error ? String(r.error) : null,
    };
  } catch (e) {
    return { ok: false, code: null, stdout: "", stderr: "", error: String(e) };
  }
}

/** Parse `  file:line  [rule]  detail` lines from sast-scan output. */
function parseSast(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s{2}(\S+):(\d+)\s+\[([^\]]+)\]\s+(.*)$/);
    if (m)
      out.push({
        file: m[1],
        line: Number(m[2]),
        rule: m[3],
        detail: (m[4] ?? "").trim().slice(0, 300),
      });
  }
  return out;
}

function blameLine(file, line) {
  const r = run("git", [
    "blame",
    "-L",
    `${line},${line}`,
    "--porcelain",
    "--",
    file,
  ]);
  if (!r.ok || r.code !== 0)
    return {
      nullReason: `git blame failed (${r.error ?? `exit ${r.code}`}) — file may be untracked or outside git`,
    };
  const lines = r.stdout.split("\n");
  const first = lines[0] ?? "";
  const sha = first.split(" ")[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha))
    return { nullReason: "git blame output unparseable — refusing to guess" };
  if (sha === ZERO_SHA)
    return {
      nullReason:
        "uncommitted working-tree line — no commit yet; blaming it would misattribute the last committed version",
    };
  let author = null;
  let mail = null;
  let time = null;
  for (const l of lines) {
    if (l.startsWith("author ")) author = l.slice(7).trim();
    else if (l.startsWith("author-mail ")) mail = l.slice(12).trim();
    else if (l.startsWith("author-time ")) time = l.slice(12).trim();
  }
  if (!author && !mail)
    return {
      commit: sha,
      nullReason:
        "blame gives no author identity — refusing to substitute git config user",
    };
  const who =
    author && mail && mail !== "<>"
      ? `${author} ${mail}`
      : (author ?? mail ?? null);
  let at = null;
  let atReason = null;
  if (time && /^\d+$/.test(time))
    at = new Date(Number(time) * 1000).toISOString();
  else atReason = "blame gives no author timestamp";
  return { commit: sha, by: who, at, atReason };
}

function commitSubject(sha) {
  const r = run("git", ["show", "-s", "--format=%s", sha]);
  if (!r.ok || r.code !== 0)
    return { value: null, reason: "commit subject unreadable" };
  const s = (r.stdout ?? "").trim().slice(0, 200);
  return s
    ? { value: s, reason: null }
    : { value: null, reason: "empty commit subject" };
}

/** Owner/repo from the origin URL WITHOUT ever exposing embedded credentials. */
function repoSlug() {
  const r = run("git", ["config", "--get", "remote.origin.url"]);
  if (!r.ok || r.code !== 0)
    return { slug: null, reason: "no origin remote configured" };
  const raw = (r.stdout ?? "").trim();
  const m = raw.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\s*$/);
  if (!m) return { slug: null, reason: "origin is not a github.com remote" };
  return { slug: `${m[1]}/${m[2]}`, reason: null };
}

async function fetchJson(url, token, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const limited = res.status === 403 || res.status === 429;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, limited, body };
  } catch (e) {
    return {
      status: null,
      ok: false,
      limited: false,
      body: null,
      error: String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

function loadJsonFile(path) {
  try {
    return {
      value: JSON.parse(readFileSync(resolve(ROOT, path), "utf8")),
      error: null,
    };
  } catch (e) {
    return { value: null, error: String(e) };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }

  const sastBase = opts.base ?? process.env.SAST_BASE ?? "HEAD";

  // (a) SAST findings via the real scanner — rules never reimplemented here.
  const sast = run("node", [SAST_SCRIPT, "--base", sastBase]);
  const combined = `${sast.stdout}\n${sast.stderr}`;
  let sastFindings = [];
  let sastNote;
  if (sast.code === 0) {
    sastNote = `sast-scan passed (exit 0) vs base '${sastBase}' — zero findings in scope`;
  } else if (sast.code === 1) {
    sastFindings = parseSast(combined);
    sastNote = `sast-scan exit 1 vs base '${sastBase}' — ${sastFindings.length} finding(s) parsed from scanner output`;
  } else {
    sastNote =
      `sast-scan unusable (${sast.error ?? `exit ${sast.code}`}) vs base '${sastBase}' — ` +
      "findings unknown, not zero; fix the scanner invocation, never read this as a pass";
  }

  // (c) PR lookup context — resolved once, never fatal, never networked offline.
  const token = opts.noPr
    ? null
    : (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null);
  const prCache = new Map();
  if (opts.prsJson) {
    const loaded = loadJsonFile(opts.prsJson);
    if (loaded.value && typeof loaded.value === "object") {
      for (const [k, v] of Object.entries(loaded.value)) prCache.set(k, v);
    }
  }
  let slug = null;
  let slugReason = token
    ? null
    : "no GITHUB_TOKEN/GH_TOKEN in env — offline run; PR fields stay null";
  if (token) {
    const s = repoSlug();
    slug = s.slug;
    slugReason = s.reason;
  }
  const prJoin = { token: !!token, slug, slugReason, cache: prCache };

  async function prFor(sha) {
    if (prCache.has(sha)) {
      const c = prCache.get(sha);
      if (c && typeof c === "object" && (c.number || c.url || c.author)) {
        return {
          pr:
            c.number || c.url || c.author
              ? {
                  number: c.number ?? null,
                  url: c.url ?? null,
                  author: c.author ?? null,
                }
              : null,
          reviewers: Array.isArray(c.reviewers) ? c.reviewers : null,
          reasons: {
            ...(c.number || c.url || c.author
              ? {}
              : { pr: "fixture entry has no PR identity" }),
            ...(Array.isArray(c.reviewers)
              ? {}
              : { reviewers: "fixture entry has no reviewers" }),
          },
          source: "prs-json fixture",
        };
      }
      return {
        pr: null,
        reviewers: null,
        reasons: {
          pr: "fixture marks this commit as having no PR",
          reviewers: "fixture marks this commit as having no PR",
        },
        source: "prs-json fixture",
      };
    }
    if (!token)
      return {
        pr: null,
        reviewers: null,
        reasons: {
          pr: "no GITHUB_TOKEN/GH_TOKEN in env — offline run; pass --prs-json to join fixture data",
          reviewers: "no GITHUB_TOKEN/GH_TOKEN in env — offline run",
        },
        source: "offline",
      };
    if (!slug)
      return {
        pr: null,
        reviewers: null,
        reasons: { pr: slugReason, reviewers: slugReason },
        source: "offline",
      };
    const list = await fetchJson(
      `https://api.github.com/repos/${slug}/commits/${sha}/pulls`,
      token,
    );
    if (!list.ok) {
      const why = list.limited
        ? "GitHub API rate-limited — retry later; never read absence as no-PR"
        : `GitHub API unavailable (status ${list.status ?? list.error}) — best-effort lookup, not evidence of no-PR`;
      return {
        pr: null,
        reviewers: null,
        reasons: { pr: why, reviewers: why },
        source: "api",
      };
    }
    const pulls = Array.isArray(list.body) ? list.body : [];
    if (pulls.length === 0)
      return {
        pr: null,
        reviewers: null,
        reasons: {
          pr: "commit has no associated PR via the API (direct push or PR data unavailable)",
          reviewers: "no PR to take reviewers from",
        },
        source: "api",
      };
    const p = pulls[0];
    const pr = {
      number: p.number ?? null,
      url: p.html_url ?? p.url ?? null,
      author: p.user?.login ?? null,
    };
    let reviewers = null;
    let reviewersReason = null;
    if (pr.number != null) {
      const rev = await fetchJson(
        `https://api.github.com/repos/${slug}/pulls/${pr.number}/reviews`,
        token,
      );
      if (rev.ok && Array.isArray(rev.body)) {
        reviewers = [
          ...new Set(rev.body.map((r) => r?.user?.login).filter(Boolean)),
        ];
        if (reviewers.length === 0) reviewersReason = "PR has no reviews yet";
      } else {
        reviewersReason = rev.limited
          ? "GitHub API rate-limited on reviews — retry later"
          : `reviews lookup unavailable (status ${rev.status ?? rev.error})`;
      }
    } else {
      reviewersReason = "PR number unknown — cannot fetch reviewers";
    }
    prCache.set(sha, { ...pr, reviewers });
    return {
      pr,
      reviewers,
      reasons: { ...(reviewers ? {} : { reviewers: reviewersReason }) },
      source: "api",
    };
  }

  // (b)+(c) per-finding linkage.
  const findings = [];
  for (const f of sastFindings) {
    const entry = {
      file: f.file,
      line: f.line,
      rule: f.rule,
      detail: f.detail || null,
      introducedBy: null,
      introducedAt: null,
      introducingCommit: null,
      introducingSubject: null,
      pr: null,
      reviewers: null,
      reasons: {},
    };
    const b = blameLine(f.file, f.line);
    if (b.nullReason) {
      entry.reasons.introducedBy = b.nullReason;
      entry.reasons.introducedAt = b.nullReason;
      entry.reasons.pr = "no introducing commit — cannot join to a PR";
      entry.reasons.reviewers =
        "no introducing commit — cannot join to reviewers";
    } else {
      entry.introducingCommit = b.commit;
      if (b.by) entry.introducedBy = b.by;
      else entry.reasons.introducedBy = b.nullReason ?? "unknown author";
      if (b.at) entry.introducedAt = b.at;
      else entry.reasons.introducedAt = b.atReason ?? "unknown timestamp";
      const subj = commitSubject(b.commit);
      if (subj.value) entry.introducingSubject = subj.value;
      else entry.reasons.introducingSubject = subj.reason;
      const joined = await prFor(b.commit);
      entry.pr = joined.pr;
      entry.reviewers = joined.reviewers;
      Object.assign(entry.reasons, joined.reasons);
    }
    findings.push(entry);
  }

  // (d) Package side — mirror, never import (different runtime, no DB here).
  let packages = [];
  let packagesNote =
    "no --packages-json given: this dependency-free script has no DB handle, so " +
    "packageSecurityReport rows cannot be recomputed here. To attach them, dump " +
    "PackageSecurityReport objects to JSON and pass --packages-json. Join key back " +
    "to the stored rows/audits is (package.kind, package.id, version, sha256); " +
    "there is no direct key between a repo-file SAST finding and a DB-content " +
    "package finding — the linkage is the side-by-side actor/review/resolution view.";
  if (opts.packagesJson) {
    const loaded = loadJsonFile(opts.packagesJson);
    if (Array.isArray(loaded.value)) {
      packages = loaded.value;
      packagesNote = `attached ${packages.length} PackageSecurityReport-shaped row(s) from ${opts.packagesJson} (field names mirror packageSecurityReport; this script does not recompute them)`;
    } else {
      packagesNote = `--packages-json unreadable (${loaded.error}) — packages unknown, not zero`;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sastBase,
    sastNote,
    findings,
    packages,
    packagesNote,
    notes: [
      "Attribution is evidence about WHICH ACCOUNT introduced a change (commit author, PR author, reviewers) — never proof of intent, culpability, or authorization.",
      "git user.name/email is self-asserted: never treat introducedBy as verified identity.",
      "Every null carries its reason in the finding-level `reasons` map; absence of data is never evidence of absence of risk.",
    ],
  };

  const text = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(text);
  if (opts.out) {
    const dest = resolve(ROOT, opts.out);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
    console.error(
      `attribution-report: wrote ${opts.out} (${findings.length} finding(s), ${packages.length} package(s))`,
    );
  }
}

main().catch((e) => {
  console.error(`attribution-report FAILED: ${e?.stack ?? e}`);
  process.exit(1);
});
