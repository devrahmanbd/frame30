import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts builder responsive controls and device visibility states:
 * Invariants:
 * 1. responsive_override_reset_integrity: If an active responsive override is present
 *    in the builder inspector, a reset/inheritance button exists and is clickable.
 * 2. device_visibility_consistency: Elements marked hidden for the active viewport width
 *    do not display (display !== 'none' is false or visibility !== 'hidden').
 */
const responsiveState = extract((state: State) => {
  const doc = state.document;
  const win = state.window;
  const innerWidth = win?.innerWidth ?? 1280;

  if (!doc) {
    return {
      overrideResetIntegrity: true,
      deviceVisibilityConsistency: true,
    };
  }

  // 1. In the studio/builder inspector, if a setting is overridden for the current device,
  // the reset/revert button must be present and wired.
  const overriddenControls = Array.from(
    doc.querySelectorAll("[data-has-override='true'], [data-device-override='true']")
  );
  let overrideResetIntegrity = true;
  for (const ctrl of overriddenControls) {
    const resetButton = ctrl.querySelector(
      "button[aria-label*='Reset'], button[title*='Reset'], [data-action='reset-override']"
    );
    if (!resetButton) {
      overrideResetIntegrity = false;
    }
  }

  // 2. Device visibility consistency across responsive breakpoints:
  let deviceVisibilityConsistency = true;
  const isMobile = innerWidth < 640;
  const isDesktop = innerWidth >= 1024;

  const mobileHiddenElements = Array.from(doc.querySelectorAll("[data-hide-on-mobile='true'], .hide-on-mobile"));
  if (isMobile) {
    for (const el of mobileHiddenElements) {
      const computed = win?.getComputedStyle ? win.getComputedStyle(el) : null;
      if (computed && computed.display !== "none" && computed.visibility !== "hidden" && el.clientHeight > 0) {
        deviceVisibilityConsistency = false;
      }
    }
  }

  const desktopHiddenElements = Array.from(doc.querySelectorAll("[data-hide-on-desktop='true'], .hide-on-desktop"));
  if (isDesktop) {
    for (const el of desktopHiddenElements) {
      const computed = win?.getComputedStyle ? win.getComputedStyle(el) : null;
      if (computed && computed.display !== "none" && computed.visibility !== "hidden" && el.clientHeight > 0) {
        deviceVisibilityConsistency = false;
      }
    }
  }

  return {
    overrideResetIntegrity,
    deviceVisibilityConsistency,
  };
});

export const responsive_override_reset_integrity = always(() => {
  return responsiveState.current.overrideResetIntegrity;
});

export const device_visibility_consistency = always(() => {
  return responsiveState.current.deviceVisibilityConsistency;
});
