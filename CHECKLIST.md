third-party widgets still lack their own usable per-instance inspector schema, extension rendering is not fully connected to the existing renderer, and custom theme uploads still use a data-only package format that rejects executable code.

raw.githubusercontent.com
+3

I reviewed the available source files on the branch. I could not run the repository's test commands because the environment could not resolve github.com to check out the branch, so this is a source audit—not a claim that the application or end-to-end tests have been executed.

1. Scorecard against the brief
   These are engineering estimates based on the implementation evidence, not benchmark scores.
   Elementor-style third-party widgets
   5/10

Registration and discovery foundations exist; per-instance editing and complete rendering are not connected.

Custom-theme developer freedom
4/10

An isolated executable-theme frame exists, but the documented custom-theme package pipeline still rejects executable assets.

Overall page-builder parity
6.5/10

A substantial native editor exists, but the common editing model does not yet extend end-to-end to all plugin- and theme-owned widgets.

2. Requirement-by-requirement audit
   Requirement Status Evidence
   Unified widget registry Partial unified-widget-registry.ts supports namespaced definitions, versions, registration, and resolution.

raw.githubusercontent.com
Canonical extension AST node Partial builder-ast.ts now defines an extension node, owner metadata, widget key, instance ID, and version information.

raw.githubusercontent.com
+1
Automatic plugin widget discovery Partial WidgetTray.tsx adapts installed plugin manifests and lists eligible plugin widgets.

raw.githubusercontent.com
+1
Per-widget propsSchema in plugin manifests Not implemented The current PluginWidgetDef has no propsSchema field.

raw.githubusercontent.com
Schema-generated controls for plugin instances Not implemented end-to-end The plugin adapter supplies an empty schema, and the inspected legacy inspector reads fields from the AST catalog.

raw.githubusercontent.com
+1
Extension insertion Partial The tray can produce canonical extension nodes, but onAddExtension is optional and callers can remain on the legacy plugin_block path.

raw.githubusercontent.com
+1
Common renderer for plugin and theme widgets Partial A resolution service defines modes and fallbacks, but the current SectionRenderer.tsx still resolves through the existing catalog and component registry rather than that new service.

raw.githubusercontent.com
+1
Theme-owned widgets in the editor Partial The registry and presentation service define theme-owned widget concepts, but full widget-definition, inspector, and renderer integration is not demonstrated.

raw.githubusercontent.com
+1
Code-capable isolated theme runtime Partial ThemeRuntime.tsx loads an immutable theme document in a sandboxed iframe with scripts allowed and same-origin access denied.

raw.githubusercontent.com
+1
Executable custom theme package and SDK Not implemented in the documented package path The custom theme ZIP validator rejects executable extensions, and the developer guide explicitly prohibits executable theme content.

raw.githubusercontent.com
+2
GSAP/Three.js for custom theme developers Not demonstrated end-to-end Existing controlled motion capabilities do not establish that third-party theme packages can bundle and execute arbitrary custom components and libraries.

GitHub
+1
Theme switching preserves extension settings Partial / unverified The registry has missing-widget data-preservation behavior, but the full editor-to-storefront extension workflow has not been established.

GitHub
+1
Full install → editor → save → preview → publish journey Not verified I found component/service tests, but could not run the suites or verify the journey in a browser. 3. The most important defects
P0 — The new extension node is not yet a complete working widget
The AST now has a canonical extension-node concept, which is a meaningful step forward. However, the existing renderer still runs through catalogEntry(section.type) and resolveWidgetComponent(themeKey, section.type). It does not show an explicit rendering path for the namespaced extension definition through the newer presentation service.

GitHub
+2

The inspected inspector is also still driven by catalogEntry(section.type).fields. The generic extension entry has an empty field list, so that path cannot generate the widget's actual plugin-specific controls.

GitHub
+1

Required fix: wire canonical extension nodes into the actual editor's selection, inspector, canvas, preview, and storefront renderer. Do not treat the new AST type or resolver as proof that the widget works.
P0 — Third-party widgets still have no proper per-instance schema
The registry's definition shape already has a propsSchema field. However, the actual adapter for installed plugin manifests creates definitions with defaults: {} and propsSchema: { fields: [] }.

GitHub

This means the current plugin registration path does not carry the per-widget property contract the brief requires. Plugin-wide settings are not a substitute for individual widget settings.
Required fix: add versioned per-instance schemas and default properties to PluginWidgetDef; validate those schemas; initialize every new instance from them; and connect the generated fields to the actual inspector and persistence mechanism.
A practical acceptance test: a third-party developer adds a widget with a heading, color, image, and repeater. After installing the plugin, the merchant must see those four controls without any Frame30 core source edits.
P0 — Theme renderer integration remains incomplete
The new widget-presentation.ts service defines the expected presentation modes, including isolated plugins, themeable plugins, and theme-owned widgets. Its own source comments identify renderer integration and activation compatibility checking as further wiring points.

GitHub
+1

The existing theme-presentations.ts registry, meanwhile, still uses SectionType as its widget key. That does not, by itself, provide dynamic lookup for arbitrary namespaced third-party widgets.

GitHub

The widget tray has adopted some of the new infrastructure, including theme tray discovery and an optional canonical extension insertion callback. That is progress, but partial adoption is not the same as a unified editor/storefront implementation.

GitHub
+1

Required fix: make one renderer-resolution service authoritative for widget identity, rendering mode, compatibility, fallback, and owner isolation. Connect it to actual editor and storefront rendering paths, not just a standalone service test.
P1 — The isolated custom-theme runtime is not proof of full developer freedom
There is genuine progress here: ThemeRuntime.tsx builds a version-pinned theme URL, permits scripts in an isolated frame, disallows same-origin privileges, and imposes a restrictive content-security-policy contract.

GitHub
+2

There is also a test file for the frame's sandbox tokens, CSP, immutable URLs, and height-handshake behavior.

GitHub

But the documented package route remains data-only. The theme package validator rejects JavaScript, TypeScript, JSX, HTML, and other executable asset types, and the theme authoring guide still states that themes cannot contain executable content.

GitHub
+1

Required fix: keep the secure data-only format, and create an explicit code-capable theme package/runtime mode with its own approved asset pipeline, manifest contract, versioning, review rules, developer SDK, and installation lifecycle. Demonstrate that a merchant/community theme can actually publish a bundled component through that route.
The runtime component is a useful security foundation, but it does not prove the upload, package, editor, and rendering integration exists.
P1 — Theme-owned widget registration and editing are not yet established
The current unified registry can accept theme: definitions and the presentation service understands a theme-owned mode. But the available evidence does not establish a complete path from a custom theme's installed package to a schema-driven editor widget and its executable presentation.
Required fix: a validated custom theme must be able to declare a widget definition, register it under its own namespace, render it through the approved runtime, and expose its schema to the inspector. If that theme is disabled or changed, the page should preserve its configuration and display a useful fallback.
P1 — Existing theme behavior must survive the extension redesign
The branch's source-backed official-theme distribution boundary is in good shape: the changelog states that official theme install/catalogue/preview/update paths no longer use ZIP construction, while the custom merchant ZIP pipeline is preserved.

GitHub

Do not regress that distinction while implementing extension widgets. Official source-backed modules and merchant-uploaded executable themes need different distribution and trust paths, even if they share the same public widget-definition contract. 4. Tests: present is not the same as passing
I found tests for the unified registry, widget-presentation service, and custom-theme runtime component. The registry tests cover registration, namespace validation, version handling, fallback/data preservation, and the current adapters. The presentation tests cover the resolver's modes and fallback behavior.

GitHub
+2

Those are valuable unit tests, but they do not establish the complete workflow in the implementation brief. I was not able to run these tests, type checking, or browser tests from this environment because the GitHub checkout failed at DNS resolution.
The minimum missing proof is an integration suite that installs a real plugin with a non-empty widget schema, opens /dashboard/content/editor, edits two independent instances, saves and reloads the page, previews, publishes, switches themes, and verifies the storefront. A second browser test must install a real code-capable theme and execute actual bundled animation/3D code within the intended security boundary. 5. Recommended order of work

1. Finish first-class plugin schemas and inspector controls. Extend the manifest and plugin adapter with real per-instance schemas, and connect them to editor state and persistence.
2. Wire extension nodes through the actual editor and renderer. Make insertion, selection, inspection, rendering, preview, publish, and missing-widget fallback all use the same definition and instance identity.
3. Make the dynamic presentation service authoritative. Connect it to the real renderer and theme compatibility/activation path, while preserving Class A isolation and Class B theme presentation.
4. Finish the code-capable custom-theme package path. Integrate the isolated runtime with a documented executable package format, validation and review, a buildable SDK, and actual custom-widget registration. Keep the existing data-only package mode secure.
5. Verify one real end-to-end example. Use a plugin with repeater/responsive controls and a custom theme with GSAP plus a bundled 3D example. Run unit, integration, security, and browser tests and report actual results.
   Final verdict
   No—the complete implementation brief has not yet been demonstrably executed on frame30. The branch contains useful scaffolding and some real architectural improvements, particularly the unified registry, extension AST representation, resolution contract, and isolated runtime component. But the most important product requirement remains unproven and, in the inspected paths, incomplete: a developer must be able to install a third-party widget or custom theme widget, see it appear in /dashboard/content/editor, edit its own schema-generated properties, and render it correctly through the active compatible theme.
