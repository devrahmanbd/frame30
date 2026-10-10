/**
 * Threat-defense — package content inventory for review.
 *
 * `inventoryExternalUrls` extracts every absolute http(s) URL from package
 * text files so consent screens and audit rows can show what a package
 * talks to. Relative refs, data:, mailto:, javascript: and undecodable
 * bytes are never reported.
 */
import { describe, expect, it } from "vitest";
import { inventoryExternalUrls } from "./package-review";

const file = (path: string, content: string) => ({
  path,
  bytes: new TextEncoder().encode(content),
});

describe("inventoryExternalUrls", () => {
  it("collects unique sorted http(s) URLs", () => {
    const urls = inventoryExternalUrls([
      file("templates/a.json", JSON.stringify({ img: "https://cdn.example.com/a.png" })),
      file("templates/b.json", JSON.stringify({ x: "http://b.example.com/" })),
      file("templates/c.json", JSON.stringify({ y: "https://cdn.example.com/a.png" })),
    ]);
    expect(urls).toEqual(["http://b.example.com/", "https://cdn.example.com/a.png"]);
  });

  it("ignores relative refs and dangerous schemes", () => {
    const urls = inventoryExternalUrls([
      file(
        "templates/a.json",
        JSON.stringify({
          rel: "/ph/x.png",
          asset: "assets/y.png",
          data: "data:image/png;base64,aaa",
          mail: "mailto:shop@example.com",
          js: "javascript:alert(1)",
        }),
      ),
    ]);
    expect(urls).toEqual([]);
  });

  it("finds URLs embedded in longer strings and CSS", () => {
    const urls = inventoryExternalUrls([
      file("styles/main.css", `.hero{background:url("https://img.example.com/h.jpg")}`),
      file("locales/en.json", JSON.stringify({ note: "see https://docs.example.com/a and https://docs.example.com/b" })),
    ]);
    expect(urls).toEqual([
      "https://docs.example.com/a",
      "https://docs.example.com/b",
      "https://img.example.com/h.jpg",
    ]);
  });

  it("skips binary/undecodable files without throwing", () => {
    const urls = inventoryExternalUrls([
      { path: "assets/logo.png", bytes: new Uint8Array([0x89, 0x50, 0xff, 0xfe, 0x00]) },
    ]);
    expect(urls).toEqual([]);
  });
});
