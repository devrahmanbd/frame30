# IMPLEMENTATION BRIEF: Theme-Editable CMS Templates — Frame30

**Repository:** `https://github.com/devrahmanbd/frame30/`

**Target:** Work on the current agreed branch and check both `main` and `frame30` before modifying anything. Do not assume they are identical. Preserve existing uncommitted work, review recent merges, and implement against the current source of truth.

## Mission

Upgrade Frame30's core CMS and page builder so every supported theme can independently design, save, preview, publish, and render these storefront templates:

1. Search results
2. Cart
3. Account
4. Blog
5. Checkout
6. Archive
7. Generic CMS Page

Fix the generic Page issue so the CMS renders the actual page selected by the merchant, using its real title, body, media, metadata, and other stored content—not a hardcoded Size Guide, demonstration copy, or generic fallback body.

Use Songoskriti as the primary implementation and visual-verification target. Do not resurrect Somvabona-specific dependencies as part of this work. Do not rewrite working native commerce logic merely to change its presentation.

The final experience must be comparable to a modern visual theme builder: merchants can select a template, arrange sections and widgets, configure properties, preview realistic data, save their changes, and publish a consistent storefront.

**Do not stop after adding template enum values or preview components.** Connect the actual CMS editor, storage, route resolver, data provider, renderer, publishing lifecycle, and live storefront.

## 1. Audit the existing implementation first

Trace the actual end-to-end paths for:

- Template definitions and AST parsing/validation.
- The theme editor and `/dashboard/content/editor`.
- Theme template selection and saving.
- Widget tray and schema-generated inspector controls.
- `SectionRenderer`, `StudioCanvas`, and the production storefront renderer.
- Theme registry, per-widget theme presentations, and theme-owned widgets.
- Default theme templates and official source-backed theme registration.
- Search, product collections, cart, customer account, blogs/articles, checkout, archive-like routes, and CMS pages.
- Preview data providers, publishing, and persisted template resolution.
- Theme package contracts, security validation, and existing browser tests.

Reuse the existing architecture wherever possible. Identify why the existing preview uses generic bodies, demo data, or empty slots, and whether the same problem occurs in the live storefront. Do not assume preview behavior and storefront behavior are identical.

Before modifying code, produce an implementation map showing where each of the seven requested template types is defined, edited, persisted, populated with data, and rendered.

## 2. Establish a complete template contract

Extend the existing template-key system to include `archive` while preserving existing template identifiers and serialized content.

The current supported keys include `index`, `product`, `collection`, `account`, `page`, `blog`, `cart`, `checkout`, and `search`. Add `archive` as a real first-class template, not as a hardcoded alias that silently renders another template.

Update every dependent contract that uses the template-key union, including zone allowlists, template parsers and validators, route-to-template resolution, default template definitions, required-heading validation, theme package compatibility, installation/seeding, migrations, preview, publishing, and tests. Use the compiler to find exhaustive maps and switch statements rather than fixing only the obvious type declaration.

Every editable template must support:

- A stable template key and schema/API version.
- Persisted layout slots and widget instances.
- Theme-specific layout and design tokens.
- Validated widget properties and data requirements.
- Responsive settings and supported visibility rules.
- Loading, empty, error, and unavailable-content states.
- Template-level SEO and accessibility rules.
- Safe defaults and recovery when a stored template is missing or incompatible.

Keep template identity separate from widget identity. Adding `archive` must not require pretending that it is another widget type.

## 3. Make every template editable in the actual CMS

Add or complete a template manager within the existing CMS/theme editor.

Merchants must be able to select any supported template, edit its composition, insert supported widgets, change schema-generated properties, reorder sections, preview desktop/tablet/mobile, save, and publish.

Use the existing canonical AST, extension registry, history/state management, and schema-driven inspector. Do not create a competing second editor or a template-specific hardcoded inspector.

The selected template must be explicit in the editor UI. Saving Search must not overwrite Cart, editing Account must not change Page, and changing a shared widget presentation must not unexpectedly alter another theme.

Provide actions to preview, save, publish, reset to a safe default, and recover when a saved template references a missing widget. Do not silently replace a missing template with the homepage or a generic body.

Ensure the same template is used by the real storefront route, editor preview, and publishing validation, subject to their documented data and security differences.

## 4. Define a route-owned render-data contract

The theme controls presentation, not access to raw databases. Introduce or extend a typed, validated render context for each template, populated by the existing server-side route/data layer.

The context should expose only the data needed by the selected template—for example:

- `search`: query, result items, active filters, available facets, sort order, result count, pagination, and empty/error state.
- `cart`: line items, variants, quantity, valid price/totals, permitted discounts, shipping estimate, and empty/error state.
- `account`: authentication state, permitted customer profile fields, order history, order tracking, and account actions.
- `blog`: blog landing data, articles, author, tags/categories, media, and pagination according to existing CMS routes.
- `checkout`: current step, permitted shipping choices, payment-method options, authoritative order summary, validation errors, and completion/thank-you state.
- `archive`: resolved archive kind, title, description, breadcrumb context, records, filters, sorting, and pagination for supported taxonomy or listing routes.
- `page`: the selected CMS page's real ID, slug, title, body/content AST, metadata, media, locale, and publication status.

Use existing application schemas and source-of-truth records. Do not invent duplicate data models when suitable models already exist.

Resolve the active template using the actual route and record context. Query only the data required for that route, batch related reads where appropriate, and enforce tenant boundaries and permissions on the server.

## 5. Implement Search as a real theme template

Make Search's layout fully theme-editable.

Provide reusable widgets/components for the search header, query summary, result count, filters/facets, active filter chips, sorting, product/content result grids, pagination or supported incremental loading, and empty/error states.

The theme must be able to reorder and style these elements through the builder and their property schemas. A theme may display suggestions or editorial content around results without replacing actual query results with static popular-product examples.

Keep search execution, tenant scoping, query validation, filtering, and result authorization in the platform. Widget settings may control presentation and permitted page size, but may not bypass result limits or authorization.

Acceptance: searching for a known fixture returns those results; filters and sorting update them correctly; an empty query/result state is accurately represented; the published output matches the selected theme template.

## 6. Implement Cart as a real theme template

Allow themes to design the cart page, including:

- Cart heading and empty-cart state.
- Cart line layout and product imagery.
- Variant/option details.
- Quantity and remove controls.
- Discounts and subtotal/total summaries.
- Shipping or free-shipping messaging where supported.
- Recommendations, continue-shopping links, and checkout CTA.
- Loading, failure, and out-of-stock states.

Use the existing platform cart and mutation APIs. Quantities, stock, discounts, prices, totals, and checkout eligibility must be revalidated by the server.

Provide realistic synthetic cart lines and totals to editor preview instead of `null` slots, without treating preview data as a real customer cart.

Acceptance: insert/update/remove actions affect the real test cart; totals recalculate from authoritative data; empty and populated carts can both be previewed and rendered through Songoskriti; invalid or unauthorized mutations are rejected.

## 7. Implement Account as a real theme template

Allow themes to design the account overview and applicable existing account subroutes, including profile, orders, order details/tracking, and account navigation.

Support explicit authenticated, unauthenticated, loading, empty, and error states. Allow themes to style navigation and data presentation through supported widget schemas.

Use the existing identity, session, and customer authorization systems. Never expose one customer's data to another customer, include secrets in preview context, or rely on a client-side widget to decide whether an account route is authorized.

Provide clearly labelled synthetic profiles and orders in preview.

Acceptance: authenticated users see only their own permitted data; unauthenticated users see the intended sign-in state; real account route actions continue working after theme customization; changing the theme cannot weaken route authorization.

## 8. Implement Blog as a real theme template

Audit the existing blog and article routes first and preserve their current semantics.

Allow themes to build the appropriate blog listing, article presentation, and supported author/category/tag views through reusable editor widgets. Provide article cards, featured imagery, title/excerpt, author/date, taxonomy links, article body, related content, and pagination as supported by the existing CMS model.

Support real article content and media, not hardcoded “Meet the makers” demonstration text. If listing and article-detail pages need different layouts, represent them through explicit template variants or separate supported template keys according to the current routing model—do not overload one ambiguous key.

Preserve content permissions, publication status, locale, URL structure, SEO metadata, and structured data. Themes control appearance; the CMS remains authoritative for article content.

Acceptance: publish two articles, render the listing, open each article, navigate pagination or taxonomy where supported, and verify that edits to template layout change the presentation without rewriting article records.

## 9. Implement Checkout as a themeable but security-restricted template

Allow the theme to design the checkout shell and approved presentation components, including progress/step indicator, contact/shipping sections, permitted delivery choices, order summary, supported payment-method selection, validation feedback, and post-purchase/thank-you presentation.

Reuse the current checkout, payment-provider, and server-authoritative order flow. Do not allow custom widget code to process payments, access raw payment credentials, set final prices, create trusted orders, bypass validation, or arbitrarily control transaction state.

Sensitive form handling and payment components must continue through the platform's validated interfaces. Do not inject arbitrary custom JavaScript into the privileged checkout page. Keep the existing restrictions on popups/overlays that could obstruct payment steps.

Make checkout preview explicitly a demo. Use a sandbox/test payment provider in integration tests; never use real payment credentials for UI tests.

Acceptance: a valid test checkout completes through the actual test-provider flow; rejected or tampered totals are not accepted; payment errors and successful completion render the correct states; all theme customizations preserve security, accessibility, and order integrity.

## 10. Add a first-class Archive template

Implement `archive` as a real template key and editor option. First inventory the actual storefront's archive-like routes so the template has precise semantics rather than becoming a vague fallback.

Define the supported archive kinds based on existing platform routes, such as taxonomy/category, brand, tag, author, or other existing content archives. Do not duplicate the existing Product Collection template or silently repurpose the Blog template.

Use a normalized archive context with its kind, title, description, breadcrumbs, available filters, sorting, results, pagination, and state. Expose only filters and actions supported by the corresponding route/data source.

Allow themes to build archive layouts using the existing shared listing, filter, card, heading, and pagination widgets where suitable. If two archive kinds have materially different semantics, support validated variants of the archive template rather than adding hardcoded route-specific renderer branches throughout the editor.

Map each supported archive route to the correct template and data context. Keep unsupported routes as explicit not-found or unsupported states; do not convert every unknown URL into a valid archive.

Acceptance: each supported archive kind resolves to the correct layout and records, pagination/filtering remains correct, and a theme can change the composition without changing the underlying archive query or authorization.

## 11. Fix the generic Page template

This is a required functional fix, not merely a redesign task.

Remove the production dependency on hardcoded demo copy such as “Size guide” or generic sample instructions. The `page` template must be an editable layout shell into which the real selected CMS page content is rendered.

Resolve the requested page by its canonical published record and route/slug, then supply its actual content and metadata through the validated render context. Use the existing `page_content` or equivalent shared widget if appropriate, but verify that it reads the current page context and is not hardcoded to one fixture.

Support both ordinary content pages and pages with optional page-specific layout/template assignments if the current CMS supports those assignments. If no per-page override exists, use the theme's shared Page template with the selected page's actual content. Do not create a second independent page-content store.

Maintain the distinction between:
- The theme-owned Page template layout.
- The individual CMS page record and its content.
- Any explicitly supported per-page template assignment.

The template must be customizable without overwriting a page's content. Editing Page template layout should affect the presentation consistently, while editing a single page's title/body should update only that page.

Acceptance:
1. Create two CMS pages with different titles, body content, media, and metadata.
2. Render each by its own URL and verify its correct content.
3. Change the shared Page layout and verify both pages adopt the layout without exchanging or losing content.
4. Edit one page's content and verify the other is unchanged.
5. Test draft, unpublished, missing, and unauthorized page cases.
6. Confirm no sample demo body leaks into a published page.

## 12. Keep templates and widget presentations separate

A template is the composition of a page—its sections, slots, order, and properties. A widget presentation is how one widget renders in a specific theme.

Use both systems together:
- Templates decide which widgets appear, and in what order.
- Theme presentations supply theme-specific markup and styling for compatible widget identities.
- Route-owned contexts supply validated, permitted data.
- Platform actions perform sensitive operations.
- The theme design system supplies colors, typography, spacing, and other visual tokens.

Do not implement a template by hardcoding a large JSX branch per theme and route. Do not make every template type a widget. Do not put commerce mutations in custom theme renderers.

Use the existing theme presentation registry for suitable per-widget overrides and the canonical AST for complete template layouts. Keep all registrations namespaced and deterministic; a missing presentation must never resolve to another theme's implementation.

## 13. Update default templates, official themes, and publishing

Provide appropriate default template ASTs for every supported template in each official theme. Use Songoskriti as the primary port and visual acceptance target.

For each template:
- Provide a genuinely designed default layout.
- Insert the shared widgets needed to present its required data.
- Use Songoskriti-specific presentations only where its visual identity requires them.
- Include correct locale, direction, typography, media, spacing, responsive behavior, and page headings.
- Ensure every required data slot is rendered or has a clearly defined empty state.
- Preserve source-backed official theme installation. Do not create an official ZIP to seed the new templates.

Update the save, publish, version snapshot, migration, and rollback paths. Theme installation must seed missing defaults without overwriting merchant-edited templates. Template upgrades must preserve compatible merchant work and fail safely on incompatible stored content.

Ensure theme switches preserve the previous theme's data and layout records. Theme-specific templates must not leak their presentation or content into another theme.

## 14. Fix the preview system

Make the theme preview use the same template resolution, widget registry, section rendering, and schema contract as the live storefront, with an explicit preview-data provider.

Generate realistic fixtures for every template:
- Search with several results, active filters, and an empty state.
- Cart with multiple variants, quantities, discounts, totals, and an empty state.
- Account with sample profile and order history.
- Blog with listing entries and article detail.
- Checkout with test-only delivery/payment choices and validation states.
- Archive with representative records, facets, and pagination.
- Page with at least two distinct CMS page fixtures.

Label preview data and disable or stub mutations explicitly. Do not let mock data leak into the production renderer or use preview-only visual fidelity as proof that live routes work.

Unknown template names must produce a clear, intentional unsupported state or documented redirect. Do not silently render the homepage.

## 15. Accessibility, SEO, and performance

Apply existing responsive breakpoints and design-token mechanisms. Keep keyboard navigation, form labels, focus management, readable empty/error states, and reduced-motion behavior functional across all templates.

Preserve existing SEO metadata, canonical URLs, semantic structure, and structured-data rules. Ensure the correct route or template supplies one well-defined primary heading, avoiding duplicate H1 elements.

Only fetch data required for the active template. Avoid per-widget N+1 requests, redundant copies of route data, and expensive synchronous theme operations. Use pagination, bounded lists, lazy loading, and the existing asset pipeline where appropriate.

Do not sacrifice real commerce behavior or accessibility for screenshot similarity.

## 16. Security and tenant isolation

The theme controls layout and presentation, not platform authority.

- Search data must respect the current tenant, visibility, and access rules.
- Cart and checkout must use server-authoritative prices, discounts, stock, totals, and state transitions.
- Account data must belong to the currently authenticated customer.
- Archive, collection, blog, and Page queries must respect publication status and permissions.
- Preview data must never expose live private customer/order information.
- Theme code must use the approved sandbox and declared capabilities.
- No theme may access raw database connections, secrets, payment credentials, or unrestricted authenticated APIs.
- Unknown widgets and incompatible templates must fail safely without silently displaying another theme's content.
- Saving or publishing invalid template data must not partially corrupt previously published output.

Retain existing package validation, Level B approval, fingerprint binding, capability checks, asset isolation, and revocation controls.

## 17. Required regression and end-to-end tests

Add or update tests at three levels.

### Contract/unit tests
- `archive` is included in all required template maps and schemas.
- Every default template passes the AST/parser/lint rules.
- Required data contexts and widgets are validated.
- Each template's heading contract remains correct.
- Unknown template keys fail safely.
- Missing templates and missing widgets use intentional fallbacks.
- Page records and template layouts remain separate.
- Permissions and private data are not exposed.

### Integration tests
- Every route resolves to the correct template.
- The context provider supplies the right route-specific data.
- The theme registry selects the correct theme presentations.
- Template save/reload/publish preserves layout and content.
- Theme install seeds defaults without overwriting merchant edits.
- Theme switching never leaks another theme's layouts or components.
- Cart mutations, checkout validation, account scoping, and page publication still use the real platform services.

### Browser E2E tests
For each of Search, Cart, Account, Blog, Checkout, Archive, and Page:
1. Open the actual authenticated editor.
2. Select the template.
3. Insert/reorder widgets and change real inspector properties.
4. Preview desktop, tablet, and mobile.
5. Save and reload.
6. Publish.
7. Open the actual storefront route.
8. Verify that the saved template, route context, and data render correctly.
9. Exercise applicable interactions.
10. Verify the documented empty, error, unauthenticated, and unavailable cases.

Include the Songoskriti visual-parity fixtures and asset validation. Use test-provider checkout and synthetic account/cart data. Run the real tests rather than treating the existence of test files as completion.

## 18. Update the documentation

Update the canonical internal docs under `docs/` to define:
- Supported template keys and their route semantics.
- The theme template AST and template/widget distinction.
- The schema-driven editor workflow.
- The render-context contract for each template.
- The `archive` route contract.
- The Page template versus CMS page-record distinction.
- The official source-theme lifecycle.
- Preview versus production data and runtime behavior.
- The security constraints around Account, Cart, Checkout, and executable themes.
- The actual verification commands and test status.

Update third-party theme/widget developer docs to explain which templates can be customized, which widgets can be placed, how to declare presentations and properties, how to preview them, and which actions remain platform-controlled.

Remove contradictory legacy instructions, and only mark a guide verified after comparing it with the actual implementation and tests.

## 19. Definition of done

This work is complete only when all of the following are demonstrated:

1. The template selector exposes all seven requested template types.
2. Every template can be designed through the actual CMS editor.
3. Search, Cart, Account, Blog, Checkout, and Archive receive real route-owned data and render their correct states.
4. Page displays the selected published page's actual content, not a hardcoded generic body.
5. Songoskriti has distinct, responsive, visually approved templates for every supported type.
6. Widget properties, template layouts, page content, and theme presentations survive save/reload/theme switching without cross-contamination.
7. All protected commerce and account operations remain platform-authorized.
8. Unit, integration, and authenticated browser tests pass, including published storefront verification.
9. Asset and visual-parity checks pass for Songoskriti.
10. CI passes on the actual target branch commit.
11. Documentation matches the shipped routes, contracts, and behavior.

Finish with an evidence-based report listing the files changed, templates completed, real routes tested, asset results, test commands/results, limitations, and any blocked acceptance criteria.

**Final product requirement:** A merchant must be able to design all seven template types in Frame30, publish them, and see those layouts rendered around the correct real platform data. Songoskriti must be the proof that this is a working end-to-end CMS capability—not a set of attractive but disconnected preview pages.
