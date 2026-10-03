import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTRAST_FLOOR,
  GATE_MATRIX,
  RELEASE_GATES,
  composePublishGate,
  contrastGate,
  contrastReport,
  effectiveDark,
  skeletonParityGate,
} from "./publish-gates";
import { DEFAULT_DARK_TOKENS, DEFAULT_TOKENS } from "./builder-ast";
import { LIGHTHOUSE_BUDGET, VITALS_BUDGET } from "./web-vitals";
import {
  interactiveGate,
  motionBudgetGate,
  reducedMotionGate,
  statusGate,
  MOTION_THEME_BUDGET,
} from "./publish-gates";
import {
  newSection,
  parseAst,
  type Section,
  type ThemeAst,
} from "./builder-ast";

describe("Phase 6 — contrast gate, light and dark", () => {
  it("sweeps the same four scheme × locale combinations the browser gate does", () => {
    expect(GATE_MATRIX).toHaveLength(4);
    const script = readFileSync("scripts/a11y-gate.mjs", "utf8");
    for (const variant of GATE_MATRIX) {
      expect(script).toContain(`${variant.scheme}-${variant.locale}`);
    }
  });

  it("measures every ink/surface/accent pair in both schemes", () => {
    const rows = contrastReport(DEFAULT_TOKENS);
    expect(rows.filter((r) => r.scheme === "light")).toHaveLength(5);
    expect(rows.filter((r) => r.scheme === "dark")).toHaveLength(5);
    expect(
      rows.every(
        (r) => r.floor === CONTRAST_FLOOR.text || r.floor === CONTRAST_FLOOR.ui,
      ),
    ).toBe(true);
  });

  it("falls back to the platform dark set for a light-only theme", () => {
    expect(effectiveDark({ ...DEFAULT_TOKENS, dark: null })).toEqual(
      DEFAULT_DARK_TOKENS,
    );
  });

  it("fails a theme whose body copy is unreadable", () => {
    const failures = contrastGate({
      ...DEFAULT_TOKENS,
      ink: "#EEEEEE",
      surface: "#FFFFFF",
    });
    expect(failures.some((f) => f.code === "contrast.light")).toBe(true);
  });
});

describe("Phase 6 — zero-CLS skeleton parity", () => {
  it("every data widget reserves a box with a known aspect", () => {
    expect(skeletonParityGate()).toEqual([]);
  });
});

describe("Phase 6 — composed publish gate", () => {
  it("passes a clean theme", () => {
    expect(composePublishGate({ tokens: DEFAULT_TOKENS }).ok).toBe(true);
  });

  it("carries lint, translation, font and contrast failures together", () => {
    const gate = composePublishGate({
      tokens: { ...DEFAULT_TOKENS, ink: "#EEEEEE" },
      lint: ["index: broken"],
      translation: ["বাংলা translation coverage is 40%"],
      fonts: ["fonts: unlicensed face"],
    });
    expect(gate.ok).toBe(false);
    const codes = new Set(gate.failures.map((f) => f.code));
    expect(codes).toContain("lint");
    expect(codes).toContain("translation");
    expect(codes).toContain("fonts");
    expect([...codes].some((c) => c.startsWith("contrast."))).toBe(true);
  });
});

describe("Phase 6 — release gates are wired, not merely present", () => {
  it("declares the three browser gates with the budgets the app quotes", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    for (const gate of RELEASE_GATES) {
      expect(pkg.scripts[gate.npm], gate.key).toBeTruthy();
      expect(pkg.scripts["gates:release"]).toContain(gate.npm);
    }
    expect(pkg.scripts["gates"]).toContain("gates:release");
  });

  it("quotes one set of numbers", () => {
    expect(LIGHTHOUSE_BUDGET.lcpMs).toBe(VITALS_BUDGET.lcpMs);
    const vitals = readFileSync("scripts/vitals-gate.mjs", "utf8");
    expect(vitals).toContain(`lcpMs: ${VITALS_BUDGET.lcpMs}`);
    expect(vitals).toContain(`cls: ${VITALS_BUDGET.cls}`);
    expect(vitals).toContain(`TBT_BUDGET_MS = ${LIGHTHOUSE_BUDGET.tbtMs}`);
    const a11y = readFileSync("scripts/a11y-gate.mjs", "utf8");
    expect(a11y).toContain("color-contrast");
  });
});

function node(
  type: Parameters<typeof newSection>[0],
  id: string,
  props: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Section {
  const base = newSection(type);
  return {
    ...base,
    id,
    props: { ...base.props, ...props },
    ...extra,
  } as Section;
}

function tree(main: Section[]): ThemeAst {
  return parseAst({ header: [], main, footer: [] });
}

function gateFor(main: Section[]) {
  return composePublishGate({ tokens: DEFAULT_TOKENS, a11y: { ast: tree(main) } });
}

describe("Phase 1A — interactive elements are reachable and named", () => {
  it("blocks a link with a target but no name", () => {
    const gate = gateFor([
      node("hero", "h1", { ctaLabel: "", ctaHref: "/sale" }),
    ]);
    expect(gate.ok).toBe(false);
    expect(
      gate.failures.some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
    // Blocking means failures, never warnings.
    expect(
      gate.warnings.some((w) => w.code.startsWith("a11y.")),
    ).toBe(false);
    expect(gate.a11y?.ok).toBe(false);
  });

  it("passes the same hero with no target — no button renders", () => {
    expect(interactiveGate(tree([node("hero", "h1")]))).toEqual([]);
  });

  it("blocks an always-rendered submit button with no label", () => {
    const failures = interactiveGate(
      tree([node("newsletter", "n1", { buttonLabel: "" })]),
    );
    expect(
      failures.some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
  });

  it("blocks a form input with no label, but only demands the phone label when the field is shown", () => {
    expect(
      interactiveGate(
        tree([node("form", "f1", { nameLabel: "" })]),
      ).some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
    // Phone field hidden: an empty phone label is dead copy, not an unnamed control.
    expect(
      interactiveGate(
        tree([node("form", "f2", { showPhone: false, phoneLabel: "" })]),
      ),
    ).toEqual([]);
    expect(
      interactiveGate(
        tree([node("form", "f3", { phoneLabel: "" })]),
      ).some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
  });

  it("blocks unnamed repeater rows — slides through parse, menu rows as authored", () => {
    // Hero slides are `array` rows, so they survive parseAst with the
    // empty label intact — the integration path a merchant actually hits.
    const parsed = interactiveGate(
      tree([
        node("hero", "h1", {
          items: [{ heading: "Sale", ctaLabel: "", ctaHref: "/sale" }],
        }),
      ]),
    );
    expect(
      parsed.some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
    // Menu rows are `menu`-kind (parse restores catalog defaults), so the
    // same loop is pinned against the authored tree directly.
    const raw: ThemeAst = {
      header: [],
      main: [
        node("nav_menu", "m1", {
          items: [
            { label: "Home", href: "/" },
            { label: "", href: "/sale" },
          ],
        }),
      ],
      footer: [],
    };
    expect(
      interactiveGate(raw).some((f) => f.code === "a11y.interactive.unnamed"),
    ).toBe(true);
  });

  it("blocks keyboard-unreachable interactives hidden on every breakpoint", () => {
    const gate = gateFor([
      node("button", "b1", { label: "Shop now", href: "/sale" }, { hidden: ["mobile", "tablet", "desktop"] }),
    ]);
    expect(gate.ok).toBe(false);
    expect(
      gate.failures.some((f) => f.code === "a11y.interactive.unreachable"),
    ).toBe(true);
  });

  it("leaves hidden-everywhere non-interactive content alone", () => {
    expect(
      interactiveGate(
        tree([node("hero", "h1", {}, { hidden: ["mobile", "tablet", "desktop"] })]),
      ),
    ).toEqual([]);
  });

  it("does not flag the placeholder logo link — its emptiness is a placeholder, not a name", () => {
    expect(interactiveGate(tree([node("logo", "l1")]))).toEqual([]);
  });

  it("leaves the trust verdict out when no a11y tree is supplied", () => {
    const gate = composePublishGate({ tokens: DEFAULT_TOKENS });
    expect(gate.ok).toBe(true);
    expect(gate.a11y).toBeNull();
  });
});

describe("Phase 1A — status is never colour-only", () => {
  it("blocks a toned banner with no message", () => {
    const failures = statusGate(tree([node("banner", "b1", { text: "" })]));
    expect(
      failures.some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
  });

  it("blocks progress stages with no stage names", () => {
    const failures = statusGate(
      tree([node("checkout_steps", "c1", { step2: "" })]),
    );
    expect(
      failures.some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
    expect(
      statusGate(tree([node("checkout_steps", "c2")])),
    ).toEqual([]);
  });

  it("blocks a chart with no text alternative", () => {
    // The catalog default ships an empty summary, so this pins the rule,
    // not the fixture: a trend visible only to sighted visitors blocks.
    const failures = statusGate(tree([node("price_sparkline", "p1")]));
    expect(
      failures.some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
    expect(
      statusGate(
        tree([node("price_sparkline", "p2", { summary: "Fell 12% in 90 days" })]),
      ),
    ).toEqual([]);
  });

  it("blocks a claim source with no claim text, but passes an untouched badge", () => {
    expect(
      statusGate(
        tree([
          node("sustain_badge", "s1", {
            c1Label: "",
            c1Source: "https://cert.example",
          }),
        ]),
      ).some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
    expect(statusGate(tree([node("sustain_badge", "s2")]))).toEqual([]);
  });

  it("blocks a shipping progress bar with no copy", () => {
    expect(
      statusGate(
        tree([
          node("free_shipping_bar", "f1", {
            freeShippingLabel: "",
            freeShippingSuffix: "",
            freeShippingDone: "",
          }),
        ]),
      ).some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
    expect(
      statusGate(tree([node("free_shipping_bar", "f2")])),
    ).toEqual([]);
  });

  it("fails the publish on status breaches — blocking, not advisory", () => {
    const gate = gateFor([node("banner", "b1", { text: "" })]);
    expect(gate.ok).toBe(false);
    expect(
      gate.failures.some((f) => f.code === "a11y.status.color_only"),
    ).toBe(true);
    expect(
      gate.warnings.some((w) => w.code.startsWith("a11y.")),
    ).toBe(false);
  });

  it("passes a clean template", () => {
    const gate = gateFor([
      node("hero", "h1"),
      node("button", "b1"),
      node("banner", "bn1"),
    ]);
    expect(gate.ok).toBe(true);
    expect(gate.a11y?.ok).toBe(true);
  });
});

describe("B6 — per-theme motion budgets", () => {
  it("passes a quiet theme", () => {
    expect(
      motionBudgetGate(
        tree([
          node("hero", "h1", { advMotion: "rise" }),
          node("hero", "h2", { advMotion: "count-up" }),
        ]),
      ),
    ).toEqual([]);
  });

  it("passes one lively loop but fails two", () => {
    expect(
      motionBudgetGate(tree([node("hero", "h1", { advMotion: "marquee" })])),
    ).toEqual([]);
    const failures = motionBudgetGate(
      tree([
        node("hero", "h1", { advMotion: "marquee" }),
        node("hero", "h2", { advMotion: "marquee" }),
      ]),
    );
    expect(failures.some((f) => f.code === "motion.budget.loops")).toBe(true);
  });

  it("fails beyond the concurrent-tween ceiling and passes at it", () => {
    const over = Array.from(
      { length: MOTION_THEME_BUDGET.maxAnimatedNodes + 1 },
      (_, i) => node("heading", `n${i}`, { advMotion: "fade" }),
    );
    expect(
      motionBudgetGate(tree(over)).some(
        (f) => f.code === "motion.budget.tweens",
      ),
    ).toBe(true);
    expect(
      motionBudgetGate(tree(over.slice(0, MOTION_THEME_BUDGET.maxAnimatedNodes))),
    ).toEqual([]);
  });

  it("counts JS-executor effects toward the same ceiling", () => {
    const mixed = Array.from(
      { length: MOTION_THEME_BUDGET.maxAnimatedNodes + 1 },
      (_, i) =>
        node("heading", `m${i}`, {
          advMotion: i % 2 === 0 ? "count-up" : "scroll-scrub",
        }),
    );
    expect(
      motionBudgetGate(tree(mixed)).some(
        (f) => f.code === "motion.budget.tweens",
      ),
    ).toBe(true);
  });

  it("fails the publish on motion budget breaches — blocking, not advisory", () => {
    const main = Array.from(
      { length: MOTION_THEME_BUDGET.maxAnimatedNodes + 1 },
      (_, i) => node("heading", `p${i}`, { advMotion: "fade" }),
    );
    const gate = gateFor(main);
    expect(gate.ok).toBe(false);
    expect(
      gate.failures.some((f) => f.code === "motion.budget.tweens"),
    ).toBe(true);
    expect(
      gate.warnings.some((w) => w.code.startsWith("motion.budget")),
    ).toBe(false);
  });

  it("skips the budget when no AST is supplied", () => {
    expect(composePublishGate({ tokens: DEFAULT_TOKENS }).ok).toBe(true);
  });
});
