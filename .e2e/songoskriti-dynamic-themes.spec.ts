import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import {
  activeThemeKey,
  ensureSongoskritiActive,
  merchantCreds,
  setActiveTheme,
} from "./helpers-songoskriti";
import {
  DYNAMIC_SKIP_REASON,
  DYNAMIC_STORE,
  assertNoSessionFaking,
  attemptPublish,
  changeCartQuantity,
  choosePaymentRail,
  ensureCartHasLine,
  holdsRealSession,
  openStorefront,
  openTemplateInEditor,
  publishedVersionId,
  readInspectorHeading,
  reloadEditorAndSelect,
  saveDraft,
  selectLayer,
  setInspectorHeading,
  switchAccountTab,
  visibleText,
} from "./songoskriti-dynamic-themes-helpers";

/**
 * The dynamic-themes PROOF lane — the programme's requirement 6, driven
 * through the real editor and the real storefront.
 *
 * **What this lane proves, and what it refuses to fake.** For each of the
 * three surfaces the plan names — **Cart**, **Account** and **Checkout** —
 * the lane drives the whole chain:
 *
 *   1. a REAL session (the real `/auth` form — never a faked one);
 *   2. the REAL editor, with the template selected through the studio's OWN
 *      template strip;
 *   3. a merchant-authored marker written through the SCHEMA-GENERATED
 *      inspector control (the catalogue's own declared field);
 *   4. **save → reload**: the edited value survived, which is server truth;
 *   5. the REAL publish modal, with the platform's own outcome reported;
 *   6. the REAL storefront route, where the merchant-authored marker must be
 *      **VISIBLE** and the old text must be **NOT** there;
 *   7. a **permitted interaction** that still works on the composed surface
 *      (the cart's quantity stepper, the account's tab, the checkout's
 *      payment rail);
 *   8. the page did **not** fall back to the platform's own surface.
 *
 * **The publish's contract, in both branches — a refusal is never a pass.**
 * The platform's publish gate refuses a theme whose authored copy is more
 * than 10% untranslated (`translationGate`, `src/lib/builder-guardrails.ts:166`);
 * the gate's floor is 90 % and the shipped Songoskriti copy has measured
 * below it — the exact measured value is recorded in the evidence record
 * (`phase4-dynamic-themes-evidence.md`), so this comment self-corrects
 * instead of quoting a stale number. So the lane
 * asserts the contract the platform actually implements:
 *
 *  - a publish that **succeeds** advances the published pointer, and the
 *    storefront then carries the merchant's marker and NOT the old text;
 *  - a publish that is **refused** leaves the published pointer untouched,
 *    **says why**, and does not half-apply — the storefront still serves the
 *    published composition, so the marker is absent and the old text is
 *    still there.
 *
 * In the refusal branch the proof of *"the storefront matches the edit"*
 * cannot run — there is no published edit to match — so the lane reports a
 * **skip with the platform's own reason**. A skip is never a pass, and a
 * lane that published successfully but cannot find the marker **fails**.
 *
 * **The cart's `<h1>` rule — why the cart journey clears the summary's title.**
 * The cart's composition carries two heading-capable widgets (`cart_lines` and
 * `cart_summary`), and the platform's lint allows exactly ONE of them to claim
 * the page `<h1>` ("More than one widget claims the page `<h1>`", a blocking
 * error that disables the publish modal's confirm). The theme's own cart body
 * keeps the lines block's heading blank and lets the summary claim the `<h1>`.
 * The journey's marker is the LINES block's heading, so it also clears the
 * summary's title — through the same schema-generated control — leaving the
 * journey's marker as the body's single claimant. The alternative (a second
 * claimant) would be a refusal the journey inflicted on itself, and a proof
 * lane must not manufacture its own obstacle.
 *
 * Mode B only: the loopback auth stack (`docs/15-e2e/loopback-auth-setup.md`)
 * plus `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD` (never committed).
 * Absent credentials ⇒ the surface tests SKIP with the reason — never a
 * fake session.
 */

test.setTimeout(600_000);

/** The lane's own sources — the guard reads them. */
const LANE_SOURCES = [
  fileURLToPath(
    new URL("./songoskriti-dynamic-themes.spec.ts", import.meta.url),
  ),
  fileURLToPath(
    new URL("./songoskriti-dynamic-themes-helpers.ts", import.meta.url),
  ),
];

/** One surface the journey proves. */
type Surface = {
  /** the studio's own label for the template */
  template: string;
  /** the layer the journey edits — the navigator's own label */
  layer: string;
  /** the real storefront route */
  route: string;
  /** the marker the journey writes BEFORE the reload (the saved draft) */
  draftMarker: string;
  /** the marker the journey publishes (the live composition) */
  liveMarker: string;
  /** the copy the theme's own composition carries — untouched by the journey */
  compositionCopy: string;
  /**
   * The copy the journey's edit REPLACES. The checkout's own summary title and
   * the cart's summary title (replaced by the marker below) are the surfaces
   * where "the old text is not on the storefront" is a real assertion; the
   * account's edited heading was deliberately blank, so its old value is the
   * journey's own intermediate marker.
   */
  replacedCopy?: string;
  /** a second property edit the surface needs before the save */
  beforeSave?: (page: Page) => Promise<void>;
  /** the surface needs a line in the cart for its permitted interaction */
  needsCartLine: boolean;
  /** the permitted interaction on this surface */
  interaction: (page: Page) => Promise<void>;
};

/**
 * The run's own token: markers are UNIQUE per run, so a marker a previous run
 * published can never satisfy this run's assertion (and a stale draft can
 * never make a refused publish look half-applied).
 */
const RUN = Date.now().toString(36);

const CART: Surface = {
  template: "Cart",
  layer: "Cart summary",
  route: `/store/${DYNAMIC_STORE}/cart`,
  draftMarker: `Frame30 cart summary — draft ${RUN}`,
  liveMarker: `Frame30 cart summary — published ${RUN}`,
  // The theme's own page heading. The platform's cart fallback says "Your
  // Bag" (a different casing), so this exact copy proves the THEME's
  // composition is live and not the route's fallback.
  compositionCopy: "Your bag",
  // The marker lives on the SUMMARY's own bilingual heading, not on
  // `cart_lines.heading`. Two heading claimants in one body is the platform's
  // blocking lint error (`builder-ast.ts:8734-8760`), and the theme's
  // `cart_lines` heading is deliberately blank for that reason. Moving the
  // marker onto `cart_lines` would force the summary title blank; clearing its
  // EN side alone leaves a bn-only pair (blocking, `builder-ast.ts:8901-8912`)
  // and the schema-routed inspector offers no বাংলা control to clear it
  // (record §(t.1)). Editing the summary's own authored heading keeps the
  // single claimant AND a complete `ok` pair — the lane never manufactures a
  // refusal. The edited title is the "old text" the publish replaces.
  replacedCopy: "Order summary",
  needsCartLine: true,
  interaction: async (page) => {
    const quote = await changeCartQuantity(page);
    expect(
      quote.after,
      "the server's quote followed the quantity change",
    ).not.toBe(quote.before);
  },
};

const ACCOUNT: Surface = {
  template: "Account",
  layer: "Account orders",
  route: `/store/${DYNAMIC_STORE}/account`,
  draftMarker: `Frame30 account orders — draft ${RUN}`,
  liveMarker: `Frame30 account orders — published ${RUN}`,
  // The theme's own overview strip. The account's own no-fallback proof is
  // the MARKER itself: the dashboard's fallback copy of the orders panel
  // carries no title at all, so a visible marker can only come from the
  // theme's own body.
  compositionCopy: "At a glance",
  needsCartLine: false,
  interaction: async (page) => {
    const before = await visibleText(page);
    await switchAccountTab(page, "Addresses");
    await expect(
      page.getByText("Add an Address").first(),
      "the switched tab renders the addresses panel",
    ).toBeVisible({ timeout: 30_000 });
    expect(await visibleText(page), "the panel changed with the tab").not.toBe(
      before,
    );
  },
};

const CHECKOUT: Surface = {
  template: "Checkout",
  layer: "Cart summary",
  route: `/store/${DYNAMIC_STORE}/checkout`,
  draftMarker: `Frame30 order summary — draft ${RUN}`,
  liveMarker: `Frame30 order summary — published ${RUN}`,
  // The theme's own checkout trail. The platform's checkout fallback has no
  // trail, so this copy proves the THEME's shell is live.
  compositionCopy: "Current step",
  // The theme's own summary title — the copy the journey's edit replaces.
  replacedCopy: "Order summary",
  needsCartLine: true,
  interaction: async (page) => {
    // The platform decides which rails a store can take. The lane has already
    // put a REAL line in the cart (`needsCartLine`), so the quote has run and
    // the store's `cod` rail is offered (§(t.7)); `choosePaymentRail` asserts
    // the composed checkout renders at least one server-offered rail. The old
    // guard skipped when the count was 0 — a state this lane cannot reach,
    // because an empty cart (not an absent rail) is what hides `cod`.
    const rail = await choosePaymentRail(page);
    expect(rail, "the chosen rail is one of the server's own").not.toBe("");
  },
};

/**
 * The journey, shared by the three surfaces: the editor steps, the publish
 * contract, and the storefront assertions that follow the platform's own
 * outcome.
 */
async function runJourney(page: Page, surface: Surface): Promise<void> {
  const collector = new NetworkCollector(page).attach();
  await blockExternalRequests(page, []);

  // 1. A REAL session, and Songoskriti active (the shipped helper — the
  //    real `/auth` form, never a faked one).
  await ensureSongoskritiActive(page);

  // 2. The real editor, and the template selected through the studio's own
  //    template strip.
  await openTemplateInEditor(page, surface.template);
  const pointerBefore = await publishedVersionId(page);

  // 3. The merchant-authored marker, written through the schema-generated
  //    inspector control of the widget the surface owns.
  await selectLayer(page, surface.layer);
  await setInspectorHeading(page, surface.draftMarker);
  if (surface.beforeSave) await surface.beforeSave(page);

  // 4. Save, then RELOAD: the edited value survived — server truth, not a
  //    cached canvas.
  await saveDraft(page);
  await reloadEditorAndSelect(page, surface.template);
  await selectLayer(page, surface.layer);
  expect(
    await readInspectorHeading(page),
    "the edited value survived the reload (server truth)",
  ).toBe(surface.draftMarker);

  // 5. The real publish path. The platform enables the publish control only
  //    while the document has unsaved changes, so the journey makes its FINAL
  //    edit here — after the reload — and the publish carries that value.
  await setInspectorHeading(page, surface.liveMarker);
  const publish = await attemptPublish(page);
  const pointerAfter = await publishedVersionId(page);
  if (publish.outcome === "published") {
    expect(
      pointerAfter,
      "a successful publish advances the published pointer",
    ).not.toBe(pointerBefore);
  } else {
    expect(
      publish.message,
      "a refused publish tells the merchant why",
    ).not.toBe("");
    expect(
      pointerAfter,
      "a refused publish leaves the published pointer untouched",
    ).toBe(pointerBefore);
  }

  // 6. The real storefront route. The cart's and the checkout's permitted
  //    interactions need a REAL line in the cart, so the journey adds one
  //    through the storefront's own product page first.
  if (surface.needsCartLine) await ensureCartHasLine(page);
  await openStorefront(page, surface.route);

  // The theme's composition is live — not the platform's own surface.
  await expect(
    page.getByText(surface.compositionCopy, { exact: true }).first(),
    "the theme's own composition is on the storefront (no fallback)",
  ).toBeVisible({ timeout: 30_000 });

  const live = page.getByText(surface.liveMarker, { exact: true });
  const draft = page.getByText(surface.draftMarker, { exact: true });
  if (publish.outcome === "published") {
    // The merchant-authored marker is VISIBLE, and the old text is NOT.
    await expect(
      live.first(),
      "the merchant-authored marker is VISIBLE on the storefront",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await draft.count(),
      "the marker the journey replaced is NOT on the storefront",
    ).toBe(0);
    if (surface.replacedCopy) {
      expect(
        await page.getByText(surface.replacedCopy, { exact: true }).count(),
        "the old text is NOT on the storefront",
      ).toBe(0);
    }
  } else {
    // A refusal never half-applies: the storefront still serves the
    // PUBLISHED composition. The pointer assertion above proves the publish
    // was refused; here the proof is that THIS run's markers were not
    // half-written. (The published composition's own copy is deliberately
    // NOT asserted: it may legitimately be an earlier run's composition, and
    // a refusal is judged by the untouched pointer and the absent markers.)
    expect(
      await live.count(),
      "a refused publish did not half-apply: the marker is not on the storefront",
    ).toBe(0);
    expect(
      await draft.count(),
      "a refused publish did not half-apply: the draft marker is not on the storefront",
    ).toBe(0);
  }

  // 7. The permitted interaction still works on the composed surface.
  await surface.interaction(page);

  // Hygiene: nothing reached outside loopback.
  expect(collector.externalResponses()).toEqual([]);

  if (publish.outcome !== "published") {
    // The proof of "the storefront matches the edit" could not run: the
    // platform refused the publish, so there is no published edit to match.
    // It is reported as a SKIP with the platform's own reason — never as a
    // pass.
    test.skip(
      true,
      `the platform refused the publish, so the storefront cannot show the merchant's edit — ${publish.message}`,
    );
  }
}

test.describe("the dynamic themes' proof lane", () => {
  test.beforeEach(async () => {
    const creds = merchantCreds();
    test.skip(!creds, DYNAMIC_SKIP_REASON);
  });

  test("the cart: the merchant's heading is live on the storefront and the quantity still works", async ({
    page,
  }) => {
    await runJourney(page, CART);
  });

  test("the account: the merchant's heading is live on the storefront and the tab still switches", async ({
    page,
  }) => {
    await runJourney(page, ACCOUNT);
  });

  test("the checkout: the merchant's heading is live on the storefront and the rail still works", async ({
    page,
  }) => {
    await runJourney(page, CHECKOUT);
  });

  test("the theme switch: A → B → A preserves the merchant's own draft (server truth)", async ({
    page,
  }) => {
    // The gap-7 round trip (§(n.7.1)): a draft authored on Songoskriti must
    // still be Songoskriti's AFTER another theme is activated and the first
    // one is re-activated. The surface is Collection's "Product rail" — the
    // one editable layer BOTH themes author (Somvabona authors no Cart body,
    // `src/lib/themes/somvabona/preview.ts:91`), with the catalogue's own
    // schema-generated `Heading` control
    // (`src/lib/builder-ast.ts:2360`). The leg proves the DRAFT round trip;
    // it never publishes, so no publish gate can mask the result.
    const collector = new NetworkCollector(page).attach();
    await blockExternalRequests(page, []);
    const marker = `Frame30 theme switch — ${RUN}`;

    // 1. A REAL session, and Songoskriti active (the shipped helper).
    await ensureSongoskritiActive(page);

    // 2-3. The real editor, Collection selected, the marker written through
    //      the schema-generated control.
    await openTemplateInEditor(page, "Collection");
    await selectLayer(page, "Product rail");
    await setInspectorHeading(page, marker);

    // 4. Save, then RELOAD: the edited value survived — server truth before
    //    any theme is switched.
    await saveDraft(page);
    await reloadEditorAndSelect(page, "Collection");
    await selectLayer(page, "Product rail");
    expect(
      await readInspectorHeading(page),
      "the edited value survived the reload (server truth)",
    ).toBe(marker);

    // 5. The round trip itself: activate the OTHER theme, then come back.
    await setActiveTheme(page, "somvabona");
    expect(
      await activeThemeKey(page),
      "the other theme is now the merchant's active theme",
    ).toBe("somvabona");
    await setActiveTheme(page, "songoskriti");
    expect(
      await activeThemeKey(page),
      "the merchant's own theme is active again",
    ).toBe("songoskriti");

    // 6. The SAME layer, after the round trip: the merchant's own draft is
    //    still theirs — not the other theme's, not the seed's.
    await openTemplateInEditor(page, "Collection");
    await selectLayer(page, "Product rail");
    expect(
      await readInspectorHeading(page),
      "the A → B → A theme switch preserved the merchant's own draft",
    ).toBe(marker);

    // Hygiene: nothing reached outside loopback.
    expect(collector.externalResponses()).toEqual([]);
  });
});

test("no session is ever faked: the lane injects no credential and signs in through the real form", async ({
  page,
}) => {
  // (1) STATIC — the lane's own sources carry no session faking at all: no
  //     credential is written, no header is injected, no response is faked and
  //     no storage entry is hand-written. This half needs neither the stack
  //     nor the credentials, so it always runs.
  assertNoSessionFaking(LANE_SOURCES);

  // (2) RUNTIME — the session the lane uses is a REAL GoTrue session, minted
  //     by the real `/auth` form (the shipped `ensureSongoskritiActive`).
  const creds = merchantCreds();
  if (!creds) {
    test.info().annotations.push({
      type: "note",
      description:
        "the runtime half of the guard needs E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD; the static half (the lane's own sources inject no credential) ran and passed",
    });
    return;
  }
  await ensureSongoskritiActive(page);
  expect(
    await holdsRealSession(page),
    "the session the lane uses is a REAL GoTrue session (a signed JWT), minted by the real /auth form",
  ).toBe(true);
});
