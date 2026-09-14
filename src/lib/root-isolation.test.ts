/**
 * §4 contract: `/root` shares no UI with the merchant or customer consoles.
 *
 * The owner console must never regress because someone changed an admin
 * primitive, so this test fails the build if any file under
 * `src/components/root/**` or `src/routes/root/**` imports from the admin or
 * dashboard component trees, or from a merchant-scoped shell/hook.
 * Cross-console *data* helpers (`@/lib/*`, i18n, router) stay allowed —
 * duplicating query code would be a security risk, not an isolation win.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/components/root", "src/routes/root", "src/routes/root.tsx"];

const FORBIDDEN = [
  /@\/components\/admin/,
  /@\/components\/dashboard/,
  /@\/components\/console/,
  /@\/components\/store/,
  /@\/components\/builder/,
  /@\/hooks\/use-merchant/,
  /@\/hooks\/use-membership/,
  /@\/hooks\/use-customer/,
  /\.\.\/admin\//,
  /\.\.\/dashboard\//,
];

function walk(path: string): string[] {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (stats.isFile()) return path.match(/\.tsx?$/) ? [path] : [];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}

function imports(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

describe("/root isolation", () => {
  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)));

  it("finds the owner console files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never imports a merchant or customer console component", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of imports(readFileSync(file, "utf8"))) {
        if (FORBIDDEN.some((re) => re.test(spec))) {
          offenders.push(`${file.replace(process.cwd() + "/", "")} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the owner shell and dialog exclusive to /root", () => {
    const outside = walk(join(process.cwd(), "src"))
      .filter((f) => !f.includes("/components/root/") && !f.includes("/routes/root") && !f.endsWith("root-isolation.test.ts"))
      .filter((f) => /RootShell|RootConfirmDialog|RootCommandPalette/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd() + "/", ""));
    expect(outside).toEqual([]);
  });
});
