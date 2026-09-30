/**
 * Oceanblue installable preset — single source of truth for the registry.
 *
 * Assembles `{ tokens, templates }` for all nine template keys from the
 * theme builders with stable unique ids (`makeSection`). The registry
 * migration embeds the JSON this module emits (generated, never
 * hand-written — see the command in the migration header); `registry.test.ts`
 * validates the emitted preset exactly as `listRegistry` + publish would:
 * `parseTokens` / `parseTemplates` accept it and `lintTemplate` reports
 * zero errors on every template.
 */
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
import { OCEANBLUE_TOKENS } from "./tokens";

const s: SectionBuilder = (type, props = {}) =>
  makeSection("oceanblue", type, props);

export const OCEANBLUE_PRESET: {
  tokens: ThemeTokens;
  templates: ThemeTemplates;
} = {
  tokens: OCEANBLUE_TOKENS,
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
