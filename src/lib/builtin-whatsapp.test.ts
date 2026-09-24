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
  const headChildren: FakeEl[] = [];
  const head = {
    appendChild(c: FakeEl) {
      headChildren.push(c);
      return c;
    },
  };
  return {
    created,
    headChildren,
    head,
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

async function runEntryWithDoc(
  doc: ReturnType<typeof fakeDocument>,
  entry: string,
  settings: Record<string, unknown> | Error,
): Promise<{
  mounted: FakeEl | null;
  calls: { method: string; params: unknown }[];
}> {
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

async function runEntry(
  entry: string,
  settings: Record<string, unknown> | Error,
): Promise<{
  mounted: FakeEl | null;
  calls: { method: string; params: unknown }[];
}> {
  return runEntryWithDoc(fakeDocument(), entry, settings);
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
    // The entry renders in-flow and fills the parent-hosted fixed frame —
    // `position:fixed` inside the entry resolves against the tiny iframe
    // viewport and clips, so it must never appear here (frame does the
    // floating; see PluginFooterMounts). 56px bubble + 8px margin = 72px frame.
    expect(mounted!.style["position"]).toBeUndefined();
    expect(mounted!.style["width"]).toBe("56px");
    expect(mounted!.style["height"]).toBe("56px");
    expect(mounted!.style["margin"]).toBe("8px");
  });

  it("defaults to the pulse ring and injects keyframes once", async () => {
    const doc = fakeDocument();
    const { mounted } = await runEntryWithDoc(doc, whatsappEntry(), {
      phone_number: "8801712345678",
    });
    expect(mounted!.style["animation"]).toContain("waPop");
    expect(mounted!.style["animation"]).toContain("waPulse");
    const styles = doc.headChildren.filter((e) => e.tag === "style");
    expect(styles).toHaveLength(1);
    expect(
      String(
        (styles[0] as FakeEl & { textContent?: unknown }).textContent ?? "",
      ),
    ).toContain("@keyframes waPulse");
  });

  it("honours bounce / jump / off from plugin control", async () => {
    for (const [mode, needle] of [
      ["bounce", "waBounce"],
      ["jump", "waJump"],
    ] as const) {
      const { mounted } = await runEntry(whatsappEntry(), {
        phone_number: "8801712345678",
        animation: mode,
      });
      expect(mounted!.style["animation"]).toContain(needle);
    }
    const { mounted: still } = await runEntry(whatsappEntry(), {
      phone_number: "8801712345678",
      animation: "off",
    });
    expect(still!.style["animation"]).not.toContain("infinite");
  });

  it("is flagged floating so the frame (not the entry) does the positioning", () => {
    const def = getBuiltinPlugin("whatsapp-chat");
    const widget = def!.manifest.widgets.find((w) => w.key === "chat_bubble");
    expect(widget?.floating).toBe(true);
    // The flag must survive manifest parse (DB-loaded manifests go through
    // parseManifest — a dropped flag silently falls back to a flow frame).
    const verdict = parseManifest(JSON.parse(JSON.stringify(def!.manifest)));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(
        verdict.manifest.widgets.find((w) => w.key === "chat_bubble")?.floating,
      ).toBe(true);
    }
  });

  it("ignores button_position (the frame hosts left/right)", async () => {
    const { mounted } = await runEntry(whatsappEntry(), {
      phone_number: "8801712345678",
      greeting_message: "Hi",
      button_position: "bottom-left",
    });
    expect(mounted!.style["left"]).toBeUndefined();
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
