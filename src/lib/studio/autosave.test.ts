import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_TTL_MS,
  clearDraft,
  docSignature,
  draftAgeLabel,
  draftKey,
  readDraft,
  recoverableDraft,
  writeDraft,
} from "./autosave";
import { defaultPageSettings, STUDIO_VERSION, type StudioDoc } from "./model";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function doc(title = "Page"): StudioDoc {
  return { version: STUDIO_VERSION, root: [], page: defaultPageSettings(title) };
}

describe("studio autosave", () => {
  it("round-trips a draft", () => {
    const s = memoryStorage();
    writeDraft("p1", doc("Draft"), 1000, s);
    const back = readDraft("p1", 2000, s);
    expect(back?.doc.page.title).toBe("Draft");
    expect(s.getItem(draftKey("p1"))).toBeTruthy();
  });

  it("drops an expired draft", () => {
    const s = memoryStorage();
    writeDraft("p1", doc(), 0, s);
    expect(readDraft("p1", AUTOSAVE_TTL_MS + 1, s)).toBeNull();
    expect(s.getItem(draftKey("p1"))).toBeNull();
  });

  it("drops corrupt json instead of throwing", () => {
    const s = memoryStorage();
    s.setItem(draftKey("p1"), "{not json");
    expect(readDraft("p1", 1, s)).toBeNull();
  });

  it("clears a draft", () => {
    const s = memoryStorage();
    writeDraft("p1", doc(), 1, s);
    clearDraft("p1", s);
    expect(readDraft("p1", 2, s)).toBeNull();
  });

  it("does not offer a draft identical to the loaded document", () => {
    const s = memoryStorage();
    const server = doc("Same");
    writeDraft("p1", doc("Same"), 1, s);
    expect(recoverableDraft("p1", server, 2, s)).toBeNull();
    expect(s.getItem(draftKey("p1"))).toBeNull();
  });

  it("offers a draft that diverged from the loaded document", () => {
    const s = memoryStorage();
    writeDraft("p1", doc("Recovered"), 1, s);
    const offer = recoverableDraft("p1", doc("Server"), 2, s);
    expect(offer?.doc.page.title).toBe("Recovered");
  });

  it("signature ignores nothing that matters", () => {
    const a = doc("A");
    const b = doc("A");
    expect(docSignature(a)).toBe(docSignature(b));
    b.page.title = "B";
    expect(docSignature(a)).not.toBe(docSignature(b));
  });

  it("labels draft age", () => {
    expect(draftAgeLabel(1000, 1000)).toBe("moments ago");
    expect(draftAgeLabel(0, 5 * 60000)).toBe("5 min ago");
    expect(draftAgeLabel(0, 3 * 3600_000)).toBe("3 h ago");
    expect(draftAgeLabel(0, 48 * 3600_000)).toBe("2 d ago");
  });
});
