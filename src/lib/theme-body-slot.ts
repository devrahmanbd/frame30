/**
 * Which path does a themed route render through?
 *
 * A route may name the context section its body flows through
 * (`page_content` for authored pages). The theme's main renders only when it
 * declares that section — otherwise the theme's demo copy would swallow the
 * body the route owns, and the route's own fallback renders instead.
 *
 * This predicate is the SINGLE source of truth for that choice. The theme
 * host (`ThemeChrome`) asks it whether the theme renders the body, and the
 * route hosts that lay the page out around that body — `PageView`, whose
 * container must know whether the nav is a sibling column or part of the
 * content — ask it the SAME question. One expression, so the theme's choice
 * and the host's layout can never disagree.
 *
 * Pure data in, one boolean out: no React, no DOM, no DB.
 */
import type { SectionType, ThemeAst } from "./builder-ast";

/**
 * True when the THEME renders the route's body for this template.
 *
 *  - no theme AST, or an empty theme main: the route's fallback renders;
 *  - a route that names no content slot: any theme main renders (the legacy
 *    behavior for cart, checkout, search);
 *  - otherwise: the theme main renders only when it declares the route's
 *    content slot, and a slot section that failed validation (`invalid`)
 *    does not count — the theme does not render the body through a section
 *    the renderer would refuse to draw.
 */
export function themeRendersBody(
  ast: ThemeAst | null,
  contentSlot?: SectionType,
): boolean {
  if (!ast || ast.main.length === 0) return false;
  if (!contentSlot) return true;
  return ast.main.some(
    (section) => !section.invalid && section.type === contentSlot,
  );
}
