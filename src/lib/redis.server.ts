/**
 * Shared Redis client (RESP2 over a raw socket), server-only.
 *
 * Why hand-rolled: the app runs in a Worker-style isolate where `ioredis` and
 * `node-redis` do not survive bundling (they reach for `dns`, `cluster` and
 * `process` internals). `node:net` / `node:tls` *are* available, and RESP2 is a
 * small enough protocol that owning the client is cheaper than fighting a
 * dependency. It also lets us make the operational rules explicit:
 *
 *  - **Optional by contract.** No `REDIS_URL` means every call returns
 *    `null`/`unavailable` immediately and the caller keeps its database-backed
 *    fallback. Redis is an accelerator and a *shared* window, never a
 *    correctness dependency.
 *  - **Hard bounded.** Connect and per-command deadlines are short (SSR and
 *    money paths sit behind these calls). A slow Redis degrades to the fallback
 *    instead of holding a request open.
 *  - **Circuit broken.** After `BREAKER_FAILURES` consecutive faults the
 *    breaker opens for `BREAKER_COOLDOWN_MS`; while open we do not even attempt
 *    a socket, so a dead Redis costs microseconds, not a timeout per request.
 *  - **Observable.** Every command emits `framique_redis_commands_total` and
 *    `framique_redis_command_ms`; breaker state is a gauge. A silent cache or a
 *    silently-degraded limiter is the same class of defect as a missing policy.
 *  - **Single connection per isolate, pipelined.** Commands are written to one
 *    socket and answered in order; no pool, because an isolate is already the
 *    unit of concurrency here.
 *
 * Never import this from client-reachable code — it is `.server.ts` on purpose.
 */
import { incr, log, observe, registerMetric, setGauge } from "./observability.server";

registerMetric("framique_redis_commands_total", "counter", "Redis commands by command and outcome (ok/error/timeout/unavailable/open)");
registerMetric("framique_redis_command_ms", "histogram", "Redis command latency in milliseconds", [1, 2, 5, 10, 25, 50, 100, 250, 500]);
registerMetric("framique_redis_connects_total", "counter", "Redis connection attempts by outcome");
registerMetric("framique_redis_breaker_open", "gauge", "1 when the Redis circuit breaker is open");
registerMetric("framique_redis_enabled", "gauge", "1 when REDIS_URL is configured for this isolate");

const CONNECT_TIMEOUT_MS = 750;
const COMMAND_TIMEOUT_MS = 250;
const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 30_000;
const MAX_QUEUE = 256;

export type RedisValue = string | number | null | RedisValue[];

type Pending = {
  resolve: (value: RedisValue) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
};

type Target = {
  host: string;
  port: number;
  tls: boolean;
  username?: string;
  password?: string;
  db?: number;
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export function parseRedisUrl(raw: string | undefined): Target | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    log("error", "redis.url_invalid", { reason: "unparseable" });
    return null;
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    log("error", "redis.url_invalid", { reason: "scheme", scheme: url.protocol });
    return null;
  }
  const db = url.pathname.replace(/^\//, "");
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    tls: url.protocol === "rediss:",
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: db && /^\d+$/.test(db) ? Number(db) : undefined,
  };
}

/** Read once per isolate; env injection happens at call time, not module load. */
function target(): Target | null {
  if (targetCache === undefined) {
    targetCache = parseRedisUrl(process.env["REDIS_URL"]);
    setGauge("framique_redis_enabled", targetCache ? 1 : 0);
  }
  return targetCache;
}
let targetCache: Target | null | undefined;

export function redisConfigured(): boolean {
  return target() !== null;
}

/* ------------------------------------------------------------------ */
/* RESP2 encoding / decoding                                           */
/* ------------------------------------------------------------------ */

/** Commands are always sent as RESP arrays of bulk strings — never inline. */
export function encodeCommand(args: (string | number)[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const value = String(arg);
    // Byte length matters: a Bangla subject or a UTF-8 cache key is multi-byte.
    out += `$${byteLength(value)}\r\n${value}\r\n`;
  }
  return out;
}

function byteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.codePointAt(i)!;
    if (code > 0xffff) i += 1;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export type DecodeResult = { value: RedisValue; rest: string; error?: string } | null;

/**
 * Decode exactly one RESP2 reply from the head of `buffer`.
 * Returns `null` when the reply is incomplete (need more bytes).
 */
export function decodeReply(buffer: string): DecodeResult {
  if (buffer.length === 0) return null;
  const end = buffer.indexOf("\r\n");
  if (end === -1) return null;
  const kind = buffer[0];
  const head = buffer.slice(1, end);
  const rest = buffer.slice(end + 2);

  switch (kind) {
    case "+":
      return { value: head, rest };
    case "-":
      return { value: null, rest, error: head || "ERR" };
    case ":":
      return { value: Number(head), rest };
    case "$": {
      const length = Number(head);
      if (length === -1) return { value: null, rest };
      if (rest.length < length + 2) return null;
      return { value: rest.slice(0, length), rest: rest.slice(length + 2) };
    }
    case "*": {
      const count = Number(head);
      if (count === -1) return { value: null, rest };
      const items: RedisValue[] = [];
      let cursor = rest;
      for (let i = 0; i < count; i += 1) {
        const item = decodeReply(cursor);
        if (!item) return null;
        // A nested error inside an array is surfaced as null; the command-level
        // error path is what callers act on.
        items.push(item.error ? null : item.value);
        cursor = item.rest;
      }
      return { value: items, rest: cursor };
    }
    default:
      // Unknown type byte: treat as a protocol fault so the socket is recycled.
      return { value: null, rest, error: `PROTOCOL:${kind}` };
  }
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

type Socket = {
  write: (chunk: string) => void;
  destroy: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  setNoDelay?: (flag: boolean) => void;
};

class Connection {
  private buffer = "";
  private readonly queue: Pending[] = [];
  private closed = false;

  constructor(private readonly socket: Socket) {
    socket.on("data", (chunk: unknown) => this.onData(String(chunk)));
    socket.on("error", (error: unknown) => this.fail(asError(error)));
    socket.on("close", () => this.fail(new Error("redis.socket_closed")));
  }

  get dead() {
    return this.closed;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    for (;;) {
      const reply = decodeReply(this.buffer);
      if (!reply) return;
      this.buffer = reply.rest;
      const pending = this.queue.shift();
      if (!pending) continue; // out-of-band push (we do not subscribe)
      clearTimeout(pending.timer);
      if (reply.error) pending.reject(new Error(reply.error));
      else pending.resolve(reply.value);
    }
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    while (this.queue.length) {
      const pending = this.queue.shift()!;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    try {
      this.socket.destroy();
    } catch {
      /* already gone */
    }
  }

  destroy() {
    this.fail(new Error("redis.closed"));
  }

  send(args: (string | number)[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<RedisValue> {
    if (this.closed) return Promise.reject(new Error("redis.closed"));
    if (this.queue.length >= MAX_QUEUE) {
      // Backpressure is a fault, not a queue: a saturated socket means the
      // caller should take its fallback now rather than wait behind 256 replies.
      return Promise.reject(new Error("redis.queue_full"));
    }
    const command = String(args[0] ?? "unknown").toLowerCase();
    return new Promise<RedisValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out reply desynchronises the stream: kill the socket.
        this.fail(new Error("redis.timeout"));
        reject(new Error("redis.timeout"));
      }, timeoutMs);
      this.queue.push({ resolve, reject, timer, command });
      try {
        this.socket.write(encodeCommand(args));
      } catch (error) {
        clearTimeout(timer);
        this.fail(asError(error));
        reject(asError(error));
      }
    });
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

let connection: Connection | null = null;
let connecting: Promise<Connection | null> | null = null;
let failures = 0;
let openUntil = 0;

function breakerOpen(): boolean {
  const open = Date.now() < openUntil;
  setGauge("framique_redis_breaker_open", open ? 1 : 0);
  return open;
}

function recordFault(where: string, error: Error) {
  failures += 1;
  if (failures >= BREAKER_FAILURES && Date.now() >= openUntil) {
    openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    setGauge("framique_redis_breaker_open", 1);
    log("error", "redis.breaker_open", { where, cooldown_ms: BREAKER_COOLDOWN_MS, reason: error.message.slice(0, 120) });
  }
}

function recordSuccess() {
  if (failures > 0) log("info", "redis.recovered", { after_failures: failures });
  failures = 0;
  openUntil = 0;
  setGauge("framique_redis_breaker_open", 0);
}

async function connect(): Promise<Connection | null> {
  const cfg = target();
  if (!cfg) return null;

  const socket = await withDeadline(
    (async () => {
      const raw = cfg.tls
        ? (await import("node:tls")).connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
        : (await import("node:net")).connect({ host: cfg.host, port: cfg.port });
      const sock = raw as unknown as Socket & { once: (e: string, l: (...a: unknown[]) => void) => void };
      await new Promise<void>((resolve, reject) => {
        sock.once(cfg.tls ? "secureConnect" : "connect", () => resolve());
        sock.once("error", (error: unknown) => reject(asError(error)));
      });
      sock.setNoDelay?.(true);
      return sock as Socket;
    })(),
    CONNECT_TIMEOUT_MS,
    "redis.connect_timeout",
  );

  const conn = new Connection(socket);
  if (cfg.password) {
    await conn.send(cfg.username ? ["AUTH", cfg.username, cfg.password] : ["AUTH", cfg.password], CONNECT_TIMEOUT_MS);
  }
  if (cfg.db) await conn.send(["SELECT", cfg.db], CONNECT_TIMEOUT_MS);
  return conn;
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(asError(error));
      },
    );
  });
}

async function acquire(): Promise<Connection | null> {
  if (connection && !connection.dead) return connection;
  connection = null;
  if (!connecting) {
    connecting = connect()
      .then((conn) => {
        connection = conn;
        incr("framique_redis_connects_total", { outcome: conn ? "ok" : "disabled" });
        return conn;
      })
      .catch((error: unknown) => {
        incr("framique_redis_connects_total", { outcome: "error" });
        recordFault("connect", asError(error));
        return null;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

/* ------------------------------------------------------------------ */
/* Public command surface                                              */
/* ------------------------------------------------------------------ */

export type RedisOutcome = "ok" | "error" | "timeout" | "unavailable" | "open";
export type RedisResult = { ok: boolean; value: RedisValue; outcome: RedisOutcome };

/**
 * Run one command. Never throws: the caller inspects `ok` and takes its
 * fallback, which is what makes Redis optional in every call site.
 */
export async function redisCommand(
  args: (string | number)[],
  opts: { timeoutMs?: number } = {},
): Promise<RedisResult> {
  const command = String(args[0] ?? "unknown").toLowerCase();
  if (!redisConfigured()) {
    incr("framique_redis_commands_total", { command, outcome: "unavailable" });
    return { ok: false, value: null, outcome: "unavailable" };
  }
  if (breakerOpen()) {
    incr("framique_redis_commands_total", { command, outcome: "open" });
    return { ok: false, value: null, outcome: "open" };
  }

  const started = Date.now();
  try {
    const conn = await acquire();
    if (!conn) {
      incr("framique_redis_commands_total", { command, outcome: "unavailable" });
      return { ok: false, value: null, outcome: "unavailable" };
    }
    const value = await conn.send(args, opts.timeoutMs ?? COMMAND_TIMEOUT_MS);
    observe("framique_redis_command_ms", Date.now() - started, { command, outcome: "ok" });
    incr("framique_redis_commands_total", { command, outcome: "ok" });
    recordSuccess();
    return { ok: true, value, outcome: "ok" };
  } catch (error) {
    const err = asError(error);
    const timeout = /timeout/.test(err.message);
    const outcome: RedisOutcome = timeout ? "timeout" : "error";
    observe("framique_redis_command_ms", Date.now() - started, { command, outcome });
    incr("framique_redis_commands_total", { command, outcome });
    recordFault(command, err);
    log("warn", "redis.command_failed", { command, outcome, reason: err.message.slice(0, 160) });
    return { ok: false, value: null, outcome };
  }
}

/**
 * `EVAL` with automatic `EVALSHA` promotion.
 *
 * Scripts are the only way to make a sliding window atomic without a round trip
 * per member, and `EVALSHA` keeps the payload off the wire after the first call.
 * A `NOSCRIPT` answer transparently reloads the body.
 */
export async function redisEval(
  script: string,
  keys: string[],
  args: (string | number)[],
  opts: { timeoutMs?: number } = {},
): Promise<RedisResult> {
  const sha = await sha1(script);
  if (sha) {
    const cached = await redisCommand(["EVALSHA", sha, keys.length, ...keys, ...args], opts);
    if (cached.ok) return cached;
    if (cached.outcome === "unavailable" || cached.outcome === "open") return cached;
  }
  return redisCommand(["EVAL", script, keys.length, ...keys, ...args], opts);
}

const shaCache = new Map<string, string>();

async function sha1(script: string): Promise<string | null> {
  const hit = shaCache.get(script);
  if (hit) return hit;
  try {
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha1").update(script).digest("hex");
    shaCache.set(script, digest);
    return digest;
  } catch {
    return null;
  }
}

/** Namespaced key. Every tenant value MUST pass its merchant id here. */
export function redisKey(...parts: (string | number)[]): string {
  const prefix = process.env["REDIS_PREFIX"] ?? "fq";
  return [prefix, ...parts.map((p) => String(p).replace(/\s+/g, "_"))].join(":");
}

/** Test/ops hook: drop the connection and reset the breaker. */
export function redisReset() {
  connection?.destroy();
  connection = null;
  connecting = null;
  failures = 0;
  openUntil = 0;
  targetCache = undefined;
}

export function redisHealth() {
  return {
    configured: redisConfigured(),
    connected: Boolean(connection && !connection.dead),
    breakerOpen: Date.now() < openUntil,
    consecutiveFailures: failures,
  };
}

/** Liveness probe for `/status` and the ops desk. Never throws. */
export async function redisPing(): Promise<{ ok: boolean; ms: number; outcome: RedisOutcome }> {
  const started = Date.now();
  const result = await redisCommand(["PING"], { timeoutMs: CONNECT_TIMEOUT_MS });
  return { ok: result.ok && result.value === "PONG", ms: Date.now() - started, outcome: result.outcome };
}
