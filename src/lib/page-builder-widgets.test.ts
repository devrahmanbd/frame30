/**
 * Legacy builder HTML renderer — plugin widgets must serialize as mount
 * points (namespaced key + settings), never as dropped HTML comments, so a
 * future hydrator — and today's data audit — can see every placed block.
 */
import { describe, expect, it } from "vitest";
import { renderBuilderHtml } from "./page-builder";

function docWith(widget: Record<string, unknown>) {
  return {
    sections: [{ id: "s1", columns: [{ id: "c1", width: 1, widgets: [widget] }] }],
  };
}

describe("renderBuilderHtml plugin widgets", () => {
  it("serializes a plugin widget as a mount point with key and settings", () => {
    const html = renderBuilderHtml(
      docWith({
        kind: "plugin",
        pluginKey: "plugin:whatsapp-chat/chat_bubble",
        settings: { phone_number: "8801712345678", note: "I'm <b>here</b>" },
      }) as never,
    );
    expect(html).not.toContain("<!-- widget:plugin -->");
    expect(html).toContain('data-plugin-widget="plugin:whatsapp-chat/chat_bubble"');
    expect(html).toContain("8801712345678");
    expect(html).toContain("I&#39;m \\u003cb>here\\u003c/b>");
  });

  it("still drops unknown widget kinds as comments", () => {
    const html = renderBuilderHtml(docWith({ kind: "mystery" }) as never);
    expect(html).toContain("<!-- widget:mystery -->");
  });
});
