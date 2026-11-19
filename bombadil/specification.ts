/**
 * Bombadil Browser Exploration Specification for Frame30
 *
 * Combines default runtime properties (no uncaught exceptions, no unhandled
 * promise rejections, no 5xx responses) with custom responsive, navigation,
 * and fail-closed image decoding and presence integrity properties.
 */
import { defaultActions } from "@antithesishq/bombadil/browser/defaults";
import { weighted, actions } from "@antithesishq/bombadil/browser";
import { await_image_decodes, all_images_loaded } from "./properties/images.ts";

export * from "@antithesishq/bombadil/browser/defaults";
export { no_horizontal_overflow } from "./properties/responsive.ts";
export {
  no_server_error_pages,
  page_has_title_or_heading,
  single_primary_h1,
} from "./properties/navigation.ts";
export { all_images_loaded };

export const customActions = weighted([
  [8, defaultActions],
  [2, actions(() => [await_image_decodes()])],
]);
