# Tasks

## 1. Close the claim-killers (each becomes its own OpenSpec change)

- [ ] 1.1 Propose `theme-directory-population`: seed `theme_registry` +
      `VISIBLE_THEME_KEYS` so Add New shows installable themes; define
      shipped-vs-planned theme count; verify installed grid + Install→Activate
      swap live on `:3000`
- [ ] 1.2 Propose `footer-c5-restore`: migrate v2 footer to `items` rows (or
      extend shared fallback to `c5`); assert all five columns in
      `wiring.test.ts` + SSR render test; regen registry embed
- [ ] 1.3 Propose `secrets-bootstrap`: documented env bootstrap
      (git-history recovery is not a process); `secrets:scan` stays blocking;
      rotation runbook for Supabase keys

## 2. Polish to the photography's level

- [ ] 2.1 Propose `card-motion-cleanup`: explicit `transform`/`opacity`
      ≤500ms, exponential easing token, single hover signal, marquee
      pause-on-hover (Hallmark audit 2026-10-02, findings #2–#6)
- [ ] 2.2 Imagery batch B when Copilot quota resets: hero-nxt (single adult),
      festive split 2:1, 8 category tiles 1:1; wire via `/editor` (builders stay
      imageless by convention)
- [ ] 2.3 Silence or scope the localhost CSP auth-refresh noise so
      merchant demos show zero console errors

## 3. Keep the analysis honest

- [ ] 3.1 Re-run this audit after 1.1–1.3 land; flip Axis 2 to STRONG only
      when Add New, footer columns, and secrets bootstrap are all verifiable
      live
- [ ] 3.2 Archive this change once its follow-ups are proposed
      (`openspec archive saas-cms-positioning`)
