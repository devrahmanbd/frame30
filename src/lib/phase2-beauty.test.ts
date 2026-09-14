/**
 * Phase 2.8 — Rupaboti (beauty) guardrails.
 *
 * Three things must hold and cannot be caught by types: the quiz engine is a
 * pure, resumable state machine; the beauty module never does money math; and
 * the regulated copy (disclaimer, consent, patch test) is authored text with a
 * বাংলা sibling, not decoration.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BITEXT_FIELDS, SECTION_CATALOG as CATALOG, type SectionType } from "./builder-ast";
import { WIDGET_REGISTRY } from "./widget-registry";
import {
  answerStep,
  canAdvance,
  emptyQuizState,
  goBack,
  goNext,
  isFinished,
  quizProgress,
  resultHref,
  type QuizStep,
} from "./quiz-flow";
import { depthLabel, findTerm, parseTerms, termLabel, termsOf } from "./beauty-taxonomy";

const BEAUTY_TYPES = [
  "shade_finder",
  "skin_quiz",
  "routine_builder",
  "ingredient_list",
  "ingredient_glossary",
  "claim_chips",
  "before_after",
  "safety_note",
  "batch_info",
  "texture_strip",
  "how_to_use",
  "refill_widget",
  "gift_builder",
  "sample_picker",
  "consult_cta",
  "loyalty_strip",
] as const satisfies readonly SectionType[];

const SRC = readFileSync("src/components/builder/beauty.tsx", "utf8");

const steps: QuizStep[] = [
  { key: "a", prompt: "A?", options: [{ value: "a1", label: "A1" }, { value: "a2", label: "A2" }] },
  { key: "b", prompt: "B?", options: [{ value: "b1", label: "B1" }], multi: true },
];

describe("quiz flow", () => {
  it("blocks Next until the current step is answered", () => {
    expect(canAdvance(emptyQuizState, steps)).toBe(false);
    const answered = answerStep(emptyQuizState, steps[0]!, "a1");
    expect(canAdvance(answered, steps)).toBe(true);
  });

  it("keeps single-select to one value and lets multi-select accumulate", () => {
    const single = answerStep(answerStep(emptyQuizState, steps[0]!, "a1"), steps[0]!, "a2");
    expect(single.answers["a"]).toEqual(["a2"]);
    const multi = answerStep(answerStep(emptyQuizState, steps[1]!, "b1"), steps[1]!, "b1");
    expect(multi.answers["b"]).toEqual([]);
  });

  it("walks forward and back without losing answers", () => {
    let state = answerStep(emptyQuizState, steps[0]!, "a1");
    state = goNext(state, steps);
    expect(state.index).toBe(1);
    state = goBack(state);
    expect(state.index).toBe(0);
    expect(state.answers["a"]).toEqual(["a1"]);
    expect(goBack(state).index).toBe(0);
  });

  it("finishes only after the last step and reports progress", () => {
    let state = answerStep(emptyQuizState, steps[0]!, "a1");
    expect(quizProgress(state, steps)).toBe(50);
    state = goNext(state, steps);
    state = answerStep(state, steps[1]!, "b1");
    state = goNext(state, steps);
    expect(isFinished(state, steps)).toBe(true);
    expect(quizProgress(state, steps)).toBe(100);
  });

  it("ends in a shareable URL, not a dead end", () => {
    let state = answerStep(emptyQuizState, steps[0]!, "a1");
    state = answerStep(state, steps[1]!, "b1");
    const href = resultHref("/search", state, { a: "category" });
    expect(href.startsWith("/search")).toBe(true);
    expect(href).toContain("a1");
    // Unmapped steps stay out of the URL.
    expect(href).not.toContain("b1");
  });
});

describe("beauty taxonomy", () => {
  it("keeps slugs stable across locales", () => {
    for (const term of termsOf("skin_type")) {
      expect(termLabel(term.slug, "en")).toBe(term.en);
      expect(termLabel(term.slug, "bn")).toBe(term.bn);
      expect(findTerm(term.slug)?.slug).toBe(term.slug);
    }
  });

  it("parses authored slug lists and ignores unknown terms", () => {
    const parsed = parseTerms("dry, oily, not-a-term", "skin_type");
    expect(parsed.map((term) => term.slug)).toEqual(["dry", "oily"]);
  });

  it("labels every shade depth in both languages", () => {
    for (const locale of ["en", "bn"] as const) {
      expect(depthLabel("light", locale).length).toBeGreaterThan(0);
    }
  });
});

describe("beauty catalogue wiring", () => {
  it("registers every Phase 2.8 widget with a catalogue entry and registry meta", () => {
    for (const type of BEAUTY_TYPES) {
      expect(CATALOG.find((entry) => entry.type === type), `${type} catalogue`).toBeTruthy();
      expect(WIDGET_REGISTRY[type], `${type} registry`).toBeTruthy();
    }
  });

  it("renders every Phase 2.8 widget from the closed renderer map", () => {
    for (const type of BEAUTY_TYPES) {
      expect(SRC.includes(`${type}:`), `${type} renderer`).toBe(true);
    }
  });

  it("gives merchant-authored copy a বাংলা sibling", () => {
    for (const type of BEAUTY_TYPES) {
      expect((BITEXT_FIELDS[type] ?? []).length, `${type} bitext`).toBeGreaterThan(0);
    }
  });

  it("marks data-backed widgets with a source and a skeleton", () => {
    for (const type of ["shade_finder", "routine_builder", "gift_builder", "loyalty_strip"] as const) {
      const meta = WIDGET_REGISTRY[type];
      expect(meta.data?.source, `${type} source`).toBeTruthy();
      expect(meta.skeleton, `${type} skeleton`).toBe(true);
    }
  });
});

describe("beauty module rules", () => {
  it("never performs money arithmetic in a renderer", () => {
    const math = SRC.match(/(?:priceMinor|totalMinor|compareAtMinor|Minor)\s*[+\-*/]\s*\w/g) ?? [];
    expect(math, `money arithmetic: ${math.join(", ")}`).toEqual([]);
  });

  it("imports no theme module and writes no raw colour", () => {
    const imports = [...SRC.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
    expect(imports.filter((path) => /themes?\//.test(path))).toEqual([]);
    expect(SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(SRC).not.toMatch(/\b(?:text|bg|border)-(?:white|black)\b/);
  });

  it("requires a non-empty disclaimer before rendering before/after", () => {
    expect(SRC).toMatch(/disclaimer[\s\S]{0,120}return null/);
    const entry = CATALOG.find((item) => item.type === "before_after")!;
    expect(String(entry.defaults["disclaimer"] ?? "").length).toBeGreaterThan(0);
    expect(BITEXT_FIELDS["before_after"]).toContain("disclaimer");
  });

  it("never pre-checks a consent box", () => {
    expect(SRC).not.toMatch(/checked=\{true\}/);
    expect(SRC).toMatch(/useState\(false\)/);
  });

  it("keeps contact capture behind explicit consent", () => {
    expect(SRC).toMatch(/disabled=\{!agreed\}/);
    expect(BITEXT_FIELDS["consult_cta"]).toContain("consentText");
  });
});
