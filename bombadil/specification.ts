/**
 * Bombadil Browser Exploration Specification for Frame30
 *
 * Combines default runtime properties (no uncaught exceptions, no unhandled
 * promise rejections, no 5xx responses) with custom responsive and
 * storefront correctness properties.
 */
export * from "@antithesishq/bombadil/browser/defaults";
export { no_horizontal_overflow } from "./properties/responsive.ts";
export {
  no_server_error_pages,
  page_has_title_or_heading,
  single_primary_h1,
} from "./properties/navigation.ts";
