import { test, expect, type Page } from "@playwright/test";
import { blockExternalRequests, NetworkCollector } from "./helpers";
import { ensureSongoskritiActive, merchantCreds } from "./helpers-songoskriti";

/**
 * The storefront-surface lane — the PRODUCTION surfaces the seven templates
 * are served on, asserted through the real routes:
 *
 *   1. **search** — the theme's search composition, carrying the platform's
 *      own result count, and the SAME count as the block the platform
 *      handed the theme;
 *   2. **cart** — the theme's cart body;
 *   3. **account** — the UNAUTHENTICATED state for an anonymous visitor and
 *      the DASHBOARD for a signed-in one;
 *   4. **blog** — the listing and the article render DIFFERENT compositions
 *      (the `blog_listing` and `blog_article` variants);
 *   5. **checkout** — the theme's shell AROUND the platform's own form;
 *   6. **archive** — the platform's taxonomy surface keeps the PLATFORM's
 *      grid with the resolved term's name as the ONE `<h1>` and NO theme
 *      composition (it carries no store subject), while the theme PREVIEW
 *      route renders the theme's archive body with its six functional slots;
 *   7. **page** — the merchant's OWN record, and no demo copy.
 *
 * **Why the lane is credential-gated (a stated deviation from the brief's
 * "no auth needed").** The surfaces assert the THEME's compositions, and a
 * theme reaches a storefront only through a merchant's published version. The
 * lane therefore ensures the disposable merchant's Songoskriti theme is
 * installed and active (`ensureSongoskritiActive`, the same idempotent
 * helper the parity harness uses) and the account case needs a real session
 * for its signed-in half. Without the credentials the lane SKIPS with the
 * reason — it never fakes a session and never asserts against a store that
 * has no theme.
 *
 * The store is the DISPOSABLE merchant on the throwaway stack
 * (`docker-compose.e2e.yml`, project `e2e-supabase`) — never production.
 */

const SKIP_REASON =
  "requires E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD (loopback auth stack; " +
  "docs/15-e2e/loopback-auth-setup.md) — the storefront surfaces assert the " +
  "merchant's published theme, and the account case needs a real session";

/** The disposable merchant on the throwaway stack (never production). */
const STORE = process.env["E2E_STORE_SLUG"]?.trim() || "frame19-demo";
/** The disposable CMS page on the throwaway stack. */
const PAGE_SLUG = process.env["E2E_PAGE_SLUG"]?.trim() || "our-story";
/** The disposable blog term on the throwaway stack. */
const TERM_SLUG = process.env["E2E_TERM_SLUG"]?.trim() || "handloom-heritage";
/** The disposable article on the throwaway stack. */
const ARTICLE_SLUG =
  process.env["E2E_ARTICLE_SLUG"]?.trim() || "the-jamdani-weavers-of-sonargaon";

test.setTimeout(300_000);

async function open(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  expect(response?.status(), `${path} answers 200`).toBe(200);
}

test.describe("the storefront surfaces", () => {
  test.beforeEach(async ({ page }) => {
    const creds = merchantCreds();
    test.skip(!creds, SKIP_REASON);
    if (!creds) return;
    const collector = new NetworkCollector(page).attach();
    await blockExternalRequests(page, []);
    await ensureSongoskritiActive(page);
  });

  test("the search route renders the theme's composition with the platform's own result count", async ({
    page,
  }) => {
    await open(page, `/store/${STORE}/search?q=saree`);
    // The theme's composition: its own results band, its own facet panel.
    await expect(
      page.getByText("Results", { exact: true }).first(),
      "the theme's search composition renders its own results band",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Filters", { exact: true }).first(),
      "the theme's search composition renders its own facet panel",
    ).toBeVisible({ timeout: 30_000 });
    // The platform's own count, rendered by the theme's toolbar …
    const countText = await page
      .getByText(/\d+\s+products?/i)
      .first()
      .innerText();
    const count = Number(countText.match(/\d+/)?.[0] ?? "-1");
    expect(
      count,
      "the platform's own result count is rendered",
    ).toBeGreaterThan(0);
    // … and the SAME count as the block the platform handed the theme: one
    // product card per counted result.
    const cards = await page.locator('a[href*="/p/"]').count();
    expect(
      cards,
      "the theme's grid shows exactly the platform's counted results",
    ).toBe(count);
  });

  test("the cart renders the theme's cart body", async ({ page }) => {
    await open(page, `/store/${STORE}/cart`);
    await expect(
      page.getByText("Your bag", { exact: true }).first(),
      "the theme's cart body renders its own heading",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Order summary", { exact: true }).first(),
      "the theme's cart body renders the platform's cart summary",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the account route renders the unauthenticated state and, signed in, the dashboard", async ({
    page,
  }) => {
    // (a) The ANONYMOUS state — the lane's own session is dropped, so the
    //     route sees an anonymous visitor.
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        /* an opaque origin has no storage — the visitor is anonymous anyway */
      }
    });
    await page.context().clearCookies();
    await open(page, `/store/${STORE}/account`);
    await expect(
      page.getByText("Track Your Order", { exact: false }).first(),
      "an anonymous visitor gets the platform's own order-lookup panel",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await page.getByRole("navigation", { name: "Account sections" }).count(),
      "the anonymous account page renders no dashboard",
    ).toBe(0);
    // ONE sign-in affordance: the theme's own bare prompt must NOT be
    // rendered above the platform's panel (the self-critique's fix 2).
    expect(
      await page.getByText("Sign in to continue.").count(),
      "the anonymous account page renders no second sign-in block",
    ).toBe(0);
    expect(
      await page
        .getByText("Signed in to this store's account.", { exact: false })
        .count(),
      "the anonymous account page is not signed in",
    ).toBe(0);

    // (b) The SIGNED-IN state — a REAL session through the real login form.
    await ensureSongoskritiActive(page);
    await open(page, `/store/${STORE}/account`);
    await expect(
      page.getByRole("navigation", { name: "Account sections" }),
      "a signed-in shopper gets the account dashboard",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("tab", { name: "Orders" }).first(),
      "the dashboard's own tabs render",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByText("Signed in to this store's account.", { exact: false })
        .first(),
      "the signed-in account page says so",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the blog listing and the blog article render different compositions", async ({
    page,
  }) => {
    await open(page, `/store/${STORE}/blog`);
    // The listing carries the `blog_listing` pack.
    await expect(
      page.getByText("From the journal", { exact: true }).first(),
      "the listing renders the blog_listing composition",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await page.getByText("From the journal, weekly", { exact: true }).count(),
      "the listing does not render the article variant's newsletter",
    ).toBe(0);
    expect(
      await page.getByText("More from the journal", { exact: true }).count(),
      "the listing does not render the article variant's related rail",
    ).toBe(0);

    await open(page, `/store/${STORE}/blog/${ARTICLE_SLUG}`);
    // The article carries the `blog_article` frame.
    await expect(
      page.getByText("More from the journal", { exact: true }).first(),
      "the article renders the blog_article composition's related rail",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("From the journal, weekly", { exact: true }).first(),
      "the article renders the blog_article composition's newsletter",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await page.getByText("From the journal", { exact: true }).count(),
      "the article does not render the listing composition's pack",
    ).toBe(0);
    // …and the ROUTE's own context: the article the shopper asked for.
    await expect(
      page
        .getByRole("heading", { name: ARTICLE_SLUG.replace(/-/g, " ") })
        .first(),
      "the article route renders the article's own title",
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the checkout renders the theme's shell around the platform's form", async ({
    page,
  }) => {
    await open(page, `/store/${STORE}/checkout`);
    // The theme's shell.
    await expect(
      page.getByText("Current step", { exact: true }).first(),
      "the theme's checkout shell renders its own progress trail",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("We accept", { exact: true }).first(),
      "the theme's checkout shell renders the payment block",
    ).toBeVisible({ timeout: 30_000 });
    // The platform's own form — the theme contributes LAYOUT only.
    await expect(
      page.getByText("Contact Information", { exact: true }).first(),
      "the platform's own contact block renders",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /Place Order/i }).first(),
      "the platform's own place-order action renders",
    ).toBeVisible({ timeout: 30_000 });
    // The theme contributes LAYOUT only: the form that carries the order is
    // the platform's own, with the platform's own customer fields — and the
    // theme's shell (its progress trail) is not inside any form.
    const orderForm = page.locator("form", {
      has: page.getByRole("button", { name: /Place Order/i }),
    });
    expect(await orderForm.count(), "exactly one form carries the order").toBe(
      1,
    );
    for (const field of ["Full name", "Address", "City", "Postcode"]) {
      await expect(
        orderForm.getByText(field, { exact: false }).first(),
        `the platform's own form carries "${field}"`,
      ).toBeVisible({ timeout: 30_000 });
    }
    const trailInForm = await page
      .getByText("Current step", { exact: true })
      .first()
      .evaluate((el) => Boolean(el.closest("form")));
    expect(
      trailInForm,
      "the theme's checkout shell contributes no form of its own",
    ).toBe(false);
  });

  test("the checkout asks for the address first and shows the rail and the total below it", async ({
    page,
  }) => {
    await open(page, `/store/${STORE}/checkout`);
    // The customer's own fields — the contact block the platform's form
    // renders.
    const contact = page
      .getByText("Contact Information", { exact: true })
      .first();
    await expect(
      contact,
      "the platform's own contact block renders",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /Place Order/i }).first(),
      "the platform's own place-order action renders",
    ).toBeVisible({ timeout: 30_000 });

    // The PAYMENT control: the theme's `payment_methods` widget. It renders
    // either the picker (when the store has rails) or its own empty state —
    // both are the payment control, and both must sit BELOW the customer's
    // fields.
    const paymentControl = page
      .getByText("No payment method is available right now.")
      .first();
    const picker = page.getByText("Payment method", { exact: true }).first();
    const paymentBox = (await paymentControl.count())
      ? await paymentControl.boundingBox()
      : await picker.boundingBox();
    expect(paymentBox, "the payment control renders").not.toBeNull();

    // The TOTAL: the theme's `cart_summary` reads the server's quote.
    const total = page.getByText("Total", { exact: true }).first();
    await expect(total, "the order summary's total renders").toBeVisible({
      timeout: 30_000,
    });
    const totalBox = await total.boundingBox();
    const contactBox = await contact.boundingBox();

    expect(contactBox, "the contact block is laid out").not.toBeNull();
    expect(totalBox, "the total is laid out").not.toBeNull();
    expect(
      paymentBox!.y,
      "the payment control renders BELOW the customer's fields",
    ).toBeGreaterThan(contactBox!.y);
    expect(
      totalBox!.y,
      "the total renders BELOW the customer's fields",
    ).toBeGreaterThan(contactBox!.y);
  });

  test("the archive routes keep the platform's grid; the preview renders the theme's archive body", async ({
    page,
  }) => {
    // (a) The platform's taxonomy surface — no store subject, so no theme.
    await open(page, `/blog/category/${TERM_SLUG}`);
    const headings = await page.locator("h1").allInnerTexts();
    expect(
      headings.length,
      `the taxonomy archive carries EXACTLY ONE <h1>; it carries ${headings.length}`,
    ).toBe(1);
    expect(
      headings[0],
      "the one <h1> carries the resolved term's name",
    ).toContain("Handloom Heritage");
    const body = await page.locator("body").innerText();
    expect(
      body,
      "the taxonomy surface carries NO theme composition",
    ).not.toContain("Browse the archive");
    expect(body, "the taxonomy surface carries NO demo copy").not.toMatch(
      /Nothing in this archive yet/,
    );

    // (b) The theme's own archive body, in the preview route, with its six
    // functional slots.
    await open(page, "/theme-preview/songoskriti?template=archive");
    const preview = await page.locator("body").innerText();
    for (const marker of [
      "Archive",
      "Browse the archive",
      "Articles",
      "Nothing in this archive yet",
    ]) {
      expect(
        preview,
        `the preview renders the theme's archive body ("${marker}")`,
      ).toContain(marker);
    }
  });

  test("the page route renders the merchant's own record and no demo copy", async ({
    page,
  }) => {
    await open(page, `/store/${STORE}/pages/${PAGE_SLUG}`);
    const body = await page.locator("body").innerText();
    expect(body, "the page route renders the merchant's own record").toContain(
      "Songoskriti began with a single loom",
    );
    expect(body, "the page route renders NO demo copy").not.toMatch(
      /Demo page|demo story|Meet the makers|Demo search/i,
    );
    // The page's own record is the merchant's, and the route owns the <h1>.
    const headings = await page.locator("h1").allInnerTexts();
    expect(
      headings.join(" "),
      "the page route's <h1> is the merchant's own record",
    ).toContain("Our Story");
  });
});
