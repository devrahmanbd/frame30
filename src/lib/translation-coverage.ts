/**
 * Phase 3.3 — বাংলা translation completeness.
 *
 * Walks every template of a theme and classifies each bilingual pair with the
 * same `biTextState` the publish lint uses, so the meter in the studio and the
 * blocking lint can never disagree.
 */
import { biTextKeysOf, catalogEntry, TEMPLATE_KEYS, type Section, type TemplateKey, type ThemeTemplates } from "./builder-ast";
import { biTextState, readBiText, type BiTextState } from "./bitext";

export type CoverageRef = {
  template: TemplateKey;
  sectionId: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
  state: Exclude<BiTextState, "ok">;
};

export type CoverageStats = {
  total: number;
  ok: number;
  fallback: number;
  empty: number;
  /** 0–100; a theme with no bilingual copy at all counts as complete. */
  percent: number;
};

export type CoverageReport = CoverageStats & {
  byTemplate: Partial<Record<TemplateKey, CoverageStats>>;
  worst: CoverageRef[];
};

function blank(): CoverageStats & { refs: CoverageRef[] } {
  return { total: 0, ok: 0, fallback: 0, empty: 0, percent: 100, refs: [] };
}

function percentOf(stats: { total: number; ok: number }): number {
  return stats.total === 0 ? 100 : Math.round((stats.ok / stats.total) * 100);
}

function walk(
  nodes: Section[],
  template: TemplateKey,
  acc: CoverageStats & { refs: CoverageRef[] },
): void {
  for (const node of nodes) {
    const entry = catalogEntry(node.type);
    for (const key of biTextKeysOf(node.type)) {
      const state = biTextState(readBiText(node.props, key));
      acc.total += 1;
      if (state === "ok") {
        acc.ok += 1;
        continue;
      }
      if (state === "fallback") acc.fallback += 1;
      else acc.empty += 1;
      acc.refs.push({
        template,
        sectionId: node.id,
        sectionLabel: entry?.label ?? node.type,
        fieldKey: key,
        fieldLabel: entry?.fields.find((field) => field.key === key)?.label ?? key,
        state,
      });
    }
    if (node.children?.length) walk(node.children, template, acc);
  }
}

export function coverageOfTemplate(template: TemplateKey, ast: { header: Section[]; main: Section[]; footer: Section[] }) {
  const acc = blank();
  walk([...ast.header, ...ast.main, ...ast.footer], template, acc);
  acc.percent = percentOf(acc);
  return acc;
}

export function translationCoverage(templates: ThemeTemplates): CoverageReport {
  const byTemplate: Partial<Record<TemplateKey, CoverageStats>> = {};
  const totals = blank();

  for (const key of TEMPLATE_KEYS) {
    const ast = templates[key];
    if (!ast) continue;
    const stats = coverageOfTemplate(key, ast);
    if (stats.total === 0) continue;
    const { refs, ...rest } = stats;
    byTemplate[key] = rest;
    totals.total += stats.total;
    totals.ok += stats.ok;
    totals.fallback += stats.fallback;
    totals.empty += stats.empty;
    totals.refs.push(...refs);
  }

  totals.percent = percentOf(totals);
  // Missing English first: it blocks publishing, বাংলা fallback only warns.
  const worst = totals.refs
    .slice()
    .sort((a, b) => (a.state === b.state ? 0 : a.state === "empty" ? -1 : 1))
    .slice(0, 20);

  const { refs: _refs, ...stats } = totals;
  return { ...stats, byTemplate, worst };
}
