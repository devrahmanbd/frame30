import { describe, expect, it } from "vitest";
import {
  alternateEditor,
  isEditorChoice,
  kindDefaultEditor,
  resolveEditor,
} from "./content-editors";

describe("content editor choice", () => {
  it("defaults pages to builder and posts to classic", () => {
    expect(kindDefaultEditor("page")).toBe("builder");
    expect(kindDefaultEditor("post")).toBe("classic");
  });

  it("prefers explicit, then setting, then kind default", () => {
    expect(
      resolveEditor({ kind: "page", explicit: "classic", setting: "builder" }),
    ).toBe("classic");
    expect(resolveEditor({ kind: "page", setting: "classic" })).toBe("classic");
    expect(resolveEditor({ kind: "page", setting: "builder" })).toBe("builder");
    expect(resolveEditor({ kind: "page" })).toBe("builder");
    expect(resolveEditor({ kind: "post" })).toBe("classic");
  });

  it("treats unknown settings as unset", () => {
    expect(resolveEditor({ kind: "page", setting: "gutenberg" })).toBe(
      "builder",
    );
    expect(resolveEditor({ kind: "page", setting: null })).toBe("builder");
  });

  it("validates choices", () => {
    expect(isEditorChoice("builder")).toBe(true);
    expect(isEditorChoice("classic")).toBe(true);
    expect(isEditorChoice("other")).toBe(false);
  });

  it("alternates correctly", () => {
    expect(alternateEditor("builder")).toBe("classic");
    expect(alternateEditor("classic")).toBe("builder");
  });
});
