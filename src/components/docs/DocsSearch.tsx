import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { buildSearchIndex, docPath, searchDocs, type DocVersionId, type SearchHit } from "@/lib/docs";

/**
 * Client-side docs search — no external service, no network call, no index
 * download. The corpus is a few thousand words, so the index is built once per
 * mount from the same block tree the pages render and queried synchronously;
 * a search box that waits on a round trip feels broken at this size.
 *
 * Keyboard is the primary interface: "/" focuses, arrows move, Enter opens,
 * Escape closes. `aria-activedescendant` is used rather than moving focus into
 * the listbox, so typing continues to work while a result is highlighted.
 */
export function DocsSearch({ version }: { version: DocVersionId }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const index = useMemo(() => buildSearchIndex(version), [version]);
  const hits: SearchHit[] = useMemo(
    () => (query.trim().length > 1 ? searchDocs(query, index) : []),
    [query, index],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    setQuery("");
    void navigate({
      to: "/docs/$version/$slug",
      params: { version, slug: hit.slug },
      ...(hit.anchor ? { hash: hit.anchor } : {}),
    });
  };

  return (
    <div className="relative">
      <label htmlFor="docs-search" className="sr-only">
        Search the documentation
      </label>
      <input
        ref={inputRef}
        id="docs-search"
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="docs-search-results"
        aria-autocomplete="list"
        {...(open && hits[active] ? { "aria-activedescendant": `docs-hit-${active}` } : {})}
        value={query}
        placeholder="Search docs  /"
        className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(hits[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      <p aria-live="polite" className="sr-only">
        {query.trim().length > 1 ? `${hits.length} results for ${query}` : ""}
      </p>

      {open && hits.length > 0 && (
        <ul
          id="docs-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-fq-md border border-border bg-background shadow-lift"
        >
          {hits.map((hit, i) => (
            <li
              key={`${hit.slug}-${hit.anchor ?? "top"}`}
              id={`docs-hit-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-accent" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(event) => {
                event.preventDefault();
                go(hit);
              }}
            >
              <span className="block font-medium">
                {hit.title}
                {hit.heading && <span className="text-muted-foreground"> › {hit.heading}</span>}
              </span>
              <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{hit.excerpt}</span>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length > 1 && hits.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          Nothing matches “{query}”. Try an endpoint name, a status code, or “webhook”.{" "}
          <a href={docPath(version, "quickstart")} className="fq-tap text-primary underline underline-offset-4">
            Start at the quickstart
          </a>
          .
        </p>
      )}
    </div>
  );
}
