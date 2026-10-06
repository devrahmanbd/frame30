# Security and the sandbox boundary

Last verified: 2026-10-06.

Audience: every third-party developer. This page states the trust
boundary your code runs against. Design for denial: any call outside
your granted scopes answers `sandbox.scope_denied`, and your widget
must keep rendering.

```text
your bundle (null-origin iframe, default-src 'none')
        |  postMessage { v: 1, id, method, params }
        v
authorizeWidgetCall(msg, grantedScopes)   <-- merchant consent
        | allowed                           | denied
        v                                   v
host answers / delegates              "sandbox.<reason>" + blocked-call notice
```

## The frame

- Every widget renders inside a null-origin iframe with sandbox
  tokens and without `allow-same-origin`: no host DOM, no cookies,
  no same-origin storage
  (`src/components/marketplace/WidgetSandbox.tsx:12-19`).
- The frame policy is `default-src 'none'`: the widget runs on the
  bytes it shipped with — no fetch, XHR, WebSockets, images, or
  remote scripts (`src/components/marketplace/WidgetSandbox.tsx:127-155`).
- Replies post back only to the verified frame window and carry
  this install's validated settings plus the request id — no
  secrets, no cross-install data
  (`src/components/marketplace/WidgetSandbox.tsx:195-229`).
- The Class B dressed path never executes the bundle at all, so
  sandboxing is never weakened there
  (`src/lib/plugin-theme-contract.ts:16-20`).

## The bridge: allow-listed methods, scoped grants

The only channel out is `window.framique.call(method, params)`.
The host authorizes each message with `authorizeWidgetCall`
(`src/lib/marketplace-scopes.ts:341-360`) and rejects anything
malformed, any method outside the allow-list, or any method whose
scope the merchant did not grant. The allow-list is `WIDGET_API`
(`src/lib/marketplace-scopes.ts:260-279`); each method names the
single scope that unlocks it, including `menus.list` behind
`read_menus`.

Denial shapes match what the frame already handles
(`sandbox.malformed`, `sandbox.unknown_method`,
`sandbox.scope_denied`), with `sandbox.unknown_slot` for
unsanctioned menu fill points
(`src/components/marketplace/WidgetSandbox.tsx:62-108`). A
`scope_denied` verdict surfaces as a blocked-call notice under the
frame rather than a crash
(`src/components/marketplace/WidgetSandbox.tsx:249-260`).

## Bundle and scope rules that follow

1. Keep `eval(`, `import(`, `new Function`, `document.write(`,
   `.innerHTML =`, and string-scheduled timers out of the entry —
   the bundle gate rejects them as `bundle.dynamic_code`
   (`src/lib/marketplace-scopes.ts:211-238`).
2. Keep the bundle under 512 KB (`MAX_BUNDLE_BYTES`) and the entry
   string under 200 KB (`src/lib/marketplace-scopes.ts:199-238`);
   stay inside `PLUGIN_BUDGET` (`jsKb <= 120`, `mainThreadMs <= 50`;
   `src/lib/plugin-manifest.ts:31-32`).
3. Request minimum scopes from the `SCOPES` vocabulary
   (`src/lib/marketplace-scopes.ts:24-105`). Reviewers reject
   display widgets that ask for `read_customers`, and every extra
   scope costs conversion on the consent screen ([Plugin guide](plugins.md#declare-a-manifest-the-validator-accepts)).
4. Payment credentials, staff accounts, platform administration, and
   raw SQL are reachable from no scope.
5. Hook payloads are PII-minimal by construction: build features
   needing personal data through the scoped bridge methods
   (`customers.get`, `orders.list`) instead of hook bodies
   ([Plugin guide](plugins.md#know-the-current-limits)).

## Server hooks cannot break checkout

Server hooks are queued outbound POSTs to your `hooksUrl`, never
in-process code. Four hooks exist
(`src/lib/plugin-manifest.ts:35-41`); a subscriber missing any
required scope is skipped with zero fetch, and slow or failing
subscribers never block the host commit: calls time out at 800 ms,
trip a per-plugin breaker after 3 failures, and fall back to a
queued retry. Deliveries carry an idempotency identity and are
signed when `PLUGIN_HOOK_SECRET` is set ([Plugin guide](plugins.md#subscribe-to-server-hooks-that-cannot-break-checkout)).

## Consent, suspend, kill switch

Installs move through consent (grants must be a subset of the
manifest's permissions; widening needs a fresh consent screen),
enable/disable, suspend/resume with reason, platform kill switch
per plugin id, and uninstall-to-purge ([Plugin guide](plugins.md#walk-the-install-consent-and-disable-lifecycle)).
Suspend is idempotent; releasing the kill switch never auto-resumes.

Next: [Versioning / Publishing](versioning-publishing.md).
