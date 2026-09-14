# Marketing copy decks — 11 public pages

One file per page. Each deck is the source of truth for that route's **SEO head**
(title, description, og, canonical, JSON-LD) and its **section-by-section copy**,
in band order, with the neuroscience lever named per block.

Design tokens and surfaces: `/DESIGN.md`. Build order and gates: `/TODO.md`.

| # | File | Route | H1 |
|---|---|---|---|
| 1 | `01-home.md` | `/` | Sell in Bangladesh. Ship worldwide. |
| 2 | `02-pricing.md` | `/pricing` | Pricing that stays honest at scale. |
| 3 | `03-features.md` | `/features` | One platform. Every part of the sale. |
| 4 | `04-builder.md` | `/builder` | Design the storefront. Don't fight the theme. |
| 5 | `05-payments.md` | `/payments` | bKash, Nagad, card, COD — reconciled. |
| 6 | `06-fulfilment.md` | `/fulfilment` | From order to doorstep, tracked. |
| 7 | `07-customers.md` | `/customers` | Stores that grew on Framique. |
| 8 | `08-docs.md` | `/docs` | Build on the Framique API. |
| 9 | `09-security.md` | `/security` | Tenant isolation you can verify. |
| 10 | `10-about.md` | `/about` | Built in Dhaka, for the way Bangladesh sells. |
| 11 | `11-contact.md` | `/contact` | Talk to a human. |

## Rules that bind every deck

- **One H1 per page** — the hero line. Every other band opens at `h2`.
- **Title < 60 chars, description < 160 chars**, unique per route; `og:title`,
  `og:description`, `og:type` and a self-referencing `canonical` + `og:url`.
- **No claim without a shipped feature behind it.** Numbers are read live from
  the database or omitted — never invented, never rounded up.
- **No invented testimonials, credentials, certifications or ratings.**
- Every page ends with **exactly one primary CTA** and one low-commitment
  alternative.
- **Z / flip rows**: deep-dive sections alternate text-left / text-right at
  60/40, one claim + one proof + one UI still per row.
- **Bangla copy** never inherits latin negative tracking; `lang="bn"` subtrees
  drop `letter-spacing` to 0 and keep a 1.35+ line box.
- **Keyword set per deck**: each SEO block names one primary keyword, 3–5 secondary
  terms, long-tail question intents, and the bands where they must appear. Keywords
  are earned in copy — never emitted as a `<meta name="keywords">` tag.
- **Relative canonicals**: `canonical` and `og:url` stay relative until a production
  domain is set; `og:type` and `twitter:card` are declared on every deck.
