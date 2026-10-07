/**
 * Host-delegate contract: no onCall serves scoped data without authorization.
 *
 * The three host delegates (PluginBlock, PluginFooterMounts, studio
 * renderers) answer the sandbox bridge with allow-list membership checks
 * only (`WIDGET_API[method]`, else throw `unknown_method`). Data fetching
 * is server-mediated elsewhere. If a future delegate serves real rows
 * (products/orders/customers/shop), it must recheck granted scopes via
 * authorizeWidgetCall/hookAllowed — this suite pins the current
 * data-free shape so that change cannot land silently.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const DELEGATES = [
  "src/components/builder/PluginBlock.tsx",
  "src/components/store/PluginFooterMounts.tsx",
  "src/components/builder/studio/renderers.tsx",
] as const;

// Data-serving markers that must never appear inside an onCall body.
const DATA_MARKERS = [
  "supabase",
  ".from(",
  "fetch(",
  "products",
  "orders",
  "customers",
  "authorizeWidgetCall",
  "hookAllowed",
];

function onCallBodies(src: string): string[] {
  const out: string[] = [];
  const re = /const onCall = useCallback\(async \([^)]*\) => \{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Cheap brace match: onCall bodies are short arrow fns ending at the
    // first balancing close at column 2.
    const start = m.index;
    const end = src.indexOf("\n  }, []);", start);
    out.push(end === -1 ? src.slice(start, start + 800) : src.slice(start, end));
  }
  return out;
}

describe("host onCall delegates serve no scoped data", () => {
  for (const file of DELEGATES) {
    it(`${file} onCall bodies are data-free`, () => {
      const src = readFileSync(file, "utf8");
      const bodies = onCallBodies(src);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        for (const marker of DATA_MARKERS) {
          expect(body, `${file} onCall must not reference ${marker}`).not.toContain(
            marker,
          );
        }
        expect(body).toContain("WIDGET_API[method]");
      }
    });
  }
});
