/**
 * Shared section factory for authored presets (Phase 10).
 *
 * Both the ten original presets and the four blueprint themes build their AST
 * through this helper so ids stay globally unique and every bilingual prop is
 * filled from a বাংলা dictionary at construction time — a preset can never ship
 * half-translated copy.
 */
import { biTextKeysOf } from "./builder-ast";
import type { Breakpoint, PropValue, Section, SectionType } from "./builder-ast";
import { bnKey } from "./bitext";

export type Extras = { hidden?: Breakpoint[]; bp?: Partial<Record<Breakpoint, Record<string, PropValue>>> };

/** Fills the বাংলা side of every bilingual prop from `dict`. */
export function withBn(
  type: SectionType,
  props: Record<string, PropValue>,
  dict: Record<string, string>,
): Record<string, PropValue> {
  const out = { ...props };
  for (const key of biTextKeysOf(type)) {
    const en = props[key];
    if (typeof en !== "string" || !en.trim()) continue;
    if (typeof out[bnKey(key)] === "string" && String(out[bnKey(key)]).trim()) continue;
    const bn = dict[en];
    if (bn) out[bnKey(key)] = bn;
  }
  return out;
}

let counter = 0;

/** Builds one section with a stable, globally unique id. */
export function makeSection(
  key: string,
  type: SectionType,
  props: Record<string, PropValue>,
  extras: Extras = {},
  dict: Record<string, string> = {},
): Section {
  counter += 1;
  return { id: `${key}-${type.replace(/_/g, "-")}-${counter}`, type, props: withBn(type, props, dict), ...extras };
}

/** Curried factory bound to one preset key and one dictionary. */
export function sectionFactory(dict: Record<string, string>) {
  return (key: string, type: SectionType, props: Record<string, PropValue>, extras: Extras = {}): Section =>
    makeSection(key, type, props, extras, dict);
}