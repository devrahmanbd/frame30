/**
 * Songoskriti unified port — lane (a) neutrality top-up (Task 5 supplement).
 *
 * Classification rows: CHR-FOOTER-COPY (footer copy constants) and
 * COPY-FOOTER (footer copy bilingual) — clean (a) rows: green on the
 * unmodified tree; a failure is a misclassification signal, never fix by
 * editing src/.
 *
 * `src/lib/footer-copy.ts` lives outside `themes/` on purpose: it is the
 * single source of truth for STATEMENT / NEWSLETTER / PAYMENT_MARKS /
 * COLOPHON, re-exported verbatim by `src/lib/themes/songoskriti/footer.ts`
 * so theme and fallback copy can never drift apart.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COLOPHON,
  NEWSLETTER,
  PAYMENT_MARKS,
  STATEMENT,
} from "@/lib/footer-copy";
import * as themeFooter from "@/lib/themes/songoskriti/footer";

const COPY_EXPORTS = {
  COLOPHON,
  NEWSLETTER,
  PAYMENT_MARKS,
  STATEMENT,
} as const;

describe("songoskriti footer-copy neutrality (CHR-FOOTER-COPY / COPY-FOOTER)", () => {
  it("source imports no theme module and no react (data-only contract)", () => {
    const src = readFileSync("src/lib/footer-copy.ts", "utf8");
    const specifiers = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    expect(
      specifiers.filter((s) => s.includes("themes/")),
      `footer-copy.ts imports ${specifiers.join(", ")}`,
    ).toEqual([]);
    expect(specifiers.filter((s) => s === "react")).toEqual([]);
    // The doc comment legitimately names Songoskriti — we deliberately do
    // NOT blanket-scan the raw source for that word (would false-fail).
  });

  it("theme re-exports the neutral bindings verbatim (reference identity)", () => {
    expect(themeFooter.COLOPHON).toBe(COLOPHON);
    expect(themeFooter.NEWSLETTER).toBe(NEWSLETTER);
    expect(themeFooter.PAYMENT_MARKS).toBe(PAYMENT_MARKS);
    expect(themeFooter.STATEMENT).toBe(STATEMENT);
  });

  it("bilingual completeness: every non-_bn string field has a non-empty _bn sibling", () => {
    const bilingual = [STATEMENT, NEWSLETTER, COLOPHON] as const;
    for (const obj of bilingual) {
      for (const [key, value] of Object.entries(obj)) {
        if (key.endsWith("_bn")) continue;
        if (typeof value !== "string") continue;
        const bn = (obj as Record<string, unknown>)[`${key}_bn`];
        expect(typeof bn).toBe("string");
        expect((bn as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("PAYMENT_MARKS is a non-empty plain string", () => {
    expect(typeof PAYMENT_MARKS).toBe("string");
    expect(PAYMENT_MARKS.length).toBeGreaterThan(0);
  });

  it("data-only shape: every export is a string or an all-string object", () => {
    for (const [name, value] of Object.entries(COPY_EXPORTS)) {
      if (typeof value === "string") continue;
      expect(value, `${name} must be string or plain object`).not.toBeNull();
      expect(typeof value).toBe("object");
      for (const [key, field] of Object.entries(
        value as Record<string, unknown>,
      )) {
        expect(
          typeof field,
          `${name}.${key} must be a string (no functions / React elements)`,
        ).toBe("string");
      }
    }
  });
});
