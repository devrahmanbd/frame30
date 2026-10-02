import type { SectionBuilder } from "./types";
import type { PreviewThemeSource } from "../../theme-preview-nav";
import { BLUEOCEAN_TOKENS } from "./tokens";
import { buildHeaderMain } from "./header";
import { buildFooterMain } from "./footer";
import { buildHomepageMain } from "./homepage";
import { buildSecondaryMain } from "./secondary";

export function blueoceanPreviewSource(): PreviewThemeSource {
  return {
    key: "blueocean",
    themeName: "BlueOcean",
    author: "Framique",
    tokens: BLUEOCEAN_TOKENS,
    header: (t, s) => buildHeaderMain(s),
    footer: (t, s) => buildFooterMain(s),
    main: (t, s) => {
      if (t === "index") return buildHomepageMain(s);
      return buildSecondaryMain(s, t);
    },
  };
}
