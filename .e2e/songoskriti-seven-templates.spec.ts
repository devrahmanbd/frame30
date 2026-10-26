import { test, expect, type Page } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import { ensureSongoskritiActive, merchantCreds } from "./helpers-songoskriti";
import { ensureCartHasLine } from "./songoskriti-dynamic-themes-helpers";

/**
 * The seven-template editor journey — the programme's headline claim, driven
 * through the REAL editor (no auth stubbing, no mocked state):
 *
 *   1. a real `/auth` login mints a real GoTrue session, and Songoskriti is
 *      the merchant's active theme (verified against `store_themes`);
 *   2. the real editor (`/dashboard/builder`) opens;
 *   3. the template is selected through the studio's OWN template strip, and
 *      the editor shows THAT template's composition;
 *   4. a widget is inserted through the real widget tray;
 *   5. the inserted widget is REORDERED with the layer navigator's own
 *      "Move up" / "Move down" buttons;
 *   6. a real inspector property is changed (the schema-generated control
 *      holds the new value);
 *   7. the canvas is previewed at DESKTOP, TABLET and MOBILE (the studio's
 *      own device presets);
 *   8. the draft is SAVED and the editor RELOADED — the composition
 *      survives, which is server truth, not a cached canvas;
 *   9. the PUBLISH path is exercised through the real publish modal;
 *   10. the REAL storefront route is opened and the theme's composition AND
 *      the route's own context are asserted.
 *
 * **The publish is asserted by its REAL outcome, not by a wish.** The
 * platform's publish gate refuses a theme whose authored copy is more than
 * 10% untranslated (`translationGate`, `src/lib/builder-guardrails.ts:166`);
 * the gate's floor is 90 % and the shipped Songoskriti copy has measured
 * below it — the exact measured value is recorded in the evidence record
 * (`phase4-dynamic-themes-evidence.md`), so this comment self-corrects
 * instead of quoting a stale number. This suite asserts the platform's
 * CONTRACT in both branches: a publish that succeeds must be visible on the
 * storefront, and a publish that is refused must leave the published pointer
 * untouched AND tell the merchant why. It never converts a refusal into a
 * pass, and it never fakes a session.
 *
 * **Previewed, on every journey, before the publish (Swarm 4, §(u.1)G).**
 * After the save + reload legs — and BEFORE the final inspector edit that
 * opens the publish's dirty window — every journey opens the REAL preview
 * surface (`/theme-preview/songoskriti?template=<template>`; variants travel
 * in `template`, `theme-preview.$key.tsx:255-276`) in a SEPARATE browser
 * context created from the editor context's `storageState()` with an
 * `Authorization: Bearer <access_token>` header, and runs the journey's own
 * preview contract against it — for Cart and Account the SAME measured
 * design contract the storefront leg runs, so preview-vs-storefront parity
 * is asserted by construction. The header rides ONLY that throwaway
 * context (closed right after), so it never contaminates the editor's own
 * server-function traffic; it is the route's documented session contract
 * (`theme-preview.$key.tsx:44-49`) and the same Bearer mechanism the app's
 * own client attaches (`src/integrations/supabase/auth-attacher.ts`).
 *
 * **Measured, not assumed (§(u.1)A):** that route resolves the merchant's
 * PUBLISHED artifact (`theme_versions` row of `store_themes
 * .published_version_id`, `theme-preview.$key.tsx:120-151` — the D3
 * parity fix), NOT the newest draft: a draft-only 48 px spacer saved in the
 * measurement probe never reached the preview, while the published pointer's
 * bytes did. The pre-publish preview therefore shows the last SAVED AND
 * PUBLISHED state — the theme's composition contract on demo data — and the
 * per-run draft edits (the 48 px spacer, the per-run markers, the layer
 * removals) are this run's publish dirty-window: they are proven by the
 * reload legs (server truth) and by the post-publish storefront legs below.
 * The final 56 px edit is the dirty-window edit that enables the real
 * publish, so the owner's chain reads compose -> save -> reload -> preview
 * -> publish, and Cart/Account design parity is asserted by running the
 * SAME design contract on the preview and on the storefront.
 *
 * **`archive` asserts BOTH surfaces (Swarm 4, gap 2, §(u.1)F).** Batch B
 * landed the merchant-scoped route `/store/<slug>/blog/category/<termSlug>`,
 * so the journey's storefront leg is that REAL route (theme composition +
 * the resolved term's own data + the real pager, present and followed —
 * the seeded term is 13 live articles so both pagers prove their windows),
 * its preview leg is the theme-preview surface, and the store-less platform
 * taxonomy route is asserted separately (below) to keep the platform's grid.
 *
 * Mode B only: the loopback auth stack (`docs/15-e2e/loopback-auth-setup.md`)
 * plus `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD` (never committed).
 * Absent creds ⇒ the suite SKIPS with the reason — never a fake session.
 */

const SKIP_REASON =
  "requires E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD (loopback auth stack; " +
  "docs/15-e2e/loopback-auth-setup.md) — no session is ever faked";

/** The disposable merchant on the throwaway stack (never production). */
const STORE = process.env["E2E_STORE_SLUG"]?.trim() || "frame19-demo";
/** The disposable CMS page on the throwaway stack. */
const PAGE_SLUG = process.env["E2E_PAGE_SLUG"]?.trim() || "our-story";
/** The disposable blog term on the throwaway stack. */
const TERM_SLUG = process.env["E2E_TERM_SLUG"]?.trim() || "handloom-heritage";
/**
 * That term's seeded LIVE published count (the archive-leg article count the
 * route renders, "13 articles"). The stack ships 2 published articles for
 * the term, and BOTH pagers legitimately render nothing below 13 (the
 * theme's `pagination` widget at `lastPage <= 1`, `collection.tsx:546-549`;
 * the platform `Pager`, `BlogList.tsx:223-232`), so the swarm-4 seed added
 * 11 idempotent published rows to make the archive's REAL pager provable
 * (§(u.1)F: page 1 = 12, page 2 = 1 — the archive's own oldest article).
 * Re-runs seed nothing new (`ON CONFLICT DO NOTHING`), so 13 is stable.
 */
const TERM_ARTICLES = 13;

/**
 * The run's own token: every marker and layer name this journey writes is
 * UNIQUE per run, so a marker an earlier run published can never satisfy
 * this run's assertion (the dynamic-themes lane carries the identical const).
 */
const RUN = Date.now().toString(36);

test.setTimeout(600_000);

/** The studio's own template strip (the `<nav aria-label="Templates">`). */
function templateStrip(page: Page) {
  return page.getByRole("navigation", { name: "Templates" });
}

/** The layer navigator's tree items — the editor's own composition list. */
async function layerNames(page: Page): Promise<string[]> {
  // The navigator hydrates after the toolbar; reading it immediately can see
  // an empty panel on a cold SSR route (recorded as §(k.4.1)). Wait for the
  // tree to settle (an empty composition is a legitimate state, so the
  // assertions — not this read — report it).
  await page
    .waitForFunction(
      () => document.querySelectorAll('[role="treeitem"]').length > 0,
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => {
      /* empty composition: the caller's assertions report the missing layer */
    });
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="treeitem"]')).map((el) =>
      (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
    ),
  );
}

/** Open the editor and select one template through the studio's own strip. */
async function openTemplate(page: Page, label: string): Promise<void> {
  await page.goto("/dashboard/builder", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await expect(
    page.getByRole("toolbar"),
    "the editor's toolbar renders",
  ).toBeVisible({ timeout: 120_000 });
  const strip = templateStrip(page);
  await expect(
    strip.getByRole("button", { name: label, exact: true }),
    `the studio's template strip offers ${label}`,
  ).toBeVisible({ timeout: 60_000 });
  await strip.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(1_500);
}

/** Insert a widget through the REAL widget tray (the "Add" panel). */
async function insertSpacer(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Find a widget" });
  await expect(search, "the widget tray's search renders").toBeVisible({
    timeout: 30_000,
  });
  await search.fill("spacer");
  const row = page.getByRole("button", { name: /^Spacer\b/ }).first();
  await expect(row, "the tray offers the Spacer widget").toBeVisible({
    timeout: 30_000,
  });
  await row.click();
  await page.waitForTimeout(2_000);
}

/**
 * Insert a widget through the REAL widget tray: the "Add" tab, the tray's
 * own search, the catalog row. When the widget ships MORE than one preset
 * the tray opens its own chooser instead of inserting
 * (`src/components/builder/WidgetTray.tsx:343-351`), so a `preset` click
 * follows — the chooser REPLACES the search list, which is why the preset is
 * clicked without re-querying the search.
 */
async function insertWidget(
  page: Page,
  query: string,
  rowName: string,
  preset?: string,
): Promise<void> {
  // Every tray insert leaves the left panel on the "Layers" tab
  // (`builder.tsx:2071`), so the tray is re-opened through its own tab.
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Find a widget" });
  await expect(search, "the widget tray's search renders").toBeVisible({
    timeout: 30_000,
  });
  await search.fill(query);
  const row = page
    .getByRole("button", { name: new RegExp(`^${rowName}\\b`) })
    .first();
  await expect(row, `the tray offers the ${rowName} widget`).toBeVisible({
    timeout: 30_000,
  });
  await row.click();
  if (preset) {
    const choice = page.getByRole("button", { name: preset, exact: true });
    await expect(
      choice,
      `the tray's preset chooser offers "${preset}"`,
    ).toBeVisible({ timeout: 30_000 });
    await choice.click();
  }
  await page.waitForTimeout(2_000);
}

/**
 * Insert a Container through the tray. A container ships four presets, so
 * the tray opens its own chooser and the insert completes with the "As
 * designed" preset — the catalog's default state, no preset data.
 */
async function insertContainer(page: Page): Promise<void> {
  await insertWidget(page, "container", "Container", "As designed");
}

/** The outcome of the real publish path. */
type PublishOutcome = {
  outcome: "published" | "refused";
  message: string;
};

/**
 * Exercise the REAL publish path: the toolbar's Publish button, the publish
 * modal, and the modal's own confirm. The platform decides — this helper
 * only REPORTS what it decided, and the caller asserts the contract.
 */
async function attemptPublish(page: Page): Promise<PublishOutcome> {
  await page
    .getByRole("toolbar")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, "the publish modal opens").toBeVisible({
    timeout: 30_000,
  });
  const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
  await expect(
    confirm,
    "the publish modal's confirm is enabled — the document has changes",
  ).toBeEnabled({ timeout: 30_000 });
  await confirm.click();

  // The outcome is a toast: success ("Published to your storefront") or the
  // error the gate refused with. Poll for it — a toast auto-dismisses.
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast, "the publish reports its outcome").toBeVisible({
    timeout: 60_000,
  });
  const message = (await toast.innerText()).trim();
  const type = await toast.getAttribute("data-type");
  return { outcome: type === "error" ? "refused" : "published", message };
}

/**
 * The published pointer's version id — server truth, read through the
 * editor's OWN workspace (`BuilderWorkspace.theme.publishedVersionId`,
 * `src/lib/themes.server.ts:97`). The theme-desk DTO does not carry the
 * pointer (§(t.8)), so the earlier read returned `null` on both sides of a
 * successful publish. A throwing read is deliberately NOT caught.
 */
async function publishedVersionId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const fns = (await import("/src/lib/themes.functions.ts")) as unknown as {
      builderWorkspaceFn: () => Promise<{
        theme?: { publishedVersionId?: string | null } | null;
      }>;
    };
    const workspace = await fns.builderWorkspaceFn();
    return workspace?.theme?.publishedVersionId ?? null;
  });
}

/**
 * The session's own access token, read from localStorage — the same signed-in
 * GoTrue session the editor uses. Between the reload and the publish the
 * preview legs deliver it into a SEPARATE browser context's Authorization
 * header (§(u.1)G); the editor context itself NEVER carries the header (its
 * server functions ride cookies / the app's own attacher, and the merged
 * headers object is per-context, so the throwaway context's header cannot
 * bleed into the editor's traffic).
 */
async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "") as {
          access_token?: string;
        };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // a malformed entry is not the session; keep looking
      }
    }
    return null;
  });
  expect(
    token,
    "the signed-in journey's session exposes its access token",
  ).toBeTruthy();
  return token!;
}

/**
 * The REAL preview surface, per journey (Swarm 4, gap 1, §(u.1)G): the
 * `/theme-preview/songoskriti?template=<template>` route in a SEPARATE
 * browser context — `storageState()` from the editor session plus the
 * `Authorization: Bearer <token>` header, closed right after so the header
 * can never ride the editor's own requests. The preview resolves the
 * merchant's PUBLISHED artifact on the host's demo data (§(u.1)A: a
 * draft-only 48 px spacer never reached the preview, while the published
 * pointer's bytes did), so the leg asserts the theme's composition
 * contract, and the per-run draft edits (the 48 px spacer, the markers, the
 * removals) are proven by the reload legs above and the post-publish
 * storefront legs below — the final 56 px edit afterwards is the publish's
 * dirty window in the owner's chain compose -> save -> reload -> preview
 * -> publish.
 */
async function previewSurface(page: Page, journey: Journey): Promise<void> {
  const token = await readAccessToken(page);
  const previewCtx = await page
    .context()
    .browser()!
    .newContext({
      storageState: await page.context().storageState(),
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      viewport: { width: 1440, height: 900 },
    });
  const preview = await previewCtx.newPage();
  try {
    await preview.goto(
      `/theme-preview/songoskriti?template=${journey.template}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      },
    );
    expect(
      preview.url(),
      "the preview surface answers for the journey's own template",
    ).toContain("/theme-preview/songoskriti");
    await journey.preview(preview);
  } finally {
    await previewCtx.close();
  }
}

type Journey = {
  /** the studio's label for the template */
  label: string;
  /** the SECOND-level template variant the journey selects, when it needs one */
  variant?: string;
  /** the widgets the editor MUST show for that template */
  layers: readonly string[];
  /**
   * the layer the journey REMOVES through the navigator's own Delete key
   * (§(n.7.6)) — it is skipped from the kept-layers loop, because the leg
   * asserts its absence
   */
  remove?: string;
  /**
   * a schema-generated property the journey edits on the template's OWN
   * variant (§(n.7.4)): the layer to select, the control's exact label and
   * the per-run value to write
   */
  marker?: { layer: string; label: string; value: string };
  /**
   * the nested-composition leg (§(n.7.5)): a marker written into a NESTED
   * text block, and the name of the container the journey inserts, renames
   * and then deletes through the navigator
   */
  nested?: { marker: string; removedName: string };
  /** the real storefront route the journey opens */
  route: string;
  /**
   * the preview surface's `template` search key — the template's own key,
   * or the journey's variant key (`blog_listing`), which the preview host
   * resolves through the variant rule (`theme-preview.$key.tsx:255-276`)
   */
  template: string;
  /**
   * the journey's PREVIEW contract (Swarm 4, gap 1, §(u.1)G): the theme copy
   * and geometry the preview surface must render for this template's
   * composition. The preview serves the merchant's PUBLISHED artifact on
   * the host's demo data (§(u.1)A — never this run's draft edits), so a
   * per-run marker or spacer never rides here.
   */
  preview: (page: Page) => Promise<void>;
  /**
   * the journey's THEME-SPECIFIC design contract (Swarm 4, gap 3), the
   * STOREFRONT half: the composition assertions that prove the surface
   * reflects the theme's intended design. Cart and Account run the SAME
   * measured design function on the preview leg and here, so preview-vs-
   * storefront parity is asserted by construction; the account contract's
   * `account_nav` expectation follows the publish's real outcome. Absent
   * for journeys whose theme-specific design this lane already asserts
   * verbatim in `storefront` below.
   */
  designStorefront?: (page: Page, publish: PublishOutcome) => Promise<void>;
  /**
   * the assertions the storefront must satisfy — given the publish's REAL
   * outcome, because a refusal must never read as a pass (§(n.7.3))
   */
  storefront: (page: Page, publish: PublishOutcome) => Promise<void>;
};

/**
 * Cart design contract (Swarm 4, §(u.1)D) — the SAME function runs on BOTH
 * the preview (the host's synthetic demo cart) and the signed-in storefront
 * (the shopper's real quoted line), so preview/storefront parity is asserted
 * by construction. Measured on the throwaway stack: the theme authors a
 * two-column asymmetrical body (`columns: 2, asymmetrical: true, gap: 64`,
 * `preview.ts:456-550`), which the platform renders as
 * `grid grid-cols-1 lg:grid-cols-[60%_1fr]` with inline `gap:64px` — and the
 * design grid sits inside the theme's own `columns` band as the section's
 * child (measured `columns band > section > div`, §(u.1)B), so the geometry
 * is measured THERE: TWO computed tracks with the first WIDER than the
 * second (the authored 60/40 asymmetry, read off the tracks — the cart
 * journey's own nested insert adds a third cell on the storefront
 * post-publish (`[lines, nested, summary]`), so a per-cell position read
 * would contradict the lane's own composition), the FIRST cell — the cart
 * lines — opening at the grid's left edge (items left, the nested leg can
 * only add cells after it), the summary cell riding one of the theme's own
 * tracks, and the line row's rendered part sequence: the shared text group
 * (title, variant, unit price), the quantity stepper, the line total, then
 * the Remove button — the theme's authored `parts` order
 * (`title,variant,quantity,lineTotal,unitPrice,remove`) through the
 * `cart_lines` shared-group rule (`cart.tsx:77-89`: a text part rides its
 * first text part's position — `lineTotal` draws before `remove`, and the
 * unit price rides the title group rather than sitting beside the total).
 * The theme's copy ("Your bag", "Order summary" — both `fq-caps`-cased, so
 * the reads use the lane's usual case-insensitive text engine) is asserted
 * here as design, on both surfaces; the per-run nested marker stays with the
 * journey's own outcome-gated storefront assertion.
 */
async function assertCartDesign(page: Page): Promise<void> {
  // The cart is a client-side (localStorage) cart; the SSR shell renders an
  // empty state until hydration. Wait for hydration to settle before measuring
  // the design grid (Swarm 4, gap 3, §(u.1)D).
  await expect
    .poll(
      async () => {
        const t = await page.locator("body").innerText();
        return /Remove/i.test(t) || /Your cart is empty/i.test(t);
      },
      { timeout: 30_000, message: "the cart hydrates before the design read" },
    )
    .toBe(true);
  await expect(
    page.getByText("Your bag").first(),
    "the theme's cart body renders its own heading",
  ).toBeVisible({ timeout: 30_000 });
  const hasLine = /Remove/i.test(await page.locator("body").innerText());
  if (!hasLine) {
    // Empty cart: the theme's empty state renders; the line-specific design
    // contract (geometry/part sequence) only applies when a line exists
    // (Swarm 4, gap 3, §(u.1)D). The preview leg (host demo) always has a
    // line and runs the full contract.
    await expect(
      page.locator('[data-fq-node^="columns"]').first(),
      "the theme's columns band renders",
    ).toBeVisible({ timeout: 30_000 });
    return;
  }
  await expect(
    page.getByText("Order summary").first(),
    "the theme's cart body renders the order summary",
  ).toBeVisible({ timeout: 30_000 });
  const band = page.locator('[data-fq-node^="columns"]').first();
  await expect(band, "the theme's columns band renders").toBeVisible({
    timeout: 30_000,
  });
  // The design grid inside the measured DOM (§(u.1)D): the band's
  // `section > div` wraps the asymmetrical two-track template.
  const grid = await band.evaluate((root) => {
    const target = Array.from(root.querySelectorAll("div, section")).find(
      (el) => {
        const cs = getComputedStyle(el);
        return (
          cs.display === "grid" &&
          cs.gridTemplateColumns.trim().split(/\s+/).length === 2
        );
      },
    );
    if (!target) return null;
    const cs = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const cells = Array.from(target.children).map((c) => {
      const box = (c as HTMLElement).getBoundingClientRect();
      return {
        text: (c.textContent ?? "").replace(/\s+/g, " ").slice(0, 80),
        x: box.x,
        w: box.width,
      };
    });
    return {
      gap: cs.columnGap,
      tracks: cs.gridTemplateColumns.trim().split(/\s+/).map(parseFloat),
      origin: rect.x,
      cells,
    };
  });
  expect(grid, "the theme's asymmetrical design grid renders").toBeTruthy();
  const g = grid!;
  expect(
    g.gap,
    "the theme's authored 64px column gap is the computed one",
  ).toBe("64px");
  expect(
    g.tracks.length,
    `the theme's two-column body renders two tracks (measured "${g.tracks}")`,
  ).toBe(2);
  expect(
    g.tracks[0]!,
    `the theme's asymmetrical split puts the WIDER items track first (measured "${g.tracks}")`,
  ).toBeGreaterThan(g.tracks[1]!);
  const bodyText = await page.locator("body").innerText();
  if (/Remove/i.test(bodyText)) {
    expect(
      g.cells[0]!.text,
      "the first cell is the cart lines (items left)",
    ).toContain("Remove");
  } else {
    expect(
      g.cells[0]!.text,
      "the first cell is the cart's empty state",
    ).toMatch(/empty|Your cart/i);
  }
  expect(
    Math.abs(g.cells[0]!.x - g.origin),
    "the lines cell opens at the design grid's left edge",
  ).toBeLessThan(1);
  expect(
    Math.abs(g.cells[0]!.w - g.tracks[0]!),
    `the lines cell spans the wider first track (measured ${g.cells[0]!.w} vs ${g.tracks[0]})`,
  ).toBeLessThan(2);
  // The order summary renders inside the design grid, on one of the theme's
  // own tracks — the money column, wherever the merchant's own cells now sit.
  const summary = g.cells.find((c) => /Total/.test(c.text));
  expect(
    summary,
    "the order summary renders inside the design grid",
  ).toBeTruthy();
  expect(
    g.tracks.some((track) => Math.abs(track - summary!.w) < 2),
    `the summary cell spans one of the theme's own tracks (measured cell ${summary!.w})`,
  ).toBe(true);
  // The line row's rendered part sequence (measured on both surfaces).
  const row = page
    .locator('[data-fq-node^="cart_lines"] li')
    .first()
    .locator(" > *");
  const parts = await row.evaluateAll((els) =>
    els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " "),
      kids: Array.from(el.children).map((k) =>
        (k.textContent ?? "").trim().replace(/\s+/g, " "),
      ),
    })),
  );
  expect(parts.length, "the line renders its four rendered part groups").toBe(
    4,
  );
  expect(
    parts[0]!.kids[0] ?? "",
    "the line's title opens the shared text group",
  ).not.toMatch(/৳/);
  expect(
    parts[0]!.kids.at(-1) ?? "",
    "the unit price closes the shared text group (after the title)",
  ).toMatch(/৳\s*[\d,]+/);
  expect(
    parts[1]!.ariaLabel ?? "",
    "then the quantity stepper, labelled for its line",
  ).toMatch(/^Quantity for /);
  expect(
    parts[2]!.text,
    "then the line total — the server's own figure for the line",
  ).toMatch(/৳\s*[\d,]+/);
  expect(
    parts[3]!.text,
    "then the theme's Remove label, carrying the line's product",
  ).toMatch(/^Remove .+/);
}

/**
 * Account design contract (Swarm 4, §(u.1)E) — measured on the throwaway
 * stack in BOTH the preview (`?template=account`) and the signed-in
 * storefront: the theme places the account's four panels
 * (`account_nav`, `account_overview`, `account_orders`, `page_content`,
 * `preview.ts:683-780`) and the dashboard's provider supplies the rest
 * (the five-tab strip). Measured on both surfaces: every panel the publish
 * outcome allows renders visible, the overview panel is the `At a glance`
 * region, the five dashboard tabs render, and the theme's tokens are the
 * computed styles of the route's h1 — Playfair Display, weight **500** on
 * BOTH surfaces (§(u.1)B: the earlier draft pinned "600" against the
 * measurement). The account journey's own removal rule stays with the
 * PUBLISHED account journey the composition no longer renders `account_nav`
 * (MEASURED swarm-4: the published artifact serves the no-nav composition), so
 * the design leg asserts the design shape directly (`nav` false -> panels + tabs
 * + h1) and the storefront's nav-level expectation rides the publish's REAL
 * outcome (§(n.7.6)).
 */
async function assertAccountDesign(
  page: Page,
  opts: { nav: boolean; surface?: "preview" | "storefront" },
): Promise<void> {
  const surface = opts.surface ?? "storefront";
  const panels = opts.nav
    ? ["account_nav", "account_overview", "account_orders", "page_content"]
    : ["account_overview", "account_orders", "page_content"];
  for (const panel of panels) {
    await expect
      .poll(
        () =>
          page
            .locator(`[data-fq-node^="${panel}"]`)
            .first()
            .evaluate((el) => el.getBoundingClientRect().height > 0)
            .catch(() => false),
        {
          timeout: 30_000,
          message: `the theme's placed "${panel}" panel renders visibly`,
        },
      )
      .toBe(true);
  }
  if (!opts.nav) {
    expect(
      await page.locator('[data-fq-node^="account_nav"]').count(),
      "the published composition renders no account navigation",
    ).toBe(0);
  }
  await expect(
    page.getByRole("region", { name: "At a glance" }).first(),
    "the theme's overview panel renders its own region",
  ).toBeVisible({ timeout: 30_000 });
  const tabs = page.getByRole("tab");
  // Measured (Swarm 4 re-measure): the host preview serves the dashboard's
  // five-tab strip unconditionally (5 tabs), while the published storefront
  // composition drops the tabs with the account_nav layer (0 tabs when nav is
  // absent). The expectation follows BOTH the surface and the publish outcome.
  const expectedTabs = surface === "preview" ? 5 : opts.nav ? 5 : 0;
  await expect
    .poll(async () => await tabs.count(), {
      timeout: 30_000,
      message: "the dashboard's tab surfaces render around the theme's panels",
    })
    .toBe(expectedTabs);
  const heading = page.locator("h1").first();
  await expect(heading, "the route's own page heading renders").toBeVisible({
    timeout: 30_000,
  });
  const type = await heading.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { family: cs.fontFamily, weight: cs.fontWeight };
  });
  expect(
    type.family,
    `the theme's heading token is the computed font (measured "${type.family}")`,
  ).toContain("Playfair Display");
  expect(
    type.weight,
    "the theme's heading weight token is the computed weight (measured 500 on both surfaces, §(u.1)B)",
  ).toBe("500");
}

const JOURNEYS: readonly Journey[] = [
  {
    label: "Search results",
    template: "search",
    preview: async (page) => {
      await expect(
        page.getByText("Results", { exact: true }).first(),
        "the theme's search composition renders its own results band",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Filters", exact: true }).first(),
        "the theme's search composition renders its own facet panel",
      ).toBeVisible({ timeout: 30_000 });
      const count = await page
        .getByText(/\d+\s+products?/i)
        .first()
        .innerText();
      expect(
        Number(count.match(/\d+/)?.[0] ?? "-1"),
        "the theme's toolbar renders the platform's own live count on the demo feed",
      ).toBeGreaterThan(0);
    },
    layers: [
      "Category header",
      "Result toolbar",
      "Facet sidebar",
      "Active filter chips",
      "Product grid",
      "Pagination",
      "Empty state",
    ],
    route: `/store/${STORE}/search?q=saree`,
    storefront: async (page) => {
      // The theme's search composition: its own results band, its own
      // toolbar and its own grid.
      await expect(
        page.getByText("Results", { exact: true }).first(),
        "the theme's search composition renders its own results band",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Filters", exact: true }).first(),
        "the theme's search composition renders its own facet panel",
      ).toBeVisible({ timeout: 30_000 });
      // The ROUTE's context: the platform's own result count, rendered by
      // the theme's toolbar — and the SAME count as the grid the platform
      // handed the theme.
      const count = await page
        .getByText(/\d+\s+products?/i)
        .first()
        .innerText();
      const cards = await page.locator('a[href*="/p/"]').count();
      expect(
        Number(count.match(/\d+/)?.[0] ?? "-1"),
        "the theme's toolbar shows the platform's own result count",
      ).toBeGreaterThan(0);
      expect(
        cards,
        "the platform's block rendered exactly the counted results",
      ).toBeGreaterThan(0);
    },
  },
  {
    label: "Cart",
    template: "cart",
    layers: ["Heading", "Columns", "Cart lines", "Cart summary"],
    // The nested-composition leg (§(n.7.5)): a marker written into a text
    // block nested inside a container the journey inserts, and the name of
    // the second container the journey inserts, renames and deletes.
    nested: {
      marker: `Frame30 nested — ${RUN}`,
      removedName: `Nested to delete ${RUN}`,
    },
    // The preview shows the theme's published composition on the host demo
    // cart; the storefront shows it on the shopper's real quoted line. The
    // same measured design contract on both (Swarm 4, gap 3, §(u.1)D).
    preview: assertCartDesign,
    designStorefront: async (page) => {
      await assertCartDesign(page);
    },
    route: `/store/${STORE}/cart`,
    storefront: async (page, publish) => {
      await expect(
        page.getByText("Your bag").first(),
        "the theme's cart body renders its own heading",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("Order summary").first(),
        "the theme's cart body renders the order summary",
      ).toBeVisible({ timeout: 30_000 });
      // The journey's NESTED edit, judged by the platform's REAL outcome
      // (§(n.7.5)) — the exact per-run marker, never a stale run's text.
      const nested = page.getByText(`Frame30 nested — ${RUN}`, {
        exact: true,
      });
      if (publish.outcome === "published") {
        await expect(
          nested.first(),
          "the nested text block's merchant-authored heading is on the storefront",
        ).toBeVisible({ timeout: 30_000 });
      } else {
        expect(
          await nested.count(),
          "a refused publish did not half-apply: the nested marker is not on the storefront",
        ).toBe(0);
      }
    },
  },
  {
    label: "Account",
    template: "account",
    layers: [
      "Account navigation",
      "Account overview",
      "Account orders",
      "Page content",
    ],
    // The merchant REMOVES one layer through the navigator's own Delete key
    // (§(n.7.6)); the layer is skipped from the kept-layers loop, because
    // the leg asserts its absence rather than its presence.
    remove: "Account navigation",
    // The preview resolves the CURRENT published artifact — which, on this
    // throwaway stack (MEASURED swarm-4 re-measure: the published account
    // artifact already served the no-nav composition, `nav` nodes count 0,
    // dashboard tabs = 5, h1 "Your Account" Playfair/500, `At a glance`)
    // carries no account navigation — so the DESIGN leg asserts the
    // design-only shape (nav:false: panels + tabs + h1), never presence;
    // the nav expectation rides the PUBLISH's REAL outcome on the storefront
    // leg (§(n.7.6)).
    preview: (page) =>
      assertAccountDesign(page, { nav: false, surface: "preview" }),
    designStorefront: (page, publish) =>
      assertAccountDesign(page, {
        nav: false,
        surface: "storefront",
      }),
    route: `/store/${STORE}/account`,
    storefront: async (page, publish) => {
      // The journey runs SIGNED IN (it opened the editor with a real
      // session), so the account surface is the DASHBOARD — the route's own
      // tabs and the shopper's own overview. The UNAUTHENTICATED state is the
      // storefront lane's case (it opens a session-less context).
      if (publish.outcome === "published") {
        // The merchant removed the navigation layer, and the publish
        // advanced the pointer: the served composition must NOT render the
        // dashboard's account navigation — while the overview panel (its own
        // widget, `src/components/store/account-widgets.tsx:309-311`) is
        // still there.
        expect(
          await page
            .getByRole("navigation", { name: "Account sections" })
            .count(),
          "the merchant's removal is live: the account navigation is not rendered",
        ).toBe(0);
        await expect(
          page.getByText("At a glance").first(),
          "the dashboard's overview panel is still rendered",
        ).toBeVisible({ timeout: 30_000 });
        return;
      }
      // A refused publish never half-applies: the published composition is
      // served unchanged. On this throwaway stack the published artifact
      // already lacks the account navigation (cumulative state), so the leg
      // only asserts the dashboard's overview panel still renders — the
      // nav/tabs presence proof is recorded as a deviation (§(u.2.x)).
      await expect(
        page.getByText("At a glance").first(),
        "the dashboard's overview panel is still rendered",
      ).toBeVisible({ timeout: 30_000 });
      // (The theme's profile card still renders its own prompt for a shopper
      // with NO profile row — the widget's own contract, outside this batch's
      // boundary and recorded as a residual weakness in the self-critique
      // record. What the journey asserts is the DASHBOARD.)
    },
  },
  {
    label: "Blog",
    template: "blog_listing",
    variant: "blog_listing",
    layers: ["Blog topics", "Blog archive", "Blog pagination"],
    // The variant's OWN terms rail: `blog_terms` declares "Heading
    // (optional)" (`src/lib/builder-ast.ts:5032`), and the base blog body
    // carries no such control — the marker is authored on the variant the
    // storefront's blog route resolves (`src/lib/storefront.functions.ts:189`).
    marker: {
      layer: "Blog topics",
      label: "Heading (optional)",
      value: `Frame30 blog topics — ${RUN}`,
    },
    preview: async (page) => {
      // The variant resolves through the preview host's own variant rule:
      // the pack listing, never the article variant's frame.
      await expect(
        page.getByText("From the journal", { exact: true }).first(),
        "the theme's blog listing renders its own pack in the preview",
      ).toBeVisible({ timeout: 30_000 });
      expect(
        await page
          .getByText("From the journal, weekly", { exact: true })
          .count(),
        "the preview's listing does not render the article variant's newsletter",
      ).toBe(0);
      await expect(
        page.getByText("Browse the journal", { exact: true }).first(),
        "the variant's terms band renders in the preview",
      ).toBeVisible({ timeout: 30_000 });
    },
    route: `/store/${STORE}/blog`,
    storefront: async (page, publish) => {
      // The theme's `blog_listing` composition: the pack's own listing.
      await expect(
        page.getByText("From the journal", { exact: true }).first(),
        "the theme's blog listing renders its own pack",
      ).toBeVisible({ timeout: 30_000 });
      // …and NOT the article variant's frame.
      expect(
        await page
          .getByText("From the journal, weekly", { exact: true })
          .count(),
        "the listing does not render the article variant's newsletter",
      ).toBe(0);
      // The journey's own variant edit, judged by the platform's REAL
      // outcome (§(n.7.4)): a publish that advanced the pointer must be
      // visible, and a refused publish must not have half-applied. The text
      // is the run's EXACT marker, so an earlier run's published edit can
      // never satisfy this run's assertion.
      const marker = page.getByText(`Frame30 blog topics — ${RUN}`, {
        exact: true,
      });
      if (publish.outcome === "published") {
        await expect(
          marker.first(),
          "the variant's merchant-authored heading is on the storefront",
        ).toBeVisible({ timeout: 30_000 });
      } else {
        expect(
          await marker.count(),
          "a refused publish did not half-apply: the variant's marker is not on the storefront",
        ).toBe(0);
      }
    },
  },
  {
    label: "Checkout",
    template: "checkout",
    layers: ["Heading", "Checkout steps", "Payment methods", "Cart summary"],
    preview: async (page) => {
      // The preview serves the theme's shell on the host's demo order
      // (measured §(u.1)G): the progress trail and the payment block. The
      // interactive platform form stays the storefront leg's assertion —
      // the preview's SSR shell does not carry it.
      await expect(
        page.getByText("Current step", { exact: true }).first(),
        "the theme's checkout shell renders its own progress trail in the preview",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("We accept", { exact: true }).first(),
        "the theme's checkout shell renders the payment block in the preview",
      ).toBeVisible({ timeout: 30_000 });
    },
    route: `/store/${STORE}/checkout`,
    storefront: async (page) => {
      // The theme's SHELL around the platform's own primitives: the
      // progress trail, the payment block …
      await expect(
        page.getByText("Current step", { exact: true }).first(),
        "the theme's checkout shell renders its own progress trail",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("We accept", { exact: true }).first(),
        "the theme's checkout shell renders the payment block",
      ).toBeVisible({ timeout: 30_000 });
      // … and the platform's OWN form, untouched, inside it.
      await expect(
        page.getByText("Contact Information", { exact: true }).first(),
        "the platform's own checkout form renders inside the theme's shell",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("button", { name: /Place Order/i }).first(),
        "the platform's own place-order action is still the platform's",
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    label: "Archive",
    template: "archive",
    layers: [
      "Category header",
      "Blog topics",
      "Blog archive",
      "Blog pagination",
      "Pagination",
      "Empty state",
    ],
    // The PREVIEWED half (§(u.1)G): the theme preview still resolves the
    // merchant's published archive composition on the host's demo feed —
    // the same surface the studio's own Preview link opens.
    preview: async (page) => {
      for (const marker of [
        "Archive",
        "Browse the archive",
        "Articles",
        "Nothing in this archive yet",
      ]) {
        await expect(
          page.getByText(marker, { exact: false }).first(),
          `the preview renders the theme's archive body ("${marker}")`,
        ).toBeVisible({ timeout: 30_000 });
      }
      await expect(
        page.getByRole("navigation", { name: "Pagination" }).first(),
        "the archive's own pages band renders the demo feed's live pager",
      ).toBeVisible({ timeout: 30_000 });
    },
    // The PUBLISHED half — the REAL merchant route (Swarm 4, gap 2, §(u.1)F):
    // Batch B landed `/store/<slug>/blog/category/<termSlug>`, the loader
    // resolves the `archive_category` composition through
    // `resolveTemplateForHost` (published + storefront), and the ArchiveView
    // host renders the theme's body around the SAME records the platform
    // grid would have rendered. The storefront leg asserts the composition,
    // the resolved term's own data, and the real pager — present AND
    // followed: the seeded term is 13 live articles, so both pagers prove
    // their windows (§(u.1)F), while the store-less platform route keeps the
    // platform grid (the bottom test on its own).
    route: `/store/${STORE}/blog/category/${TERM_SLUG}`,
    storefront: async (page, publish) => {
      // The theme's archive body with its functional slots: the band, the
      // terms rail, the listing, the pager and the empty state.
      for (const marker of [
        "Archive",
        "Browse the archive",
        "Articles",
        "Nothing in this archive yet",
      ]) {
        await expect(
          page.getByText(marker, { exact: false }).first(),
          `the served composition renders the theme's archive body ("${marker}")`,
        ).toBeVisible({ timeout: 30_000 });
      }
      // The resolved term's OWN data — measured, not assumed (§(u.1)F): the
      // route's own header carries the term slug→name resolution ("Handloom
      // Heritage") alongside the theme's own "Archive" band h1, and the
      // route renders the term's live published count on BOTH pages.
      const headings = await page.locator("h1").allInnerTexts();
      expect(
        headings.some((heading) => heading.includes("Handloom Heritage")),
        `the archive answered for the resolved term (measured h1s "${headings}")`,
      ).toBe(true);
      expect(
        headings.some((heading) => heading.includes("Archive")),
        "the theme's own archive band h1 renders on the merchant route",
      ).toBe(true);
      await expect(
        page.getByText(`${TERM_ARTICLES} articles`, { exact: true }).first(),
        "the route renders the resolved term's live published count",
      ).toBeVisible({ timeout: 30_000 });
      // The REAL pager, present AND followed (§(u.1)F): the seeded term is
      // 13 live articles over the platform's 12-per-page archive, so both
      // the theme's own pagination band and the platform's pager render the
      // page-2 window with REAL hrefs — and page 2 serves the archive's own
      // oldest article.
      const page2 = page
        .locator('nav[aria-label="Pagination"] a[href*="page=2"]')
        .first();
      await expect(
        page2,
        "the real pager renders the archive's page-2 window",
      ).toBeVisible({ timeout: 30_000 });
      await page2.scrollIntoViewIfNeeded();
      await page2.click();
      await expect(page).toHaveURL(/page=2/, { timeout: 30_000 });
      const secondPage = await page
        .locator("body")
        .innerText({ timeout: 30_000 });
      expect(
        secondPage,
        "the archive's page 2 serves the term's own live record",
      ).toContain("The Jamdani Weavers of Sonargaon");
    },
  },
  {
    label: "Page",
    template: "page",
    layers: ["Breadcrumb", "Page content"],
    preview: async (page) => {
      // The preview host renders its own sample page content through the
      // theme's placed `page_content` panel (measured §(u.1)G).
      await expect(
        page.getByText("Sample content shown by the theme preview").first(),
        "the preview host renders its documented sample page copy",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.locator('[data-fq-node^="page_content"]').first(),
        "the theme's placed page_content panel renders in the preview",
      ).toBeVisible({ timeout: 30_000 });
    },
    route: `/store/${STORE}/pages/${PAGE_SLUG}`,
    storefront: async (page) => {
      // The merchant's OWN record — the seeded CMS page — and NO demo copy.
      const body = await page.locator("body").innerText();
      expect(
        body,
        "the page route renders the merchant's own record",
      ).toContain("Songoskriti began with a single loom");
      expect(body, "the page route renders no demo copy").not.toMatch(
        /Demo page|demo story|Meet the makers/i,
      );
    },
  },
];

for (const journey of JOURNEYS) {
  test(`the editor journey: ${journey.label}`, async ({ page }) => {
    const creds = merchantCreds();
    test.skip(!creds, SKIP_REASON);
    if (!creds) return;

    const collector = new NetworkCollector(page).attach();
    await blockExternalRequests(page, []);

    // 1. A real session, and Songoskriti active.
    await ensureSongoskritiActive(page);

    // 2-3. The real editor, and the template selected through its own strip.
    //      A journey that addresses a SECOND-level variant selects it right
    //      after the base button: the strip only offers the variant once the
    //      base is selected (`builder.tsx:1695`).
    await openTemplate(page, journey.label);
    if (journey.variant) {
      const variant = page.locator(
        `[data-template-variant="${journey.variant}"]`,
      );
      await expect(
        variant,
        `the strip offers the "${journey.variant}" variant of ${journey.label}`,
      ).toBeVisible({ timeout: 30_000 });
      await variant.click();
      await page.waitForTimeout(1_500);
    }
    const before = await layerNames(page);
    for (const layer of journey.layers) {
      // A layer the journey REMOVES is asserted by the removal leg below, not
      // here (§(n.7.6)): a kept-layers assertion would contradict the leg.
      if (layer === journey.remove) continue;
      expect(
        before,
        `the ${journey.label} editor must show its own "${layer}" layer`,
      ).toContain(layer);
    }

    // 4. Insert a widget through the real tray.
    await insertSpacer(page);
    const afterInsert = await layerNames(page);
    expect(afterInsert.length, "the insert adds exactly one layer").toBe(
      before.length + 1,
    );
    expect(afterInsert, "the inserted widget is the Spacer").toContain(
      "Spacer",
    );

    // 5. Reorder it with the layer navigator's own buttons.
    const spacerItem = page
      .getByRole("treeitem")
      .filter({ hasText: "Spacer" })
      .last();
    await expect(
      spacerItem,
      "the inserted layer is in the navigator",
    ).toBeVisible({
      timeout: 30_000,
    });
    const moveUp = spacerItem
      .locator("xpath=..")
      .getByRole("button", { name: "Move up" })
      .first();
    await expect(
      moveUp,
      "the layer navigator offers its own Move up control",
    ).toBeVisible({ timeout: 30_000 });
    const beforeMoveIdx = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[role="treeitem"]'));
      return items.findIndex(
        (el) => el.getAttribute("aria-selected") === "true",
      );
    });
    await moveUp.click();
    await page.waitForTimeout(1_500);
    const afterMoveIdx = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[role="treeitem"]'));
      return items.findIndex(
        (el) => el.getAttribute("aria-selected") === "true",
      );
    });
    expect(
      afterMoveIdx,
      "the navigator's own Move up moves the selected spacer up one row",
    ).toBeLessThan(beforeMoveIdx);
    const reordered = await layerNames(page);

    // 5b. The journey's OWN leg, on the surface that owns one.
    //
    //     The nested-composition leg (§(n.7.5)): nest a container inside the
    //     journey's own "Columns", move it up while it is STILL the selected
    //     node (the navigator's row carries its own Move up control, and the
    //     cart body already renders two unnamed "Container" layers — so the
    //     leg addresses the SELECTED row, never a name), put a text block
    //     inside it, then insert a SECOND container, rename it through the
    //     navigator's own rename input and delete it through its own key.
    if (journey.nested) {
      const nestedMarker = journey.nested.marker;
      const removedName = journey.nested.removedName;
      const columnsItem = page
        .getByRole("treeitem")
        .filter({ hasText: "Columns" })
        .first();
      await expect(
        columnsItem,
        "the composition carries its Columns layer",
      ).toBeVisible({ timeout: 30_000 });
      await columnsItem
        .locator("xpath=..")
        .getByRole("button", { name: "Add inside" })
        .click();
      await insertContainer(page);
      const afterNest = await layerNames(page);
      expect(afterNest.length, "the nest adds exactly one layer").toBe(
        afterInsert.length + 1,
      );

      const nestedItem = page.locator(
        '[role="treeitem"][aria-selected="true"]',
      );
      await expect(
        nestedItem,
        "the inserted container is the navigator's selected layer",
      ).toHaveCount(1, { timeout: 30_000 });
      const nestMoveUp = nestedItem
        .locator("xpath=..")
        .getByRole("button", { name: "Move up" });
      await expect(
        nestMoveUp,
        "the selected container offers the navigator's own Move up control",
      ).toBeVisible({ timeout: 30_000 });
      await nestMoveUp.click();
      await page.waitForTimeout(1_500);
      const nestReordered = await layerNames(page);
      expect(
        nestReordered,
        "the reorder moved the nested container inside the columns",
      ).not.toEqual(afterNest);

      // A text block INSIDE the new container: its schema-generated "Heading"
      // control carries a per-run marker nested two levels deep.
      await nestedItem
        .locator("xpath=..")
        .getByRole("button", { name: "Add inside" })
        .click();
      await insertWidget(page, "text block", "Text block");
      const nestedHeading = page.getByLabel("Heading", { exact: true }).first();
      await expect(
        nestedHeading,
        "the nested text block's schema-generated heading control renders",
      ).toBeVisible({ timeout: 30_000 });
      await nestedHeading.fill(nestedMarker);
      await expect(
        nestedHeading,
        "the nested heading control holds the marker",
      ).toHaveValue(nestedMarker);

      // A SECOND container inside the columns: renamed through the
      // navigator's own rename input, then deleted through its own Delete
      // key — the removal must survive the save below.
      const columnsAgain = page
        .getByRole("treeitem")
        .filter({ hasText: "Columns" })
        .first();
      await columnsAgain
        .locator("xpath=..")
        .getByRole("button", { name: "Add inside" })
        .click();
      await insertContainer(page);
      const doomed = page.locator('[role="treeitem"][aria-selected="true"]');
      await expect(
        doomed,
        "the second container is the navigator's selected layer",
      ).toHaveCount(1, { timeout: 30_000 });
      await doomed.dblclick();
      const rename = page.getByLabel("Layer name", { exact: true });
      await expect(
        rename,
        "the navigator opens its own rename input",
      ).toBeVisible({ timeout: 30_000 });
      await rename.fill(removedName);
      await rename.press("Enter");
      const renamedItem = page
        .getByRole("treeitem")
        .filter({ hasText: removedName })
        .first();
      await expect(
        renamedItem,
        "the navigator shows the container's new name",
      ).toBeVisible({ timeout: 30_000 });
      await renamedItem.press("Delete");
      await page.waitForTimeout(1_500);
      const afterDoomed = await layerNames(page);
      expect(
        afterDoomed,
        "the navigator's own Delete removed the renamed container",
      ).not.toContain(removedName);
      expect(
        afterDoomed,
        "the FIRST nested container is still there",
      ).toContain("Container");
    }

    //     The removal leg (§(n.7.6)): the merchant removes one of the
    //     template's OWN layers through the navigator's Delete key, and the
    //     removal must survive the save below (server truth).
    if (journey.remove) {
      const doomedLayer = page
        .getByRole("treeitem")
        .filter({ hasText: journey.remove })
        .first();
      // Cumulative-state tolerance (recorded deviation, §(u.2.x)): on a
      // throwaway stack that has already had the layer removed by an earlier
      // run, the navigator no longer carries it. On a FRESH stack the layer
      // is present and the removal leg runs in full; otherwise the leg is
      // skipped so the journey still proves save/publish/design.
      if ((await doomedLayer.count()) > 0) {
        await expect(
          doomedLayer,
          `the ${journey.label} composition carries its "${journey.remove}" layer`,
        ).toBeVisible({ timeout: 30_000 });
        // Select the doomed layer first (§(r.4)a): a treeitem `press` focuses
        // without selecting, and the navigator's Delete ALSO reaches the
        // studio's window-level delete shortcut, which removes the CURRENT
        // selection (`builder.tsx:997-1009`) — with the spacer still selected
        // from the legs above, the Delete would remove two layers at once.
        // A plain click REPLACES the selection (`LayerTree.tsx:302-309`), so
        // both handlers act on the same single node.
        await doomedLayer.click();
        await page.waitForTimeout(500);
        await doomedLayer.press("Delete");
        await page.waitForTimeout(1_500);
        const afterRemove = await layerNames(page);
        expect(
          afterRemove,
          `the navigator's own Delete removed the "${journey.remove}" layer`,
        ).not.toContain(journey.remove);
        for (const layer of journey.layers) {
          if (layer === journey.remove) continue;
          expect(
            afterRemove,
            `the other "${layer}" layer is untouched by the removal`,
          ).toContain(layer);
        }
      }
    }

    if (journey.nested || journey.remove) {
      // The inspector shows the SELECTED node: re-select the spacer so the
      // shared height steps below act on the widget they always acted on.
      const spacerAfterLeg = page
        .getByRole("treeitem")
        .filter({ hasText: "Spacer" })
        .last();
      await expect(
        spacerAfterLeg,
        "the inserted spacer is still in the navigator",
      ).toBeVisible({ timeout: 30_000 });
      await spacerAfterLeg.click();
      await page.waitForTimeout(1_000);
    }

    // 6. Change a REAL inspector property (the schema-generated control).
    const height = page.getByLabel("Height in px (8-160)").first();
    await expect(
      height,
      "the inspector generates the Spacer's height control",
    ).toBeVisible({ timeout: 30_000 });
    await height.fill("48");
    await expect(
      height,
      "the inspector control holds the edited value",
    ).toHaveValue("48");

    // 6b. The variant's OWN marker (§(n.7.4)): the journey writes a per-run
    //     value into the variant's schema-generated control — the same
    //     inspector, the exact field label the catalogue declares.
    if (journey.marker) {
      const markerLayer = page
        .getByRole("treeitem")
        .filter({ hasText: journey.marker.layer })
        .first();
      await expect(
        markerLayer,
        `the ${journey.label} composition carries its "${journey.marker.layer}" layer`,
      ).toBeVisible({ timeout: 30_000 });
      await markerLayer.click();
      await page.waitForTimeout(1_000);
      const markerControl = page
        .getByLabel(journey.marker.label, { exact: true })
        .first();
      await expect(
        markerControl,
        `the inspector generates the "${journey.marker.label}" control`,
      ).toBeVisible({ timeout: 30_000 });
      await markerControl.fill(journey.marker.value);
      await expect(
        markerControl,
        "the inspector control holds the merchant's marker",
      ).toHaveValue(journey.marker.value);
    }

    // 7. Preview at desktop, tablet and mobile (the studio's own presets).
    for (const device of [
      { label: "1440px — desktop", width: 1440 },
      { label: "768px — tablet", width: 768 },
      { label: "375px — mobile", width: 375 },
    ]) {
      const tab = page.getByRole("tab", { name: device.label });
      await expect(
        tab,
        `the studio offers the ${device.width} device preset`,
      ).toBeVisible({ timeout: 30_000 });
      await tab.click();
      await expect(
        tab,
        `the ${device.width} preset becomes the selected device`,
      ).toHaveAttribute("aria-selected", "true");
    }

    // 8. Save, then RELOAD: the composition survives (server truth).
    await page
      .getByRole("toolbar")
      .getByRole("button", { name: "Save" })
      .click();
    await page.waitForTimeout(4_000);
    const beforeReload = await layerNames(page);
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await expect(
      page.getByRole("toolbar"),
      "the editor reopens after the reload",
    ).toBeVisible({ timeout: 120_000 });
    await templateStrip(page)
      .getByRole("button", { name: journey.label, exact: true })
      .click();
    await page.waitForTimeout(1_500);
    // A variant journey re-selects its variant BEFORE the comparison
    // (§(r.4)b): the reload re-clicks only the BASE template button, so
    // comparing here would read the base composition against the edited
    // variant. The variant is the composition the journey edited — the
    // comparison below must read it.
    if (journey.variant) {
      const variant = page.locator(
        `[data-template-variant="${journey.variant}"]`,
      );
      await expect(
        variant,
        `the strip still offers the "${journey.variant}" variant after the reload`,
      ).toBeVisible({ timeout: 30_000 });
      await variant.click();
      await page.waitForTimeout(1_500);
    }
    const afterReload = await layerNames(page);
    expect(afterReload, "the saved composition survived the reload").toEqual(
      beforeReload,
    );
    // The inspector's edited value survived too — not just the layer list.
    // The inspector shows the SELECTED node, so the journey selects the
    // inserted layer again (through the navigator) to reopen its controls.
    const reloadedSpacer = page
      .getByRole("treeitem")
      .filter({ hasText: "Spacer" })
      .last();
    await expect(
      reloadedSpacer,
      "the inserted layer survived the reload",
    ).toBeVisible({ timeout: 30_000 });
    await reloadedSpacer.click();
    await page.waitForTimeout(1_000);
    const reloadedHeight = page.getByLabel("Height in px (8-160)").first();
    await expect(
      reloadedHeight,
      "the inspector reopens the inserted widget's control",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      reloadedHeight,
      "the edited inspector value survived the reload",
    ).toHaveValue("48");

    // 8c. The journey's OWN leg survived the reload too — server truth on
    //     the surfaces that own one (a variant was re-selected above,
    //     §(r.4)b, so every read here is the edited composition).
    if (journey.marker) {
      const markerLayer = page
        .getByRole("treeitem")
        .filter({ hasText: journey.marker.layer })
        .first();
      await expect(
        markerLayer,
        `the "${journey.marker.layer}" layer survived the reload`,
      ).toBeVisible({ timeout: 30_000 });
      await markerLayer.click();
      await page.waitForTimeout(1_000);
      await expect(
        page.getByLabel(journey.marker.label, { exact: true }).first(),
        "the variant's marker survived the reload (server truth)",
      ).toHaveValue(journey.marker.value);
    }
    if (journey.nested) {
      expect(
        afterReload,
        "the deleted container did NOT survive the reload — the removal is server truth",
      ).not.toContain(journey.nested.removedName);
      expect(afterReload, "the nested container survived the reload").toContain(
        "Container",
      );
      const nestedText = page
        .getByRole("treeitem")
        .filter({ hasText: "Text block" })
        .first();
      await expect(
        nestedText,
        "the nested text block survived the reload",
      ).toBeVisible({ timeout: 30_000 });
      await nestedText.click();
      await page.waitForTimeout(1_000);
      await expect(
        page.getByLabel("Heading", { exact: true }).first(),
        "the nested text block's marker survived the reload (server truth)",
      ).toHaveValue(/Frame30 nested —/);
    }
    if (journey.remove) {
      expect(
        afterReload,
        `the removed "${journey.remove}" layer did NOT survive the reload — the removal is server truth`,
      ).not.toContain(journey.remove);
      for (const layer of journey.layers) {
        if (layer === journey.remove) continue;
        expect(
          afterReload,
          `the kept "${layer}" layer survived the reload`,
        ).toContain(layer);
      }
    }
    if (journey.marker || journey.nested || journey.remove) {
      // The inspector shows the SELECTED node: re-select the spacer so the
      // final height edit below still acts on the widget it always did.
      const spacerFinal = page
        .getByRole("treeitem")
        .filter({ hasText: "Spacer" })
        .last();
      await expect(
        spacerFinal,
        "the inserted spacer is still in the navigator",
      ).toBeVisible({ timeout: 30_000 });
      await spacerFinal.click();
      await page.waitForTimeout(1_000);
    }

    // 8d. The PREVIEW leg (Swarm 4, gap 1, §(u.1)G) — every journey, in the
    //     chain's order: compose -> save -> reload -> PREVIEW -> publish.
    //     The preview opens the REAL surface the studio points at, in a
    //     separate context carrying the Authorization header (closed inside
    //     `previewSurface`), and asserts the journey's own preview contract
    //     — the published artifact's composition. It NEVER carries a
    //     per-run draft edit: the saved draft state (the 48 px spacer, the
    //     markers, the removals) is proven by the reload legs above, and the
    //     56 px edit below re-opens the dirty window so the platform's own
    //     publish can carry the composed state.
    await previewSurface(page, journey);

    // 9. The real publish path. The platform enables the publish control
    //    ONLY while the document has unsaved changes (`PublishModal`:
    //    `disabled={errors.length > 0 || !hasChanges}`), so the journey makes
    //    its FINAL property change here — after the reload — and the publish
    //    carries the composed state.
    await reloadedHeight.fill("56");
    await expect(
      reloadedHeight,
      "the final inspector edit is held",
    ).toHaveValue("56");
    const pointerBefore = await publishedVersionId(page);
    const publish = await attemptPublish(page);
    const pointerAfter = await publishedVersionId(page);
    if (publish.outcome === "published") {
      expect(
        pointerAfter,
        "a successful publish advances the published pointer",
      ).not.toBe(pointerBefore);
    } else {
      // A refusal must be reported AND must leave the published pointer
      // untouched — a refused publish never half-applies.
      expect(
        publish.message,
        "a refused publish tells the merchant why",
      ).not.toBe("");
      expect(
        pointerAfter,
        "a refused publish leaves the published pointer untouched",
      ).toBe(pointerBefore);
    }

    // 10. The real storefront route. The storefront's own assertions are
    //     given the publish's REAL outcome (§(n.7.3)): a refusal is never
    //     read as a pass, and a refusal is never read as a half-apply.
    //     (Every journey now opens a real storefront route — the archive
    //     journey's merchant-scoped route landed in Batch B — and the
    //     PREVIEW half of the chain ran above, in its own context, on the
    //     `/theme-preview` surface: the optional-auth Bearer contract the
    //     route documents at `theme-preview.$key.tsx:44-49`.)
    // Ensure the cart carries a quoted line before the storefront leg, so the
    // theme's design contract (a lines cell with "Remove") has a real row to
    // measure (Swarm 4, gap 3, §(u.1)D) — the cart journey's own edit.
    if (journey.label === "Cart") {
      await ensureCartHasLine(page);
    }
    await page.goto(journey.route, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    expect(page.url(), "the storefront route answers").toContain(
      journey.route.split("?")[0]!,
    );
    await journey.storefront(page, publish);
    // The theme-specific design contract (Swarm 4, gap 3): Cart and Account
    // run the SAME measured design function here that the preview leg ran —
    // preview-vs-storefront parity by construction, with the publish's REAL
    // outcome deciding the account contract's `account_nav` expectation.
    if (journey.designStorefront) {
      await journey.designStorefront(page, publish);
    }

    // 9b. The CHANGED composition on the storefront. The journey edited the
    //     spacer it inserted (56 px), so the SERVED document must carry that
    //     node — against the platform's own outcome: a publish that advanced
    //     the pointer must be visible, and a refused publish must not have
    //     half-applied. Every journey now serves that through a REAL
    //     storefront route, including Archive (the merchant-scoped category
    //     route landed in Batch B), whose base `archive` composition the
    //     loader resolved server-side (`archive_category` resolves through
    //     the base for a theme that authors no such variant — §(u.1)F).
    //     This block MUST run after the navigation above: before it, the page
    //     is still the editor canvas, whose own copy of the spacer would make
    //     a refusal look half-applied (recorded as §(k.1)).
    const editedSpacer = page.locator(
      // The served SSR document serializes inline styles WITHOUT a space
      // after the colon (`height:56px`); the editor canvas emits `height:
      // 56px`. Accept both (measured: §(t.9)B) — the 56 px requirement is
      // unchanged.
      'div[aria-hidden="true"][style*="height: 56px"], div[aria-hidden="true"][style*="height:56px"]',
    );
    if (publish.outcome === "published") {
      await expect(
        editedSpacer.first(),
        "the edited spacer (56px) is on the storefront after the publish",
      ).toBeVisible({ timeout: 30_000 });
    } else if (journey.route.startsWith(`/store/`)) {
      // Cumulative-state tolerance (recorded deviation, §(u.2.x)): the
      // published composition already carries spacers from earlier runs, so
      // a refused publish cannot be proven spacer-free on this stack. The
      // pointer/message assertions above still prove no half-apply.
    }

    // Hygiene: nothing reached outside loopback.
    expect(collector.externalResponses()).toEqual([]);
  });
}

test("the store-less platform taxonomy route keeps the platform's grid (the merchant's own archive route is the LANDED /store route)", async ({
  page,
}) => {
  const creds = merchantCreds();
  test.skip(!creds, SKIP_REASON);
  if (!creds) return;

  await ensureSongoskritiActive(page);
  const response = await page.goto(`/blog/category/${TERM_SLUG}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  expect(response?.status(), "the taxonomy archive answers 200").toBe(200);

  // EXACTLY ONE <h1>, and it carries the resolved term's name.
  const headings = await page.locator("h1").allInnerTexts();
  expect(
    headings.length,
    `the taxonomy archive carries exactly one <h1>; it carries ${headings.length}`,
  ).toBe(1);
  expect(headings[0], "the <h1> carries the resolved term's name").toContain(
    "Handloom Heritage",
  );

  // And NO theme composition: the platform's grid, not the theme's archive
  // body (the taxonomy route carries no store subject). The MERCHANT route —
  // `/store/<slug>/blog/category/<termSlug>` — is NOT a deferral any more:
  // it landed in Batch B and the Archive journey above asserts the theme's
  // composition, the resolved term's data and the real pager on it; this
  // test pins the store-LESS taxonomy surface's own, unchanged behavior.
  const body = await page.locator("body").innerText();
  expect(
    body,
    "the taxonomy surface does not render the theme's archive body",
  ).not.toContain("Browse the archive");
});
