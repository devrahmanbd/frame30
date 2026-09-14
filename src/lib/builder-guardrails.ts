/**
 * Phase 9 — publish-blocking guardrails.
 *
 * The rules here are the ones a merchant can violate by authoring content, not
 * by writing code: text dropped on an image with no scrim, a before/after pair
 * with no disclaimer, a consent control that ships pre-agreed, money arithmetic
 * smuggled into a prop, and বাংলা coverage so thin that publishing would ship a
 * half-translated storefront.
 *
 * Pure module — types only from builder-ast, so both the editor lint and the
 * publish gate call exactly the same code.
 */
import type { Section } from "./builder-ast";

export type GuardrailIssue = {
  level: "warn" | "error";
  sectionId: string | null;
  message: string;
};

/** Props that place a background/hero image behind authored copy. */
const IMAGE_KEYS = ["imageUrl", "bgImage", "backgroundImage", "posterUrl"];
/** Props whose text would sit on top of that image. */
const TEXT_KEYS = ["heading", "subheading", "body", "eyebrow", "ctaLabel"];

function filled(props: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => String(props[key] ?? "").trim().length > 0);
}

/** No text over an image without a scrim token — contrast is not a guess. */
export function scrimIssues(sections: Section[]): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  for (const section of sections) {
    if (section.invalid) continue;
    const layers = [section.props, ...Object.values(section.bp ?? {})] as Record<string, unknown>[];
    const overlays = layers.some((layer) => filled(layer ?? {}, IMAGE_KEYS)) && filled(section.props, TEXT_KEYS);
    if (!overlays) continue;
    const scrim = section.props["scrim"];
    if (scrim === true || (typeof scrim === "string" && scrim.trim() !== "" && scrim !== "none")) continue;
    issues.push({
      level: "error",
      sectionId: section.id,
      message: "Text sits over an image with no scrim — enable the scrim token so contrast holds.",
    });
  }
  return issues;
}

/** A paired-image claim without a disclaimer is an unqualified promise. */
export function disclaimerIssues(sections: Section[]): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  for (const section of sections) {
    if (section.type !== "before_after") continue;
    if (String(section.props["disclaimer"] ?? "").trim()) continue;
    issues.push({
      level: "error",
      sectionId: section.id,
      message: "Before/after needs a results disclaimer before it can publish.",
    });
  }
  return issues;
}

/** Consent must be an act, never a default. */
export function consentIssues(sections: Section[]): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  for (const section of sections) {
    if (section.invalid) continue;
    for (const [key, value] of Object.entries(section.props)) {
      const consenty = /consent|optin|opt_in|subscribe|marketing/i.test(key);
      const presetty = /checked|default|preselect|prechecked|agree/i.test(key);
      if (!consenty || !presetty) continue;
      if (value === true || value === "true" || value === 1) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `Consent control is pre-checked (${key}) — the shopper must opt in themselves.`,
        });
      }
    }
  }
  return issues;
}

/**
 * Money is a server-valued integer. A prop that carries arithmetic (a template
 * expression or a hand-written formula) means a widget would mint its own
 * total in the browser.
 */
const MONEY_WORD = /price|total|amount|subtotal|discount|savings|fee|tax|shipping|deposit/i;
const EXPRESSION = /\{\{[^}]*[+\-*/%][^}]*\}\}|\$\{[^}]*[+\-*/%][^}]*\}|=\s*[\w.]+\s*[+\-*/%]\s*[\w.]+/;

export function moneyMathIssues(sections: Section[]): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  for (const section of sections) {
    if (section.invalid) continue;
    const layers = [section.props, ...Object.values(section.bp ?? {})] as Record<string, unknown>[];
    for (const layer of layers) {
      for (const [key, value] of Object.entries(layer ?? {})) {
        if (typeof value !== "string") continue;
        const looksMoney = MONEY_WORD.test(key) || MONEY_WORD.test(value);
        if (!looksMoney || !EXPRESSION.test(value)) continue;
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `${key}: money is computed client-side — every total must come from the server as an integer ৳.`,
        });
        break;
      }
    }
  }
  return issues;
}

/** Every content guardrail in one pass, for the editor lint. */
export function guardrailIssues(sections: Section[]): GuardrailIssue[] {
  return [
    ...scrimIssues(sections),
    ...disclaimerIssues(sections),
    ...consentIssues(sections),
    ...moneyMathIssues(sections),
  ];
}

/**
 * Translation gate: missing বাংলা only warns in the editor, but a theme where
 * more than this share of bilingual strings is untranslated cannot publish.
 */
export const TRANSLATION_PUBLISH_FLOOR = 90;

/**
 * Share of *authored* strings that carry বাংলা. Fields nobody filled in on
 * either side are not "untranslated" — counting them would make an empty
 * template look unpublishable.
 */
export function authoredCoverage(stats: { ok: number; fallback: number }): {
  authored: number;
  percent: number;
} {
  const authored = stats.ok + stats.fallback;
  return { authored, percent: authored === 0 ? 100 : Math.round((stats.ok / authored) * 100) };
}

export function translationGate(stats: { ok: number; fallback: number }): GuardrailIssue[] {
  const { authored, percent } = authoredCoverage(stats);
  if (authored === 0 || percent >= TRANSLATION_PUBLISH_FLOOR) return [];
  return [
    {
      level: "error",
      sectionId: null,
      message: `বাংলা translation coverage is ${percent}% — publishing needs at least ${TRANSLATION_PUBLISH_FLOOR}%.`,
    },
  ];
}
