/**
 * Phase 12 — "☰ Outline": headings tree plus revisions list on the left.
 */
import { History, X } from "lucide-react";
import { relativeTime, type EditorDoc } from "@/lib/editor/editor-doc";
import { docOutline } from "@/lib/editor/editor-doc";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { UnderlineTabs } from "./primitives";
import { useState } from "react";

export type RevisionRow = { id: string; title: string; status: string; isAutosave: boolean; createdAt: string; authorId: string | null };

export function OutlinePanel({
  doc,
  revisions,
  authors,
  onJump,
  onRestore,
  onClose,
}: {
  doc: EditorDoc;
  revisions: RevisionRow[];
  authors: { id: string; name: string }[];
  onJump: (index: number) => void;
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<"outline" | "revisions">("outline");
  const outline = docOutline(doc);

  return (
    <aside className="fq-enter flex w-[280px] shrink-0 flex-col border-r border-border bg-card" aria-label={t("Document outline", "আউটলাইন")}>
      <div className="flex h-11 items-center justify-between pl-1 pr-2">
        <UnderlineTabs
          label={t("Outline panels", "আউটলাইন প্যানেল")}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "outline", label: t("Outline", "আউটলাইন") },
            { id: "revisions", label: `${t("Revisions", "সংস্করণ")}${revisions.length ? ` (${revisions.length})` : ""}` },
          ]}
        />
        <button type="button" onClick={onClose} aria-label={t("Close outline", "আউটলাইন বন্ধ")} className="fq-focus-glow ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-fq-md hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {tab === "outline" ? (
          outline.length === 0 ? (
            <p className="fq-sub px-2 py-4 text-xs">{t("Add headings to build an outline.", "আউটলাইন তৈরি করতে শিরোনাম যোগ করুন।")}</p>
          ) : (
            <ol className="space-y-0.5">
              {outline.map((h) => (
                <li key={h.index}>
                  <button
                    type="button"
                    onClick={() => onJump(h.index)}
                    className={cn("fq-focus-glow flex min-h-8 w-full items-center truncate rounded-fq-md px-2 text-left text-sm hover:bg-muted", h.level === 3 && "pl-5", h.level >= 4 && "pl-8")}
                  >
                    <span className="fq-sub fq-num mr-2 text-[10px]">H{h.level}</span>
                    <span className="truncate">{h.text || t("(empty heading)", "(খালি শিরোনাম)")}</span>
                  </button>
                </li>
              ))}
            </ol>
          )
        ) : revisions.length === 0 ? (
          <p className="fq-sub px-2 py-4 text-xs">{t("Revisions appear after the first save.", "প্রথম সংরক্ষণের পরে সংস্করণ দেখাবে।")}</p>
        ) : (
          <ul className="space-y-0.5">
            {revisions.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onRestore(r.id)} className="fq-focus-glow flex w-full flex-col items-start gap-0.5 rounded-fq-md px-2 py-1.5 text-left hover:bg-muted">
                  <span className="flex w-full items-center gap-1.5 text-sm">
                    <History className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{r.title || t("Untitled", "শিরোনামহীন")}</span>
                    {r.isAutosave && <span className="fq-sub ml-auto shrink-0 text-[10px] uppercase tracking-wide">{t("auto", "অটো")}</span>}
                  </span>
                  <span className="fq-sub text-[11px]">
                    {relativeTime(r.createdAt)} · {authors.find((a) => a.id === r.authorId)?.name ?? "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
