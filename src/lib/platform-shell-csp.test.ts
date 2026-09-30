import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../server";
import { buildCsp } from "./custom-code";
import { setCurrentNonce, getCurrentNonce } from "./ssr-nonce";

async function readBody(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function docResponse(html: string): Response {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(html));
      c.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const HTML =
  "<!DOCTYPE html><html><head><title>t</title></head><body>hi</body></html>";

describe("platform-shell CSP — medium/high documents must carry a nonce (live 2026-09-28)", () => {
  it("medium tier emits a nonce-based script-src (not bare 'self')", async () => {
    setCurrentNonce("");
    const req = new Request("http://localhost:3000/");
    const res = withSecurityHeaders(req, docResponse(HTML), "medium");
    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc =
      csp.split(";").find((p) => p.trim().startsWith("script-src")) ?? "";
    expect(csp).toContain("script-src");
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    const body = await readBody(res.body);
    expect(body).toContain('<meta name="csp-nonce"');
  });

  it("high tier emits a nonce-based script-src (framework bootstrap must run)", async () => {
    setCurrentNonce("");
    const req = new Request("http://localhost:3000/theme-preview/songoskriti");
    const res = withSecurityHeaders(req, docResponse(HTML), "high");
    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc =
      csp.split(";").find((p) => p.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    const body = await readBody(res.body);
    expect(body).toContain('<meta name="csp-nonce"');
  });

  it("header nonce matches the injected meta nonce (no stale mismatch)", async () => {
    setCurrentNonce("");
    const req = new Request("http://localhost:3000/");
    const res = withSecurityHeaders(req, docResponse(HTML), "medium");
    const csp = res.headers.get("content-security-policy") ?? "";
    const headerNonce = csp.match(/'nonce-([^']+)'/)?.[1];
    const body = await readBody(res.body);
    const metaNonce = body.match(
      /<meta name="csp-nonce" content="([^"]+)"/,
    )?.[1];
    expect(headerNonce).toBeTruthy();
    expect(metaNonce).toBeTruthy();
    expect(metaNonce).toBe(headerNonce);
    // store is populated so TanStack ssr.nonce + theme script agree
    expect(getCurrentNonce()).toBe(headerNonce);
  });

  it("buildCsp includes the nonce whenever one is supplied, regardless of tier", () => {
    for (const tier of ["low", "lower_medium", "medium", "high"] as const) {
      const csp = buildCsp("n123", {}, tier);
      const scriptSrc =
        csp.split(";").find((p) => p.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).toContain("'nonce-n123'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    }
  });

  it("buildCsp without a nonce stays strict 'self' (no weakening)", () => {
    const csp = buildCsp("", {}, "medium");
    const scriptSrc =
      csp.split(";").find((p) => p.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).toContain("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
