/**
 * Phase 2.4 — one collapsible facet group.
 *
 * Built on the shared `Disclosure` so keyboard and ARIA behaviour is the same
 * as every other expandable surface. Options are real links (facets must be
 * crawlable); the active one carries `aria-current`. Nothing is fixed-width —
 * বাংলা labels run 15–30% longer than English.
 */
import { Disclosure } from "./Disclosure";

export type FacetOption = {
  value: string;
  label: string;
  count?: number;
  href: string;
  active: boolean;
};

export function FacetGroup({
  title,
  options,
  defaultOpen = true,
  onSelect,
  emptyText,
}: {
  title: string;
  options: FacetOption[];
  defaultOpen?: boolean;
  onSelect?: (value: string) => void;
  emptyText?: string;
}) {
  return (
    <Disclosure summary={title} defaultOpen={defaultOpen} tone="card">
      {options.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyText ?? "No options"}</p>
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {options.map((option) => (
            <li key={option.value}>
              <a
                href={option.href}
                aria-current={option.active ? "true" : undefined}
                onClick={
                  onSelect
                    ? (event) => {
                        event.preventDefault();
                        onSelect(option.value);
                      }
                    : undefined
                }
                className={`flex min-h-11 items-center justify-between gap-3 rounded-fq-md px-2 py-2 text-sm ${
                  option.active ? "bg-secondary font-medium text-secondary-foreground" : "text-foreground"
                }`}
              >
                <span className="min-w-0 break-words">{option.label}</span>
                {typeof option.count === "number" && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.count}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Disclosure>
  );
}
