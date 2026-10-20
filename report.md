# Songoskriti theme preview — why the non-homepage templates look generic

**Date:** 2026-10-20 · **Measured against:** live deployment `40673d3a` (`https://framique.qubickle.com/theme-preview/songoskriti`) · **Repo:** `/opt/frame28`, branch `frame30`

---

## 1. The question (as asked)

> "We have to update search archive `https://framique.qubickle.com/theme-preview/songoskriti?template=search`, Cart `https://framique.qubickle.com/theme-preview/songoskriti?template=cart`, `https://framique.qubickle.com/theme-preview/songoskriti?template=account` these are still broken. All archive template like this. Tell me why. What do we have. Write me a report.md about including my question and your findings. Why they're generic and why theme preview is not good"

---

## 2. Short answer

The pages are **not broken** — they load, render and carry Songoskriti's chrome, tokens, skins and fonts. They are **generic by authorship**: the theme's own source file authors those templates as *placeholders built from shared, theme-neutral builder sections*, and the preview fills the interactive parts (search, cart, account) with hard-coded demo data because the real ones are owned by the storefront route, not by the theme.

Three facts decide it:

1. **The theme's own preview source writes the body** — `src/lib/themes/songoskriti/preview.ts` — and for `search`, `cart`, `account`, `page` and `blog` it writes a `heading` + a demo `rich_text` + a demo rail. The copy says so itself: *"Live search runs on the storefront. Below is what a results rail looks like."*
2. **The route owns those pages.** `ROUTE_H1_TEMPLATES` (`src/lib/builder-ast.ts:68-75`) = product, collection, account, page, blog, search — the storefront route supplies the h1 and the live data; a theme may not build those pages itself.
3. **The preview is a demo harness, not a store.** `ThemePreviewFrame` is a modal dialog that blocks clicks and submits, injects `cart_lines: null` / `cart_summary: null`, and feeds the account with `"Demo Shopper"`.

So the *frame* is Songoskriti, the *body* is a shared placeholder, and the *data* is fake. That is why the page reads as "half branded".

There is also **no `archive` template** in this product: `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`) is `index, product, collection, account, page, blog, cart, checkout, search`. `?template=archive` returns **307** (redirect to the default). The closest thing to an archive listing is `blog` — and it behaves the same way.

---

## 3. What the pages actually contain (measured)

| `?template=` | HTTP | Theme chrome (header/footer/logo) | Theme-authored body | Demo body | What you actually see |
|---|---|---|---|---|---|
| `index` | 200 | yes | **21 sections** — hero carousel, circle categories, craft story, editorial splits, rails, UGC gallery | no | the real Songoskriti homepage |
| `product` | 200 | yes | yes (price block, add-to-cart) | no | themed product layout |
| `collection` | 200 | yes | yes (category header, grid, subnav) | no | themed listing |
| `search` | 200 | yes | `heading` + `product_rail` only | **yes** | "Search results" / "**Demo search** — Live search runs on the storefront…" / "Popular right now" (8 demo products) |
| `cart` | 200 | yes | `heading` + `columns` wrapping the shared `cart_lines` / `cart_summary` slots + a rail | **yes** | "Your bag" / "**Sample product**", "Second product", ৳2,490 subtotal |
| `account` | 200 | yes | the shared `orders_list` / `profile_card` slots | **yes** | "Account" / "**Demo Shopper**" / ORD-1001, ORD-1002 |
| `page` | 200 | yes | `heading` + `rich_text` | demo copy | "Size guide" / "Demo article" |
| `blog` | 200 | yes | `heading` + `image` + `rich_text` | demo copy | "Journal" / "Meet the makers — Demo story" |
| `archive` | **307** | — | — | — | no such template key |

The "Sample product" / "Demo Shopper" / "Demo search" strings are **shared platform defaults**, not theme copy:

- `src/components/builder/CartContext.tsx:95` → `productTitle: "Sample product"`
- `src/lib/preview-demo-data.ts:42` → `title: "Demo Shopper"`
- `src/lib/themes/songoskriti/preview.ts:239` → `heading: "Demo search"`

Screenshots captured during this investigation: `/tmp/opencode/report-index.jpeg`, `report-search.jpeg`, `report-cart.jpeg`, `report-account.jpeg`.

---

## 4. Root cause, layer by layer

### Layer 1 — the theme authors placeholders, not compositions

`src/lib/themes/songoskriti/preview.ts` builds every non-homepage template out of **shared builder sections**:

```ts
case "search":  // preview.ts:214
  return [
    s("heading",    { text: "Search results", text_bn: "খোঁজার ফলাফল" }),
    s("rich_text",  { heading: "Demo search", body: "Live search runs on the storefront. Below is what a results rail looks like." }),
    rail(s, "Popular right now", "এখন জনপ্রিয়", "festive", "Loved across 64 districts", …),
  ];

case "cart":    // preview.ts:232
  return [
    s("heading", { text: "Your bag", text_bn: "আপনার ব্যাগ" }),
    { ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
      children: [ { ...s("container"), children: [s("cart_lines", {})] },
                   { ...s("container"), children: [s("cart_summary", {})] } ] },
    rail(s, "You may also like", …),
  ];
```

`heading`, `rich_text`, `columns`, `container`, `product_rail`, `cart_lines`, `cart_summary`, `orders_list`, `profile_card` are all **core widgets** — the theme chooses their arrangement, but the widgets, their internals and their copy are the platform's. On the homepage, by contrast, the theme authors *its own* sections (`hero_carousel`, `craft_story`, `circle_categories`, `editorial_split`, `ugc_gallery`, …) — that is the difference you can see.

The theme's **skins and tokens still dress those shared widgets** (`skins.css` styles `product_grid` in the "cards" face; `styles.css` applies `--theme-font-display` to headings), which is precisely why the generic pages still *look* branded. The branding is real; the composition is not.

### Layer 2 — the storefront route owns the interactive pages

`ROUTE_H1_TEMPLATES` (`builder-ast.ts:68-75`) lists product, collection, account, page, blog, search: on those templates the **route** supplies the h1 **and the live data** — but only "when no widget claims it" (`builder-ast.ts:8427-8435`: *"the route data supplies the heading when no widget claims it, so silence is legal there"*). A theme claiming the h1 is legal, and that is exactly what the preview shows: `<h1 class="font-bangla-display …">Search results</h1>` — the shared heading widget's own classes, dressed by the theme's skin and tokens. What a theme cannot do is replace the live **data-bearing** surface: the search box, the real basket, the real order history are rendered by the storefront's shared components with live data. A theme can compose around them; it cannot replace them.

That is why the preview says "Live search runs on the storefront" — it is *true*, and it is a deliberate boundary, not an oversight.

### Layer 3 — the preview is a demo harness

`src/components/store/ThemePreviewFrame.tsx`:

- It is a modal canvas: `role="dialog" aria-modal="true"`, and the code comment says *"Clicks navigate between templates in place; actions and submits are blocked."* You cannot use the cart or run a search in it.
- It injects hard-coded slots: `cartSlots = { cart_lines: null, cart_summary: null, cart_drawer: null, checkout_steps: null, payment_methods: null }`, the account's `orders_list` / `profile_card` from `src/lib/preview-demo-data.ts`, and product rails from `useMockProductSlots`.
- **A missing template falls back silently**: `const ast = templates[template] ?? templates.index` (`:485`). A theme that forgot a template shows its *homepage* there instead — a gap never looks like a gap.
- The preview also renders the theme's AST, not a merchant's store with their catalogue, their copy and their data. Even a perfectly-authored template can only be approximated here.

---

## 5. Why nothing caught it (the gap in our own records)

The port's own map already flagged these surfaces as **theme-owned**:

```
docs/superpowers/songoskriti-evidence/port/classification.md
| TPL-SEARCH  | search template   | (c) | … | src/lib/themes/songoskriti/preview.ts:214 |
| TPL-CART    | cart template     | (c) | … | src/lib/themes/songoskriti/preview.ts:232 |
| TPL-ACCOUNT | account template  | (c) | … | src/lib/themes/songoskriti/preview.ts:297 |
```

Lane (c) means "genuinely theme-owned widget" — the map records **ownership**, and the carrier file is the theme's own source. But ownership was *discharged* by authoring a generic placeholder out of shared sections. Nothing in the acceptance chain asks the question the user is asking now:

- the **asset gate** (shipped 2026-10-20) checks that every referenced asset resolves, is honest about its format, is not duplicated and is within budget;
- the **parity gate** compares the *homepage* against frozen reference stills;
- **no gate asks "is this template actually a Songoskriti design, or the shared default with the theme's logo on top?"**

That is the real defect this report exposes: a theme can be classified as owning a surface and ship the shared default for it, and every existing check still passes.

---

## 6. What we have (the honest inventory)

**Genuinely Songoskriti (theme-owned, visible on every page)**

- Header: mega menu taxonomy, announcement bar, logo lockup, search/account/wishlist/cart controls — `src/lib/themes/songoskriti/header-presentation.tsx`
- Footer: shop menus, customer-care links, heritage links, payment marks, flagship addresses, newsletter — `src/lib/themes/songoskriti/footer.ts`
- Tokens: type scale, colour, spacing, the Playfair/Inter + Noto Sans Bengali pairing
- Skins: per-widget faces (e.g. `product_grid` in the "cards" face) — `skins.ts` / `skins.css`
- Homepage composition: 21 authored sections
- Product and collection layouts (price block, add-to-cart, subnav, grid + rail)
- 21 art assets, now with honest extensions and a byte-exact expectation file

**Shared with every other theme (the platform's, by design)**

- Search UI, cart lines/summary/drawer, checkout steps, payment methods
- Account orders list and profile card
- Blog reader, page content, product card/grid/rail internals
- The h1 election and the route-owned page furniture
- All preview demo data ("Sample product", "Demo Shopper", demo orders)

**Generic *today*, and it is the theme's choice to fix**

- The **body composition** of `search`, `cart`, `account`, `page`, `blog` — a shared `heading` + demo copy + a rail
- The **demo copy** on all of them ("Demo search", "Demo article", "Demo story", "Sample product", "Demo Shopper")
- The **absence of Songoskriti editorial framing** — no craft story, no campaign panel, no heritage note wrapping the shared slots

---

## 7. Why the theme preview is "not good" — the honest list

1. **It sells a product the storefront does not deliver.** A merchant browsing the preview sees nine tabs; seven of them are placeholders that no store will ever show. The preview over-promises the theme's reach.
2. **It cannot show the parts that matter commercially.** Search, cart and account are where a shopper converts; in the preview they are static, unclickable and fake.
3. **The homepage is the product.** Everything that makes Songoskriti *Songoskriti* lives on `template=index`. The other tabs are chrome plus a placeholder — so a review of "the theme" that starts anywhere but the homepage is measuring the platform, not the theme.
4. **A missing template is invisible.** The `?? templates.index` fallback makes an unauthored template look like the homepage, so a theme can look "complete" in the preview while a template is missing.
5. **It shows theme copy, not merchant copy.** Every string on a non-index template is placeholder text; a merchant cannot judge typography with their own Bengali product names, prices and menus.
6. **The demo data is shared, so it is not evidence of theme ownership.** "Sample product" comes from `CartContext.tsx`, "Demo Shopper" from `preview-demo-data.ts` — the platform's defaults, identical for every theme.

What the preview *is* good for: the chrome, the tokens, the fonts, the skins, the homepage composition, and the frame (heading + rails) of each template. That is worth a lot — but it is roughly a third of the shopping journey.

---

## 8. Options (nothing here is implemented; this section is for your decision)

| Option | What it does | Where it lives | Port boundary |
|---|---|---|---|
| **A. Author real bodies** | Compose `search`, `cart`, `account`, `page`, `blog` as Songoskriti pages *around* the shared slots (custom columns, editorial framing, craft-story panels, campaign strips, heritage notes) — the shared widgets stay, the composition becomes the theme's | `src/lib/themes/songoskriti/preview.ts` (theme-owned) | **Allowed** by the port spec §7 |
| **B. Add a distinctness gate** | A check that every non-index template the theme claims must author theme-owned sections and must differ from the shared default — the same shape as the asset gate, so "theme-owned but generic" cannot recur | new test file (new files are allowed) + a small rule module | **Allowed** (new files); the rules live in `scripts/`/`src/lib/themes/songoskriti/**` |
| **C. Make the preview honest** | Label demo bodies as demo, and/or render the real storefront route for cart/search/account in preview (needs live data and an auth context the anonymous preview does not have) | `src/components/store/ThemePreviewFrame.tsx`, `src/routes/**` | **Escalation required** (prohibited core files) |
| **D. Shrink the preview's surface** | Only expose the templates the theme authors distinctly; mark the rest "shared — not theme-specific" | `src/lib/themes/songoskriti/preview.ts` + preview nav | Mostly **allowed**; preview nav may need escalation |
| **E. Do nothing** | Accept that only the homepage is themed; document it for merchants | docs only | Allowed |

A + B together are the durable answer: B makes the claim enforceable, A makes it true. C is the expensive one and buys the most honesty but reaches into prohibited core.

---

## 9. How to reproduce every claim in this report

```bash
# 1. the template list (there is no "archive")
grep -n "TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts

# 2. the route-owned pages
grep -n "ROUTE_H1_TEMPLATES" -A 8 src/lib/builder-ast.ts

# 3. the theme's placeholder bodies
sed -n '205,300p' src/lib/themes/songoskriti/preview.ts

# 4. the shared demo strings
grep -rn "Sample product\|Demo Shopper\|Demo search" src --include='*.ts' --include='*.tsx'

# 5. the preview's fallback + slot injection
grep -n "templates\[template\] ?? templates.index\|cart_lines: null\|role=\"dialog\"" src/components/store/ThemePreviewFrame.tsx

# 6. the live pages
for t in index product collection search cart account page blog; do
  printf "%-11s %s\n" "$t" \
    "$(curl -s -o /dev/null -w '%{http_code}' "https://framique.qubickle.com/theme-preview/songoskriti?template=$t")"
done
curl -s -o /dev/null -w 'archive -> %{http_code} (redirect; no such template)\n' \
  "https://framique.qubickle.com/theme-preview/songoskriti?template=archive"
```

---

## 10. Summary of the judgement

- The templates are **not broken** — nothing 404s, nothing throws, the chrome and typography are correctly Songoskriti.
- They are **generic because the theme's own source authors them as placeholders**, using shared widgets and shared demo data, and because the storefront route — not the theme — owns the live versions of those pages.
- The port's own map calls them theme-owned (lane c) but records ownership, not distinctiveness; **no acceptance criterion anywhere tests "is this template a Songoskriti design?"** That gap is the actionable finding.
- The theme preview is a **chrome-and-homepage showcase with demo stubs for the rest**. It is honest about the homepage and misleading about everything else, and it is the wrong surface to judge search, cart and account by.
