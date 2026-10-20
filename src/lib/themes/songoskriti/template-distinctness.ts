/**
 * The Songoskriti template-distinctness gate — the P1 acceptance gate.
 *
 * **The gate's subject is composition, functional slots and structure — never
 * lint cleanliness.** The platform's own lint (`lintTemplate`,
 * `src/lib/builder-ast.ts:8380`) is a *different* concern, and it was
 * measured on the nine shipped bodies before these rules were written:
 * `index` → **22 warnings** ("no বাংলা translation",
 * `src/lib/builder-ast.ts:8660-8673`), `blog` → 2 warnings, `cart` → **1
 * error** ("More than one widget claims the page `<h1>`",
 * `src/lib/builder-ast.ts:8516-8523`). A rule the gate cannot hold on the
 * bodies it must pass is not a rule the gate gets to have, so this module
 * does **not** import `lintTemplate`: the translation-coverage warnings are
 * the platform's bilingual-content finding (no plan is fixing them), and the
 * double-`<h1>` error is a *composition* defect — fixed in the body that
 * carried it (the cart body) and asserted structurally here by
 * `R7-one-primary-heading`. The lint remains the platform's own publish
 * gate; this is the theme-distinctness gate the expert asked for.
 *
 * **The machinery is theme-agnostic; the table is Songoskriti-specific.**
 * `checkTemplateDistinctness` runs against ANY theme's bodies (read from
 * that theme's own preview source — `peerMainTypes`), and
 * `checkSongoskritiTemplateDistinctness` binds it to Songoskriti's
 * expectations, its documented exceptions and the nine bodies that actually
 * ship (`songoskritiPreviewSource()`, `src/lib/themes/songoskriti/preview.ts:70`).
 *
 * **Two rules state their own scope, because the scope matters.**
 * `R1` rejects a *generic* body: the engine's own demo body, or a
 * heading-led body that carries a generic demo shape **and is missing the
 * template's own composition** (it carries none of the template's required
 * types, or it misses a required functional slot). The demo shapes are read
 * **per template** — a shape the template's row *requires* (`product_rail`
 * on `index`) is never treated as a demo shape — and the composition clause
 * is never vacuous, so the next legitimate change (opening the homepage
 * with an editorial heading) passes the gate it must pass.
 * `R7` counts the `<h1>` claimants of the **body** under test; the platform
 * counts the whole AST (`src/lib/builder-ast.ts:8496-8514` flattens
 * header + main + footer) — the two are equal today (the chrome is an empty
 * header and a `footer_sitemap` + `rich_text` footer, both `heading: false`
 * in the catalogue), and the finding says so in its own message.
 *
 * The checker is a pure function over `(template, body)`: no React, no
 * filesystem, no network.
 */
import {
  TEMPLATE_KEYS,
  catalogEntry,
  flattenSections,
  primarySectionId,
  type Section,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
} from "../../builder-ast";
import {
  genericDemoMain,
  type PreviewThemeSource,
} from "../../theme-preview-nav";
import { songoskritiPreviewSource } from "./preview";

/* ------------------------------------------------------------------- rules */

/**
 * The seven rule ids the gate enforces. **None of them is a lint rule** — the
 * gate's subject is composition, slots and structure (see the header).
 */
export const SONOSKRITI_DISTINCTNESS_RULES = [
  "R1-not-generic",
  "R2-theme-composition",
  "R3-functional-slots",
  "R4-no-demo-copy",
  "R5-no-forbidden-types",
  "R6-distinct-across-templates",
  "R7-one-primary-heading",
] as const;

export type DistinctnessRuleId = (typeof SONOSKRITI_DISTINCTNESS_RULES)[number];

/* ----------------------------------------------------------- the vocabulary */

/** The expectation for one template. */
export type TemplateExpectation = {
  /** the theme-owned composition the surface must have */
  requiredTypes: readonly SectionType[];
  /** the functional data slots the surface must carry */
  requiredSlots: readonly SectionType[];
  /** the generic shapes the surface must not have */
  forbiddenTypes: readonly SectionType[];
};

/** A documented approved exception — a reason and what it rests on. */
export type ApprovedException = {
  /** why the template is exempt from a theme-owned presentation */
  reason: string;
  /** what the exemption rests on — a decision or a `file:line` */
  basis: string;
};

/** One finding of the gate. */
export type DistinctnessIssue = {
  rule: DistinctnessRuleId;
  template: TemplateKey;
  message: string;
  sectionId: string | null;
  details: string[];
  /**
   * The documented exception consulted by `R2`/`R3` — the only two rules that
   * consult it. An exception never *suppresses* a finding: it rides along
   * with it, so a reader can tell an approved exception from a loophole.
   */
  exception: ApprovedException | null;
};

/** The body under test — the template's main zone. */
export type TemplateBody = { main: readonly Section[] };

/* --------------------------------------------------- the per-template table */

/**
 * One entry per `TEMPLATE_KEYS` member — a table that quietly drops a
 * template is a gate that quietly stops guarding it, so the gate's own suite
 * asserts the table is total.
 *
 * The `search` row declares the six platform search widgets as **required
 * slots** (they are the surface's functional data slots). `product_grid` is
 * deliberately **not** one of them: it is not a context widget — it takes the
 * host's `productSlot` (`src/components/builder/widgets.tsx:87`, `:1447`,
 * `:1491`) — so `R3` cannot require it. The `cart` row forbids
 * `product_rail`: the cart is a commerce surface, and the demo "you may also
 * like" rail is the generic shape the legacy cart body is rejected for.
 */
export const SONOSKRITI_TEMPLATE_EXPECTATIONS: Record<
  TemplateKey,
  TemplateExpectation
> = {
  index: {
    requiredTypes: ["hero_carousel", "product_rail", "collection_story"],
    requiredSlots: [],
    forbiddenTypes: [],
  },
  product: {
    requiredTypes: ["heading", "columns", "rich_text"],
    requiredSlots: [
      "product_media",
      "price_block",
      "add_to_cart",
      "product_meta",
    ],
    forbiddenTypes: [],
  },
  collection: {
    requiredTypes: ["category_header", "result_toolbar", "product_grid"],
    requiredSlots: [],
    forbiddenTypes: [],
  },
  account: {
    requiredTypes: ["heading", "profile_card", "orders_list"],
    requiredSlots: ["profile_card", "orders_list"],
    forbiddenTypes: [],
  },
  page: {
    requiredTypes: ["breadcrumb", "page_content"],
    requiredSlots: ["page_content"],
    forbiddenTypes: ["heading", "rich_text"],
  },
  blog: {
    requiredTypes: ["blog_terms", "blog_archive", "blog_pager"],
    requiredSlots: ["blog_archive", "blog_terms", "blog_pager"],
    forbiddenTypes: ["rich_text", "image"],
  },
  cart: {
    requiredTypes: ["heading", "columns"],
    requiredSlots: ["cart_lines", "cart_summary"],
    forbiddenTypes: ["product_rail"],
  },
  checkout: {
    requiredTypes: ["heading", "checkout_steps", "columns"],
    requiredSlots: ["payment_methods", "cart_summary", "checkout_steps"],
    forbiddenTypes: ["rich_text"],
  },
  search: {
    requiredTypes: [
      "category_header",
      "result_toolbar",
      "facet_sidebar",
      "filter_chips",
      "product_grid",
      "pagination",
      "empty_state",
    ],
    requiredSlots: [
      "category_header",
      "result_toolbar",
      "facet_sidebar",
      "filter_chips",
      "pagination",
      "empty_state",
    ],
    forbiddenTypes: ["rich_text", "heading"],
  },
};

/* -------------------------------------------- the documented exceptions */

/**
 * The approved exceptions — a map `template → { reason, basis }`, consulted
 * by `R2`/`R3` only. Each one names the decision or the `file:line` it
 * rests on, so a reader can tell an approved exception from a loophole.
 */
export const SONOSKRITI_APPROVED_EXCEPTIONS: Partial<
  Record<TemplateKey, ApprovedException>
> = {
  page: {
    reason:
      "the route owns the body: `page_content` is the shared slot the CMS page route and the CMS-designated homepage flow the merchant's real content through (`src/components/store/PageView.tsx:216`, `src/components/store/StoreHomepage.tsx:120`). The theme's contribution is the slot choice and the breadcrumb — a genuinely shared surface, so the gate requires the slots, forbids a heading and forbids demo copy (`R4`, the one template where copy could impersonate the merchant's record), and does not require a theme-owned presentation.",
    basis:
      "`src/components/store/PageView.tsx:216` and `src/components/store/StoreHomepage.tsx:120` — the two `page_content` grants.",
  },
  checkout: {
    reason:
      "the platform owns checkout: the production route renders its own hand-built form and discards the theme's AST (`src/routes/store.$slug.checkout.tsx:415-421`, Decision **D2**). The template's contribution is the composition of platform-owned commerce widgets; no theme-owned checkout presentation exists, so the gate requires the slots and the platform-only widget set, and does not require a theme-owned section type.",
    basis:
      "Decision **D2** — the production checkout route renders its own hand-built form and discards the theme's AST (`src/routes/store.$slug.checkout.tsx:415-421`).",
  },
  blog: {
    reason:
      "the storefront blog is themeless by design (`src/components/store/BlogArchiveTheme.tsx:1-9`, pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`, Decision **D5**). The template is a preview surface until D5 is ruled; the gate therefore requires the pack sections and does not require a storefront render path.",
    basis:
      "Decision **D5** — the storefront reader blog is themeless by design (`src/components/store/BlogArchiveTheme.tsx:1-9`, pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`).",
  },
  search: {
    reason:
      'the six per-widget search sections are context widgets whose permission the host grants (`src/components/builder/SectionRenderer.tsx:814-833`); on a host that does not grant it they render nothing. The storefront grants five of them — `result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header` — and `facet_sidebar` stays **preview-only**, because its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`) and no storefront route mounts a `WidgetDataProvider` (Decision **D7**). The gate requires the six sections in the composition and their catalogue allowlist, and does not require them to render on every host (Decisions **D6** — ruled, State B — and **D7**).',
    basis:
      "Decisions **D6** (ruled, State B) and **D7** — the storefront grants five of the six search widgets and `facet_sidebar` stays preview-only (`src/lib/widget-registry.ts:483-503`).",
  },
};

/* ------------------------------------------------------- the legacy fixtures */

/**
 * The four pre-Phase-2 bodies this plan replaces, quoted verbatim from the
 * freeze pin (`src/components/builder/songoskriti-port-freeze.test.tsx:107-110`),
 * plus the engine's **generic demo body** (`genericDemoMain`,
 * `src/lib/theme-preview-nav.ts:357-373`), which every template would get if
 * the theme authored nothing.
 *
 * The other five templates are deliberately **not** fixtures: this plan does
 * not change the composition of `index`, `product`, `collection`, `account` or
 * `page`, and the gate must **pass** those, not reject them.
 */
export const SONOSKRITI_LEGACY_COMPOSITIONS: Record<string, readonly string[]> =
  {
    blog: ["heading", "image", "rich_text"],
    cart: ["heading", "columns", "product_rail"],
    checkout: ["heading", "columns"],
    search: ["heading", "rich_text", "product_rail"],
    generic: ["heading", "rich_text"],
  };

/* --------------------------------------------------------------- machinery */

/** The plain builder the engine uses (`src/lib/theme-preview-nav.ts:384`). */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/**
 * The engine's generic demo sections — the shapes a "demo" body is made of.
 * `genericDemoMain` builds `["heading","rich_text"]` for every template
 * (`src/lib/theme-preview-nav.ts:357-373`).
 *
 * The set is consulted **template-aware** (see `templateDemoSections`): a
 * type the template's own row *requires* is not a demo shape for that
 * template.
 */
const GENERIC_DEMO_SECTIONS = ["rich_text", "product_rail"] as const;

/**
 * The generic demo sections **for one template** — the engine's generic
 * shapes minus the ones that template's own row requires.
 *
 * `product_rail` is a required type on `index`, so a rail on the homepage is
 * the theme's own composition, not a demo shape: treating it as one would
 * make the expectation table self-contradictory — the row would require the
 * very shape the rule rejects.
 */
function templateDemoSections(
  expectation: TemplateExpectation,
): readonly SectionType[] {
  return GENERIC_DEMO_SECTIONS.filter(
    (type) => !expectation.requiredTypes.includes(type),
  );
}

/** The retired demo strings (the copy Phase 1 removed). */
export const SONOSKRITI_RETIRED_DEMO_STRINGS = [
  "Demo search",
  "Meet the makers",
  "Size guide",
  "How to measure",
  "Demo article",
  "Demo story",
] as const;

/**
 * The `page` body is the one surface whose copy would **impersonate the
 * merchant's CMS record** — the defect Phase 1 removed. The expert's bar is
 * *"demo data is realistic and explicitly labelled"*, so **labelled** demo
 * copy is acceptable elsewhere; `R4` therefore applies to the `page`
 * template ONLY.
 */
export const SONOSKRITI_DEMO_COPY_TEMPLATE: TemplateKey = "page";

/**
 * True when a heading-capable widget was authored with an explicitly blank
 * heading in every language — it renders no title, so it claims no `<h1>`.
 *
 * A **mirror** of the platform's private `blankHeading`
 * (`src/lib/builder-ast.ts:8301-8313`): the platform does not export it and
 * `src/lib/builder-ast.ts` is port spec §7-prohibited, so the gate carries
 * its own copy and cites the lines it mirrors.
 */
function blankHeading(section: Section): boolean {
  if (!("heading" in section.props)) return false;
  const value = section.props["heading"];
  if (typeof value === "string") return value.trim() === "";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const bag = value as unknown as Record<string, unknown>;
    const parts = ["en", "bn"].map((k) =>
      typeof bag[k] === "string" ? (bag[k] as string).trim() : "",
    );
    return parts.every((part) => part === "");
  }
  return false;
}

/**
 * The body's `<h1>` claimants, counted with the platform's own accounting,
 * **exactly** (`src/lib/builder-ast.ts:8496-8514`): the `heading` widget type
 * is skipped entirely (`:8500-8504` — the `heading` section *is* the primary,
 * so it is never a second claimant), and every other catalogue widget with
 * `heading: true` counts unless its `heading` prop is deliberately blank
 * (`:8506-8513`).
 *
 * **KNOWN LIMIT — the count is over the BODY under test.** The platform
 * counts the **whole AST** — it flattens header + main + footer
 * (`src/lib/builder-ast.ts:8496-8514`). The two counts are equal today:
 * measured, the theme's chrome is an **empty header** (the storefront's
 * `StoreHeader` renders the masthead — `src/lib/themes/songoskriti/header.ts:17-19`)
 * and a footer of `footer_sitemap` + `rich_text`, both `heading: false` in
 * the catalogue — so the chrome contributes no claimant. A future
 * heading-capable chrome widget would make the platform's count one higher
 * than this one; the `R7` finding states the scope in its own message so it
 * cannot be missed.
 */
export function countPrimaryHeadingClaimants(
  sections: readonly Section[],
): string[] {
  const claimants: string[] = [];
  for (const section of flattenSections([...sections])) {
    const entry = catalogEntry(section.type);
    if (!entry) continue;
    if (section.type === "heading") continue;
    if (!entry.heading) continue;
    if (blankHeading(section)) continue;
    claimants.push(section.id);
  }
  return claimants;
}

/**
 * The compound demo markers — `DemoPage`, `demo_page`, `demoMode` — that a
 * word-boundary match misses. The brief's wording is a literal `"Demo"`
 * marker, so the gate matches `/demo/i` on every prop **key** and every prop
 * **value** (a nested object value is matched on its serialised form).
 */
function demoMarkerInProps(sections: readonly Section[]): string[] {
  const found: string[] = [];
  for (const section of sections) {
    for (const [key, value] of Object.entries(section.props)) {
      if (/demo/i.test(key)) found.push(`prop key "${key}"`);
      if (typeof value === "string") {
        if (/demo/i.test(value)) found.push(`prop "${key}" = "${value}"`);
      } else if (value && typeof value === "object") {
        const text = JSON.stringify(value);
        if (/demo/i.test(text)) found.push(`prop "${key}" = ${text}`);
      }
    }
  }
  return found;
}

/** The gate's inputs — the machinery is theme-agnostic. */
export type DistinctnessGate = {
  /** the per-template expectations */
  expectations: Partial<Record<TemplateKey, TemplateExpectation>>;
  /**
   * The main types of every OTHER template the theme ships — read from the
   * theme's own preview source, so `R6` compares a body against what
   * actually ships, not against a hand-kept table.
   */
  peerMainTypes: (template: TemplateKey) => readonly string[] | null;
  /** the documented exceptions, consulted by `R2`/`R3` */
  exceptions?: Partial<Record<TemplateKey, ApprovedException>>;
  /** the template whose copy must carry no demo marker (`R4`) */
  demoCopyTemplate?: TemplateKey;
};

const EMPTY_EXPECTATION: TemplateExpectation = {
  requiredTypes: [],
  requiredSlots: [],
  forbiddenTypes: [],
};

/**
 * The gate itself — a pure function over `(template, body, gate)`.
 *
 * `R1` — the body must not be a **generic demo body**. Two shapes qualify:
 * **(a)** the engine's own generic body (`genericDemoMain`), and **(b)** a
 * *heading-led* body — its first section is a `heading` widget — that
 * carries at least one of the engine's generic demo sections **and is
 * missing the template's own composition**.
 *
 * The demo set is **template-aware**: a shape the template's row *requires*
 * is not a demo shape for it (`product_rail` is a required type on `index`).
 *
 * The composition clause is the **types+slots** clause — the body carries
 * none of the template's required types, **or** misses a required
 * functional slot. It is deliberately not a slots-only clause: that clause
 * was vacuous for the two slot-less templates (`index`, `collection`), so
 * any heading-led body carrying a rail tripped the rule, and the next
 * legitimate change — opening the homepage with an editorial heading —
 * would have been rejected by the gate it is supposed to pass.
 */
export function checkTemplateDistinctness(
  template: TemplateKey,
  body: TemplateBody,
  gate: DistinctnessGate,
): DistinctnessIssue[] {
  const main = [...body.main];
  const mainTypes = main.map((section) => section.type);
  const flat = flattenSections(main);
  const typeSet = new Set(flat.map((section) => section.type));
  const expectation = gate.expectations[template] ?? EMPTY_EXPECTATION;
  const exception = gate.exceptions?.[template] ?? null;
  const issues: DistinctnessIssue[] = [];

  /* R1 — the body must not be a generic demo body. */
  const genericTypes = genericDemoMain(template, plainBuilder()).map(
    (section) => section.type,
  );
  const isGenericBody =
    mainTypes.length === genericTypes.length &&
    mainTypes.every((type, index) => type === genericTypes[index]);
  const headingLed = mainTypes[0] === "heading";
  const demoSections = templateDemoSections(expectation).filter((type) =>
    typeSet.has(type),
  );
  /* The composition clause — never vacuous. A template that declares no
   * required composition (the gate is not configured for it) has nothing to
   * be missing, so the clause cannot fire there. */
  const declaresComposition =
    expectation.requiredTypes.length > 0 ||
    expectation.requiredSlots.length > 0;
  const carriesNoRequiredType =
    expectation.requiredTypes.length > 0 &&
    expectation.requiredTypes.every((type) => !typeSet.has(type));
  const missingSlots = expectation.requiredSlots.filter(
    (type) => !typeSet.has(type),
  );
  const compositionMissing =
    declaresComposition && (carriesNoRequiredType || missingSlots.length > 0);
  if (isGenericBody) {
    issues.push({
      rule: "R1-not-generic",
      template,
      message: `the ${template} body IS the engine's generic demo body (${genericTypes.join(", ")}) — a theme must author its own composition`,
      sectionId: null,
      details: [`generic body: ${genericTypes.join(", ")}`],
      exception: null,
    });
  } else if (headingLed && demoSections.length > 0 && compositionMissing) {
    const compositionGaps: string[] = [];
    if (carriesNoRequiredType) {
      compositionGaps.push(
        `carries none of its required types (${expectation.requiredTypes.join(", ")})`,
      );
    }
    if (missingSlots.length > 0) {
      compositionGaps.push(
        `misses a required functional slot (${missingSlots.join(", ")})`,
      );
    }
    issues.push({
      rule: "R1-not-generic",
      template,
      message: `the ${template} body is heading-led and carries the generic demo section(s) ${demoSections.join(", ")} but not the template's own composition — a generic heading-plus-demo-rail layout must never pass`,
      sectionId: null,
      details: [
        `heading-led: ${mainTypes.join(", ")}`,
        `generic demo section(s): ${demoSections.join(", ")}`,
        ...compositionGaps,
      ],
      exception: null,
    });
  }

  /* R2 — every required type must be present in the (recursive) body. */
  const missingTypes = expectation.requiredTypes.filter(
    (type) => !typeSet.has(type),
  );
  if (missingTypes.length > 0) {
    issues.push({
      rule: "R2-theme-composition",
      template,
      message: `the ${template} body is missing ${missingTypes.length} of the theme-owned types its surface must carry`,
      sectionId: null,
      details: missingTypes.map((type) => `missing required type: ${type}`),
      exception,
    });
  }

  /* R3 — every required slot must be present, be a context widget, and be
   * granted on this very template. */
  const slotDetails: string[] = [];
  for (const slot of expectation.requiredSlots) {
    if (!typeSet.has(slot)) {
      slotDetails.push(`missing required slot: ${slot}`);
      continue;
    }
    const allowlist = catalogEntry(slot)?.templates ?? [];
    if (allowlist.length === 0) {
      slotDetails.push(
        `required slot ${slot} is not a context widget — its catalogue entry carries no "templates" allowlist, so no host can feed it`,
      );
      continue;
    }
    if (!allowlist.includes(template)) {
      slotDetails.push(
        `required slot ${slot} is not granted on the ${template} template — its catalogue allowlist is [${allowlist.join(", ")}]`,
      );
    }
  }
  if (slotDetails.length > 0) {
    issues.push({
      rule: "R3-functional-slots",
      template,
      message: `the ${template} body does not carry the functional data slots its surface needs`,
      sectionId: null,
      details: slotDetails,
      exception,
    });
  }

  /* R4 — the demo-copy rule, on the ONE template whose copy would
   * impersonate the merchant's record. */
  if (gate.demoCopyTemplate === template) {
    const serialised = JSON.stringify(flat.map((section) => section.props));
    const hits: string[] = [];
    for (const retired of SONOSKRITI_RETIRED_DEMO_STRINGS) {
      if (serialised.includes(retired)) {
        hits.push(`retired demo copy: "${retired}"`);
      }
    }
    if (/\bdemo\b/i.test(serialised)) {
      hits.push(`a "Demo" marker in the ${template} body`);
    } else {
      // The compound forms a word boundary misses — `DemoPage`, `demo_page`.
      const compound = demoMarkerInProps(flat);
      if (compound.length > 0) {
        hits.push(
          `a "Demo" marker in the ${template} body: ${compound.join("; ")}`,
        );
      }
    }
    if (hits.length > 0) {
      issues.push({
        rule: "R4-no-demo-copy",
        template,
        message: `the ${template} body carries demo copy — it would impersonate the merchant's CMS record`,
        sectionId: null,
        details: hits,
        exception: null,
      });
    }
  }

  /* R5 — the generic shapes the surface must not have. */
  const forbidden = expectation.forbiddenTypes.filter((type) =>
    typeSet.has(type),
  );
  if (forbidden.length > 0) {
    issues.push({
      rule: "R5-no-forbidden-types",
      template,
      message: `the ${template} body carries ${forbidden.length} forbidden generic shape(s)`,
      sectionId: null,
      details: forbidden.map((type) => `forbidden type: ${type}`),
      exception: null,
    });
  }

  /* R6 — the body must differ from every OTHER template's body. */
  for (const other of TEMPLATE_KEYS) {
    if (other === template) continue;
    const peer = gate.peerMainTypes(other);
    if (!peer || peer.length === 0) continue;
    if (
      peer.length === mainTypes.length &&
      peer.every((type, index) => type === mainTypes[index])
    ) {
      issues.push({
        rule: "R6-distinct-across-templates",
        template,
        message: `the ${template} body duplicates the ${other} body — two templates with the same composition are not two templates`,
        sectionId: null,
        details: [`duplicate of: ${other}`],
        exception: null,
      });
    }
  }

  /* R7 — at most one primary heading. */
  const claimants = countPrimaryHeadingClaimants(main);
  if (claimants.length > 1) {
    const primary = primarySectionId({ header: [], main, footer: [] });
    issues.push({
      rule: "R7-one-primary-heading",
      template,
      message: `the ${template} body has ${claimants.length} <h1> claimants — a page has one primary heading (count scope: the BODY under test; the platform counts the whole AST — header + main + footer — whose chrome contributes no claimant today)`,
      sectionId: claimants[1] ?? null,
      details: [
        ...claimants.map((id) => `claims the page <h1>: ${id}`),
        `primary section: ${primary ?? "none"}`,
        "count scope: the body under test (the platform counts the whole AST — header + main + footer)",
      ],
      exception: null,
    });
  }

  return issues;
}

/* ----------------------------------------------- the Songoskriti binding */

let songoskritiSource: ReturnType<typeof songoskritiPreviewSource> | null =
  null;

function source(): ReturnType<typeof songoskritiPreviewSource> {
  if (!songoskritiSource) songoskritiSource = songoskritiPreviewSource();
  return songoskritiSource;
}

/**
 * The peer reader for **any** theme: it reads that theme's own preview
 * source, so `R6` compares a body against what that theme actually ships.
 * A template the theme does not author yields `null` — it has no theme-owned
 * body to be distinct from (the engine synthesises the generic demo body for
 * it, `assemblePreviewTemplates`, `src/lib/theme-preview-nav.ts:400`, and
 * `R1` is the rule that rejects that shape).
 */
export function previewSourceMainTypes(
  themeSource: PreviewThemeSource,
): (template: TemplateKey) => readonly string[] | null {
  return (template) => {
    const main = themeSource.main(template, plainBuilder());
    return main ? main.map((section) => section.type) : null;
  };
}

/**
 * The main types of the Songoskriti body that **ships** for `template` —
 * read from the theme's own preview source (`preview.ts:70`), so `R6`
 * compares a body against what actually ships.
 *
 * A template the theme does **not** author has no theme-owned body to be
 * distinct from: the engine synthesises the generic demo body for it
 * (`assemblePreviewTemplates`, `src/lib/theme-preview-nav.ts:400`), and `R1`
 * is the rule that rejects that shape. So the peer set is the theme's
 * **authored** bodies.
 */
export function songoskritiMainTypes(template: TemplateKey): readonly string[] {
  const main = source().main(template, plainBuilder());
  return main ? main.map((section) => section.type) : [];
}

/** The gate, bound to Songoskriti. */
export function songoskritiDistinctnessGate(): DistinctnessGate {
  return {
    expectations: SONOSKRITI_TEMPLATE_EXPECTATIONS,
    peerMainTypes: (template) => songoskritiMainTypes(template),
    exceptions: SONOSKRITI_APPROVED_EXCEPTIONS,
    demoCopyTemplate: SONOSKRITI_DEMO_COPY_TEMPLATE,
  };
}

/**
 * The Songoskriti gate: check one template's body against the table, the
 * documented exceptions and the nine bodies that ship.
 */
export function checkSongoskritiTemplateDistinctness(
  template: TemplateKey,
  body: TemplateBody,
): DistinctnessIssue[] {
  return checkTemplateDistinctness(
    template,
    body,
    songoskritiDistinctnessGate(),
  );
}
