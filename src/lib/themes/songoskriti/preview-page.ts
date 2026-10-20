/**
 * Songoskriti's sample content page — what the theme preview shows on the
 * `?template=page` tab.
 *
 * **This is sample content for the theme preview. It is never a merchant's
 * CMS record.** The live Page route renders the merchant's own record
 * through the `page_content` slot (`src/components/store/PageView.tsx:73-110`,
 * `:166`, `:175`) and this plan does not change that. The copy here says so
 * in words — the expert's bar is *"demo data is realistic and explicitly
 * labelled"*, not *"no sample copy anywhere"* — so a merchant reading the
 * preview never mistakes it for their own content.
 *
 * The payload keeps the **production shape** (`PreviewPagePayload`,
 * `src/lib/preview-page-data.ts:27-33`) — the record's title, its excerpt,
 * the rendered body html and the last-updated stamp — so it cannot drift
 * from the route's record. The type is re-exported here for exactly that
 * reason.
 */
import type { PreviewPagePayload } from "../../preview-page-data";

export type { PreviewPagePayload };

/** The sample page the preview shows. Data only — the frame renders it. */
export const SONGOSKRITI_PREVIEW_PAGE: PreviewPagePayload = {
  title: "Sample page — Songoskriti sizing and care",
  excerpt:
    "Sample content shown by the theme preview: how a Songoskriti piece is sized, how the fabric is cared for, and where the handloom comes from.",
  html: [
    "<p>Sizing, the way a Songoskriti atelier takes it: a Jamdani saree is cut to a 6.5-yard unstitched length with an 80cm blouse piece, and the measurements quoted on each product page are the measurements of the cloth itself, not of a finished garment. Where a piece runs small across the shoulder or long in the drape, the page says so — read it before you order, and ask the store if you are between sizes.</p>",
    "<p>Fabric care, for the cloth this house actually weaves: handloom cotton and khadi are washed separately, in cold water, and dried flat in the shade; a silk saree is dry-cleaned, never wrung, and stored folded rather than on a wire hanger, because the weight of a jamdani jalla is what gives it its fall. Brass and oxidised silver are kept away from damp, and the brass is wiped with a dry cloth rather than polished, so the patina the metalworkers left stays where it is.</p>",
    "<p>Handloom provenance, which is the part that cannot be copied: every piece in this sample catalogue names the weaving family that made it and the cluster they work in — Tangail for the fine cottons, Sonargaon for the jamdani, Comilla for the khadi, Dhamrai for the brass. The price on the page is the price of that work, not a wholesale rate, and it is why the same cotton can cost differently from one cluster to the next.</p>",
  ].join(""),
  updated_at: "2026-10-20T00:00:00.000Z",
};
