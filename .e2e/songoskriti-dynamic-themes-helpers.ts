import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The dynamic-themes proof lane's helpers — the editor steps, the publish
 * contract and the storefront assertions the lane is built from.
 *
 * **The discipline this file keeps.**
 *
 *  - **No session is ever faked.** The only session path is the shipped
 *    `ensureSongoskritiActive` / `merchantCreds` helpers
 *    (`.e2e/helpers-songoskriti.ts`), which drive the REAL `/auth` form and
 *    mint a REAL GoTrue session. Nothing here writes a credential, injects a
 *    header, stubs a response or pre-loads a script — the guard in
 *    `.e2e/songoskriti-dynamic-themes.spec.ts` proves it by reading this
 *    file's own source.
 *  - **Every selector is the app's own.** The studio's template strip, the
 *    layer navigator's `treeitem`s, the schema-generated inspector controls,
 *    the publish modal and the storefront's own controls — the same
 *    selectors the shipped seven-template and storefront-surface lanes use.
 *  - **The platform decides.** The publish helper REPORTS what the platform
 *    decided (success, or a refusal with the platform's own reason); it never
 *    converts a refusal into a success and never writes a session of its own.
 */

/** The disposable merchant on the throwaway stack (never production). */
export const DYNAMIC_STORE =
  process.env["E2E_STORE_SLUG"]?.trim() || "frame19-demo";

/**
 * The skip reason — the shipped lanes' discipline
 * (`.e2e/helpers-songoskriti.ts:31-36`). Absent credentials ⇒ the lane
 * SKIPS with the reason; a skip is never a pass.
 */
export const DYNAMIC_SKIP_REASON =
  "requires E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD (loopback auth stack; " +
  "docs/15-e2e/loopback-auth-setup.md) — no session is ever faked";

/** The cold-start budget for a navigation (a cold vite SSR compile is slow). */
const COLD_GOTO_TIMEOUT = 120_000;

/* ------------------------------------------------------------------ the editor */

/** The studio's own template strip (the `<nav aria-label="Templates">`). */
export function templateStrip(page: Page) {
  return page.getByRole("navigation", { name: "Templates" });
}

/** Open the real editor and select one template through the studio's strip. */
export async function openTemplateInEditor(
  page: Page,
  label: string,
): Promise<void> {
  await page.goto("/dashboard/builder", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  await expect(
    page.getByRole("toolbar"),
    "the editor's toolbar renders",
  ).toBeVisible({ timeout: COLD_GOTO_TIMEOUT });
  const strip = templateStrip(page);
  await expect(
    strip.getByRole("button", { name: label, exact: true }),
    `the studio's template strip offers ${label}`,
  ).toBeVisible({ timeout: 60_000 });
  await strip.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(1_500);
}

/**
 * Select a layer in the editor's own navigator — the `treeitem` the studio
 * renders for the node, labelled with the catalogue's own label
 * (`src/components/builder/LayerTree.tsx:356`).
 */
export async function selectLayer(page: Page, label: string): Promise<void> {
  const item = page.getByRole("treeitem").filter({ hasText: label }).first();
  await expect(item, `the navigator lists the "${label}" layer`).toBeVisible({
    timeout: 30_000,
  });
  await item.click();
  await page.waitForTimeout(600);
}

/**
 * The schema-generated inspector control for a widget's heading.
 *
 * The control is the platform's own: `SchemaControls` renders the
 * catalogue's declared field as a `<label for>` + `<input id>`
 * (`src/components/builder/SchemaControls.tsx:333`), so the accessible name
 * IS the catalogue's field label — "Heading".
 */
export function headingControl(page: Page) {
  return page.getByLabel("Heading", { exact: true }).first();
}

/** Write a value into the inspector's heading control and assert it is held. */
export async function setInspectorHeading(
  page: Page,
  value: string,
): Promise<void> {
  const control = headingControl(page);
  await expect(
    control,
    "the inspector generates the widget's heading control",
  ).toBeVisible({ timeout: 30_000 });
  await control.fill(value);
  await expect(
    control,
    "the inspector control holds the edited value",
  ).toHaveValue(value);
}

/** The value the inspector's heading control currently holds. */
export async function readInspectorHeading(page: Page): Promise<string> {
  return headingControl(page).inputValue();
}

/** Save the draft through the toolbar's own Save button. */
export async function saveDraft(page: Page): Promise<void> {
  await page.getByRole("toolbar").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(4_000);
}

/** Reload the editor and re-select the template — the saved draft, server truth. */
export async function reloadEditorAndSelect(
  page: Page,
  label: string,
): Promise<void> {
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  await expect(
    page.getByRole("toolbar"),
    "the editor reopens after the reload",
  ).toBeVisible({ timeout: COLD_GOTO_TIMEOUT });
  await templateStrip(page)
    .getByRole("button", { name: label, exact: true })
    .click();
  await page.waitForTimeout(1_500);
}

/* ------------------------------------------------------------------ the publish */

/** The outcome of the real publish path. */
export type PublishOutcome = {
  outcome: "published" | "refused";
  /** The platform's own message — the refusal's reason, or the success text. */
  message: string;
};

/**
 * Exercise the REAL publish path: the toolbar's Publish button, the publish
 * modal, and the modal's own confirm.
 *
 * **Two refusals, both named.** The platform refuses in two places and the
 * helper reports both:
 *
 *  - **the modal refuses the document** — the confirm is disabled because the
 *    editor's own lint found a blocking error (the message is read from the
 *    modal's own error list, so the merchant is told WHICH rule refused);
 *  - **the server refuses the publish** — the mutation answers with a
 *    `BuilderError` and the studio reports it as an error toast (the message
 *    is the server's own reason).
 *
 * The helper never decides: it REPORTS what the platform decided.
 */
export async function attemptPublish(page: Page): Promise<PublishOutcome> {
  await page
    .getByRole("toolbar")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, "the publish modal opens").toBeVisible({
    timeout: 30_000,
  });
  const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
  await expect(confirm, "the publish modal's confirm renders").toBeVisible({
    timeout: 30_000,
  });
  if (!(await confirm.isEnabled())) {
    // The editor's own lint refuses the document: the modal lists the rule.
    const reasons = (await dialog.locator("li").allInnerTexts())
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const modalText = (await dialog.innerText()).trim();
    return {
      outcome: "refused",
      message: reasons.length > 0 ? reasons.join(" · ") : modalText,
    };
  }
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
 * The published pointer's version id — server truth, read through the app's
 * own themes workspace (the same read the shipped journey uses).
 */
export async function publishedVersionId(page: Page): Promise<string | null> {
  return page
    .evaluate(async () => {
      const fns =
        (await import("/src/lib/themes/appearance.functions.ts")) as unknown as {
          themesWorkspaceFn: () => Promise<{
            installed?:
              | {
                  key?: string | null;
                  publishedVersionId?: string | null;
                }[]
              | null;
          }>;
        };
      const workspace = await fns.themesWorkspaceFn();
      const rows = workspace?.installed ?? [];
      const row = rows.find((entry) => entry.key === "songoskriti") ?? rows[0];
      return row?.publishedVersionId ?? null;
    })
    .catch(() => null);
}

/* --------------------------------------------------------------- the storefront */

/** Open a real storefront route. */
export async function openStorefront(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status(), `${path} answers 200`).toBe(200);
}

/** The page's visible text. */
export async function visibleText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

/**
 * Wait until the server's quote has settled: no widget is `aria-busy` any
 * more, so the totals on the page are the server's.
 */
export async function waitForQuoteToSettle(page: Page): Promise<void> {
  // Give the mutation a turn to set `aria-busy` before probing for its
  // absence: a probe that runs in the same tick as the click would see the
  // pre-request DOM and call it settled.
  await page.waitForTimeout(250);
  await expect(
    page.locator('[aria-busy="true"]'),
    "the server's quote settles",
  ).toHaveCount(0, { timeout: 60_000 });
}

/**
 * Put a REAL line in the cart, through the storefront's own flow: a product
 * page's own "Add to cart" button. Nothing is seeded — the variant id comes
 * from the server's catalogue, so the quote is a real quote.
 */
export async function ensureCartHasLine(page: Page): Promise<void> {
  await openStorefront(page, `/store/${DYNAMIC_STORE}/search?q=saree`);
  const product = page.locator('a[href*="/p/"]').first();
  await expect(product, "the search results carry a product card").toBeVisible({
    timeout: 60_000,
  });
  await product.click();
  await page.waitForURL(/\/p\//, { timeout: 60_000 });
  const add = page.getByRole("button", { name: /Add to cart/i }).first();
  await expect(
    add,
    "the product page renders its own add-to-cart action",
  ).toBeVisible({ timeout: 60_000 });
  if (await add.isDisabled()) {
    // The first variant is out of stock: pick one the server has in stock.
    const variants = page.locator("fieldset button[aria-pressed]");
    const total = await variants.count();
    for (let index = 0; index < total; index += 1) {
      await variants.nth(index).click();
      await page.waitForTimeout(300);
      if (!(await add.isDisabled())) break;
    }
  }
  expect(
    await add.isDisabled(),
    "the product page offers an in-stock variant",
  ).toBe(false);
  await add.click();
  await expect(
    page.getByText("Added to cart").first(),
    "the product page confirms the add",
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * The cart's permitted interaction: change a line's quantity and wait for the
 * server's quote to follow. Returns the order summary's total row before and
 * after — the server's own figure, never a client-side computation.
 */
export async function changeCartQuantity(
  page: Page,
): Promise<{ before: string; after: string }> {
  await waitForQuoteToSettle(page);
  const totalRow = page
    .locator("dt")
    .filter({ hasText: /^Total$/ })
    .first();
  await expect(totalRow, "the order summary renders its total row").toBeVisible(
    { timeout: 30_000 },
  );
  const before = (await totalRow.locator("xpath=..").innerText()).trim();

  const group = page.getByRole("group", { name: /^Quantity for / }).first();
  await expect(group, "the cart line renders its quantity stepper").toBeVisible(
    { timeout: 30_000 },
  );
  const input = group.getByRole("spinbutton");
  const beforeQuantity = await input.inputValue();
  // Walk the quantity in whichever direction the stock allows: a long-lived
  // disposable cart can sit at the ceiling, and the interaction is still the
  // stepper's own server round trip.
  const increase = group.getByRole("button", { name: "Increase quantity" });
  const decrease = group.getByRole("button", { name: "Decrease quantity" });
  const stepper = (await increase.isDisabled()) ? decrease : increase;
  await expect(
    stepper,
    "the quantity stepper offers a direction the stock allows",
  ).toBeEnabled();
  await stepper.click();
  await expect(input, "the stepper holds the new quantity").not.toHaveValue(
    beforeQuantity,
  );
  await waitForQuoteToSettle(page);
  const after = (await totalRow.locator("xpath=..").innerText()).trim();
  return { before, after };
}

/**
 * The account's permitted interaction: switch a tab of the account
 * navigation — the URL-driven selection the platform owns.
 */
export async function switchAccountTab(
  page: Page,
  name: string,
): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true }).first();
  await expect(tab, `the account nav offers the "${name}" tab`).toBeVisible({
    timeout: 30_000,
  });
  await tab.click();
  await expect(
    tab,
    `the "${name}" tab becomes the selected one`,
  ).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
}

/**
 * The rails the SERVER offered this store. Zero is a legitimate platform
 * state (a store that has taken no payment method live), and a caller that
 * cannot prove the interaction says so instead of pretending it passed.
 */
export async function paymentRailCount(page: Page): Promise<number> {
  return page.locator('input[name="fq-payment-method"]').count();
}

/**
 * The checkout's permitted interaction: choose a payment rail and prove the
 * choice sticks — through the server's re-quote, which is what re-renders the
 * rail. Only the rails the SERVER offered are ever offered here.
 */
export async function choosePaymentRail(page: Page): Promise<string> {
  const rails = page.locator('input[name="fq-payment-method"]');
  const offered = await rails.count();
  expect(
    offered,
    "the composed checkout renders the rails the server offered",
  ).toBeGreaterThan(0);
  let target = rails.first();
  for (const rail of await rails.all()) {
    if (!(await rail.isChecked())) {
      target = rail;
      break;
    }
  }
  await target.check();
  await expect(target, "the chosen rail is the selected one").toBeChecked();
  await waitForQuoteToSettle(page);
  await expect(
    target,
    "the chosen rail is still the selected one after the re-quote",
  ).toBeChecked();
  return (await target.getAttribute("value")) ?? "";
}

/* ------------------------------------------------------------------- the guard */

/**
 * The needles of the "no session is ever faked" guard.
 *
 * **They are assembled from fragments on purpose.** The guard scans this
 * file's own source, so a literal needle would trip the scan on the table
 * that carries it. Every fragment below is a thing the platform's own
 * session path never does.
 */
const FAKING_NEEDLES: readonly { needle: string; why: string }[] = [
  {
    needle: ["add", "Init", "Script"].join(""),
    why: "a pre-load script injection",
  },
  {
    needle: ["set", "Extra", "HTTP", "Headers"].join(""),
    why: "an injected header",
  },
  { needle: ["route", ".fulfill"].join(""), why: "a faked response" },
  { needle: ["set", "Session"].join(""), why: "a faked session" },
  {
    needle: ["local", "Storage", ".set", "Item"].join(""),
    why: "a hand-written storage entry",
  },
];

/**
 * Prove that the lane's own sources carry no session faking: no credential
 * is written, no header is injected, no response is faked and no storage
 * entry is hand-written. The session the lane uses comes from the real
 * `/auth` form — the shipped `ensureSongoskritiActive` helper.
 */
export function assertNoSessionFaking(files: readonly string[]): void {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const { needle, why } of FAKING_NEEDLES) {
      expect(source, `${file} must not carry ${why}`).not.toContain(needle);
    }
  }
}

/**
 * True when the browser holds a REAL GoTrue session: a localStorage entry
 * under the platform's auth key whose value carries a signed JWT (three
 * base64url segments). A hand-written session would not be a JWT.
 */
export async function holdsRealSession(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      return Object.keys(localStorage)
        .filter((key) => key.includes("auth-token") || key.startsWith("sb-"))
        .some((key) =>
          /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/.test(
            localStorage.getItem(key) ?? "",
          ),
        );
    } catch {
      // An opaque origin has no storage — there is no session to judge.
      return false;
    }
  });
}
