/**
 * Phase 1.3 — the one responsive data table.
 *
 * Spec tables, comparison tables, size guides and warranty panels are the same
 * component with different rows. Sticky header and sticky first column on wide
 * screens; on mobile the table collapses into labelled definition rows instead
 * of forcing a horizontal scroll of unreadable columns.
 */

export type DataTableColumn = { key: string; label: React.ReactNode };
export type DataTableRow = { key: string; label: React.ReactNode; cells: Record<string, React.ReactNode> };

export function DataTable({
  caption,
  columns,
  rows,
  stickyFirstColumn = true,
}: {
  caption?: React.ReactNode;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  stickyFirstColumn?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-fq-lg border border-border bg-card">
      {/* Wide: a real table with sticky chrome. */}
      <div className="hidden max-h-[32rem] overflow-auto md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="px-3 py-2 text-left text-xs text-muted-foreground">{caption}</caption>}
          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky top-0 z-20 bg-muted px-3 py-2 text-left font-medium ${
                  stickyFirstColumn ? "left-0" : ""
                }`}
              >
                <span className="sr-only">Attribute</span>
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="sticky top-0 z-10 bg-muted px-3 py-2 text-left font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={`bg-card px-3 py-2 text-left font-medium ${stickyFirstColumn ? "sticky left-0 z-10" : ""}`}
                >
                  {row.label}
                </th>
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 text-muted-foreground">
                    {row.cells[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow: stacked definition rows, one block per column. */}
      <div className="divide-y divide-border md:hidden">
        {columns.map((column) => (
          <section key={column.key} className="p-3">
            <h4 className="text-sm font-semibold">{column.label}</h4>
            <dl className="mt-2 space-y-1">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                  <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
                  <dd className="text-right">{row.cells[column.key] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
