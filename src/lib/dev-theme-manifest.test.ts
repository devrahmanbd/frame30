import { describe, expect, it } from "vitest";
import {
  DEV_THEME_RUNTIME_VERSION,
  parseDevThemeManifest,
} from "./dev-theme-manifest";

/**
 * Level B dev-theme manifest validator — TDD vectors.
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md`.
 * The validator is pure (no deps, no I/O): shape checks only.
 */

function minimalManifest(): Record<string, unknown> {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation"],
    dependencies: [],
    sections: [],
    settings: [],
  };
}

function withDeps(): Record<string, unknown> {
  return {
    ...minimalManifest(),
    capabilities: ["presentation", "animation"],
    dependencies: [
      {
        name: "gsap",
        version: "3.15.0",
        license: "MIT",
        integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
  };
}

describe("parseDevThemeManifest — valid manifests", () => {
  it("accepts a valid minimal manifest", () => {
    const verdict = parseDevThemeManifest(minimalManifest());
    expect(verdict.ok).toBe(true);
  });

  it("accepts a valid full manifest (deps, sections, settings)", () => {
    const verdict = parseDevThemeManifest(withDeps());
    expect(verdict.ok).toBe(true);
  });

  it("accepts all six builder field types in settings", () => {
    const m = minimalManifest();
    m.settings = (
      [
        "text",
        "image",
        "color",
        "spacing",
        "product-selection",
        "animation",
      ] as const
    ).map((type, i) => ({ key: `field-${i}`, label: `F ${i}`, type }));
    expect(parseDevThemeManifest(m).ok).toBe(true);
  });

  it("accepts sha512 integrity digests (near-miss allow)", () => {
    const m = minimalManifest();
    m.dependencies = [
      {
        name: "three",
        version: "0.170.0",
        license: "MIT",
        integrity: "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ];
    expect(parseDevThemeManifest(m).ok).toBe(true);
  });

  it("accepts empty capability and dependency lists", () => {
    expect(parseDevThemeManifest(minimalManifest()).ok).toBe(true);
  });
});

describe("parseDevThemeManifest — identity rejections", () => {
  it("rejects non-object input (null)", () => {
    expect(parseDevThemeManifest(null).ok).toBe(false);
  });

  it("rejects non-object input (array)", () => {
    expect(parseDevThemeManifest([]).ok).toBe(false);
  });

  it("rejects an id with uppercase letters", () => {
    const m = minimalManifest();
    m.id = "Aurora-Lookbook";
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/id/);
  });

  it("rejects an id with underscores (near-miss: slugs use hyphens)", () => {
    const m = minimalManifest();
    m.id = "aurora_lookbook";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects an id with a leading digit", () => {
    const m = minimalManifest();
    m.id = "1aurora";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a non-semver version (1.0)", () => {
    const m = minimalManifest();
    m.version = "1.0";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a v-prefixed version (near-miss: v1.0.0)", () => {
    const m = minimalManifest();
    m.version = "v1.0.0";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a missing display name", () => {
    const m = minimalManifest();
    delete m.name;
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a missing publisher", () => {
    const m = minimalManifest();
    delete m.publisher;
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });
});

describe("parseDevThemeManifest — runtime pin rejections", () => {
  it("rejects a future runtime pin", () => {
    const m = minimalManifest();
    m.runtime = "2.0.0";
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/runtime/);
  });

  it("rejects an unknown runtime pin", () => {
    const m = minimalManifest();
    m.runtime = "9.9.9";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a semver-range runtime pin (near-miss: ^1.0.0 — exact pin only)", () => {
    const m = minimalManifest();
    m.runtime = "^1.0.0";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a missing runtime pin", () => {
    const m = minimalManifest();
    delete m.runtime;
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });
});

describe("parseDevThemeManifest — capability rejections", () => {
  it("rejects an unknown capability", () => {
    const m = minimalManifest();
    m.capabilities = ["camera"];
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/capabilit/);
  });

  it("rejects a duplicate capability", () => {
    const m = minimalManifest();
    m.capabilities = ["presentation", "presentation"];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a non-array capabilities value", () => {
    const m = minimalManifest();
    m.capabilities = "presentation";
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });
});

describe("parseDevThemeManifest — dependency rejections", () => {
  it("rejects a dependency missing its license", () => {
    const m = minimalManifest();
    m.dependencies = [
      {
        name: "gsap",
        version: "3.15.0",
        integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a dependency missing its integrity hash", () => {
    const m = minimalManifest();
    m.dependencies = [{ name: "gsap", version: "3.15.0", license: "MIT" }];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a weak-hash integrity shape (near-miss: md5-…)", () => {
    const m = minimalManifest();
    m.dependencies = [
      {
        name: "gsap",
        version: "3.15.0",
        license: "MIT",
        integrity: "md5-dGVzdA==",
      },
    ];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects an empty sha256 digest (near-miss: sha256- with nothing after)", () => {
    const m = minimalManifest();
    m.dependencies = [
      { name: "gsap", version: "3.15.0", license: "MIT", integrity: "sha256-" },
    ];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });
});

describe("parseDevThemeManifest — settings and section rejections", () => {
  it("rejects an unknown settings field type", () => {
    const m = minimalManifest();
    m.settings = [{ key: "code", label: "Code", type: "code" }];
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/settings/);
  });

  it("rejects a settings field with an invalid key", () => {
    const m = minimalManifest();
    m.settings = [{ key: "Bad Key!", label: "Bad", type: "text" }];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects a section bound to an unknown slot", () => {
    const m = minimalManifest();
    m.sections = [{ key: "hero", slot: "checkout", component: "HeroCanvas" }];
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/slot/);
  });

  it("rejects a section with an invalid key", () => {
    const m = minimalManifest();
    m.sections = [{ key: "Hero!", slot: "main", component: "HeroCanvas" }];
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });
});

describe("parseDevThemeManifest — forbidden keys", () => {
  it.each(["server", "hooks", "secrets", "network", "network-capability"])(
    "rejects on presence of forbidden key %s",
    (key) => {
      const m = minimalManifest();
      m[key] = {};
      const verdict = parseDevThemeManifest(m);
      expect(verdict.ok).toBe(false);
      expect(verdict.errors.join(" ")).toMatch(/forbidden/);
    },
  );
});

describe("parseDevThemeManifest — size caps", () => {
  it("rejects a manifest whose JSON exceeds 64KB", () => {
    const m = minimalManifest();
    m.name = `x${"y".repeat(70 * 1024)}`;
    expect(parseDevThemeManifest(m).ok).toBe(false);
  });

  it("rejects more than 64 sections", () => {
    const m = minimalManifest();
    m.sections = Array.from({ length: 65 }, (_, i) => ({
      key: `section-${i}`,
      slot: "main",
      component: "Widget",
    }));
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/section/);
  });

  it("rejects more than 128 settings", () => {
    const m = minimalManifest();
    m.settings = Array.from({ length: 129 }, (_, i) => ({
      key: `field-${i}`,
      label: `F ${i}`,
      type: "text",
    }));
    const verdict = parseDevThemeManifest(m);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/settings/);
  });
});
