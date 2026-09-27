---
title: "What documentation standards must contributors follow?"
locale: en
audience: developer
tags: [docs, guidelines, contributors, standards]
source: /docs/developers/guidelines
version: public-corpus-v1
status: published
---

**Q: What rules apply when I write or edit repository documentation?**

Pin every behavioral claim to exact source, label anything that is planning prose, and never invent. The worked example is the Third-Party SDK and API Guide (`docs/developers/sdk.md`).

**Answer**

- Pin every code claim with a `file:line` or `file:start-end` reference in backticks, verified at HEAD before submitting — never copy a pin without re-opening the file.
- Label prose-only claims explicitly with a link to the planning source (for example, the `docs/13-export-sdk/` design docs); collect anything unverifiable in an explicit gap list marked `TBD-for-G4` instead of implementing from it.
- State Bengali/English behavior explicitly for every UI surface described; keep Bengali script in `bn` fields and prose samples, never inside code identifiers or pins.
- Use placeholders such as `<TOKEN>` or `<SECRET>` in examples — never real-looking hex — mirroring the product rule that secrets are shown once and stored hashed.
- Document only implemented routes (route table, route files, or `openapi/openapi.yaml`); link to the OpenAPI contract as normative instead of duplicating endpoint tables.
- Use American spelling (behavior, authorize, customize); **Bold** for UI labels, backticks for code, paths, headers, and literals; descriptive links, never bare "here".
- Format every Markdown file with prettier before submitting.

**Conditions**

- Dated audits stay frozen and gain appended pointers; do not rewrite them in place.
- A documented hole is a contribution; a plausible invention is a defect.
