/**
 * Demo page fixture for the theme preview's `?template=page` tab.
 *
 * `page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`),
 * so the host hands it a React node — the preview's only slot source,
 * `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`),
 * returns `undefined` for every template but `product` (`:309`), which left the
 * fixed page template rendering chrome with an empty body.
 *
 * The payload mirrors the shape the production CMS page route builds
 * (`src/components/store/PageView.tsx:73-110`): the record's title, its
 * excerpt, the rendered body html and the last-updated stamp. The copy is
 * DEMO copy and says so — the same contract as "Demo Shopper"
 * (`src/lib/preview-demo-data.ts:42`) and "Sample product"
 * (`src/components/builder/CartContext.tsx:95`). It never pretends to be a
 * real merchant page.
 */
import type { StorePage } from "./storefront-search.server";

/**
 * The fields the production page payload carries (`PageView.tsx:73-110`):
 * three fields of the production page record plus the route's rendered html.
 * Typing the fixture as a `Pick` of `StorePage` makes it drift with the
 * record — if the route's page row renames or drops one of those fields, this
 * module stops typechecking and the plan's `tsgo --noEmit` gate fails.
 */
export type PreviewPagePayload = Pick<
  StorePage,
  "title" | "excerpt" | "updated_at"
> & {
  /** The rendered body html the route injects (`PageView.tsx:100`). */
  html: string;
};

/** The demo page the preview shows. Data only — the frame renders it. */
export const PREVIEW_DEMO_PAGE: PreviewPagePayload = {
  title: "Demo page",
  excerpt:
    "Demo excerpt — the theme preview shows sample copy, never a real merchant page.",
  html: "<p>Demo page body. Sample copy for the theme preview.</p><p>This paragraph stands in for the merchant's own CMS page body.</p>",
  updated_at: "2026-10-01T00:00:00.000Z",
};
