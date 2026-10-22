/**
 * The ONE resolution pipeline.
 *
 * **The subject.** The editor canvas, the theme preview and the published
 * storefront used to answer "what does this template look like?" three
 * different ways:
 *
 *  - the **editor canvas** took the merchant's draft and passed **no**
 *    `themeKey`, so it rendered the platform's generic widget — not the
 *    theme's (the plan's **D1**);
 *  - the **preview** took the theme's source — or the merchant's NEWEST
 *    version row — and **synthesised** a generic body for every template key
 *    the theme did not author (**D3**, **D4**);
 *  - the **storefront** took the published pointer and fell back to the
 *    route's own surface **silently** when the theme declined the template
 *    (**D5**).
 *
 * **This module is the single seam.** A host asks it for a template, in a
 * mode, over a map — and it answers with either a body or an **explicit
 * absent** result. There is no third answer: never a synthesised body,
 * never the homepage.
 *
 * **The three modes, and why they are the only difference.**
 *
 * | mode | the map | who resolves it |
 * | --- | --- | --- |
 * | `draft` | the merchant's autosaved document | the editor canvas |
 * | `published` | the merchant's published pointer | the storefront |
 * | `source` | the theme's own builders | the preview (an anonymous visitor) |
 *
 * The mode is the ONLY thing that changes between the three hosts: the same
 * `(store, template, mode)` resolves the SAME AST on every host, and each
 * mode is LABELLED so a host can say which one the visitor is looking at.
 *
 * Pure data in, one result out: no React, no DOM, no database.
 */
import type {
  TemplateKey,
  ThemeAst,
  ThemeTemplates,
  ThemeTokens,
} from "./builder-ast";
import { EMPTY_AST } from "./builder-ast";
import {
  baseTemplateKey,
  isTemplateVariantKey,
  resolveVariantAst,
  type TemplateVariantKey,
} from "./template-variants";
import { themeRendersBody } from "./theme-body-slot";

/**
 * The three ways a body can be resolved.
 *
 * `draft` — the merchant's autosaved document (the editor canvas).
 * `published` — the merchant's published pointer (the storefront).
 * `source` — the theme's own builders (the preview's anonymous visitor).
 */
export type PipelineMode = "draft" | "published" | "source";

/** The closed mode vocabulary. */
export const PIPELINE_MODES = [
  "draft",
  "published",
  "source",
] as const satisfies readonly PipelineMode[];

/**
 * The human label of each mode.
 *
 * A preview that shows a theme's demo must SAY so, and a storefront that
 * serves a published body must not be mistaken for the merchant's unsaved
 * draft. The labels are distinct: a labelled source that says the same
 * thing for two modes is not labelled.
 */
export const PIPELINE_MODE_LABELS: Record<PipelineMode, string> = {
  draft: "Your unsaved draft",
  published: "The published version",
  source: "The theme's own demo",
};

/** The three hosts. The host is never an input to the RESOLUTION. */
export type PipelineHost = "editor" | "preview" | "storefront";

/** Where a resolved body came from — and how it should be named. */
export type PipelineSource = {
  /** The mode the body was resolved in. */
  mode: PipelineMode;
  /** The mode's human label. */
  label: string;
  /** The host that asked. */
  host: PipelineHost;
  /** The tenant (the store) the body belongs to, when there is one. */
  tenant: string | null;
};

/**
 * The result.
 *
 * `absent` is a FIRST-CLASS outcome: a template the theme does not author
 * resolves to it, and the host renders its own explicit state (the preview's
 * "not supported by this theme" panel, the storefront's named declined
 * frame). It never resolves to the homepage and never to a synthesised body.
 */
export type PipelineResolution =
  | {
      status: "resolved";
      ast: ThemeAst;
      tokens: ThemeTokens | null;
      source: PipelineSource;
    }
  | {
      status: "absent";
      /** Why there is no body — a NAMED reason, never a silent fallback. */
      reason: string;
      source: PipelineSource;
    };

/**
 * The map a host resolves over.
 *
 * A **partial** map on purpose: a template the theme does not author is
 * ABSENT from it, and the resolver says so.
 */
export type PipelineVariants =
  Partial<Record<TemplateKey, ThemeAst>> | Record<string, ThemeAst | undefined>;

/**
 * The one resolver.
 *
 * `(template, variants, tenant, mode)` → a body or an explicit absence.
 *
 * The host is carried in the RESULT (so a host can label what it rendered)
 * and is deliberately NOT an input to the resolution: three hosts asking
 * the same question over the same map get the same answer, always.
 */
export function resolveTemplateForHost({
  template,
  variants,
  tenant = null,
  mode,
  host,
  tokens = null,
}: {
  /** The template being resolved — a base key or a closed variant key. */
  template: TemplateKey | TemplateVariantKey | string;
  /** The map the host resolved over. */
  variants: PipelineVariants;
  /** The tenant (the store) the body belongs to, when there is one. */
  tenant?: string | null;
  /** The mode. The ONLY difference between the three hosts. */
  mode: PipelineMode;
  /** The host asking. */
  host: PipelineHost;
  /** The tokens that go with the map, when the host has them. */
  tokens?: ThemeTokens | null;
}): PipelineResolution {
  const source: PipelineSource = {
    mode,
    label: PIPELINE_MODE_LABELS[mode],
    host,
    tenant,
  };
  const found = findBody(variants, template);
  if (!found) {
    return {
      status: "absent",
      reason:
        "This theme does not author a body for this template, so there is nothing to show here.",
      source,
    };
  }
  return { status: "resolved", ast: found, tokens, source };
}

/**
 * The body for one template — or `null`.
 *
 * A **base** key is looked up DIRECTLY: the platform's own `resolveTemplate`
 * chain ends in "→ index" (the homepage), and the homepage is never a
 * resolution for a template the theme does not author.
 *
 * A **variant** key follows the storefront's own rule: the variant first,
 * then its base (`resolveVariantAst`), and nothing else.
 */
function findBody(
  variants: PipelineVariants,
  template: string,
): ThemeAst | null {
  if (isTemplateVariantKey(template)) {
    const base = baseTemplateKey(template);
    if (!base) return null;
    const suffix = template.slice(template.indexOf("_") + 1);
    const resolved = resolveVariantAst(
      variants as ThemeTemplates,
      base,
      suffix,
    );
    return resolved ? resolved.ast : null;
  }
  const direct = (variants as Record<string, ThemeAst | undefined>)[template];
  return direct ?? null;
}

/**
 * The EDITOR's draft resolution — the canvas's answer, as DATA.
 *
 * The canvas draws the merchant's UNSAVED DRAFT, so it asks the same
 * resolver the preview and the storefront ask, with `mode: "draft"` and the
 * host `editor`. This function is that answer, in one place, so the canvas's
 * behaviour can be exercised as a value (and rendered) instead of read out of
 * the route's source text.
 *
 * **The variant rule is the storefront's rule.** A VARIANT key whose own map
 * entry is absent falls back to its BASE body — the same rule
 * `resolveVariantAst` applies on the storefront (`src/lib/template-variants.ts`).
 * The editor and the storefront therefore agree on what a variant key shows.
 */
export type EditorDraftResolution = {
  /** The body the canvas draws — the EMPTY AST when the draft has none. */
  ast: ThemeAst;
  /** The mode the canvas is in — `draft` whenever a document is loaded. */
  mode: PipelineMode;
  /** The mode's human label, or null when there is no document at all. */
  label: string | null;
  /** True when the draft does not author a body for the requested template. */
  declined: boolean;
  /** The resolver's own source record — null when there is no document. */
  source: PipelineSource | null;
};

/**
 * Resolve the editor's draft for one template.
 *
 * `doc` is the merchant's document (`null` before it loads). An absent
 * template is an EMPTY body — never the homepage, never a synthesised body
 * — and the canvas says so through `declined`.
 */
export function resolveEditorDraft({
  template,
  doc,
  tenant = null,
}: {
  /** The template being resolved — a base key or a closed variant key. */
  template: string;
  /** The merchant's document, or null before it loads. */
  doc: { templates: PipelineVariants; tokens?: ThemeTokens | null } | null;
  /** The theme the document belongs to. */
  tenant?: string | null;
}): EditorDraftResolution {
  if (!doc) {
    return {
      ast: EMPTY_AST,
      mode: "draft",
      label: null,
      declined: false,
      source: null,
    };
  }
  const resolution = resolveTemplateForHost({
    template,
    variants: doc.templates,
    tenant,
    mode: "draft",
    host: "editor",
    tokens: doc.tokens ?? null,
  });
  const ast = resolution.status === "resolved" ? resolution.ast : EMPTY_AST;
  return {
    ast,
    mode: resolution.source.mode,
    label: resolution.source.label,
    declined: !themeRendersBody(
      resolution.status === "resolved" ? resolution.ast : null,
    ),
    source: resolution.source,
  };
}
