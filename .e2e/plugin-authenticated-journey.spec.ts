import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Plugin journey — AUTHENTICATED half through the REAL editor
 * (`dashboard/content/editor` → `EditorShell` → `StudioBuilder`).
 *
 * The user requires testing through the ACTUAL authenticated UI with a real
 * login and a seeded test merchant if the harness supports it. It does not:
 *
 * - Client auth endpoint: `VITE_SUPABASE_URL` resolves from `.env.local`
 *   (which wins over `.env` under Vite resolution) to
 *   `https://dummy.supabase.co` — a non-existent host. The production host
 *   in `.env` (`framebase.qubickle.com`) is external and unreachable under
 *   the hermetic loopback-only rule.
 * - No seeded merchant exists: no seed scripts, no `E2E_*` credentials, no
 *   hermetic session issuer on loopback. The `supabase-auth` container on
 *   this box is production-bound (`shield.ghostmaster.shop`) with no
 *   published ports.
 * - Auth is Supabase session auth (`supabase.auth.signInWithPassword`,
 *   session in localStorage); `_authenticated/route.tsx` `beforeLoad`
 *   throws `redirect({ to: "/auth" })` with no session.
 *
 * Auth stubbing (fake sessions, mocked redirects) is FORBIDDEN, so no
 * authenticated editor state can be produced here. This spec therefore:
 *
 * 1. PROVES THE WALL through the real UI: the actual `/auth` login form is
 *    driven with a synthetic hermetic probe credential
 *    (`e2e-wall-probe@example.invalid` — never a real account); the real
 *    Supabase client attempts the real backend, fails, and no session is
 *    created. No production system is touched (the configured host does not
 *    exist; hermetic routing aborts any non-loopback attempt first).
 * 2. Pins the editor gate on the REAL editor routes
 *    (`/dashboard/content/editor?kind=page|post`): redirect to `/auth`, the
 *    login form shown instead of `EditorShell`/`StudioBuilder`.
 * 3. Pins the full authenticated chain STATICALLY (read-only source reads
 *    of the exact modules that would execute with a session): install →
 *    tray → insert → schema controls → save/reload → preview → publish →
 *    theme switch → storefront render.
 * 4. Marks the 3 interactive steps as skipped-with-reason (mirroring the
 *    anonymous spec's auth-gated trio): they stay skipped if and only if no
 *    real session exists — which tests (1)+(2) prove at runtime.
 *
 * Cleanup: collectors disposed in afterAll; the dev server is owned by the
 * Playwright webServer entry. No processes spawned here. No dev server is
 * started by this spec.
 */

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

let collectors: NetworkCollector[] = [];

test.afterAll(() => {
  for (const c of collectors) c.dispose();
  collectors = [];
});

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector; blocked: string[] }> {
  const collector = new NetworkCollector(page).attach();
  collectors.push(collector);
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  return { collector, blocked };
}

// The `/auth` route chunk compiles lazily; the SSR warm-up in global-setup
// covers only the preview route, so the first navigation here carries the
// compile budget while every assertion keeps strict timeouts.
const COLD_GOTO_TIMEOUT = 120_000;

async function authStorageTokens(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => k.includes("auth-token") || k.startsWith("sb-"),
    ),
  );
}

test("auth wall (real UI): actual login attempt creates no session", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { collector, blocked } = await hermeticPage(page);
  const response = await page.goto("/auth", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);

  // The REAL login form (src/routes/auth.tsx): email + password + Sign in.
  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  const submit = page.locator('button[type="submit"]').first();
  await expect(email, "real login form renders email field").toBeVisible({
    timeout: 30_000,
  });
  await expect(password, "real login form renders password field").toBeVisible();
  await expect(submit, "real login form renders submit").toContainText(
    /sign in/i,
  );

  // Synthetic hermetic probe credential — syntactically valid (passes the
  // form's own 8-char minimum) but never a real account on any backend.
  await email.fill("e2e-wall-probe@example.invalid");
  await password.fill("WallProbe-1234-xxxx");
  await submit.click();

  // The attempt must surface SOMEWHERE observable: an error alert, a status
  // notice (rate-guard path), or an aborted non-loopback request. The wait
  // is tolerant (a hanging server round-trip to the dummy host must not
  // flake the proof); the hard invariants below hold regardless.
  const noticed = await page
    .locator('[role="alert"], [role="status"]')
    .first()
    .waitFor({ timeout: 40_000 })
    .then(() => true)
    .catch(() => false);
  // eslint-disable-next-line no-console
  console.log(
    `[e2e auth-wall] visible auth feedback: ${noticed}; blocked non-loopback: ${blocked.length}`,
  );

  // HARD INVARIANTS — the exact wall:
  // (a) no Supabase session exists in storage (sign-in never completed);
  expect(await authStorageTokens(page), "no session may be created").toEqual(
    [],
  );
  // (b) we are still on /auth (no redirect to /dashboard ever fired);
  await expect(page, "failed login stays on /auth").toHaveURL(/\/auth/);
  // (c) nothing left loopback (the configured backend is non-loopback, so a
  // real attempt either died in DNS or was aborted hermetically — either way
  // no external response completed).
  expect(collector.externalResponses()).toEqual([]);
});

test("editor gate: real content editor routes redirect unauthenticated", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  for (const kind of ["page", "post"] as const) {
    const response = await page.goto(`/dashboard/content/editor?kind=${kind}`, {
      waitUntil: "domcontentloaded",
      timeout: COLD_GOTO_TIMEOUT,
    });
    expect(response?.status()).toBe(200);
    // `_authenticated` beforeLoad: no session ⇒ redirect to /auth. The
    // client-side gate fires after the route chunk loads; assertions below
    // keep strict timeouts.
    await expect(
      page,
      `unauthenticated content editor (${kind}) redirects to /auth`,
    ).toHaveURL(/\/auth/, { timeout: 90_000 });
    // What renders instead is the REAL login form — never EditorShell.
    await expect(
      page.locator('input[type="email"]').first(),
      `login form shown instead of the ${kind} editor`,
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await authStorageTokens(page),
      "still no session after editor gate",
    ).toEqual([]);
  }
  expect(collector.externalResponses()).toEqual([]);
});

test("static wiring: content-editor chain install → publish → theme switch", () => {
  // Route: content editor deep-links EditorShell (builder forced for pages).
  const route = src("src/routes/_authenticated/dashboard/content/editor.tsx");
  for (const token of [
    "/_authenticated/dashboard/content/editor",
    "EditorShell",
    "forceEditor",
    '"builder"',
  ]) {
    expect(route.includes(token), `editor route pins ${token}`).toBe(true);
  }

  // Shell: mounts StudioBuilder; inner publish flushes the live canvas into
  // the shell's working commit("publish") path; save uses commit("save");
  // pre-publish panel owns the checklist.
  const shell = src("src/components/admin/editor/EditorShell.tsx");
  for (const token of [
    "StudioBuilder",
    "publishFromStudio",
    'commit("publish")',
    'commit("save")',
    "PrePublishPanel",
  ]) {
    expect(shell.includes(token), `EditorShell pins ${token}`).toBe(true);
  }

  // Studio: canonical extension insert + plugin entries + canvas panels.
  const studio = src("src/components/builder/studio/StudioBuilder.tsx");
  for (const token of [
    "buildExtensionInsert",
    "pluginEntries",
    "ElementsPanel",
    "StudioCanvas",
  ]) {
    expect(studio.includes(token), `StudioBuilder pins ${token}`).toBe(true);
  }

  // Tray: themed entries from the threaded registry, insert callback out.
  const tray = src("src/components/builder/WidgetTray.tsx");
  for (const token of ["themeKey", "themeTrayEntries", "onAddExtension"]) {
    expect(tray.includes(token), `WidgetTray pins ${token}`).toBe(true);
  }

  // Publish: modal checklist → onPublish → builder autosave lane.
  const modal = src("src/components/builder/PublishModal.tsx");
  for (const token of ["onPublish", "Publish template"]) {
    expect(modal.includes(token), `PublishModal pins ${token}`).toBe(true);
  }
  const builder = src("src/routes/_authenticated/dashboard/builder.tsx");
  for (const token of [
    "builderAutosaveFn",
    "PublishModal",
    "activeThemeKey",
    "sourceKey",
  ]) {
    expect(builder.includes(token), `builder mounts ${token}`).toBe(true);
  }

  // Storefront: renders under the active theme key (theme switch lands here).
  const storefront = src("src/routes/store.$slug.index.tsx");
  expect(storefront.includes("themeKey"), "storefront pins themeKey").toBe(
    true,
  );
});

// Auth-gated remainder: each step below fundamentally requires a Supabase
// session (proven absent by the wall tests above), and auth stubbing is
// forbidden. Skipped-with-reason, never attempted — un-skip if and only if
// a real authenticated session becomes available.
test.skip("auth-gated: tray click inserts the canonical extension node", () => {
  // Requires a session: live WidgetTray onAddExtension → buildExtensionInsert
  // in EditorShell→StudioBuilder. Chain pinned statically above.
});

test.skip("auth-gated: schema-generated controls persist merchant edits", () => {
  // Requires a session: inspector SchemaControls onChange → validateProps →
  // commit("save") → reload. Gate + save path proven/pinned above.
});

test.skip("auth-gated: save → reload → preview → publish → theme switch", () => {
  // Requires a session: commit("save") → reload → preview under the theme →
  // PublishModal onPublish → commit("publish") → activeThemeKey switch →
  // storefront render under the new theme. Wiring pinned statically above.
});
