/**
 * Theme contract — every shipped preset × every template must render.
 *
 * TODO.md P1 asks for proof that a theme is not merely valid JSON but a page
 * a shopper can actually be served. The static preset tests already cover
 * parsing, linting and bilingual coverage; this one renders the real widget
 * tree through `SectionRenderer` and asserts the three things that make a
 * template shippable:
 *
 *   1. no section throws (a single bad widget would take the page down),
 *   2. the page claims at most one `<h1>` — route-h1 templates legitimately
 *      claim none, because the route supplies the heading,
 *   3. the markup is not empty, so a "rendered" template is never a blank div.
 *
 * Contexts are deliberately left unprovided: every provider used by the
 * renderer has a safe default, so this also proves a template survives a
 * cold render with no cart, no experiments and no widget data.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { ReactNode } from "react";
import { SectionRenderer } from "./SectionRenderer";
import { OrdersList, ProfileCard } from "./account";
import { accountSlotCtx } from "@/components/store/account-slots";
import { TEMPLATE_KEYS, parseTemplates } from "@/lib/builder-ast";
import type { Section, TemplateKey } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { primarySectionId } from "@/components/store/ThemeChrome";

// Demo rows mirroring the preview catalog: context-gated account widgets
// render route slots, never fallback markup, so the harness feeds them the
// same way the preview frame does.
const DEMO_ORDER_ROWS: WidgetRow[] = [
  {
    id: "demo-o1",
    title: "ORD-1001",
    subtitle: "delivered",
    priceMinor: 129900,
    currency: "BDT",
    date: "2026-09-01T10:00:00Z",
  },
];
const DEMO_PROFILE_ROWS: WidgetRow[] = [
  { id: "demo-profile", title: "Demo Shopper", subtitle: "demo@example.com" },
];

function accountSlots(sections: Section[]): Partial<Record<string, ReactNode>> {
  const find = (type: string) => sections.find((s) => s.type === type);
  const out: Partial<Record<string, ReactNode>> = {};
  const orders = find("orders_list");
  if (orders)
    out.orders_list = (
      <OrdersList
        {...accountSlotCtx(orders, {
          rows: DEMO_ORDER_ROWS,
          pending: false,
          locale: "en",
          storeSlug: "contract-store",
        })}
      />
    );
  const profile = find("profile_card");
  if (profile)
    out.profile_card = (
      <ProfileCard
        {...accountSlotCtx(profile, {
          rows: DEMO_PROFILE_ROWS,
          pending: false,
          locale: "en",
          storeSlug: "contract-store",
        })}
      />
    );
  return out;
}

function renderTemplate(
  sections: Section[],
  template: TemplateKey,
  primaryId: string | null,
) {
  const slots =
    template === "account" ? accountSlots(sections) : undefined;
  return renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          template={template}
          storeSlug="contract-store"
          primary={section.id === primaryId}
          contextSlots={slots}
        />
      ))}
    </>,
  );
}

const countH1 = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;

describe("theme contract: preset × template renders", () => {
  it("covers every shipped preset", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  for (const preset of THEME_PRESETS) {
    describe(preset.key, () => {
      const parsed = parseTemplates(preset.templates);

      for (const template of TEMPLATE_KEYS) {
        it(`${template} renders without throwing, with at most one h1`, () => {
          const ast = parsed[template]!;
          const primaryId = primarySectionId(ast);

          const header = renderTemplate(ast.header, template, null);
          const main = renderTemplate(ast.main, template, primaryId);
          const footer = renderTemplate(ast.footer, template, null);
          const html = `${header}${main}${footer}`;

          expect(html.length).toBeGreaterThan(0);
          expect(countH1(html)).toBeLessThanOrEqual(1);
          // A failed widget boundary is contained rather than thrown, so the
          // only way to see one here is a genuinely broken preset node.
          expect(html).not.toContain("data-widget-failed");
        });
      }
    });
  }
});
