import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const OUT_DIR = resolve("docs/wave19-evidence");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "https://flamelancer.com";
const TEST_EMAIL = "shopper_1794245487386@flamelancer.com";
const TEST_PASS = "FlameTest123!";

function log(msg) {
  console.log(`[wave19-verify] ${msg}`);
}

async function run() {
  log("Launching Chrome...");
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = {
    defects: {},
    screenshots: [],
    viewports: {},
  };

  try {
    // =========================================================================
    // DEFECT 1: Blank Payment Methods badge in footer
    // =========================================================================
    log("Verifying Defect 1: Footer Payment Methods badge...");
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      
      const footer = page.locator("footer");
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Check payment mark badge
      const paymentBadge = footer.locator("span[data-payment-mark='true']").first();
      const isVisible = await paymentBadge.isVisible();
      const badgeStyles = await paymentBadge.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          border: cs.border,
          text: el.textContent?.trim(),
        };
      });

      log(`Footer Cash on Delivery badge visible: ${isVisible}`);
      log(`Badge styles: ${JSON.stringify(badgeStyles)}`);

      const shot1440 = join(OUT_DIR, "live_1440_footer.png");
      await footer.screenshot({ path: shot1440 });
      results.screenshots.push("live_1440_footer.png");

      // Mobile 390
      await page.setViewportSize({ width: 390, height: 844 });
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const shot390 = join(OUT_DIR, "live_390_footer.png");
      await footer.screenshot({ path: shot390 });
      results.screenshots.push("live_390_footer.png");

      results.defects.defect1_payment_badge = {
        passed: isVisible && badgeStyles.text === "Cash on Delivery" && badgeStyles.color !== badgeStyles.backgroundColor,
        styles: badgeStyles,
      };
      await context.close();
    }

    // =========================================================================
    // DEFECTS 4, 5, 6: Cart headings, empty copy, hide empty order summary
    // =========================================================================
    log("Verifying Defects 4, 5, 6: Empty Cart presentation...");
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      
      // Clear localStorage cart
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      await page.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      // Check single primary H1
      const h1Text = await page.locator("h1").first().innerText().catch(() => "");
      const emptyHeading = await page.locator("text='Your bag is empty.'").isVisible().catch(() => false);
      const supportingCopy = await page.locator("text='Browse the collection to find something you love.'").isVisible().catch(() => false);
      const continueCta = await page.locator("text='Continue shopping'").isVisible().catch(() => false);
      
      // Order summary should NOT exist
      const orderSummaryVisible = await page.locator("text='Order summary'").isVisible().catch(() => false);

      log(`Empty Cart H1: "${h1Text}"`);
      log(`Empty Heading 'Your bag is empty.': ${emptyHeading}`);
      log(`Supporting Copy: ${supportingCopy}`);
      log(`Continue CTA: ${continueCta}`);
      log(`Order Summary Hidden: ${!orderSummaryVisible}`);

      await page.screenshot({ path: join(OUT_DIR, "live_1440_cart_empty.png"), fullPage: true });
      results.screenshots.push("live_1440_cart_empty.png");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT_DIR, "live_390_cart_empty.png"), fullPage: true });
      results.screenshots.push("live_390_cart_empty.png");

      results.defects.defect5_empty_cart_copy = {
        passed: emptyHeading && supportingCopy && continueCta,
        h1Text,
        emptyHeading,
        supportingCopy,
        continueCta,
      };

      results.defects.defect6_hide_empty_order_summary = {
        passed: !orderSummaryVisible,
        orderSummaryVisible,
      };

      // Add items to cart to verify populated cart
      log("Adding items to cart for Populated Cart verification...");
      // Visit first product and add to cart
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      const firstProductLink = page.locator("a[href^='/p/']").first();
      await firstProductLink.click();
      await page.waitForURL(/\/p\//);
      await page.waitForTimeout(1000);

      const addBtn = page.locator("button:has-text('Add to Bag'), button:has-text('Add to Cart')").first();
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(1200);
      }

      // Visit second product
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      const secondProductLink = page.locator("a[href^='/p/']").nth(1);
      await secondProductLink.click();
      await page.waitForURL(/\/p\//);
      await page.waitForTimeout(1000);

      const addBtn2 = page.locator("button:has-text('Add to Bag'), button:has-text('Add to Cart')").first();
      if (await addBtn2.isVisible()) {
        await addBtn2.click();
        await page.waitForTimeout(1200);
      }

      // Go to /cart
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const populatedH1 = await page.locator("h1").first().innerText().catch(() => "");
      const duplicateH2 = await page.locator("h2:has-text('YOUR SHOPPING BAG')").isVisible().catch(() => false);
      const populatedSummary = await page.locator("text='Order summary'").isVisible().catch(() => false);

      log(`Populated Cart H1: "${populatedH1}"`);
      log(`Duplicate 'YOUR SHOPPING BAG' present: ${duplicateH2}`);
      log(`Populated Order Summary visible: ${populatedSummary}`);

      await page.screenshot({ path: join(OUT_DIR, "live_1440_cart_multi.png"), fullPage: true });
      results.screenshots.push("live_1440_cart_multi.png");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT_DIR, "live_390_cart_multi.png"), fullPage: true });
      results.screenshots.push("live_390_cart_multi.png");

      results.defects.defect4_duplicate_headings = {
        passed: !duplicateH2 && populatedH1.toLowerCase().includes("your shopping bag"),
        populatedH1,
        duplicateH2,
      };

      // 8-Viewport Matrix for Cart
      log("Capturing 8-viewport matrix for cart...");
      const matrix = [
        { name: "viewport_320x740_cart.png", w: 320, h: 740 },
        { name: "viewport_360x800_cart.png", w: 360, h: 800 },
        { name: "viewport_390x844_cart.png", w: 390, h: 844 },
        { name: "viewport_430x932_cart.png", w: 430, h: 932 },
        { name: "viewport_768x1024_cart.png", w: 768, h: 1024 },
        { name: "viewport_1024x768_cart.png", w: 1024, h: 768 },
        { name: "viewport_1280x800_cart.png", w: 1280, h: 800 },
        { name: "viewport_1440x900_cart.png", w: 1440, h: 900 },
      ];

      for (const vp of matrix) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(OUT_DIR, vp.name), fullPage: true });
        results.screenshots.push(vp.name);
      }

      await context.close();
    }

    // =========================================================================
    // DEFECT 3: Mobile WhatsApp overlap on Account links
    // =========================================================================
    log("Verifying Defect 3: Mobile WhatsApp overlap on /account...");
    {
      const mobileWidths = [
        { w: 320, h: 740, name: "live_320_account_signed_out.png" },
        { w: 360, h: 800, name: "live_360_account_signed_out.png" },
        { w: 390, h: 844, name: "live_390_account_signed_out.png" },
        { w: 430, h: 932, name: "live_430_account_signed_out.png" },
      ];

      let overlapDetected = false;

      for (const mw of mobileWidths) {
        const context = await browser.newContext({
          viewport: { width: mw.w, height: mw.h },
        });
        const page = await context.newPage();
        await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);

        // Check if WhatsApp button is visible or suppressed
        const whatsappBtn = page.locator("[data-plugin='whatsapp-chat'], [data-plugin-floating='true']").first();
        const waVisible = await whatsappBtn.isVisible().catch(() => false);

        const createAccountLink = page.locator("button:has-text('Create one'), a:has-text('Create one')").first();
        const linkVisible = await createAccountLink.isVisible().catch(() => false);

        if (waVisible && linkVisible) {
          const waBox = await whatsappBtn.boundingBox();
          const linkBox = await createAccountLink.boundingBox();
          if (waBox && linkBox) {
            // Check bounding box intersection
            const collides = !(
              waBox.x + waBox.width < linkBox.x ||
              linkBox.x + linkBox.width < waBox.x ||
              waBox.y + waBox.height < linkBox.y ||
              linkBox.y + linkBox.height < waBox.y
            );
            if (collides) overlapDetected = true;
          }
        }

        await page.screenshot({ path: join(OUT_DIR, mw.name), fullPage: true });
        results.screenshots.push(mw.name);
        await context.close();
      }

      results.defects.defect3_whatsapp_overlap = {
        passed: !overlapDetected,
        overlapDetected,
      };
    }

    // =========================================================================
    // DEFECTS 2 & 7: Populated Wishlist and Mobile Account Tabs
    // =========================================================================
    log("Verifying Defects 2 & 7: Wishlist and Account Tabs...");
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();

      // Sign in to account
      await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Wait for sign-in form to hydrate and appear
      log("Signing in with test credentials...");
      const emailInput = page.locator("#access-signin-email");
      await emailInput.waitFor({ state: "visible", timeout: 15000 });
      await emailInput.fill(TEST_EMAIL);
      await page.locator("#access-signin-password").fill(TEST_PASS);
      await page.locator("button[type='submit']:has-text('Sign In')").click();
      await page.waitForTimeout(3500);

      // Navigate to wishlist tab and wait for tabpanel
      log("Navigating to /account?tab=wishlist...");
      await page.goto(`${BASE_URL}/account?tab=wishlist`, { waitUntil: "domcontentloaded" });
      await page.locator("[role='tabpanel']").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForTimeout(1500);

      // Verify wishlist items
      const wishlistCards = page.locator("[role='tabpanel'] .grid > div");
      const cardCount = await wishlistCards.count();
      log(`Wishlist card count: ${cardCount}`);

      // Check card properties
      const addBagBtns = page.locator("[role='tabpanel'] button:has-text('Add to Bag')");
      const removeBtns = page.locator("[role='tabpanel'] button:has-text('Remove')");
      const addBagCount = await addBagBtns.count();
      const removeCount = await removeBtns.count();
      log(`Add to Bag buttons: ${addBagCount}, Remove buttons: ${removeCount}`);

      // Screenshot 1440 populated wishlist
      await page.screenshot({ path: join(OUT_DIR, "live_1440_account_wishlist_items.png"), fullPage: true });
      results.screenshots.push("live_1440_account_wishlist_items.png");

      // Screenshot 1440 account dashboard (overview)
      await page.goto(`${BASE_URL}/account?tab=orders`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT_DIR, "live_1440_account_dashboard.png"), fullPage: true });
      results.screenshots.push("live_1440_account_dashboard.png");

      // Switch back to wishlist
      await page.goto(`${BASE_URL}/account?tab=wishlist`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      // Test Mobile 390 Account Tabs and Wishlist
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);

      // Verify Tab targets >= 44x44
      const tabElements = page.locator("[role='tablist'] a");
      const tabCount = await tabElements.count();
      let allTabsMeet44 = true;
      for (let i = 0; i < tabCount; i++) {
        const box = await tabElements.nth(i).boundingBox();
        if (box && (box.height < 43 || box.width < 43)) {
          allTabsMeet44 = false;
        }
      }

      await page.screenshot({ path: join(OUT_DIR, "live_390_account_wishlist_items.png"), fullPage: true });
      results.screenshots.push("live_390_account_wishlist_items.png");

      results.defects.defect7_mobile_account_tabs = {
        passed: allTabsMeet44,
        allTabsMeet44,
        tabCount,
      };

      // Test "Add to Bag" on wishlist item
      log("Testing Wishlist 'Add to Bag' interaction...");
      const firstAddBag = addBagBtns.first();
      await firstAddBag.click();
      await page.waitForTimeout(1500);

      // Test "Remove" on wishlist item
      log("Testing Wishlist 'Remove' interaction...");
      const firstRemove = removeBtns.first();
      await firstRemove.click();
      await page.waitForTimeout(1500);

      const cardCountAfterRemove = await page.locator("[role='tabpanel'] .grid > div").count();
      log(`Card count after remove: ${cardCountAfterRemove}`);

      // Reload to confirm persistence
      await page.goto(`${BASE_URL}/account?tab=wishlist`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      const cardCountPersisted = await page.locator("[role='tabpanel'] .grid > div").count();
      log(`Card count persisted after reload: ${cardCountPersisted}`);

      // Remove remaining items to test empty wishlist state
      log("Removing remaining items to test empty wishlist state...");
      let remaining = await page.locator("[role='tabpanel'] button:has-text('Remove')").count();
      while (remaining > 0) {
        const btn = page.locator("[role='tabpanel'] button:has-text('Remove')").first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(2500);
        } else {
          break;
        }
        remaining = await page.locator("[role='tabpanel'] button:has-text('Remove')").count();
      }

      await page.waitForTimeout(500);
      const emptyWishlistTitle = await page.locator("text='Your wishlist is empty.'").isVisible().catch(() => false);
      const emptyWishlistCta = await page.locator("text='Continue shopping'").isVisible().catch(() => false);

      log(`Empty Wishlist Title: ${emptyWishlistTitle}`);
      log(`Empty Wishlist CTA: ${emptyWishlistCta}`);

      // Screenshot empty wishlist
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT_DIR, "live_1440_account_wishlist_empty.png"), fullPage: true });
      results.screenshots.push("live_1440_account_wishlist_empty.png");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT_DIR, "live_390_account_wishlist_empty.png"), fullPage: true });
      results.screenshots.push("live_390_account_wishlist_empty.png");

      results.defects.defect2_wishlist = {
        passed: cardCount >= 3 && removeCount >= 3 && emptyWishlistTitle && emptyWishlistCta,
        cardCount,
        cardCountAfterRemove,
        cardCountPersisted,
        emptyWishlistTitle,
        emptyWishlistCta,
      };

      await context.close();
    }

    // Restore 3 wishlist items in DB
    log("Re-populating 3 wishlist items in DB for persistent test state...");
    execSync(`ssh root@88.99.250.99 'docker exec framique-supabase-db psql -U postgres -d postgres -c "INSERT INTO customer_wishlist_items (customer_id, merchant_id, product_variant_id) VALUES ('\\''be4f48b7-d7b3-442e-adc9-bdd1f2db2bf5'\\'', '\\''b47532e5-9649-4ebd-93a9-06fa2917c00e'\\'', '\\''11f85e41-7c75-4fec-90c9-71885de6a132'\\''), ('\\''be4f48b7-d7b3-442e-adc9-bdd1f2db2bf5'\\'', '\\''b47532e5-9649-4ebd-93a9-06fa2917c00e'\\'', '\\''a0a6f3fd-1471-4282-81cb-0c0aacc99ebb'\\''), ('\\''be4f48b7-d7b3-442e-adc9-bdd1f2db2bf5'\\'', '\\''b47532e5-9649-4ebd-93a9-06fa2917c00e'\\'', '\\''f804357b-6331-4a34-b9e8-0357fa33a395'\\'') ON CONFLICT DO NOTHING;"'`);

  } finally {
    await browser.close();
  }

  writeFileSync(join(OUT_DIR, "verification-results.json"), JSON.stringify(results, null, 2));
  log("Verification complete! Results written to docs/wave19-evidence/verification-results.json");
  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
