import type { PropValue, Section, SectionType } from "../../builder-ast";
import type { Extras } from "../../theme-section";

/** Bound section builder: `s(type, props, extras?)`. Factory is bound to the
 *  preset key + BLUEPRINT_BN dict by the assembler (index.ts). */
export type SectionBuilder = (
  type: SectionType,
  props: Record<string, PropValue>,
  extras?: Extras,
) => Section;
