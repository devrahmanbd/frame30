#!/usr/bin/env node
/**
 * Blocking dependency audit.
 *
 * Runs `npm audit --omit=dev --json` and fails on any high/critical finding
 * that is NOT covered by a reviewed exception in dep-exceptions.json.
 * Replaces the old advisory `npm audit ... || true` step, which stayed green
 * while vulnerabilities piled up.
 *
 * Exception entries require: module, reason, owner, expires (YYYY-MM-DD).
 * CI fails on expired entries, missing owners, and malformed entries — even
 * when the underlying advisory is gone, so dead exceptions cannot linger.
 * Entries matching no current advisory print a warning (remove them).
 *
 * Usage:
 *   node scripts/dep-audit.mjs [--exceptions <path>] [--audit-level high|critical]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    "usage: node scripts/dep-audit.mjs [--exceptions <path>] [--audit-level high|critical]",
  );
  process.exit(0);
}

const exceptionsPath = resolve(
  ROOT,
  flag("exceptions", "scripts/dep-exceptions.json"),
);
const level = flag("audit-level", "high");
const LEVELS = ["low", "moderate", "high", "critical"];
if (!["high", "critical"].includes(level)) {
  console.error(
    `dep audit: --audit-level must be high or critical, got ${level}`,
  );
  process.exit(2);
}
const blocked = (sev) => LEVELS.indexOf(sev) >= LEVELS.indexOf(level);
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- exceptions
let raw;
try {
  raw = readFileSync(exceptionsPath, "utf8");
} catch (e) {
  console.error(
    `dep audit FAILED — cannot read ${exceptionsPath}: ${e.message}`,
  );
  process.exit(1);
}
let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  console.error(
    `dep audit FAILED — ${exceptionsPath} is not valid JSON: ${e.message}`,
  );
  process.exit(1);
}
const entries = Array.isArray(doc.exceptions) ? doc.exceptions : null;
if (!entries) {
  console.error(
    `dep audit FAILED — ${exceptionsPath} needs an "exceptions" array`,
  );
  process.exit(1);
}

const errors = [];
const usable = [];
entries.forEach((e, i) => {
  const where = `exceptions[${i}]${e?.module ? ` (${e.module})` : ""}`;
  if (!e || typeof e !== "object") {
    errors.push(`${where}: not an object`);
    return;
  }
  if (!e.module || typeof e.module !== "string")
    errors.push(`${where}: missing module`);
  if (!e.reason || String(e.reason).trim().length < 10)
    errors.push(
      `${where}: missing reason (say why it is non-exploitable here)`,
    );
  if (!e.owner || !String(e.owner).trim())
    errors.push(`${where}: missing owner (exceptions must have a human owner)`);
  if (!e.expires || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.expires)))
    errors.push(`${where}: expires must be YYYY-MM-DD`);
  else {
    const d = new Date(`${e.expires}T00:00:00Z`);
    if (Number.isNaN(d.getTime()))
      errors.push(`${where}: expires is not a date`);
    else if (String(e.expires) < today)
      errors.push(
        `${where}: EXPIRED on ${e.expires} — re-triage or upgrade, then renew`,
      );
  }
  if (e.advisory && typeof e.advisory !== "string")
    errors.push(
      `${where}: advisory must be a string (GHSA id or URL fragment)`,
    );
});

if (errors.length > 0) {
  console.error("dep audit FAILED — bad exception entries:\n");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
for (const e of entries) usable.push(e);

// --------------------------------------------------------------------- audit
let stdout;
try {
  stdout = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  // npm audit exits non-zero when findings exist — the JSON is still on stdout.
  stdout = e.stdout ?? "";
  if (!stdout) {
    console.error(
      `dep audit FAILED — npm audit did not run: ${e.message}\n` +
        "(failing closed: an unrunnable audit is not a passing audit)",
    );
    process.exit(1);
  }
}
let report;
try {
  report = JSON.parse(stdout);
} catch (e) {
  console.error(
    `dep audit FAILED — npm audit output is not JSON: ${e.message}`,
  );
  process.exit(1);
}

// npm >= 7: report.vulnerabilities {name: {severity, range, via[], fixAvailable}}
// npm 6 fallback: report.advisories {id: {module_name, severity, url, title, findings}}
const findings = [];
if (report.vulnerabilities && typeof report.vulnerabilities === "object") {
  for (const [name, v] of Object.entries(report.vulnerabilities)) {
    if (!v || !blocked(v.severity)) continue;
    const vias = Array.isArray(v.via) ? v.via : [];
    const advisories = vias.filter((x) => x && typeof x === "object");
    const chain = vias
      .filter((x) => typeof x === "string")
      .slice(0, 4)
      .join(" > ");
    if (advisories.length === 0) {
      findings.push({
        module: name,
        severity: v.severity,
        id: "(no advisory id)",
        title: `vulnerable range ${v.range ?? "?"}`,
        chain,
      });
    }
    for (const a of advisories) {
      findings.push({
        module: name,
        severity: v.severity,
        id: advisoryId(a),
        title: a.title ?? name,
        url: a.url ?? "",
        range: v.range ?? "",
        chain,
      });
    }
  }
} else if (report.advisories && typeof report.advisories === "object") {
  for (const a of Object.values(report.advisories)) {
    if (!blocked(a.severity)) continue;
    findings.push({
      module: a.module_name,
      severity: a.severity,
      id: advisoryId(a),
      title: a.title ?? a.module_name,
      url: a.url ?? "",
      chain: "",
    });
  }
}

function advisoryId(a) {
  const m = String(a.url ?? "").match(/GHSA-[a-z0-9-]+/i);
  return m ? m[0].toUpperCase() : (a.id ?? a.title ?? "(no advisory id)");
}

const covers = (entry, f) => {
  if (entry.module !== f.module) return false;
  if (!entry.advisory) return true;
  const needle = entry.advisory.toUpperCase();
  return (
    String(f.id).toUpperCase().includes(needle) ||
    String(f.url ?? "")
      .toUpperCase()
      .includes(needle)
  );
};

const blocking = [];
const covered = [];
const matchedEntries = new Set();
for (const f of findings) {
  const hit = usable.find((e) => covers(e, f));
  if (hit) {
    matchedEntries.add(usable.indexOf(hit));
    covered.push({ f, hit });
  } else {
    blocking.push(f);
  }
}

for (const [i, e] of usable.entries()) {
  if (!matchedEntries.has(i)) {
    console.log(
      `note: exception for ${e.module}${e.advisory ? ` (${e.advisory})` : ""} matches no current advisory — remove it.`,
    );
  }
}
for (const { f, hit } of covered) {
  console.log(
    `covered [${f.severity}] ${f.module} ${f.id} — exception by ${hit.owner}, expires ${hit.expires}`,
  );
}

if (blocking.length > 0) {
  console.error(
    `\ndep audit FAILED — ${blocking.length} high/critical finding(s) with no reviewed exception:\n`,
  );
  for (const f of blocking) {
    console.error(`  [${f.severity}] ${f.module}  ${f.id}  ${f.title}`);
    if (f.range) console.error(`    vulnerable range: ${f.range}`);
    if (f.chain) console.error(`    via: ${f.chain}`);
    if (f.url) console.error(`    ${f.url}`);
  }
  console.error(
    "\nTriage each one: if it is genuinely non-exploitable here, add an entry\n" +
      `to ${exceptionsPath} with reason + owner + expiry. Otherwise upgrade.`,
  );
  process.exit(1);
}

const n = findings.length;
console.log(
  `\ndep audit passed — ${n} high/critical finding(s), all covered by reviewed exceptions (level: ${level}).`,
);
