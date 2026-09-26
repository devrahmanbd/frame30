import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * WS3 theme-isolation guard (lint layer over `src/lib/themes/isolation.test.ts`).
 *
 * (a) No prod file under `src/lib/themes/<A>/` may import from
 *     `src/lib/themes/<B>/`, either direction. Scoped with `files` so the
 *     engine→theme direction (engine importing the theme registry) stays
 *     allowed, and `*.test.*` files stay exempt (tests may cross-reference,
 *     mirroring the vitest walk). Theme dirs are flat, so relative
 *     cross-imports can only textually be `../<other>` / `../<other>/**`;
 *     `@/`-alias imports are `@/lib/themes/<other>[/**]`.
 * (b) Shared chrome may not gain theme-name literals: StoreHeader.tsx and
 *     chrome.tsx hold zero `songoskriti`/`somvabona` mentions (any casing,
 *     any syntax position). `theme-chrome.ts` is key-driven registration
 *     (registry keys + data values are allowed there); only hardcoded
 *     theme-name *branching* (`=== "songoskriti"`, `case`, `.includes()`)
 *     is banned.
 */
const themeIsolation = [
  {
    files: ["src/lib/themes/songoskriti/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/themes/somvabona",
                "@/lib/themes/somvabona/**",
                "../somvabona",
                "../somvabona/**",
              ],
              message:
                "Theme self-containment: files under src/lib/themes/songoskriti/ must not import from src/lib/themes/somvabona/. Share code via the engine (src/lib/*, widgets) instead. See src/lib/themes/isolation.test.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/themes/somvabona/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/themes/songoskriti",
                "@/lib/themes/songoskriti/**",
                "../songoskriti",
                "../songoskriti/**",
              ],
              message:
                "Theme self-containment: files under src/lib/themes/somvabona/ must not import from src/lib/themes/songoskriti/. Share code via the engine (src/lib/*, widgets) instead. See src/lib/themes/isolation.test.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/components/store/StoreHeader.tsx",
      "src/components/builder/chrome.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/songoskriti/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `songoskriti` literals in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "Literal[value=/somvabona/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `somvabona` literals in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "TemplateElement[value.cooked=/songoskriti/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `songoskriti` literals (even inside template strings) in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "TemplateElement[value.cooked=/somvabona/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `somvabona` literals (even inside template strings) in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "Identifier[name=/songoskriti/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `songoskriti` identifiers in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "Identifier[name=/somvabona/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `somvabona` identifiers in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "JSXText[value=/songoskriti/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `songoskriti` text in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
        {
          selector: "JSXText[value=/somvabona/i]",
          message:
            "Shared chrome must stay theme-agnostic: no `somvabona` text in this file. Register per-key config in src/components/store/theme-chrome.ts instead.",
        },
      ],
    },
  },
  {
    files: ["src/components/store/theme-chrome.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[operator=/^(==|===|!=|!==)$/] Literal[value=/songoskriti|somvabona/i]",
          message:
            "theme-chrome.ts is key-driven: look the theme key up in HEADER_CHROME_REGISTRY via resolveHeaderConfig() instead of comparing against a theme name.",
        },
        {
          selector: "SwitchCase Literal[value=/songoskriti|somvabona/i]",
          message:
            "theme-chrome.ts is key-driven: look the theme key up in HEADER_CHROME_REGISTRY via resolveHeaderConfig() instead of switching on a theme name.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(includes|startsWith|endsWith)$/] Literal[value=/songoskriti|somvabona/i]",
          message:
            "theme-chrome.ts is key-driven: look the theme key up in HEADER_CHROME_REGISTRY via resolveHeaderConfig() instead of matching against a theme name.",
        },
      ],
    },
  },
];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  ...themeIsolation,
  eslintPluginPrettier,
);
