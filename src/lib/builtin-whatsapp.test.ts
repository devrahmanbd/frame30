/**
 * WhatsApp chat bubble bundle — TDD: the builtin `chat_bubble` entry must
 * request its settings through the scoped bridge, mount a wa.me anchor, and
 * fail closed (mount nothing) when settings are denied. The manifest entry
 * must keep passing bundle validation (no dynamic-code patterns).
 */
import { describe, expect, it } from "vitest";
import { getBuiltinPlugin } from "./builtin-plugins";
import { parseManifest } from "./plugin-manifest";

type FakeEl = {
  tag: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: FakeEl[];
  innerHTMLText: string;
  setAttribute(k: string, v: string): void;
  appendChild(c: FakeEl): void;
};

function fakeDocument() {
  const created: FakeEl[] = [];
  return {
    created,
    createElement(tag: string): FakeEl {
      const el: FakeEl = {
        tag,
        attrs: {},
        style: {},
        children: [],
        innerHTMLText: "",
        setAttribute(k: string, v: string) {
          el.attrs[k] = v;
          if (k === "style") {
            for (const part of v.split(";")) {
              const [pk, pv] = part.split(":").map((s) => s.trim());
              if (pk && pv) el.style[pk] = pv;
            }
          }
        },
        appendChild(c: FakeEl) {
          el.children.push(c);
        },
      };
      Object.defineProperty(el, "innerHTML", {
        set(v: string) {
          el.innerHTMLText = v;
        },
        get() {
          return el.innerHTMLText;
        },
      });
      created.push(el);
      return el;
    },
  };
}

async function runEntry(
  entry: string,
  settings: Record<string, unknown> | Error,
): Promise<{
  mounted: FakeEl | null;
  calls: { method: string; params: unknown }[];
}> {
  const doc = fakeDocument();
  let mounted: FakeEl | null = null;
  const calls: { method: string; params: unknown }[] = [];
  const sandbox = {
    document: doc,
    framique: {
      call(method: string, params: unknown) {
        calls.push({ method, params });
        return settings instanceof Error
          ? Promise.reject(settings)
          : Promise.resolve(settings);
      },
      mount(node: FakeEl) {
        mounted = node;
      },
    },
    encodeURIComponent,
  };
  const runner = new Function(
    "document",
    "framique",
    "encodeURIComponent",
    entry,
  );
  runner(sandbox.document, sandbox.framique, sandbox.encodeURIComponent);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { mounted, calls };
}

function whatsappEntry(): string {
  const def = getBuiltinPlugin("whatsapp-chat");
  expect(def).toBeDefined();
  const widget = def!.manifest.widgets.find((w) => w.key === "chat_bubble");
  expect(widget).toBeDefined();
  return widget!.entry;
}

describe("whatsapp chat_bubble entry", () => {
  it("passes manifest validation (no dynamic-code patterns)", () => {
    const def = getBuiltinPlugin("whatsapp-chat");
    expect(def).toBeDefined();
    const verdict = parseManifest({
      ...def!.manifest,
      widgets: def!.manifest.widgets.map((w) => ({ ...w })),
    });
    expect(verdict.ok).toBe(true);
  });

  it("requests plugin.settings then mounts a wa.me anchor", async () => {
    const { mounted, calls } = await runEntry(whatsappEntry(), {
      phone_number: "8801712345678",
      greeting_message: "Hello! I want this.",
      button_position: "bottom-right",
    });
    expect(calls).toEqual([{ method: "plugin.settings", params: {} }]);
    expect(mounted).not.toBeNull();
    expect(mounted!.tag).toBe("a");
    expect(mounted!.attrs["href"]).toBe(
      "https://wa.me/8801712345678?text=" +
        encodeURIComponent("Hello! I want this."),
    );
    expect(mounted!.attrs["target"]).toBe("_blank");
    expect(mounted!.style["position"]).toBe("fixed");
    expect(mounted!.style["right"]).toBe("20px");
  });

  it("honours bottom-left positioning", async () => {
    const { mounted } = await runEntry(whatsappEntry(), {
      phone_number: "8801712345678",
      greeting_message: "Hi",
      button_position: "bottom-left",
    });
    expect(mounted!.style["left"]).toBe("20px");
    expect(mounted!.style["right"]).toBeUndefined();
  });

  it("mounts nothing when settings are denied (fail closed)", async () => {
    const { mounted, calls } = await runEntry(
      whatsappEntry(),
      new Error("denied"),
    );
    expect(calls).toEqual([{ method: "plugin.settings", params: {} }]);
    expect(mounted).toBeNull();
  });

  it("mounts nothing without a phone number", async () => {
    const { mounted } = await runEntry(whatsappEntry(), {
      phone_number: "",
      greeting_message: "Hi",
      button_position: "bottom-right",
    });
    expect(mounted).toBeNull();
  });
});
