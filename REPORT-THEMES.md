# Themes Dynamic-Compatibility Report — Songoskriti vs Somvabona
Date: 2026-09-26. Method: read-only subagent audits of code + live schema; nothing invented. File:line refs included.

## Verdict in one paragraph

Both themes are **fully dynamic** (tokens, skins, preset defaults, no hardcoded copy beyond deliberate demo art) and **fully page-builder compatible** (every emitted widget has catalog + renderer + studio twin + inspector fields, with 4 noted exceptions). **Plugins work on both themes identically** through the sandboxed island model — but a plugin can only *supplement*, never *replace*, menus or article layouts. **Menus are the weakest axis**: Songoskriti hard-overrides navigation (ignores dashboard menus + taxonomy), and no widget consumes dashboard menus. **Blog is generic fallback** on both (no per-theme templates or skins). For third parties: extra widgets ✅, better menus ⚠️ (adjacent only), subscription-with-prorata ❌ (missing engine).

## 1. Dynamic — both themes: YES

| Capability | Songoskriti | Somvabona |
|---|---|---|
| ThemeTokens (18 keys) | ✅ brand `#1a1a1a`, accent `#8B4513`, radius `0px` sharp | ✅ brand `#7C2A1A`, accent `#B95A38`, radius `4px` |
| Skin vocabs + defaults | ✅ editorial/split/wall/cards (`skins.ts:35-68`) | ✅ compact/fullbleed/carousel/rows (`skins.ts:40-73`) |
| Skin stylesheets | ✅ token-only, reduced-motion gated | ✅ token-only, reduced-motion gated |
| Responsive bp overrides | ⚠️ engine supports, neither theme authors any | ⚠️ same |
| Motion | `subtle` tokens + 5–6s auto-advance carousels | `subtle` + same pattern |

## 2. Page builder / editor — YES with 4 exceptions

All 21 songoskriti + 18 somvabona emitted types resolve (catalog → renderer → studio twin → inspector). Exceptions:
1. `profile_card` / `orders_list`: no studio twin — uneditable in studio (`studio/catalog.ts` has zero keys).
2. Thin studio twins (no skin control, minimal schema): `testimonials`, `finder_row`, `trust_footer/marquee`, `price_buckets`, `occasion_matrix`, `urgency_rail`.
3. Prop-shape over-emit stripped on persist: songoskriti `finder_row` o4–o7, `split_feature` dual-image/CTA props, `ugc_gallery images` string.
4. Stale tests/docs: songoskriti token lock (`#8A3B1F` vs actual `#1a1a1a`), homepage intent list (9 declared vs 11 emitted), `skins.ts` comments claiming skins unimplemented.

## 3. Plugins — identical on both themes by design

Sandboxed `plugin:*` islands (null-origin iframe, no net/img/font egress, allow-listed bridge), closed vocabularies (8 scopes, 4 hooks, 3 slots), full lifecycle (install/update/consent/kill-switch/uninstall), 6 builtin proofs. Theme↔plugin fully decoupled (enforced by tests) — every theme is automatically plugin-capable, and no theme can break plugins.

## 4. Menus — weakest axis

- Dashboard menus (Content › Menus, 3-level, bilingual chrome) exist and serve generic stores via `StoreHeader`.
- **Songoskriti ignores them completely**: hardcoded `NAV_ITEMS` tree + `label_bn` unread; any store on this theme cannot use dashboard menus. Somvabona uses the generic taxonomy path (fine, but plain — no images/columns).
- `mega_menu` widget never consumes dashboard menus; `columns`/`label_bn` props are dead everywhere; `department_strip` has no binding and no studio preview.
- A plugin **cannot** replace menu rendering (closed map, no menu hook/scope/slot) — adjacent header blocks only.

## 5. Posts / blog — generic fallback on both

No per-theme blog templates or article skins; shared `ArticleView`, full SEO (JSON-LD, canonicals, feeds, taxonomy desk with 301s on rename). Blog widgets support merchant-composed layouts. Gaps: widget `emptyText` not bilingual, EN-only sample rows.

## 6. Can third parties build it?

| Ask | Verdict |
|---|---|
| More widgets | ✅ Yes — manifest + sandbox + tray + review pipeline; 6 builtins prove it |
| Better menu (replace nav) | ⚠️ Adjacent only — header-slot island, cannot override renderer/theme |
| Subscription plugin with prorata | ❌ No recurring price model, no renewal cron, no install upgrade path, trial expiry inert. Platform day-proration RPCs exist but serve plans only, unwired to installs. Workaround: self-bill via `hooksUrl` |
| Theme requires plugins | ❌ No dependency mechanism (deliberate decoupling) |
| Monetize (one-time + trial + payout) | ✅ 70/30 split, idempotent ledger, payouts, reviews |

## 7. Recommended order (my ranking)

1. **Songoskriti menu override → dashboard-driven** (biggest merchant-facing gap; kills EN-only + DB-blind nav).
2. **Studio twins for account widgets + skin controls on thin twins** (unblocks theme differentiation in-editor).
3. **Persist-shape alignment** (catalog fields for o4–o7, dual-image props, gallery `images`, `urgency_rail` skin round-trip).
4. **Blog empty-text bilingual + per-theme article skin hook** (cheap, visible).
5. **Plugin subscription engine** (recurring columns + renewal + proration wired to installs) — only if monetization strategy demands it.
6. **Menu replacement API** (new slot/hook/scope) — only if "better menu" becomes a product bet.

---
**Living guides (2026-09-26):** [Builder README](docs/04-builder/README.md),
[Theme authoring](docs/themes/creation.md). This report stays a dated audit.
