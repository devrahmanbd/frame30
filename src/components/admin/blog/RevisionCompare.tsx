/**
 * Phase 1 — revision history with a real compare.
 *
 * A list of timestamps is not history: a writer needs to see what changed
 * before they restore, otherwise "Restore" is a coin flip that can silently
 * drop an afternoon of work. This panel renders a word diff of the body plus a
 * field-level diff of everything else, and only then offers the restore.
 *
 * Autosave rows are labelled distinctly, because they are the ones a writer did
 * not consciously create and should treat with suspicion.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { revisionPairFn } from "@/lib/cms.functions";
import { blocksToText, parseBody } from "@/lib/blog-body";
import { diffFields, diffWords, summarizeDiff } from "@/lib/blog-diff";
import { useLang } from "@/lib/i18n";
import { btnGhost, btnPrimary } from "@/components/admin/MarketingUi";

export type RevisionRow = {
  id: string;
  title: string;
  status: string;
  slug: string;
  is_autosave: boolean;
  created_at: string;
};

export function RevisionCompare({
  revisions,
  restoring,
  onRestore,
}: {
  revisions: RevisionRow[];
  restoring: boolean;
  onRestore: (revisionId: string) => void;
}) {
  const { t } = useLang();
  const [leftId, setLeftId] = useState<string>(revisions[1]?.id ?? revisions[0]?.id ?? "");
  const [rightId, setRightId] = useState<string>(revisions[0]?.id ?? "");
  const fetchPair = useServerFn(revisionPairFn);

  const pair = useQuery({
    queryKey: ["revision-pair", leftId, rightId],
    enabled: !!leftId && !!rightId && leftId !== rightId,
    // Revisions are immutable, so a fetched pair never goes stale.
    staleTime: Infinity,
    retry: 1,
    queryFn: () => fetchPair({ data: { leftId, rightId } }),
  });

  const diff = useMemo(() => {
    if (!pair.data) return null;
    const before = blocksToText(parseBody(pair.data.left.body ?? ""));
    const after = blocksToText(parseBody(pair.data.right.body ?? ""));
    const chunks = diffWords(before, after);
    return { chunks, summary: summarizeDiff(chunks) };
  }, [pair.data]);

  const fields = useMemo(() => {
    if (!pair.data) return [];
    const pick = (row: typeof pair.data.left) => ({
      title: row.title ?? "",
      title_en: row.title_en ?? "",
      slug: row.slug ?? "",
      status: row.status ?? "",
      excerpt: row.excerpt ?? "",
      meta_title: row.meta_title ?? "",
      meta_description: row.meta_description ?? "",
    });
    return diffFields(pick(pair.data.left), pick(pair.data.right));
  }, [pair.data]);

  if (!revisions.length) return null;

  const options = revisions.map((revision) => (
    <option key={revision.id} value={revision.id}>
      {new Date(revision.created_at).toLocaleString()}
      {revision.is_autosave ? ` · ${t("autosave", "স্বয়ংক্রিয়")}` : ""}
    </option>
  ));

  return (
    <details className="rounded-fq-md border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("Revision history", "সংস্করণ ইতিহাস")} ({revisions.length})
      </summary>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted-foreground">{t("Compare", "তুলনা")}</span>
          <select className="rounded-fq-md border border-border bg-background px-2 py-1" value={leftId} onChange={(e) => setLeftId(e.target.value)}>
            {options}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">{t("With", "সঙ্গে")}</span>
          <select className="rounded-fq-md border border-border bg-background px-2 py-1" value={rightId} onChange={(e) => setRightId(e.target.value)}>
            {options}
          </select>
        </label>
        <button
          type="button"
          className={btnPrimary}
          disabled={restoring || !rightId}
          onClick={() => onRestore(rightId)}
        >
          {t("Restore right side", "ডান পাশ ফেরত")}
        </button>
      </div>

      {pair.isError && (
        <p role="alert" className="mt-2 text-danger">
          {t("Could not load those revisions.", "সংস্করণ দুটি আনা যায়নি।")}
        </p>
      )}
      {pair.isPending && leftId !== rightId && (
        <p className="mt-2 text-muted-foreground">{t("Loading diff…", "পার্থক্য আনা হচ্ছে…")}</p>
      )}

      {diff && (
        <>
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            +{diff.summary.added} / −{diff.summary.removed} {t("words", "শব্দ")}
            {!diff.summary.changed && ` · ${t("body identical", "বডি অপরিবর্তিত")}`}
          </p>
          <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-fq-md border border-border bg-background p-2 leading-relaxed">
            {diff.chunks.map((chunk, index) =>
              chunk.op === "equal" ? (
                <span key={index}>{chunk.text}</span>
              ) : chunk.op === "insert" ? (
                <ins key={index} className="bg-success-soft text-success-foreground no-underline">
                  {chunk.text}
                </ins>
              ) : (
                <del key={index} className="bg-danger-soft text-danger-foreground">
                  {chunk.text}
                </del>
              ),
            )}
          </div>
        </>
      )}

      {fields.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {fields.map((field) => (
            <li key={field.key}>
              <span className="font-medium">{field.key}</span>: <del className="text-muted-foreground">{field.before || "—"}</del>{" "}
              → <ins className="no-underline">{field.after || "—"}</ins>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-1">
        {revisions.map((revision) => (
          <li key={revision.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">
              {new Date(revision.created_at).toLocaleString()}
              {revision.is_autosave ? ` · ${t("autosave", "স্বয়ংক্রিয়")}` : ""} · {revision.status}
            </span>
            <button type="button" className={btnGhost} disabled={restoring} onClick={() => onRestore(revision.id)}>
              {t("Restore", "ফেরত")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
