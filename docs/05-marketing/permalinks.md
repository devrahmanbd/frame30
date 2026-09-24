# Permalinks — URL structures for your store

> Dashboard: **Marketing › SEO › Permalinks**. Works like WordPress
> Settings › Permalinks: pick a common structure or type a custom base,
> save once, and every old URL keeps working through automatic 301s.

## Common settings

**Products** (your money URLs)

| Structure | Example |
|---|---|
| Default | `/p/jamdani-saree` |
| Post name | `/jamdani-saree` |
| Custom base | `/shop/jamdani-saree` |

**Collections**

| Structure | Example |
|---|---|
| Default | `/c/women` |
| Post name | `/women` |
| Custom base | `/collections/women` |

**Blog articles**

| Structure | Example |
|---|---|
| Post name | `/blog/hello-world` |
| Month and name | `/blog/2026/09/hello-world` |
| Day and name | `/blog/2026/09/24/hello-world` |
| Custom pattern | pick from the pattern list |

**Pages** use a base only (`/pages` by default).

## Available tags

Custom structures accept only these tags — anything else is refused
with an explanation, never silently ignored:

`%postname%` `%category%` `%year%` `%monthnum%` `%day%`

Date tags apply to blog articles only. Products, collections and pages
are dateless, so a date tag there is rejected at save time.

## Optional bases

Leave any base blank to use the default. Blank product, collection or
page bases mean root post-name URLs (`/jamdani-saree`). Two kinds may
never share one non-empty base. If several kinds sit at root and share
a slug, the first slug match wins in this order: article, product,
collection, page.

The following prefixes are reserved by the platform and refused:
`admin`, `auth`, `checkout`, `api`, `cart`, `store`, `dashboard`,
`onboarding`, `order` and a few more — a base starting with one of
these would make part of the product unreachable.

## Save changes

1. Pick structures (or type custom bases) and press **Preview change**.
   You see exactly how many URLs will move before anything happens.
2. Press **Apply & write redirects**. New URLs go live and every old
   URL 301-redirects to its replacement — one hop, no chains, no
   plugins needed.
3. Changing slugs afterwards works the same way: edit a product,
   collection, page or post slug and the old address redirects
   automatically.

Unlike WordPress there is no `.htaccess` step and no redirect plugin
to install — the sweep is part of saving.
