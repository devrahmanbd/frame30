#!/usr/bin/env node
/*
 * framique-harness (v0.1.0) — agent-task harness runner.
 *
 * Task files live at harness/tasks/<id>.json and have EXACTLY this shape:
 *   {"id","title","instruction","kind":"guard"|"fix"|"e2e",
 *    "cost":"fast"|"slow","environment":{"worktree":bool,"ports":0|1},
 *    "verifier":{"command":[exe,args...],"timeout_sec":n},
 *    "reward":{"mode":"all-pass"}}
 * Verifier commands run with cwd set to the provisioned env root.
 *
 * CLI contract:
 *   node harness/run.mjs --list
 *     JSON array of {id,title,kind,cost} for valid tasks on stdout.
 *     Exit non-zero with errors on stderr when any task file is invalid.
 *   node harness/run.mjs <id> [--verify-only]
 *     Full run: validate, provision env, run verifier(s), print trace JSON
 *     to stdout AND write harness/traces/<id>-<timestamp>.json.
 *     Exit 0 with reward 1.0, exit 1 with reward 0.0, exit 2 when null.
 *     --verify-only skips worktree provisioning (runs in the current tree).
 *   node harness/run.mjs <id> --setup
 *     Provision env only, print env JSON {worktree,ports,env} on stdout for
 *     an external agent to work in. Leaves the worktree behind (no cleanup).
 *   node harness/run.mjs <id> --score <envfile>
 *     Run the verifier in the env described by <envfile> (as printed by
 *     --setup), emit the trace, and always cleanup the worktree.
 *   node harness/run.mjs --self-test
 *     Fixture-proof the runner in a temp dir without touching the real tree.
 *
 * Reward semantics (non-negotiable): reward is ONE number — 1.0 iff every
 * verifier command exited 0; 0.0 if any verifier RAN and failed (including a
 * task-timeout kill of a stuck verifier); null (with a reason, never 0) if
 * the verifier never ran meaningfully (setup failure, missing executable,
 * harness-internal error). No weighting, no completion bonuses.
 *
 * Environment provisioning:
 *   - Worktrees: `git worktree add --detach <tmp>` with a unique path under
 *     /tmp/opencode/harness-*, NEVER inside the repo (keeps the repo clean
 *     and guarantees the verifier sees a pristine HEAD-state checkout).
 *   - node_modules is symlinked from the repo root into the worktree because
 *     a fresh install takes minutes; symlinking is the standard trick and
 *     keeps verifier runs hermetic enough while staying fast.
 *   - ports:1 allocates a free loopback port (probed with node:net) and
 *     passes it through as E2E_PORT (plus PORT alias) in the verifier env.
 *   - Worktrees are always cleaned up (`git worktree remove --force`, then
 *     `git worktree prune` + a list check so none are ever stranded), even
 *     on failure. Verifier output is streamed to a temp file and only the
 *     last 64KB is kept in the trace so a chatty verifier cannot blow
 *     memory. Timeouts default to 300s; per-task timeout_sec wins.
 *
 * Trace JSON shape:
 *   {taskId, harness:{name,version}, startedAt, env:{worktree|null,ports},
 *    verifierResults:[{command,exit,durationMs,timedOut,tail,started}],
 *    reward, rewardNote}
 * `started` (extra forensic field) marks whether the verifier process
 * actually spawned; entries that never started carry the reason in `tail`
 * and always score reward null.
 *
 * Node builtins only (no npm deps). Test overrides for self-test isolation:
 *   HARNESS_REPO_ROOT, HARNESS_TASKS_DIR, HARNESS_TRACES_DIR.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_NAME = "framique-harness";
const HARNESS_VERSION = "0.1.0";
const DEFAULT_TIMEOUT_SEC = 300;
const TAIL_MAX_BYTES = 64 * 1024;
const LOG_DISCARD_AFTER_BYTES = 16 * 1024 * 1024;
const TERM_GRACE_MS = 5000;
const VALID_KINDS = ["guard", "fix", "e2e"];
const VALID_COSTS = ["fast", "slow"];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);

function repoRoot() {
  return process.env.HARNESS_REPO_ROOT || path.resolve(SCRIPT_DIR, "..");
}

function tasksDir() {
  return (
    process.env.HARNESS_TASKS_DIR || path.join(repoRoot(), "harness", "tasks")
  );
}

function tracesDir() {
  return (
    process.env.HARNESS_TRACES_DIR || path.join(repoRoot(), "harness", "traces")
  );
}

function err(msg) {
  process.stderr.write(msg + "\n");
}

function outJson(value) {
  fs.writeSync(1, JSON.stringify(value, null, 2) + "\n");
}

class TaskError extends Error {}

/* ------------------------------------------------------------------ */
/* Task loading + validation                                           */
/* ------------------------------------------------------------------ */

function validateTask(obj, label) {
  const errors = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [`${label}: task must be a JSON object`];
  }
  if (typeof obj.id !== "string" || obj.id.length === 0) {
    errors.push(`${label}: "id" must be a non-empty string`);
  } else if (!ID_RE.test(obj.id)) {
    errors.push(`${label}: "id" must match ${ID_RE}`);
  }
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    errors.push(`${label}: "title" must be a non-empty string`);
  }
  if (typeof obj.instruction !== "string" || obj.instruction.length === 0) {
    errors.push(`${label}: "instruction" must be a non-empty string`);
  }
  if (!VALID_KINDS.includes(obj.kind)) {
    errors.push(
      `${label}: "kind" must be one of ${VALID_KINDS.join("|")} (got ${JSON.stringify(obj.kind)})`,
    );
  }
  if (!VALID_COSTS.includes(obj.cost)) {
    errors.push(
      `${label}: "cost" must be one of ${VALID_COSTS.join("|")} (got ${JSON.stringify(obj.cost)})`,
    );
  }
  if (
    obj.environment === null ||
    typeof obj.environment !== "object" ||
    Array.isArray(obj.environment)
  ) {
    errors.push(`${label}: "environment" must be an object`);
  } else {
    if (typeof obj.environment.worktree !== "boolean") {
      errors.push(`${label}: "environment.worktree" must be a boolean`);
    }
    if (obj.environment.ports !== 0 && obj.environment.ports !== 1) {
      errors.push(`${label}: "environment.ports" must be 0 or 1`);
    }
  }
  if (
    obj.verifier === null ||
    typeof obj.verifier !== "object" ||
    Array.isArray(obj.verifier)
  ) {
    errors.push(`${label}: "verifier" must be an object`);
  } else {
    if (
      !Array.isArray(obj.verifier.command) ||
      obj.verifier.command.length === 0 ||
      !obj.verifier.command.every((a) => typeof a === "string" && a.length > 0)
    ) {
      errors.push(
        `${label}: "verifier.command" must be a non-empty array of non-empty strings`,
      );
    }
    if (
      typeof obj.verifier.timeout_sec !== "number" ||
      !Number.isFinite(obj.verifier.timeout_sec) ||
      obj.verifier.timeout_sec <= 0
    ) {
      errors.push(`${label}: "verifier.timeout_sec" must be a positive number`);
    }
  }
  if (
    obj.reward === null ||
    typeof obj.reward !== "object" ||
    Array.isArray(obj.reward)
  ) {
    errors.push(`${label}: "reward" must be an object`);
  } else if (obj.reward.mode !== "all-pass") {
    errors.push(`${label}: "reward.mode" must be "all-pass"`);
  }
  return errors;
}

function readTaskFile(id) {
  if (!ID_RE.test(id)) {
    throw new TaskError(`invalid task id ${JSON.stringify(id)}`);
  }
  const file = path.join(tasksDir(), id + ".json");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new TaskError(`unknown task ${JSON.stringify(id)} (${file})`);
    }
    throw new TaskError(`cannot read ${file}: ${e.message}`);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new TaskError(`invalid JSON in ${file}: ${e.message}`);
  }
  const errors = validateTask(obj, file);
  if (obj && typeof obj === "object" && obj.id !== id) {
    errors.push(
      `${file}: "id" ${JSON.stringify(obj.id)} does not match filename ${JSON.stringify(id)}`,
    );
  }
  if (errors.length > 0) {
    throw new TaskError(errors.join("\n"));
  }
  return obj;
}

function listValidTasks() {
  let files;
  try {
    files = fs.readdirSync(tasksDir());
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return { tasks: [], errors: [] };
    }
    throw e;
  }
  const tasks = [];
  const errors = [];
  for (const f of files.sort()) {
    if (!f.endsWith(".json")) {
      continue;
    }
    const file = path.join(tasksDir(), f);
    let obj;
    try {
      obj = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${file}: invalid JSON: ${e.message}`);
      continue;
    }
    const fileErrors = validateTask(obj, file);
    const stem = f.slice(0, -".json".length);
    if (obj && typeof obj === "object" && obj.id !== stem) {
      fileErrors.push(
        `${file}: "id" ${JSON.stringify(obj.id)} does not match filename ${JSON.stringify(stem)}`,
      );
    }
    if (fileErrors.length > 0) {
      errors.push(...fileErrors);
      continue;
    }
    tasks.push({
      id: obj.id,
      title: obj.title,
      kind: obj.kind,
      cost: obj.cost,
    });
  }
  return { tasks, errors };
}

/* ------------------------------------------------------------------ */
/* Environment provisioning                                            */
/* ------------------------------------------------------------------ */

function git(repo, args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || r.error?.message || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return (r.stdout || "").trim();
}

// Worktrees that must not be stranded if we die mid-run.
const activeWorktrees = new Set();
let signalsArmed = false;

function armSignals() {
  if (signalsArmed) {
    return;
  }
  signalsArmed = true;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      for (const dir of [...activeWorktrees]) {
        try {
          spawnSync("git", ["worktree", "remove", "--force", dir], {
            stdio: "ignore",
          });
        } catch {
          // best effort inside a signal handler
        }
      }
      process.exit(sig === "SIGINT" ? 130 : 143);
    });
  }
}

function provisionWorktree(repo) {
  const base = path.join("/tmp", "opencode");
  fs.mkdirSync(base, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const dir = path.join(base, `harness-${suffix}`);
  // `git worktree add` creates the directory itself; it must not exist yet.
  git(repo, ["worktree", "add", "--detach", dir]);
  armSignals();
  activeWorktrees.add(dir);
  // Symlink node_modules: a fresh install takes minutes, so share the
  // root install read-only-style. This is the standard worktree trick.
  const src = path.join(repo, "node_modules");
  const dst = path.join(dir, "node_modules");
  try {
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.symlinkSync(src, dst, "dir");
    }
  } catch (e) {
    throw new Error(`node_modules symlink into worktree failed: ${e.message}`);
  }
  // Symlink .env for the same reason it must never be copied: worktrees
  // only contain tracked files, but vite dev servers read env from the
  // worktree root — without it routes that need env answer 404 and the
  // verifier fails on environment, not on code (reward 0.0 for the wrong
  // reason). A symlink keeps exactly one secret-bearing file; pruning the
  // worktree revokes access. Tasks that must not see secrets need a
  // redacted env set instead — see HARNESS.md sandbox limits.
  for (const name of [".env"]) {
    try {
      const s = path.join(repo, name);
      const d = path.join(dir, name);
      if (fs.existsSync(s) && !fs.existsSync(d)) {
        fs.symlinkSync(s, d, "file");
      }
    } catch (e) {
      throw new Error(`${name} symlink into worktree failed: ${e.message}`);
    }
  }
  return dir;
}

function removeWorktree(repo, dir) {
  try {
    git(repo, ["worktree", "remove", "--force", dir]);
  } catch (e) {
    err(`warning: ${e.message}`);
  }
  // Never strand worktrees: fall back to rm -rf, then prune, then verify.
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    err(`warning: cannot remove ${dir}: ${e.message}`);
  }
  try {
    git(repo, ["worktree", "prune"]);
  } catch (e) {
    err(`warning: ${e.message}`);
  }
  try {
    const list = git(repo, ["worktree", "list", "--porcelain"]);
    const stillThere = list
      .split("\n")
      .some((line) => line === `worktree ${dir}`);
    if (stillThere) {
      err(`warning: worktree still registered after prune: ${dir}`);
    }
  } catch (e) {
    err(`warning: worktree list check failed: ${e.message}`);
  } finally {
    activeWorktrees.delete(dir);
  }
}

function allocPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr !== null && typeof addr === "object" ? addr.port : null;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
        } else if (typeof port !== "number") {
          reject(new Error("could not determine allocated port"));
        } else {
          resolve(port);
        }
      });
    });
  });
}

async function provisionEnv(task, { skipWorktree }) {
  const repo = repoRoot();
  let worktree = null;
  if (task.environment.worktree && !skipWorktree) {
    worktree = provisionWorktree(repo);
  }
  let ports = null;
  let env = {};
  if (task.environment.ports === 1) {
    ports = await allocPort();
    env = { E2E_PORT: String(ports), PORT: String(ports) };
  }
  return { root: worktree || repo, worktree, ports, env };
}

/* ------------------------------------------------------------------ */
/* Verifier execution                                                  */
/* ------------------------------------------------------------------ */

function resolveExe(exe, cwd) {
  if (exe.includes("/") || exe.includes(path.sep)) {
    const abs = path.resolve(cwd, exe);
    if (!fs.existsSync(abs)) {
      return {
        ok: false,
        reason: `executable not found: ${exe} (resolved to ${abs})`,
      };
    }
    return { ok: true, exe: abs };
  }
  return { ok: true, exe };
}

function readTail(logFile, truncatedOnDisk) {
  const size = fs.statSync(logFile).size;
  const start = Math.max(0, size - TAIL_MAX_BYTES);
  const fd = fs.openSync(logFile, "r");
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf8").replace(/^�+/, "");
    if (start > 0) {
      text = "[output truncated to last 64KB]\n" + text;
    }
    if (truncatedOnDisk) {
      text += `\n[log truncated at ${LOG_DISCARD_AFTER_BYTES} bytes on disk]`;
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

async function runVerifier(task, envInfo) {
  const command = task.verifier.command;
  const timeoutSec = task.verifier.timeout_sec || DEFAULT_TIMEOUT_SEC;
  const timeoutMs = timeoutSec * 1000;
  const cwd = envInfo.root;
  const startedAt = Date.now();

  const resolved = resolveExe(command[0], cwd);
  if (!resolved.ok) {
    return {
      command,
      exit: null,
      durationMs: Date.now() - startedAt,
      timedOut: false,
      tail: resolved.reason,
      started: false,
      note: resolved.reason,
    };
  }

  const logFile = path.join(
    os.tmpdir(),
    `harness-verifier-${process.pid}-${Date.now()}.log`,
  );
  const child = spawn(resolved.exe, command.slice(1), {
    cwd,
    env: { ...process.env, ...envInfo.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const out = fs.createWriteStream(logFile);
  let bytes = 0;
  let truncatedOnDisk = false;
  const onData = (chunk) => {
    if (bytes >= LOG_DISCARD_AFTER_BYTES) {
      return;
    }
    const room = LOG_DISCARD_AFTER_BYTES - bytes;
    const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
    out.write(slice);
    bytes += slice.length;
    if (bytes >= LOG_DISCARD_AFTER_BYTES) {
      truncatedOnDisk = true;
    }
  };
  if (child.stdout) {
    child.stdout.on("data", onData);
  }
  if (child.stderr) {
    child.stderr.on("data", onData);
  }

  let settled = false;
  const closePromise = new Promise((resolve) => {
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    child.on("error", (e) => done({ spawnError: e }));
    child.on("close", (code, signal) => done({ code, signal }));
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
    const grace = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    }, TERM_GRACE_MS);
    if (typeof grace.unref === "function") {
      grace.unref();
    }
  }, timeoutMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  const closed = await closePromise;
  clearTimeout(timer);
  out.end();
  await new Promise((resolve) => out.on("close", resolve));

  const durationMs = Date.now() - startedAt;
  let tail = "";
  try {
    tail = readTail(logFile, truncatedOnDisk);
  } catch {
    tail = "";
  }
  try {
    fs.rmSync(logFile, { force: true });
  } catch {
    // best effort
  }

  if (closed.spawnError) {
    const reason = `verifier failed to spawn: ${closed.spawnError.message}`;
    return {
      command,
      exit: null,
      durationMs,
      timedOut: false,
      tail: reason,
      started: false,
      note: reason,
    };
  }
  return {
    command,
    exit: timedOut ? null : closed.code,
    durationMs,
    timedOut,
    tail,
    started: true,
    note: timedOut
      ? `verifier timed out after ${timeoutSec}s (killed)`
      : `verifier exited ${closed.code}`,
  };
}

/* ------------------------------------------------------------------ */
/* Scoring + traces                                                   */
/* ------------------------------------------------------------------ */

function scoreResults(results) {
  const notStarted = results.find((r) => !r.started);
  if (notStarted) {
    return {
      reward: null,
      rewardNote: `verifier never ran: ${notStarted.note}`,
    };
  }
  const failed = results.filter((r) => r.timedOut || r.exit !== 0);
  if (failed.length === 0) {
    const n = results.length;
    return {
      reward: 1.0,
      rewardNote: `all ${n} verifier command(s) exited 0`,
    };
  }
  const parts = failed.map((r) => r.note);
  return { reward: 0.0, rewardNote: `verifier failed: ${parts.join("; ")}` };
}

function traceTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeTrace(taskId, trace) {
  const dir = tracesDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${taskId}-${traceTimestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(trace, null, 2) + "\n");
  return file;
}

function toTraceResult(r) {
  return {
    command: r.command,
    exit: r.exit,
    durationMs: r.durationMs,
    timedOut: r.timedOut,
    tail: r.tail,
    started: r.started,
  };
}

function exitForReward(reward) {
  if (reward === 1.0) {
    return 0;
  }
  if (reward === 0.0) {
    return 1;
  }
  return 2;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function cmdRun(id, { verifyOnly }) {
  let task;
  try {
    task = readTaskFile(id);
  } catch (e) {
    err(`error: ${e.message}`);
    process.exit(2);
  }
  const startedAt = new Date().toISOString();
  const repo = repoRoot();
  let envInfo = { root: repo, worktree: null, ports: null, env: {} };
  let setupError = null;
  try {
    envInfo = await provisionEnv(task, { skipWorktree: verifyOnly });
  } catch (e) {
    setupError = e;
  }
  let results = [];
  if (!setupError) {
    try {
      results = [await runVerifier(task, envInfo)];
    } catch (e) {
      setupError = e;
    }
  }
  let reward;
  let rewardNote;
  if (setupError) {
    reward = null;
    rewardNote = `setup failure: ${setupError.message}`;
  } else {
    ({ reward, rewardNote } = scoreResults(results));
  }
  const trace = {
    taskId: id,
    harness: { name: HARNESS_NAME, version: HARNESS_VERSION },
    startedAt,
    env: { worktree: envInfo.worktree, ports: envInfo.ports },
    verifierResults: results.map(toTraceResult),
    reward,
    rewardNote,
  };
  try {
    writeTrace(id, trace);
  } catch (e) {
    err(`warning: could not write trace file: ${e.message}`);
  }
  outJson(trace);
  if (envInfo.worktree) {
    removeWorktree(repo, envInfo.worktree);
  }
  process.exit(exitForReward(reward));
}

async function cmdSetup(id) {
  let task;
  try {
    task = readTaskFile(id);
  } catch (e) {
    err(`error: ${e.message}`);
    process.exit(2);
  }
  try {
    const envInfo = await provisionEnv(task, { skipWorktree: false });
    // Intentionally NOT cleaned up: the external agent works in this env,
    // and --score cleans it up afterwards.
    outJson({
      worktree: envInfo.worktree,
      ports: envInfo.ports,
      env: envInfo.env,
    });
    process.exit(0);
  } catch (e) {
    err(`error: setup failure: ${e.message}`);
    process.exit(2);
  }
}

async function cmdScore(id, envFile) {
  let task;
  try {
    task = readTaskFile(id);
  } catch (e) {
    err(`error: ${e.message}`);
    process.exit(2);
  }
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(envFile, "utf8"));
  } catch (e) {
    err(`error: cannot read env file ${envFile}: ${e.message}`);
    process.exit(2);
  }
  const repo = repoRoot();
  const startedAt = new Date().toISOString();
  const worktree =
    saved && typeof saved.worktree === "string" ? saved.worktree : null;
  const ports = saved && typeof saved.ports === "number" ? saved.ports : null;
  const extraEnv =
    saved && saved.env && typeof saved.env === "object" ? saved.env : {};
  const root = worktree || repo;
  let results = [];
  let reward;
  let rewardNote;
  if (worktree && !fs.existsSync(worktree)) {
    reward = null;
    rewardNote = `setup failure: worktree from env file is missing: ${worktree}`;
  } else {
    try {
      results = [
        await runVerifier(task, { root, worktree, ports, env: extraEnv }),
      ];
      ({ reward, rewardNote } = scoreResults(results));
    } catch (e) {
      reward = null;
      rewardNote = `setup failure: ${e.message}`;
    }
  }
  const trace = {
    taskId: id,
    harness: { name: HARNESS_NAME, version: HARNESS_VERSION },
    startedAt,
    env: { worktree, ports },
    verifierResults: results.map(toTraceResult),
    reward,
    rewardNote,
  };
  try {
    writeTrace(id, trace);
  } catch (e) {
    err(`warning: could not write trace file: ${e.message}`);
  }
  outJson(trace);
  if (worktree) {
    removeWorktree(repo, worktree);
  }
  process.exit(exitForReward(reward));
}

function cmdList() {
  let listing;
  try {
    listing = listValidTasks();
  } catch (e) {
    err(`error: cannot list tasks: ${e.message}`);
    process.exit(1);
  }
  outJson(listing.tasks);
  if (listing.errors.length > 0) {
    for (const e of listing.errors) {
      err(`error: ${e}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Self-test                                                           */
/* ------------------------------------------------------------------ */

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || r.error?.message || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed: ${detail}`);
  }
  return (r.stdout || "").trim();
}

function selfTestChild(args, extraEnv) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function hasStrandedWorktrees(listText) {
  // Provisioned worktrees look like /tmp/opencode/harness-<pid>-<ts>-<hex>.
  // (The self-test temp dir itself contains "harness-selftest-", which must
  // not match.)
  return listText
    .split("\n")
    .some((line) => /\/harness-\d+-\d+-[0-9a-f]+$/.test(line.trim()));
}

function selfTestParseTrace(child, what) {
  if (child.status === null) {
    throw new Error(`${what}: child did not exit (signal ${child.signal})`);
  }
  const text = (child.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${what}: child stdout is not trace JSON (exit ${child.status}): ${text.slice(0, 500)}`,
    );
  }
}

async function cmdSelfTest() {
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok, detail });
    err(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const tmp = fs.mkdtempSync(
    path.join("/tmp", "opencode", "harness-selftest-"),
  );
  const fakeRepo = path.join(tmp, "repo");
  const taskDir = path.join(tmp, "tasks");
  const traceDir = path.join(tmp, "traces");
  fs.mkdirSync(fakeRepo, { recursive: true });
  fs.mkdirSync(taskDir, { recursive: true });
  const childEnv = {
    HARNESS_REPO_ROOT: fakeRepo,
    HARNESS_TASKS_DIR: taskDir,
    HARNESS_TRACES_DIR: traceDir,
  };

  // Snapshot the REAL tree so we can prove the self-test never touched it.
  let realWorktreesBefore = null;
  let realTracesBefore = null;
  try {
    realWorktreesBefore = sh("git", ["-C", repoRoot(), "worktree", "list"]);
  } catch {
    realWorktreesBefore = null;
  }
  try {
    realTracesBefore = fs.readdirSync(tracesDir()).sort().join("\n");
  } catch {
    realTracesBefore = "";
  }

  let keepTmp = false;
  try {
    // Fake repo (a git repo is required for `git worktree add`).
    sh("git", ["init", "-q", fakeRepo]);
    sh("git", ["-C", fakeRepo, "config", "user.email", "selftest@example.com"]);
    sh("git", ["-C", fakeRepo, "config", "user.name", "selftest"]);
    fs.writeFileSync(path.join(fakeRepo, "README.md"), "selftest\n");
    // Fake node_modules to prove the worktree symlink step works.
    fs.mkdirSync(path.join(fakeRepo, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(fakeRepo, "node_modules", "marker.txt"),
      "shared\n",
    );
    sh("git", ["-C", fakeRepo, "add", "README.md"]);
    sh("git", ["-C", fakeRepo, "commit", "-qm", "init"]);

    const fixtures = {
      green: {
        id: "green",
        title: "green fixture",
        instruction: "exits 0",
        kind: "guard",
        cost: "fast",
        environment: { worktree: true, ports: 1 },
        verifier: {
          command: [
            "node",
            "-e",
            "if(!process.env.E2E_PORT){console.error('no E2E_PORT');process.exit(3)}require('fs').writeFileSync('marker-from-worktree.txt','hi')",
          ],
          timeout_sec: 120,
        },
        reward: { mode: "all-pass" },
      },
      red: {
        id: "red",
        title: "red fixture",
        instruction: "exits 1",
        kind: "fix",
        cost: "fast",
        environment: { worktree: false, ports: 0 },
        verifier: {
          command: ["node", "-e", "process.exit(1)"],
          timeout_sec: 60,
        },
        reward: { mode: "all-pass" },
      },
      missing: {
        id: "missing",
        title: "missing fixture",
        instruction: "nonexistent exe",
        kind: "guard",
        cost: "fast",
        environment: { worktree: false, ports: 0 },
        verifier: {
          command: ["./does-not-exist-harness-xyz"],
          timeout_sec: 60,
        },
        reward: { mode: "all-pass" },
      },
      timeout: {
        id: "timeout",
        title: "timeout fixture",
        instruction: "sleeps past timeout",
        kind: "e2e",
        cost: "slow",
        environment: { worktree: false, ports: 0 },
        verifier: {
          command: ["node", "-e", "setTimeout(function(){},15000)"],
          timeout_sec: 2,
        },
        reward: { mode: "all-pass" },
      },
    };
    for (const [name, task] of Object.entries(fixtures)) {
      fs.writeFileSync(
        path.join(taskDir, `${name}.json`),
        JSON.stringify(task, null, 2) + "\n",
      );
    }

    // 1. --list sees exactly the 4 fixtures.
    {
      const c = selfTestChild(["--list"], childEnv);
      let items = null;
      try {
        items = JSON.parse((c.stdout || "").trim());
      } catch {
        items = null;
      }
      const ids = Array.isArray(items) ? items.map((t) => t.id).sort() : null;
      check(
        "list: 4 fixtures listed",
        c.status === 0 &&
          JSON.stringify(ids) ===
            JSON.stringify(["green", "missing", "red", "timeout"]),
        `exit=${c.status} ids=${JSON.stringify(ids)}`,
      );
    }

    // 2. Invalid task files are rejected by --list; then removed again so
    //    the "exactly 4 fixtures" invariant holds for the other checks.
    {
      fs.writeFileSync(
        path.join(taskDir, "bogus.json"),
        JSON.stringify({
          id: "bogus",
          title: "x",
          instruction: "x",
          kind: "nope",
          cost: "fast",
          environment: { worktree: false, ports: 0 },
          verifier: { command: ["node", "-e", "0"], timeout_sec: 10 },
          reward: { mode: "all-pass" },
        }),
      );
      const c = selfTestChild(["--list"], childEnv);
      check(
        "list: invalid kind rejected non-zero",
        c.status !== 0 && /kind/.test(c.stderr || ""),
        `exit=${c.status}`,
      );
      fs.rmSync(path.join(taskDir, "bogus.json"));
    }

    // 3. Unknown id exits 2.
    {
      const c = selfTestChild(["nope"], childEnv);
      check("run: unknown id exits 2", c.status === 2, `exit=${c.status}`);
    }

    // 4. Green: reward 1.0, exit 0, trace file written, worktree isolation
    //    (marker written inside the worktree is invisible outside), and no
    //    stranded worktrees.
    {
      const c = selfTestChild(["green"], childEnv);
      const trace = selfTestParseTrace(c, "green");
      const traces = fs.existsSync(traceDir)
        ? fs.readdirSync(traceDir).filter((f) => f.startsWith("green-"))
        : [];
      const markerOutside = fs.existsSync(
        path.join(fakeRepo, "marker-from-worktree.txt"),
      );
      const wtPath = trace.env && trace.env.worktree;
      const wtRemoved = typeof wtPath === "string" && !fs.existsSync(wtPath);
      const wtList = sh("git", ["-C", fakeRepo, "worktree", "list"]);
      const stranded = hasStrandedWorktrees(wtList);
      const portsOk =
        trace.env && typeof trace.env.ports === "number" && trace.env.ports > 0;
      check(
        "green: reward 1.0 + exit 0 + trace file",
        c.status === 0 &&
          trace.reward === 1.0 &&
          traces.length === 1 &&
          portsOk,
        `exit=${c.status} reward=${trace.reward}`,
      );
      check(
        "green: worktree isolation (marker invisible outside, worktree gone, none stranded)",
        !markerOutside && wtRemoved && !stranded,
        `markerOutside=${markerOutside} wtRemoved=${wtRemoved} stranded=${stranded}`,
      );
    }

    // 5. Agent-separation mode: --setup provisions (with node_modules
    //    symlink), --score verifies and cleans up.
    {
      const s = selfTestChild(["green", "--setup"], childEnv);
      let saved = null;
      try {
        saved = JSON.parse((s.stdout || "").trim());
      } catch {
        saved = null;
      }
      const wtOk =
        saved &&
        typeof saved.worktree === "string" &&
        saved.worktree.length > 0;
      const linkTarget =
        wtOk &&
        (() => {
          try {
            return fs.readlinkSync(path.join(saved.worktree, "node_modules"));
          } catch {
            return null;
          }
        })();
      check(
        "setup: env JSON with worktree + node_modules symlink",
        s.status === 0 &&
          wtOk &&
          linkTarget === path.join(fakeRepo, "node_modules"),
        `exit=${s.status} link=${linkTarget}`,
      );
      if (wtOk) {
        const envFile = path.join(tmp, "setup-env.json");
        fs.writeFileSync(envFile, JSON.stringify(saved));
        const v = selfTestChild(["green", "--score", envFile], childEnv);
        const trace = selfTestParseTrace(v, "score");
        const gone = !fs.existsSync(saved.worktree);
        const wtList = sh("git", ["-C", fakeRepo, "worktree", "list"]);
        const stranded = hasStrandedWorktrees(wtList);
        check(
          "score: reward 1.0 + worktree cleaned up",
          v.status === 0 && trace.reward === 1.0 && gone && !stranded,
          `exit=${v.status} reward=${trace.reward} gone=${gone}`,
        );
      } else {
        check("score: reward 1.0 + worktree cleaned up", false, "no env JSON");
      }
    }

    // 6. Red: reward 0.0, exit 1.
    {
      const c = selfTestChild(["red"], childEnv);
      const trace = selfTestParseTrace(c, "red");
      check(
        "red: failing command → reward 0.0 + exit 1",
        c.status === 1 && trace.reward === 0.0,
        `exit=${c.status} reward=${trace.reward}`,
      );
    }

    // 7. Missing executable: reward null + exit 2 with a reason.
    {
      const c = selfTestChild(["missing"], childEnv);
      const trace = selfTestParseTrace(c, "missing");
      check(
        "missing: nonexistent exe → reward null + exit 2",
        c.status === 2 &&
          trace.reward === null &&
          typeof trace.rewardNote === "string" &&
          trace.rewardNote.length > 0,
        `exit=${c.status} reward=${trace.reward} note=${trace.rewardNote}`,
      );
    }

    // 8. Sleep-past-timeout: reward 0.0 (never null) with a timeout note.
    {
      const c = selfTestChild(["timeout"], childEnv);
      const trace = selfTestParseTrace(c, "timeout");
      const r0 = trace.verifierResults && trace.verifierResults[0];
      check(
        "timeout: stuck verifier → reward 0.0 + exit 1 + timeout note",
        c.status === 1 &&
          trace.reward === 0.0 &&
          !!r0 &&
          r0.timedOut === true &&
          /timed out/i.test(trace.rewardNote || ""),
        `exit=${c.status} reward=${trace.reward} note=${trace.rewardNote}`,
      );
    }

    // 9. The real tree was untouched.
    {
      let realWorktreesAfter = null;
      try {
        realWorktreesAfter = sh("git", ["-C", repoRoot(), "worktree", "list"]);
      } catch {
        realWorktreesAfter = null;
      }
      let realTracesAfter = "";
      try {
        realTracesAfter = fs.readdirSync(tracesDir()).sort().join("\n");
      } catch {
        realTracesAfter = "";
      }
      check(
        "isolation: real tree untouched (worktrees + traces unchanged)",
        realWorktreesBefore !== null &&
          realWorktreesAfter === realWorktreesBefore &&
          realTracesAfter === realTracesBefore,
        "compared git worktree list + harness/traces before/after",
      );
    }
  } catch (e) {
    keepTmp = true;
    check("self-test harness error", false, e.message);
  } finally {
    if (!keepTmp) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // best effort
      }
    } else {
      err(`self-test temp dir kept at ${tmp}`);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  err(`self-test: ${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "usage:",
    "  node harness/run.mjs --list",
    "  node harness/run.mjs <id> [--verify-only]",
    "  node harness/run.mjs <id> --setup",
    "  node harness/run.mjs <id> --score <envfile>",
    "  node harness/run.mjs --self-test",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    err(usage());
    process.exit(argv.length === 0 ? 2 : 0);
  }
  if (argv.includes("--list")) {
    if (argv.length !== 1) {
      err(`error: --list takes no other arguments\n${usage()}`);
      process.exit(2);
    }
    cmdList();
    return;
  }
  if (argv.includes("--self-test")) {
    if (argv.length !== 1) {
      err(`error: --self-test takes no other arguments\n${usage()}`);
      process.exit(2);
    }
    await cmdSelfTest();
    return;
  }
  const scoreAt = argv.indexOf("--score");
  const flags = argv.filter((a) => a.startsWith("--"));
  const positionals = argv.filter(
    (a, i) => !a.startsWith("--") && !(scoreAt !== -1 && i === scoreAt + 1),
  );
  const unknown = flags.filter(
    (f) => f !== "--setup" && f !== "--score" && f !== "--verify-only",
  );
  if (unknown.length > 0) {
    err(`error: unknown flag(s): ${unknown.join(" ")}\n${usage()}`);
    process.exit(2);
  }
  if (positionals.length !== 1) {
    err(`error: expected exactly one task id\n${usage()}`);
    process.exit(2);
  }
  const id = positionals[0];
  const wantSetup = flags.includes("--setup");
  const wantScore = flags.includes("--score");
  const verifyOnly = flags.includes("--verify-only");
  if (wantSetup && wantScore) {
    err("error: --setup and --score are mutually exclusive");
    process.exit(2);
  }
  if ((wantSetup || wantScore) && verifyOnly) {
    err("error: --verify-only cannot be combined with --setup/--score");
    process.exit(2);
  }
  if (wantSetup) {
    await cmdSetup(id);
    return;
  }
  if (wantScore) {
    const at = argv.indexOf("--score");
    const envFile = argv[at + 1];
    if (!envFile || envFile.startsWith("--")) {
      err("error: --score requires an env file argument");
      process.exit(2);
    }
    await cmdScore(id, envFile);
    return;
  }
  await cmdRun(id, { verifyOnly });
}

await main().catch((e) => {
  err(`error: harness-internal failure: ${e && e.message ? e.message : e}`);
  process.exit(2);
});
