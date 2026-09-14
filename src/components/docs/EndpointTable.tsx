import { Fragment, useState } from "react";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { endpointRows } from "@/lib/docs";

/**
 * The generated endpoint reference.
 *
 * Rows come from the same route table the gateway dispatches on, so this table
 * cannot drift from what is served: adding a route to the gateway adds it here,
 * removing one removes it here. Each row expands to a runnable curl and
 * TypeScript sample generated from the route shape, not hand-written per
 * endpoint (hand-written samples are where the wrong header ends up).
 */
export function EndpointTable() {
  const rows = endpointRows();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="my-6">
      {/* Mobile view (< md): Visual Infographic Cards */}
      <div className="space-y-4 md:hidden">
        {rows.map((row) => {
          const expanded = open === row.key;
          return (
            <div
              key={row.key}
              className="rounded-fq-lg border border-border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-fq-sm bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  {row.method}
                </span>
                <code className="font-mono text-xs text-muted-foreground">{row.scope}</code>
              </div>
              <p className="mt-2 font-mono text-sm font-medium text-foreground break-all">{row.path}</p>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{row.summary}</p>
              <div className="mt-3 border-t border-border/60 pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : row.key)}
                  aria-expanded={expanded}
                  aria-controls={`mobile-samples-${row.key.replace(/[^a-z0-9]/gi, "-")}`}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-fq-md border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
                >
                  {expanded ? "Hide samples" : "View curl & TypeScript"}
                </button>
              </div>
              {expanded && (
                <div className="mt-3 space-y-3 pt-2" id={`mobile-samples-${row.key.replace(/[^a-z0-9]/gi, "-")}`}>
                  <CodeBlock code={row.curl} lang="bash" caption="curl" label={`curl for ${row.key}`} />
                  <CodeBlock code={row.ts} lang="ts" caption="TypeScript" label={`TypeScript for ${row.key}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop view (md+): Clean Table */}
      <div className="hidden md:block overflow-hidden rounded-fq-md border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Framique public REST API endpoints</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th scope="col" className="py-2 pl-4 pr-2 font-semibold">
                Endpoint
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Scope
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                What it does
              </th>
              <th scope="col" className="py-2 pr-4">
                <span className="sr-only">Samples</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open === row.key;
              return (
                <Fragment key={row.key}>
                  <tr className="border-b border-border/60 align-top">
                    <td className="py-3 pl-4 pr-2">
                      <span className="mr-2 font-mono text-xs font-semibold text-primary">{row.method}</span>
                      <code className="font-mono text-xs">{row.path}</code>
                    </td>
                    <td className="py-3 pr-2">
                      <code className="font-mono text-xs text-muted-foreground">{row.scope}</code>
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground">{row.summary}</td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : row.key)}
                        aria-expanded={expanded}
                        aria-controls={`samples-${row.key.replace(/[^a-z0-9]/gi, "-")}`}
                        className="min-h-11 rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium"
                      >
                        {expanded ? "Hide" : "Samples"}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={4} className="px-4 pb-4" id={`samples-${row.key.replace(/[^a-z0-9]/gi, "-")}`}>
                        <CodeBlock code={row.curl} lang="bash" caption="curl" label={`curl for ${row.key}`} />
                        <CodeBlock code={row.ts} lang="ts" caption="TypeScript" label={`TypeScript for ${row.key}`} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
