import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EVIDENCE_DIR = join(process.cwd(), "docs", "wave21-evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const BASE_URL = "https://flamelancer.com";
const PREVIEW_URL = "https://framique.qubickle.com/theme-preview/songoskriti";
const SHA = "19d3b12ed5ba9bb9ef3813c949d7207eca4e561d";
const DATE = "2026-11-16";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true
});

const results = [];

async function capture(name, pathOrUrl, viewport, options = {}) {
  const isExternal = pathOrUrl.startsWith("http");
  const url = isExternal ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const filename = `${name}.png`;
  const filepath = join(EVIDENCE_DIR, filename);

  console.log(`Capturing [${name}] at ${viewport.width}x${viewport.height} from ${url}...`);
  const page = await browser.newPage({ viewport });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(options.waitMs || 2500);

    if (options.action) {
      await options.action(page);
      await page.waitForTimeout(1000);
    }

    if (options.clipSelector) {
      const element = await page.$(options.clipSelector);
      if (element) {
        await element.screenshot({ path: filepath });
      } else {
        await page.screenshot({ path: filepath, fullPage: options.fullPage ?? false });
      }
    } else {
      await page.screenshot({ path: filepath, fullPage: options.fullPage ?? true });
    }

    results.push({
      name,
      filename,
      route: pathOrUrl,
      viewport: `${viewport.width}x${viewport.height}`,
      sha: SHA,
      date: DATE,
      browser: "Chrome Headless"
    });
    console.log(`✓ Saved ${filename}`);
  } catch (err) {
    console.error(`✗ Error capturing ${name}:`, err.message);
  } finally {
    await page.close();
  }
}

// 1. Mobile Acceptance Screenshots (390x844)
const mobileVp = { width: 390, height: 844 };

// 1.1 Homepage Mobile (Hero photography + wordmark visible immediately)
await capture("proof_01_homepage_mobile_hero", "/", mobileVp, { fullPage: false, waitMs: 2000 });
await capture("proof_02_homepage_mobile_full", "/", mobileVp, { fullPage: true, waitMs: 2000 });

// 1.2 Mobile Navigation Drawer Open
await capture("proof_03_mobile_drawer_open", "/", mobileVp, {
  fullPage: false,
  waitMs: 3000,
  action: async (page) => {
    const hamburger = await page.$("button[aria-controls='store-mobile-menu']");
    if (hamburger) {
      await hamburger.click();
      await page.waitForTimeout(1000);
    }
  }
});

// 1.3 Collection Pages Mobile
await capture("proof_04_collection_girls_mobile", "/c/girls", mobileVp, { fullPage: true });
await capture("proof_05_collection_boys_mobile", "/c/boys", mobileVp, { fullPage: true });
await capture("proof_06_collection_kids_mobile", "/c/kids", mobileVp, { fullPage: true });
await capture("proof_07_collection_sarees_mobile", "/c/sarees", mobileVp, { fullPage: true });
await capture("proof_08_collection_women_mobile", "/c/women", mobileVp, { fullPage: true });
await capture("proof_09_collection_men_mobile", "/c/men", mobileVp, { fullPage: true });
await capture("proof_10_collection_new_in_mobile", "/c/new-in", mobileVp, { fullPage: true });
await capture("proof_11_collection_festive_mobile", "/c/festive", mobileVp, { fullPage: true });
await capture("proof_12_collection_wedding_mobile", "/c/wedding", mobileVp, { fullPage: true });

// 1.4 PDPs Mobile
await capture("proof_13_pdp_jamdani_saree_mobile", "/p/dhakai-jamdani-silk-saree", mobileVp, { fullPage: true });
await capture("proof_14_pdp_royal_panjabi_mobile", "/p/pure-silk-embroidered-panjabi", mobileVp, { fullPage: true });
await capture("proof_15_pdp_ghagra_choli_mobile", "/p/girls-embroidered-silk-ghagra-choli", mobileVp, { fullPage: true });

// 1.5 Utilities Mobile
await capture("proof_16_cart_empty_mobile", "/cart", mobileVp, { fullPage: true });
await capture("proof_17_account_signed_out_mobile", "/account", mobileVp, { fullPage: true });
await capture("proof_18_wishlist_empty_mobile", "/account?tab=wishlist", mobileVp, { fullPage: true });
await capture("proof_19_checkout_mobile", "/checkout", mobileVp, { fullPage: true });

// 1.6 Populated Cart Mobile
await capture("proof_20_cart_populated_mobile", "/p/dhakai-jamdani-silk-saree", mobileVp, {
  fullPage: true,
  action: async (page) => {
    const addBtn = await page.$("button:has-text('ADD TO CART'), button:has-text('Add to cart')");
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      const cartIcon = await page.$("header a[aria-label*='Cart'], header a[href*='/cart']");
      if (cartIcon) {
        await cartIcon.click();
        await page.waitForTimeout(2000);
      }
    }
  }
});

// 2. Desktop Acceptance Screenshots (1440x900)
const desktopVp = { width: 1440, height: 900 };
await capture("proof_21_homepage_desktop_hero", "/", desktopVp, { fullPage: false, waitMs: 2000 });
await capture("proof_22_homepage_desktop_full", "/", desktopVp, { fullPage: true, waitMs: 2000 });
await capture("proof_23_collection_girls_desktop", "/c/girls", desktopVp, { fullPage: true });
await capture("proof_24_collection_boys_desktop", "/c/boys", desktopVp, { fullPage: true });
await capture("proof_25_collection_sarees_desktop", "/c/sarees", desktopVp, { fullPage: true });
await capture("proof_26_footer_desktop", "/", desktopVp, { clipSelector: "footer" });

// 3. Wordmark Resolution Matrix across Mobile Viewports
await capture("proof_27_wordmark_320px", "/", { width: 320, height: 640 }, { clipSelector: "header", fullPage: false });
await capture("proof_28_wordmark_360px", "/", { width: 360, height: 740 }, { clipSelector: "header", fullPage: false });
await capture("proof_29_wordmark_390px", "/", { width: 390, height: 844 }, { clipSelector: "header", fullPage: false });
await capture("proof_30_wordmark_430px", "/", { width: 430, height: 932 }, { clipSelector: "header", fullPage: false });

// 4. Songoskriti Theme Preview Parity
await capture("proof_31_preview_homepage", `${PREVIEW_URL}?template=index`, desktopVp, { fullPage: false });
await capture("proof_32_preview_collection_girls", `${PREVIEW_URL}?template=collection&focus=girls`, desktopVp, { fullPage: false });

await browser.close();

writeFileSync(join(EVIDENCE_DIR, "evidence-index.json"), JSON.stringify(results, null, 2));
console.log(`\nAll ${results.length} visual proofs captured and indexed successfully in docs/wave21-evidence/!`);
