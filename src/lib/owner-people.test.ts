/**
 * Fallback credential material must be CSPRNG-backed — `Math.random` output
 * is guessable and this value becomes an account password.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mintFallbackPassword } from "./owner-people.server";

describe("mintFallbackPassword", () => {
  it("has UUID entropy, complexity suffix, and uniqueness", () => {
    const a = mintFallbackPassword();
    const b = mintFallbackPassword();
    expect(a).toMatch(/^[0-9a-f]{32}Aa1!$/);
    expect(b).toMatch(/^[0-9a-f]{32}Aa1!$/);
    expect(a).not.toBe(b);
  });

  it("uses no Math.random in the mint path", () => {
    const src = readFileSync("src/lib/owner-people.server.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/Math\.random/);
  });
});
