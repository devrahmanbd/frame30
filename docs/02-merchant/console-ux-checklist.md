# Console UX checklist (Phase 10)

Every new or edited `/admin` screen is reviewed against this list before merge.
Automated coverage: `bun run test src/lib/console-a11y.test.ts` (tokens, contrast,
motion, source rules) and `bun run console:gate` (browser sweep, screenshots).

## Tokens and colour

- [ ] No hardcoded colour utilities (`text-white`, `bg-gray-100`, `bg-[#...]`).
      Every colour comes from the `.fq-admin` token layer.
- [ ] Exactly two text tones: `text-foreground` and `fq-sub` (muted). No third ramp.
- [ ] Text contrast >= **4.5:1**, non-text/UI >= 3:1, in light *and* dark.
- [ ] Brand teal (`--fq-brand`) is used for data only; never for chrome or CTAs.
- [ ] Status is never colour alone — always a label, and usually an icon.

## Structure

- [ ] The page is a `Page` from `@/components/console/kit`, with one title and at
      most one primary action in the sticky header.
- [ ] Plates use `fq-card` (hairline + micro shadow). Only overlays get depth.
- [ ] Radii come from `6 / 10 / 14`; borders are 1px.
- [ ] Lists use `DataTable` + `useListState` (URL-synced view/q/sort/page).
- [ ] Detail screens use `DetailLayout` + `SaveBar`; validation renders next to
      the offending field, never as a top-of-page dump.

## Keyboard and screen reader

- [ ] Full task can be completed with the keyboard alone, in a sane tab order.
- [ ] First tab stop shows a visible focus ring on the signal colour.
- [ ] Icon-only buttons carry an `aria-label`.
- [ ] Tables expose sortable headers as buttons with `aria-sort`.
- [ ] Charts ship a table or text fallback; no meaning lives in pixels only.
- [ ] Dialogs/drawers trap focus, close on `Esc`, and restore focus on close.
- [ ] Live regions announce async results (save, bulk action, errors).

## Motion and state

- [ ] Motion is opacity/transform only, within `--fq-dur-fast|--fq-dur|--fq-dur-slow`
      (120/160/240ms), and never blocks input.
- [ ] Everything is inert under `prefers-reduced-motion: reduce`.
- [ ] Loading uses the matching skeleton (`TableSkeleton`, `CardSkeleton`,
      `ChartSkeleton`, `DetailSkeleton`) with the same box as the loaded content.
- [ ] Empty states are one sentence and one primary CTA.
- [ ] Errors are recoverable: `InlineError` / `ErrorState` with a retry.
- [ ] Mutations that can be reversed use `optimistic()` (apply, run, roll back).

## Responsive

- [ ] Verified at **390 / 768 / 1280 / 1920**.
- [ ] No horizontal page scroll at any width.
- [ ] Primary tap targets are >= 44px on touch widths.
- [ ] Sidebar collapses to the icon rail (>=768) and to the drawer (<768) with
      the same destinations as `⌘K`.

## Before you ship

- [ ] `bun run typecheck && bun run test`
- [ ] `bun run console:gate` (screenshots in `.artifacts/console/` diffed by eye)
