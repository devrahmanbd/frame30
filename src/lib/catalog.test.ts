import { describe, expect, it } from "vitest";
import {
  KIND_META,
  describeRules,
  isShippable,
  normalizeRules,
  parseCsv,
} from "./catalog";

describe("catalog kinds", () => {
  it("only physical goods ship", () => {
    expect(isShippable("physical")).toBe(true);
    for (const kind of ["digital", "service", "subscription"] as const) {
      expect(isShippable(kind)).toBe(false);
      expect(KIND_META[kind].needsStock).toBe(false);
    }
  });
});

describe("csv parsing", () => {
  it("reads quoted fields, escaped quotes and CRLF", () => {
    const csv = 'title,slug,price_minor\r\n"Shari, red","shari-red",485000\r\n"He said ""hi""",x,100\r\n';
    const { rows, errors } = parseCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).toBe("Shari, red");
    expect(rows[0]!.price_minor).toBe("485000");
    expect(rows[1]!.title).toBe('He said "hi"');
  });

  it("flags missing required columns", () => {
    expect(parseCsv("title,slug\nA,a\n").errors).toContain("missing_column:price_minor");
    expect(parseCsv("").errors).toContain("empty_file");
  });

  it("ignores blank lines", () => {
    expect(parseCsv("title,slug,price_minor\n\nA,a,1\n\n").rows).toHaveLength(1);
  });
});

describe("smart collection rules", () => {
  it("drops unknown fields, bad operators and keyless metafields", () => {
    const rules = normalizeRules({
      match: "any",
      conditions: [
        { field: "title", op: "contains", value: "shari" },
        { field: "secret", op: "equals", value: "x" },
        { field: "price", op: "regex", value: "1" },
        { field: "metafield", op: "exists" },
        { field: "metafield", op: "exists", key: "fabric" },
      ],
    });
    expect(rules.match).toBe("any");
    expect(rules.conditions).toHaveLength(2);
  });

  it("defaults to match-all and caps condition count", () => {
    const many = Array.from({ length: 30 }, () => ({ field: "tag", op: "contains", value: "a" }));
    const rules = normalizeRules({ conditions: many });
    expect(rules.match).toBe("all");
    expect(rules.conditions).toHaveLength(20);
  });

  it("describes rules for the audit line", () => {
    expect(describeRules({ match: "all", conditions: [] })).toBe("no conditions");
    expect(describeRules(normalizeRules({ conditions: [{ field: "kind", op: "equals", value: "digital" }] }))).toContain(
      "kind equals digital",
    );
  });
});
