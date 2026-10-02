import { makeSection } from "../../theme-section";
import type {
  SectionBuilder,
  ThemeTemplates,
  ThemeTokens,
} from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { buildSecondaryMain } from "./secondary";
import { BLUEOCEAN_TOKENS } from "./tokens";

const s: SectionBuilder = (type, props = {}) =>
  makeSection("blueocean", type, props);

export const BLUEOCEAN_PRESET: {
  tokens: ThemeTokens;
  templates: ThemeTemplates;
} = {
  tokens: BLUEOCEAN_TOKENS,
  templates: {
    index: {
      header: buildHeaderMain(s),
      main: buildHomepageMain(s),
      footer: buildFooterMain(s),
    },
    product: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "product"),
      footer: buildFooterMain(s),
    },
    collection: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "collection"),
      footer: buildFooterMain(s),
    },
    account: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "account"),
      footer: buildFooterMain(s),
    },
    page: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "page"),
      footer: buildFooterMain(s),
    },
    blog: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "blog"),
      footer: buildFooterMain(s),
    },
    cart: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "cart"),
      footer: buildFooterMain(s),
    },
    checkout: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "checkout"),
      footer: buildFooterMain(s),
    },
    search: {
      header: buildHeaderMain(s),
      main: buildSecondaryMain(s, "search"),
      footer: buildFooterMain(s),
    },
  },
};
