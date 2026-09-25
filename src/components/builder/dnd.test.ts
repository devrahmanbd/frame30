import { describe, expect, it } from "vitest";
import {
  TRAY_MIME,
  decodeTrayDrop,
  encodeTrayDrop,
  pickDropIndex,
} from "./dnd";

describe("tray drop payload", () => {
  it("round-trips widget type and preset", () => {
    const encoded = encodeTrayDrop({ type: "hero", presetKey: "split" });
    expect(
      decodeTrayDrop({ types: [TRAY_MIME], getData: () => encoded }),
    ).toEqual({
      type: "hero",
      presetKey: "split",
    });
  });

  it("rejects foreign drags and malformed payloads", () => {
    expect(
      decodeTrayDrop({ types: ["text/plain"], getData: () => "x" }),
    ).toBeNull();
    expect(
      decodeTrayDrop({ types: [TRAY_MIME], getData: () => "not-json" }),
    ).toBeNull();
    expect(
      decodeTrayDrop({ types: [TRAY_MIME], getData: () => JSON.stringify({}) }),
    ).toBeNull();
  });
});

describe("pickDropIndex", () => {
  it("picks gaps by pointer Y between row tops", () => {
    // rows start at these Y offsets; pointer picks the gap index
    expect(pickDropIndex(5, [10, 60, 110])).toBe(0);
    expect(pickDropIndex(59, [10, 60, 110])).toBe(1);
    expect(pickDropIndex(200, [10, 60, 110])).toBe(3);
    expect(pickDropIndex(10, [])).toBe(0);
  });
});
