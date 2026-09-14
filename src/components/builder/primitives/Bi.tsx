/**
 * Phase 2 — bilingual text rendering.
 *
 * Two invariants live here so no widget has to remember them:
 *
 *  - **Fail-safe** (§2.6): when বাংলা copy is missing the English string is
 *    rendered with `lang="en"`, never an empty node, so the correct font and
 *    the correct screen-reader voice are used.
 *  - **Mixed script** (§2.4): SKUs, model numbers and units embedded in
 *    Bangla copy are wrapped in `<span dir="ltr" lang="en">`, so bidi
 *    reordering can never mangle `A50-256GB` sitting inside Bengali text.
 */
import type { ReactNode } from "react";
import {
  resolveBiTextTagged,
  segmentMixedScript,
  type BiText,
  type Locale,
} from "@/lib/bitext";

/** Wraps latin runs inside Bangla copy; pure-latin text is returned as-is. */
export function mixedScriptNodes(text: string, lang: Locale): ReactNode {
  if (lang !== "bn") return text;
  const runs = segmentMixedScript(text);
  if (!runs.some((r) => r.ltr)) return text;
  return runs.map((run, i) =>
    run.ltr ? (
      <span key={i} dir="ltr" lang="en">
        {run.text}
      </span>
    ) : (
      <span key={i}>{run.text}</span>
    ),
  );
}

type Props = {
  /** Either a resolved string plus its language, or the bilingual pair. */
  value: BiText | string;
  locale: Locale;
  className?: string;
  as?: "span" | "p" | "div";
};

export function Bi({ value, locale, className, as = "span" }: Props) {
  const pair: BiText = typeof value === "string" ? { en: value, bn: "" } : value;
  const tagged = resolveBiTextTagged(pair, locale);
  if (!tagged.text) return null;
  const Tag = as;
  return (
    <Tag className={className} lang={tagged.lang} {...(tagged.state === "fallback" ? { "data-bn-fallback": "" } : {})}>
      {mixedScriptNodes(tagged.text, tagged.lang)}
    </Tag>
  );
}
