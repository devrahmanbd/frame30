import { expect, type Page } from "@playwright/test";

/**
 * Songoskriti activation helpers.
 *
 * Real UI/server path only — no auth stubbing anywhere. Mirrors the
 * activation flow exercised by `.e2e/plugin-authenticated-journey.spec.ts`:
 *
 *   1. drive the real `/auth` form to mint a real GoTrue session;
 *   2. call the real themes server functions
 *      (`themesWorkspaceFn` / `themeInstallFn` / `themeActivateFn` imported
 *      from `/src/lib/themes/appearance.functions.ts`) to install + activate
 *      the theme;
 *   3. verify activation against `store_themes` `isActive` on every call.
 *
 * Both exports are idempotent: a second call is a no-op when a real session
 * already exists and the target theme is already active. Safe to rerun
 * across spec runs — an already-active store returns early.
 *
 * Credentials come from `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD`
 * (seeded through the real GoTrue admin API per
 * `docs/15-e2e/loopback-auth-setup.md`, never committed). Absent creds ⇒ the
 * helpers throw; callers (`test.skip`) gate on them rather than faking a
 * session.
 */

/** Read-only: merchant creds for the real /auth form, or null when unset. */
export function merchantCreds(): { email: string; password: string } | null {
  const email = process.env["E2E_MERCHANT_EMAIL"]?.trim();
  const password = process.env["E2E_MERCHANT_PASSWORD"] ?? "";
  return email && password ? { email, password } : null;
}

/** Current active theme key per `store_themes`, or null when none active. */
export async function activeThemeKey(page: Page): Promise<string | null> {
  const installed = await themesWorkspace(page);
  return installed.find((t) => t.isActive)?.key ?? null;
}

type ThemeRow = { id: string; key: string | null; isActive: boolean | null };

const COLD_GOTO_TIMEOUT = 120_000;

/** Drive the REAL /auth form until a REAL session lands in localStorage. */
async function loginThroughRealForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const response = await page.goto("/auth", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submit = page.locator('button[type="submit"]').first();
  await expect(emailInput, "real login form renders").toBeVisible({
    timeout: 60_000,
  });
  // Cold dev server: route chunks stream after DOM-ready; wait for the
  // React hydration marker on the submit button before submitting.
  await page.waitForFunction(
    () => {
      const btn = document.querySelector("button[type=submit]");
      return (
        btn !== null &&
        Object.keys(btn).some((key) => key.startsWith("__reactProps$"))
      );
    },
    undefined,
    { timeout: COLD_GOTO_TIMEOUT },
  );
  for (let attempt = 1; attempt <= 4; attempt++) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await submit.click();
    const won = await page
      .waitForURL(/\/dashboard/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (won) break;
    const alert =
      (await page
        .locator('[role="alert"]')
        .first()
        .textContent()
        .catch(() => "")) ?? "";
    if (alert.trim()) {
      throw new Error(
        `real login refused by the backend: ${alert.slice(0, 200)}`,
      );
    }
    if (attempt === 4) break;
    await expect(emailInput, "login form survives reload").toBeVisible({
      timeout: 60_000,
    });
  }
  await expect(page, "real login reaches the dashboard").toHaveURL(
    /\/dashboard/,
    { timeout: 30_000 },
  );
  expect(
    await authStorageTokens(page),
    "a real Supabase session must exist after login",
  ).not.toEqual([]);
}

async function authStorageTokens(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // A fresh page starts at about:blank, where localStorage is denied
    // (opaque origin). Treat that as "no session" so callers proceed to the
    // real login flow instead of throwing.
    try {
      return Object.keys(localStorage).filter(
        (k) => k.includes("auth-token") || k.startsWith("sb-"),
      );
    } catch {
      return [];
    }
  });
}

async function requireSession(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  if ((await authStorageTokens(page)).length > 0) return;
  await loginThroughRealForm(page, creds.email, creds.password);
}

async function themesWorkspace(page: Page): Promise<ThemeRow[]> {
  return page.evaluate(async () => {
    const fns =
      (await import("/src/lib/themes/appearance.functions.ts")) as unknown as {
        themesWorkspaceFn: () => Promise<{ installed?: ThemeRow[] | null }>;
      };
    const workspace = await fns.themesWorkspaceFn();
    return (workspace?.installed ?? []) as ThemeRow[];
  });
}

async function themeInstall(
  page: Page,
  key: string,
): Promise<{ id?: string } | null> {
  return page.evaluate(
    async (data: { key: string }) => {
      const fns =
        (await import("/src/lib/themes/appearance.functions.ts")) as unknown as {
          themeInstallFn: (args: {
            data: { key: string };
          }) => Promise<{ id?: string } | null>;
        };
      return fns.themeInstallFn({ data });
    },
    { key },
  );
}

async function themeActivate(page: Page, id: string): Promise<unknown> {
  return page.evaluate(
    async (data: { id: string }) => {
      const fns =
        (await import("/src/lib/themes/appearance.functions.ts")) as unknown as {
          themeActivateFn: (args: { data: { id: string } }) => Promise<unknown>;
        };
      return fns.themeActivateFn({ data });
    },
    { id },
  );
}

/** Install (if missing) then activate `key`, verifying `isActive` after. */
async function ensureThemeActive(page: Page, key: string): Promise<void> {
  const installed = await themesWorkspace(page);
  const active = installed.find((t) => t.isActive);
  if (active?.key === key) return; // already the active theme — no-op
  let target = installed.find((t) => t.key === key);
  if (!target) {
    const res = await themeInstall(page, key);
    const refetched = await themesWorkspace(page);
    target =
      refetched.find((t) => t.id === res?.id) ??
      refetched.find((t) => t.key === key);
  }
  if (!target?.id) throw new Error(`could not install theme "${key}"`);
  await themeActivate(page, target.id);
  const after = await themesWorkspace(page);
  const now = after.find((t) => t.id === target.id);
  if (!now?.isActive)
    throw new Error(`activation of "${key}" not visible in store_themes`);
}

/** Idempotent: real login (if needed) + ensure songoskriti is the active theme. */
export async function ensureSongoskritiActive(page: Page): Promise<void> {
  const creds = merchantCreds();
  if (!creds) {
    throw new Error(
      "E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD are not set; cannot activate through the real UI without credentials",
    );
  }
  await requireSession(page, creds);
  await ensureThemeActive(page, "songoskriti");
}

/** Idempotent: real login (if needed) + set `themeKey` as the active theme. */
export async function setActiveTheme(
  page: Page,
  themeKey: string,
): Promise<void> {
  const creds = merchantCreds();
  if (!creds) {
    throw new Error(
      "E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD are not set; cannot activate through the real UI without credentials",
    );
  }
  await requireSession(page, creds);
  await ensureThemeActive(page, themeKey);
}
