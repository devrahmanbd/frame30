---
title: "How is my store data isolated and protected?"
locale: en
audience: platform
tags: [security, tenancy, rls, rbac, privacy, export]
source: /security
version: public-corpus-v1
status: published
---

**Q: How is my data kept separate from other merchants, and who can access it?**

Every table is scoped by merchant and enforced in the database with Postgres row-level security, so isolation does not depend on application code remembering a filter. API keys are scoped per store and per permission.

**Answer**

- Tenant isolation: all catalog, customer, order, and credential rows carry the merchant id; cross-tenant reads are blocked at the REST gateway.
- Staff roles: invite team members as `owner` (full administration), `admin` (store settings and operations), `editor` (products and content), or `viewer` (read-only audit).
- Credentials: API keys are shown once at creation and stored hashed; card details are captured by the acquirer's hosted flow and never reach store servers.
- Portability: products, orders, customers, and invoices export to CSV or through the REST API at any time — no export fee, no lock-in clause.
- Terms, privacy, and refund policies live on the legal page, versioned and dated in Bangla and English, so you can see exactly which version applied on any given day.

**Conditions**

- Key creation and revocation require the `owner` or `admin` merchant role.
- No compliance certification is claimed that is not held: the controls operated are published on the security page, and procurement teams needing specific documentation should ask support for a plain statement of what exists today.
- Incident and platform health (storefront, checkout, payment, admin) are published live on the status page with the incident log.
