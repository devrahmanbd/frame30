/**
 * Bombadil Browser Exploration Specification for Frame30
 *
 * Combines default runtime properties (no uncaught exceptions, no unhandled
 * promise rejections, no 5xx responses) with custom responsive, navigation,
 * and fail-closed image decoding and presence integrity properties.
 */
export * from "@antithesishq/bombadil/browser/defaults";
export { no_horizontal_overflow } from "./properties/responsive.ts";
export {
  no_server_error_pages,
  page_has_title_or_heading,
  single_primary_h1,
} from "./properties/navigation.ts";
export { all_images_loaded } from "./properties/images.ts";
export {
  no_duplicate_active_collection_rail,
  intentional_cross_sell_preserved,
  unique_product_cards,
} from "./properties/collections.ts";
export {
  responsive_override_reset_integrity,
  device_visibility_consistency,
} from "./properties/builder_responsive.ts";
export {
  no_draft_leak_on_public,
  no_cross_tenant_data_leak,
  cms_editor_controls_accessible,
  no_broken_cms_error_boundaries,
} from "./properties/cms_lifecycle.ts";

