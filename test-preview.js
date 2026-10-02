import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err.message));

  const response = await page.goto(
    "http://localhost:3001/theme-preview/oceanblue-final",
    { waitUntil: "networkidle" },
  );
  console.log("STATUS:", response.status());

  await browser.close();
})();
