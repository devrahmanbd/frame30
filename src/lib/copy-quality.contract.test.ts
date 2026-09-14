/**
 * Phase 10.3 exit gate — copy quality, bilingual parity and NAP consistency.
 *
 * The rules in `docs/05-marketing/voice-and-messaging.md` are only real if a
 * build fails when they are broken. This suite is that build failure. It runs
 * `auditDictionary` over the whole shipped dictionary, exercises each rule in
 * isolation so a regression in the auditor itself is caught, and pins the
 * legal/NAP invariants that local SEO and consent records depend on.
 */
import { describe, expect, it } from "vitest";
import { DICT } from "./i18n-dict";
import {
  BANGLA_LINT,
  BANNED_HYPE,
  COPY_LIMITS,
  FORBIDDEN_CLAIMS,
  LOCALE_IDENTICAL_ALLOWLIST,
  auditDictionary,
  auditEntry,
  auditMeta,
  errorsOnly,
  formatFindings,
  hasAdjacentNumber,
  moneyFindings,
  placeholders,
} from "./brand-voice";
import {
  LEGAL_DOCS,
  LEGAL_SLUGS,
  ORG_NAP,
  legalDoc,
  legalLastUpdated,
  napAddressLine,
  napPostalAddress,
  organizationSchema,
} from "./legal";

const dict = DICT as unknown as Record<string, { en: string; bn: string }>;

describe("auditDictionary — the shipped copy", () => {
  const findings = auditDictionary(dict);

  it("has zero blocking findings across every key", () => {
    const errors = errorsOnly(findings);
    expect(errors.length, `\n${formatFindings(errors)}`).toBe(0);
  });

  it("keeps advisory findings inside the agreed budget", () => {
    const warns = findings.filter((f) => f.severity === "warn");
    // The budget exists so nobody "fixes" a rule by disabling it. Raising it
    // is a deliberate, reviewable change, not a silent drift.
    expect(warns.length, `\n${formatFindings(warns)}`).toBeLessThanOrEqual(10);
  });

  it("ships Bangla for every key", () => {
    const missing = Object.entries(dict).filter(([, v]) => !v.bn?.trim());
    expect(missing.map(([k]) => k)).toEqual([]);
  });

  it("never leaves Bangla as a byte copy of English outside the brand allowlist", () => {
    const identical = Object.entries(dict)
      .filter(([, v]) => v.en.trim() === v.bn.trim())
      .filter(([, v]) => !LOCALE_IDENTICAL_ALLOWLIST.has(v.en.trim()))
      .map(([k]) => k);
    expect(identical).toEqual([]);
  });

  it("keeps placeholder sets identical across locales (locale.placeholder-parity)", () => {
    const parity = auditEntry("home.x", { en: "Save {count} items", bn: "সংরক্ষণ করুন" });
    expect(parity.some((f) => f.rule === "locale.placeholder-parity")).toBe(true);
    const mismatched = Object.entries(dict)
      .filter(([, v]) => placeholders(v.en).join("|") !== placeholders(v.bn).join("|"))
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });
});

describe("voice rules", () => {
  const bn = (text: string) => ({ en: "placeholder", bn: text });

  it("flags every banned hype word", () => {
    for (const phrase of BANNED_HYPE.slice(0, 8)) {
      const found = auditEntry("home.x", { en: `We ${phrase} storefronts.`, bn: "বাংলা লেখা" });
      expect(found.some((f) => f.rule === "voice.hype"), phrase).toBe(true);
    }
  });

  it("flags unsupported claims", () => {
    for (const claim of FORBIDDEN_CLAIMS) {
      const found = auditEntry("home.x", { en: `Checkout is ${claim} for everyone.`, bn: "বাংলা লেখা" });
      expect(found.some((f) => f.rule === "voice.unsupported-claim"), claim).toBe(true);
    }
  });

  it("allows a weasel word only when a number shares the sentence", () => {
    const vague = auditEntry("home.x", { en: "Checkout is faster now.", bn: "চেকআউট এখন দ্রুত।" });
    expect(vague.some((f) => f.rule === "voice.unquantified")).toBe(true);

    const measured = auditEntry("home.x", {
      en: "Checkout is faster by 400 ms on a 3G phone.",
      bn: "৩জি ফোনে চেকআউট ৪০০ মিলিসেকেন্ড দ্রুত।",
    });
    expect(measured.some((f) => f.rule === "voice.unquantified")).toBe(false);
  });

  it("scopes the number check to the sentence, not the whole string", () => {
    const text = "We charge 1200 BDT. Setup is simple.";
    expect(hasAdjacentNumber(text, text.indexOf("1200"))).toBe(true);
    expect(hasAdjacentNumber(text, text.indexOf("simple"))).toBe(false);
  });

  it("rejects exclamation marks in either locale", () => {
    expect(auditEntry("home.x", { en: "Start today!", bn: "আজই শুরু করুন" }).some((f) => f.rule === "voice.exclamation")).toBe(true);
    expect(auditEntry("home.x", { en: "Start today", bn: "আজই শুরু করুন!" }).some((f) => f.rule === "voice.exclamation")).toBe(true);
  });

  it("rejects placeholder copy that escaped review", () => {
    for (const junk of ["Lorem ipsum dolor", "TODO write this", "TBD"]) {
      expect(auditEntry("home.x", { en: junk, bn: "বাংলা লেখা" }).some((f) => f.rule === "voice.placeholder-copy")).toBe(true);
    }
  });

  it("flags Bangla transliteration where a Bangla word exists", () => {
    for (const rule of BANGLA_LINT.slice(0, 3)) {
      const found = auditEntry("home.x", bn(`আমরা ${rule.bad} সমর্থন করি`));
      expect(found.some((f) => f.rule === "bangla.transliteration"), rule.bad).toBe(true);
    }
  });

  it("requires a currency token on BDT money", () => {
    expect(moneyFindings("pricing.x", "Only Tk 1,200 a month", "en").some((f) => f.rule === "money.currency-token")).toBe(true);
    expect(moneyFindings("pricing.x", "Only ৳1,200 a month", "en")).toEqual([]);
    expect(moneyFindings("pricing.x", "Only BDT 1,200 a month", "en")).toEqual([]);
  });

  it("caps label length but leaves prose alone", () => {
    const label = auditEntry("common.some_button", { en: "x".repeat(COPY_LIMITS.buttonMaxChars + 1), bn: "বাংলা" });
    expect(label.some((f) => f.rule === "length.button")).toBe(true);

    const prose = auditEntry("common.error.thing", {
      en: "Something failed on our side and nothing was saved to your store.",
      bn: "আমাদের দিকে সমস্যা হয়েছে, কিছুই সংরক্ষণ হয়নি।",
    });
    expect(prose.some((f) => f.rule === "length.button")).toBe(false);
  });

  it("splits long sentences", () => {
    const long = Array.from({ length: COPY_LIMITS.sentenceMaxWords + 5 }, () => "word").join(" ");
    expect(auditEntry("home.x", { en: `${long}.`, bn: "বাংলা লেখা।" }).some((f) => f.rule === "length.sentence")).toBe(true);
  });

  it("enforces meta title and description limits", () => {
    expect(auditMeta("x".repeat(COPY_LIMITS.metaTitleMaxChars + 1), "ok")).toHaveLength(1);
    expect(auditMeta("ok", "x".repeat(COPY_LIMITS.metaDescriptionMaxChars + 1))).toHaveLength(1);
    expect(auditMeta("ok", "ok")).toEqual([]);
  });

  it("is deterministic and sorted by key", () => {
    const keys = auditDictionary(dict).map((f) => f.key);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(auditDictionary(dict)).toEqual(auditDictionary(dict));
  });
});

describe("legal documents", () => {
  it("publishes the five documents the footer links to", () => {
    expect(LEGAL_SLUGS).toEqual(["terms", "privacy", "refund", "cookies", "acceptable-use"]);
    expect(new Set(LEGAL_SLUGS).size).toBe(LEGAL_SLUGS.length);
  });

  it("versions every document with an ISO effective date", () => {
    for (const doc of LEGAL_DOCS) {
      expect(doc.version, doc.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.effective, doc.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(doc.effective))).toBe(false);
    }
    expect(legalLastUpdated()).toBe([...LEGAL_DOCS.map((d) => d.effective)].sort().at(-1));
  });

  it("is bilingual all the way down, with unique section ids", () => {
    for (const doc of LEGAL_DOCS) {
      expect(doc.title.bn.trim()).not.toBe("");
      expect(doc.summary.bn.trim()).not.toBe("");
      expect(doc.sections.length).toBeGreaterThanOrEqual(3);
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size, doc.slug).toBe(ids.length);
      for (const section of doc.sections) {
        expect(section.heading.en.trim()).not.toBe("");
        expect(section.heading.bn.trim()).not.toBe("");
        expect(section.body.en.length, `${doc.slug}/${section.id}`).toBeGreaterThan(0);
        expect(section.body.bn.length, `${doc.slug}/${section.id}`).toBeGreaterThan(0);
        for (const paragraph of [...section.body.en, ...section.body.bn]) {
          expect(paragraph.trim().length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("passes the same voice rules as the dictionary", () => {
    const entries: Record<string, { en: string; bn: string }> = {};
    for (const doc of LEGAL_DOCS) {
      entries[`legal.${doc.slug}.title`] = doc.title;
      entries[`legal.${doc.slug}.summary`] = doc.summary;
      for (const section of doc.sections) {
        entries[`legal.${doc.slug}.${section.id}.heading`] = section.heading;
      }
    }
    const errors = errorsOnly(auditDictionary(entries));
    expect(errors.length, `\n${formatFindings(errors)}`).toBe(0);
  });

  it("resolves known slugs and refuses unknown ones", () => {
    expect(legalDoc("terms")?.slug).toBe("terms");
    expect(legalDoc("tos")).toBeNull();
    expect(legalDoc("")).toBeNull();
  });
});

describe("NAP consistency", () => {
  it("has one source for name, address and phone", () => {
    expect(ORG_NAP.legalName).toContain("Framique");
    expect(ORG_NAP.phone).toMatch(/^\+880 /);
    expect(ORG_NAP.countryCode).toBe("BD");
    expect(napAddressLine()).toContain(ORG_NAP.street);
    expect(napAddressLine()).toContain(ORG_NAP.postalCode);
    expect(napAddressLine()).toContain(ORG_NAP.country);
  });

  it("emits a PostalAddress that matches the printed line", () => {
    const address = napPostalAddress();
    expect(address.streetAddress).toBe(ORG_NAP.street);
    expect(address.addressLocality).toBe(ORG_NAP.locality);
    expect(address.postalCode).toBe(ORG_NAP.postalCode);
    expect(address.addressCountry).toBe(ORG_NAP.countryCode);
  });

  it("emits Organization JSON-LD with support and sales contact points", () => {
    const schema = organizationSchema("https://framique.com") as any;
    expect(schema["@type"]).toBe("Organization");
    expect(schema.url).toBe("https://framique.com");
    expect(schema.telephone).toBe(ORG_NAP.phone);
    expect(schema.address).toEqual(napPostalAddress());
    const types = schema.contactPoint.map((c: any) => c.contactType);
    expect(types).toContain("customer support");
    expect(types).toContain("sales");
    for (const point of schema.contactPoint) {
      expect(point.availableLanguage).toEqual(["bn", "en"]);
    }
    // Serialisable: a JSON-LD block that throws on stringify ships nothing.
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it("omits url when no request origin is available rather than inventing one", () => {
    expect(organizationSchema(null)).not.toHaveProperty("url");
  });
});
