/**
 * URL-synced state for the canonical console list experience (Phase 6).
 *
 * Every list screen — orders, products, customers, discounts — keeps its saved
 * view, search text, sort and page in the query string, so a list is
 * shareable, survives a reload, and the back button undoes a filter instead of
 * leaving the page.
 *
 * The router's search params are typed per route; list state is generic, so we
 * read/write through a deliberately loose adapter rather than forcing every
 * route to declare the same five keys.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

export type SortDir = "asc" | "desc";

export type ListState = {
  view: string;
  q: string;
  sort: string;
  dir: SortDir;
  page: number;
  pageSize: number;
  setView: (view: string) => void;
  setQ: (q: string) => void;
  /** Same key toggles direction; a new key sorts descending first. */
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
  /** Arbitrary extra filters, e.g. `payment=cod`. */
  param: (key: string) => string | undefined;
  setParam: (key: string, value: string | undefined) => void;
  /** Slice already-filtered rows for the current page. */
  paginate: <T>(rows: readonly T[]) => T[];
};

type Search = Record<string, unknown>;

export function useListState(opts?: {
  defaultView?: string;
  defaultSort?: string;
  defaultDir?: SortDir;
  pageSize?: number;
}): ListState {
  const defaultView = opts?.defaultView ?? "all";
  const defaultSort = opts?.defaultSort ?? "";
  const defaultDir = opts?.defaultDir ?? "desc";
  const pageSize = opts?.pageSize ?? 25;

  const search = useRouterState({ select: (s) => s.location.search as Search });
  const navigate = useNavigate() as unknown as (opts: {
    search: (prev: Search) => Search;
    replace?: boolean;
    resetScroll?: boolean;
  }) => void;

  const str = (key: string) => {
    const v = search[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  const patch = useCallback(
    (next: Search) => {
      navigate({
        search: (prev) => {
          const merged: Search = { ...prev, ...next };
          for (const [k, v] of Object.entries(merged)) {
            if (v === undefined || v === "" || v === null) delete merged[k];
          }
          return merged;
        },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const view = str("view") ?? defaultView;
  const q = str("q") ?? "";
  const sort = str("sort") ?? defaultSort;
  const dir: SortDir = str("dir") === "asc" ? "asc" : str("dir") === "desc" ? "desc" : defaultDir;
  const pageRaw = Number(str("page") ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return useMemo<ListState>(
    () => ({
      view,
      q,
      sort,
      dir,
      page,
      pageSize,
      setView: (next) => patch({ view: next === defaultView ? undefined : next, page: undefined }),
      setQ: (next) => patch({ q: next || undefined, page: undefined }),
      toggleSort: (key) =>
        patch({
          sort: key,
          dir: sort === key ? (dir === "asc" ? "desc" : "asc") : "desc",
          page: undefined,
        }),
      setPage: (next) => patch({ page: next <= 1 ? undefined : String(next) }),
      param: (key) => str(key),
      setParam: (key, value) => patch({ [key]: value || undefined, page: undefined }),
      paginate: (rows) => rows.slice((page - 1) * pageSize, page * pageSize) as never,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, q, sort, dir, page, pageSize, patch, defaultView, search],
  );
}

/** Stable comparator for list sorting: numbers numerically, text by locale. */
export function compareBy<T>(
  rows: readonly T[],
  value: (row: T) => string | number | null | undefined,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}
