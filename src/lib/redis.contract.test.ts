/**
 * Contract tests for the shared Redis layer.
 *
 * These assert the properties we actually depend on in production and that a
 * refactor could silently break:
 *   - RESP2 framing is byte-correct for multi-byte (Bangla) payloads;
 *   - a partial reply is reported as "need more bytes", never as a value;
 *   - with no REDIS_URL every call is a fast `unavailable`, so the limiter and
 *     the cache keep their fallbacks and nothing awaits a socket;
 *   - the sliding-window Lua script trims before it counts and admits last,
 *     which is what makes two racing isolates safe;
 *   - key namespacing carries the prefix, so preview and production can share
 *     one Redis without colliding.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeReply,
  encodeCommand,
  parseRedisUrl,
  redisCommand,
  redisConfigured,
  redisHealth,
  redisKey,
  redisReset,
} from "./redis.server";

const original = process.env["REDIS_URL"];

beforeEach(() => {
  delete process.env["REDIS_URL"];
  redisReset();
});

afterEach(() => {
  if (original === undefined) delete process.env["REDIS_URL"];
  else process.env["REDIS_URL"] = original;
  redisReset();
});

describe("RESP2 encoding", () => {
  it("frames commands as arrays of bulk strings with byte lengths", () => {
    expect(encodeCommand(["GET", "a"])).toBe("*2\r\n$3\r\nGET\r\n$1\r\na\r\n");
  });

  it("uses byte length, not code-unit length, for multi-byte values", () => {
    // "পণ্য" is 12 UTF-8 bytes; a length header of 4 desynchronises the stream.
    const encoded = encodeCommand(["SET", "k", "পণ্য"]);
    expect(encoded).toContain("$12\r\nপণ্য\r\n");
  });

  it("stringifies numeric arguments", () => {
    expect(encodeCommand(["PEXPIRE", "k", 1000])).toContain("$4\r\n1000\r\n");
  });
});

describe("RESP2 decoding", () => {
  it("decodes simple strings, integers and bulk strings", () => {
    expect(decodeReply("+PONG\r\n")).toEqual({ value: "PONG", rest: "" });
    expect(decodeReply(":7\r\n")).toEqual({ value: 7, rest: "" });
    expect(decodeReply("$3\r\nabc\r\n")).toEqual({ value: "abc", rest: "" });
  });

  it("decodes a null bulk string as null, not as the string 'null'", () => {
    expect(decodeReply("$-1\r\n")).toEqual({ value: null, rest: "" });
  });

  it("surfaces error replies without throwing", () => {
    const reply = decodeReply("-NOSCRIPT No matching script\r\n");
    expect(reply?.error).toContain("NOSCRIPT");
  });

  it("returns null for an incomplete reply instead of a truncated value", () => {
    expect(decodeReply("$5\r\nab")).toBeNull();
    expect(decodeReply("*2\r\n$1\r\na\r\n")).toBeNull();
  });

  it("decodes nested arrays and leaves the remainder intact", () => {
    const reply = decodeReply("*3\r\n:1\r\n:2\r\n$4\r\nnine\r\n+NEXT\r\n");
    expect(reply?.value).toEqual([1, 2, "nine"]);
    expect(reply?.rest).toBe("+NEXT\r\n");
  });
});

describe("configuration", () => {
  it("treats a missing URL as disabled", () => {
    expect(redisConfigured()).toBe(false);
    expect(redisHealth().configured).toBe(false);
  });

  it("rejects a non-redis scheme rather than guessing", () => {
    expect(parseRedisUrl("http://localhost:6379")).toBeNull();
    expect(parseRedisUrl("not a url")).toBeNull();
    expect(parseRedisUrl(undefined)).toBeNull();
  });

  it("parses credentials, port, tls and db index", () => {
    const target = parseRedisUrl("rediss://user:p%40ss@cache.internal:6380/3");
    expect(target).toMatchObject({
      host: "cache.internal",
      port: 6380,
      tls: true,
      username: "user",
      password: "p@ss",
      db: 3,
    });
  });

  it("defaults the port and leaves db unset when absent", () => {
    expect(parseRedisUrl("redis://localhost")).toMatchObject({ port: 6379, tls: false, db: undefined });
  });

  it("answers unavailable immediately when disabled — no socket, no wait", async () => {
    const started = Date.now();
    const result = await redisCommand(["PING"]);
    expect(result).toMatchObject({ ok: false, outcome: "unavailable", value: null });
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("namespaces keys with the configured prefix", () => {
    const previous = process.env["REDIS_PREFIX"];
    process.env["REDIS_PREFIX"] = "preview";
    expect(redisKey("rl", "auth.signin", "abc")).toBe("preview:rl:auth.signin:abc");
    if (previous === undefined) delete process.env["REDIS_PREFIX"];
    else process.env["REDIS_PREFIX"] = previous;
  });
});

describe("sliding-window script", () => {
  const source = readFileSync("src/lib/rate-limit.server.ts", "utf8");
  const lua = source.split("const SLIDING_WINDOW_LUA = `")[1]?.split("`;")[0] ?? "";

  it("is present and executed as a script, not as multiple round trips", () => {
    expect(lua).not.toBe("");
    expect(source).toContain("redisEval(");
  });

  it("trims the window before counting it", () => {
    expect(lua.indexOf("ZREMRANGEBYSCORE")).toBeLessThan(lua.indexOf("ZCARD"));
  });

  it("admits only after the count, and always sets a TTL", () => {
    expect(lua.indexOf("ZCARD")).toBeLessThan(lua.indexOf("ZADD"));
    expect(lua).toContain("if hits < limit then");
    expect(lua).toContain("PEXPIRE");
  });

  it("derives the reset hint from the oldest surviving member", () => {
    expect(lua).toContain("ZRANGE");
    expect(lua).toContain("reset = tonumber(oldest[2]) + window");
  });
});

describe("limiter tiering", () => {
  const source = readFileSync("src/lib/rate-limit.server.ts", "utf8");

  it("keeps the Postgres fixed window as the fallback tier", () => {
    expect(source).toContain('rpc("rate_limit_hit"');
  });

  it("distinguishes a degraded shared window from a fully unavailable limiter", () => {
    expect(source).toContain('outcome: "degraded"');
    expect(source).toContain('outcome: "unavailable"');
    expect(source).toContain("rate_limit.redis_degraded");
  });

  it("labels every verdict with the deciding tier", () => {
    expect(source).toContain('source: "redis"');
    expect(source).toContain('source: "postgres"');
    expect(source).toContain('source: "none"');
  });
});
