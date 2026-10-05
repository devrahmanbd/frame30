/**
 * R5 — repeater/complex-widget round-trip regression.
 *
 * Owned file ONLY for this lane. Read-only everything else.
 *
 * Contract (mirrors lane T1.2 hero proof in phase3-section.test.ts):
 * - parseSection preserves arrays via legacyRows + coerceProp;
 * - unknown fields drop by design (assert actual behavior, never silent corruption).
 *
 * Coverage is derived programmatically from SECTION_CATALOG array fields —
 * no hand-listed widget names. For EVERY built-in repeater widget the full
 * flow builder edit → save → reload → preview → publish → storefront is
 * exercised, verifying items, nested props, bilingual fields, theme
 * presentation data and responsive overrides survive exactly.
 */
import { describe, expect, it } from "vitest";
import {
  SECTION_CATALOG,
  flattenFields,
  isSkinnableType,
  parseAst,
  resolveProps,
  resolveSkin,
  usedWidgetSkins,
  withThemeWidgetDefaults,
  type CatalogEntry,
  type Field,
  type PropValue,
  type Section,
} from "./builder-ast";
import { compileResponsiveCss } from "./responsive-css";
import { bnKey } from "./bitext";

/** All array fields of an entry, including legacy `children` spelling. */
function arrayFieldsOf(entry: CatalogEntry): Field[] {
  return flattenFields(entry.fields).filter((f) => f.kind === "array");
}

function rowSchemaOf(field: Field): Field[] {
  return field.fields ?? field.children ?? [];
}

/** Repeater/complex widgets: derived, never hand-listed. */
const REPEATER_ENTRIES: CatalogEntry[] = SECTION_CATALOG.filter(
  (entry) => arrayFieldsOf(entry).length > 0,
);

const BOGUS_TOP = "__r5_bogus_top";
const BOGUS_ROW = "__r5_bogus_row";

function truncate(value: string, max: number | undefined): string {
  if (typeof max !== "number") return value;
  return value.slice(0, max);
}

function clampNum(field: Field, n: number): number {
  const min = field.min ?? Number.NEGATIVE_INFINITY;
  const max =
    typeof field.max === "number" ? field.max : Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Deterministic safe value for one scalar/row-sub field. */
function syntheticScalar(field: Field, idx: number): string | number | boolean {
  // Bilingual twins stored as separate `_bn` text rows: keep them Bengali.
  if (field.key.endsWith("_bn")) {
    return truncate(`আর৫ ${field.key} ${idx} বাংলা`, field.max ?? 200);
  }
  switch (field.kind) {
    case "select": {
      const options = field.options ?? [];
      if (!options.length) return "";
      // Last option proves a non-default choice survives (skin/speed/surface…).
      return options[options.length - 1]!.value;
    }
    case "number":
    case "range":
    case "unit": {
      let n = 9 + idx;
      if (field.key === "maxPrice") n = 150_000 + idx * 50_000;
      else if (field.key === "autoAdvanceMs") n = 6000;
      else if (field.key === "rotateMs") n = 6000;
      else if (field.key === "columns" || field.key === "perView") n = 3;
      else if (field.key === "padY") n = 24;
      else if (field.key === "padX") n = 16;
      else if (field.key === "span") n = 4;
      return clampNum(field, n);
    }
    case "boolean":
      return true;
    case "color":
      return "#1a2b3c";
    case "taxonomy":
      // Empty is the only universally valid taxonomy value without resolving
      // the source list; no repeater row declares a taxonomy sub-field today.
      return "";
    case "embed":
      return "https://www.youtube.com/embed/dQw4w9WgXcQ";
    case "url":
    case "image": {
      const lower = field.key.toLowerCase();
      const looksImage =
        lower.includes("image") ||
        lower.includes("avatar") ||
        lower.includes("logo") ||
        lower.includes("photo") ||
        lower.includes("banner") ||
        lower.includes("thumb") ||
        lower.includes("cover");
      return looksImage
        ? `/ph/r5-${field.key}-${idx}.png`.slice(0, field.max ?? 500)
        : `/c/r5-${field.key}-${idx}`.slice(0, field.max ?? 500);
    }
    case "text":
    case "textarea":
    case "bitext":
    case "html":
    default: {
      // Plain copy only: markup would be sanitised, URLs need SAFE_HREF.
      // Keys that read as links still need a valid href even when declared
      // as text (department/story rows declare image/href as text).
      const lower = field.key.toLowerCase();
      if (lower === "href" || lower.endsWith("href"))
        return `/c/r5-${field.key}-${idx}`.slice(0, field.max ?? 200);
      if (
        lower === "image" ||
        lower === "avatar" ||
        lower.includes("imageurl") ||
        lower.includes("logo")
      )
        return `/ph/r5-${field.key}-${idx}.png`.slice(0, field.max ?? 200);
      return truncate(`R5 ${field.key} ${idx} EN`, field.max ?? 200);
    }
  }
}

function bnScalar(field: Field, idx: number): string {
  return truncate(`আর৫ ${field.key} ${idx} বাংলা`, field.max ?? 200);
}

/** Raw merchant-authored props for one widget (edit step). */
function buildRawProps(entry: CatalogEntry): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const field of flattenFields(entry.fields)) {
    if (field.kind === "array" || field.kind === "group" || field.kind === "menu")
      continue;
    // Universal style base: a non-default presentation value for every widget.
    if (field.key === "padY") {
      props[field.key] = clampNum(field, 24);
      continue;
    }
    props[field.key] = syntheticScalar(field, 1);
    if (field.kind === "bitext") {
      props[bnKey(field.key)] = bnScalar(field, 1);
    }
  }
  for (const arrayField of arrayFieldsOf(entry)) {
    const schema = rowSchemaOf(arrayField);
    const count = Math.min(arrayField.maxRows ?? 3, 3);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i += 1) {
      const row: Record<string, unknown> = {};
      for (const sub of schema) {
        if (sub.kind === "array" || sub.kind === "group") continue;
        row[sub.key] = syntheticScalar(sub, i + 1);
        if (sub.kind === "bitext") row[bnKey(sub.key)] = bnScalar(sub, i + 1);
      }
      rows.push(row);
    }
    // Allowlist pin: one undeclared sub-key rides on the first row; it must
    // never take the row down and must never survive.
    if (rows.length) rows[0]![BOGUS_ROW] = "should-drop";
    props[arrayField.key] = rows;
  }
  // Merchant chrome that must survive alongside the repeater.
  props["advMarginTop"] = 16;
  props["advAnimation"] = "rise";
  // Undeclared top-level prop: same allowlist contract, must drop cleanly.
  props[BOGUS_TOP] = "should-drop";
  return props;
}

/** Raw breakpoint overrides for one widget (responsive step). */
function buildRawBp(entry: CatalogEntry): Record<string, unknown> {
  const flat = flattenFields(entry.fields);
  const padY = flat.find((f) => f.key === "padY");
  const layer: Record<string, unknown> = {};
  if (padY?.responsive) layer["padY"] = clampNum(padY, 8);
  // A neighbouring non-responsive content string in the same layer must drop.
  const fixed = flat.find(
    (f) =>
      !f.responsive &&
      (f.kind === "text" || f.kind === "textarea" || f.kind === "bitext") &&
      !f.key.endsWith("_bn"),
  );
  if (fixed) layer[fixed.key] = "Tiny";
  return Object.keys(layer).length ? { mobile: layer } : {};
}

function slotFor(entry: CatalogEntry): "header" | "main" | "footer" {
  return entry.slots[0] ?? "main";
}

function docFor(
  entry: CatalogEntry,
  props: Record<string, unknown>,
  bp: Record<string, unknown>,
): Record<string, unknown> {
  const slot = slotFor(entry);
  const node: Record<string, unknown> = {
    id: `r5-${entry.type}`,
    type: entry.type,
    props,
  };
  if (Object.keys(bp).length) node["bp"] = bp;
  return {
    header: slot === "header" ? [node] : [],
    main: slot === "main" ? [node] : [],
    footer: slot === "footer" ? [node] : [],
  };
}

function sectionOf(ast: { header: Section[]; main: Section[]; footer: Section[] }, entry: CatalogEntry): Section {
  const slot = slotFor(entry);
  const found = (ast[slot] as Section[])[0];
  if (!found) throw new Error(`missing section for ${entry.type} in ${slot}`);
  return found;
}

describe("R5 — repeater/complex-widget round-trip regression", () => {
  it("derives repeater widgets programmatically from SECTION_CATALOG array fields", () => {
    expect(REPEATER_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of REPEATER_ENTRIES) {
      expect(arrayFieldsOf(entry).length).toBeGreaterThan(0);
    }
    // Hero is the established repeater proof (lane T1.2); it must be covered.
    expect(REPEATER_ENTRIES.some((e) => e.type === "hero")).toBe(true);
    // No duplicates: one regression per widget type.
    expect(new Set(REPEATER_ENTRIES.map((e) => e.type)).size).toBe(
      REPEATER_ENTRIES.length,
    );
  });

  for (const entry of REPEATER_ENTRIES) {
    it(`full flow preserves ${entry.type}: edit → save → reload → preview → publish → storefront`, () => {
      const rawProps = buildRawProps(entry);
      const rawBp = buildRawBp(entry);

      // Builder edit → save (serialise) → reload (deserialise).
      const saved = JSON.stringify(docFor(entry, rawProps, rawBp));
      const reloaded = JSON.parse(saved) as Record<string, unknown>;

      // Preview: first parse.
      const preview = parseAst(reloaded);
      const prevSection = sectionOf(preview, entry);
      expect(prevSection.type).toBe(entry.type);

      // Publish: serialise the parsed AST and parse again (persist round-trip).
      const published = parseAst(JSON.parse(JSON.stringify(preview)));
      const pubSection = sectionOf(published, entry);

      // --- items + nested props survive exactly, both parses agree ---
      for (const arrayField of arrayFieldsOf(entry)) {
        const prevRows = prevSection.props[arrayField.key] as Record<string, unknown>[];
        const pubRows = pubSection.props[arrayField.key] as Record<string, unknown>[];
        const rawRows = rawProps[arrayField.key] as Record<string, unknown>[];
        expect(Array.isArray(prevRows)).toBe(true);
        expect(Array.isArray(pubRows)).toBe(true);
        expect(prevRows).toHaveLength(rawRows.length);
        expect(pubRows).toHaveLength(rawRows.length);
        expect(pubRows).toEqual(prevRows);
        const schema = rowSchemaOf(arrayField);
        prevRows.forEach((row, i) => {
          // Declared repeater fields (incl. _bn twins) survive verbatim.
          for (const sub of schema) {
            if (sub.kind === "array" || sub.kind === "group") continue;
            expect(row[sub.key], `${entry.type}.${arrayField.key}[${i}].${sub.key}`).toBe(
              syntheticScalar(sub, i + 1),
            );
            if (sub.kind === "bitext") {
              expect(row[bnKey(sub.key)]).toBe(bnScalar(sub, i + 1));
            }
          }
          // Bilingual row twins: any `_bn` sub-key mirrors its EN sibling.
          for (const sub of schema) {
            if (!sub.key.endsWith("_bn")) continue;
            expect(typeof row[sub.key]).toBe("string");
            expect(String(row[sub.key])).toContain("আর৫");
          }
        });
      }

      // --- scalar + bilingual + presentation props survive exactly ---
      const flat = flattenFields(entry.fields);
      for (const field of flat) {
        if (field.kind === "array" || field.kind === "group" || field.kind === "menu")
          continue;
        const expected =
          field.key === "padY" ? clampNum(field, 24) : syntheticScalar(field, 1);
        expect(pubSection.props[field.key], `${entry.type}.${field.key}`).toBe(expected);
        expect(prevSection.props[field.key], `${entry.type}.${field.key}`).toBe(expected);
        if (field.kind === "bitext") {
          const key = bnKey(field.key);
          expect(prevSection.props[key], `${entry.type}.${key}`).toBe(bnScalar(field, 1));
          expect(pubSection.props[key], `${entry.type}.${key}`).toBe(bnScalar(field, 1));
        }
      }

      // Theme presentation data: style/select presentation props are exact,
      // and the skin seam resolves to the authored skin.
      if (isSkinnableType(entry.type)) {
        const skinField = flat.find((f) => f.key === "skin");
        expect(skinField).toBeDefined();
        const chosen = pubSection.props["skin"];
        expect(typeof chosen).toBe("string");
        expect(resolveSkin(entry.type, chosen)).toBe(chosen);
        const used = usedWidgetSkins([pubSection]);
        expect(used.some((u) => u.type === entry.type && u.skin === chosen)).toBe(true);
      } else {
        expect(resolveSkin(entry.type, pubSection.props["skin"])).toBe("");
      }
      // Theme defaults merge under authored props: authored always wins and
      // unknown theme keys never smuggle onto the node.
      const firstText = flat.find(
        (f) => f.kind === "text" || f.kind === "bitext",
      );
      if (firstText) {
        const merged = withThemeWidgetDefaults(
          entry.type,
          pubSection.props as Record<string, PropValue>,
          {
            [entry.type]: {
              [firstText.key]: "Theme heading should lose",
              __r5_theme_bogus: "nope",
            },
          } as never,
        );
        expect(merged[firstText.key]).toBe(pubSection.props[firstText.key]);
        expect(merged).not.toHaveProperty("__r5_theme_bogus");
      }

      // Advanced-tab chrome travels with the node through the same flow.
      expect(pubSection.props["advMarginTop"]).toBe(16);
      expect(pubSection.props["advAnimation"]).toBe("rise");

      // --- responsive overrides survive exactly (storefront cascade) ---
      const mobileLayer = (rawBp["mobile"] as Record<string, unknown> | undefined) ?? {};
      if (mobileLayer["padY"] !== undefined) {
        expect(pubSection.bp?.["mobile"]?.["padY"]).toBe(8);
        expect(resolveProps(pubSection, "mobile")["padY"]).toBe(8);
        expect(resolveProps(pubSection)["padY"]).toBe(24);
        const compiled = compileResponsiveCss([pubSection]);
        expect(compiled.css).toContain("padding-block:8px");
      }
      // Fixed (non-responsive) keys in the same layer are dropped by design.
      for (const [key] of Object.entries(mobileLayer)) {
        if (key === "padY") continue;
        expect(pubSection.bp?.["mobile"]?.[key]).toBeUndefined();
      }

      // --- allowlist contract: unknown fields drop, never corrupt ---
      expect(pubSection.props).not.toHaveProperty(BOGUS_TOP);
      expect(prevSection.props).not.toHaveProperty(BOGUS_TOP);
      for (const arrayField of arrayFieldsOf(entry)) {
        const rows = pubSection.props[arrayField.key] as Record<string, unknown>[];
        for (const row of rows) {
          expect(row).not.toHaveProperty(BOGUS_ROW);
        }
      }

      // --- publish is stable: preview and storefront agree byte-for-byte ---
      expect(pubSection.props).toEqual(prevSection.props);
      expect(pubSection.bp ?? {}).toEqual(prevSection.bp ?? {});
      expect(JSON.parse(JSON.stringify(published))).toEqual(JSON.parse(JSON.stringify(preview)));
    });
  }

  it("caps rows at the schema maxRows instead of corrupting the tail", () => {
    // Overflow is truncated (never a crash, never partial-row corruption).
    for (const entry of REPEATER_ENTRIES) {
      for (const arrayField of arrayFieldsOf(entry)) {
        const cap = Math.min(arrayField.maxRows ?? 24, 24);
        const schema = rowSchemaOf(arrayField);
        const overflowing = Array.from({ length: cap + 5 }, (_, i) => {
          const row: Record<string, unknown> = {};
          for (const sub of schema) {
            if (sub.kind === "array" || sub.kind === "group") continue;
            row[sub.key] = syntheticScalar(sub, (i % 3) + 1);
          }
          return row;
        });
        const ast = parseAst(
          docFor(entry, { ...buildRawProps(entry), [arrayField.key]: overflowing }, {}),
        );
        const section = sectionOf(ast, entry);
        const rows = section.props[arrayField.key] as unknown[];
        expect(rows.length, `${entry.type}.${arrayField.key}`).toBeLessThanOrEqual(cap);
      }
    }
  });
});
