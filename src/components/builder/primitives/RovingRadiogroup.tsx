/**
 * Sliders lane — shared arrow-key navigation for `role="radiogroup"` option
 * pickers (size selector, variant chips, shade swatches).
 *
 * Native buttons already tab; this adds the WAI-APG radio pattern (arrows move
 * and select, Home/End jump) so a size or shade can be picked without a
 * pointer. Selection follows focus via the option's own click handler.
 */
import type { KeyboardEvent } from "react";

const NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export function onRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!NAV_KEYS.has(event.key)) return;
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="radio"]:not([disabled])',
    ),
  );
  if (radios.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const at = radios.findIndex((el) => el === active || el.contains(active));
  const index = at === -1 ? 0 : at;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    next = (index + 1) % radios.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    next = (index - 1 + radios.length) % radios.length;
  } else if (event.key === "Home") {
    next = 0;
  } else {
    next = radios.length - 1;
  }
  radios[next]!.focus();
  radios[next]!.click();
}
