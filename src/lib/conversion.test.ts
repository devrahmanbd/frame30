import { describe, expect, it } from "vitest";
import {
  countdownSeconds,
  formatCountdown,
  isSessionKey,
  mergeRails,
  newSessionKey,
  reviewSummary,
  scarcity,
  starRow,
} from "./conversion";

describe("reviewSummary", () => {
  it("returns an empty, renderable shape when there are no reviews", () => {
    const s = reviewSummary(null);
    expect(s.count).toBe(0);
    expect(s.hasReviews).toBe(false);
    expect(s.bars).toHaveLength(5);
    expect(s.bars.every((b) => b.pct === 0)).toBe(true);
  });

  it("builds percentages from the histogram", () => {
    const s = reviewSummary({ count: 4, mean: 4.25, histogram: { "5": 2, "4": 1, "1": 1 } });
    expect(s.rounded).toBe(4.5);
    expect(s.bars.find((b) => b.stars === 5)?.pct).toBe(50);
    expect(s.bars.find((b) => b.stars === 3)?.count).toBe(0);
  });

  it("clamps a corrupt mean instead of rendering six stars", () => {
    expect(reviewSummary({ count: 1, mean: 9, histogram: {} }).mean).toBe(5);
    expect(reviewSummary({ count: 1, mean: -2, histogram: {} }).mean).toBe(0);
  });
});

describe("starRow", () => {
  it("splits full, half and empty stars", () => {
    expect(starRow(3.5)).toEqual(["full", "full", "full", "half", "empty"]);
  });
});

describe("scarcity", () => {
  it("never invents urgency above the threshold", () => {
    expect(scarcity(50).level).toBe("none");
  });
  it("escalates as stock falls and reports out of stock", () => {
    expect(scarcity(8).level).toBe("low");
    expect(scarcity(2).level).toBe("critical");
    expect(scarcity(0).level).toBe("out");
    expect(scarcity(-5).left).toBe(0);
  });
});

describe("countdown", () => {
  it("floors at zero for past or invalid deadlines", () => {
    expect(countdownSeconds("not-a-date")).toBe(0);
    expect(countdownSeconds(null)).toBe(0);
    expect(countdownSeconds(new Date(1000).toISOString(), 5000)).toBe(0);
  });
  it("formats with and without days", () => {
    expect(formatCountdown(3661)).toBe("01:01:01");
    expect(formatCountdown(90061)).toBe("1d 01:01:01");
  });
});

describe("mergeRails", () => {
  const p = (id: string) => ({ id, title: id, slug: id, image_url: null, price_minor: 100 });

  it("dedupes across sources and drops the current product", () => {
    const out = mergeRails([[p("a"), p("b")], [p("b"), p("c")]], "a", 6);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("respects the cap", () => {
    const out = mergeRails([[p("a"), p("b"), p("c")]], null, 2);
    expect(out).toHaveLength(2);
  });

  it("tolerates null rails", () => {
    expect(mergeRails([null, undefined, [p("a")]], null)).toHaveLength(1);
  });
});

describe("session keys", () => {
  it("generates keys that validate", () => {
    expect(isSessionKey(newSessionKey())).toBe(true);
  });
  it("rejects junk", () => {
    expect(isSessionKey("short")).toBe(false);
    expect(isSessionKey("../../etc/passwd")).toBe(false);
    expect(isSessionKey(undefined)).toBe(false);
  });
});
