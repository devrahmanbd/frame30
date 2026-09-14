/**
 * Phase 1.3 — a11y-correct disclosure.
 *
 * One implementation behind every accordion, spec group, ingredient list and
 * "read more". Native `<button aria-expanded>` + a labelled region, Escape
 * collapses, and nothing animates height (which would break CLS budgets).
 */
import { useId, useState } from "react";

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  tone = "plain",
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "plain" | "card";
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={tone === "card" ? "rounded-fq-md border border-border bg-card" : ""}>
      <h3 className="m-0">
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) setOpen(false);
          }}
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium"
        >
          <span className="min-w-0">{summary}</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            {open ? "−" : "+"}
          </span>
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        hidden={!open}
        className="px-3 pb-3 text-sm text-muted-foreground"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Tabs with roving focus, the WAI-ARIA authoring-practices keyboard model.
 * Panels stay mounted so switching a tab never refetches or shifts layout.
 */
export function Tabs({
  items,
}: {
  items: { key: string; label: React.ReactNode; content: React.ReactNode }[];
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  if (items.length === 0) return null;
  const move = (delta: number) => setActive((i) => (i + delta + items.length) % items.length);
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(1);
              if (event.key === "ArrowLeft") move(-1);
            }}
            className={`rounded-t-fq-md px-3 py-2 text-sm ${
              active === index ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
          className="px-1 py-3 text-sm text-muted-foreground"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
