import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Plugin journey — AUTHENTICATED half through the REAL editor
 * (`dashboard/content/editor` → `EditorShell` → `StudioBuilder`).
 *
 * Two modes, both honest:
 *
 * A. WITHOUT a loopback auth stack (default CI/dev: `.env.local` dummy host
 *    wins under Vite): no real session can exist and auth stubbing is
 *    FORBIDDEN, so this spec PROVES THE WALL through the real UI (actual
 *    `/auth` login attempt with a synthetic probe credential creates no
 *    session), pins the editor gate, pins the chain statically, and skips
 *    the interactive trio with reason.
 *
 * B. WITH a loopback auth stack (see `docs/15-e2e/loopback-auth-setup.md`: vendored
 *    Supabase on loopback + app served with a test-only env override, then
 *    `E2E_MERCHANT_EMAIL`/`E2E_MERCHANT_PASSWORD` set to the seeded merchant
 *    from unsaved local env — never committed): the real login form mints a
 *    real GoTrue session and the first two interactive tests RUN against the
 *    live editor (install via the real `pluginInstallFn` client → tray click
 *    → canonical insert → schema edit → save → server-truth verify). They
 *    skip (same reason) when the creds are absent, and fail closed otherwise
 *    — a green run always means a real session drove the real UI.
 *
 * The third interactive test (save → reload → preview → publish → theme
 * switch → storefront) also runs in mode B. Its historical wall — the
 * save→reload round-trip — is fixed in `canonicalBody`
 * (`src/lib/editor/editor.server.ts`): the `<!--fq-studio:v2 …-->` envelope
 * now passes the markdown canonicalizer byte-identically (plus `unescapeMd`
 * recovery), so a reloaded canvas re-adopts the twin. The journey's theme
 * switch drives the real appearance lifecycle (workspace → install →
 * activate) before the public storefront assertion.
 *
 * Cleanup: collectors disposed in afterAll; the dev server is owned by the
 * Playwright webServer entry (or externally via E2E_NO_WEBSERVER). No
 * processes spawned here.
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
  await expect(
    password,
    "real login form renders password field",
  ).toBeVisible();
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
  // Route: content editor deep-links EditorShell (builder forced for pages)
  // and mounts the plugin context the canvas sandbox resolves against.
  const route = src("src/routes/_authenticated/dashboard/content/editor.tsx");
  for (const token of [
    "/_authenticated/dashboard/content/editor",
    "EditorShell",
    "PluginProvider",
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

  // Route-owned content: an authored page body is never swallowed by theme
  // demo copy — the page route names `page_content` as its content slot and
  // ThemeChrome gates the theme main on the theme declaring that section
  // (theme demo page templates without it fall back to the route body).
  const pageView = src("src/components/store/PageView.tsx");
  expect(
    pageView.includes('contentSlot="page_content"'),
    "page route owns its body via the page_content content slot",
  ).toBe(true);
  const chrome = src("src/components/store/ThemeChrome.tsx");
  for (const token of ["contentSlot", "section.type === contentSlot"]) {
    expect(chrome.includes(token), `ThemeChrome pins ${token}`).toBe(true);
  }
});

// Auth-gated remainder: each step below fundamentally requires a Supabase
// session. In mode A (no loopback stack) the wall tests above prove none can
// exist, so these skip. In mode B (E2E_MERCHANT_* creds + loopback stack per
// docs/15-e2e/loopback-auth-setup.md) all three RUN through the real
// logged-in UI — insert, edit+persist, and save→reload→preview→publish→
// storefront.
function realCreds(): { email: string; password: string } | null {
  const email = process.env["E2E_MERCHANT_EMAIL"]?.trim();
  const password = process.env["E2E_MERCHANT_PASSWORD"] ?? "";
  return email && password ? { email, password } : null;
}

function skipNoSession(): { email: string; password: string } {
  const creds = realCreds();
  test.skip(
    !creds,
    "needs a real session: E2E_MERCHANT_EMAIL/PASSWORD against the loopback " +
      "e2e stack (docs/15-e2e/loopback-auth-setup.md). No stubbing, so skip — never fake.",
  );
  return creds!;
}

/** Drive the REAL /auth form; assert a REAL session lands in storage. */
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
  // The dev server can full-reload the page mid-login (dependency
  // re-optimize on first compile; watched artifact writes from parallel
  // workers — `server.watch` is only null with DISABLE_HMR=true, see
  // docs/15-e2e/loopback-auth-setup.md). A reload resets the uncontrolled form and kills
  // the in-flight attempt with no error shown, so retry the REAL form —
  // bounded (each submit burns the product's own auth.signin bucket,
  // 10/300s) — until the backend answers (dashboard) or refuses (alert).
  // No stubbing: every attempt is a genuine sign-in round-trip.
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
    // Likely remounted under us (values cleared, no error): re-await the
    // live form before refilling.
    await expect(emailInput, "login form survives reload").toBeVisible({
      timeout: 60_000,
    });
  }
  // Cold SSR + real GoTrue round-trip: generous budget, strict assertion.
  await expect(page, "real login reaches the dashboard").toHaveURL(
    /\/dashboard/,
    { timeout: 30_000 },
  );
  expect(
    await authStorageTokens(page),
    "a real Supabase session must exist after login",
  ).not.toEqual([]);
}

/** Fill that survives a dev-server remount: verify value stuck, else retry. */
async function fillVerified(
  locator: ReturnType<Page["locator"]>,
  value: string,
  field: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await locator.fill(value);
    await locator.page().waitForTimeout(1_000);
    if ((await locator.inputValue().catch(() => null)) === value) return;
  }
  throw new Error(`fill did not stick for ${field}`);
}

/**
 * Fixture plugin manifest (mirrors the anonymous spec's reviews-co fixture):
 * installed through the REAL `pluginInstallFn` client — the same module the
 * app ships — so validation, consent and the `plugin_state` write are the
 * production path, tenant-scoped by the session. Idempotent (upsert).
 */
function reviewsManifest(): unknown {
  return {
    id: "reviews-co",
    name: "Reviews Co",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews_carousel",
        label: "Reviews carousel",
        slots: ["main"],
        entry: "framique.mount(document.createTextNode('reviews'))",
        themeable: { version: 1, schema: "schema:ref" },
        propsSchema: [
          {
            key: "heading",
            label: "Heading",
            kind: "text",
            default: "Loved by shoppers",
          },
          { key: "accent", label: "Accent", kind: "color", default: "#0f766e" },
          { key: "banner", label: "Banner", kind: "image" },
          {
            key: "slides",
            label: "Slides",
            kind: "repeater",
            fields: [
              { key: "quote", label: "Quote", kind: "text" },
              { key: "author", label: "Author", kind: "text" },
              { key: "photo", label: "Photo", kind: "image" },
            ],
          },
        ],
        defaultProps: {
          heading: "What shoppers say",
          slides: [
            {
              quote: "Fast delivery, great quality.",
              author: "Ayesha",
              photo: "",
            },
            { quote: "Will order again.", author: "Rahim", photo: "" },
          ],
        },
      },
    ],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

async function installReviewsPlugin(page: Page): Promise<void> {
  const result = (await page.evaluate(async (manifest: unknown) => {
    const fns = (await import("/src/lib/plugins.functions.ts")) as unknown as {
      pluginInstallFn: (args: unknown) => Promise<unknown>;
    };
    return fns.pluginInstallFn({
      data: { manifest, grantedScopes: ["read_shop", "render_storefront"] },
    });
  }, reviewsManifest())) as { ok?: unknown; pluginId?: unknown };
  expect(result?.ok, "real plugin install succeeds").toBe(true);
  expect(result?.pluginId, "installed plugin id").toBe("reviews-co");
}

/**
 * The public storefront serves the ACTIVE published theme; a themeless store
 * renders the "getting ready" welcome plate by design and the twin assertion
 * could never match. Drive the REAL appearance lifecycle from the
 * authenticated session — the same modules the Themes screen ships
 * (`themesWorkspaceFn` → `themeInstallFn` → `themeActivateFn`; the legacy
 * "Default theme" row has no version to publish, so activation would refuse
 * it and the official source-backed catalogue is the honest path). Verified
 * against the workspace's `isActive` (straight from `store_themes`), never
 * assumed from the mutation's return. Idempotent: an already-active store
 * (including previous runs) returns early.
 */
async function ensureActiveStoreTheme(page: Page): Promise<void> {
  const outcome = (await page.evaluate(async () => {
    const fns =
      (await import("/src/lib/themes/appearance.functions.ts")) as unknown as {
        themesWorkspaceFn: () => Promise<{
          installed?: Array<{
            id: string;
            key?: string | null;
            isActive?: boolean | null;
          }>;
        }>;
        themeInstallFn: (args: unknown) => Promise<{ id?: string } | null>;
        themeActivateFn: (args: unknown) => Promise<unknown>;
      };
    const installed = async () => {
      const workspace = await fns.themesWorkspaceFn();
      return workspace.installed ?? [];
    };
    let themes = await installed();
    const active = themes.find((t) => t.isActive);
    if (active) {
      return { step: "already-active", id: active.id };
    }
    let target = themes.find((t) => t.key);
    if (!target) {
      await fns.themeInstallFn({ data: { key: "songoskriti" } });
      themes = await installed();
      target = themes.find((t) => t.key);
    }
    if (!target) return { step: "no-installed-theme", id: null };
    await fns.themeActivateFn({ data: { id: target.id } });
    const after = (await installed()).find((t) => t.id === target!.id);
    return {
      step: after?.isActive ? "activated" : "activation-not-visible",
      id: target.id,
    };
  })) as { step: string; id: string | null };
  expect(
    outcome.step === "activated" || outcome.step === "already-active",
    `real theme switch lands (workspace reports active theme; got "${outcome.step}")`,
  ).toBe(true);
}

/** Open a fresh page editor and wait for the canonical plugin tray entry. */
async function openEditorAwaitingTray(page: Page) {
  const response = await page.goto("/dashboard/content/editor?kind=page", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);
  // Cold editor chunk + pluginListFn round-trip: generous budget.
  const trayBtn = page.locator('button[title*="reviews-co"]').first();
  await expect(
    trayBtn,
    "authorized registry offers Reviews carousel in the tray",
  ).toBeVisible({ timeout: 120_000 });
  return trayBtn;
}

/** Server truth via the REAL load path (what a reload fetches). */
async function bodyIncludesHeading(
  page: Page,
  id: string,
  heading: string,
): Promise<boolean> {
  return page
    .evaluate(
      async (args: { id: string; heading: string }) => {
        const ef =
          (await import("/src/lib/editor/editor.functions.ts")) as unknown as {
            editorLoadFn: (query: unknown) => Promise<{
              doc?: { body?: string };
            }>;
          };
        const loaded = await ef.editorLoadFn({
          data: { kind: "page", id: args.id },
        });
        return (loaded.doc?.body ?? "").includes(args.heading);
      },
      { id, heading },
    )
    .catch(() => false);
}

/**
 * Server truth via the REAL load path, richer than the boolean helper above:
 * body (persistence), slug (storefront address) and status (publish).
 */
async function docTruth(
  page: Page,
  id: string,
): Promise<{ body: string; slug: string; status: string } | null> {
  return page
    .evaluate(
      async (args: { id: string }) => {
        const ef =
          (await import("/src/lib/editor/editor.functions.ts")) as unknown as {
            editorLoadFn: (query: unknown) => Promise<{
              doc?: { body?: string; slug?: string; status?: string };
            }>;
          };
        const loaded = await ef.editorLoadFn({
          data: { kind: "page", id: args.id },
        });
        const doc = loaded.doc;
        if (!doc) return null;
        return {
          body: doc.body ?? "",
          slug: doc.slug ?? "",
          status: doc.status ?? "",
        };
      },
      { id },
    )
    .catch(() => null);
}

test("auth-gated: tray click inserts the canonical extension node", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const creds = skipNoSession();
  const { collector } = await hermeticPage(page);
  await loginThroughRealForm(page, creds.email, creds.password);
  await installReviewsPlugin(page);
  const trayBtn = await openEditorAwaitingTray(page);
  await trayBtn.click();
  // Canonical insert evidence, all through the live UI: the tray click
  // resolves the def and builds the extension node (`buildExtensionInsert`
  // + `studioNodeForExtension`), the node auto-selects, and the inspector
  // generates schema controls carrying the schema-cleaned defaults. A
  // resolve miss would land on the bare legacy placeholder (pluginKey only,
  // no schema), so these controls prove the canonical path fired.
  const inspector = page.locator("text=Heading").first();
  await expect(
    inspector,
    "inspector generates the Heading control for the inserted node",
  ).toBeVisible({ timeout: 30_000 });
  for (const label of ["Accent", "Banner", "Quote", "Author", "Photo"]) {
    await expect(
      page.locator(`text=${label}`).first(),
      `inspector generates the ${label} control`,
    ).toBeVisible({ timeout: 15_000 });
  }
  // Stable role/name locator: once any fill fires React rewrites the
  // `value` ATTRIBUTE, so `input[value=…]` selectors go stale mid-flow
  // (observed live: the fill succeeded while the attribute selector died).
  await expect(
    page.getByRole("textbox", { name: "Heading", exact: true }),
    "insert carries the schema default heading",
  ).toHaveValue("What shoppers say", { timeout: 15_000 });
  expect(collector.externalResponses()).toEqual([]);
});

test("auth-gated: schema-generated controls persist merchant edits", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const creds = skipNoSession();
  const { collector } = await hermeticPage(page);
  await loginThroughRealForm(page, creds.email, creds.password);
  await installReviewsPlugin(page);
  await openEditorAwaitingTray(page);
  // Unique title → unique slug, so reruns never collide on slug_taken.
  const stamp = Date.now().toString(36);
  const title = `E2E Plugin Journey ${stamp}`;
  const heading = `Top reviews ${stamp}`;
  await fillVerified(
    page.locator('textarea[placeholder="Add title"]').first(),
    title,
    "page title",
  );
  await expect(page, "title save mints the doc id").toHaveURL(/id=/, {
    timeout: 90_000,
  });
  const id = page.url().match(/id=([^&]+)/)?.[1];
  expect(id, "doc id captured from the URL").toBeTruthy();
  // Let the title-save round-trip settle before inserting (avoids racing
  // the autosave with the tray click).
  await page.waitForTimeout(8_000);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.locator('button[title*="reviews-co"]').first().click();
    const opened = await page
      .locator("text=Heading")
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
    if (attempt === 3) {
      throw new Error("inspector never opened for the inserted node");
    }
  }
  // Stable role/name locator: `input[value="What shoppers say"]` matches the
  // initial attribute only — React rewrites it on the first keystroke, so a
  // retry re-resolving that selector times out even though the fill landed.
  const headingBox = page.getByRole("textbox", {
    name: "Heading",
    exact: true,
  });
  await fillVerified(headingBox, heading, "schema heading");
  // Re-check the value survived until the save click (remount insurance).
  await expect(headingBox, "heading edit survives until save").toHaveValue(
    heading,
    { timeout: 15_000 },
  );
  await page.locator("button:has-text('Save draft')").first().click();
  // Persistence through the REAL load path (what a reload fetches), polled:
  // the edit must reach server truth.
  await expect
    .poll(() => bodyIncludesHeading(page, id!, heading), {
      message: "merchant heading edit reaches server truth",
      timeout: 90_000,
    })
    .toBe(true);
  // Reload durability at the data layer: the reload fetches the same truth.
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  await expect
    .poll(() => bodyIncludesHeading(page, id!, heading), {
      message: "merchant edit survives a real reload",
      timeout: 60_000,
    })
    .toBe(true);
  expect(collector.externalResponses()).toEqual([]);
});

/**
 * Full merchant journey on the REAL editor route. Previously skipped: the
 * save→reload round-trip was broken by a product bug (verified live
 * 2026-10-16) — the studio's `<!--fq-studio:v2 …-->` envelope (a STRING)
 * fell through `canonicalBody()` into the markdown canonicalizer
 * (`src/lib/editor/editor.server.ts`), which escaped the JSON (`[` → `\[`,
 * `"` → `\"`, byte-verified as `5c 5b` in `storefront_pages.body_markdown`).
 * On reload `readStudioBody()` could not parse the double-encoded payload,
 * so the canvas adopted ZERO nodes and the wipeout guard went blind
 * (`!before → false`), letting the next save/publish persist `"root":[]`.
 * Fixed in `canonicalBody` (v2 envelope pass-through, byte-identical) plus
 * `parseStudioBody` recovery via `unescapeMd`; this test is the live proof
 * through the UI.
 */
test("auth-gated: save → reload → preview → publish → storefront", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const creds = skipNoSession();
  const { collector } = await hermeticPage(page);
  await loginThroughRealForm(page, creds.email, creds.password);
  await installReviewsPlugin(page);
  await ensureActiveStoreTheme(page);
  const trayBtn = await openEditorAwaitingTray(page);
  const stamp = Date.now().toString(36);
  const title = `E2E Plugin Journey ${stamp}`;
  const heading = `Top reviews ${stamp}`;
  await fillVerified(
    page.locator('textarea[placeholder="Add title"]').first(),
    title,
    "page title",
  );
  await expect(page, "title save mints the doc id").toHaveURL(/id=/, {
    timeout: 90_000,
  });
  const id = page.url().match(/id=([^&]+)/)?.[1];
  expect(id, "doc id captured from the URL").toBeTruthy();
  await page.waitForTimeout(8_000);
  await trayBtn.click();
  const headingBox = page.getByRole("textbox", {
    name: "Heading",
    exact: true,
  });
  await expect(
    headingBox,
    "inspector generates the Heading control",
  ).toBeVisible({ timeout: 60_000 });
  await fillVerified(headingBox, heading, "schema heading");
  await expect(headingBox, "heading survives until save").toHaveValue(heading, {
    timeout: 15_000,
  });

  // (1) Save draft through the shell's real topbar button.
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Save draft" })
    .click();
  await expect
    .poll(
      async () => (await docTruth(page, id!))?.body.includes(heading) ?? false,
      {
        message: "merchant heading edit reaches server truth",
        timeout: 90_000,
      },
    )
    .toBe(true);

  // (2) Reload: the canvas must re-adopt the twin AND the edited props from
  // server truth. Pre-fix the canonicalizer markdown-mangled the v2 envelope,
  // so adopted nodes = 0 and the canvas came back empty — `[data-plugin]`
  // below had nothing to match.
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  const canvasIsland = page.locator('[data-plugin="reviews-co"]').first();
  await expect(
    canvasIsland,
    "canvas re-adopts the twin (sandboxed island) after reload",
  ).toBeVisible({ timeout: 120_000 });
  // Re-select through the Structure panel and prove the EDITED value came
  // back with the node — not the schema default.
  await page
    .getByRole("button", { name: /^Structure/ })
    .first()
    .click();
  await page
    .getByLabel("Structure", { exact: true })
    .getByRole("button", { name: "App block", exact: true })
    .click();
  const reloadedHeading = page.getByRole("textbox", {
    name: "Heading",
    exact: true,
  });
  await expect(
    reloadedHeading,
    "edited heading survives the reload round-trip",
  ).toHaveValue(heading, { timeout: 30_000 });

  // (3) Preview mode: "Preview changes" strips the editing chrome over the
  // SAME canvas build — the widget island stays, the handles go.
  const editHandle = page.getByRole("button", { name: "Edit App block" });
  await expect(editHandle, "selected node shows its edit handle").toBeVisible({
    timeout: 15_000,
  });
  const previewToggle = page
    .getByRole("button", { name: /^Preview changes/ })
    .first();
  await previewToggle.click();
  await expect(editHandle, "preview strips editor handles").toBeHidden({
    timeout: 15_000,
  });
  await expect(canvasIsland, "preview keeps the widget island").toBeVisible({
    timeout: 15_000,
  });
  await previewToggle.click();
  await expect(editHandle, "handles return when preview is off").toBeVisible({
    timeout: 15_000,
  });

  // (4) Publish through the shell's pre-publish panel (real checks + confirm).
  const previewHref = await page
    .getByRole("link", { name: "Preview in new tab" })
    .getAttribute("href");
  expect(previewHref, "editor exposes the storefront href").toBeTruthy();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, "pre-publish panel opens").toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect
    .poll(async () => (await docTruth(page, id!))?.status === "published", {
      message: "publish reaches server truth",
      timeout: 90_000,
    })
    .toBe(true);

  // (5) Storefront: the public URL renders the published twin and the
  // sandboxed bundle executes (its entry mounts the "reviews" text).
  const publicPath = previewHref!
    .replace(/[?&]preview=1\b/, "")
    .replace(/^https?:\/\/[^/]+/, "");
  const resp = await page.goto(publicPath, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(resp?.status(), "published page serves 200").toBe(200);
  await expect(
    page.locator('[data-plugin="reviews-co"]').first(),
    "storefront renders the published twin",
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page
      .frameLocator('iframe[title="Reviews Co — Reviews carousel"]')
      .locator("body"),
    "sandboxed bundle executed on the storefront",
  ).toContainText("reviews", { timeout: 30_000 });
  expect(collector.externalResponses()).toEqual([]);
});
