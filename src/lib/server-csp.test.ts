import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../server";

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe("withSecurityHeaders — streaming CSP injection", () => {
  it("does not duplicate body content or aside elements when injecting nonce", async () => {
    const html =
      '<!DOCTYPE html><html><head><title>Auth</title></head><body><main><aside class="sidebar">Logo</aside><section>Form</section></main></body></html>';
    const request = new Request("http://localhost:3000/auth?mode=signup");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
    const baseResponse = new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const securedResponse = withSecurityHeaders(request, baseResponse, "low");
    const output = await readStream(securedResponse.body!);

    // Must contain nonce
    expect(output).toContain('<meta name="csp-nonce"');
    // Exactly one instance of body, aside, section, and main
    expect(output.match(/<body/g)?.length).toBe(1);
    expect(output.match(/<\/body>/g)?.length).toBe(1);
    expect(output.match(/<aside class="sidebar">Logo<\/aside>/g)?.length).toBe(
      1,
    );
    expect(output.match(/<section>Form<\/section>/g)?.length).toBe(1);
    expect(output.match(/<\/html>/g)?.length).toBe(1);
  });

  it("handles multi-chunk streams across </head> boundaries without duplication", async () => {
    const request = new Request("http://localhost:3000/auth?mode=signup");
    const chunks = [
      "<!DOCTYPE html><html><head><title>Split",
      " Title</title></head>",
      "<body><aside>Nav</aside>",
      "<div>Content</div>",
      "</body></html>",
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const baseResponse = new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const securedResponse = withSecurityHeaders(request, baseResponse, "low");
    const output = await readStream(securedResponse.body!);

    expect(output).toContain('<meta name="csp-nonce"');
    expect(output.match(/<body/g)?.length).toBe(1);
    expect(output.match(/<aside>Nav<\/aside>/g)?.length).toBe(1);
    expect(output.match(/<div>Content<\/div>/g)?.length).toBe(1);
    expect(output.match(/<\/html>/g)?.length).toBe(1);
  });

  it("handles stream where </head> is absent without repeating buffered data", async () => {
    const html =
      "<!DOCTYPE html><html><body>Fragment without head</body></html>";
    const request = new Request("http://localhost:3000/partial");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
    const baseResponse = new Response(stream, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const securedResponse = withSecurityHeaders(request, baseResponse, "low");
    const output = await readStream(securedResponse.body!);

    expect(output).toContain('<meta name="csp-nonce"');
    expect(output.match(/Fragment without head/g)?.length).toBe(1);
    expect(output.match(/<\/html>/g)?.length).toBe(1);
  });
});
