/**
 * DynamicTagPicker contract tests (written first, TDD).
 *
 * Rendering precedent: the vitest environment is `node` and
 * `@testing-library/react` is not installed, so — like
 * `SchemaControls.test.tsx` — interaction is covered by SSR markup
 * (`renderToStaticMarkup`) plus pure state-transition helpers exported from
 * the component module, not by DOM events. The module does not exist yet, so
 * this suite starts red.
 *
 * What this locks in:
 * - the popover lists every `DYNAMIC_TAGS` entry (label + example output),
 * - search filters the catalog,
 * - insertion splices `dynamicTag(key)` at the cursor (append fallback),
 * - malformed syntax can never be emitted (grammar check + unknown keys),
 * - Escape closes / arrows move / Enter picks (pure key-step reducer the
 *   component delegates to),
 * - the swap-in contract for SectionInspector: `value` / `onChange` /
 *   `disabled`,
 * - XSS safety: insertion is plain-text splicing, never HTML parsing.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  DYNAMIC_TAGS,
  SAMPLE_DYNAMIC_CONTEXT,
  dynamicTag,
  hasDynamicTag,
  resolveDynamicText,
} from "@/lib/dynamic-tags";
import {
  DynamicTagPicker,
  exampleOutputFor,
  filterDynamicTags,
  insertDynamicTag,
  isKnownTagKey,
  isWellFormedTag,
  tagPickerStep,
} from "./DynamicTagPicker";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const noop = () => {};

/** Tag grammar, full-anchored: `{{ group.field }}` or `{{ group.field|… }}`. */
const TAG_TOKEN_RE = /\{\{\s*[A-Za-z]+\.[A-Za-z]+\s*(?:\|[^}]*)?\}\}/g;

describe("catalog renders", () => {
  it("lists every catalog entry by label with a trigger button", () => {
    const out = html(<DynamicTagPicker value="" onChange={noop} defaultOpen />);
    expect(out).toContain("<button");
    expect(out).toContain('role="listbox"');
    for (const tag of DYNAMIC_TAGS) {
      expect(out, tag.value).toContain(tag.label);
    }
  });

  it("shows an example output for entries that have sample data", () => {
    const out = html(<DynamicTagPicker value="" onChange={noop} defaultOpen />);
    // Resolved against SAMPLE_DYNAMIC_CONTEXT, never raw braces.
    expect(out).toContain("Sample product");
    expect(out).toContain("Sample collection");
    expect(exampleOutputFor("product.title")).toBe("Sample product");
    expect(exampleOutputFor("product.price")).toBe(
      SAMPLE_DYNAMIC_CONTEXT.product?.price ?? "",
    );
  });

  it("shows the literal tag for entries with no sample value", () => {
    // product.image has no sample — the row still shows what gets inserted.
    expect(exampleOutputFor("product.image")).toBe("");
    const out = html(<DynamicTagPicker value="" onChange={noop} defaultOpen />);
    expect(out).toContain("{{product.image}}");
  });

  it("stays closed by default and exposes a search field when open", () => {
    const closed = html(<DynamicTagPicker value="hi" onChange={noop} />);
    expect(closed).toContain("<button");
    expect(closed).not.toContain('role="listbox"');
    const open = html(
      <DynamicTagPicker value="hi" onChange={noop} defaultOpen />,
    );
    expect(open).toContain('role="listbox"');
    expect(open).toContain("Search");
  });

  it("is keyboard-focusable: a real button, not a div with onClick", () => {
    const out = html(<DynamicTagPicker value="" onChange={noop} />);
    expect(out).toMatch(/<button[^>]*type="button"/);
  });
});

describe("search filters", () => {
  it("returns the whole catalog on an empty query", () => {
    expect(filterDynamicTags("")).toHaveLength(DYNAMIC_TAGS.length);
    expect(filterDynamicTags("   ")).toHaveLength(DYNAMIC_TAGS.length);
  });

  it("matches labels case-insensitively", () => {
    const found = filterDynamicTags("sku");
    expect(found.map((t) => t.value)).toContain("product.sku");
    expect(filterDynamicTags("SKU")).toEqual(found);
  });

  it("matches keys and groups, not just labels", () => {
    expect(filterDynamicTags("product.price").map((t) => t.value)).toContain(
      "product.price",
    );
    const cart = filterDynamicTags("cart").map((t) => t.value);
    expect(cart).toContain("cart.count");
    expect(cart).toContain("cart.total");
    const blog = filterDynamicTags("blog").map((t) => t.value);
    expect(blog).toContain("article.title");
  });

  it("returns nothing when nothing matches", () => {
    expect(filterDynamicTags("zzz-no-such-tag")).toEqual([]);
  });

  it("never drops well-formed entries while filtering", () => {
    for (const tag of filterDynamicTags("product")) {
      expect(isKnownTagKey(tag.value)).toBe(true);
      expect(isWellFormedTag(dynamicTag(tag.value))).toBe(true);
    }
  });
});

describe("insert-at-cursor positions", () => {
  it("appends to an empty value", () => {
    const next = insertDynamicTag("", "product.title", 0, 0);
    expect(next).toEqual({
      text: "{{product.title}}",
      cursor: "{{product.title}}".length,
    });
  });

  it("splices mid-string without touching the surroundings", () => {
    const next = insertDynamicTag("Buy now!", "product.title", 4, 4);
    expect(next?.text).toBe("Buy {{product.title}}now!");
    expect(next?.cursor).toBe(4 + "{{product.title}}".length);
  });

  it("inserts at the start and at the end", () => {
    expect(insertDynamicTag("sale", "cart.total", 0, 0)?.text).toBe(
      "{{cart.total}}sale",
    );
    expect(insertDynamicTag("sale", "cart.total", 4, 4)?.text).toBe(
      "sale{{cart.total}}",
    );
  });

  it("replaces a selection instead of just inserting", () => {
    const next = insertDynamicTag("Hello NAME bye", "customer.name", 6, 10);
    expect(next?.text).toBe("Hello {{customer.name}} bye");
    expect(next?.cursor).toBe(6 + "{{customer.name}}".length);
  });

  it("appends when the cursor is unavailable (unfocused control)", () => {
    for (const pos of [null, undefined] as const) {
      const next = insertDynamicTag("Hi ", "site.title", pos, pos);
      expect(next?.text).toBe("Hi {{site.title}}");
      expect(next?.cursor).toBe("Hi {{site.title}}".length);
    }
  });

  it("clamps out-of-range offsets instead of throwing", () => {
    expect(insertDynamicTag("ab", "site.title", 99, 99)?.text).toBe(
      "ab{{site.title}}",
    );
    expect(insertDynamicTag("ab", "site.title", -5, -5)?.text).toBe(
      "{{site.title}}ab",
    );
  });

  it("normalizes a reversed selection", () => {
    const next = insertDynamicTag("Hello NAME bye", "customer.name", 10, 6);
    expect(next?.text).toBe("Hello {{customer.name}} bye");
  });

  it("feeds straight into the onChange swap-in contract", () => {
    const seen: string[] = [];
    const next = insertDynamicTag("Buy ", "product.title", 4, 4);
    expect(next).not.toBeNull();
    if (next) {
      const onChange = (v: string) => seen.push(v);
      onChange(next.text);
    }
    expect(seen).toEqual(["Buy {{product.title}}"]);
  });
});

describe("malformed syntax is never emitted", () => {
  it("every catalog key is a one-level group.field shape", () => {
    expect(DYNAMIC_TAGS.length).toBeGreaterThan(0);
    for (const tag of DYNAMIC_TAGS) {
      expect(tag.value).toMatch(/^[A-Za-z]+\.[A-Za-z]+$/);
    }
  });

  it("every inserted tag matches the tag grammar", () => {
    for (const tag of DYNAMIC_TAGS) {
      expect(isWellFormedTag(dynamicTag(tag.value))).toBe(true);
    }
  });

  it("inserted text leaves no stray braces behind", () => {
    for (const tag of DYNAMIC_TAGS) {
      const next = insertDynamicTag(`a ${tag.label} b`, tag.value, 2, 2);
      expect(next).not.toBeNull();
      const stripped = (next?.text ?? "").replace(TAG_TOKEN_RE, "");
      expect(stripped).not.toContain("{{");
      expect(stripped).not.toContain("}}");
      // The composed value is recognised by the shared detector…
      expect(hasDynamicTag(next?.text ?? "")).toBe(true);
      // …and resolves brace-free with an empty context (fallback, never raw).
      expect(resolveDynamicText(next?.text ?? "", {})).not.toContain("{{");
    }
  });

  it("rejects unknown, empty, and injected keys with null (no write)", () => {
    for (const key of [
      "",
      "product",
      "product.title.x",
      "{{product.title}}",
      "product.title|evil",
      "product.title}}<img>",
      "<b>product.title</b>",
      "product.title ",
      " product.title",
    ]) {
      expect(isKnownTagKey(key)).toBe(false);
      expect(insertDynamicTag("keep", key, 0, 0)).toBeNull();
    }
    expect(insertDynamicTag("keep", "product.title", 0, 0)).not.toBeNull();
  });

  it("the well-formedness check rejects near-misses", () => {
    for (const bad of [
      "",
      "{{product}}",
      "{{product.title",
      "product.title}}",
      "{{product.title|a}b}}",
      "{{ product }}",
      "{{a.b}} trailing",
      "{{a.b}}{{c.d}}",
    ]) {
      expect(isWellFormedTag(bad)).toBe(false);
    }
    expect(isWellFormedTag("{{product.title}}")).toBe(true);
    expect(isWellFormedTag("{{ product.title | No SKU }}")).toBe(true);
    expect(isWellFormedTag("{{product.title|No SKU}}")).toBe(true);
  });
});

describe("keyboard behavior", () => {
  it("Escape always asks to close, even with an empty list", () => {
    expect(tagPickerStep({ key: "Escape", active: 0, count: 5 })).toEqual({
      action: "close",
      active: 0,
    });
    expect(tagPickerStep({ key: "Escape", active: 3, count: 0 })).toEqual({
      action: "close",
      active: 3,
    });
  });

  it("ArrowDown/ArrowUp move the highlight and clamp at the ends", () => {
    expect(tagPickerStep({ key: "ArrowDown", active: 0, count: 3 })).toEqual({
      action: "none",
      active: 1,
    });
    expect(tagPickerStep({ key: "ArrowDown", active: 2, count: 3 })).toEqual({
      action: "none",
      active: 2,
    });
    expect(tagPickerStep({ key: "ArrowUp", active: 2, count: 3 })).toEqual({
      action: "none",
      active: 1,
    });
    expect(tagPickerStep({ key: "ArrowUp", active: 0, count: 3 })).toEqual({
      action: "none",
      active: 0,
    });
  });

  it("Enter picks the clamped highlight, and never on an empty list", () => {
    expect(tagPickerStep({ key: "Enter", active: 1, count: 3 })).toEqual({
      action: "pick",
      active: 1,
    });
    expect(tagPickerStep({ key: "Enter", active: 9, count: 3 })).toEqual({
      action: "pick",
      active: 2,
    });
    expect(tagPickerStep({ key: "Enter", active: 0, count: 0 })).toEqual({
      action: "none",
      active: 0,
    });
  });

  it("typing keys leave the highlight alone", () => {
    expect(tagPickerStep({ key: "a", active: 1, count: 3 })).toEqual({
      action: "none",
      active: 1,
    });
  });
});

describe("swap-in contract (value / onChange / disabled)", () => {
  it("renders with only value + onChange", () => {
    const out = html(<DynamicTagPicker value="Hi" onChange={noop} />);
    expect(out).toContain("<button");
    expect(out).not.toContain("disabled=");
  });

  it("disabled disables the trigger and forces the popover shut", () => {
    const out = html(
      <DynamicTagPicker value="Hi" onChange={noop} disabled defaultOpen />,
    );
    expect(out).toMatch(/<button[^>]*disabled/);
    expect(out).not.toContain('role="listbox"');
  });

  it("works without an inputRef (append fallback)", () => {
    const out = html(<DynamicTagPicker value="Hi" onChange={noop} />);
    expect(out).toContain("<button");
    const next = insertDynamicTag("Hi", "site.title", null, null);
    expect(next?.text).toBe("Hi{{site.title}}");
  });
});

describe("XSS-safe by construction", () => {
  const PAYLOAD = '<script>alert(1)</script><img src="x" onerror="y">';

  it("splices attacker text through verbatim — never parsed, never stripped", () => {
    const next = insertDynamicTag(PAYLOAD, "product.title", 0, 0);
    expect(next?.text).toBe(`{{product.title}}${PAYLOAD}`);
    expect(next?.text).toContain(PAYLOAD);
  });

  it("renders attacker text escaped in markup, never as elements", () => {
    const out = html(<DynamicTagPicker value={PAYLOAD} onChange={noop} />);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain('onerror="y"');
    const open = html(
      <DynamicTagPicker value={PAYLOAD} onChange={noop} defaultOpen />,
    );
    expect(open).not.toContain("<script>");
  });

  it("tag keys carrying HTML are unknown and insert nothing", () => {
    for (const key of [
      'product.title"><img src=x onerror=y>',
      "product.title<img>",
      "<script>",
    ]) {
      expect(insertDynamicTag("v", key, 0, 0)).toBeNull();
    }
  });

  it("no catalog tag introduces angle brackets", () => {
    for (const tag of DYNAMIC_TAGS) {
      const literal = dynamicTag(tag.value);
      expect(literal).not.toContain("<");
      expect(literal).not.toContain(">");
    }
  });
});
