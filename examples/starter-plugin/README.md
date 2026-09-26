# Starter plugin

Minimal third-party plugin example. Copy this folder to start a new plugin.

- `manifest.json` — the plugin contract. Validate it with `parseManifest` in
  `src/lib/plugin-manifest.ts` before submitting.
- `src/widget.ts` — the single source of truth for the widget entry. Keep the
  entry free of `eval(`, `import(`, and `new Function`.
- `tests/` — vitest suite mirroring the real gates: manifest validation,
  sandbox bridge allow-list, and lifecycle resolution.

Run:

```bash
npx vitest run --config examples/starter-plugin/vitest.config.ts
```

Typecheck:

```bash
npx tsc --noEmit -p examples/starter-plugin/tsconfig.json
```

Read `docs/developers/plugins.md` for the full third-party guide, including
the subscription billing gap and the self-bill workaround.
