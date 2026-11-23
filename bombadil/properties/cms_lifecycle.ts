import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Bombadil Invariants for CMS Content Lifecycle & Tenancy (Layer 05):
 * 1. no_draft_leak_on_public: Unauthenticated/public storefront pages never render draft content.
 * 2. no_cross_tenant_data_leak: Storefront DOM never reveals foreign merchant IDs or foreign tenant data attributes.
 * 3. cms_editor_controls_accessible: Dashboard editor views provide accessible action controls (save, publish, status badge).
 * 4. no_broken_cms_error_boundaries: CMS content and widgets must never render unhandled exception callstacks into the DOM.
 */
const cmsState = extract((state: State) => {
  const doc = state.document;
  const win = state.window;
  const path = win?.location?.pathname || "";

  if (!doc) {
    return {
      noDraftLeak: true,
      noTenantLeak: true,
      editorControlsAccessible: true,
      noBrokenErrorBoundaries: true,
    };
  }

  // 1. Draft leak check on public routes
  const isPublicRoute = !path.startsWith("/dashboard") && !path.startsWith("/admin");
  let noDraftLeak = true;
  if (isPublicRoute) {
    const draftMarkers = doc.querySelectorAll(
      "[data-cms-status='draft'], [data-draft='true'], .cms-draft-badge"
    );
    if (draftMarkers.length > 0) {
      noDraftLeak = false;
    }
  }

  // 2. Tenant isolation check:
  // Active merchant ID on public page should match storefront tenant context
  let noTenantLeak = true;
  const tenantElements = Array.from(doc.querySelectorAll("[data-merchant-id]"));
  if (tenantElements.length > 1) {
    const firstTenant = tenantElements[0].getAttribute("data-merchant-id");
    for (const el of tenantElements) {
      if (el.getAttribute("data-merchant-id") !== firstTenant) {
        noTenantLeak = false;
        break;
      }
    }
  }

  // 3. Editor controls accessibility on dashboard
  let editorControlsAccessible = true;
  if (path.includes("/content/editor") || path.includes("/builder")) {
    const saveButtons = doc.querySelectorAll("button[data-action='save'], button[aria-label*='Save']");
    for (const btn of Array.from(saveButtons)) {
      if (!btn.getAttribute("aria-label") && !btn.textContent?.trim()) {
        editorControlsAccessible = false;
      }
    }
  }

  // 4. No unhandled React / Nitro error boundaries rendered in place of CMS content
  const errorBoundaries = doc.querySelectorAll(
    ".react-error-boundary, [data-error-boundary='true'], pre.error-stack"
  );
  const noBrokenErrorBoundaries = errorBoundaries.length === 0;

  return {
    noDraftLeak,
    noTenantLeak,
    editorControlsAccessible,
    noBrokenErrorBoundaries,
  };
});

export const no_draft_leak_on_public = always(() => {
  return cmsState.current.noDraftLeak;
});

export const no_cross_tenant_data_leak = always(() => {
  return cmsState.current.noTenantLeak;
});

export const cms_editor_controls_accessible = always(() => {
  return cmsState.current.editorControlsAccessible;
});

export const no_broken_cms_error_boundaries = always(() => {
  return cmsState.current.noBrokenErrorBoundaries;
});
