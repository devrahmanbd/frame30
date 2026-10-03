# Documentation Guidelines for Contributors

Last verified: 2026-10-03 @ 1bb2cef6

Living guide for anyone writing or editing documentation in this repository.
Dated audits are different: they stay frozen and gain appended pointers (rule
8 below). The worked example of these rules is the
[Third-Party SDK and API Guide](sdk.md).

## 1. Pin every code claim with `file:line`

Every behavioral claim carries a pin to the exact source at HEAD, formatted
as `path:line` or `path:start-end` in backticks. A pin is a promise that the
reviewer can open the file and see the claim. Verify each pin at HEAD before
submitting; never copy a pin from another doc without re-opening the file.
The route table pin `src/lib/api-scopes.ts:261-376` in the
[SDK guide](sdk.md#9-implemented-route-inventory-pointer-not-a-table) is the
pattern to follow: narrow, checkable, and tied to a section claim.

## 2. Label prose-only claims; never invent

When the only source is a planning doc, say so in the text and link to it,
for example "are prose-only; see
[`docs/13-export-sdk/oauth.md`](../13-export-sdk/oauth.md)". Anything that
cannot be verified in code or prose is marked `TBD-for-G4` (or the owning
lane) and collected in an explicit gap list at the end of the document, as
in the [SDK guide gaps](sdk.md#10-explicit-gaps-tbd-for-g4-do-not-implement-from-this-guide).
Do not invent endpoints, error codes, table names, TTLs, or status literals
to fill a hole. A documented hole is a contribution; a plausible invention
is a defect.

## 3. Bengali and English rules

Merchant-facing copy notes Bengali and English behavior explicitly. The
reference pattern is the scope catalog in `src/lib/api-scopes.ts:47-146`,
where every scope carries both an `en` and a `bn` explanation. When a UI
surface, error message, or consent screen is described, state which
languages it serves and which is the default; when only English exists in
code, say so rather than assuming a translation. Keep Bengali script in
`bn` fields and prose samples, never inside code identifiers or pins.

## 4. No raw secrets or hex in examples

Examples use placeholders such as `<TOKEN>`, `<SECRET>`, or
`sk_live_<TOKEN>`, never real-looking hex. This mirrors the product rule
that secrets are shown exactly once and stored hashed
(`src/lib/api-keys.server.ts:28-34`,
`src/lib/api-keys.server.ts:109`). Placeholder values must be obviously
fake so a reader can never mistake them for working credentials.

## 5. No invented endpoints

Document only routes present in the route table
(`src/lib/api-scopes.ts:261-376`), a route file under `src/routes/api`, or
the machine contract in [`openapi/openapi.yaml`](../../openapi/openapi.yaml).
Do not duplicate endpoint tables from the OpenAPI contract; link to it as
the normative reference. If a planned endpoint from
[`docs/13-export-sdk/`](../13-export-sdk/README.md) has no route code, it
belongs in the gap list, not in a sample request.

## 6. Links, UI text, code voice, and spelling

- Write descriptive links, never bare `here` or raw URLs in sentence
  position. Prefer `[SDK guide gaps](sdk.md#10-explicit-gaps-tbd-for-g4-do-not-implement-from-this-guide)`
  over "see here".
- Use **Bold** for UI labels and controls (for example **Allow**, **Rotate
  secret**), and backticks for code, paths, headers, and literals (for
  example `Idempotency-Key`, `next_cursor`, `application/problem+json`).
- Use American spelling throughout: behavior, authorize, customize,
  normalized. When quoting code identifiers or existing doc titles, keep
  their original spelling and do not "fix" them.

## 7. Format with prettier

Run prettier on every Markdown file before submitting:

```sh
./node_modules/.bin/prettier --write docs/developers/sdk.md docs/developers/guidelines.md
```

The repository also exposes the `format` npm script for whole-tree runs.
A document that is not prettier-clean is not ready for review.

## 8. Dated audits versus living guides

- Dated audits (verification reports, design snapshots, decision records)
  stay dated and immutable. Correct them only by appending a pointer
  section; never rewrite history.
- Living guides (this file, the [SDK guide](sdk.md)) carry a header in
  exactly this format on line 3:

  ```md
  Last verified: 2026-09-26 @ 10fc35c
  ```

  Refresh the date and short commit hash on every substantive edit, and
  re-verify every `file:line` pin touched by the change. A living guide
  whose pins predate its header is stale; either re-verify or convert the
  stale claims into gaps.

## 9. Review checklist

1. Every code claim has a `file:line` pin verified at HEAD.
2. Every prose-only claim names its source doc with a descriptive link.
3. Unverifiable items appear as explicit `TBD` gaps, not as assertions.
4. Bengali and English behavior is stated, not assumed.
5. Examples contain no raw secrets or hex.
6. No endpoint, code, or status appears that code does not contain.
7. Links are descriptive; UI text is **Bold**; code is in backticks.
8. Spelling is American; prettier is clean; the header date and hash are
   current.

## 10. Retirement convention

Retiring a theme (or any registry-backed surface) is deactivation via
migration, never deletion: land a migration that deactivates the theme's
registry rows, remove the theme directory, and note the retirement here in
the guidelines so the audit trail stays queryable — dated audits gain
appended pointers and living guides keep their history (rule 8), and
retired themes are no exception.
