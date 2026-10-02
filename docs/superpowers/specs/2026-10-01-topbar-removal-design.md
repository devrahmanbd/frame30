# Topbar Removal — Design Spec

**Status:** proposed for implementation (user approved direction: "remove topbar completely", Approach A) · **Date:** 2026-10-01
**Scope:** oceanblue chrome topbar band removal only. Follows the shipped oceanblue theme (`1b06337`, deployed 2026-10-01).

## 1. Problem & decision

Oceanblue currently stacks two announcement strips around the masthead: the shared chrome band above the masthead (which we dressed as a full-width ticker marquee in `1b06337`) and the theme-owned rotating campaign strip below the masthead. The user reviewed the ticker topbar in the preview and rejected it as **too busy and cluttered**.

Approved decision (clarifying Q&A, user chose "remove topbar completely"):

- **Remove the chrome topbar band above the masthead for oceanblue entirely** — no marquee, no split strip, no empty shell. The masthead sits at the top of the page.
- The theme-owned rotating campaign strip below the masthead (header.ts `announcement_bar`: new season / wedding edit / exchange assurance, dismissible, 6s) **stays untouched** — it is the campaign surface; the removed band was the redundant service-promise/ticker layer.
- Songoskriti and all generic themes keep their existing split strip (variant default unchanged).

## 2. Config contract (`src/components/store/theme-chrome.ts`)

```ts
announcement: {
  left: string;
  center: string;
  center_bn: string;
  /** Presentation variant, theme-authored: "split" (the default
   *  3-column strip) or "none" (no band at all — the masthead is the
   *  top of the page). Absent means "split". */
  variant?: "split" | "none";
};
```

- `variant` narrows from `"split" | "ticker"` → `"split" | "none"`.
- `items` field is **deleted** (was ticker-only; its only reader was the deleted marquee branch).
- `left` / `center` / `center_bn` stay required and populated even when `variant: "none"` — the type keeps them, songoskriti's split strip consumes them, and no render path reads them under `"none"` (documented as dormant copy, re-enableable by flipping the variant).
- Doc comment on `announcement` updated: "for the luxury variant" → describes split/none.

## 3. Render changes (`src/components/store/StoreHeader.tsx`)

1. Compute once, next to `isLuxury`:

   ```ts
   const showBand =
     headerChrome !== null && headerChrome.announcement.variant !== "none";
   ```

2. Band wrapper (lines ~182–259) renders only when `showBand` (replacing the bare `{headerChrome && …}`). Under `"none"` there is **no wrapper div at all** — no `h-[36px]` shell, no `h-0` collapse shell, no border-b.
3. **Delete the ticker branch** (lines 186–239): marquee track, `--fq-marquee` inline style, duplicate aria-hidden copy, brand-band foreground override, band-local `LanguageToggle`. The surviving band body is today's `:else` split strip (left/center/LanguageToggle), unchanged.
4. LanguageToggle conditions:
   - Band-local toggle (split strip, today's `hidden sm:flex justify-end w-1/3` slot): gated by `showBand` implicitly — it only exists inside the band.
   - Header-cluster toggle at ~line 489: `{!isLuxury && <LanguageToggle />}` → `{!showBand && <LanguageToggle />}`.
5. `isLuxury` (`headerChrome !== null`) keeps all its other jobs (wordmark hiding, mega-panel affordance, 44px mobile targets) — **unchanged**.

### LanguageToggle placement matrix

| Store shape                          | band        | toggle location                              |
| ------------------------------------ | ----------- | -------------------------------------------- |
| generic (`headerChrome: null`)       | none        | header cluster (today's behavior)            |
| songoskriti (variant absent → split) | split strip | band slot, cluster hidden (today's behavior) |
| oceanblue (variant `"none"`)         | none        | **header cluster (new)**                     |

The cluster toggle has no responsive hiding (bare slot between wishlist and cart in the always-rendered right cluster), so oceanblue **gains an EN/বাং toggle at every viewport** — today its only toggles live in the band behind `hidden sm:`. This matches what generic themes already do on mobile; acceptable, flagged as an intentional side effect.

## 4. Theme data (`src/lib/themes/oceanblue/header-fallback.ts`)

`OCEANBLUE_HEADER_ANNOUNCEMENT`:

- `variant: "ticker"` → `variant: "none"`.
- Delete the `items` array (5 bilingual marquee entries) and its ticker comment.
- Keep `left` / `center` / `center_bn` copy as-is (required fields; dormant under `"none"`).
- Comment rewritten: the chrome band renders nothing for oceanblue; the rotating campaign strip below the masthead carries announcements.

## 5. Tests

`src/components/store/theme-chrome.test.ts`

- Oceanblue test (~line 31): rename off "ticker announcement"; expect `variant === "none"`, `items` undefined (until the field is gone, the expectation disappears with it), keep `center`/`center_bn` non-empty + `fallbackMenu`/logo assertions.
- Songoskriti test (~line 47): keep — `variant` undefined (default split), `items` undefined → drop the `items` assertion with the field.

`src/components/store/StoreHeader.test.tsx`

- Replace `describe("oceanblue ticker announcement strip")` (lines 368–407) with `describe("oceanblue has no topbar band")`:
  - renders **no** band: markup contains no `fq-marquee`, no `w-1/3 text-center` split shell, no `h-[36px]` band shell, no ticker copy (e.g. `"CASH ON DELIVERY NATIONWIDE"` absent).
  - LanguageToggle lands in the header cluster (assert the cluster's toggle markup is present for the oceanblue render).
  - bn locale still resolves (cluster toggle render under `initialLang: "bn"` doesn't crash; header copy paths unaffected).
- Keep the songoskriti "keeps the split strip — no marquee" test (it already asserts `w-1/3 text-center` + no `fq-marquee`) — possibly move into the same describe or leave as-is.
- Unaffected: songoskriti chrome tests (lines 263–357), demo negative test (line 364), `themeChromeFor` key-resolution tests.

No other test files reference the ticker (`fq-marquee` assertions outside StoreHeader.test.tsx are discovery/heritage/widget surfaces, untouched).

## 6. Explicit non-goals

- **`@keyframes fq-marquee` in `src/styles.css:349` stays** — shared by `discovery.tsx`, `heritage.tsx`, `widgets.tsx`, `trust_marquee`; the ticker branch was only one consumer.
- **Theme rotating campaign strip below the masthead** (`src/lib/themes/oceanblue/header.ts` `buildHeaderMain` → `announcement_bar`, Wedding Edit message included) — untouched; `wiring.test.ts` / `preview.test.ts` `["announcement_bar"]` expectations stand.
- **Songoskriti split strip** and its band — untouched.
- **Skins, GSAP rail motion, GenericTestimonials, dress layer** — untouched; skins.css has zero ticker references.
- **Wedding Edit / homepage sections, registry migration row** — untouched; no migration regen needed (no homepage prop changes).
- **`isLuxury` semantics** for menus/wordmark/targets — untouched.
- No shared-component-in-theme changes; isolation guard unaffected.

## 7. Verification plan

1. `bun run typecheck` — clean (the `"ticker"` literal disappears everywhere in the same change).
2. `bun run lint` — clean on touched files.
3. `bun run test` — full unit suite; new/updated StoreHeader + theme-chrome tests green.
4. `bun run test:contracts` — untouched contract surface, must stay green.
5. No migration / `schema:check` impact (no homepage props, no registry row changes).
6. Prod build: `VITE_SUPABASE_URL=http://dummy.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=dummy bun run build`.
7. Browser check (`http://localhost:3000/theme-preview/oceanblue`):
   - no band above the masthead; masthead is the top of the page;
   - LanguageToggle visible in the header action cluster; switching EN↔BN works;
   - rotating campaign strip still renders below the masthead;
   - songoskriti preview still shows the split strip;
   - zero console errors.
8. Commit style: `feat(theme): remove oceanblue chrome topbar band (variant none)` with bullet body; CHANGELOG dated entry appended.

## 8. Risks & mitigations

- **Layout shift**: 36px band removal changes oceanblue header height — intended; no CLS gates reference the band.
- **Scroll-collapse logic**: `scrolled` state still drives the masthead height (64/72px); with no band there is nothing to collapse — the band's collapse classes leave with the wrapper.
- **Dormant copy**: `left`/`center`/`center_bn` become unread under `"none"` — acceptable (type-required, re-enableable); tests pin their presence so they can't rot silently.
- **Stray `"ticker"` references**: single-repo grep for `"ticker"` after the change must return only unrelated catalog/widget keyword hits (`studio/catalog.ts`, `widget-metadata.ts`).
