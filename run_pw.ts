import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setViewportSize({ width: 1280, height: 1024 });
  const response = await page.goto("http://localhost:3001/theme-preview/songoskriti?template=product&focus=dhakai-jamdani-heritage-saree");
  console.log("Status:", response?.status());
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: "screenshot_saree.png", fullPage: true });
  await browser.close();
})();
