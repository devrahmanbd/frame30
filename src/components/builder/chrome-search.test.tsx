/**
 * Search lane — command-palette contracts for `search_command`.
 *
 * Owns ONLY the search widget: trigger affordance, combobox/listbox roles,
 * keyboard handling, 44px targets, responsive widths, bilingual bn/en copy,
 * reduced-motion guards and token-only styling.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { WIDGET_BY_KEY } from "@/lib/studio/catalog";
import {
  SearchVoiceButton,
  getSpeechRecognitionCtor,
  isVoiceInputAvailable,
  rankSearchSuggestions,
  startVoiceRecognition,
  transcriptOf,
  voiceSearchHref,
} from "./chrome";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

const SRC = readFileSync("src/components/builder/chrome.tsx", "utf8");

function ctxFor(section: Section, locale: "en" | "bn" = "en"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "demo",
    data: undefined,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function render(section: Section, locale: "en" | "bn" = "en") {
  const Cmp = WIDGET_COMPONENTS.search_command as WidgetComponent;
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

describe("search_command catalog", () => {
  it("keeps placeholder/buttonLabel/limit defaults", () => {
    expect(WIDGET_BY_KEY.search_command.defaults).toMatchObject({
      placeholder: "Search products",
      buttonLabel: "Search",
      limit: 6,
    });
  });

  it("adds no new configurable props beyond the closed set", () => {
    expect(Object.keys(WIDGET_BY_KEY.search_command.defaults).sort()).toEqual([
      "buttonLabel",
      "limit",
      "placeholder",
      "voiceEnabled",
    ]);
  });
});

describe("search_command trigger (SSR)", () => {
  it("renders a 44px full-width trigger with dialog affordance", () => {
    const html = render(newSection("search_command"));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-72");
    expect(html).toContain("Search products");
  });

  it("keeps bilingual placeholder copy", () => {
    const en = render(newSection("search_command"), "en");
    const bn = render(
      {
        ...newSection("search_command"),
        props: {
          placeholder: "Search products",
          placeholder_bn: "পণ্য খুঁজুন",
        },
      },
      "bn",
    );
    expect(en).toContain("Search products");
    expect(bn).toContain("পণ্য খুঁজুন");
  });

  it("shows visible focus states on the trigger", () => {
    const html = render(newSection("search_command"));
    expect(html).toContain("focus-visible:ring-2");
  });
});

describe("search_command source contracts", () => {
  it("uses combobox/listbox/option roles with active-descendant wiring", () => {
    expect(SRC).toContain('role="combobox"');
    expect(SRC).toContain('role="listbox"');
    expect(SRC).toContain('role="option"');
    expect(SRC).toContain("aria-activedescendant");
    expect(SRC).toContain("aria-controls");
    expect(SRC).toContain("aria-expanded");
    expect(SRC).toContain('aria-autocomplete="list"');
    expect(SRC).toContain('role="search"');
  });

  it("handles Escape plus arrow-key navigation", () => {
    expect(SRC).toContain("ArrowDown");
    expect(SRC).toContain("ArrowUp");
    expect(SRC).toContain("Escape");
    expect(SRC).toContain("stopPropagation");
  });

  it("keeps 44px targets on trigger, input, clear and options", () => {
    const hits = (SRC.match(/min-h-11|size-11/g) ?? []).length;
    expect(hits).toBeGreaterThanOrEqual(4);
  });

  it("respects reduced motion and keeps transitions token-gated", () => {
    expect(SRC).toContain("motion-safe:transition-colors");
    expect(SRC).toContain("motion-reduce:animate-none");
  });

  it("carries bilingual bn/en copy inline (no new catalog props)", () => {
    for (const copy of [
      "পণ্য খুঁজুন",
      "খুঁজুন",
      "খোঁজা হচ্ছে",
      "সার্চ মুছুন",
      "সাজেশন",
      "সব ফল দেখুন",
    ]) {
      expect(SRC, copy).toContain(copy);
    }
  });

  it("stays responsive: full-width mobile, constrained desktop", () => {
    expect(SRC).toContain("w-full");
    expect(SRC).toContain("sm:w-72");
    expect(SRC).toContain("max-h-[min(50vh,20rem)]");
  });

  it("hardcodes no raw colour values and imports no theme module", () => {
    expect(SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    const imports = [...SRC.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(
      imports.filter((s) =>
        /theme|preset|bazaar|atelier|circuit|rupaboti/i.test(s),
      ),
    ).toEqual([]);
  });
});

describe("search_command voice input (LANE I)", () => {
  type MockRecognizer = {
    lang: string;
    interimResults: boolean;
    onresult: ((event: unknown) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  function installSpeechMock() {
    const instances: MockRecognizer[] = [];
    class MockRecognition {
      lang = "";
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        instances.push(this as unknown as MockRecognizer);
      }
    }
    (globalThis as unknown as { window?: unknown }).window = {
      SpeechRecognition: MockRecognition,
    };
    return instances;
  }

  function clearWindowMock() {
    delete (globalThis as unknown as { window?: unknown }).window;
  }

  function renderVoice(enabled: boolean, locale: "en" | "bn") {
    return renderToStaticMarkup(
      createElement(SearchVoiceButton, {
        enabled,
        locale,
        onTranscript: () => {},
      }),
    );
  }

  it("renders no mic when voice is disabled, even with the API present", () => {
    installSpeechMock();
    try {
      expect(isVoiceInputAvailable(false)).toBe(false);
      expect(renderVoice(false, "en")).toBe("");
    } finally {
      clearWindowMock();
    }
  });

  it("renders no mic when the API is absent, even when enabled (no layout shift)", () => {
    clearWindowMock();
    expect(getSpeechRecognitionCtor()).toBeNull();
    expect(isVoiceInputAvailable(true)).toBe(false);
    expect(renderVoice(true, "en")).toBe("");
    expect(renderVoice(true, "bn")).toBe("");
  });

  it("renders a 44px mic button with bn/en labels when enabled and supported", () => {
    installSpeechMock();
    try {
      expect(isVoiceInputAvailable(true)).toBe(true);
      const en = renderVoice(true, "en");
      expect(en).toContain('aria-label="Voice search"');
      expect(en).toContain("size-11");
      const bn = renderVoice(true, "bn");
      expect(bn).toContain("ভয়েসে খুঁজুন");
    } finally {
      clearWindowMock();
    }
  });

  it("accepts the webkit-prefixed constructor", () => {
    class MockWebkit {
      lang = "";
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {}
    }
    (globalThis as unknown as { window?: unknown }).window = {
      webkitSpeechRecognition: MockWebkit,
    };
    try {
      expect(getSpeechRecognitionCtor()).not.toBeNull();
      expect(isVoiceInputAvailable(true)).toBe(true);
    } finally {
      clearWindowMock();
    }
  });

  it("routes the transcript to onTranscript and reuses the view-all submit href", () => {
    const instances = installSpeechMock();
    try {
      const heard: string[] = [];
      const settled: string[] = [];
      const stop = startVoiceRecognition({
        lang: "en-US",
        onTranscript: (text) => heard.push(text),
        onSettle: () => settled.push("settled"),
      });
      expect(stop).not.toBeNull();
      const rec = instances[0];
      expect(rec).toBeDefined();
      expect(rec!.start).toHaveBeenCalled();
      expect(rec!.lang).toBe("en-US");
      // Browser result event → transcript fills the input path.
      rec!.onresult?.({ results: [[{ transcript: " red saree " }]] });
      expect(heard).toEqual(["red saree"]);
      // Same destination the existing submit path uses; no new endpoint.
      expect(voiceSearchHref("/store/demo", "red saree")).toBe(
        "/store/demo/search?q=red%20saree",
      );
      expect(voiceSearchHref("/store/demo", "x")).toBeNull();
      stop?.();
      expect(rec!.stop).toHaveBeenCalled();
      // Settle hook fires on natural end.
      rec!.onend?.();
      expect(settled).toEqual(["settled"]);
    } finally {
      clearWindowMock();
    }
  });

  it("returns null instead of throwing when the API is absent", () => {
    clearWindowMock();
    expect(
      startVoiceRecognition({ lang: "en-US", onTranscript: () => {} }),
    ).toBeNull();
    expect(transcriptOf({ results: [] })).toBe("");
  });

  it("wires the transcript through the existing submit path (source contract)", () => {
    expect(SRC).toContain("onTranscript={handleVoiceTranscript}");
    expect(SRC).toContain("setTerm(cleaned)");
    expect(SRC).toContain("voiceSearchHref");
    expect(SRC).toContain("SpeechRecognition");
    expect(SRC).toContain("webkitSpeechRecognition");
  });
});

describe("search_command suggestion ranking (LANE I)", () => {
  const row = (id: string, title: string) => ({
    id,
    title,
    slug: id,
    imageUrl: null as string | null,
  });

  it("orders prefix matches before substring matches, others last, stably", () => {
    const hits = [
      row("other", "Blue panjabi"),
      row("sub", "Pure red jamdani"),
      row("prefix", "Jamdani saree"),
    ];
    expect(rankSearchSuggestions(hits, "jam").map((hit) => hit.id)).toEqual([
      "prefix",
      "sub",
      "other",
    ]);
  });

  it("keeps stable server order inside buckets when rows carry no popularity signal", () => {
    const hits = [row("a", "Jam silk"), row("b", "Jam cotton")];
    expect(rankSearchSuggestions(hits, "jam").map((hit) => hit.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("uses a numeric popularity signal as a within-bucket tie-break only", () => {
    const hits = [
      { ...row("low", "Jam silk"), popularity: 2 },
      { ...row("high", "Jam cotton"), popularity: 9 },
      // Highest signal overall, but only a substring match: stays behind
      // every prefix match.
      { ...row("sub", "Red jamdani weave"), popularity: 99 },
    ];
    expect(rankSearchSuggestions(hits, "jam").map((hit) => hit.id)).toEqual([
      "high",
      "low",
      "sub",
    ]);
  });

  it("leaves order untouched for a blank query", () => {
    const hits = [row("b", "Blue panjabi"), row("a", "Jam silk")];
    expect(rankSearchSuggestions(hits, "  ").map((hit) => hit.id)).toEqual([
      "b",
      "a",
    ]);
  });
});
