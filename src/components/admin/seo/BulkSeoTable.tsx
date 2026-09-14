/**
 * Bulk SEO grid (Phase 2) — the Rank Math "Bulk Edit" affordance.
 *
 * Rules this screen respects, learned from the plugins it replaces:
 *  - one server query per page, never one per row;
 *  - edits are local until saved, and only the dirty rows are sent (capped at
 *    the server's 50-row batch), so a stray keystroke does not rewrite 300 rows;
 *  - the filter/search/sort state lives in the query key, so paging is cached
 *    and the back button is meaningful;
 *  - the grid never touches fields it does not display — canonical, social
 *    image, keywords and FAQ survive a bulk save untouched.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { seoBulkFn, seoBulkSaveFn } from "@/lib/seo.functions";
import { StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import { scoreBand } from "@/lib/seo-analysis";

type Edit = { metaTitle: string; metaDescription: string; robotsIndex: boolean };

const STATES = [
  { value: "all", en: "All", bn: "সব" },
  { value: "missing_title", en: "No title", bn: "টাইটেল নেই" },
  { value: "missing_description", en: "No description", bn: "বর্ণনা নেই" },
  { value: "noindex", en: "Noindex", bn: "নোইনডেক্স" },
  { value: "poor", en: "Score under 50", bn: "স্কোর ৫০-এর নিচে" },
] as const;

const TYPES = ["all", "store", "product", "collection", "page", "article"] as const;

export function BulkSeoTable() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const list = useServerFn(seoBulkFn);
  const saveBulk = useServerFn(seoBulkSaveFn);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [state, setState] = useState<(typeof STATES)[number]["value"]>("all");
  const [sort, setSort] = useState<"label" | "score" | "type">("label");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  const params = { page, pageSize: 25, search, type, state, sort, direction };
  const query = useQuery({
    queryKey: ["seo", "bulk", params],
    queryFn: () => list({ data: params }),
    staleTime: 10_000,
  });

  const rows = query.data?.rows ?? [];
  const dirtyKeys = useMemo(() => Object.keys(edits), [edits]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = dirtyKeys.slice(0, 50).map((key) => {
        const [entityType, rawId] = key.split("::");
        const edit = edits[key]!;
        return {
          entityType: entityType as "store" | "product" | "collection" | "page" | "article",
          entityId: rawId === "-" ? null : (rawId ?? null),
          ...edit,
        };
      });
      return saveBulk({ data: { edits: payload } });
    },
    onSuccess: async (result) => {
      setEdits({});
      toast.success(
        t(`Saved ${result.saved} row(s).`, `${result.saved}টি সারি সংরক্ষিত হয়েছে।`),
      );
      await qc.invalidateQueries({ queryKey: ["seo"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const keyOf = (row: { type: string; id: string | null }) => `${row.type}::${row.id ?? "-"}`;

  const valueOf = (row: (typeof rows)[number], field: keyof Edit) => {
    const edit = edits[keyOf(row)];
    if (edit) return edit[field];
    return field === "robotsIndex" ? row.robotsIndex : (row[field] as string);
  };

  const patch = (row: (typeof rows)[number], field: keyof Edit, value: string | boolean) =>
    setEdits((current) => {
      const key = keyOf(row);
      const base: Edit = current[key] ?? {
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        robotsIndex: row.robotsIndex,
      };
      return { ...current, [key]: { ...base, [field]: value } };
    });

  const summary = query.data?.summary;
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)));

  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-label={t("Bulk SEO", "বাল্ক এসইও")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{t("Bulk edit", "বাল্ক এডিট")}</h3>
          {summary && (
            <p className="text-xs text-muted-foreground">
              {t(
                `${summary.optimised} optimised · ${summary.missingTitle} without a title · ${summary.missingDescription} without a description · ${summary.noindex} noindex`,
                `${summary.optimised}টি অপটিমাইজড · ${summary.missingTitle}টির টাইটেল নেই · ${summary.missingDescription}টির বর্ণনা নেই · ${summary.noindex}টি নোইনডেক্স`,
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={dirtyKeys.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending
            ? t("Saving…", "সংরক্ষণ হচ্ছে…")
            : t(`Save ${dirtyKeys.length} change(s)`, `${dirtyKeys.length}টি পরিবর্তন সংরক্ষণ`)}
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} max-w-56`}
          value={search}
          placeholder={t("Search title or path", "টাইটেল বা পাথ খুঁজুন")}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={`${inputClass} max-w-40`}
          value={type}
          onChange={(e) => {
            setType(e.target.value as (typeof TYPES)[number]);
            setPage(1);
          }}
        >
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} max-w-48`}
          value={state}
          onChange={(e) => {
            setState(e.target.value as (typeof STATES)[number]["value"]);
            setPage(1);
          }}
        >
          {STATES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.en, option.bn)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            setSort((s) => (s === "score" ? "label" : "score"));
            setDirection((d) => (d === "asc" ? "desc" : "asc"));
          }}
        >
          {t(`Sort: ${sort} ${direction}`, `সাজানো: ${sort} ${direction}`)}
        </button>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}
      {query.isError && (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">{t("Page", "পেজ")}</th>
              <th className="p-2">{t("Title", "টাইটেল")}</th>
              <th className="p-2">{t("Description", "বর্ণনা")}</th>
              <th className="p-2">{t("Index", "ইনডেক্স")}</th>
              <th className="p-2">{t("Score", "স্কোর")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const band = scoreBand(row.score ?? 0);
              return (
                <tr key={keyOf(row)} className="border-t border-border align-top">
                  <td className="p-2">
                    <span className="block max-w-48 truncate font-medium">{row.label}</span>
                    <span className="block max-w-48 truncate text-xs text-muted-foreground">{row.path}</span>
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={valueOf(row, "metaTitle") as string}
                      placeholder={row.fallbackTitle}
                      maxLength={300}
                      onChange={(e) => patch(row, "metaTitle", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      className={`${inputClass} min-h-16`}
                      value={valueOf(row, "metaDescription") as string}
                      placeholder={row.fallbackDescription}
                      maxLength={600}
                      onChange={(e) => patch(row, "metaDescription", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={t("Allow indexing", "ইনডেক্স করার অনুমতি")}
                      checked={valueOf(row, "robotsIndex") as boolean}
                      onChange={(e) => patch(row, "robotsIndex", e.target.checked)}
                    />
                  </td>
                  <td className="p-2">
                    {row.score === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <StatusPill tone={band.tone} label={`${row.score}`} />
                    )}
                  </td>
                </tr>
              );
            })}
            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                  {t("Nothing matches this filter.", "এই ফিল্টারে কিছু মেলেনি।")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t(
            `Page ${query.data?.page ?? 1} of ${totalPages} · ${query.data?.total ?? 0} entities`,
            `পৃষ্ঠা ${query.data?.page ?? 1} / ${totalPages} · ${query.data?.total ?? 0}টি আইটেম`,
          )}
        </span>
        <span className="flex gap-2">
          <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("Previous", "আগের")}
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next", "পরের")}
          </button>
        </span>
      </footer>
      {lang === "bn" && (
        <p className="text-[11px] text-muted-foreground">
          স্কোর পরামর্শমূলক — সেভ কখনো আটকায় না, কিন্তু প্রকাশের গেট বাস্তব ত্রুটি আটকায়।
        </p>
      )}
    </section>
  );
}
